import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { UpdateError, Updates, allowedPath, compareVersions } from '../src/updates.js';
import { ZipError, readZip, writeZip } from '../src/zip.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-update-'));

/** A hub folder with a few files, and an updates folder beside it. */
function setup(current = '0.10.0') {
  const root = temp();
  const hubDir = path.join(root, 'hub');
  fs.mkdirSync(path.join(hubDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(hubDir, 'web'));
  fs.writeFileSync(path.join(hubDir, 'src/main.js'), 'old main');
  fs.writeFileSync(path.join(hubDir, 'web/app.js'), 'old app');
  fs.writeFileSync(path.join(hubDir, 'Start Orbit.bat'), 'old bat');
  fs.writeFileSync(path.join(hubDir, 'package.json'), JSON.stringify({ name: 'orbit-hub', version: current }));
  const dir = path.join(root, 'updates');
  return { hubDir, dir, updates: new Updates({ dir, hubDir, current }) };
}

const manifest = (version, extra = {}) => JSON.stringify({ name: 'orbit-hub', version, ...extra });
const hubZip = (version, files = {}) =>
  writeZip({ 'package.json': manifest(version), 'src/main.js': `new main ${version}`, 'web/app.js': `new app ${version}`, ...files });

test('versions compare by number, and only Orbit paths are allowed in a package', () => {
  assert.equal(compareVersions('0.11.0', '0.10.0'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('0.10.0', '0.10.0'), 0);
  for (const ok of ['src/main.js', 'web/avatars/01.webp', 'package.json', 'package-lock.json']) assert.ok(allowedPath(ok), ok);
  for (const bad of ['Start Orbit.bat', '../evil.js', 'src/../../evil.js', '/etc/passwd', 'C:/x.js', 'src\\x.js', 'node_modules/x.js', 'test/a.js']) {
    assert.equal(allowedPath(bad), false, bad);
  }
});

test('zips round-trip, and damaged ones are refused', () => {
  const zip = writeZip({ 'a.txt': 'hello '.repeat(500), 'b/c.txt': 'x' });
  assert.deepEqual(readZip(zip).map((e) => [e.name, e.read().length]), [['a.txt', 3000], ['b/c.txt', 1]]);
  assert.throws(() => readZip(Buffer.from('nope')), ZipError);
  const damaged = Buffer.from(zip);
  damaged[40] ^= 0xff;
  assert.throws(() => readZip(damaged).forEach((e) => e.read()), ZipError);
});

test('the updates folder offers the newest newer hub package and the newest phone app', () => {
  const { dir, updates } = setup('0.10.0');
  assert.deepEqual(updates.status(), { folder: dir, hub: { current: '0.10.0', available: null }, app: { available: null, size: 0 } });
  for (const name of ['orbit-hub-0.9.0.zip', 'orbit-hub-0.10.0.zip', 'orbit-hub-0.11.0.zip', 'orbit-hub-0.12.0 (1).zip', 'notes.txt']) fs.writeFileSync(path.join(dir, name), 'x');
  fs.writeFileSync(path.join(dir, 'orbit-0.10.0.apk'), 'a'.repeat(10));
  fs.writeFileSync(path.join(dir, 'orbit-0.11.0.apk'), 'a'.repeat(20));
  assert.deepEqual(updates.status().hub, { current: '0.10.0', available: '0.11.0' });
  assert.deepEqual(updates.status().app, { available: '0.11.0', size: 20 });
});

test('a package is checked before anything is touched', () => {
  const { hubDir, dir, updates } = setup('0.10.0');
  const put = (name, bytes) => fs.writeFileSync(path.join(dir, name), bytes);
  const refuses = (pattern) => assert.throws(() => updates.install(), (err) => err instanceof UpdateError && pattern.test(err.message));

  refuses(/no newer hub update/);
  put('orbit-hub-0.11.0.zip', 'not a zip');
  refuses(/isn't a zip/);
  put('orbit-hub-0.11.0.zip', writeZip({ 'package.json': manifest('0.11.0'), 'src/main.js': 'x', 'Start Orbit.bat': 'evil' }));
  refuses(/won't install \(Start Orbit.bat\)/);
  put('orbit-hub-0.11.0.zip', writeZip({ 'package.json': manifest('0.11.0'), 'src/main.js': 'x', 'src/../../out.js': 'evil' }));
  refuses(/won't install/);
  put('orbit-hub-0.11.0.zip', writeZip({ 'package.json': JSON.stringify({ name: 'something-else', version: '0.11.0' }), 'src/main.js': 'x' }));
  refuses(/isn't an Orbit hub package/);
  put('orbit-hub-0.11.0.zip', writeZip({ 'package.json': manifest('0.12.0'), 'src/main.js': 'x' }));
  refuses(/says it is version 0.12.0/);
  put('orbit-hub-0.11.0.zip', writeZip({ 'package.json': manifest('0.11.0') }));
  refuses(/missing the hub itself/);

  for (const file of ['src/main.js', 'web/app.js', 'Start Orbit.bat']) assert.ok(fs.readFileSync(path.join(hubDir, file), 'utf8').startsWith('old'), `${file} untouched`);
});

test('installing replaces the hub files, keeps a copy of the old ones, and leaves the start script alone', () => {
  const { hubDir, dir, updates } = setup('0.10.0');
  fs.writeFileSync(path.join(dir, 'orbit-hub-0.11.0.zip'), hubZip('0.11.0', { 'web/new.js': 'brand new' }));
  assert.equal(updates.install().version, '0.11.0');
  const read = (file) => fs.readFileSync(path.join(hubDir, file), 'utf8');
  assert.equal(read('src/main.js'), 'new main 0.11.0');
  assert.equal(read('web/app.js'), 'new app 0.11.0');
  assert.equal(read('web/new.js'), 'brand new');
  assert.equal(JSON.parse(read('package.json')).version, '0.11.0');
  assert.equal(read('Start Orbit.bat'), 'old bat');
  assert.equal(fs.readFileSync(path.join(dir, 'previous/src/main.js'), 'utf8'), 'old main');
  assert.deepEqual(fs.readdirSync(path.join(hubDir, 'src')), ['main.js'], 'no temporary files left behind');
});

test('the hub tells apps what is waiting, serves the phone app to paired phones, and installs from any paired device', async (t) => {
  const { hubDir, dir, updates } = setup('0.10.0');
  const store = new Store(temp());
  store.isNew = false;
  const restarts = [];
  const hub = new Hub({ store, providers: new Providers({}, {}), name: 'Test PC', updates, onRestart: (v) => restarts.push(v) });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const auth = { authorization: `Bearer ${token}` };
  const get = async (route, headers = auth) => fetch(base + route, { headers });

  assert.deepEqual((await (await get('/api/state')).json()).updates.app, { available: null, size: 0 });
  assert.equal((await get('/api/updates/app')).status, 404);

  const apk = Buffer.from('PK-fake-apk-'.repeat(1000));
  fs.writeFileSync(path.join(dir, 'orbit-0.11.0.apk'), apk);
  fs.writeFileSync(path.join(dir, 'orbit-hub-0.11.0.zip'), hubZip('0.11.0'));
  const state = (await (await get('/api/state')).json()).updates;
  assert.deepEqual([state.hub.available, state.app.available, state.app.size], ['0.11.0', '0.11.0', apk.length]);

  const download = await get('/api/updates/app');
  assert.equal(download.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), apk);
  assert.equal((await get('/api/updates/app', {})).status, 401, 'an unpaired device gets nothing');

  const post = (route, headers = auth) => fetch(base + route, { method: 'POST', headers });
  assert.equal((await post('/api/updates/apply', {})).status, 401, 'an unpaired device can\'t install');
  // Opening the folder opens a window on the PC, so only the page on the PC may ask.
  assert.equal((await post('/api/updates/open', auth)).status, 403, 'the page on the PC must send it');
  // fetch won't send a made-up Host header, so this one is raw: a page that points its own domain at this PC.
  const spoofed = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/updates/open', { method: 'POST', headers: { ...auth, 'x-orbit-local': '1', host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(spoofed, 403, 'only addressed to localhost');
  assert.equal(fs.readFileSync(path.join(hubDir, 'src/main.js'), 'utf8'), 'old main');

  const applied = await post('/api/updates/apply');
  assert.deepEqual(await applied.json(), { ok: true, version: '0.11.0' });
  assert.equal(fs.readFileSync(path.join(hubDir, 'src/main.js'), 'utf8'), 'new main 0.11.0');
  assert.equal((await post('/api/updates/apply')).status, 409, 'not twice');
  await new Promise((r) => setTimeout(r, 600));
  assert.deepEqual(restarts, ['0.11.0']);
});
