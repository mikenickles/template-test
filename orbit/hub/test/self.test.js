import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Proactive } from '../src/proactive.js';
import { APP_SUMMARY, GUIDE, changeSettings, createRoom, planRoom, snapshot, updateSelf } from '../src/self.js';
import { buildSystemPrompt, resolveAbilities } from '../src/orchestrator.js';
import { anthropicTools } from '../src/anthropic.js';

/** A stand-in for the Anthropic API that streams scripted replies and keeps each request it got. */
async function fakeClaude(t, steps) {
  const requests = [];
  const api = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    const content = steps.shift() ?? [{ type: 'text', text: 'ok' }];
    const events = [['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }]];
    content.forEach((block, index) => {
      if (block.type === 'text') {
        events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
        events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]);
      } else {
        events.push(['content_block_start', { type: 'content_block_start', index, content_block: { ...block, input: {} } }]);
        events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }]);
      }
      events.push(['content_block_stop', { type: 'content_block_stop', index }]);
    });
    events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } }]);
    events.push(['message_stop', { type: 'message_stop' }]);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  t.after(() => api.close());
  return { requests, baseUrl: `http://127.0.0.1:${api.address().port}` };
}


function crew() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  const nova = { id: 'a1', name: 'Nova', role: 'the planner', instructions: 'Plan things.', provider: 'anthropic', model: 'claude-opus-5-5', avatar: { character: 9 }, abilities: ['memory'] };
  const pixel = { id: 'a2', name: 'Pixel', role: 'the builder', instructions: '', provider: 'openai', model: 'gpt-x', avatar: { character: 7 }, abilities: [] };
  const sage = { id: 'a3', name: 'Sage', role: '', instructions: '', provider: 'anthropic', model: 'claude-haiku-5-5', avatar: { character: 2 }, abilities: [] };
  store.state.agents.push(nova, pixel, sage);
  const room = { id: 'r1', name: 'Launch', agentIds: ['a1', 'a2'], mode: 'roundtable', leadId: null, description: '' };
  store.state.rooms.push(room);
  const providers = new Providers({ anthropic: { apiKey: 'sk-ant-secret-key' } }, {});
  return { store, providers, nova, pixel, sage, room };
}

test('every agent knows it lives in Treehouse; agents without tools get the whole guide', () => {
  const { providers, nova, pixel, room } = crew();
  const claude = buildSystemPrompt(nova, room, [nova, pixel], { ...resolveAbilities(nova, providers, null), self: {} });
  assert.match(claude, /working with a user in Treehouse, in a group chat called "Launch"/);
  assert.match(claude, /You run on the model claude-opus-5-5, from Anthropic\./, 'agents know their own model');
  assert.match(claude, /- Pixel: the builder \(on gpt-x\)/, 'and their teammates\'');
  assert.match(claude, /used to be called Orbit/);
  assert.ok(claude.includes(APP_SUMMARY));
  assert.match(claude, /call treehouse_guide and answer from it/);
  assert.ok(!claude.includes(GUIDE), 'Claude agents read the guide when they need it');

  // A model that turns out not to take tools gets the prompt without them.
  const other = buildSystemPrompt(pixel, room, [nova, pixel], null);
  assert.match(other, /Treehouse/);
  assert.ok(other.includes(GUIDE), 'agents without tools carry the guide');
  assert.match(GUIDE, /# The Treehouse guide/);
  assert.match(GUIDE, /How it's built/);

  const names = anthropicTools(nova.model, { self: {} }).map((t) => t.name);
  assert.deepEqual(names, ['treehouse_guide', 'update_self', 'change_settings', 'create_room']);
});

test('the live summary describes the setup, without any keys', () => {
  const { store, providers } = crew();
  const text = snapshot({ store, providers, hub: { name: 'Home PC', addresses: ['192.168.1.20:8787'], remote: [] } });
  assert.match(text, /on the PC called "Home PC"/);
  assert.match(text, /Model providers ready: Anthropic/);
  assert.match(text, /- Nova \(the planner\): claude-opus-5-5 on anthropic; abilities: memory/);
  assert.match(text, /- "Launch" \(round table\): Nova, Pixel/);
  assert.match(text, /Tailscale \(for away from home\) is not set up/);
  assert.ok(!text.includes('sk-ant'), 'never the keys');
});

test('agents change themselves, within limits', () => {
  const { store, providers, nova } = crew();
  const deps = { store, providers };
  assert.match(updateSelf(nova, { name: 'Nova Prime', add_to_instructions: 'Keep answers short.' }, deps), /name to Nova Prime; instructions \(added to\)/);
  assert.equal(nova.name, 'Nova Prime');
  assert.equal(nova.instructions, 'Plan things.\nKeep answers short.');
  assert.throws(() => updateSelf(nova, { name: 'pixel' }, deps), /already called pixel/);
  assert.throws(() => updateSelf(nova, { abilities_on: ['google'] }, deps), /Only the user can turn on google/);
  assert.throws(() => updateSelf(nova, { provider: 'openai', model: 'gpt-x' }, deps), /openai has no key yet/);
  assert.throws(() => updateSelf(nova, {}, deps), /Nothing to change/);
  updateSelf(nova, { abilities_on: ['web'], abilities_off: ['memory'], reaches_out: 'gentle', character: 11, model: 'claude-sonnet-5-5' }, deps);
  assert.deepEqual(nova.abilities, ['web']);
  assert.equal(nova.proactive, 'gentle');
  assert.deepEqual(nova.avatar, { character: 11 });
  assert.equal(nova.model, 'claude-sonnet-5-5');
  updateSelf(nova, { instructions: 'Brand new.' }, deps);
  assert.equal(nova.instructions, 'Brand new.');
});

test('agents change the room and the proactive settings', () => {
  const { store, providers, room } = crew();
  const proactive = new Proactive({ store, orchestrator: {}, providers });
  const deps = { store, proactive };
  const said = changeSettings(room, { room_name: 'Beta launch', add_members: ['Sage'], room_lead: 'Sage', quiet_start: '22:00', brief_enabled: true, brief_from: 'Nova' }, deps);
  assert.match(said, /room name to "Beta launch"/);
  assert.match(said, /added Sage to the room/);
  assert.match(said, /Sage leads the room/);
  assert.match(said, /quiet hours to 22:00 to 08:00/);
  assert.match(said, /morning brief on, at 08:00, from Nova/);
  assert.deepEqual(room.agentIds, ['a1', 'a2', 'a3']);
  assert.equal(room.mode, 'lead');
  assert.equal(store.state.proactive.quietStart, '22:00');
  changeSettings(room, { remove_members: ['Sage'], room_mode: 'best fit' }, deps);
  assert.deepEqual(room.agentIds, ['a1', 'a2']);
  assert.equal(room.mode, 'auto');
  assert.equal(room.leadId, null);
  assert.throws(() => changeSettings(room, { add_members: ['Zed'] }, deps), /no agent called Zed/);
  assert.throws(() => changeSettings(room, { quiet_start: '9pm' }, deps), /quiet hours start/);
  assert.throws(() => changeSettings(room, { remove_members: ['Nova', 'Pixel'] }, deps), /at least one agent/);
});

test('in a chat, an agent reads the guide and renames itself when asked', async (t) => {
  const claude = await fakeClaude(t, [
    [{ type: 'tool_use', id: 't1', name: 'treehouse_guide', input: {} }],
    [{ type: 'tool_use', id: 't2', name: 'update_self', input: { name: 'Juniper', add_to_instructions: 'The user calls you Juniper.' } }],
    [{ type: 'text', text: "Done, I'm Juniper now." }],
  ]);
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const hub = new Hub({ store, providers: new Providers({ anthropic: { apiKey: 'sk-test', baseUrl: claude.baseUrl } }, {}), name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const nova = (await api('POST', '/api/agents', { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: [] })).body;
  const room = (await api('POST', '/api/rooms', { name: 'Life', agentIds: [nova.id] })).body;
  await api('POST', `/api/rooms/${room.id}/messages`, { text: 'What app is this? And please go by Juniper from now on.' });
  await hub.orchestrator.idle(room.id);

  assert.ok(claude.requests[0].tools.some((tool) => tool.name === 'update_self'), 'tools even with no abilities on');
  const guideResult = claude.requests[1].messages.at(-1).content[0];
  assert.match(guideResult.content, /# The Treehouse guide/);
  assert.match(guideResult.content, /on the PC called "Test PC"/);
  const state = (await api('GET', '/api/state')).body;
  const renamed = state.agents.find((a) => a.id === nova.id);
  assert.equal(renamed.name, 'Juniper');
  assert.match(renamed.instructions, /calls you Juniper/);
  const reply = store.messages(room.id).at(-1);
  assert.deepEqual(reply.activity.map((a) => a.kind), ['guide', 'self']);
  assert.equal(reply.activity[1].detail, 'name, instructions');
});

test('agents and the room planner make rooms from the crew', async () => {
  const { store, providers, nova } = crew();
  const made = createRoom(store, { name: 'Kyoto trip', members: ['sage'], mode: 'lead', lead: 'Sage', description: 'Plan April.' }, { creator: nova });
  assert.deepEqual(made.agentIds, ['a1', 'a3'], 'the agent joins, with who it named');
  assert.equal(made.mode, 'lead');
  assert.equal(made.leadId, 'a3');
  assert.throws(() => createRoom(store, { name: 'X', members: ['Zed'] }), /no agent called Zed/);
  assert.throws(() => createRoom(store, { name: 'X', members: [] }), /which agents/);
  assert.equal(createRoom(store, { name: 'Trio', members: ['Nova', 'Pixel', 'Sage'] }).mode, 'auto', 'three or more default to best fit');

  const asked = [];
  const planner = { ...providers, isConfigured: (id) => providers.isConfigured(id), kindOf: (id) => providers.kindOf(id),
    stream: async ({ model, messages }) => {
      asked.push({ model, prompt: messages[0].content });
      return 'Here: {"name": "Half marathon", "members": ["Sage", "Ghost"], "mode": "round table", "description": "Training for the spring race."}';
    } };
  const planned = await planRoom({ store, providers: planner }, 'A room to train for my half marathon with Sage');
  assert.equal(asked[0].model, 'claude-haiku-5-5');
  assert.match(asked[0].prompt, /- Nova \(the planner\)|- Nova: the planner/);
  assert.match(asked[0].prompt, /train for my half marathon/);
  assert.equal(planned.name, 'Half marathon');
  assert.deepEqual(planned.agentIds, ['a3'], 'names that are not in the crew are dropped');
  assert.equal(planned.mode, 'roundtable');
  assert.equal(planned.description, 'Training for the spring race.');
  await assert.rejects(planRoom({ store, providers: planner }, '  '), /what the room is for/);
});

