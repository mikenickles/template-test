import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The arlo/ folder (parent of hub/). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIR = path.join(ROOT, 'web');

/** Demo mode: canned accounts and a scripted model, so Arlo can be tried with no keys at all. */
export const DEMO = process.argv.includes('--demo') || process.env.ARLO_DEMO === '1';

function defaultDataDir(): string {
  if (DEMO) return path.join(os.tmpdir(), 'arlo-demo');
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Arlo');
  }
  return path.join(os.homedir(), '.arlo');
}

/** Everything private lives here, outside the repository: database, keys, tokens. */
export const DATA_DIR = process.env.ARLO_DATA_DIR || defaultDataDir();
export const PORT = Number(process.env.ARLO_PORT || 8787);

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

/** Non-internal IPv4 addresses, used to tell the phone where the hub is. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}
