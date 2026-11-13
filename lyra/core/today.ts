// The redesign's "Today" view, search across every chat, and unread counts.
// All read from what's saved: no model call, so they're instant and free.
import { describeAction, type ActionRow } from "./actions.ts";
import * as LA from "./lifeadmin.ts";
import { awaySince } from "./away.ts";
import type { DB } from "./db.ts";

export interface TodayItem {
  kind: "task" | "action" | "heads_up" | "check_in" | "routine" | "reminder" | "follow_up" | "next_routine" | "admin";
  /** "Ready for you", "Heads-up", "Reminder" */
  label: string;
  text: string;
  /** shown on the right: a time, or "Task" */
  side: string;
  /** needs the user: shown first, as a bright star */
  needs: boolean;
  /** where tapping it goes: an app route ("#/t/3", "#/c/2?m=40") */
  href: string;
}

export interface Today {
  /** how many things need the user */
  needs: number;
  items: TodayItem[];
}

const one = (s: string, max = 120) => {
  const t = s.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};
const chatHref = (channelId: number | null, messageId?: number | null) => `${channelId === null ? "#/" : `#/c/${channelId}`}${messageId ? `?m=${messageId}` : ""}`;

/** "4:00 PM", or "Sat 10:30 AM" when it isn't today. */
export function shortWhen(at: Date, timeZone?: string, now = new Date()): string {
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone });
  const time = at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return day(at) === day(now) ? time : `${at.toLocaleDateString("en-US", { timeZone, weekday: "short" })} ${time}`;
}

/**
 * What matters today, in order: what needs the user (tasks ready, emails/events waiting
 * for their OK), what Lyra said on its own lately, then what's coming up.
 */
export function todayView(db: DB, opts: { timeZone?: string; now?: Date } = {}): Today {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone;
  const needs: TodayItem[] = [];
  for (const t of db.all<{ id: number; title: string; needs: string }>("SELECT id, title, needs FROM tasks WHERE status = 'ready' ORDER BY updated_at DESC LIMIT 4"))
    needs.push({ kind: "task", label: "Ready for you", text: one(t.needs ? `${t.title}: ${t.needs}` : t.title), side: "Task", needs: true, href: `#/t/${t.id}` });
  for (const a of db.all<{ id: number; kind: ActionRow["kind"]; payload: string; channel_id: number | null; message_id: number | null }>(
    "SELECT id, kind, payload, channel_id, message_id FROM actions WHERE status = 'proposed' ORDER BY id DESC LIMIT 3",
  ))
    needs.push({
      kind: "action",
      label: "Waiting for your OK",
      text: one(describeAction({ kind: a.kind, payload: JSON.parse(a.payload) }, tz)),
      side: a.kind === "email" ? "Email" : "Event",
      needs: true,
      href: chatHref(a.channel_id, a.message_id),
    });

  // life admin: bills and return windows closing soon need you; packages and trips are just coming up
  const today = LA.localDay(now, tz);
  const adminSoon: TodayItem[] = [];
  for (const i of LA.listItems(db)) {
    if (!i.due_on) continue;
    const days = Math.round((Date.parse(`${i.due_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    const urgent = (i.kind === "bill" && days <= 3) || (i.kind === "return" && days >= 0 && days <= 3);
    const coming = (i.kind === "package" && days === 0) || (i.kind === "trip" && days >= 0 && days <= 1) || (i.kind === "subscription" && days >= 0 && days <= 2);
    if (!urgent && !coming) continue;
    const item: TodayItem = {
      kind: "admin",
      label: { bill: days < 0 ? "Bill overdue" : "Bill due", subscription: "Renewing", package: "Arriving", trip: "Trip", return: "Return by" }[i.kind],
      text: one(LA.describeItem(i, today)),
      side: LA.whenWord(i.due_on, today),
      needs: urgent,
      href: "#/tasks?admin",
    };
    if (urgent) needs.push(item);
    else adminSoon.push(item);
  }

  // what Lyra posted on its own in the last 12 hours, newest first
  const said: TodayItem[] = awaySince(db, new Date(now.getTime() - 12 * 3600_000).toISOString(), 3)
    .items.filter((i) => i.kind !== "task")
    .reverse()
    .slice(0, 2)
    .map((i) => ({
      kind: i.kind === "heads_up" ? "heads_up" : i.kind === "check_in" ? "check_in" : i.kind === "routine" ? "routine" : i.kind === "reminder" ? "reminder" : "follow_up",
      label: i.label,
      text: i.text,
      side: shortWhen(new Date(i.at), tz, now),
      needs: false,
      href: chatHref(i.channelId, i.messageId),
    }));

  // coming up in the next day: reminders and follow-ups, then the next routine
  const soon = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const upcoming: TodayItem[] = db
    .all<{ kind: string; text: string; due_at: string }>("SELECT kind, text, due_at FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 2", [soon])
    .map((r) => ({
      kind: r.kind === "remind" ? "reminder" : "follow_up",
      label: r.kind === "remind" ? "Reminder" : "Checking back",
      text: one(r.text),
      side: shortWhen(new Date(r.due_at), tz, now),
      needs: false,
      href: "#/tasks",
    }));
  const routine = db.get<{ id: number; name: string; next_run_at: string }>(
    "SELECT id, name, next_run_at FROM routines WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT 1",
    [soon],
  );
  if (routine) upcoming.push({ kind: "next_routine", label: "Next up", text: routine.name, side: shortWhen(new Date(routine.next_run_at), tz, now), needs: false, href: `#/r/${routine.id}` });

  return { needs: needs.length, items: [...needs.slice(0, 4), ...said, ...adminSoon.slice(0, 2), ...upcoming].slice(0, 6) };
}

export interface SearchHit {
  messageId: number;
  channelId: number | null;
  channelName: string | null;
  role: "user" | "assistant";
  at: string;
  /** the words around the match */
  snippet: string;
}

/** Messages containing every word of `q`, in any chat, newest first. */
export function searchMessages(db: DB, q: string, limit = 30): SearchHit[] {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];
  const esc = (w: string) => `%${w.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = db.all<{ id: number; content: string; channel_id: number | null; name: string | null; role: "user" | "assistant"; created_at: string }>(
    `SELECT m.id, m.content, m.channel_id, c.name, m.role, m.created_at FROM messages m LEFT JOIN channels c ON c.id = m.channel_id
     WHERE ${words.map(() => "m.content LIKE ? ESCAPE '\\'").join(" AND ")} ORDER BY m.id DESC LIMIT ?`,
    [...words.map(esc), limit],
  );
  return rows.map((r) => {
    const text = r.content.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
    const at = text.toLowerCase().indexOf(words[0].toLowerCase());
    const start = Math.max(0, at - 40);
    const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 140)}${start + 140 < text.length ? "…" : ""}`;
    return { messageId: r.id, channelId: r.channel_id, channelName: r.name, role: r.role, at: r.created_at, snippet };
  });
}

/**
 * Lyra's messages after the last one seen, per chat ("main" or the channel id).
 * A chat with nothing recorded as seen counts as caught up.
 */
export function unreadCounts(db: DB, seen: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of db.all<{ channel_id: number | null; last: number }>("SELECT channel_id, MAX(id) AS last FROM messages GROUP BY channel_id")) {
    const key = r.channel_id === null ? "main" : String(r.channel_id);
    const from = seen[key];
    if (from === undefined) continue;
    const n = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant' AND id > ? AND channel_id ${r.channel_id === null ? "IS NULL" : "= ?"}`, r.channel_id === null ? [from] : [from, r.channel_id])!.n;
    if (n) out[key] = n;
  }
  return out;
}

/** The newest message id per chat, to mark everything seen. */
export function latestIds(db: DB): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of db.all<{ channel_id: number | null; last: number }>("SELECT channel_id, MAX(id) AS last FROM messages GROUP BY channel_id"))
    out[r.channel_id === null ? "main" : String(r.channel_id)] = r.last;
  return out;
}
