import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { anthropicTools, echoable } from '../src/anthropic.js';
import { Folders, runFolderTool } from '../src/folders.js';
import { buildSystemPrompt, resolveAbilities } from '../src/orchestrator.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';

/** A PC with a shared "Notes" folder, a secret next to it, and a few ways of trying to reach the secret. */
function makePc() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-pc-'));
  const notes = path.join(root, 'Notes');
  fs.mkdirSync(path.join(notes, 'trips'), { recursive: true });
  fs.mkdirSync(path.join(notes, '.private'));
  fs.writeFileSync(path.join(notes, 'todo.md'), '# Todo\n- buy ramen\n- call mum\n');
  fs.writeFileSync(path.join(notes, 'trips', 'japan.md'), Array.from({ length: 30000 }, (_, i) => `day ${i + 1}: Ramen stop`).join('\n'));
  fs.writeFileSync(path.join(notes, 'photo.jpg'), Buffer.from([0xff, 0xd8, 0, 0, 0x10]));
  fs.writeFileSync(path.join(notes, '.private', 'diary.md'), 'secret');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'the password is hunter2');
  fs.symlinkSync(path.join(root, 'secret.txt'), path.join(notes, 'link-out.txt'));
  const hubData = path.join(root, 'hub-data');
  fs.mkdirSync(hubData);
  fs.writeFileSync(path.join(hubData, 'config.json'), '{"apiKey":"sk-live"}');
  const folders = new Folders([], { protect: [hubData] });
  folders.add(notes);
  return { root, notes, hubData, folders };
}

test('shared folders: agents read inside them and nowhere else', async () => {
  const { root, notes, hubData, folders } = makePc();

  assert.equal(await folders.listFiles(''), 'Shared folders:\nNotes/');
  const listing = await folders.listFiles('Notes');
  assert.match(listing, /^Notes\/\ntrips\/\n/);
  assert.match(listing, /todo\.md {2}\(\d+ B, \d{4}-\d\d-\d\d\)/);
  assert.doesNotMatch(listing, /\.private/, 'hidden folders are not listed');

  assert.match(await folders.readFile('notes/todo.md'), /^Notes\/todo\.md, lines 1–4 of 4\n\n# Todo\n- buy ramen/);
  const page = await folders.readFile('Notes/trips/japan.md');
  const next = Number(page.match(/start_line (\d+)/)[1]);
  assert.ok(page.length < 110_000, 'long files come back a page at a time');
  assert.match(await folders.readFile('Notes/trips/japan.md', next), new RegExp(`^Notes/trips/japan\\.md, lines ${next}–`));

  for (const [p, why] of [
    ['Notes/../secret.txt', /stay inside/],
    ['Notes/link-out.txt', /stay inside/],
    ['Notes/.private/diary.md', /private/],
    ['Notes/photo.jpg', /isn't a text file/],
    ['Notes/missing.md', /Nothing is at/],
    ['Elsewhere/x.md', /no shared folder called "Elsewhere"/],
  ]) {
    await assert.rejects(folders.readFile(p), why, p);
  }

  const found = await folders.searchFiles('ramen');
  assert.match(found, /^Notes\/todo\.md:2: - buy ramen/m);
  assert.doesNotMatch(found, /hunter2|secret/);
  assert.match(await folders.searchFiles('nothing like this'), /Nothing in the shared folders/);

  // Sharing refuses drives, the home folder, files, missing folders, and anything around the hub's data.
  assert.throws(() => folders.add(path.parse(root).root), /whole drive/);
  assert.throws(() => folders.add(os.homedir()), /inside your user folder/);
  assert.throws(() => folders.add(path.join(notes, 'todo.md')), /a file, not a folder/);
  assert.throws(() => folders.add(path.join(root, 'nope')), /doesn't exist/);
  assert.throws(() => folders.add(hubData), /Treehouse's own settings/);
  assert.throws(() => folders.add(root), /Treehouse's own settings/);
  assert.throws(() => folders.add('relative/path'), /full path/);

  // Same name twice stays addressable.
  const other = path.join(root, 'b', 'Notes');
  fs.mkdirSync(other, { recursive: true });
  assert.equal(folders.add(other).name, 'Notes 2');
  assert.equal(folders.add(notes).name, 'Notes', 'sharing the same folder again changes nothing');
  assert.equal(folders.list().length, 2);
});

test('folder tools check their input before touching the disk', async () => {
  const { folders } = makePc();
  const run = (name, input) => runFolderTool(folders, name, input);
  assert.deepEqual(await run('list_files', { path: '' }), { text: 'Shared folders:\nNotes/', isError: false });
  assert.equal((await run('read_file', { path: 'Notes/todo.md', start_line: 2 })).text.split('\n')[2], '- buy ramen');
  assert.equal((await run('read_file', {})).isError, true);
  assert.equal((await run('read_file', { path: 'Notes/todo.md', start_line: 0 })).isError, true);
  assert.equal((await run('read_file', { path: 'Notes/todo.md', start_line: '2' })).isError, true);
  assert.equal((await run('search_files', { query: '' })).isError, true);
  assert.match((await run('list_files', 'not an object')).text, /INVALID_JSON/);
  assert.equal((await run('delete_file', { path: 'Notes/todo.md' })).isError, true);
});

test('abilities pick the right tools and tell the agent what it can do', () => {
  const { folders } = makePc();
  const types = (model, on) => anthropicTools(model, on).map((t) => t.type ?? t.name);
  assert.deepEqual(types('claude-opus-5-5', {}), []);
  assert.deepEqual(types('claude-opus-5-5', { web: true }), ['web_search_20260209', 'web_fetch_20260209']);
  // One code sandbox, not two: with code on, the web tools that run their own code step aside.
  assert.deepEqual(types('claude-opus-5-5', { web: true, code: true }), ['web_search_20250305', 'web_fetch_20250910', 'code_execution_20260521']);
  assert.deepEqual(types('claude-haiku-5-5', { web: true }), ['web_search_20250305', 'web_fetch_20250910']);
  assert.deepEqual(types('claude-opus-5-5', { folders }), ['list_files', 'read_file', 'search_files']);
  assert.ok(anthropicTools('claude-opus-5-5', { folders }).every((t) => t.eager_input_streaming));
  assert.deepEqual(types('claude-opus-5-5', { folders: new Folders() }), [], 'no folder tools until a folder is shared');

  const providers = new Providers({}, {});
  const agent = { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['web', 'files'] };
  const abilities = resolveAbilities(agent, providers, folders);
  assert.deepEqual({ ...abilities, folders: Boolean(abilities.folders) }, { web: true, code: false, files: true, folders: true, memory: null, hire: false, google: null, wantsGoogle: false, browser: null, wantsBrowser: false, proactiveOn: false });
  const room = { name: 'Trip', mode: 'roundtable' };
  const prompt = buildSystemPrompt(agent, room, [agent], abilities);
  assert.match(prompt, /Search the web/);
  assert.match(prompt, /shows your sources under the reply, so don't add a sources list/, 'answers stay clean');
  assert.match(prompt, /shared from their PC: Notes\. This is read only/);
  assert.doesNotMatch(prompt, /Run code/);
  const other = resolveAbilities({ ...agent, provider: 'openai', abilities: ['web', 'code', 'files'] }, providers, folders);
  assert.equal(other.web, true, 'other models get the web through the hub');
  assert.equal(other.code, false, 'running code is Claude only');
  assert.equal(resolveAbilities({ ...agent, provider: 'demo' }, providers, folders), null, 'the demo runs without abilities');
  assert.doesNotMatch(buildSystemPrompt({ ...agent, provider: 'openai' }, room, [agent], null), /What you can do/);
  assert.match(buildSystemPrompt(agent, room, [agent], resolveAbilities(agent, providers, new Folders())), /None are shared yet/);
});

test('after a mid-output fallback, only what the next model may see is sent back', () => {
  const content = [
    { type: 'thinking', thinking: 'declined model' },
    { type: 'text', text: 'Partial ' },
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
    { type: 'server_tool_use', id: 's2', name: 'web_search', input: {} },
    { type: 'tool_use', id: 't1', name: 'list_files', input: {} },
    { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'thinking', thinking: 'fallback model' },
    { type: 'tool_use', id: 't2', name: 'list_files', input: {} },
  ];
  assert.deepEqual(
    echoable(content).map((b) => b.id ?? b.type),
    ['text', 's1', 'web_search_tool_result', 'fallback', 'thinking', 't2'],
  );
  assert.equal(echoable(content.slice(0, 4)).length, 4, 'nothing is dropped without a fallback');
});

/** Server-sent events for one streamed response, built from its content blocks. */
function sse(content, stopReason, model = 'claude-opus-5-5') {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } }],
  ];
  content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: block.citations ? [] : null } }]);
      for (const citation of block.citations ?? []) {
        events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'citations_delta', citation } }]);
      }
      for (const piece of block.text.match(/.{1,4}/gs)) {
        events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } }]);
      }
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { ...block, input: {} } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }]);
    } else {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: block }]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } }]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Stands in for the Messages API: answers each request with the next scripted response and records it. */
async function fakeAnthropic(responses) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body: JSON.parse(body) });
    const next = responses.shift();
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(next);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('a Claude agent searches, resumes a paused turn, reads a shared folder, then answers', async (t) => {
  const { folders } = makePc();
  const cite = { type: 'web_search_result_location', url: 'https://www.ramen.example/best', title: 'Best ramen', cited_text: 'Ichiran', encrypted_index: 'x' };
  const api = await fakeAnthropic([
    sse(
      [
        { type: 'text', text: 'Let me look.' },
        { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'best ramen tokyo' } },
        { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', url: cite.url, title: 'Best ramen', encrypted_content: 'x', page_age: null }] },
      ],
      'pause_turn',
    ),
    sse(
      [
        { type: 'text', text: 'Ichiran is a favorite.', citations: [cite] },
        { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'Notes/todo.md' } },
      ],
      'tool_use',
    ),
    sse([{ type: 'text', text: 'Ramen is already on your list.' }], 'end_turn'),
  ]);
  t.after(api.close);

  const providers = new Providers({ anthropic: { apiKey: 'sk-test', baseUrl: api.baseUrl } }, {});
  const deltas = [];
  const activity = [];
  let sources = [];
  const used = [];
  const text = await providers.stream({
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    system: 'You are Nova.',
    messages: [{ role: 'user', content: '[User]: Where should I eat ramen?' }],
    abilities: { web: true, code: false, files: true, folders },
    onDelta: (d) => deltas.push(d),
    onActivity: (a) => activity.push(a),
    onSources: (s) => (sources = s),
    onUsage: (u) => used.push(u),
  });

  assert.equal(text, 'Let me look.\n\nIchiran is a favorite.\n\nRamen is already on your list.');
  assert.deepEqual(used.map((u) => [u.input, u.output, u.requests]), [[5, 20, 1], [5, 20, 1], [5, 20, 1]], 'every request is counted');
  assert.equal(deltas.join(''), text, 'what streamed is what was kept');
  assert.deepEqual(activity.at(-1), [
    { kind: 'search', detail: 'best ramen tokyo', done: true, failed: false },
    { kind: 'file', detail: 'Notes/todo.md', done: true, failed: false },
  ]);
  assert.equal(activity[0][0].done, false, 'a search shows as in progress until its results arrive');
  assert.deepEqual(sources, [{ title: 'Best ramen', url: cite.url }]);

  assert.equal(api.requests.length, 3);
  const [first, resumed, answered] = api.requests.map((r) => r.body);
  assert.deepEqual(first.tools.map((tool) => tool.name), ['web_search', 'web_fetch', 'list_files', 'read_file', 'search_files']);
  assert.equal(first.fallbacks, 'default');
  // A paused turn goes back as it was, with no extra user message.
  assert.deepEqual(resumed.messages.map((m) => m.role), ['user', 'assistant']);
  assert.deepEqual(resumed.messages[1].content.map((b) => b.type), ['text', 'server_tool_use', 'web_search_tool_result']);
  // The continuation joins the same assistant turn, and the file comes back as one tool result.
  assert.deepEqual(answered.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(answered.messages[1].content.map((b) => b.type), ['text', 'server_tool_use', 'web_search_tool_result', 'text', 'tool_use']);
  const [result] = answered.messages[2].content;
  assert.equal(result.type, 'tool_result');
  assert.equal(result.tool_use_id, 'toolu_1');
  assert.match(result.content, /- buy ramen/);
  assert.equal(result.is_error, undefined);
});

test('a refusal stops the turn without running its tools, and Haiku is sent no fallbacks', async (t) => {
  const { folders } = makePc();
  const api = await fakeAnthropic([
    sse([{ type: 'text', text: 'Sure, ' }, { type: 'tool_use', id: 'toolu_9', name: 'read_file', input: { path: 'Notes/to' } }], 'refusal', 'claude-haiku-5-5'),
  ]);
  t.after(api.close);
  const providers = new Providers({ anthropic: { apiKey: 'sk-test', baseUrl: api.baseUrl } }, {});
  const text = await providers.stream({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    system: 'x',
    messages: [{ role: 'user', content: 'hi' }],
    abilities: { files: true, folders },
    onDelta: () => {},
  });
  assert.equal(text, 'Sure, ');
  assert.equal(api.requests.length, 1, 'the cut-off tool call never ran');
  assert.equal(api.requests[0].body.fallbacks, undefined);
  assert.equal(api.requests[0].body.betas, undefined);
});

async function startHub(folders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-'));
  const store = new Store(dir);
  store.isNew = false;
  const hub = new Hub({ store, providers: new Providers({}, {}), folders, name: 'Test PC' });
  const port = await hub.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  let token = '';
  const call = async (method, route, body, headers = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  token = (await call('POST', '/api/pair', { code: hub.pairingCode })).body.token;
  // fetch() won't send a made-up Host header, so this goes through http.request.
  const callAs = (host, method, route, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: route, headers: { host, 'content-type': 'application/json', ...headers } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end(method === 'POST' ? '{"path":"/"}' : undefined);
    });
  return { hub, call, callAs, port, close: () => hub.close() };
}

test('agents keep their abilities, and only the PC can share a folder', async (t) => {
  const { notes, folders } = makePc();
  folders.remove(folders.list()[0].id);
  const h = await startHub(folders);
  t.after(h.close);

  const created = (await h.call('POST', '/api/agents', { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['files', 'web', 'teleport', 'web'] })).body;
  assert.deepEqual(created.abilities, ['web', 'files'], 'known abilities only, once each, in a fixed order');
  const renamed = (await h.call('PUT', `/api/agents/${created.id}`, { name: 'Nova 2', provider: 'anthropic', model: 'claude-opus-5-5' })).body;
  assert.deepEqual(renamed.abilities, ['web', 'files'], 'an app that predates abilities leaves them alone');
  const cleared = (await h.call('PUT', `/api/agents/${created.id}`, { ...renamed, abilities: [] })).body;
  assert.deepEqual(cleared.abilities, []);

  const local = { 'x-orbit-local': '1' };
  // Not from the page itself, or addressed to another name for this PC: refused.
  assert.equal((await h.call('POST', '/local/folders', { path: notes })).status, 403);
  assert.equal(await h.callAs(`orbit.example:${h.port}`, 'POST', '/local/folders', local), 403);
  assert.equal(await h.callAs('orbit.example', 'GET', '/pair.json'), 403);
  assert.equal(await h.callAs(`localhost:${h.port}`, 'GET', '/pair.json'), 200);
  assert.equal((await h.call('POST', '/local/folders', { path: 'nope' }, local)).status, 400);

  const shared = (await h.call('POST', '/local/folders', { path: notes }, local)).body.folders;
  assert.deepEqual(shared.map((f) => f.name), ['Notes']);
  assert.deepEqual((await h.call('GET', '/pair.json')).body.folders, shared);
  assert.deepEqual((await h.call('GET', '/api/state')).body.folders, shared);
  assert.equal((await h.call('GET', '/api/state')).body.providers.find((p) => p.id === 'anthropic').abilities, true);

  // The phone can stop sharing.
  assert.deepEqual((await h.call('DELETE', `/api/folders/${shared[0].id}`)).body.folders, []);
  const page = await fetch(`http://localhost:${h.port}/pair`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Folders your agents can read/);
});
