import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { buildTranscript, findMentions } from '../src/orchestrator.js';

/** Scripted stand-in for real models: replies come from `script[agent.name]`. */
class FakeProviders extends Providers {
  constructor(script) {
    super({}, {});
    this.script = script;
    this.calls = [];
  }
  async stream({ agent, messages, system, onDelta }) {
    this.calls.push({ agent: agent.name, messages, system });
    const replies = this.script[agent.name] ?? [];
    const reply = replies.length > 1 ? replies.shift() : replies[0] ?? `ok from ${agent.name}`;
    if (reply instanceof Error) throw reply;
    for (const piece of reply.match(/.{1,5}/gs)) onDelta(piece);
    return reply;
  }
}

async function startHub(script = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-'));
  const store = new Store(dir);
  store.isNew = false; // skip the starter crew
  const providers = new FakeProviders(script);
  const hub = new Hub({ store, providers, name: 'Test PC' });
  const port = await hub.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  let token = '';
  const api = async (method, route, body) => {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const pair = async () => {
    token = (await api('POST', '/api/pair', { code: hub.pairingCode, deviceName: 'Pixel' })).body.token;
  };
  const makeAgent = async (name) =>
    (await api('POST', '/api/agents', { name, role: `the ${name}`, provider: 'demo', model: 'demo', instructions: '' })).body;
  return { hub, providers, base, api, pair, makeAgent, tokenRef: () => token, close: () => hub.close() };
}

test('pairing: wrong code is rejected, right code yields a working token', async (t) => {
  const h = await startHub();
  t.after(h.close);

  assert.equal((await h.api('GET', '/api/hub')).body.name, 'Test PC');
  assert.equal((await h.api('GET', '/api/state')).status, 401);
  assert.equal((await h.api('POST', '/api/pair', { code: '000000x' })).status, 403);

  const used = h.hub.pairingCode;
  await h.pair();
  assert.notEqual(h.hub.pairingCode, used, 'code rotates after a successful pair');
  const state = await h.api('GET', '/api/state');
  assert.equal(state.status, 200);
  assert.ok(state.body.providers.some((p) => p.id === 'demo' && p.configured));
  assert.ok(!JSON.stringify(h.hub.store.state).includes(h.tokenRef()), 'token is stored hashed');

  assert.equal((await h.api('DELETE', '/api/device')).status, 200);
  assert.equal((await h.api('GET', '/api/state')).status, 401);
});

test('repeated wrong guesses rotate the code and pause pairing', async (t) => {
  const h = await startHub();
  t.after(h.close);
  const first = h.hub.pairingCode;
  const wrong = first === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await h.api('POST', '/api/pair', { code: wrong })).status, 403);
  assert.notEqual(h.hub.pairingCode, first);

  // Even the right code is refused during the pause.
  assert.equal((await h.api('POST', '/api/pair', { code: h.hub.pairingCode })).status, 429);
  h.hub.pairLockedUntil = 0;
  assert.equal((await h.api('POST', '/api/pair', { code: h.hub.pairingCode })).status, 200);
});

test('round table: every agent replies once and sees earlier replies', async (t) => {
  const h = await startHub();
  t.after(h.close);
  await h.pair();
  const a = await h.makeAgent('Nova');
  const b = await h.makeAgent('Pixel');
  const room = (await h.api('POST', '/api/rooms', { name: 'R', agentIds: [a.id, b.id], mode: 'roundtable' })).body;

  assert.equal((await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'hello team' })).status, 200);
  await h.hub.orchestrator.idle(room.id);

  const { messages, run } = (await h.api('GET', `/api/rooms/${room.id}/messages`)).body;
  assert.deepEqual(messages.map((m) => m.author.name), ['You', 'Nova', 'Pixel']);
  const listed = (await h.api('GET', '/api/state')).body.rooms.find((r) => r.id === room.id);
  assert.equal(listed.active, false);
  assert.equal(listed.speaking, null);
  assert.ok(messages.every((m) => m.status === 'done'));
  assert.equal(run.active, false);

  const pixelCall = h.providers.calls[1];
  assert.equal(pixelCall.messages.length, 1, 'user + teammate turns are merged into one user turn');
  assert.match(pixelCall.messages[0].content, /\[User\]: hello team/);
  assert.match(pixelCall.messages[0].content, /\[Nova\]: ok from Nova/);
  assert.match(pixelCall.system, /You are Pixel, the Pixel/);
  assert.match(pixelCall.system, /- Nova: the Nova/);
});

test('lead mode: lead delegates by @mention, teammate replies, lead wraps up', async (t) => {
  const h = await startHub({ Nova: ['Plan ready. @Pixel please draft it.', 'Here is the combined answer.'], Pixel: ['Draft done.'] });
  t.after(h.close);
  await h.pair();
  const nova = await h.makeAgent('Nova');
  const pixel = await h.makeAgent('Pixel');
  const sage = await h.makeAgent('Sage');
  const room = (
    await h.api('POST', '/api/rooms', { name: 'R', agentIds: [nova.id, pixel.id, sage.id], mode: 'lead', leadId: nova.id })
  ).body;

  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'build a thing' });
  await h.hub.orchestrator.idle(room.id);

  const { messages } = (await h.api('GET', `/api/rooms/${room.id}/messages`)).body;
  assert.deepEqual(messages.map((m) => m.author.name), ['You', 'Nova', 'Pixel', 'Nova']);
  assert.equal(messages.at(-1).text, 'Here is the combined answer.');
});

test('a user @mention picks who answers; a failing agent shows an error and the run continues', async (t) => {
  const boom = Object.assign(new Error('No key'), { name: 'ProviderError' });
  const h = await startHub({ Nova: [boom] });
  t.after(h.close);
  await h.pair();
  const nova = await h.makeAgent('Nova');
  const pixel = await h.makeAgent('Pixel');
  const room = (await h.api('POST', '/api/rooms', { name: 'R', agentIds: [nova.id, pixel.id], mode: 'roundtable' })).body;

  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: '@pixel only you' });
  await h.hub.orchestrator.idle(room.id);
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'everyone now' });
  await h.hub.orchestrator.idle(room.id);

  const { messages } = (await h.api('GET', `/api/rooms/${room.id}/messages`)).body;
  assert.deepEqual(messages.map((m) => `${m.author.name}:${m.status}`), [
    'You:done', 'Pixel:done', 'You:done', 'Nova:error', 'Pixel:done',
  ]);
  assert.equal(messages[3].error, 'No key');
});

test('mention ping-pong is capped', async (t) => {
  const h = await startHub({ Nova: ['over to @Pixel'], Pixel: ['back to @Nova'] });
  t.after(h.close);
  await h.pair();
  const nova = await h.makeAgent('Nova');
  const pixel = await h.makeAgent('Pixel');
  const room = (await h.api('POST', '/api/rooms', { name: 'R', agentIds: [nova.id, pixel.id], mode: 'roundtable' })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'go' });
  await h.hub.orchestrator.idle(room.id);
  const { messages } = (await h.api('GET', `/api/rooms/${room.id}/messages`)).body;
  assert.equal(messages.length, 1 + 12);
});

test('event stream delivers deltas that rebuild each reply', async (t) => {
  const h = await startHub({ Nova: ['A reply long enough to arrive in several chunks.'] });
  t.after(h.close);
  await h.pair();
  const nova = await h.makeAgent('Nova');
  const room = (await h.api('POST', '/api/rooms', { name: 'R', agentIds: [nova.id], mode: 'roundtable' })).body;

  const res = await fetch(`${h.base}/api/rooms/${room.id}/events`, { headers: { authorization: `Bearer ${h.tokenRef()}` } });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'hi' });

  let raw = '';
  const built = {};
  let finished = null;
  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += new TextDecoder().decode(value);
    let end;
    while ((end = raw.indexOf('\n\n')) >= 0) {
      const block = raw.slice(0, end);
      raw = raw.slice(end + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') {
        assert.equal(payload.at, (built[payload.id] ?? '').length, 'delta offsets are contiguous');
        built[payload.id] = (built[payload.id] ?? '') + payload.text;
      }
      if (event === 'message' && payload.author.type === 'agent' && payload.status === 'done') finished = payload;
    }
  }
  await reader.cancel();
  assert.equal(built[finished.id], 'A reply long enough to arrive in several chunks.');
  assert.equal(finished.text, built[finished.id]);
});

test('findMentions handles spaces, case, and partial names', () => {
  const agents = [{ id: '1', name: 'Night Owl' }, { id: '2', name: 'Al' }, { id: '3', name: 'Nova' }];
  assert.deepEqual(findMentions('hey @nightowl and @Nova!', agents).map((a) => a.id), ['1', '3']);
  assert.deepEqual(findMentions('@Night Owl, thoughts?', agents).map((a) => a.id), ['1']);
  assert.deepEqual(findMentions('@Alice is not here, mail al@example.com', agents), []);
  assert.deepEqual(findMentions('@everyone go', agents).length, 3);
});

test('buildTranscript always ends on a user turn', () => {
  const me = { id: 'a' };
  const turns = buildTranscript(me, [
    { author: { type: 'user', name: 'You' }, text: 'hi', status: 'done' },
    { author: { type: 'agent', agentId: 'a', name: 'Nova' }, text: 'hello', status: 'done' },
    { author: { type: 'agent', agentId: 'b', name: 'Pixel' }, text: '', status: 'error' },
  ]);
  assert.deepEqual(turns.map((t) => t.role), ['user', 'assistant', 'user']);
});
