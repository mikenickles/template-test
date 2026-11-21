// Packs the hub into orbit-hub-X.Y.Z.zip, the file the Update button installs on a PC.
//   npm run package                           writes it to ./dist
//   npm run package -- <dir>                  writes it to <dir>
//   npm run package -- <dir> --feed <link>    also packs the link to the user's Drive update feed, so the
//                                             hub checks it once installed (the link stays out of git)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedPath } from '../src/updates.js';
import { writeZip } from '../src/zip.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = args.indexOf('--feed');
const feed = flag >= 0 ? args.splice(flag, 2)[1] : null;
if (flag >= 0 && !/^https:\/\//.test(feed ?? '')) throw new Error('--feed needs an https link.');
const out = path.resolve(args[0] ?? path.join(root, 'dist'));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const files = {};
const add = (name) => {
  if (name.endsWith('.update') || path.basename(name).startsWith('.') || name === 'src/update-feed.json') return;
  if (!allowedPath(name)) throw new Error(`"${name}" can't go in an update package. Rename it, or allow it in src/updates.js.`);
  files[name] = fs.readFileSync(path.join(root, name));
};
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(name);
    else add(name);
  }
};
walk('src');
walk('web');
add('package.json');
add('package-lock.json');
if (feed) files['src/update-feed.json'] = Buffer.from(`${JSON.stringify({ url: feed })}\n`);

fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `orbit-hub-${version}.zip`);
fs.writeFileSync(file, writeZip(files));
console.log(`${file}  (${Object.keys(files).length} files, ${(fs.statSync(file).size / 1024).toFixed(0)} KB${feed ? ', with the Drive feed link' : ''})`);
