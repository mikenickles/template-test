import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, ensureDataDir } from './config.ts';

const SCHEMA = `
create table if not exists kv (key text primary key, value text not null);
create table if not exists secrets (key text primary key, value blob not null);
create table if not exists messages (
  id integer primary key autoincrement,
  thread text not null default 'main',
  role text not null,
  kind text not null default 'chat',
  content text not null,
  created_at integer not null
);
create index if not exists messages_thread on messages(thread, id);
create table if not exists approvals (
  id text primary key,
  thread text not null,
  tool text not null,
  input text not null,
  card text not null,
  status text not null,
  result text,
  created_at integer not null,
  decided_at integer
);
create table if not exists memories (
  id integer primary key autoincrement,
  text text not null,
  category text not null default 'fact',
  source text not null default 'arlo',
  created_at integer not null
);
create table if not exists tasks (
  id integer primary key autoincrement,
  title text not null,
  instructions text not null,
  once_at integer,
  time text,
  days text,
  next_run integer,
  enabled integer not null default 1,
  last_run integer,
  created_at integer not null
);
create table if not exists activity (
  id integer primary key autoincrement,
  at integer not null,
  tool text not null,
  summary text not null,
  status text not null
);
create table if not exists devices (
  id text primary key,
  name text not null,
  token_hash text not null,
  created_at integer not null,
  last_seen integer
);
create table if not exists notifications (
  id integer primary key autoincrement,
  at integer not null,
  title text not null,
  body text not null
);
create table if not exists payments (
  id integer primary key autoincrement,
  at integer not null,
  amount integer not null,
  currency text not null,
  merchant text not null,
  reason text not null,
  rail text not null,
  status text not null,
  external_id text
);
`;

let handle: DatabaseSync | null = null;

/** Open (once) and return the database. Pass ':memory:' in tests. */
export function openDb(file?: string): DatabaseSync {
  if (handle) return handle;
  if (!file) ensureDataDir();
  handle = new DatabaseSync(file ?? path.join(DATA_DIR, 'arlo.db'));
  handle.exec('pragma journal_mode = wal; pragma foreign_keys = on;');
  handle.exec(SCHEMA);
  return handle;
}

export function db(): DatabaseSync {
  return handle ?? openDb();
}

/** Tests only: drop the current handle so the next openDb() starts clean. */
export function resetDbForTests(): void {
  handle?.close();
  handle = null;
}

export function now(): number {
  return Date.now();
}
