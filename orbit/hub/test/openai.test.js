import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { GUIDE } from '../src/self.js';
import { fetchPage, isPublicAddress } from '../src/tools.js';
import { withoutTools } from '../src/openai.js';

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


/**
 * A pretend Ollama: lists its models, and answers chat requests from a script. Each step is either
 * { error: [status, message] } or a list of SSE chunks' deltas. Keeps every request.
 */
async function fakeOllama(t, steps) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'lfm3:latest' }] }));
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    const step = steps.shift() ?? [{ content: 'ok' }];
    if (step.error) {
      res.writeHead(step.error[0], { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: step.error[1] } }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(step.map((delta) => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`).join('') + 'data: [DONE]\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { requests, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

async function start(t, providersConfig) {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const hub = new Hub({ store, providers: new Providers(providersConfig, {}), name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { hub, store, api };
}

test('an Ollama model uses the hub\'s tools, with calls that arrive in pieces', async (t) => {
  withoutTools.clear();
  const ollama = await fakeOllama(t, [
    [{ content: 'Let me check.' }, { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'treehouse_guide', arguments: '' } }] }, { tool_calls: [{ index: 0, function: { arguments: '{}' } }] }],
    [{ content: 'You are in Treehouse.' }],
  ]);
  const h = await start(t, { ollama: { baseUrl: ollama.baseUrl } });
  const lfm = (await h.api('POST', '/api/agents', { name: 'Lumi', provider: 'ollama', model: 'lfm3:latest', abilities: ['memory'] })).body;
  const room = (await h.api('POST', '/api/rooms', { name: 'Local', agentIds: [lfm.id] })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'What app is this?' });
  await h.hub.orchestrator.idle(room.id);

  const first = ollama.requests[0];
  const names = first.tools.map((tool) => tool.function.name);
  assert.ok(names.includes('treehouse_guide') && names.includes('remember') && names.includes('update_self'));
  assert.ok(!names.includes('web_search'), 'no web without the ability');
  assert.equal(first.tools[0].type, 'function');
  assert.ok(!first.messages[0].content.includes(GUIDE), 'with tools, the guide is read when needed');

  const second = ollama.requests[1].messages;
  assert.deepEqual(second.at(-2).tool_calls, [{ id: 'c1', type: 'function', function: { name: 'treehouse_guide', arguments: '{}' } }]);
  assert.equal(second.at(-1).role, 'tool');
  assert.equal(second.at(-1).tool_call_id, 'c1');
  assert.match(second.at(-1).content, /# The Treehouse guide/);

  const reply = h.store.messages(room.id).at(-1);
  assert.equal(reply.status, 'done');
  assert.equal(reply.text, 'Let me check.\n\nYou are in Treehouse.');
  assert.deepEqual(reply.activity.map((a) => [a.kind, a.done]), [['guide', true]]);
});

test('a model that does not take tools answers without them, and is remembered', async (t) => {
  withoutTools.clear();
  const ollama = await fakeOllama(t, [
    { error: [400, 'registry.ollama.ai/library/lfm3:latest does not support tools'] },
    [{ content: 'Hello!' }],
    [{ content: 'Again!' }],
  ]);
  const h = await start(t, { ollama: { baseUrl: ollama.baseUrl } });
  const lfm = (await h.api('POST', '/api/agents', { name: 'Lumi', provider: 'ollama', model: 'lfm3:latest', abilities: ['web'] })).body;
  const room = (await h.api('POST', '/api/rooms', { name: 'Local', agentIds: [lfm.id] })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'Hi' });
  await h.hub.orchestrator.idle(room.id);
  assert.equal(h.store.messages(room.id).at(-1).text, 'Hello!');
  assert.ok(ollama.requests[0].tools);
  assert.equal(ollama.requests[1].tools, undefined);
  assert.ok(ollama.requests[1].messages[0].content.includes(GUIDE), 'without tools, the guide comes along');

  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'Hi again' });
  await h.hub.orchestrator.idle(room.id);
  assert.equal(ollama.requests.length, 3, 'tools are not offered again');
  assert.equal(ollama.requests[2].tools, undefined);
});

test('other models search the web through a quick Claude search, with sources', async (t) => {
  withoutTools.clear();
  const ollama = await fakeOllama(t, [
    [{ tool_calls: [{ index: 0, id: 's1', type: 'function', function: { name: 'web_search', arguments: '{"query":"kyoto weather"}' } }] }],
    [{ content: 'It will be sunny in Kyoto.' }],
  ]);
  const claude = await fakeClaude(t, [[{ type: 'text', text: '- Sunny, 18C (weather.example)' }]]);
  const h = await start(t, { ollama: { baseUrl: ollama.baseUrl }, anthropic: { apiKey: 'sk-test', baseUrl: claude.baseUrl } });
  const lfm = (await h.api('POST', '/api/agents', { name: 'Lumi', provider: 'ollama', model: 'lfm3:latest', abilities: ['web', 'code'] })).body;
  const room = (await h.api('POST', '/api/rooms', { name: 'Trip', agentIds: [lfm.id] })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'Weather in Kyoto?' });
  await h.hub.orchestrator.idle(room.id);

  const names = ollama.requests[0].tools.map((tool) => tool.function.name);
  assert.ok(names.includes('web_search') && names.includes('web_fetch'));
  assert.ok(!names.includes('code_execution'), 'no code outside Claude');
  assert.doesNotMatch(ollama.requests[0].messages[0].content, /Run code/);
  const search = claude.requests[0];
  assert.equal(search.model, 'claude-haiku-5-5');
  assert.equal(search.messages[0].content, 'kyoto weather');
  assert.ok(search.tools.some((tool) => tool.name === 'web_search'));
  assert.match(ollama.requests[1].messages.at(-1).content, /Sunny, 18C/);
  const reply = h.store.messages(room.id).at(-1);
  assert.equal(reply.text, 'It will be sunny in Kyoto.');
  assert.deepEqual(reply.activity.map((a) => [a.kind, a.detail]), [['search', 'kyoto weather']]);
});

test('without a Claude key, other models can still read pages, but not search', async (t) => {
  withoutTools.clear();
  const ollama = await fakeOllama(t, [[{ content: 'ok' }]]);
  const h = await start(t, { ollama: { baseUrl: ollama.baseUrl } });
  const lfm = (await h.api('POST', '/api/agents', { name: 'Lumi', provider: 'ollama', model: 'lfm3:latest', abilities: ['web'] })).body;
  const room = (await h.api('POST', '/api/rooms', { name: 'Local', agentIds: [lfm.id] })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'Hi' });
  await h.hub.orchestrator.idle(room.id);
  const names = ollama.requests[0].tools.map((tool) => tool.function.name);
  assert.ok(names.includes('web_fetch') && !names.includes('web_search'));
  assert.match(ollama.requests[0].messages[0].content, /Searching the web needs an Anthropic key/);
});

test('pages are read from the internet only, never this PC or the home network', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.101.102.103', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1', '0.0.0.0']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);

  const lookup = async (host) => [{ address: { 'example.com': '93.184.216.34', 'router.lan': '192.168.1.1' }[host] ?? '127.0.0.1' }];
  const pages = {
    'https://example.com/': new Response('<html><title>Example</title><body><p>Hello <b>world</b></p><script>x()</script></body></html>', { headers: { 'content-type': 'text/html' } }),
    'https://example.com/away': new Response('', { status: 302, headers: { location: 'http://router.lan/admin' } }),
    'https://example.com/file.zip': new Response('PK', { headers: { 'content-type': 'application/zip' } }),
  };
  const doFetch = async (url) => pages[String(url)] ?? new Response('', { status: 404 });
  const read = await fetchPage('https://example.com/', { fetch: doFetch, lookup });
  assert.equal(read.isError, false);
  assert.match(read.text, /^Example\nhttps:\/\/example.com\/\n\nHello world$/);
  assert.match((await fetchPage('http://localhost:8787/api/state', { fetch: doFetch, lookup })).text, /home network/);
  assert.match((await fetchPage('http://192.168.1.1/', { fetch: doFetch, lookup })).text, /home network/);
  assert.match((await fetchPage('https://example.com/away', { fetch: doFetch, lookup })).text, /home network/, 'redirects are checked too');
  assert.match((await fetchPage('file:///etc/passwd', { fetch: doFetch, lookup })).text, /Only http and https/);
  assert.match((await fetchPage('https://example.com/file.zip', { fetch: doFetch, lookup })).text, /application\/zip/);
});
