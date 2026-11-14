/**
 * Taking the home base's own work into this device's data (0.49).
 *
 * Sync hands whole snapshots back and forth, so when the home base (the always-on computer)
 * posted something on its own while a phone was in use, both sides had changed and the phone
 * asked the user to pick one. Nobody should have to: what the home base does unasked is all
 * additions (a heads-up, a routine's post, a fired reminder, what a mail scan found) plus
 * the notes of what it has already done. Those can be copied in.
 *
 * `graftHomeWork` reads another copy of Lyra's database and copies exactly that into this one.
 * If the other copy also holds something a person typed there that this one lacks, it copies
 * nothing and says so: that is a real two-sided change, and the user picks.
 */
import type { Database } from "sql.js";
import type { DB } from "./db.ts";

/** Message marks that mean "Lyra posted this on its own". */
const OWN = ["routine", "headsUp", "checkIn", "lifeAdmin", "tidy", "reminder", "placeReminder"];
/** What the home base has already looked at or done (so it isn't done again from older notes). */
const STAMPS = ["mailWatchAt", "mailWatchSeen", "headsUpAt", "headsUpLast", "checkInAt", "checkInRecent", "lifeAdminAt", "lifeAdminTriedAt", "tidyAt", "styleTriedAt", "triggersAt"];
const DAYS = 3;

function rows<T>(other: Database, sql: string, params: (string | number | null)[] = []): T[] {
  const st = other.prepare(sql);
  try {
    st.bind(params);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    return out;
  } finally {
    st.free();
  }
}
const has = (other: Database, table: string) => rows(other, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length > 0;

export interface Grafted {
  /** a person changed things on the other side too: nothing was copied */
  human: boolean;
  /** Lyra's own posts copied in */
  posts: number;
}

export function graftHomeWork(db: DB, other: Database, now = new Date()): Grafted {
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
  type Msg = { role: string; content: string; meta: string; created_at: string; channel_id: number | null };
  const theirs = rows<Msg>(other, "SELECT role, content, meta, created_at, channel_id FROM messages WHERE created_at > ? ORDER BY id", [since]);
  const mine = new Set(db.all<{ created_at: string; content: string }>("SELECT created_at, content FROM messages WHERE created_at > ?", [since]).map((m) => `${m.created_at}\n${m.content}`));
  const missing = theirs.filter((m) => !mine.has(`${m.created_at}\n${m.content}`));
  const own = (m: Msg) => {
    if (m.role !== "assistant") return false;
    try {
      const meta = JSON.parse(m.meta || "{}") as Record<string, unknown>;
      return OWN.some((k) => meta[k]);
    } catch {
      return false;
    }
  };
  // anything else that's only over there was typed (or answered) there: not ours to merge blindly
  if (missing.some((m) => !own(m))) return { human: true, posts: 0 };
  // the same goes for something made over there by hand: a task, a doc, a channel, a person, a skill
  for (const table of ["tasks", "docs", "channels", "people", "skills"]) {
    try {
      // (matched by id and when it was made: two devices can each make "number 7")
      const there = rows<{ id: number; created_at: string }>(other, `SELECT id, created_at FROM ${table} WHERE created_at > ?`, [since]).map((r) => `${r.id}|${r.created_at}`);
      if (!there.length) continue;
      const here = new Set(db.all<{ id: number; created_at: string }>(`SELECT id, created_at FROM ${table}`).map((r) => `${r.id}|${r.created_at}`));
      if (there.some((k) => !here.has(k))) return { human: true, posts: 0 };
    } catch {
      // an older copy without that table: nothing made there
    }
  }

  const channels = new Set(db.all<{ id: number }>("SELECT id FROM channels").map((c) => c.id));
  for (const m of missing)
    db.run("INSERT INTO messages (role, content, meta, created_at, channel_id) VALUES ('assistant', ?, ?, ?, ?)", [m.content, m.meta, m.created_at, m.channel_id !== null && channels.has(m.channel_id) ? m.channel_id : null]);

  // what it has already looked at
  const stamps = rows<{ key: string; value: string }>(other, `SELECT key, value FROM settings WHERE key IN (${STAMPS.map(() => "?").join(",")}) OR key LIKE 'trigger.seen.%'`, STAMPS);
  for (const s of stamps) {
    const cur = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [s.key])?.value;
    // a time only moves forward; a list is the home base's to keep
    if (cur === s.value || (s.key.endsWith("At") && cur && cur > s.value)) continue;
    db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [s.key, s.value]);
  }

  // routines it ran
  for (const r of rows<{ id: number; name: string; last_run_at: string | null; next_run_at: string | null; last_summary: string }>(other, "SELECT id, name, last_run_at, next_run_at, last_summary FROM routines")) {
    const cur = db.get<{ name: string; last_run_at: string | null }>("SELECT name, last_run_at FROM routines WHERE id = ?", [r.id]);
    if (!cur || cur.name !== r.name || !r.last_run_at || (cur.last_run_at && cur.last_run_at >= r.last_run_at)) continue;
    db.run("UPDATE routines SET last_run_at = ?, last_summary = ?, next_run_at = CASE WHEN next_run_at IS NULL THEN NULL ELSE ? END WHERE id = ?", [r.last_run_at, r.last_summary, r.next_run_at, r.id]);
    const last = db.get<{ at: string | null }>("SELECT MAX(started_at) AS at FROM routine_runs WHERE routine_id = ?", [r.id])?.at ?? "";
    for (const run of rows<{ started_at: string; ended_at: string | null; status: string; note: string }>(other, "SELECT started_at, ended_at, status, note FROM routine_runs WHERE routine_id = ? AND started_at > ? AND status != 'running' ORDER BY id", [r.id, last]))
      db.run("INSERT INTO routine_runs (routine_id, started_at, ended_at, status, note) VALUES (?, ?, ?, ?, ?)", [r.id, run.started_at, run.ended_at, run.status, run.note]);
  }

  // reminders and follow-ups it delivered
  for (const r of rows<{ id: number; text: string; done_at: string | null }>(other, "SELECT id, text, done_at FROM reminders WHERE status = 'done' AND created_at > ?", [new Date(now.getTime() - 60 * 86_400_000).toISOString()]))
    db.run("UPDATE reminders SET status = 'done', done_at = ? WHERE id = ? AND text = ? AND status = 'pending'", [r.done_at, r.id, r.text]);

  // what its mail scan found
  if (has(other, "admin_items")) {
    type Item = { kind: string; title: string; who: string; amount: number | null; currency: string | null; due_on: string | null; end_on: string | null; every: string | null; detail: string; thread: string; key: string; status: string; notified: string | null; created_at: string; updated_at: string };
    for (const i of rows<Item>(other, "SELECT kind, title, who, amount, currency, due_on, end_on, every, detail, thread, key, status, notified, created_at, updated_at FROM admin_items")) {
      const cur = db.get<{ updated_at: string }>("SELECT updated_at FROM admin_items WHERE key = ?", [i.key]);
      if (cur && cur.updated_at >= i.updated_at) continue;
      const v = [i.kind, i.title, i.who, i.amount, i.currency, i.due_on, i.end_on, i.every, i.detail, i.thread, i.status, i.notified, i.updated_at];
      if (cur) db.run("UPDATE admin_items SET kind = ?, title = ?, who = ?, amount = ?, currency = ?, due_on = ?, end_on = ?, every = ?, detail = ?, thread = ?, status = ?, notified = ?, updated_at = ? WHERE key = ?", [...v, i.key]);
      else db.run("INSERT INTO admin_items (kind, title, who, amount, currency, due_on, end_on, every, detail, thread, status, notified, updated_at, key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [...v, i.key, i.created_at]);
    }
  }

  // and its log of what it did
  if (has(other, "activity_log")) {
    const last = db.get<{ at: string | null }>("SELECT MAX(started_at) AS at FROM activity_log")?.at ?? "";
    for (const a of rows<{ kind: string; title: string; summary: string; status: string; detail: string; started_at: string; ended_at: string | null }>(other, "SELECT kind, title, summary, status, detail, started_at, ended_at FROM activity_log WHERE started_at > ? ORDER BY id", [last]))
      db.run("INSERT INTO activity_log (kind, title, summary, status, detail, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [a.kind, a.title, a.summary, a.status, a.detail, a.started_at, a.ended_at]);
  }
  return { human: false, posts: missing.length };
}
