import type { Database, SqlJsStatic, SqlValue } from "sql.js";

/**
 * SQLite on the phone via sql.js (SQLite compiled to WebAssembly).
 * The whole database lives in memory and is saved to the app's private
 * storage shortly after every change, and again when the app is paused.
 */

export interface BlobStore {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     role TEXT NOT NULL CHECK (role IN ('user','assistant')),
     content TEXT NOT NULL,
     meta TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE memory_snapshots (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     content TEXT NOT NULL,
     reason TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE TABLE memory_suggestions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     section TEXT NOT NULL,
     text TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','saved','dismissed')),
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
];

const FILE = "lyra.db";

export class DB {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();

  private constructor(
    private db: Database,
    private store?: BlobStore,
    private saveDelay = 400,
  ) {}

  static async open(SQL: SqlJsStatic, store?: BlobStore): Promise<DB> {
    const bytes = store ? await store.read(FILE) : null;
    const db = new DB(bytes ? new SQL.Database(bytes) : new SQL.Database(), store);
    db.db.run("PRAGMA foreign_keys = ON");
    db.migrate();
    return db;
  }

  private migrate() {
    const version = Number(this.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0);
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.run("BEGIN");
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.run(`PRAGMA user_version = ${v + 1}`);
        this.db.run("COMMIT");
      } catch (e) {
        this.db.run("ROLLBACK");
        throw e;
      }
    }
    if (version < MIGRATIONS.length) this.changed();
  }

  all<T>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Run a statement that changes data. Returns RETURNING rows, if any. */
  run<T = unknown>(sql: string, params: SqlValue[] = []): T | undefined {
    const row = this.get<T>(sql, params);
    this.changed();
    return row;
  }

  private changed() {
    if (!this.store) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.saveDelay);
  }

  /** Save now (e.g. when the app goes to the background). */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.store) return;
    const store = this.store;
    const bytes = this.db.export();
    this.saving = this.saving.then(() => store.write(FILE, bytes)).catch((e) => console.error("[lyra] save failed", e));
    await this.saving;
  }

  close() {
    this.db.close();
  }
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  meta: MessageMeta;
  created_at: string;
}

export interface MemoryNote {
  kind: "saved" | "removed" | "suggested" | "dismissed";
  section: string;
  text: string;
  undone?: boolean;
  snapshotId?: number;
  suggestionId?: number;
}

export interface MessageMeta {
  memory?: MemoryNote[];
  tools?: { name: string; ok: boolean }[];
  provider?: string;
  model?: string;
  error?: boolean;
}

type Row = Omit<StoredMessage, "meta"> & { meta: string };
const parse = (r: Row): StoredMessage => ({ ...r, meta: JSON.parse(r.meta) });

export function addMessage(db: DB, role: StoredMessage["role"], content: string, meta: MessageMeta = {}): StoredMessage {
  return parse(db.run<Row>("INSERT INTO messages (role, content, meta) VALUES (?, ?, ?) RETURNING *", [role, content, JSON.stringify(meta)])!);
}

export function updateMessageMeta(db: DB, id: number, meta: MessageMeta): void {
  db.run("UPDATE messages SET meta = ? WHERE id = ?", [JSON.stringify(meta), id]);
}

export function getMessage(db: DB, id: number): StoredMessage | undefined {
  const row = db.get<Row>("SELECT * FROM messages WHERE id = ?", [id]);
  return row && parse(row);
}

/** Most recent messages, oldest first. `before` pages further back by id. */
export function listMessages(db: DB, limit = 50, before?: number): StoredMessage[] {
  const rows = before
    ? db.all<Row>("SELECT * FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?", [before, limit])
    : db.all<Row>("SELECT * FROM messages ORDER BY id DESC LIMIT ?", [limit]);
  return rows.reverse().map(parse);
}

export function getSetting(db: DB, key: string): string | undefined {
  return db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}
