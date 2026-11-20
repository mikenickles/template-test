import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MAX_UNPACKED, ZipError, readZip } from './zip.js';

/**
 * Updates arrive as two files saved in the hub's updates folder: `orbit-hub-X.Y.Z.zip` for this PC and
 * `orbit-X.Y.Z.apk` for phones. The hub notices them, offers an Update button on the desktop, and serves
 * the app to paired phones. Nothing is downloaded from the internet.
 */

export class UpdateError extends Error {
  name = 'UpdateError';
}

const VERSION = /^\d+\.\d+\.\d+$/;
const HUB_FILE = /^orbit-hub-(\d+\.\d+\.\d+)\.zip$/;
const APP_FILE = /^orbit-(\d+\.\d+\.\d+)\.apk$/;

/** What a hub package may contain. Everything else, like the start script, is left alone. */
const ALLOWED = [/^src\/[\w./-]+$/, /^web\/[\w./-]+$/, /^package\.json$/, /^package-lock\.json$/];

/** 1 if a is newer than b, -1 if older, 0 if the same. */
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** Whether a path inside a package is one the hub may write. */
export function allowedPath(name) {
  if (name.includes('..') || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)) return false;
  return ALLOWED.some((pattern) => pattern.test(name));
}

export class Updates {
  /**
   * @param {{ dir: string, hubDir: string, current: string }} options  `dir` is the updates folder,
   *   `hubDir` the hub's own folder, `current` the running version.
   */
  constructor({ dir, hubDir, current }) {
    this.dir = dir;
    this.hubDir = hubDir;
    this.current = current;
    fs.mkdirSync(dir, { recursive: true });
  }

  /** The newest file in the folder matching `pattern`, if it is newer than `than`. */
  #newest(pattern, than) {
    let best = null;
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return null;
    }
    for (const name of names) {
      const version = pattern.exec(name)?.[1];
      if (!version || compareVersions(version, than) <= 0) continue;
      if (!best || compareVersions(version, best.version) > 0) best = { version, name };
    }
    if (!best) return null;
    const file = path.join(this.dir, best.name);
    try {
      const stat = fs.statSync(file);
      return stat.isFile() ? { ...best, file, size: stat.size } : null;
    } catch {
      return null;
    }
  }

  /** What is waiting in the folder. `appVersion` is what phones are running. */
  status() {
    const hub = this.#newest(HUB_FILE, this.current);
    const app = this.#newest(APP_FILE, '0.0.0');
    return {
      folder: this.dir,
      hub: { current: this.current, available: hub?.version ?? null },
      // Phones compare this with their own version, so it is the newest app file whatever the hub runs.
      app: { available: app?.version ?? null, size: app?.size ?? 0 },
    };
  }

  /** The newest phone app in the folder, for sending to a phone. */
  appFile() {
    return this.#newest(APP_FILE, '0.0.0');
  }

  /**
   * Checks the hub package in the folder without installing it: it must be a zip with this hub's own
   * name and a newer version, holding only files the hub may replace. Returns what installing it needs.
   */
  inspect() {
    const found = this.#newest(HUB_FILE, this.current);
    if (!found) throw new UpdateError('There is no newer hub update in the updates folder.');
    let entries;
    try {
      entries = readZip(fs.readFileSync(found.file));
    } catch (err) {
      if (err instanceof ZipError) throw new UpdateError(`${found.name}: ${err.message}`);
      throw err;
    }
    const files = new Map();
    let total = 0;
    for (const entry of entries) {
      if (!allowedPath(entry.name)) {
        throw new UpdateError(`${found.name} holds a file the hub won't install (${entry.name.slice(0, 80)}). Was it made by Orbit?`);
      }
      total += entry.size;
      if (total > MAX_UNPACKED) throw new UpdateError(`${found.name} is bigger than a hub update should be.`);
      try {
        files.set(entry.name, entry.read());
      } catch (err) {
        if (err instanceof ZipError) throw new UpdateError(`${found.name}: ${err.message}`);
        throw err;
      }
    }
    let manifest;
    try {
      manifest = JSON.parse(files.get('package.json')?.toString('utf8') ?? '');
    } catch {
      throw new UpdateError(`${found.name} has no readable package.json. Was it made by Orbit?`);
    }
    if (manifest.name !== 'orbit-hub' || !VERSION.test(manifest.version ?? '')) {
      throw new UpdateError(`${found.name} isn't an Orbit hub package.`);
    }
    if (manifest.version !== found.version) {
      throw new UpdateError(`${found.name} says it is version ${manifest.version}. Download it again.`);
    }
    if (!files.has('src/main.js')) throw new UpdateError(`${found.name} is missing the hub itself.`);
    return { version: found.version, files };
  }

  /**
   * Installs the hub package: keeps a copy of what it replaces in `previous`, then writes the new files.
   * The hub keeps running on what it already loaded until it restarts. Returns the new version.
   */
  install() {
    const update = this.inspect();
    const backup = path.join(this.dir, 'previous');
    fs.rmSync(backup, { recursive: true, force: true });
    for (const name of update.files.keys()) {
      const target = path.join(this.hubDir, name);
      if (fs.existsSync(target)) {
        const saved = path.join(backup, name);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.copyFileSync(target, saved);
      }
    }
    // Write each file beside its target first, then rename into place, so a failure never leaves half a file.
    const staged = [];
    try {
      for (const [name, bytes] of update.files) {
        const target = path.join(this.hubDir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temp = `${target}.update`;
        fs.writeFileSync(temp, bytes);
        staged.push([temp, target]);
      }
      for (const [temp, target] of staged) fs.renameSync(temp, target);
    } catch (err) {
      for (const [temp] of staged) fs.rmSync(temp, { force: true });
      throw new UpdateError(`Couldn't write the update (${err.code ?? err.message}). Is Orbit's folder read only?`);
    }
    return update;
  }
}

/** Opens a folder in the PC's file manager. */
export function openFolder(dir) {
  const command = process.platform === 'win32' ? ['explorer', [dir]] : process.platform === 'darwin' ? ['open', [dir]] : ['xdg-open', [dir]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // No file manager available; the path is shown in the app anyway.
  }
}
