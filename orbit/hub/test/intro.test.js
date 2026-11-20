import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { buildSystemPrompt } from '../src/orchestrator.js';

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

async function startHub(t, providers, isNew = false) {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = isNew;
  const hub = new Hub({ store, providers, name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const call = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { hub, store, call };
}

test('the guide greets first, learns about the user for the whole crew, and creates the crew it suggests', async (t) => {
  const claude = await fakeClaude(t, [
    [{ type: 'text', text: "Hi! I'm Nova. What should I call you?" }],
    [{ type: 'tool_use', id: 't1', name: 'remember_about_user', input: { note: 'Builds Android apps for fun.', name: 'Mike' } }],
    [{ type: 'text', text: 'Nice to meet you, Mike! Want a crew for your apps?' }],
    [{ type: 'tool_use', id: 't2', name: 'create_crew', input: { room_name: 'App studio', agents: [
      { name: 'Pixel', role: 'the designer', instructions: 'Sketch screens.', character: 7 },
      { name: '@Sage', role: 'the tester', instructions: 'Find bugs.', character: 99 },
    ] } }],
    [{ type: 'text', text: 'Your crew is ready in App studio.' }],
  ]);
  const providers = new Providers({ anthropic: { apiKey: 'sk-test', baseUrl: claude.baseUrl } }, {});
  // A new hub with a Claude key starts with the intro, the guide speaking first.
  const { hub, store, call } = await startHub(t, providers, true);
  const intro = store.state.rooms.find((r) => r.intro);
  assert.ok(intro, 'a new hub opens with the intro');
  await hub.orchestrator.idle(intro.id);
  const guide = store.agent(intro.agentIds[0]);
  assert.equal(guide.name, 'Nova');
  assert.equal(guide.avatar.character, 9);
  const first = claude.requests[0];
  assert.match(first.system, /get to know them/);
  assert.match(JSON.stringify(first.messages), /The user just opened this chat/);
  assert.ok(first.tools.some((tool) => tool.name === 'create_crew'));
  assert.ok(first.tools.some((tool) => tool.name === 'remember_about_user'));
  // Asking again returns the same room rather than starting another.
  assert.equal((await call('POST', '/api/intro', {})).body.id, intro.id);

  await call('POST', `/api/rooms/${intro.id}/messages`, { text: "I'm Mike. I build Android apps for fun." });
  await hub.orchestrator.idle(intro.id);
  let state = (await call('GET', '/api/state')).body;
  assert.equal(state.profile.name, 'Mike');
  assert.deepEqual(state.profile.notes.map((n) => [n.text, n.source]), [['Builds Android apps for fun.', 'Nova']]);

  await call('POST', `/api/rooms/${intro.id}/messages`, { text: 'Yes please!' });
  await hub.orchestrator.idle(intro.id);
  const messages = (await call('GET', `/api/rooms/${intro.id}/messages`)).body.messages;
  const done = messages.findLast((m) => m.crew);
  assert.equal(done.text, 'Your crew is ready in App studio.');
  state = (await call('GET', '/api/state')).body;
  const studio = state.rooms.find((r) => r.id === done.crew.roomId);
  assert.equal(studio.name, 'App studio');
  assert.equal(studio.mode, 'lead');
  assert.equal(studio.leadId, guide.id);
  const crew = studio.agentIds.slice(1).map((id) => state.agents.find((a) => a.id === id));
  assert.deepEqual(crew.map((a) => [a.name, a.role, a.provider]), [['Pixel', 'the designer', 'anthropic'], ['Sage', 'the tester', 'anthropic']]);
  assert.equal(crew[0].avatar.character, 7);
  assert.ok(crew[1].avatar.character >= 1 && crew[1].avatar.character <= 25 && ![7, 9].includes(crew[1].avatar.character));
  assert.deepEqual(crew[0].abilities, ['web', 'memory']);

  // Every agent, on any provider, starts out knowing what the guide learned.
  const prompt = buildSystemPrompt(crew[0], studio, [guide, ...crew], null, state.profile);
  assert.match(prompt, /They like to be called Mike\./);
  assert.match(prompt, /- Builds Android apps for fun\./);
});

test('the user can see, add and remove what the crew knows about them', async (t) => {
  const { call } = await startHub(t, new Providers({}, {}));
  let profile = (await call('POST', '/api/profile/notes', { text: 'Has a dog called Biscuit.' })).body;
  assert.deepEqual(profile.notes.map((n) => [n.text, n.source]), [['Has a dog called Biscuit.', 'you']]);
  assert.equal((await call('POST', '/api/profile/notes', { text: ' ' })).status, 400);
  profile = (await call('PUT', '/api/profile', { name: '  Mike\nN ' })).body;
  assert.equal(profile.name, 'Mike N');
  profile = (await call('DELETE', `/api/profile/notes/${profile.notes[0].id}`)).body;
  assert.deepEqual(profile.notes, []);
  // Without a Claude key the intro can't start, and says why.
  const refused = await call('POST', '/api/intro', {});
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Anthropic key/);
});
