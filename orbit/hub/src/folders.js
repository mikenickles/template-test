import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_READ_CHARS = 100_000;
const MAX_READ_FILE_BYTES = 5_000_000;
const MAX_LISTED = 300;
const MAX_MATCHES = 40;
const MAX_SCANNED_FILES = 4000;
const MAX_SEARCHED_FILE_BYTES = 1_000_000;

/** Never shown to agents, even inside a shared folder: settings, caches, and anything starting with a dot. */
const PRIVATE_NAMES = new Set(['appdata', '$recycle.bin', 'system volume information', 'node_modules']);
const isPrivate = (name) => name.startsWith('.') || PRIVATE_NAMES.has(name.toLowerCase());

/** Inside `parent`, or `parent` itself. Both paths must already be resolved. */
function isWithin(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

export class FolderError extends Error {
  name = 'FolderError';
}

/**
 * Folders on the PC that agents may read. Sharing happens on the PC itself (the hub's local page), so a
 * paired phone can stop sharing a folder but never open up a new one. Agents only ever see a folder's
 * name and what is inside it, read only, and nothing outside it: paths are resolved through symlinks
 * and checked against the folder before anything is opened.
 */
export class Folders {
  /**
   * @param {{id: string, name: string, path: string}[]} saved  The `folders` section of config.json.
   * @param {{onChange?: (folders: object[]) => void, protect?: string[]}} options  `protect` lists paths
   *   agents must never read, such as the hub's own data folder with its API keys.
   */
  constructor(saved = [], { onChange = () => {}, protect = [] } = {}) {
    this.items = Array.isArray(saved) ? saved.filter((f) => f?.id && f?.name && f?.path) : [];
    this.onChange = onChange;
    this.protect = protect.map((p) => (existsSync(p) ? realpathSync(p) : path.resolve(p)));
  }

  list() {
    return this.items.map(({ id, name, path: where }) => ({ id, name, path: where }));
  }

  /** Shares a folder. Refuses drives, the home folder itself, and anything holding the hub's settings. */
  add(input) {
    const raw = String(input ?? '').trim().replace(/^"(.*)"$/, '$1');
    if (!raw || !path.isAbsolute(raw)) throw new FolderError('Choose a folder by its full path, like C:\\Users\\you\\Documents.');
    let real;
    try {
      real = realpathSync(raw);
      if (!statSync(real).isDirectory()) throw new FolderError('That is a file, not a folder.');
    } catch (err) {
      if (err instanceof FolderError) throw err;
      throw new FolderError("That folder doesn't exist on this PC.");
    }
    if (path.parse(real).root === real) throw new FolderError('Share a folder, not a whole drive.');
    if (real === path.resolve(os.homedir())) {
      throw new FolderError('Share a folder inside your user folder, like Documents, rather than all of it.');
    }
    if (this.protect.some((p) => isWithin(p, real) || isWithin(real, p))) {
      throw new FolderError("That folder holds Treehouse's own settings, so it can't be shared.");
    }
    const existing = this.items.find((f) => f.path === real);
    if (existing) return existing;
    // Agents address folders by name, so names stay unique: "Documents", "Documents 2".
    const base = path.basename(real).replace(/[\\/]/g, '') || 'Folder';
    let name = base;
    for (let n = 2; this.items.some((f) => f.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
    const folder = { id: crypto.randomUUID(), name, path: real };
    this.items.push(folder);
    this.onChange(this.list());
    return folder;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((f) => f.id !== id);
    if (this.items.length !== before) this.onChange(this.list());
    return this.items.length !== before;
  }

  /**
   * Maps an agent's path ("Notes/trips/japan.md") to a real path inside a shared folder. Anything that
   * would leave the folder, through ".." or a link, is refused.
   */
  async resolve(virtual) {
    const clean = String(virtual ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean) return null;
    const [head, ...rest] = clean.split('/').filter((s) => s && s !== '.');
    if (!head) return null;
    const folder = this.items.find((f) => f.name.toLowerCase() === head.toLowerCase());
    if (!folder) {
      throw new FolderError(`There is no shared folder called "${head}". Shared folders: ${this.#names()}.`);
    }
    if (rest.includes('..')) throw new FolderError('Paths must stay inside a shared folder.');
    let root;
    try {
      root = await fs.realpath(folder.path);
    } catch {
      throw new FolderError(`The shared folder "${folder.name}" is no longer on the PC.`);
    }
    let real;
    try {
      real = await fs.realpath(path.join(root, ...rest));
    } catch {
      throw new FolderError(`Nothing is at "${clean}".`);
    }
    if (!isWithin(real, root)) throw new FolderError('Paths must stay inside a shared folder.');
    const parts = path.relative(root, real).split(path.sep).filter(Boolean);
    if (parts.some(isPrivate) || this.protect.some((p) => isWithin(real, p))) {
      throw new FolderError(`"${clean}" is private and can't be read.`);
    }
    return { folder, root, real, virtual: [folder.name, ...parts].join('/') };
  }

  #names() {
    return this.items.map((f) => f.name).join(', ') || 'none';
  }

  /** What is in a folder, or the shared folders themselves for an empty path. */
  async listFiles(virtual) {
    const at = await this.resolve(virtual);
    if (!at) {
      if (!this.items.length) return 'The user has not shared any folders.';
      return ['Shared folders:', ...this.items.map((f) => `${f.name}/`)].join('\n');
    }
    const stat = await fs.stat(at.real);
    if (!stat.isDirectory()) return `${at.virtual} is a file (${size(stat.size)}). Use read_file to read it.`;
    const entries = (await fs.readdir(at.real, { withFileTypes: true })).filter((e) => !isPrivate(e.name));
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const lines = [];
    for (const entry of entries.slice(0, MAX_LISTED)) {
      if (entry.isDirectory()) {
        lines.push(`${entry.name}/`);
        continue;
      }
      const info = await fs.stat(path.join(at.real, entry.name)).catch(() => null);
      lines.push(info ? `${entry.name}  (${size(info.size)}, ${info.mtime.toISOString().slice(0, 10)})` : entry.name);
    }
    if (entries.length > MAX_LISTED) lines.push(`…and ${entries.length - MAX_LISTED} more`);
    return [`${at.virtual}/`, ...(lines.length ? lines : ['(empty)'])].join('\n');
  }

  /** A text file's contents from `startLine` on, in pages that fit comfortably in a reply. */
  async readFile(virtual, startLine = 1) {
    const at = await this.resolve(virtual);
    if (!at) throw new FolderError('Give the path of a file, like "Notes/todo.md".');
    const stat = await fs.stat(at.real);
    if (stat.isDirectory()) throw new FolderError(`${at.virtual} is a folder. Use list_files to see what is in it.`);
    const handle = await fs.open(at.real, 'r');
    let bytes;
    try {
      const length = Math.min(stat.size, MAX_READ_FILE_BYTES);
      bytes = Buffer.alloc(length);
      await handle.read(bytes, 0, length, 0);
    } finally {
      await handle.close();
    }
    if (looksBinary(bytes)) {
      throw new FolderError(`${at.virtual} isn't a text file (${path.extname(at.real) || 'no extension'}, ${size(stat.size)}), so it can't be read.`);
    }
    const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    const first = Math.max(1, Math.floor(startLine) || 1);
    if (first > lines.length) return `${at.virtual} has only ${lines.length} lines.`;
    // Whole lines up to the page size; a single huge line (minified files) is cut at the page size.
    let end = first - 1;
    let used = 0;
    do used += lines[end++].length + 1;
    while (end < lines.length && used + lines[end].length < MAX_READ_CHARS);
    const body = lines.slice(first - 1, end).join('\n').slice(0, MAX_READ_CHARS);
    const header = `${at.virtual}, lines ${first}–${end} of ${lines.length}${stat.size > MAX_READ_FILE_BYTES ? '+' : ''}`;
    const footer = end < lines.length ? `\n[More below. Call read_file with start_line ${end + 1} to continue.]` : '';
    return `${header}\n\n${body}${footer}`;
  }

  /** File names and lines containing `query`, across one folder or all of them. */
  async searchFiles(query, virtual) {
    const needle = String(query).toLowerCase();
    const starts = virtual ? [await this.resolve(virtual)] : await Promise.all(this.items.map((f) => this.resolve(f.name).catch(() => null)));
    const matches = [];
    let scanned = 0;
    const queue = starts.filter(Boolean).map((s) => ({ real: s.real, virtual: s.virtual }));
    while (queue.length && matches.length < MAX_MATCHES && scanned < MAX_SCANNED_FILES) {
      const dir = queue.shift();
      const entries = await fs.readdir(dir.real, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (isPrivate(entry.name) || entry.isSymbolicLink()) continue;
        const child = { real: path.join(dir.real, entry.name), virtual: `${dir.virtual}/${entry.name}` };
        if (entry.isDirectory()) {
          queue.push(child);
          continue;
        }
        if (!entry.isFile() || ++scanned > MAX_SCANNED_FILES) continue;
        if (entry.name.toLowerCase().includes(needle)) matches.push(`${child.virtual}  (name matches)`);
        const stat = await fs.stat(child.real).catch(() => null);
        if (!stat || stat.size > MAX_SEARCHED_FILE_BYTES) continue;
        const bytes = await fs.readFile(child.real).catch(() => null);
        if (!bytes || looksBinary(bytes)) continue;
        const lines = bytes.toString('utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
          if (lines[i].toLowerCase().includes(needle)) matches.push(`${child.virtual}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
        if (matches.length >= MAX_MATCHES) break;
      }
    }
    if (!matches.length) return `Nothing in the shared folders mentions "${query}".`;
    const more = matches.length >= MAX_MATCHES ? '\n[Stopped at the first matches. Search a single folder or a more exact phrase for others.]' : '';
    return matches.join('\n') + more;
  }
}

function looksBinary(bytes) {
  return bytes.subarray(0, 8000).includes(0);
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client tools that let a model read shared folders. Their inputs are validated in runFolderTool. */
export const FOLDER_TOOLS = [
  {
    name: 'list_files',
    description:
      'List what is inside a folder the user shared from their PC. Pass an empty path to see the shared folders, ' +
      'then paths like "Notes" or "Notes/trips". Read only.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Folder path, starting with a shared folder name. Empty for the top level.' } },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read a text file from a folder the user shared, like "Notes/trips/japan.md". Long files come back a page at a ' +
      'time; pass start_line to read further. Read only.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, starting with a shared folder name.' },
        start_line: { type: 'integer', minimum: 1, description: 'First line to read. Defaults to 1.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Find files whose name or text contains a phrase, across the shared folders or inside one of them.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to look for. Not case sensitive.' },
        path: { type: 'string', description: 'Optional folder to search inside, like "Notes".' },
      },
      required: ['query'],
    },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

/** What a folder tool call shows in the chat: a kind of activity and its detail. */
export const FOLDER_ACTIVITY = { list_files: 'folder', read_file: 'file', search_files: 'find' };

/**
 * Runs one folder tool call. Inputs arrive unvalidated (eager input streaming), so each field is checked
 * here before anything touches the disk. Returns the tool result text, and whether it is an error.
 */
export async function runFolderTool(folders, name, input) {
  const fields = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  const isText = (v, max) => typeof v === 'string' && v.length <= max;
  try {
    if (!fields) throw new FolderError(JSON.stringify({ INVALID_JSON: JSON.stringify(input ?? null) }));
    switch (name) {
      case 'list_files':
        if (fields.path !== undefined && !isText(fields.path, 1000)) throw new FolderError('path must be text.');
        return { text: await folders.listFiles(fields.path ?? ''), isError: false };
      case 'read_file': {
        if (!isText(fields.path, 1000) || !fields.path.trim()) throw new FolderError('path must be the path of a file.');
        const start = fields.start_line ?? 1;
        if (!Number.isInteger(start) || start < 1) throw new FolderError('start_line must be a whole number from 1.');
        return { text: await folders.readFile(fields.path, start), isError: false };
      }
      case 'search_files':
        if (!isText(fields.query, 200) || !fields.query.trim()) throw new FolderError('query must be a short piece of text.');
        if (fields.path !== undefined && !isText(fields.path, 1000)) throw new FolderError('path must be text.');
        return { text: await folders.searchFiles(fields.query.trim(), fields.path?.trim() || ''), isError: false };
      default:
        throw new FolderError(`Unknown tool "${name}".`);
    }
  } catch (err) {
    if (err instanceof FolderError) return { text: err.message, isError: true };
    if (err?.code === 'EACCES' || err?.code === 'EPERM') return { text: "The PC didn't allow reading that.", isError: true };
    throw err;
  }
}
