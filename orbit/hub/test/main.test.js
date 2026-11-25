import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { mainTools, overview, setMain } from '../src/mainchat.js';

/** Scripted stand-in for real models, keeping each call's system prompt. */
class FakeProviders extends Providers {
  constructor(script = {}) {
    super({}, {}, () => {});
    this.script = script;
    this.calls = [];
  }
  async stream({ agent, messages, system, onDelta }) {
    this.calls.push({ agent: agent.name, messages, system });
    const reply = this.script[agent.name] ?? `ok from ${agent.name}`;
    onDelta(reply);
    return reply;
  }
}

async function startHub(script) {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-main-')));
  store.isNew = false;
  const providers = new FakeProviders(script);
  const hub = new Hub({ store, providers, name: 'Test PC' });
  const port = await hub.listen(0, '127.0.0.1');
  let token = '';
  const api = async (method, route, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  token = (await api('POST', '/api/pair', { code: hub.pairingCode, deviceName: 'Pixel' })).body.token;
  const agent = async (name, provider = 'demo') => (await api('POST', '/api/agents', { name, role: `the ${name}`, provider, model: provider === 'demo' ? 'demo' : 'claude-opus-5-5', instructions: '' })).body;
  return { hub, store, providers, api, agent, close: () => hub.close() };
}

test('a main agent gets its own chat, leaves the rooms it was only watching, and sees every room', async (t) => {
  const h = await startHub();
  t.after(h.close);
  const nova = await h.agent('Nova', 'anthropic');
  const scout = await h.agent('Scout');
  const pixel = await h.agent('Pixel');
  const watch = (await h.api('POST', '/api/rooms', { name: 'Sacramento Watch', agentIds: [scout.id, nova.id], mode: 'lead', leadId: nova.id })).body;
  const solo = (await h.api('POST', '/api/rooms', { name: 'Morning', agentIds: [nova.id] })).body;
  await h.api('POST', `/api/rooms/${watch.id}/messages`, { text: '@Scout what did the school board post?' });
  await h.hub.orchestrator.idle(watch.id);

  const made = await h.api('PUT', '/api/main', { agentId: nova.id, leave: [watch.id, solo.id] });
  assert.equal(made.status, 200);
  assert.deepEqual(made.body.left, ['Sacramento Watch']);
  const main = made.body.room;
  assert.equal(main.main, true);
  assert.deepEqual(main.agentIds, [nova.id]);
  assert.deepEqual(made.body.main, { agentId: nova.id, roomId: main.id });

  const state = (await h.api('GET', '/api/state')).body;
  assert.deepEqual(state.main, { agentId: nova.id, roomId: main.id });
  const watchNow = state.rooms.find((r) => r.id === watch.id);
  assert.deepEqual(watchNow.agentIds, [scout.id]);
  assert.equal(watchNow.leadId, scout.id);
  // The only agent in a room stays in it.
  assert.deepEqual(state.rooms.find((r) => r.id === solo.id).agentIds, [nova.id]);

  // The new chat opens with a hello, written knowing what's going on in the other rooms. (Demo agents skip it.)
  await h.hub.orchestrator.idle(main.id);
  const hello = (await h.api('GET', `/api/rooms/${main.id}/messages`)).body.messages;
  assert.equal(hello.length, 1);
  assert.equal(hello[0].author.name, 'Nova');
  const call = h.providers.calls.findLast((c) => c.agent === 'Nova');
  assert.match(call.system, /This is your main chat with the user/);
  assert.match(call.system, /read_room reads any room in full/, 'with tools, it is told about them');
  assert.match(call.system, /"Sacramento Watch" \(Scout, and the user/);
  assert.match(call.system, /User \(.*\): @Scout what did the school board post\?/);

  // Everyone else knows who keeps up with everything.
  await h.api('POST', `/api/rooms/${watch.id}/messages`, { text: 'any news?' });
  await h.hub.orchestrator.idle(watch.id);
  assert.match(h.providers.calls.findLast((c) => c.agent === 'Scout').system, /Nova is the user's main agent/);

  // The main chat stays the two of them, and can't be deleted while it's the main chat.
  const changed = (await h.api('PUT', `/api/rooms/${main.id}`, { name: 'Nova and me', agentIds: [nova.id, pixel.id], mode: 'lead' })).body;
  assert.equal(changed.name, 'Nova and me');
  assert.deepEqual(changed.agentIds, [nova.id]);
  assert.equal((await h.api('DELETE', `/api/rooms/${main.id}`)).status, 400);

  // Handing it to another agent keeps the chat; turning it off makes it an ordinary one.
  const handed = (await h.api('PUT', '/api/main', { agentId: pixel.id })).body;
  assert.equal(handed.room.id, main.id);
  assert.deepEqual(handed.room.agentIds, [pixel.id]);
  const off = (await h.api('PUT', '/api/main', { agentId: null })).body;
  assert.equal(off.main, null);
  const after = (await h.api('GET', '/api/state')).body;
  assert.equal(after.main, null);
  const former = after.rooms.find((r) => r.id === main.id);
  assert.equal(former.main, false);
  assert.equal(former.name, 'Chat with Pixel');
  assert.equal((await h.api('DELETE', `/api/rooms/${main.id}`)).status, 200);
});

test('deleting the main agent turns the main chat into an ordinary one', async (t) => {
  const h = await startHub();
  t.after(h.close);
  const nova = await h.agent('Nova');
  const { room } = (await h.api('PUT', '/api/main', { agentId: nova.id })).body;
  await h.hub.orchestrator.idle(room.id);
  assert.equal(h.store.messages(room.id).length, 0, 'a demo agent would only echo the hello prompt, so it skips it');
  await h.api('DELETE', `/api/agents/${nova.id}`);
  const state = (await h.api('GET', '/api/state')).body;
  assert.equal(state.main, null);
  assert.equal(state.rooms.find((r) => r.id === room.id).main, false);
  assert.equal((await h.api('PUT', '/api/main', { agentId: 'nobody' })).status, 400);
});

test('the main agent reads, searches and posts into rooms it is not in', async (t) => {
  const h = await startHub({ Scout: 'On it: the agenda is posted Thursday.' });
  t.after(h.close);
  const nova = await h.agent('Nova');
  const scout = await h.agent('Scout');
  const watch = (await h.api('POST', '/api/rooms', { name: 'Sacramento Watch', agentIds: [scout.id] })).body;
  await h.api('POST', `/api/rooms/${watch.id}/messages`, { text: 'Keep an eye on the school board meeting notices' });
  await h.hub.orchestrator.idle(watch.id);
  const { main } = (await h.api('PUT', '/api/main', { agentId: nova.id })).body;
  await h.hub.orchestrator.idle(main.roomId);

  const tools = mainTools(h.store, { mainRoomId: main.roomId, post: (room, text) => h.hub.orchestrator.relay(room.id, h.store.agent(nova.id), text) });
  const read = await tools.run('read_room', { room: 'sacramento watch' });
  assert.equal(read.isError, false);
  assert.match(read.text, /Room "Sacramento Watch": Scout, and the user/);
  assert.match(read.text, /User: Keep an eye on the school board meeting notices/);
  assert.match((await tools.run('read_room', { room: 'Kyoto' })).text, /There's no room called "Kyoto"\. The rooms are: "Sacramento Watch"/);
  // The main chat isn't a room it reads: it's where it's talking.
  assert.equal((await tools.run('read_room', { room: 'Main chat' })).isError, true);

  const found = await tools.run('search_chats', { query: 'school board' });
  assert.match(found.text, /In "Sacramento Watch", You .*: .*school board/);
  assert.match((await tools.run('search_chats', { query: 'zebra' })).text, /Nothing in any chat has all of "zebra"/);

  const posted = await tools.run('post_to_room', { room: 'Sacramento Watch', message: '@Scout Mike wants the agenda too.' });
  assert.equal(posted.text, 'Posted in "Sacramento Watch". Scout will answer it there.');
  await h.hub.orchestrator.idle(watch.id);
  const messages = (await h.api('GET', `/api/rooms/${watch.id}/messages`)).body.messages;
  const note = messages.at(-2);
  assert.equal(note.author.name, 'Nova');
  assert.equal(note.relayed, true);
  assert.equal(messages.at(-1).author.name, 'Scout');
  assert.equal(messages.at(-1).text, 'On it: the agenda is posted Thursday.');
  // Scout heard it from Nova.
  const heard = h.providers.calls.findLast((c) => c.agent === 'Scout').messages.at(-1).content;
  assert.match(heard, /\[Nova\]: @Scout Mike wants the agenda too\./);

  const quiet = await tools.run('post_to_room', { room: 'Sacramento Watch', message: 'Just a note.' });
  assert.match(quiet.text, /Nobody was mentioned, so it waits there as a note\./);
});

test('the overview stays short with many rooms: the quieter ones get one line', () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-main-')));
  store.state.agents.push({ id: 'a', name: 'Nova' });
  for (let i = 0; i < 40; i++) {
    const room = { id: `r${i}`, name: `Room ${i}`, agentIds: ['a'], updatedAt: 1000 + i, description: 'x'.repeat(300), summary: { text: 'y'.repeat(800) } };
    store.state.rooms.push(room);
    store.messages(room.id).push({ id: `m${i}`, author: { type: 'user' }, text: 'z'.repeat(300), status: 'done', createdAt: 1000 + i });
  }
  const text = overview(store, { now: 5000 });
  assert.ok(text.length < 13_000, `overview is ${text.length} characters`);
  assert.ok(text.indexOf('"Room 39"') < text.indexOf('"Room 0"'), 'newest first');
  assert.match(text, /- "Room 0" \(Nova, and the user; last active just now\)$/);
  assert.equal(overview(new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-main-')))), 'The user has no other rooms yet.');
});

test('setMain points the morning brief at the main agent', () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-main-')));
  store.state.agents.push({ id: 'a', name: 'Nova' }, { id: 'b', name: 'Tike' });
  store.state.proactive = { brief: { enabled: true, time: '08:00', agentId: 'b' } };
  setMain(store, 'a', [], 1000);
  assert.equal(store.state.proactive.brief.agentId, 'a');
});
