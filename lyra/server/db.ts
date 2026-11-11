import Database from "better-sqlite3";

export type DB = Database.Database;

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

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
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
  const row = db
    .prepare("INSERT INTO messages (role, content, meta) VALUES (?, ?, ?) RETURNING *")
    .get(role, content, JSON.stringify(meta)) as Row;
  return parse(row);
}

export function updateMessageMeta(db: DB, id: number, meta: MessageMeta): void {
  db.prepare("UPDATE messages SET meta = ? WHERE id = ?").run(JSON.stringify(meta), id);
}

export function getMessage(db: DB, id: number): StoredMessage | undefined {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Row | undefined;
  return row && parse(row);
}

/** Most recent messages, oldest first. `before` pages further back by id. */
export function listMessages(db: DB, limit = 50, before?: number): StoredMessage[] {
  const rows = (
    before
      ? db.prepare("SELECT * FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?").all(before, limit)
      : db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT ?").all(limit)
  ) as Row[];
  return rows.reverse().map(parse);
}

export function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
