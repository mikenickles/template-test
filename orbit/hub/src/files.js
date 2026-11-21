import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Largest file a phone may attach. Photos arrive already resized, so this is mostly for PDFs. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Uploads that never made it into a message are removed after this long. */
const UNUSED_MS = 60 * 60 * 1000;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh))/;

/** What a model can do with a file: look at it, read it as a document, or read it as text. */
export function kindOf(type) {
  if (IMAGE_TYPES.has(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (TEXT_TYPES.test(type)) return 'text';
  return null;
}

export class FileError extends Error {
  name = 'FileError';
}

/**
 * Photos and files attached to messages. Bytes live in the hub's data folder, one file per upload;
 * their names and types live in the store's state.
 */
export class Files {
  /** @param {import('./store.js').Store} store */
  constructor(store) {
    this.store = store;
    this.dir = path.join(store.dir, 'files');
    fs.mkdirSync(this.dir, { recursive: true });
    store.state.files ??= {};
  }

  /** Saves an upload. Refuses types no model can read. */
  save(bytes, name, type) {
    const kind = kindOf(type);
    if (!kind) throw new FileError('Treehouse can attach photos, PDFs and text files.');
    if (!bytes.length) throw new FileError('That file is empty.');
    if (bytes.length > MAX_FILE_BYTES) throw new FileError('That file is too large. Attach files up to 20 MB.');
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(this.dir, id), bytes);
    const meta = {
      id,
      name: String(name || 'file').replace(/[\\/\r\n]/g, '').slice(0, 120) || 'file',
      type,
      size: bytes.length,
      createdAt: Date.now(),
    };
    this.store.state.files[id] = meta;
    this.store.save();
    return meta;
  }

  meta(id) {
    return this.store.state.files[id] ?? null;
  }

  read(id) {
    if (!this.meta(id)) return null;
    try {
      return fs.readFileSync(path.join(this.dir, id));
    } catch {
      return null;
    }
  }

  /**
   * Deletes files no message refers to any more: those of deleted messages and rooms, and uploads
   * that were never sent.
   */
  sweep(now = Date.now()) {
    const used = new Set();
    for (const list of Object.values(this.store.state.messages)) {
      for (const m of list) for (const a of m.attachments ?? []) used.add(a.id);
    }
    let removed = 0;
    for (const [id, meta] of Object.entries(this.store.state.files)) {
      if (used.has(id) || now - meta.createdAt < UNUSED_MS) continue;
      fs.rmSync(path.join(this.dir, id), { force: true });
      delete this.store.state.files[id];
      removed++;
    }
    if (removed) this.store.save();
    return removed;
  }
}
