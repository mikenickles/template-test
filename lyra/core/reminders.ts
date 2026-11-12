/**
 * Reminders and follow-ups: one-off moments in the future.
 *  - remind:    tell the user something at a time ("call Dad at 4"). A phone notification
 *               is scheduled ahead, so it arrives even when Lyra is closed; a message lands in chat.
 *  - follow_up: Lyra checks back on something left open ("did the plumber reply?") at a time,
 *               using its tools, and posts a short update.
 */
import type { DB } from "./db.ts";

export type ReminderKind = "remind" | "follow_up";

export interface Reminder {
  id: number;
  kind: ReminderKind;
  text: string;
  /** UTC ISO */
  due_at: string;
  channel_id: number | null;
  status: "pending" | "done" | "cancelled";
  created_at: string;
  done_at: string | null;
  message_id: number | null;
  channel_name?: string | null;
}

const ROW = `SELECT r.*, c.name AS channel_name FROM reminders r LEFT JOIN channels c ON c.id = r.channel_id`;

/** Offset of a time zone from UTC at a moment, in minutes (e.g. -480 for Los Angeles in winter). */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-11-12 16:00" (or with a T) in the user's time zone → a Date. Null if it doesn't parse. */
export function localToDate(local: string, timeZone?: string): Date | null {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // twice, so a time near a daylight-saving change settles on the right offset
  let t = guess - zoneOffset(new Date(guess), tz) * 60_000;
  t = guess - zoneOffset(new Date(t), tz) * 60_000;
  return new Date(t);
}

/** "Thu 4:00 PM" / "Nov 20, 9:00 AM" for the user, in their zone. */
export function describeDue(at: Date, timeZone?: string, now = new Date()): string {
  const sameWeek = at.getTime() - now.getTime() < 6 * 86400_000;
  return at.toLocaleString("en-US", sameWeek ? { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" } : { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function createReminder(db: DB, input: { kind: ReminderKind; text: string; at: Date; channelId: number | null }, now = new Date()): Reminder {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) throw new Error("Say what the reminder is for.");
  if (Number.isNaN(input.at.getTime())) throw new Error("That time doesn't look right. Use YYYY-MM-DD HH:MM.");
  if (input.at.getTime() < now.getTime() + 30_000) throw new Error("That time has already passed. Pick a time in the future.");
  if (input.at.getTime() > now.getTime() + 366 * 86400_000) throw new Error("Reminders can be up to a year ahead.");
  if (db.get<{ n: number }>("SELECT count(*) AS n FROM reminders WHERE status = 'pending'")!.n >= 50) throw new Error("There are already 50 reminders waiting. Cancel some first.");
  const row = db.run<{ id: number }>("INSERT INTO reminders (kind, text, due_at, channel_id) VALUES (?, ?, ?, ?) RETURNING id", [
    input.kind,
    text,
    input.at.toISOString(),
    input.channelId,
  ])!;
  return getReminder(db, row.id)!;
}

export function getReminder(db: DB, id: number): Reminder | undefined {
  return db.get<Reminder>(`${ROW} WHERE r.id = ?`, [id]);
}

export function pendingReminders(db: DB): Reminder[] {
  return db.all<Reminder>(`${ROW} WHERE r.status = 'pending' ORDER BY r.due_at`);
}

export function dueReminders(db: DB, now = new Date()): Reminder[] {
  return db.all<Reminder>(`${ROW} WHERE r.status = 'pending' AND r.due_at <= ? ORDER BY r.due_at`, [now.toISOString()]);
}

export function cancelReminder(db: DB, id: number): Reminder {
  const r = getReminder(db, id);
  if (!r) throw new Error(`There's no reminder #${id}.`);
  if (r.status !== "pending") throw new Error(`Reminder #${id} has already ${r.status === "done" ? "happened" : "been cancelled"}.`);
  db.run("UPDATE reminders SET status = 'cancelled', done_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
  return getReminder(db, id)!;
}

export function finishReminder(db: DB, id: number, messageId: number | null): void {
  db.run("UPDATE reminders SET status = 'done', done_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), message_id = ? WHERE id = ?", [messageId, id]);
}

/** One line per pending reminder, for the model. */
export function describeReminders(list: Reminder[], timeZone?: string): string {
  return list
    .map((r) => `- #${r.id} ${r.kind === "remind" ? "Reminder" : "Follow-up"} ${describeDue(new Date(r.due_at), timeZone)}: ${r.text}${r.channel_name ? ` (in ${r.channel_name})` : ""}`)
    .join("\n");
}
