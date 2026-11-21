import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAttachments } from '../src/orchestrator.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';

async function startHub() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const hub = new Hub({ store, providers: new Providers({}, {}), name: 'Test PC' });
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  store.state.agents.push({ id: 'a1', name: 'Nova', provider: 'demo', model: 'demo', instructions: 'Plan things.' });
  store.state.rooms.push({ id: 'r1', name: 'Trip', agentIds: ['a1'], mode: 'roundtable' });
  return { hub, store, api, close: () => hub.close() };
}

test('a room reports what its next reply sends, and its context size changes how much', async (t) => {
  const h = await startHub();
  t.after(h.close);
  // Ten messages of 5,000 characters: 50,000 in all, about 12,500 tokens.
  for (let i = 1; i <= 10; i++) h.store.messages('r1').push({ id: `m${i}`, seq: i, author: { type: 'user', name: 'You' }, text: 'x'.repeat(5000), createdAt: i });

  const medium = (await h.api('GET', '/api/rooms/r1/context')).body;
  assert.equal(medium.size, 'medium');
  assert.equal(medium.photos, true);
  assert.deepEqual(medium.messages, { recent: 10, summarized: 0, leftOut: 0, total: 10 });
  assert.equal(medium.tokens.recent, 12_500);
  assert.ok(medium.tokens.instructions > 0);
  assert.equal(medium.tokens.total, medium.tokens.instructions + medium.tokens.summary + medium.tokens.recent + medium.tokens.photos);
  assert.equal(medium.usage.requests, 0);

  const small = (await h.api('PUT', '/api/rooms/r1/context', { size: 'small', photos: false })).body;
  assert.equal(small.size, 'small');
  assert.equal(small.photos, false);
  assert.deepEqual(small.messages, { recent: 4, summarized: 0, leftOut: 6, total: 10 });
  assert.equal(small.tokens.recent, 5_000);

  // Editing the room elsewhere keeps its context settings.
  const edited = (await h.api('PUT', '/api/rooms/r1', { name: 'Trip 2', agentIds: ['a1'] })).body;
  assert.deepEqual(edited.context, { size: 'small', photos: false });

  // Summarizing needs a real model; a demo crew is told so.
  const compact = await h.api('POST', '/api/rooms/r1/compact');
  assert.equal(compact.status, 400);
  assert.match(compact.body.error, /model with a key/);
});

test('with photos off, only the newest message with files sends them', () => {
  const files = { read: () => Buffer.from('png'), meta: () => null };
  const photo = (id) => ({ type: 'attachment', id, name: `${id}.png`, fileType: 'image/png' });
  const turns = () => [
    { role: 'user', content: [photo('old'), { type: 'text', text: 'first' }] },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: [photo('new'), { type: 'text', text: 'second' }] },
  ];
  const off = resolveAttachments(turns(), files, { latestOnly: true });
  assert.deepEqual(off[0].content[0], { type: 'text', text: '[old.png was attached earlier]' });
  assert.equal(off[2].content[0].type, 'image');
  const on = resolveAttachments(turns(), files);
  assert.equal(on[0].content[0].type, 'image');
});
