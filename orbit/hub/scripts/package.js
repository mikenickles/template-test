// Packs the hub into orbit-hub-X.Y.Z.zip, the file the Update button installs on a PC.
//   npm run package            writes it to ./dist
//   npm run package -- <dir>   writes it to <dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedPath } from '../src/updates.js';
import { writeZip } from '../src/zip.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const files = {};
const add = (name) => {
  if (name.endsWith('.update') || path.basename(name).startsWith('.')) return;
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

fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `orbit-hub-${version}.zip`);
fs.writeFileSync(file, writeZip(files));
console.log(`${file}  (${Object.keys(files).length} files, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
