import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { RecruitError, createAgent, freeCharacters, recruitPrompt } from '../src/recruit.js';

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

const INSTRUCTIONS = 'You are Rio, Alex\'s running coach. Build training plans around a spring half marathon, check in on how runs went, and keep it encouraging but honest.';

test('an agent that can hire asks for the model, then hires with detailed instructions and a free character', async (t) => {
  const claude = await fakeClaude(t, [
    [{ type: 'text', text: 'Happy to! Which model should Rio use? I would suggest claude-sonnet-5-5.' }],
    [{ type: 'tool_use', id: 't1', name: 'create_agent', input: { name: 'Rio', role: 'the running coach', instructions: INSTRUCTIONS, provider: 'anthropic', model: 'claude-sonnet-5-5', character: 9, join_this_room: true } }],
    [{ type: 'text', text: 'Meet Rio, your running coach!' }],
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
  const nova = (await api('POST', '/api/agents', { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['memory', 'crew'], avatar: { character: 9 } })).body;
  assert.deepEqual(nova.abilities, ['memory', 'crew']);
  const room = (await api('POST', '/api/rooms', { name: 'Life', agentIds: [nova.id], mode: 'auto' })).body;

  await api('POST', `/api/rooms/${room.id}/messages`, { text: 'Hire me a running coach.' });
  await hub.orchestrator.idle(room.id);
  const first = claude.requests[0];
  assert.ok(first.tools.some((tool) => tool.name === 'create_agent'));
  assert.match(first.system, /create, add or hire one/);
  assert.match(first.system, /ask which AI model it should use/);
  assert.match(first.system, /- anthropic \(Anthropic\): claude-opus-5-5, claude-sonnet-5-5/);
  assert.match(first.system, /Free characters \(number: name\): 1: Explorer Bot/);
  assert.doesNotMatch(first.system, /9: White Astronaut/, 'Nova already looks like the astronaut');

  await api('POST', `/api/rooms/${room.id}/messages`, { text: 'Sonnet is fine.' });
  await hub.orchestrator.idle(room.id);
  const state = (await api('GET', '/api/state')).body;
  const rio = state.agents.find((a) => a.name === 'Rio');
  assert.equal(rio.role, 'the running coach');
  assert.equal(rio.instructions, INSTRUCTIONS);
  assert.deepEqual([rio.provider, rio.model], ['anthropic', 'claude-sonnet-5-5']);
  assert.notEqual(rio.avatar.character, 9, 'a taken character is swapped for a free one');
  assert.deepEqual(rio.abilities, ['web', 'memory']);
  assert.ok(state.rooms.find((r) => r.id === room.id).agentIds.includes(rio.id), 'joined the room');
  const reply = (await api('GET', `/api/rooms/${room.id}/messages`)).body.messages.at(-1);
  assert.equal(reply.text, 'Meet Rio, your running coach!');
  assert.deepEqual(reply.created, [{ agentId: rio.id, name: 'Rio' }]);
});

test('hiring checks the name, the provider, local models and the instructions', () => {
  const store = { state: { agents: [{ name: 'Nova', avatar: { character: 1 } }] }, save() {} };
  const providers = { supportsAbilities: (id) => id === 'anthropic' };
  const models = [
    { id: 'anthropic', label: 'Anthropic', local: false, models: ['claude-opus-5-5'] },
    { id: 'ollama', label: 'Ollama (local)', local: true, models: ['llama3.2:latest'] },
  ];
  const hire = (input) => createAgent(store, providers, null, { name: 'Rio', role: 'coach', instructions: INSTRUCTIONS, provider: 'anthropic', model: 'claude-opus-5-5', ...input }, models);
  assert.throws(() => hire({ name: 'nova' }), (e) => e instanceof RecruitError && /already an agent called nova/.test(e.message));
  assert.throws(() => hire({ provider: 'openai' }), /isn't one of the providers the user can use: anthropic, ollama/);
  assert.throws(() => hire({ provider: 'ollama', model: 'gemma3:4b' }), /doesn't have gemma3:4b. It has: llama3.2:latest/);
  assert.throws(() => hire({ instructions: 'Be a coach.' }), /detailed instructions/);
  const local = hire({ name: 'Lo', provider: 'ollama', model: 'llama3.2', abilities: ['web'] });
  assert.deepEqual(local.abilities, [], 'local models get no abilities');
  assert.notEqual(local.avatar.character, 1);
  assert.equal(freeCharacters(store.state.agents).length, 23);
  assert.match(recruitPrompt(models, store.state.agents), /- ollama \(Ollama \(local\)\): llama3.2:latest/);
});

test('a guide from before hiring existed is given the ability once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-'));
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
    agents: [{ id: 'g', name: 'Nova', provider: 'anthropic', model: 'm', abilities: ['memory'], avatar: { character: 9 } }],
    rooms: [{ id: 'r', name: 'Getting to know you', agentIds: ['g'], intro: true }],
  }));
  const store = new Store(dir);
  const hub = new Hub({ store, providers: new Providers({}, {}), name: 'Test PC' });
  assert.deepEqual(store.agent('g').abilities, ['memory', 'crew']);
  // The user can switch it off again, and it stays off.
  store.agent('g').abilities = ['memory'];
  new Hub({ store, providers: new Providers({}, {}), name: 'Test PC' });
  assert.deepEqual(store.agent('g').abilities, ['memory']);
  hub.close();
});
