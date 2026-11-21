import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { anthropicTools } from '../src/anthropic.js';
import { addNote, forgetNotes, MAX_NOTES, runMemoryTool } from '../src/memory.js';
import { buildSystemPrompt, resolveAbilities } from '../src/orchestrator.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';

test('notes are kept once, trimmed, capped, and forgotten by their words', () => {
  const nova = { name: 'Nova' };
  addNote(nova, '  Vegetarian,   no fish  ', 'you');
  addNote(nova, 'vegetarian, no fish', 'agent');
  assert.deepEqual(nova.memory.map((n) => [n.text, n.source]), [['Vegetarian, no fish', 'you']]);
  assert.throws(() => addNote(nova, '   ', 'you'), /Write something/);
  assert.throws(() => addNote(nova, 'x'.repeat(301), 'you'), /under 300/);
  for (let i = 1; i < MAX_NOTES; i++) addNote(nova, `note ${i}`, 'agent');
  assert.throws(() => addNote(nova, 'one too many', 'agent'), /memory is full/);

  assert.deepEqual(forgetNotes(nova, 'NOTE 7').map((n) => n.text), ['note 7'], 'the same note before any containing it');
  assert.equal(forgetNotes(nova, 'note 1').length, 1);
  assert.equal(forgetNotes(nova, 'note 2').length, 1);
  assert.equal(forgetNotes(nova, 'vegetarian').length, 1);
  assert.equal(forgetNotes(nova, 'nothing like this').length, 0);
});

test('memory tools check their input and save what changes', () => {
  const nova = { name: 'Nova', memory: [] };
  let saves = 0;
  const run = (name, input) => runMemoryTool(nova, name, input, () => saves++);
  assert.deepEqual(run('remember', { note: 'Budget for Japan is $3,000' }), { text: 'Saved to your memory.', isError: false });
  assert.equal(run('remember', {}).isError, true);
  assert.equal(run('remember', 'not an object').isError, true);
  assert.match(run('forget', { note: 'Japan' }).text, /^Forgot: Budget for Japan/);
  assert.equal(run('forget', { note: 'Japan' }).isError, true);
  assert.equal(saves, 2);
});

test("every agent's notes go in its prompt; Claude agents with the ability also get the tools", () => {
  const providers = new Providers({}, {});
  const room = { name: 'Trip', mode: 'roundtable' };
  const sage = { id: 'a3', name: 'Sage', provider: 'ollama', model: 'llama', memory: [{ id: 'n1', text: 'Prefers short answers' }] };
  assert.match(buildSystemPrompt(sage, room, [sage], null), /Your own notes from earlier conversations[^\n]*\n- Prefers short answers/);
  assert.ok(resolveAbilities({ ...sage, abilities: ['memory'] }, providers, null).memory, 'agents on other models save notes too');

  const nova = { id: 'a1', name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['memory'] };
  const abilities = resolveAbilities(nova, providers, null);
  assert.deepEqual(anthropicTools(nova.model, abilities).map((t) => t.name), ['remember_about_user', 'forget_about_user', 'remember', 'forget']);
  assert.match(buildSystemPrompt(nova, room, [nova], abilities), /Facts about the user [^\n]*go in remember_about_user, which the whole crew shares/);
});

test('notes are added and removed from the app, and an agent saves its own while replying', async (t) => {
  // Stands in for Claude: first asks to remember something, then answers.
  const steps = [
    [{ type: 'tool_use', id: 'toolu_1', name: 'remember', input: { note: 'Allergic to peanuts' } }],
    [{ type: 'text', text: "Noted, I'll keep that in mind." }],
  ];
  const api = http.createServer(async (req, res) => {
    for await (const _ of req);
    const content = steps.shift();
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
    events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: content[0].type === 'tool_use' ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } }]);
    events.push(['message_stop', { type: 'message_stop' }]);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  t.after(() => api.close());

  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const providers = new Providers({ anthropic: { apiKey: 'sk-test', baseUrl: `http://127.0.0.1:${api.address().port}` } }, {});
  const hub = new Hub({ store, providers, name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const call = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  const nova = (await call('POST', '/api/agents', { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['memory'] })).body;
  let agent = (await call('POST', `/api/agents/${nova.id}/memory`, { text: 'Lives in Leeds' })).body;
  assert.deepEqual(agent.memory.map((n) => [n.text, n.source]), [['Lives in Leeds', 'you']]);
  assert.equal((await call('POST', `/api/agents/${nova.id}/memory`, { text: '' })).status, 400);
  // Saving the agent from the app leaves its memory alone.
  agent = (await call('PUT', `/api/agents/${nova.id}`, { ...agent, name: 'Nova', memory: [] })).body;
  assert.equal(agent.memory.length, 1);

  const room = (await call('POST', '/api/rooms', { name: 'Life', agentIds: [nova.id] })).body;
  await call('POST', `/api/rooms/${room.id}/messages`, { text: "Remember I'm allergic to peanuts." });
  await hub.orchestrator.idle(room.id);
  const reply = (await call('GET', `/api/rooms/${room.id}/messages`)).body.messages.at(-1);
  assert.equal(reply.text, "Noted, I'll keep that in mind.");
  assert.deepEqual(reply.activity.map((a) => [a.kind, a.detail, a.done]), [['remember', 'Allergic to peanuts', true]]);
  agent = store.agent(nova.id);
  assert.deepEqual(agent.memory.map((n) => [n.text, n.source]), [['Lives in Leeds', 'you'], ['Allergic to peanuts', 'agent']]);

  const removed = (await call('DELETE', `/api/agents/${nova.id}/memory/${agent.memory[0].id}`)).body;
  assert.deepEqual(removed.memory.map((n) => n.text), ['Allergic to peanuts']);
});
