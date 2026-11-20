import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Files } from '../src/files.js';
import { buildTranscript, MAX_ATTACHED, resolveAttachments } from '../src/orchestrator.js';
import { forAnthropic, forOpenAI, Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');

class Recording extends Providers {
  calls = [];
  async stream({ messages, onDelta }) {
    this.calls.push(structuredClone(messages));
    onDelta('Looks like a menu.');
    return 'Looks like a menu.';
  }
}

async function startHub() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const providers = new Recording({}, {});
  const hub = new Hub({ store, providers, name: 'Test PC' });
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const auth = { authorization: `Bearer ${token}` };
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { ...auth, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const upload = async (bytes, name, type) => {
    const res = await fetch(`${base}/api/files`, { method: 'POST', headers: { ...auth, 'content-type': type, 'x-file-name': encodeURIComponent(name) }, body: bytes });
    return { status: res.status, body: await res.json() };
  };
  store.state.agents.push({ id: 'a1', name: 'Nova', provider: 'demo', model: 'demo' });
  store.state.rooms.push({ id: 'r1', name: 'Trip', agentIds: ['a1'], mode: 'roundtable' });
  return { hub, store, providers, base, auth, api, upload, close: () => hub.close() };
}

test('a photo is uploaded, attached to a message, and shown to the agent before the words', async (t) => {
  const h = await startHub();
  t.after(h.close);

  const photo = (await h.upload(PNG, 'menü photo.png', 'image/png')).body;
  assert.deepEqual([photo.name, photo.type, photo.size], ['menü photo.png', 'image/png', PNG.length]);
  const back = await fetch(`${h.base}/api/files/${photo.id}`, { headers: h.auth });
  assert.equal(back.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await back.arrayBuffer()), PNG);
  assert.equal((await fetch(`${h.base}/api/files/${photo.id}`)).status, 401, 'files need pairing too');

  assert.equal((await h.upload(Buffer.from('PK'), 'a.zip', 'application/zip')).status, 400);
  assert.equal((await h.upload(Buffer.alloc(21 * 1024 * 1024), 'big.pdf', 'application/pdf')).status, 413);
  assert.equal((await h.api('POST', '/api/rooms/r1/messages', { text: 'hi', attachments: ['nope'] })).status, 400);

  const sent = (await h.api('POST', '/api/rooms/r1/messages', { text: 'What is this?', attachments: [photo.id] })).body;
  assert.deepEqual(sent.attachments, [{ id: photo.id, name: 'menü photo.png', type: 'image/png', size: PNG.length }]);
  await h.hub.orchestrator.idle('r1');
  const [turn] = h.providers.calls[0];
  assert.deepEqual(turn.content, [
    { type: 'image', mediaType: 'image/png', data: PNG.toString('base64'), name: 'menü photo.png' },
    { type: 'text', text: '[User]: What is this?' },
  ]);

  // A message can be only a photo.
  const only = (await h.api('POST', '/api/rooms/r1/messages', { attachments: [photo.id] })).body;
  assert.equal(only.text, '');
  await h.hub.orchestrator.idle('r1');
  assert.equal(h.providers.calls[1].at(-1).content.at(-1).text, '[User]: (sent menü photo.png)');
});

test('each provider gets attachments in its own format', () => {
  const turns = [
    { role: 'user', content: [{ type: 'image', mediaType: 'image/jpeg', data: 'AAA', name: 'a.jpg' }, { type: 'pdf', data: 'BBB', name: 'b.pdf' }, { type: 'text', text: 'hi' }] },
    { role: 'assistant', content: 'hello' },
  ];
  assert.deepEqual(forAnthropic(turns)[0].content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' }, title: 'b.pdf' },
    { type: 'text', text: 'hi' },
  ]);
  assert.deepEqual(forOpenAI(turns)[0].content, [
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
    { type: 'text', text: "[b.pdf is attached, but this model can't read PDFs.]" },
    { type: 'text', text: 'hi' },
  ]);
  assert.equal(forAnthropic(turns)[1].content, 'hello');
});

test('only the newest attachments are sent in full; text files are read as text; unused uploads are cleared', () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-files-')));
  const files = new Files(store);
  const photos = Array.from({ length: MAX_ATTACHED + 2 }, (_, i) => files.save(PNG, `p${i}.png`, 'image/png'));
  const notes = files.save(Buffer.from('# Packing\n- passport'), 'notes.md', 'text/markdown');
  const messages = [
    ...photos.map((p, i) => ({ seq: i + 1, text: `photo ${i}`, status: 'done', author: { type: 'user' }, attachments: [p] })),
    { seq: 99, text: '', status: 'done', author: { type: 'user' }, attachments: [notes] },
  ];
  const turns = resolveAttachments(buildTranscript({ id: 'a1' }, messages), files);
  const parts = turns[0].content;
  assert.equal(parts.filter((p) => p.type === 'image').length, MAX_ATTACHED - 1, 'the text file counts toward the newest few');
  assert.deepEqual(parts.slice(0, 2).map((p) => p.text), ['[p0.png was attached earlier]', '[User]: photo 0']);
  assert.equal(parts.at(-2).text, '[File notes.md]\n# Packing\n- passport');

  // Uploads no message uses are removed once they're an hour old; attached ones stay.
  const stray = files.save(PNG, 'stray.png', 'image/png');
  store.state.messages.r1 = [messages[0]];
  assert.equal(files.sweep(Date.now()), 0, 'too new to remove');
  assert.equal(files.sweep(Date.now() + 2 * 3_600_000), photos.length + 1);
  assert.ok(files.meta(photos[0].id) && !files.meta(stray.id));
  assert.equal(fs.readdirSync(files.dir).length, 1);
});
