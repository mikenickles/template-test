// Phase 9: things Lyra can do in the world, always with the user's tap first.
// Lyra (the model) only *proposes*: an email or a calendar event, shown as a card in
// the chat with exactly what will happen. The app does it only after the user taps
// Send / Save to Drafts / Add, and the model has no tool that could do it by itself.
import type { DB } from "./db.ts";
import { googleGet } from "./connectors/google-http.ts";
import { NeedsConsentError, type TokenSource } from "./connectors/google.ts";
import { describeDue, localToDate } from "./reminders.ts";

export type ActionKind = "email" | "event";
export type ActionStatus = "proposed" | "working" | "done" | "declined";

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** a Gmail thread id: sent as a reply in that thread */
  replyToThread?: string;
}

export interface EventDraft {
  title: string;
  /** the user's local time, "YYYY-MM-DD HH:MM", or "YYYY-MM-DD" for all-day */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  /** invited by email when the event is added */
  attendees: string[];
}

export interface ActionResult {
  /** "sent" | "drafted" | "added" */
  did: string;
  at: string;
  link?: string;
}

export interface ActionRow {
  id: number;
  kind: ActionKind;
  status: ActionStatus;
  payload: EmailDraft | EventDraft;
  result: ActionResult | null;
  /** the last attempt's error, shown on the card */
  error: string | null;
  /** proposed after reading outside content (email, web) this turn */
  tainted: boolean;
  channel_id: number | null;
  created_at: string;
  decided_at: string | null;
}

const EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[^\s@<>(),;:"\[\]\\]{2,}$/;
/** no line breaks in anything that becomes a header */
const oneLine = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function addresses(v: unknown, what: string): string[] {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : []).map((a) => oneLine(a, 254).replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase()).filter(Boolean);
  for (const a of list) if (!EMAIL.test(a)) throw new Error(`"${a}" isn't an email address (${what}).`);
  return [...new Set(list)];
}

export function checkEmail(input: Record<string, unknown>): EmailDraft {
  const to = addresses(input.to, "to");
  const cc = addresses(input.cc, "cc");
  if (!to.length) throw new Error("Who is it to? Give at least one email address.");
  if (to.length + cc.length > 10) throw new Error("That's more than 10 people. Keep it to 10.");
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 20_000);
  if (!body) throw new Error("The email has no text.");
  const thread = input.reply_to_thread ?? input.replyToThread;
  const replyToThread = thread ? String(thread).trim() : undefined;
  if (replyToThread && !/^[0-9a-f]{6,32}$/i.test(replyToThread)) throw new Error("reply_to_thread must be a thread id from search_mail.");
  const subject = oneLine(input.subject, 200);
  if (!subject && !replyToThread) throw new Error("Give the email a subject.");
  return { to, cc, subject, body, ...(replyToThread ? { replyToThread } : {}) };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function checkEvent(input: Record<string, unknown>, timeZone?: string, now = new Date()): EventDraft {
  const title = oneLine(input.title, 200);
  if (!title) throw new Error("Give the event a title.");
  const start = oneLine(input.start, 20).replace("T", " ");
  let end = oneLine(input.end, 20).replace("T", " ");
  const allDay = DAY.test(start);
  if (allDay) {
    if (!end) end = start;
    if (!DAY.test(end) || end < start) throw new Error("For an all-day event give start and end as YYYY-MM-DD (end is the last day).");
    if (Number.isNaN(new Date(`${start}T12:00:00Z`).getTime())) throw new Error("That date doesn't look right.");
  } else {
    const s = localToDate(start, timeZone);
    if (!s) throw new Error("Give the start as YYYY-MM-DD HH:MM (the user's local time), or YYYY-MM-DD for all day.");
    const e = end ? localToDate(end, timeZone) : new Date(s.getTime() + 60 * 60_000);
    if (!e || e.getTime() <= s.getTime()) throw new Error("The end has to be after the start (YYYY-MM-DD HH:MM).");
    if (e.getTime() - s.getTime() > 14 * 86400_000) throw new Error("That's longer than two weeks. Check the times.");
    if (!end) end = toLocal(e, timeZone);
  }
  const startAt = allDay ? new Date(`${start}T23:59:00Z`) : localToDate(start, timeZone)!;
  if (startAt.getTime() < now.getTime() - 86400_000) throw new Error("That's in the past. Check the date.");
  if (startAt.getTime() > now.getTime() + 2 * 366 * 86400_000) throw new Error("That's more than two years away. Check the date.");
  const attendees = addresses(input.attendees, "attendees");
  if (attendees.length > 20) throw new Error("That's more than 20 people. Keep it to 20.");
  return {
    title,
    start,
    end,
    allDay,
    location: oneLine(input.location, 300),
    description: String(input.description ?? "").trim().slice(0, 4000),
    attendees,
  };
}

/** "2026-11-12 16:00" for a moment, in the user's zone */
function toLocal(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** One line for prompts and lists: what it is, not the whole text. */
export function describeAction(a: Pick<ActionRow, "kind" | "payload">, timeZone?: string): string {
  if (a.kind === "email") {
    const e = a.payload as EmailDraft;
    return `Email to ${e.to.join(", ")}${e.subject ? `: "${e.subject}"` : " (reply)"}`;
  }
  const v = a.payload as EventDraft;
  const when = v.allDay ? (v.end !== v.start ? `${v.start} to ${v.end}` : v.start) : describeDue(localToDate(v.start, timeZone)!, timeZone);
  return `Event "${v.title}", ${when}${v.attendees.length ? `, inviting ${v.attendees.join(", ")}` : ""}`;
}

// ---------- storage ----------

interface Row {
  id: number;
  kind: ActionKind;
  status: ActionStatus;
  payload: string;
  result: string | null;
  error: string | null;
  tainted: number;
  channel_id: number | null;
  created_at: string;
  decided_at: string | null;
}

const parse = (r: Row): ActionRow => ({ ...r, payload: JSON.parse(r.payload), result: r.result ? JSON.parse(r.result) : null, tainted: !!r.tainted });

export function createAction(db: DB, kind: ActionKind, payload: EmailDraft | EventDraft, tainted: boolean, channelId: number | null): ActionRow {
  const r = db.run<Row>("INSERT INTO actions (kind, payload, tainted, channel_id) VALUES (?, ?, ?, ?) RETURNING *", [kind, JSON.stringify(payload), tainted ? 1 : 0, channelId])!;
  return parse(r);
}

export function getAction(db: DB, id: number): ActionRow | undefined {
  const r = db.get<Row>("SELECT * FROM actions WHERE id = ?", [id]);
  return r && parse(r);
}

/** Recent ones, newest first, for the prompt ("what happened to that email?"). */
export function recentActions(db: DB, limit = 8): ActionRow[] {
  return db.all<Row>("SELECT * FROM actions WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') ORDER BY id DESC LIMIT ?", [limit]).map(parse);
}

/** Claims it for doing, once: two taps (or two devices) can't send it twice. */
export function claimAction(db: DB, id: number): boolean {
  return !!db.run<{ id: number }>("UPDATE actions SET status = 'working', error = NULL WHERE id = ? AND status = 'proposed' RETURNING id", [id]);
}

export function finishAction(db: DB, id: number, outcome: { status: "done" | "declined" | "proposed"; payload?: EmailDraft | EventDraft; result?: ActionResult; error?: string }): void {
  db.run("UPDATE actions SET status = ?, payload = COALESCE(?, payload), result = ?, error = ?, decided_at = ? WHERE id = ?", [
    outcome.status,
    outcome.payload ? JSON.stringify(outcome.payload) : null,
    outcome.result ? JSON.stringify(outcome.result) : null,
    outcome.error ?? null,
    outcome.status === "proposed" ? null : new Date().toISOString(),
    id,
  ]);
}

// ---------- doing it (only ever after the user's tap) ----------

export interface ActionDeps {
  fetch: typeof fetch;
  /** gmail.compose: create drafts, send */
  compose: TokenSource;
  /** gmail.readonly: the thread being replied to */
  mailRead: TokenSource;
  /** calendar.events */
  events: TokenSource;
  timeZone?: string;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (s: string) => new TextEncoder().encode(s);
const b64url = (s: string) => b64(utf8(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodedWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(utf8(s))}?=`);

/** The email as a MIME message (Gmail fills in From with the signed-in account). */
export function mimeMessage(e: EmailDraft, reply?: { inReplyTo?: string; references?: string; subject?: string }): string {
  const subject = e.subject || (reply?.subject ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : "");
  const headers = [
    `To: ${e.to.join(", ")}`,
    ...(e.cc.length ? [`Cc: ${e.cc.join(", ")}`] : []),
    `Subject: ${encodedWord(oneLine(subject, 300))}`,
    ...(reply?.inReplyTo ? [`In-Reply-To: ${oneLine(reply.inReplyTo, 500)}`, `References: ${oneLine(`${reply.references ?? ""} ${reply.inReplyTo}`, 2000)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = b64(utf8(e.body.replace(/\n/g, "\r\n"))).replace(/.{76}/g, "$&\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

async function bearer(t: TokenSource, what: string): Promise<string> {
  try {
    return await t.get();
  } catch (e) {
    if (e instanceof NeedsConsentError || /NEEDS_CONSENT/.test(String((e as Error).message)))
      throw new Error(`Lyra isn't allowed to ${what} yet. Turn it on in Connections (on the Lyra page), then try again.`);
    throw e;
  }
}

async function post(d: ActionDeps, url: string, token: TokenSource, what: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await d.fetch(url, { method: "POST", headers: { authorization: `Bearer ${await bearer(token, what)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (r.status === 401 || r.status === 403) {
    await token.invalidate();
    throw new Error(`Google refused (${r.status}). Turn "${what}" off and on again in Connections, then try again.`);
  }
  if (!r.ok) throw new Error(`Google said ${r.status}${j.error?.message ? `: ${j.error.message}` : ""}.`);
  return j;
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function doEmail(d: ActionDeps, e: EmailDraft, how: "send" | "draft"): Promise<ActionResult> {
  let reply: { inReplyTo?: string; references?: string; subject?: string } | undefined;
  if (e.replyToThread) {
    const thread = await googleGet(GMAIL, "Gmail", d.mailRead, d.fetch).json<{ messages?: { payload?: { headers?: { name: string; value: string }[] } }[] }>(`/threads/${e.replyToThread}`, {
      format: "metadata",
      metadataHeaders: ["Message-ID", "References", "Subject"],
    });
    const last = thread.messages?.at(-1)?.payload?.headers ?? [];
    const h = (n: string) => last.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
    reply = { inReplyTo: h("Message-ID"), references: h("References"), subject: h("Subject") };
  }
  const message = { raw: b64url(mimeMessage(e, reply)), ...(e.replyToThread ? { threadId: e.replyToThread } : {}) };
  if (how === "draft") {
    const r = await post(d, `${GMAIL}/drafts`, d.compose, "draft and send mail", { message });
    const m = r.message as { id?: string } | undefined;
    return { did: "drafted", at: new Date().toISOString(), link: m?.id ? `https://mail.google.com/mail/u/0/#drafts?compose=${m.id}` : "https://mail.google.com/mail/u/0/#drafts" };
  }
  const r = await post(d, `${GMAIL}/messages/send`, d.compose, "draft and send mail", message);
  return { did: "sent", at: new Date().toISOString(), link: r.threadId ? `https://mail.google.com/mail/u/0/#sent/${r.threadId}` : undefined };
}

export async function doEvent(d: ActionDeps, v: EventDraft): Promise<ActionResult> {
  const tz = d.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = v.allDay
    ? { start: { date: v.start }, end: { date: nextDay(v.end) } }
    : { start: { dateTime: localToDate(v.start, tz)!.toISOString(), timeZone: tz }, end: { dateTime: localToDate(v.end, tz)!.toISOString(), timeZone: tz } };
  const body = {
    summary: v.title,
    ...when,
    ...(v.location ? { location: v.location } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.attendees.length ? { attendees: v.attendees.map((email) => ({ email })) } : {}),
  };
  const r = await post(d, `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${v.attendees.length ? "all" : "none"}`, d.events, "add calendar events", body);
  return { did: "added", at: new Date().toISOString(), link: typeof r.htmlLink === "string" && r.htmlLink.startsWith("https://") ? r.htmlLink : undefined };
}
