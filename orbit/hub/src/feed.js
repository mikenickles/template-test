import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from './updates.js';

/**
 * Updates published to the user's Google Drive. A small Google Doc holds the manifest: the latest
 * version and where its files are. The hub checks it now and then, downloads what's new into the
 * updates folder, and the user installs from the app, wherever they are. Every file is checked
 * against the manifest's SHA-256 before it's kept.
 *
 * Manifest: { "orbit": "update-feed", "version": "X.Y.Z", "notes": "...",
 *   "hub": { "url", "sha256", "size" },
 *   "app": { "sha256", "size", "parts": [{ "url", "sha256", "size" }] } }
 * The app comes in parts because files uploaded to Drive from Claude's side are capped at about 3 MB.
 */

const MAX_FILE = 200 * 1024 * 1024;
const VERSION = /^\d+\.\d+\.\d+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const EVERY = 6 * 60 * 60 * 1000;

export class FeedError extends Error {
  name = 'FeedError';
}

/** Where this hub looks for updates: config.json's `updates.feed`, else the link packed with the hub. */
export function feedUrl(hubDir, config = {}) {
  if (typeof config.updates?.feed === 'string') return config.updates.feed.trim() || null;
  try {
    const packed = JSON.parse(fs.readFileSync(path.join(hubDir, 'src', 'update-feed.json'), 'utf8'));
    return safeLink(packed.url) ? packed.url : null;
  } catch {
    return null;
  }
}

/** Links must be https, except to this machine (for testing a feed locally). */
const safeLink = (url) => typeof url === 'string' && (url.startsWith('https://') || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url));

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function checkFile(file, label) {
  if (!file || typeof file !== 'object') throw new FeedError(`The update manifest has no ${label}.`);
  if (!safeLink(file.url)) throw new FeedError(`The ${label} link isn't https.`);
  if (!HEX64.test(file.sha256 ?? '')) throw new FeedError(`The ${label} has no SHA-256.`);
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_FILE) throw new FeedError(`The ${label} size is wrong.`);
}

/** The manifest from the Doc's text: the JSON object in it, checked. */
export function parseManifest(text) {
  const raw = String(text ?? '').replace(/^﻿/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let manifest;
  try {
    manifest = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new FeedError("The update manifest isn't readable.");
  }
  if (manifest?.orbit !== 'update-feed' || !VERSION.test(manifest.version ?? '')) throw new FeedError("That isn't a Treehouse update manifest.");
  checkFile(manifest.hub, 'hub package');
  if (!manifest.app || !HEX64.test(manifest.app.sha256 ?? '') || !Array.isArray(manifest.app.parts) || !manifest.app.parts.length) {
    throw new FeedError('The update manifest has no phone app.');
  }
  manifest.app.parts.forEach((part, i) => checkFile(part, `phone app part ${i + 1}`));
  const total = manifest.app.parts.reduce((sum, p) => sum + p.size, 0);
  if (total !== manifest.app.size || total > MAX_FILE) throw new FeedError("The phone app's parts don't add up.");
  return manifest;
}

export class Feed {
  /** @param {{ url: string|null, updates: import('./updates.js').Updates, log?: (line: string) => void }} options */
  constructor({ url, updates, log = () => {} }) {
    this.url = url;
    this.updates = updates;
    this.log = log;
    this.busy = null;
    this.checkedAt = null;
    this.error = null;
    this.latest = null;
  }

  status() {
    return { enabled: Boolean(this.url), checking: Boolean(this.busy), checkedAt: this.checkedAt, error: this.error, latest: this.latest };
  }

  /** Checks now and again at start-up, then every few hours. */
  start() {
    if (!this.url) return;
    setTimeout(() => this.check(), 30_000).unref();
    setInterval(() => this.check(), EVERY).unref();
  }

  /** Looks for a newer version and downloads it. Resolves when done; never throws. */
  check() {
    if (!this.url) return Promise.resolve(this.status());
    this.busy ??= this.#check().finally(() => {
      this.busy = null;
      this.checkedAt = Date.now();
    });
    return this.busy.then(() => this.status());
  }

  async #check() {
    try {
      const manifest = parseManifest((await this.#get(this.url, 1024 * 1024, 'the update manifest')).toString('utf8'));
      this.latest = manifest.version;
      const { version } = manifest;
      const hubFile = path.join(this.updates.dir, `orbit-hub-${version}.zip`);
      const appFile = path.join(this.updates.dir, `orbit-${version}.apk`);
      const newestApp = this.updates.appFile()?.version ?? '0.0.0';
      if (compareVersions(version, this.updates.current) > 0 && !fs.existsSync(hubFile)) {
        this.#keep(hubFile, await this.#fetchFile(manifest.hub, 'the hub package'));
        this.log(`Downloaded Treehouse ${version} for this PC.`);
      }
      if (compareVersions(version, newestApp) > 0) {
        const parts = [];
        for (const [i, part] of manifest.app.parts.entries()) parts.push(await this.#fetchFile(part, `part ${i + 1} of the phone app`));
        const app = Buffer.concat(parts);
        if (sha256(app) !== manifest.app.sha256) throw new FeedError("The phone app's parts don't fit together. It'll be tried again later.");
        this.#keep(appFile, app);
        this.log(`Downloaded Treehouse ${version} for phones.`);
      }
      this.error = null;
    } catch (err) {
      const why = err?.cause?.code || err?.cause?.message || (err?.name === 'TimeoutError' ? 'timed out' : err?.message) || 'no connection';
      this.error = err instanceof FeedError ? err.message : `Couldn't reach Google Drive to check for updates (${why}).`;
      this.log(`Update check: ${this.error}`);
    }
  }

  async #fetchFile(file, label) {
    const bytes = await this.#get(file.url, file.size + 1, label);
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) {
      throw new FeedError(`${label[0].toUpperCase()}${label.slice(1)} didn't download intact. It'll be tried again later.`);
    }
    return bytes;
  }

  async #get(url, max, label) {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new FeedError(`Drive answered ${res.status} for ${label}. Is it shared with anyone who has the link?`);
    // A sign-in or "can't scan for viruses" page instead of the file.
    if (label !== 'the update manifest' && /text\/html/i.test(res.headers.get('content-type') ?? '')) {
      throw new FeedError(`Drive showed a page instead of ${label}. Is it shared with anyone who has the link?`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > max) throw new FeedError(`${label} is bigger than the manifest says.`);
    return bytes;
  }

  /** Writes beside the target, then renames, so the updates folder never holds half a file. */
  #keep(target, bytes) {
    const temp = `${target}.download`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, target);
  }
}
