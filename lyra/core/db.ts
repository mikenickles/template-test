import { PLACE_MIGRATION } from "./places.ts";
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

export const MIGRATIONS: string[] = [
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
  // Phase 2: channels, each with its own chat and notebook.
  `CREATE TABLE channels (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     icon TEXT NOT NULL DEFAULT 'star',
     about TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE UNIQUE INDEX channels_name ON channels (name COLLATE NOCASE);
   ALTER TABLE messages ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE;
   CREATE INDEX messages_channel ON messages (channel_id, id);
   ALTER TABLE memory_snapshots ADD COLUMN scope TEXT NOT NULL DEFAULT 'main';
   ALTER TABLE memory_suggestions ADD COLUMN scope TEXT NOT NULL DEFAULT 'main';`,
  // Phase 3: tasks you hand off, with steps and a log.
  `CREATE TABLE tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     brief TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'up_next' CHECK (status IN ('up_next','working','ready','stopped','done')),
     needs TEXT NOT NULL DEFAULT '',
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     done_at TEXT
   );
   CREATE INDEX tasks_status ON tasks (status, updated_at);
   CREATE TABLE task_steps (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     text TEXT NOT NULL,
     done INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE task_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     who TEXT NOT NULL CHECK (who IN ('you','lyra','worker')),
     text TEXT NOT NULL
   );`,
  // Phase 4: background workers, one run per attempt at a task.
  `CREATE TABLE worker_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','finished','failed','stopped')),
     steps INTEGER NOT NULL DEFAULT 0,
     transcript TEXT NOT NULL DEFAULT '[]',
     started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     ended_at TEXT
   );
   CREATE INDEX worker_runs_task ON worker_runs (task_id, id);`,
  // Phase 6: routines that run on a schedule and post only when there's news.
  `CREATE TABLE routines (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     instructions TEXT NOT NULL,
     times TEXT NOT NULL,
     days TEXT NOT NULL DEFAULT '0123456',
     post_mode TEXT NOT NULL DEFAULT 'news' CHECK (post_mode IN ('always','news')),
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     enabled INTEGER NOT NULL DEFAULT 1,
     next_run_at TEXT,
     last_run_at TEXT,
     last_summary TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE TABLE routine_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
     started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     ended_at TEXT,
     status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','posted','quiet','failed','missed')),
     message_id INTEGER,
     note TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX routine_runs_routine ON routine_runs (routine_id, id);`,
  `CREATE TABLE usage (
     day TEXT NOT NULL,
     provider TEXT NOT NULL,
     model TEXT NOT NULL,
     source TEXT NOT NULL,
     requests INTEGER NOT NULL DEFAULT 0,
     input INTEGER NOT NULL DEFAULT 0,
     output INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, provider, model, source)
   );`,
  `CREATE TABLE reminders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('remind','follow_up')),
     text TEXT NOT NULL,
     due_at TEXT NOT NULL,
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     done_at TEXT,
     message_id INTEGER
   );
   CREATE INDEX reminders_due ON reminders (status, due_at);`,
  // Phase 9: emails and events Lyra proposes; done only after the user's tap
  `CREATE TABLE actions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('email','event')),
     status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','working','done','declined')),
     payload TEXT NOT NULL,
     result TEXT,
     error TEXT,
     tainted INTEGER NOT NULL DEFAULT 0,
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     decided_at TEXT
   );`,
  // the redesign: a card's chat message (for "jump to it"), and tasks put off until later
  `ALTER TABLE actions ADD COLUMN message_id INTEGER;
   ALTER TABLE tasks ADD COLUMN snoozed_until TEXT;`,
  // Phase 10: people who matter, as cards
  `CREATE TABLE people (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     aliases TEXT NOT NULL DEFAULT '[]',
     emails TEXT NOT NULL DEFAULT '[]',
     phones TEXT NOT NULL DEFAULT '[]',
     relation TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
  // Phase 13: docs Lyra writes for you
  `CREATE TABLE docs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     tainted INTEGER NOT NULL DEFAULT 0,
     gdoc_id TEXT,
     gdoc_link TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
  // Phase 14: playlists join emails and events as things done only on the user's tap
  `CREATE TABLE actions_next (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('email','event','playlist')),
     status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','working','done','declined')),
     payload TEXT NOT NULL,
     result TEXT,
     error TEXT,
     tainted INTEGER NOT NULL DEFAULT 0,
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     decided_at TEXT,
     message_id INTEGER
   );
   INSERT INTO actions_next (id, kind, status, payload, result, error, tainted, channel_id, created_at, decided_at, message_id)
     SELECT id, kind, status, payload, result, error, tainted, channel_id, created_at, decided_at, message_id FROM actions;
   DROP TABLE actions;
   ALTER TABLE actions_next RENAME TO actions;`,
  // Phase 15: research tasks, and the report doc a task's worker wrote
  `ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task';
   ALTER TABLE docs ADD COLUMN task_id INTEGER;`,
  // Phase 17: skills, how the user wants particular jobs done
  `CREATE TABLE skills (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     use_when TEXT NOT NULL,
     steps TEXT NOT NULL,
     uses INTEGER NOT NULL DEFAULT 0,
     last_used_at TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
  // Phase 18: life admin (bills, subscriptions, packages, trips, returns found in the inbox)
  `CREATE TABLE admin_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('bill','subscription','package','trip','return')),
     title TEXT NOT NULL,
     who TEXT NOT NULL,
     amount REAL,
     currency TEXT,
     due_on TEXT,
     end_on TEXT,
     every TEXT,
     detail TEXT NOT NULL DEFAULT '',
     thread TEXT NOT NULL,
     key TEXT NOT NULL UNIQUE,
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
     notified TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE INDEX admin_items_open ON admin_items (status, due_on);`,
  // the activity log: jobs Lyra does unasked that leave no other record
  `CREATE TABLE activity_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     summary TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     ended_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
  // Artifacts: docs are one kind; dashboards (JSON in body) another. A dashboard can keep
  // the instructions to rebuild it with fresh data.
  `ALTER TABLE docs ADD COLUMN kind TEXT NOT NULL DEFAULT 'doc';
   ALTER TABLE docs ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
   ALTER TABLE docs ADD COLUMN refreshed_at TEXT;`,
  // place reminders (geofences on the phone)
  PLACE_MIGRATION,
  // 0.48: a routine can start from something happening (an email, a place, a notification) instead of the clock
  `ALTER TABLE routines ADD COLUMN starts_on TEXT NOT NULL DEFAULT '';`,
  // 0.45: moving events, answering invitations, archiving mail and writing texts join the cards
  `CREATE TABLE actions_next (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('email','event','playlist','move','rsvp','archive','text')),
     status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','working','done','declined')),
     payload TEXT NOT NULL,
     result TEXT,
     error TEXT,
     tainted INTEGER NOT NULL DEFAULT 0,
     channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     decided_at TEXT,
     message_id INTEGER
   );
   INSERT INTO actions_next (id, kind, status, payload, result, error, tainted, channel_id, created_at, decided_at, message_id)
     SELECT id, kind, status, payload, result, error, tainted, channel_id, created_at, decided_at, message_id FROM actions;
   DROP TABLE actions;
   ALTER TABLE actions_next RENAME TO actions;`,
];

const FILE = "lyra.db";

export class DB {
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Called after any change to the data (sync uses it to know there's something to send). */
  onWrite?: () => void;
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
    // An UPDATE or DELETE that matched nothing changed nothing: don't save, and don't tell sync there's
    // something new (a once-a-minute tidy-up would otherwise upload a fresh copy every minute).
    if (!/^\s*(update|delete)\b/i.test(sql) || this.db.getRowsModified() > 0) this.changed();
    return row;
  }

  private changed() {
    this.onWrite?.();
    if (!this.store) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.saveDelay);
  }

  /** The whole database as a file (for backups). */
  exportBytes(): Uint8Array {
    return this.db.export();
  }

  /** Stop saving to disk: used just before a restore replaces the file underneath. */
  async detach(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.saving;
    this.store = undefined;
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
  /** null for the main chat ("Everything") */
  channel_id: number | null;
}

export interface MemoryNote {
  kind: "saved" | "removed" | "suggested" | "dismissed";
  /** Which notebook: "main" or "channel:<id>". Missing means main (older notes). */
  notebook?: string;
  /** Shown to the user: "Memory" or the channel's name. */
  notebookLabel?: string;
  section: string;
  text: string;
  undone?: boolean;
  snapshotId?: number;
  suggestionId?: number;
}

/** A task Lyra created or changed during a reply, shown under it. */
export interface TaskNote {
  id: number;
  title: string;
  kind: "created" | "updated";
  status: string;
}

export interface MessageMeta {
  memory?: MemoryNote[];
  tasks?: TaskNote[];
  tools?: { name: string; ok: boolean }[];
  provider?: string;
  model?: string;
  error?: boolean;
  /** Posted by a background worker rather than in reply to a message. */
  worker?: boolean;
  /** Web pages the reply drew on. */
  sources?: { url: string; title: string }[];
  /** Posted by a scheduled routine. */
  routine?: { id: number; name: string };
  /** On a user's message: the emoji Lyra reacted with. */
  reaction?: string;
  /** Pinned by the user, to find again on the chat's info page. */
  pinned?: boolean;
  /** On Lyra's reply: the user's thumbs up or down, and what was off. Feeds how Lyra learns to talk to them. */
  feedback?: { rating: "up" | "down"; why?: string; at: string };
  /** Said aloud in a live voice call. */
  voice?: boolean;
  /** Posted by a reminder or a follow-up Lyra set. */
  reminder?: { id: number; kind: "remind" | "follow_up" };
  /** Emails and events proposed in this reply (cards with Send / Add, done only on the user's tap). */
  actions?: number[];
  /** Lyra checking in when things are quiet: a question, or an offer of something to take on. */
  checkIn?: boolean;
  /** The weekly memory tidy-up: the version to go back to, and whether it was undone. */
  tidy?: { snapshotId: number; undone?: boolean };
  /** Skills used or saved in this reply (Phase 17). */
  skills?: { id: number; name: string; kind: "used" | "saved" }[];
  /** An inbox triage card (Phase 16). */
  triage?: import("./triage.ts").Triage;
  /** Docs written or updated in this reply. */
  docs?: { id: number; title: string; created: boolean; kind?: "doc" | "dashboard" }[];
  /** this post reached a phone by push (set on the home base) */
  pushed?: boolean;
  /** a place reminder that went off */
  placeReminder?: { id: number; place: string };
  /** a widget under the reply: choices to tap, a checklist to tick, or a place card (0.48) */
  widget?: import("./widgets.ts").Widget;
  /** what's on a scanned paper, with what the user did about each item */
  scan?: import("./scan.ts").Scan;
  /** People cards added or updated in this reply. */
  people?: { id: number; name: string; created: boolean }[];
  /** Posted by a heads-up check Lyra ran on its own. */
  headsUp?: boolean;
  /** Life admin heads-up (Phase 18): the items it was about */
  lifeAdmin?: { ids: number[] };
  /** Next steps Lyra offers as buttons (only on its latest reply). */
  suggestions?: string[];
  /** Photos and files sent with this message (a note each; the file itself isn't kept). */
  attachments?: import("./attachments.ts").AttachmentNote[];
}

type Row = Omit<StoredMessage, "meta"> & { meta: string };
const parse = (r: Row): StoredMessage => ({ ...r, meta: JSON.parse(r.meta) });

export function addMessage(
  db: DB,
  role: StoredMessage["role"],
  content: string,
  meta: MessageMeta = {},
  channelId: number | null = null,
): StoredMessage {
  return parse(
    db.run<Row>("INSERT INTO messages (role, content, meta, channel_id) VALUES (?, ?, ?, ?) RETURNING *", [
      role,
      content,
      JSON.stringify(meta),
      channelId,
    ])!,
  );
}

export function updateMessageMeta(db: DB, id: number, meta: MessageMeta): void {
  db.run("UPDATE messages SET meta = ? WHERE id = ?", [JSON.stringify(meta), id]);
}

export function deleteMessage(db: DB, id: number): void {
  db.run("DELETE FROM messages WHERE id = ?", [id]);
}

/** Pinned messages in a chat, newest first. */
export function pinnedMessages(db: DB, channelId: number | null): StoredMessage[] {
  const where = channelId === null ? "channel_id IS NULL" : "channel_id = ?";
  return db
    .all<Row>(`SELECT * FROM messages WHERE ${where} AND json_extract(meta, '$.pinned') = 1 ORDER BY id DESC`, channelId === null ? [] : [channelId])
    .map(parse);
}

export function getMessage(db: DB, id: number): StoredMessage | undefined {
  const row = db.get<Row>("SELECT * FROM messages WHERE id = ?", [id]);
  return row && parse(row);
}

/** One chat's most recent messages, oldest first. `before` pages further back by id. */
export function listMessages(db: DB, channelId: number | null, limit = 50, before?: number): StoredMessage[] {
  const where = channelId === null ? "channel_id IS NULL" : "channel_id = ?";
  const params: SqlValue[] = channelId === null ? [] : [channelId];
  const rows = before
    ? db.all<Row>(`SELECT * FROM messages WHERE ${where} AND id < ? ORDER BY id DESC LIMIT ?`, [...params, before, limit])
    : db.all<Row>(`SELECT * FROM messages WHERE ${where} ORDER BY id DESC LIMIT ?`, [...params, limit]);
  return rows.reverse().map(parse);
}

// ---------- channels ----------

export interface Channel {
  id: number;
  name: string;
  icon: string;
  about: string;
  created_at: string;
}

export interface ChannelSummary extends Channel {
  message_count: number;
  last_at: string | null;
  last_text: string | null;
}

export function listChannels(db: DB): ChannelSummary[] {
  return db.all<ChannelSummary>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count,
       (SELECT MAX(created_at) FROM messages m WHERE m.channel_id = c.id) AS last_at,
       (SELECT content FROM messages m WHERE m.channel_id = c.id ORDER BY id DESC LIMIT 1) AS last_text
     FROM channels c ORDER BY c.id`,
  );
}

export function getChannel(db: DB, id: number): Channel | undefined {
  return db.get<Channel>("SELECT * FROM channels WHERE id = ?", [id]);
}

export function findChannel(db: DB, name: string): Channel | undefined {
  return db.get<Channel>("SELECT * FROM channels WHERE name = ? COLLATE NOCASE", [name.trim()]);
}

export function getSetting(db: DB, key: string): string | undefined {
  return db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}
