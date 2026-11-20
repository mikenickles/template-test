import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDir = path.join(root, 'web');
const modules = path.join(root, 'node_modules');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/**
 * Everything the desktop app is made of, by URL. Only files listed here are ever served, so no
 * request can reach anything else on the PC. Preact's hooks import "preact" by bare name; they're
 * served pointing at the local copy, so the app needs no import map and no inline script.
 */
function catalog() {
  const files = new Map();
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
      else if (TYPES[path.extname(entry.name)]) files.set(`${prefix}${entry.name}`, { file: full });
    }
  };
  if (fs.existsSync(webDir)) walk(webDir, '/');
  files.set('/vendor/preact.mjs', { file: path.join(modules, 'preact/dist/preact.module.js') });
  files.set('/vendor/hooks.mjs', {
    file: path.join(modules, 'preact/hooks/dist/hooks.module.js'),
    rewrite: (text) => text.replaceAll('from"preact"', 'from"/vendor/preact.mjs"').replaceAll("from 'preact'", "from '/vendor/preact.mjs'"),
  });
  files.set('/vendor/htm.mjs', { file: path.join(modules, 'htm/dist/htm.module.js') });
  return files;
}

const FILES = catalog();

/** The app's own rules for the browser: its own scripts only, and nothing loaded from elsewhere. */
export const APP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

/** The file for a URL path, or null. "/" is the app itself. */
export function webAsset(pathname) {
  const entry = FILES.get(pathname === '/' ? '/index.html' : pathname);
  if (!entry || !fs.existsSync(entry.file)) return null;
  const type = TYPES[path.extname(entry.file)] ?? 'application/octet-stream';
  let body = fs.readFileSync(entry.file);
  if (entry.rewrite) body = Buffer.from(entry.rewrite(body.toString('utf8')));
  return { type, body };
}
