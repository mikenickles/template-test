import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { freshDb } from './helpers.ts';
import { hasSecret } from '../hub/secrets.ts';
import { createHandler } from '../hub/server.ts';
import { getSettings, updateSettings } from '../hub/settings.ts';
import http from 'node:http';

// The hub decides who is "at the computer" from the port it believes it is on,
// so the test server is started first and the handler is built for its port.
let server: http.Server;
let base = '';
let port = 0;

before(async () => {
  freshDb();
  let handle: http.RequestListener = () => {};
  server = http.createServer((req, res) => handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  handle = createHandler({ port, fetch: globalThis.fetch, onRemoteAccessChange: () => {} });
});
after(() => server.close());

const json = { 'content-type': 'application/json' };
/** A request that arrives through something else (a proxy, another machine) is never the owner's seat. */
const remote = { 'x-forwarded-for': '203.0.113.9' };

test('the computer itself is trusted; the page loads', async () => {
  assert.equal((await fetch(`${base}/api/state`)).status, 200);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/);
});

test('another website cannot call the hub from the owner\'s browser', async () => {
  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { ...json, origin: 'https://evil.example' }, body: '{"text":"hi"}' });
  assert.equal(res.status, 403);
  const form = await fetch(`${base}/api/chat`, { method: 'POST', body: 'text=hi' });
  assert.equal(form.status, 415);
});

test('a request for a different host name is refused (DNS rebinding)', async () => {
  const status = await new Promise<number>((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/api/state', headers: { host: `evil.example:${port}` } }, (res) => resolve(res.statusCode ?? 0));
  });
  assert.equal(status, 403);
});

test('with phone access off, nothing but this computer gets an answer', async () => {
  assert.equal((await fetch(`${base}/api/state`, { headers: remote })).status, 403);
  assert.equal((await fetch(`${base}/pair`, { headers: remote })).status, 403);
});

test('a phone must pair with a one-time code, and then cannot touch keys, limits or devices', async () => {
  updateSettings({ remoteAccess: true });
  assert.equal((await fetch(`${base}/api/state`, { headers: remote })).status, 401);

  const wrong = await fetch(`${base}/api/pair/complete`, { method: 'POST', headers: { ...json, ...remote }, body: '{"code":"AAAAAAAA"}' });
  assert.equal(wrong.status, 403); // no code has been issued yet

  // Only the computer can issue a code.
  assert.equal((await fetch(`${base}/api/pair/start`, { method: 'POST', headers: remote })).status, 401);
  const { code } = (await (await fetch(`${base}/api/pair/start`, { method: 'POST' })).json()) as { code: string };

  const paired = await fetch(`${base}/api/pair/complete`, { method: 'POST', headers: { ...json, ...remote }, body: JSON.stringify({ code, name: 'Pixel' }) });
  assert.equal(paired.status, 200);
  const cookie = paired.headers.get('set-cookie')!.split(';')[0]!;
  assert.match(paired.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  const phone = { ...remote, cookie };

  // The code is spent.
  const again = await fetch(`${base}/api/pair/complete`, { method: 'POST', headers: { ...json, ...remote }, body: JSON.stringify({ code }) });
  assert.equal(again.status, 403);

  const state = (await (await fetch(`${base}/api/state`, { headers: phone })).json()) as { seat: string };
  assert.equal(state.seat, 'device');

  // Everyday things work from the phone, including the kill switch.
  assert.equal((await fetch(`${base}/api/settings`, { method: 'POST', headers: { ...json, ...phone }, body: '{"userName":"Mike"}' })).status, 200);
  assert.equal((await fetch(`${base}/api/pause`, { method: 'POST', headers: { ...json, ...phone }, body: '{"paused":true}' })).status, 200);
  assert.equal(getSettings().paused, true);

  // Sensitive things do not.
  for (const body of ['{"keys":{"openai":"sk-x"}}', '{"wallet":{"perDay":999999}}', '{"remoteAccess":true}', '{"models":{"openai":"x"}}']) {
    const res = await fetch(`${base}/api/settings`, { method: 'POST', headers: { ...json, ...phone }, body });
    assert.equal(res.status, 403, body);
  }
  assert.equal(hasSecret('key.openai'), false);
  assert.equal(getSettings().wallet.perDay, 10000);
  assert.equal((await fetch(`${base}/api/devices`, { headers: phone })).status, 403);
  assert.equal((await fetch(`${base}/api/connect/stripe`, { method: 'POST', headers: { ...json, ...phone }, body: '{"key":"rk_test_x"}' })).status, 403);

  // Unpairing from the computer cuts the phone off at once.
  const { devices } = (await (await fetch(`${base}/api/devices`)).json()) as { devices: { id: string }[] };
  await fetch(`${base}/api/devices/${devices[0]!.id}`, { method: 'DELETE' });
  assert.equal((await fetch(`${base}/api/state`, { headers: phone })).status, 401);
});

test('a pairing code dies after a handful of wrong guesses', async () => {
  updateSettings({ remoteAccess: true });
  const { code } = (await (await fetch(`${base}/api/pair/start`, { method: 'POST' })).json()) as { code: string };
  for (let i = 0; i < 8; i++) {
    await fetch(`${base}/api/pair/complete`, { method: 'POST', headers: { ...json, ...remote }, body: '{"code":"ZZZZZZZZ"}' });
  }
  const res = await fetch(`${base}/api/pair/complete`, { method: 'POST', headers: { ...json, ...remote }, body: JSON.stringify({ code }) });
  assert.equal(res.status, 403);
});

test('only files inside the web folder are served', async () => {
  const status = await new Promise<number>((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/../hub/main.ts' }, (res) => resolve(res.statusCode ?? 0));
  });
  assert.equal(status, 404);
  assert.equal((await fetch(`${base}/vendor/anything-else.js`)).status, 404);
});
