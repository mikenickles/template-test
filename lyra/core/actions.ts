// Phase 9: things Lyra can do in the world, always with the user's tap first.
// Lyra (the model) only *proposes*: an email or a calendar event, shown as a card in
// the chat with exactly what will happen. The app does it only after the user taps
// Send / Save to Drafts / Add, and the model has no tool that could do it by itself.
import type { DB } from "./db.ts";
import { googleGet } from "./connectors/google-http.ts";
import { NeedsConsentError, type TokenSource } from "./connectors/google.ts";
import { describeDue, localToDate } from "./reminders.ts";

export type ActionKind = "email" | "event" | "playlist" | "move" | "rsvp" | "archive" | "text";
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

/** Phase 14: a Spotify playlist to make, or songs to add to one of the user's. */
export interface PlaylistDraft {
  /** the new playlist's name, or the existing one's (for the card) */
  name: string;
  description: string;
  /** set: add to this existing playlist instead of making a new one */
  playlistId?: string;
  tracks: { uri: string; name: string; artist: string }[];
}

/** Move one of the user's events to a new time (they must be its organizer). */
export interface MoveDraft {
  eventId: string;
  title: string;
  /** when it was, as the card shows it */
  was: string;
  start: string;
  end: string;
  allDay: boolean;
  /** how many other people are on it (they're told about the new time) */
  guests: number;
}

/** Answer an invitation: yes, no or maybe, with an optional note to the organizer. */
export interface RsvpDraft {
  eventId: string;
  title: string;
  when: string;
  organizer: string;
  response: "accepted" | "declined" | "tentative";
  note: string;
}

/** Archive email threads: out of the inbox, still in All Mail and search. */
export interface ArchiveDraft {
  threads: { id: string; subject: string; from: string }[];
}

/** A text message, opened in the phone's messaging app ready to send. The user sends it there. */
export interface TextDraft {
  to: string;
  number: string;
  body: string;
}

export type ActionPayload = EmailDraft | EventDraft | PlaylistDraft | MoveDraft | RsvpDraft | ArchiveDraft | TextDraft;

const EVENT_ID = /^[a-zA-Z0-9_-]{5,1024}$/;
const THREAD_ID = /^[0-9a-f]{6,32}$/i;
const PHONE = /^\+?[0-9][0-9 ().-]{3,22}[0-9]$/;

export function checkEventId(v: unknown): string {
  const id = String(v ?? "").trim();
  if (!EVENT_ID.test(id)) throw new Error("event_id must be an event's id from list_events.");
  return id;
}

export function checkRsvp(input: Record<string, unknown>): { eventId: string; response: RsvpDraft["response"]; note: string } {
  const r = String(input.response ?? "").toLowerCase();
  const response = r === "yes" || r === "accepted" ? "accepted" : r === "no" || r === "declined" ? "declined" : r === "maybe" || r === "tentative" ? "tentative" : null;
  if (!response) throw new Error('response must be "yes", "no" or "maybe".');
  return { eventId: checkEventId(input.event_id), response, note: oneLine(input.note, 300) };
}

export function checkArchive(input: Record<string, unknown>): string[] {
  const ids = [...new Set((Array.isArray(input.thread_ids) ? input.thread_ids : []).map((t) => String(t).trim()))];
  if (!ids.length) throw new Error("Which emails? Give thread ids from search_mail.");
  if (ids.length > 25) throw new Error("That's more than 25 threads. Keep it to 25.");
  for (const id of ids) if (!THREAD_ID.test(id)) throw new Error(`"${id}" isn't a thread id from search_mail.`);
  return ids;
}

export function checkText(input: Record<string, unknown>): TextDraft {
  const number = oneLine(input.number, 30);
  if (!PHONE.test(number)) throw new Error("Give the phone number to text (from find_contact, or what the user said).");
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
  if (!body) throw new Error("The text is empty.");
  return { to: oneLine(input.to, 80) || number, number, body };
}

const TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;

/** Checks what the model asked for; the songs' real names are filled in from Spotify after. */
export function checkPlaylist(input: Record<string, unknown>): { name: string; description: string; playlistId?: string; uris: string[] } {
  const uris = [...new Set((Array.isArray(input.uris) ? input.uris : []).map((u) => String(u).trim()))];
  if (!uris.length) throw new Error("Which songs? Give spotify:track: URIs from search.");
  if (uris.length > 100) throw new Error("That's more than 100 songs. Keep it to 100.");
  for (const u of uris) if (!TRACK.test(u)) throw new Error(`"${u}" isn't a Spotify song URI (spotify:track:...).`);
  const playlistId = input.playlist_id ? String(input.playlist_id).trim() : undefined;
  if (playlistId && !/^[A-Za-z0-9]{10,40}$/.test(playlistId)) throw new Error("playlist_id must be an id from my_playlists.");
  const name = oneLine(input.name, 100);
  if (!name && !playlistId) throw new Error("Give the playlist a name.");
  return { name, description: oneLine(input.description, 300), ...(playlistId ? { playlistId } : {}), uris };
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
  payload: ActionPayload;
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
  if (a.kind === "move") {
    const m = a.payload as MoveDraft;
    const to = m.allDay ? m.start : describeDue(localToDate(m.start, timeZone)!, timeZone);
    return `Move "${m.title}" from ${m.was} to ${to}${m.guests ? ` (${m.guests} guests told)` : ""}`;
  }
  if (a.kind === "rsvp") {
    const r = a.payload as RsvpDraft;
    return `Answer ${r.response === "accepted" ? "yes" : r.response === "declined" ? "no" : "maybe"} to "${r.title}" (${r.when})`;
  }
  if (a.kind === "archive") {
    const t = (a.payload as ArchiveDraft).threads;
    return `Archive ${t.length} email${t.length === 1 ? "" : "s"}: ${t.slice(0, 3).map((x) => `"${x.subject}"`).join(", ")}${t.length > 3 ? "…" : ""}`;
  }
  if (a.kind === "text") {
    const x = a.payload as TextDraft;
    return `Text to ${x.to}: "${x.body.slice(0, 60)}${x.body.length > 60 ? "…" : ""}"`;
  }
  if (a.kind === "playlist") {
    const p = a.payload as PlaylistDraft;
    return p.playlistId ? `Add ${p.tracks.length} songs to the playlist "${p.name}"` : `New playlist "${p.name}" with ${p.tracks.length} songs`;
  }
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

export function createAction(db: DB, kind: ActionKind, payload: ActionPayload, tainted: boolean, channelId: number | null): ActionRow {
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

export function finishAction(db: DB, id: number, outcome: { status: "done" | "declined" | "proposed"; payload?: ActionPayload; result?: ActionResult; error?: string }): void {
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
  /** gmail.modify: archiving (only when the user turned "Tidy your inbox" on) */
  modify?: TokenSource;
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

async function post(d: ActionDeps, url: string, token: TokenSource, what: string, body: unknown, method = "POST"): Promise<Record<string, unknown>> {
  const r = await d.fetch(url, { method, headers: { authorization: `Bearer ${await bearer(token, what)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
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

/** Make the playlist (private), or add the songs to the user's existing one. Only after their tap. */
export async function doPlaylist(
  spotify: { call<T>(method: string, path: string, body?: unknown): Promise<T> },
  p: PlaylistDraft & { made?: boolean },
  onCreated?: (playlistId: string) => void,
): Promise<ActionResult> {
  let id = p.playlistId;
  let link: string | undefined;
  if (!id) {
    const me = await spotify.call<{ id: string }>("GET", "/me");
    const made = await spotify.call<{ id: string; external_urls?: { spotify?: string } }>("POST", `/users/${encodeURIComponent(me.id)}/playlists`, {
      name: p.name,
      description: p.description,
      public: false,
    });
    id = made.id;
    link = made.external_urls?.spotify;
    onCreated?.(id);
  }
  for (let i = 0; i < p.tracks.length; i += 100) await spotify.call("POST", `/playlists/${id}/tracks`, { uris: p.tracks.slice(i, i + 100).map((t) => t.uri) });
  return { did: p.playlistId && !p.made ? "added_songs" : "made", at: new Date().toISOString(), link: link?.startsWith("https://open.spotify.com/") ? link : `https://open.spotify.com/playlist/${id}` };
}

// ---------- more things to do with the user's OK: move, answer, archive, text ----------

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface CalendarEvent {
  id: string;
  summary?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string; comment?: string; organizer?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
}

/** "Fri, Nov 14, 3:00 PM" or "Fri, Nov 14, all day", for cards and prompts. */
export function eventWhen(e: CalendarEvent, timeZone?: string): string {
  if (e.start?.date) return `${new Date(`${e.start.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}, all day`;
  if (!e.start?.dateTime) return "no time";
  return describeDue(new Date(e.start.dateTime), timeZone);
}

/** The new time for a move; the length stays the same when no end is given. */
export function checkMove(input: Record<string, unknown>, e: CalendarEvent, timeZone?: string, now = new Date()): Pick<MoveDraft, "start" | "end" | "allDay"> {
  const start = oneLine(input.start, 20).replace("T", " ");
  let end = oneLine(input.end, 20).replace("T", " ");
  if (!end && !DAY.test(start) && e.start?.dateTime && e.end?.dateTime) {
    const s = localToDate(start, timeZone);
    if (s) end = toLocal(new Date(s.getTime() + (new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime())), timeZone);
  }
  const v = checkEvent({ title: e.summary || "Event", start, end }, timeZone, now);
  return { start: v.start, end: v.end, allDay: v.allDay };
}

export async function getEvent(d: Pick<ActionDeps, "fetch">, token: TokenSource, eventId: string): Promise<CalendarEvent> {
  const e = await googleGet("https://www.googleapis.com/calendar/v3", "Calendar", token, d.fetch).json<CalendarEvent>(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {});
  if (!e?.id || e.status === "cancelled") throw new Error("That event isn't on the calendar anymore.");
  return e;
}

export async function doMove(d: ActionDeps, m: MoveDraft): Promise<ActionResult> {
  const tz = d.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = m.allDay
    ? { start: { date: m.start, dateTime: null }, end: { date: nextDay(m.end), dateTime: null } }
    : { start: { dateTime: localToDate(m.start, tz)!.toISOString(), timeZone: tz, date: null }, end: { dateTime: localToDate(m.end, tz)!.toISOString(), timeZone: tz, date: null } };
  const r = await post(d, `${CAL}/${encodeURIComponent(m.eventId)}?sendUpdates=${m.guests ? "all" : "none"}`, d.events, "add calendar events", when, "PATCH");
  return { did: "moved", at: new Date().toISOString(), link: typeof r.htmlLink === "string" && r.htmlLink.startsWith("https://") ? r.htmlLink : undefined };
}

export async function doRsvp(d: ActionDeps, v: RsvpDraft): Promise<ActionResult> {
  // the guest list as it is now, with only the user's own answer changed
  const e = await getEvent(d, d.events, v.eventId);
  const attendees = e.attendees ?? [];
  if (!attendees.some((a) => a.self)) throw new Error("You're not on that event's guest list anymore.");
  const next = attendees.map((a) => (a.self ? { ...a, responseStatus: v.response, ...(v.note ? { comment: v.note } : {}) } : a));
  const r = await post(d, `${CAL}/${encodeURIComponent(v.eventId)}?sendUpdates=all`, d.events, "add calendar events", { attendees: next }, "PATCH");
  return { did: v.response, at: new Date().toISOString(), link: typeof r.htmlLink === "string" && r.htmlLink.startsWith("https://") ? r.htmlLink : undefined };
}

export async function doArchive(d: ActionDeps, a: ArchiveDraft): Promise<ActionResult> {
  if (!d.modify) throw new Error("Lyra isn't allowed to tidy your inbox yet. Turn it on in Connections, then try again.");
  for (const t of a.threads) await post(d, `${GMAIL}/threads/${t.id}/modify`, d.modify, "tidy your inbox", { removeLabelIds: ["INBOX"] });
  return { did: "archived", at: new Date().toISOString() };
}
