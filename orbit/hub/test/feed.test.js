import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Feed, FeedError, feedUrl, parseManifest } from '../src/feed.js';
import { Updates } from '../src/updates.js';
import { writeZip } from '../src/zip.js';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** A stand-in for Drive: the manifest Doc as text (with the BOM Docs adds), and the files. */
async function fakeDrive(t, { version = '0.15.0', html = null, damage = false } = {}) {
  const hub = writeZip({ 'package.json': JSON.stringify({ name: 'orbit-hub', version }), 'src/main.js': 'new' });
  const app = crypto.randomBytes(25_000);
  const parts = [app.subarray(0, 10_000), app.subarray(10_000)];
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/doc/export?format=txt') {
      const base = `http://127.0.0.1:${server.address().port}`;
      const manifest = {
        orbit: 'update-feed', version, notes: 'Replies.',
        hub: { url: `${base}/file/hub`, sha256: sha(hub), size: hub.length },
        app: { sha256: sha(app), size: app.length, parts: parts.map((p, i) => ({ url: `${base}/file/app${i}`, sha256: sha(p), size: p.length })) },
      };
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`﻿${JSON.stringify(manifest, null, 2)}\r\n`);
    }
    if (html && req.url === html) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html>Google Drive can\'t scan this file for viruses.</html>');
    }
    const body = { '/file/hub': hub, '/file/app0': parts[0], '/file/app1': parts[1] }[req.url];
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(damage && req.url === '/file/app1' ? Buffer.concat([body.subarray(1), Buffer.from('x')]) : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}/doc/export?format=txt`, hub, app, hits };
}

function updatesFolder(current = '0.14.0') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-feed-'));
  return new Updates({ dir: path.join(root, 'updates'), hubDir: path.join(root, 'hub'), current });
}

test('a newer version in the Drive feed is downloaded, joined and checked into the updates folder', async (t) => {
  const drive = await fakeDrive(t);
  const updates = updatesFolder('0.14.0');
  const feed = new Feed({ url: drive.url, updates });
  const status = await feed.check();
  assert.deepEqual([status.error, status.latest], [null, '0.15.0']);
  assert.deepEqual(fs.readFileSync(path.join(updates.dir, 'orbit-hub-0.15.0.zip')), drive.hub);
  assert.deepEqual(fs.readFileSync(path.join(updates.dir, 'orbit-0.15.0.apk')), drive.app);
  assert.deepEqual(updates.status().hub, { current: '0.14.0', available: '0.15.0' });
  assert.equal(updates.status().app.available, '0.15.0');
  assert.ok(!fs.readdirSync(updates.dir).some((f) => f.endsWith('.download')));

  // Checking again downloads nothing new.
  const before = drive.hits.length;
  await feed.check();
  assert.deepEqual(drive.hits.slice(before), ['/doc/export?format=txt']);
});

test('nothing is kept when Drive serves a page instead of a file or a file arrives damaged', async (t) => {
  const page = await fakeDrive(t, { html: '/file/hub' });
  const updates = updatesFolder();
  let status = await new Feed({ url: page.url, updates }).check();
  assert.match(status.error, /Drive showed a page instead of the hub package/);
  assert.deepEqual(fs.readdirSync(updates.dir), []);

  const damaged = await fakeDrive(t, { damage: true });
  const other = updatesFolder();
  status = await new Feed({ url: damaged.url, updates: other }).check();
  assert.match(status.error, /part 2 of the phone app didn't download intact/i);
  assert.deepEqual(fs.readdirSync(other.dir), ['orbit-hub-0.15.0.zip'], 'the intact hub package is kept; the app is not');
});

test('a hub that is already current only fetches the phone app, and a feed of an older version is ignored', async (t) => {
  const drive = await fakeDrive(t, { version: '0.15.0' });
  const updates = updatesFolder('0.15.0');
  await new Feed({ url: drive.url, updates }).check();
  assert.deepEqual(fs.readdirSync(updates.dir).sort(), ['orbit-0.15.0.apk']);
  const old = await fakeDrive(t, { version: '0.13.0' });
  const other = updatesFolder('0.14.0');
  fs.writeFileSync(path.join(other.dir, 'orbit-0.14.0.apk'), 'x');
  await new Feed({ url: old.url, updates: other }).check();
  assert.deepEqual(fs.readdirSync(other.dir), ['orbit-0.14.0.apk']);
});

test('the manifest is checked, and the feed link comes from config or the hub package', () => {
  const ok = { orbit: 'update-feed', version: '1.0.0', hub: { url: 'https://x/h', sha256: 'a'.repeat(64), size: 5 }, app: { sha256: 'b'.repeat(64), size: 3, parts: [{ url: 'https://x/a', sha256: 'c'.repeat(64), size: 3 }] } };
  assert.equal(parseManifest(`﻿Some heading\n${JSON.stringify(ok)}\n`).version, '1.0.0');
  assert.throws(() => parseManifest('hello'), FeedError);
  assert.throws(() => parseManifest(JSON.stringify({ ...ok, hub: { ...ok.hub, url: 'http://evil.example/h' } })), /isn't https/);
  assert.throws(() => parseManifest(JSON.stringify({ ...ok, app: { ...ok.app, size: 4 } })), /don't add up/);

  const hubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-feed-'));
  assert.equal(feedUrl(hubDir, {}), null);
  fs.mkdirSync(path.join(hubDir, 'src'));
  fs.writeFileSync(path.join(hubDir, 'src', 'update-feed.json'), JSON.stringify({ url: 'https://docs.google.com/document/d/abc/export?format=txt' }));
  assert.equal(feedUrl(hubDir, {}), 'https://docs.google.com/document/d/abc/export?format=txt');
  assert.equal(feedUrl(hubDir, { updates: { feed: '' } }), null, 'config can switch it off');
});
