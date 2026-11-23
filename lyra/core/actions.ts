// Phase 9: things Lyra can do in the world, always with the user's tap first.
// Lyra (the model) only *proposes*: an email or a calendar event, shown as a card in
// the chat with exactly what will happen. The app does it only after the user taps
// Send / Save to Drafts / Add, and the model has no tool that could do it by itself.
import type { DB } from "./db.ts";
import { googleGet } from "./connectors/google-http.ts";
import { NeedsConsentError, type TokenSource } from "./connectors/google.ts";
import { describeDue, localToDate } from "./reminders.ts";

export type ActionKind = "email" | "event" | "playlist" | "move" | "rsvp" | "archive" | "text" | "remove" | "mail" | "edit_event" | "file" | "browser";
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

/** Take an event off the user's calendar. Their own event is cancelled for everyone; an invitation only leaves their calendar. */
export interface RemoveDraft {
  eventId: string;
  title: string;
  when: string;
  /** other people on it (told it's cancelled, when the user organizes it) */
  guests: number;
  /** the user organizes it, so removing it cancels it for the guests too */
  mine: boolean;
  /** a repeating event's whole series, not one day of it */
  series: boolean;
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

// ---------- 0.55: the rest of Gmail, Calendar and Drive, each still one card and one tap ----------

/** What can be done to mail threads, and what undoes each. Trash is the furthest: nothing is deleted for good. */
export type MailOp = "archive" | "inbox" | "trash" | "untrash" | "read" | "unread" | "star" | "unstar" | "label" | "unlabel";
export const MAIL_OPS: Record<MailOp, { verb: string; done: string; undo: MailOp }> = {
  archive: { verb: "Archive", done: "Archived", undo: "inbox" },
  inbox: { verb: "Move to inbox", done: "Back in the inbox", undo: "archive" },
  trash: { verb: "Move to trash", done: "In the trash", undo: "untrash" },
  untrash: { verb: "Restore", done: "Restored", undo: "trash" },
  read: { verb: "Mark read", done: "Marked read", undo: "unread" },
  unread: { verb: "Mark unread", done: "Marked unread", undo: "read" },
  star: { verb: "Star", done: "Starred", undo: "unstar" },
  unstar: { verb: "Unstar", done: "Unstarred", undo: "star" },
  label: { verb: "Label", done: "Labelled", undo: "unlabel" },
  unlabel: { verb: "Remove label", done: "Label removed", undo: "label" },
};

/** Something done to mail threads: listed on the card straight from Gmail. */
export interface MailDraft {
  op: MailOp;
  threads: { id: string; subject: string; from: string }[];
  /** for label / unlabel: no id yet means a new label, made when the user taps */
  label?: { id?: string; name: string };
}

const MAIL_WORDS: Record<string, MailOp> = {
  archive: "archive",
  inbox: "inbox",
  move_to_inbox: "inbox",
  unarchive: "inbox",
  trash: "trash",
  delete: "trash",
  untrash: "untrash",
  restore: "untrash",
  read: "read",
  mark_read: "read",
  unread: "unread",
  mark_unread: "unread",
  star: "star",
  unstar: "unstar",
  label: "label",
  add_label: "label",
  unlabel: "unlabel",
  remove_label: "unlabel",
};

export function checkMailChange(input: Record<string, unknown>): { op: MailOp; ids: string[]; label: string } {
  const word = String(input.change ?? "archive").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const op = MAIL_WORDS[word];
  if (!op) throw new Error('change must be one of: archive, move_to_inbox, trash, restore, mark_read, mark_unread, star, unstar, add_label, remove_label.');
  const ids = checkArchive(input);
  const label = oneLine(input.label, 100);
  if ((op === "label" || op === "unlabel") && !label) throw new Error("Which label? Give its name.");
  return { op, ids, label };
}

/** Change what an event says or who's on it. Its time is propose_reschedule's job. */
export interface EditEventDraft {
  eventId: string;
  /** as it is now, for the card */
  title: string;
  when: string;
  /** only what changes */
  changes: { title?: string; location?: string; description?: string; addGuests?: string[]; removeGuests?: string[] };
  /** what it was, so Undo can put it back */
  before: { title: string; location: string; description: string; attendees: NonNullable<CalendarEvent["attendees"]> };
  /** other people on it after the change (they're told) */
  guests: number;
}

export function checkEditEvent(input: Record<string, unknown>, e: CalendarEvent): Pick<EditEventDraft, "changes" | "before" | "guests"> {
  const attendees = e.attendees ?? [];
  const others = attendees.filter((a) => !a.self);
  if (e.organizer && !e.organizer.self && others.length)
    throw new Error(`The user isn't the organizer of "${e.summary ?? "that event"}", so it can't be changed for everyone. Offer to email the organizer instead.`);
  const before = { title: e.summary ?? "", location: e.location ?? "", description: e.description ?? "", attendees };
  const changes: EditEventDraft["changes"] = {};
  if (input.title !== undefined) {
    const t = oneLine(input.title, 200);
    if (!t) throw new Error("The new title is empty.");
    if (t !== before.title) changes.title = t;
  }
  if (input.location !== undefined) {
    const l = oneLine(input.location, 300);
    if (l !== before.location) changes.location = l;
  }
  if (input.description !== undefined) {
    const d = String(input.description ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 4000);
    if (d !== before.description.trim()) changes.description = d;
  }
  const on = new Set(attendees.map((a) => (a.email ?? "").toLowerCase()));
  const add = addresses(input.add_guests, "add_guests").filter((a) => !on.has(a));
  const remove = addresses(input.remove_guests, "remove_guests");
  for (const r of remove) if (!on.has(r)) throw new Error(`${r} isn't on that event.`);
  if (attendees.some((a) => a.self && remove.includes((a.email ?? "").toLowerCase()))) throw new Error("To take the user off an event, answer no with propose_rsvp or remove it with propose_remove_event.");
  if (add.length) changes.addGuests = add;
  if (remove.length) changes.removeGuests = remove;
  if (others.length + add.length - remove.length > 50) throw new Error("That's more than 50 guests.");
  if (!Object.keys(changes).length) throw new Error("Nothing would change: the event already says that. For a new time use propose_reschedule.");
  return { changes, before, guests: others.length - remove.length + add.length };
}

/** What can be done to a Drive file or folder. Trash is the furthest: Drive keeps it for 30 days. */
export type FileOp = "create" | "rename" | "move" | "trash" | "restore" | "append" | "replace";

export interface FileDraft {
  op: FileOp;
  /** every op but create */
  fileId?: string;
  /** the file's name now (create: the new file's name) */
  name: string;
  /** "Google Doc", "folder", "text file"… */
  kind: string;
  /** rename */
  newName?: string;
  /** move: where to; create: where it goes (none: My Drive) */
  folder?: { id: string; name: string };
  /** move: where it was, for Undo */
  from?: { id: string; name: string }[];
  /** create (a doc or text file): its text; append: what's added at the end; replace: the new words */
  text?: string;
  /** replace: the words to find (every one is replaced) */
  find?: string;
  /** replace: how many times they're there now */
  count?: number;
  link?: string;
}

export const FOLDER = "application/vnd.google-apps.folder";
export const GDOC = "application/vnd.google-apps.document";
const DRIVE_ID = /^[\w-]{10,200}$/;
const NEW_KINDS: Record<string, { kind: string; mime: string }> = {
  doc: { kind: "Google Doc", mime: GDOC },
  folder: { kind: "folder", mime: FOLDER },
  text: { kind: "text file", mime: "text/plain" },
};

export function checkDriveId(v: unknown, what = "file_id"): string {
  const id = String(v ?? "").trim();
  if (!DRIVE_ID.test(id)) throw new Error(`${what} must be an id from search_files.`);
  return id;
}

/** What the model asked for, before the file's real name and place are read from Drive. */
export function checkFileChange(input: Record<string, unknown>): {
  op: FileOp;
  fileId?: string;
  folderId?: string;
  newName?: string;
  name?: string;
  newKind?: { kind: string; mime: string };
  text?: string;
  find?: string;
} {
  const op = String(input.change ?? "").trim().toLowerCase() as FileOp;
  if (!["create", "rename", "move", "trash", "restore", "append", "replace"].includes(op)) throw new Error("change must be one of: create, rename, move, trash, restore, append, replace.");
  const text = input.text === undefined ? undefined : String(input.text).replace(/\r\n?/g, "\n").slice(0, 50_000);
  const folderId = input.folder_id ? checkDriveId(input.folder_id, "folder_id") : undefined;
  if (op === "create") {
    const newKind = NEW_KINDS[String(input.kind ?? "doc").toLowerCase()];
    if (!newKind) throw new Error('kind must be "doc", "folder" or "text".');
    const name = oneLine(input.name, 200);
    if (!name) throw new Error("Give the new file a name.");
    if (newKind.mime !== FOLDER && !text?.trim()) throw new Error("Give the new file its text.");
    return { op, name, newKind, folderId, ...(newKind.mime !== FOLDER ? { text: text!.trim() } : {}) };
  }
  const fileId = checkDriveId(input.file_id);
  if (op === "rename") {
    const newName = oneLine(input.name, 200);
    if (!newName) throw new Error("Give the new name.");
    return { op, fileId, newName };
  }
  if (op === "move") {
    if (!folderId) throw new Error("Which folder? Give folder_id from search_files.");
    return { op, fileId, folderId };
  }
  if (op === "append") {
    if (!text?.trim()) throw new Error("What should be added? Give text.");
    return { op, fileId, text: text.trim() };
  }
  if (op === "replace") {
    const find = String(input.find ?? "").replace(/\r\n?/g, "\n");
    if (!find.trim()) throw new Error("Give the exact words to find (find) and what replaces them (text).");
    if (text === undefined) throw new Error("Give the new words as text (empty to take them out).");
    if (find.length > 2000) throw new Error("find is too long: give a shorter, exact piece.");
    return { op, fileId, find, text };
  }
  return { op, fileId };
}

export type ActionPayload = EmailDraft | EventDraft | PlaylistDraft | MoveDraft | RsvpDraft | ArchiveDraft | TextDraft | RemoveDraft | MailDraft | EditEventDraft | FileDraft | BrowserDraft;

/** (0.60) A step on a web page that needs the user's OK: press a button (or Enter in a field) in Lyra's browser window. */
export interface BrowserDraft {
  site: string;
  url: string;
  title: string;
  op: "click" | "submit";
  ref: number;
  label: string;
  /** what Lyra typed on this site so far, so the user sees what would be sent */
  typed: { label: string; text: string }[];
}

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
  /** (0.55) the user tapped Undo, and it was put back */
  undone?: string;
  /** (0.60) a browser step: the page it led to */
  title?: string;
  url?: string;
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
  if (a.kind === "browser") {
    const b = a.payload as BrowserDraft;
    return `${b.op === "submit" ? `Send the form ("${b.label}")` : `Press "${b.label}"`} on ${b.site}${b.title ? ` (${b.title})` : ""}`;
  }
  if (a.kind === "mail") {
    const m = a.payload as MailDraft;
    const t = m.threads;
    return `${MAIL_OPS[m.op].verb}${m.label ? ` "${m.label.name}"` : ""}: ${t.length} email${t.length === 1 ? "" : "s"} (${t.slice(0, 3).map((x) => `"${x.subject}"`).join(", ")}${t.length > 3 ? "…" : ""})`;
  }
  if (a.kind === "edit_event") {
    const v = a.payload as EditEventDraft;
    const c = v.changes;
    const bits = [
      c.title !== undefined && `title to "${c.title}"`,
      c.location !== undefined && (c.location ? `place to "${c.location}"` : "no place"),
      c.description !== undefined && "new notes",
      c.addGuests?.length && `invite ${c.addGuests.join(", ")}`,
      c.removeGuests?.length && `take off ${c.removeGuests.join(", ")}`,
    ].filter(Boolean);
    return `Change "${v.title}" (${v.when}): ${bits.join(", ")}`;
  }
  if (a.kind === "file") return describeFileChange(a.payload as FileDraft);
  if (a.kind === "move") {
    const m = a.payload as MoveDraft;
    const to = m.allDay ? m.start : describeDue(localToDate(m.start, timeZone)!, timeZone);
    return `Move "${m.title}" from ${m.was} to ${to}${m.guests ? ` (${m.guests} guests told)` : ""}`;
  }
  if (a.kind === "remove") {
    const r = a.payload as RemoveDraft;
    return `Remove "${r.title}" (${r.when}) from the calendar${r.series ? ", every time it repeats" : ""}${r.mine && r.guests ? ` (${r.guests} guests told it's cancelled)` : ""}`;
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
  /** (0.55) the whole of Drive: files the user approves changes to, one card at a time */
  drive?: TokenSource;
  /** gmail.compose: create drafts, send */
  compose: TokenSource;
  /** gmail.readonly: the thread being replied to */
  mailRead: TokenSource;
  /** calendar.events */
  events: TokenSource;
  /** gmail.modify: archiving (only when the user turned "Organize your mail" on) */
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
      throw new Error(`Tomo isn't allowed to ${what} yet. Turn it on in Connections (on the Tomo page), then try again.`);
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
  /** set on a repeating event itself (the whole series) */
  recurrence?: string[];
  location?: string;
  description?: string;
}

/** What removing this event would do, read from the event as it is on the calendar. */
export function checkRemove(e: CalendarEvent, timeZone?: string): RemoveDraft {
  const others = (e.attendees ?? []).filter((a) => !a.self).length;
  return { eventId: e.id, title: e.summary?.trim() || "(no title)", when: eventWhen(e, timeZone), guests: others, mine: !e.organizer || !!e.organizer.self, series: !!e.recurrence?.length };
}

export async function doRemove(d: ActionDeps, r: RemoveDraft): Promise<ActionResult> {
  if (!d.events) throw new Error("Tomo isn't allowed to change your calendar yet. Turn it on in Connections, then try again.");
  // guests hear about it only when it's the user's own event being cancelled
  const url = `${CAL}/${encodeURIComponent(r.eventId)}?sendUpdates=${r.mine && r.guests ? "all" : "none"}`;
  const res = await d.fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${await bearer(d.events, "add calendar events")}` } });
  if (res.status === 401 || res.status === 403) {
    await d.events.invalidate();
    throw new Error(`Google refused (${res.status}). Turn "Calendar changes" off and on again in Connections, then try again.`);
  }
  // already gone counts as removed
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google said ${res.status}.`);
  return { did: "removed", at: new Date().toISOString() };
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
  if (!d.modify) throw new Error("Tomo isn't allowed to organize your mail yet. Turn it on in Connections, then try again.");
  for (const t of a.threads) await post(d, `${GMAIL}/threads/${t.id}/modify`, d.modify, "organize your mail", { removeLabelIds: ["INBOX"] });
  return { did: "archived", at: new Date().toISOString() };
}

// ---------- 0.55: mail, event details, Drive files ----------

/** The labels a change adds or takes off (trash and restore have their own calls). */
function mailLabels(op: MailOp, labelId?: string): { addLabelIds?: string[]; removeLabelIds?: string[] } {
  switch (op) {
    case "archive":
      return { removeLabelIds: ["INBOX"] };
    case "inbox":
      return { addLabelIds: ["INBOX"] };
    case "read":
      return { removeLabelIds: ["UNREAD"] };
    case "unread":
      return { addLabelIds: ["UNREAD"] };
    case "star":
      return { addLabelIds: ["STARRED"] };
    case "unstar":
      return { removeLabelIds: ["STARRED"] };
    case "label":
      return { addLabelIds: [labelId!] };
    case "unlabel":
      return { removeLabelIds: [labelId!] };
    default:
      return {};
  }
}

/** Does it, and returns the payload as done (a new label's id is kept, so Undo can take it off). */
export async function doMail(d: ActionDeps, m: MailDraft): Promise<{ result: ActionResult; payload: MailDraft }> {
  if (!d.modify) throw new Error("Tomo isn't allowed to organize your mail yet. Turn it on in Connections, then try again.");
  let label = m.label;
  if (m.op === "label" && label && !label.id) {
    const r = await post(d, `${GMAIL}/labels`, d.modify, "organize your mail", { name: label.name, labelListVisibility: "labelShow", messageListVisibility: "show" });
    label = { id: String(r.id), name: label.name };
  }
  for (const t of m.threads) {
    if (m.op === "trash" || m.op === "untrash") await post(d, `${GMAIL}/threads/${t.id}/${m.op}`, d.modify, "organize your mail", {});
    else await post(d, `${GMAIL}/threads/${t.id}/modify`, d.modify, "organize your mail", mailLabels(m.op, label?.id));
  }
  return { result: { did: `mail_${m.op}`, at: new Date().toISOString() }, payload: { ...m, ...(label ? { label } : {}) } };
}

/** The guest list after the change: the people taken off go, the new ones join. */
function guestList(v: EditEventDraft): NonNullable<CalendarEvent["attendees"]> {
  const out = new Set((v.changes.removeGuests ?? []).map((x) => x.toLowerCase()));
  return [...v.before.attendees.filter((a) => !out.has((a.email ?? "").toLowerCase())), ...(v.changes.addGuests ?? []).map((email) => ({ email }))];
}

export async function doEditEvent(d: ActionDeps, v: EditEventDraft, undo = false): Promise<ActionResult> {
  const c = v.changes;
  const body: Record<string, unknown> = undo
    ? {
        ...(c.title !== undefined ? { summary: v.before.title } : {}),
        ...(c.location !== undefined ? { location: v.before.location } : {}),
        ...(c.description !== undefined ? { description: v.before.description } : {}),
        ...(c.addGuests || c.removeGuests ? { attendees: v.before.attendees } : {}),
      }
    : {
        ...(c.title !== undefined ? { summary: c.title } : {}),
        ...(c.location !== undefined ? { location: c.location } : {}),
        ...(c.description !== undefined ? { description: c.description } : {}),
        ...(c.addGuests || c.removeGuests ? { attendees: guestList(v) } : {}),
      };
  const tell = v.guests > 0 || !!c.removeGuests?.length;
  const r = await post(d, `${CAL}/${encodeURIComponent(v.eventId)}?sendUpdates=${tell ? "all" : "none"}`, d.events, "add calendar events", body, "PATCH");
  return { did: "changed", at: new Date().toISOString(), link: typeof r.htmlLink === "string" && r.htmlLink.startsWith("https://") ? r.htmlLink : undefined };
}

export function describeFileChange(f: FileDraft): string {
  switch (f.op) {
    case "create":
      return `New ${f.kind} "${f.name}"${f.folder ? ` in ${f.folder.name}` : ""}`;
    case "rename":
      return `Rename "${f.name}" to "${f.newName}"`;
    case "move":
      return `Move "${f.name}" to ${f.folder?.name ?? "a folder"}`;
    case "trash":
      return `Trash "${f.name}" (${f.kind})`;
    case "restore":
      return `Restore "${f.name}" from the trash`;
    case "append":
      return `Add to the end of "${f.name}": "${(f.text ?? "").slice(0, 60)}${(f.text ?? "").length > 60 ? "…" : ""}"`;
    case "replace":
      return `In "${f.name}", replace "${(f.find ?? "").slice(0, 40)}" with "${(f.text ?? "").slice(0, 40)}" (${f.count ?? 0}×)`;
  }
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DOCS = "https://docs.googleapis.com/v1/documents";

async function driveFetch(d: ActionDeps, url: string, init: RequestInit): Promise<Response> {
  if (!d.drive) throw new Error("Tomo isn't allowed to change your Drive files yet. Turn it on in Connections, then try again.");
  const headers = { ...(init.headers as Record<string, string>), authorization: `Bearer ${await bearer(d.drive, "change your Drive files")}` };
  const r = await d.fetch(url, { ...init, headers });
  if (r.status === 401 || r.status === 403) {
    await d.drive.invalidate();
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google refused (${r.status})${j.error?.message ? `: ${j.error.message}` : ""}. If it's your file, turn "Change your files" off and on again in Connections, then try again.`);
  }
  if (r.status === 404) throw new Error("That file isn't in Drive anymore (or Tomo can't reach it).");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google said ${r.status}${j.error?.message ? `: ${j.error.message}` : ""}.`);
  }
  return r;
}

const driveJson = async <T>(d: ActionDeps, url: string, init: RequestInit = {}): Promise<T> => (await (await driveFetch(d, url, init)).json()) as T;
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const linkOf = (j: { webViewLink?: string }) => (j.webViewLink?.startsWith("https://") ? j.webViewLink : undefined);

function multipart(meta: Record<string, unknown>, type: string, text: string): { body: string; type: string } {
  const boundary = `lyra${crypto.randomUUID().replace(/-/g, "")}`;
  return {
    type: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`,
  };
}

/** Does it; a new file's id is kept on the payload so Undo can trash it again. */
export async function doFile(d: ActionDeps, f: FileDraft): Promise<{ result: ActionResult; payload: FileDraft }> {
  const done = (did: string, link?: string, payload: FileDraft = f) => ({ result: { did, at: new Date().toISOString(), ...(link ? { link } : {}) }, payload });
  const fields = "fields=id,webViewLink&supportsAllDrives=true";
  switch (f.op) {
    case "create": {
      const parents = f.folder ? { parents: [f.folder.id] } : {};
      if (f.kind === "folder") {
        const j = await driveJson<{ id: string; webViewLink?: string }>(d, `${DRIVE}?${fields}`, jsonInit("POST", { name: f.name, mimeType: FOLDER, ...parents }));
        return done("file_created", linkOf(j), { ...f, fileId: j.id, link: linkOf(j) });
      }
      const doc = f.kind === "Google Doc";
      const send = (type: string) => {
        const m = multipart({ name: f.name, ...(doc ? { mimeType: GDOC } : {}), ...parents }, type, f.text ?? "");
        return driveFetch(d, `${DRIVE_UPLOAD}?uploadType=multipart&${fields}`, { method: "POST", headers: { "content-type": m.type }, body: m.body });
      };
      // Markdown keeps a Google Doc's headings and lists; plain text if Google won't convert it
      const r = doc ? await send("text/markdown").catch(() => send("text/plain")) : await send("text/plain");
      const j = (await r.json()) as { id: string; webViewLink?: string };
      return done("file_created", linkOf(j), { ...f, fileId: j.id, link: linkOf(j) });
    }
    case "rename": {
      const j = await driveJson<{ webViewLink?: string }>(d, `${DRIVE}/${f.fileId}?${fields}`, jsonInit("PATCH", { name: f.newName }));
      return done("file_renamed", linkOf(j));
    }
    case "move": {
      const from = (f.from ?? []).map((p) => p.id).join(",");
      const j = await driveJson<{ webViewLink?: string }>(d, `${DRIVE}/${f.fileId}?addParents=${f.folder!.id}${from ? `&removeParents=${from}` : ""}&${fields}`, jsonInit("PATCH", {}));
      return done("file_moved", linkOf(j));
    }
    case "trash":
    case "restore": {
      const j = await driveJson<{ webViewLink?: string }>(d, `${DRIVE}/${f.fileId}?${fields}`, jsonInit("PATCH", { trashed: f.op === "trash" }));
      return done(f.op === "trash" ? "file_trashed" : "file_restored", linkOf(j));
    }
    case "append":
    case "replace": {
      if (f.kind === "Google Doc") {
        const request =
          f.op === "append"
            ? { insertText: { text: `\n${f.text}`, endOfSegmentLocation: {} } }
            : { replaceAllText: { containsText: { text: f.find, matchCase: true }, replaceText: f.text ?? "" } };
        const j = await driveJson<{ replies?: { replaceAllText?: { occurrencesChanged?: number } }[] }>(d, `${DOCS}/${f.fileId}:batchUpdate`, jsonInit("POST", { requests: [request] }));
        if (f.op === "replace" && !j.replies?.[0]?.replaceAllText?.occurrencesChanged) throw new Error("Those words aren't in the doc anymore, so nothing changed.");
        return done(f.op === "append" ? "file_added" : "file_replaced", f.link);
      }
      // a plain text file: read it, change it, write it back
      const now = await (await driveFetch(d, `${DRIVE}/${f.fileId}?alt=media&supportsAllDrives=true`, {})).text();
      let next: string;
      if (f.op === "append") next = `${now.replace(/\s+$/, "")}\n${f.text}\n`;
      else {
        if (!now.includes(f.find!)) throw new Error("Those words aren't in the file anymore, so nothing changed.");
        next = now.split(f.find!).join(f.text ?? "");
      }
      await driveFetch(d, `${DRIVE_UPLOAD}/${f.fileId}?uploadType=media&supportsAllDrives=true`, { method: "PATCH", headers: { "content-type": "text/plain; charset=UTF-8" }, body: next });
      return done(f.op === "append" ? "file_added" : "file_replaced", f.link);
    }
  }
}

/** The change that puts a done one back, or null when there's no clean way to (text edits: Drive's version history has the old one). */
export function fileUndo(f: FileDraft): FileDraft | null {
  switch (f.op) {
    case "create":
      return f.fileId ? { ...f, op: "trash" } : null;
    case "rename":
      return { ...f, name: f.newName!, newName: f.name };
    case "move":
      return f.from?.length ? { ...f, folder: f.from[0], from: [f.folder!] } : null;
    case "trash":
      return { ...f, op: "restore" };
    case "restore":
      return { ...f, op: "trash" };
    default:
      return null;
  }
}

/** Whether a done card can offer Undo. */
export function undoable(a: Pick<ActionRow, "kind" | "payload">): boolean {
  if (a.kind === "mail" || a.kind === "archive" || a.kind === "edit_event") return true;
  return a.kind === "file" && fileUndo(a.payload as FileDraft) !== null;
}
