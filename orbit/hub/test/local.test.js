import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Providers, ProviderError } from '../src/providers.js';

/** A stand-in for Ollama: its model list, and a download that streams progress line by line. */
async function fakeOllama() {
  const installed = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: installed.map((id) => ({ id })) }));
    }
    if (req.method === 'POST' && req.url === '/api/pull') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { model } = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      if (model === 'nope') return res.end(`${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`);
      res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
      for (const completed of [0, 500, 1000]) res.write(`${JSON.stringify({ status: 'pulling abc123', total: 1000, completed })}\n`);
      installed.push(`${model}:latest`);
      return res.end(`${JSON.stringify({ status: 'success' })}\n`);
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, installed, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

const ollama = (providers) => providers.list().find((p) => p.id === 'ollama');
const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
};

test('Ollama only counts as ready when it is running and has a model, and can download one', async () => {
  const fake = await fakeOllama();
  const providers = new Providers({ ollama: { baseUrl: fake.baseUrl } }, {});
  await providers.checkLocal();
  let row = ollama(providers);
  assert.equal(row.running, true);
  assert.equal(row.configured, false, 'running with no models is not ready');
  assert.ok(row.suggestions.some((s) => s.model === 'llama3.2'));

  providers.pull('ollama', 'llama3.2');
  assert.throws(() => providers.pull('ollama', 'gemma3:1b'), /still downloading/);
  await until(() => !ollama(providers).download);
  row = ollama(providers);
  assert.deepEqual(row.models, ['llama3.2:latest']);
  assert.equal(row.configured, true);

  // A model that doesn't exist fails with a plain message, which stays until cleared.
  providers.pull('ollama', 'nope');
  await until(() => ollama(providers).download?.error);
  assert.match(ollama(providers).download.error, /no model called "nope"/);
  providers.clearDownload('ollama');
  assert.equal(ollama(providers).download, null);

  assert.throws(() => providers.pull('ollama', 'rm -rf /'), ProviderError);
  assert.throws(() => providers.pull('openai', 'gpt'), /can't download/);
  fake.server.close();
});

test('an agent on Ollama says why it cannot reply when Ollama is missing or lacks the model', async () => {
  const providers = new Providers({ ollama: { baseUrl: 'http://127.0.0.1:9/v1' } }, {});
  await providers.checkLocal();
  assert.equal(ollama(providers).running, false);
  await assert.rejects(
    providers.stream({ provider: 'ollama', model: 'llama3.2', system: '', messages: [], onDelta() {} }),
    /isn't running on your PC/,
  );
  const fake = await fakeOllama();
  fake.installed.push('gemma3:1b');
  const other = new Providers({ ollama: { baseUrl: fake.baseUrl } }, {});
  await assert.rejects(
    other.stream({ provider: 'ollama', model: 'llama3.2', system: '', messages: [], onDelta() {} }),
    /llama3.2 isn't downloaded yet/,
  );
  fake.server.close();
});
