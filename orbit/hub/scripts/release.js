// Prepares a release for the Drive feed: splits the phone app into parts small enough to upload
// (Claude's Drive connection takes about 3 MB per file) and writes release.json with every file's size and SHA-256. The manifest the
// hub reads is release.json plus each uploaded file's download link (see CLAUDE.md, Releases).
//   node scripts/release.js <dir>     <dir> holds orbit-hub-X.Y.Z.zip and orbit-X.Y.Z.apk
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PART = 2.9 * 1000 * 1000;
const dir = path.resolve(process.argv[2] ?? '.');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const find = (pattern) => fs.readdirSync(dir).find((f) => pattern.test(f));
const hubName = find(/^orbit-hub-\d+\.\d+\.\d+\.zip$/);
const appName = find(/^orbit-\d+\.\d+\.\d+\.apk$/);
if (!hubName || !appName) throw new Error(`${dir} needs orbit-hub-X.Y.Z.zip and orbit-X.Y.Z.apk.`);
const version = /(\d+\.\d+\.\d+)/.exec(appName)[1];
if (!hubName.includes(version)) throw new Error('The hub package and the app must be the same version.');

const hub = fs.readFileSync(path.join(dir, hubName));
const app = fs.readFileSync(path.join(dir, appName));
const parts = [];
for (let at = 0, n = 1; at < app.length; at += PART, n++) {
  const bytes = app.subarray(at, at + PART);
  const file = `${appName}.part${n}`;
  fs.writeFileSync(path.join(dir, file), bytes);
  parts.push({ file, sha256: sha(bytes), size: bytes.length });
}
const release = {
  orbit: 'update-feed',
  version,
  hub: { file: hubName, sha256: sha(hub), size: hub.length },
  app: { sha256: sha(app), size: app.length, parts },
};
fs.writeFileSync(path.join(dir, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify(release, null, 2));
