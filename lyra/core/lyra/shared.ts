/** Types, constants and helpers shared by Lyra (core/lyra.ts) and its parts in core/lyra/. */
import { type Http } from "../connectors/money/simplefin.ts";
import type { SqlJsStatic } from "sql.js";
import { type BrowserLink } from "../connectors/browser/server.ts";
import { type NoticeSource } from "../connectors/phone/server.ts";
import { CALENDAR_EVENTS, CALENDAR_READONLY, DRIVE_FULL, DRIVE_READONLY, GMAIL_COMPOSE, GMAIL_MODIFY, GMAIL_READONLY, type GoogleAuth } from "../connectors/google.ts";
import * as A from "../actions.ts";
import * as P from "../people.ts";
import * as S from "../skills.ts";
import { type OAuthRedirect } from "../connectors/spotify/auth.ts";
import { type Today } from "../today.ts";
import { type ConnectorStatus } from "../connectors/registry.ts";
import { DB, listMessages, type BlobStore, type Channel, type StoredMessage } from "../db.ts";
import { type Reminder } from "../reminders.ts";
import { type LiveVoice } from "../live.ts";
import { type Snapshot, type TextStore } from "../memory.ts";
import { type ProviderChoice, type ProviderInfo } from "../providers/index.ts";
import type { ModelProvider } from "../providers/types.ts";
import * as T from "../tasks.ts";
import { type WorkerEvent } from "../workers.ts";
import * as R from "../routines.ts";
import type { Lyra } from "../lyra.ts";

export type LyraEvent = WorkerEvent | R.RoutineEvent | { type: "doc"; docId: number } | { type: "admin" };
export type { Reminder } from "../reminders.ts";

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Platform {
  /** Location, on a phone where it's allowed: where you are, and a place by name or address. */
  places?: {
    access(): Promise<"none" | "while-open" | "always">;
    here(): Promise<{ lat: number; lng: number }>;
    find(query: string, near?: { lat: number; lng: number }): Promise<{ lat: number; lng: number; label: string }[]>;
  };
  SQL: SqlJsStatic;
  blobs?: BlobStore;
  texts: TextStore;
  secrets: SecretStore;
  google: GoogleAuth;
  fetch?: typeof fetch;
  timeZone?: string;
  /** Tests pass a provider directly instead of choosing one from settings. */
  provider?: ModelProvider;
  /** Tests: the background (quick) model, when it should differ from `provider`. */
  quickProvider?: ModelProvider;
  /** Signing in to services other than Google (Spotify): the browser and back. */
  oauth?: OAuthRedirect;
  /** The phone's notifications, once the user allows Notification access in Android settings (0.45). */
  notices?: NoticeSource & { access(): Promise<boolean> };
  /** (0.56) Lyra's extension in the user's own browser, through the Windows app: open and read pages. */
  browser?: BrowserLink & { listen(on: boolean): Promise<void> };
  /** (0.63.3) the app's version, for Tomo's own setup */
  version?: string;
  /** (0.63) a request made natively, past the web view's CORS (SimpleFIN); plain fetch when missing */
  http?: Http;
  /** The phone's messaging app: opens a text ready to send (Android only). */
  sms?: { compose(number: string, body: string): Promise<void> };
  /** The phone's address book (Android only), searched by name. */
  contacts?: {
    available: boolean;
    /** asks Android for permission if needed; false if refused */
    allow(): Promise<boolean>;
    find(name: string): Promise<{ name: string; emails: string[]; phones: string[] }[]>;
  };
}

export interface AppState {
  name: string;
  userName: string;
  choice: ProviderChoice;
  providers: ProviderInfo[];
  connectors: ConnectorStatus[];
  keys: { anthropic: boolean; openai: boolean; gemini: boolean; openaiBaseUrl: string };
  /** Let Lyra and its workers use the model's built-in web search. */
  webSearch: boolean;
  /** The app's accent color, one of ACCENTS. */
  accent: Accent;
  /** How the user's own message bubbles look, one of BUBBLES. */
  bubbles: Bubbles;
  /** The app's look, one of THEMES. */
  theme: Theme;
  /** Phone notifications for news while Lyra is in the background, and routine reminders. */
  notifications: boolean;
  /** Lyra mirrors how the user talks. */
  mirror: boolean;
  /** Ask for fingerprint, face or the phone's PIN to open Lyra. */
  appLock: boolean;
  /** Where the status line's weather is for (set in Settings); null = no weather. */
  weatherPlace: WeatherPlace | null;
  /** The voice GPT-Live speaks with in live voice mode. */
  liveVoice: LiveVoice;
  /** "auto" (paired with the main model), "same" (the main model), or a model id */
  backgroundModel: string;
  /** Heads-ups: Lyra checks in on its own and speaks up only when something needs you. */
  proactive: Proactive;
  /** Lyra may propose emails / calendar events (you approve each one). */
  /** email/event/archive: allowed on this device; text: null where there's no phone to text from */
  actions: { email: boolean; event: boolean; archive: boolean; file: boolean; text: boolean | null };
  /** Phone contacts: on/off, or null where there are none (computer, browser). */
  contacts: boolean | null;
  /** Reading the phone's notifications: on/off, or null where there are none (computer, browser). */
  notices: boolean | null;
  /** (0.56) Lyra using your own browser through its extension: on/off, or null where it can't (phone, older Windows app). */
  browser: boolean | null;
}

export const PROACTIVE_LEVELS = ["off", "light", "active"] as const;
export type ProactiveLevel = (typeof PROACTIVE_LEVELS)[number];
export interface Proactive {
  level: ProactiveLevel;
  /** "HH:MM" local time; no heads-ups from quietStart until quietEnd */
  quietStart: string;
  quietEnd: string;
  /** when nothing needs you, Lyra asks for work or gets to know you */
  checkIns: boolean;
  /** watch for new mail from the people who matter, every few minutes */
  mailWatch: boolean;
}
/** How often a heads-up check runs at each level. */
export const HEADS_UP_EVERY: Record<ProactiveLevel, number> = { off: 0, light: 4 * 3600_000, active: 3600_000 };
// On from the start (Light): a chief of staff who never speaks first isn't one. It only runs on a real model.
export const PROACTIVE_DEFAULT: Proactive = { level: "light", quietStart: "21:00", quietEnd: "07:00", checkIns: true, mailWatch: true };
/** How often the mail watch looks (a plain search; the AI only reads what's new). */
export const MAIL_WATCH_EVERY = 5 * 60_000;
/** The Today screen's glance: what's next on the calendar, and what Lyra has done today. */
export interface Agenda {
  /** false: no calendar connected (the screen offers to connect one) */
  calendar: boolean;
  events: { id: string; title: string; start: string; allDay: boolean; tomorrow: boolean; place: string }[];
  /** things Lyra did since midnight (tasks, routines, heads-ups, reminders) */
  did: number;
}

/** Fence ids for place triggers start here (place reminders use their own small ids). */
export const PLACE_TRIGGER_BASE = 100_000;
/** How long between check-ins at each level. */
export const CHECK_IN_EVERY: Record<ProactiveLevel, number> = { off: 0, light: 24 * 3600_000, active: 8 * 3600_000 };
/** A heads-up or check-in that couldn't run is tried again this much later. */
export const RETRY_MS = 10 * 60_000;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Is this local "HH:MM" inside quiet hours (which may wrap past midnight)? */
export function inQuietHours(hhmm: string, p: Pick<Proactive, "quietStart" | "quietEnd">): boolean {
  const { quietStart: a, quietEnd: b } = p;
  if (a === b) return false;
  return a < b ? hhmm >= a && hhmm < b : hhmm >= a || hhmm < b;
}

export interface WeatherPlace {
  name: string;
  latitude: number;
  longitude: number;
}

/** (0.66) Accent colors the user can pick in Settings, taken from Tomo (scarf, backpack, shading, face
 * screen) and colors that sit well beside them. The colors themselves live in the app's stylesheet. */
export const ACCENTS = ["orange", "honey", "cocoa", "moss", "pine", "denim", "plum", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];
export const ACCENT_NAMES: Record<Accent, string> = { orange: "Burnt orange", honey: "Honey", cocoa: "Cocoa", moss: "Moss", pine: "Pine", denim: "Denim", plum: "Plum", graphite: "Graphite" };
/** colors from before 0.66, saved on a device or synced from an older one: the closest new color */
export const OLD_ACCENTS: Record<string, Accent> = { lime: "moss", yellow: "honey", red: "orange", maroon: "plum", navy: "denim", indigo: "denim", teal: "pine" };
/** Your message bubbles: softer ink (default), the accent's tint, soft neutral, or the original solid ink. */
export const BUBBLES = ["softer", "accent", "neutral", "classic"] as const;
export type Bubbles = (typeof BUBBLES)[number];
/** (0.66) The app's look, a page tone on Quiet's rules: Quiet (id "paper"), Linen, Sage, or Night (always dark).
 * Styles live in the stylesheet. */
export const THEMES = ["paper", "linen", "sage", "night"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_NAMES: Record<Theme, string> = { paper: "Quiet", linen: "Linen", sage: "Sage", night: "Night" };
/** looks from before 0.66: Night Radio became Night, Zine and Film became Quiet */
export const OLD_THEMES: Record<string, Theme> = { radio: "night", zine: "paper", film: "paper" };

export interface MemoryView {
  content: string;
  sections: { name: string; items: string[] }[];
  history: Snapshot[];
}

export interface ChannelView {
  channel: Channel;
  notebook: MemoryView;
}

export interface ChannelInput {
  name: string;
  about?: string;
  icon?: string;
}

export interface SettingsPatch {
  userName?: string;
  provider?: string;
  model?: string;
  /** A string sets a key, null removes it, missing leaves it alone. */
  keys?: Partial<Record<"anthropic" | "openai" | "gemini", string | null>>;
  openaiBaseUrl?: string;
  webSearch?: boolean;
  accent?: string;
  bubbles?: string;
  theme?: string;
  notifications?: boolean;
  /** Talk like me: mirror how the user talks. */
  mirror?: boolean;
  appLock?: boolean;
  weatherPlace?: WeatherPlace | null;
  liveVoice?: string;
  backgroundModel?: string;
  proactive?: Partial<Proactive>;
}

export const SECRET_KEYS = ["anthropic", "openai", "gemini"] as const;

export type GoogleId = "gmail" | "calendar" | "drive";

export const GOOGLE_LINKS = ["gmail", "calendar", "drive"];
/** Settings that stay with a device when another device's data arrives through sync. */
export const DEVICE_SETTINGS = [...GOOGLE_LINKS, "appLock", "notifications", "actions.gmail", "actions.calendar", "actions.archive", "actions.drive", "actions.text", "notices", "contacts", "spotify", "spotify.playback", "spotify.playlists", "spotify.nowPlaying", "browser"];

/** Phase 9: what Lyra may propose, each turned on by the user in Connections. */
export const ACTION_ACCESS = {
  email: { link: "gmail" as GoogleId, setting: "actions.gmail", scope: GMAIL_COMPOSE, what: "draft and send mail" },
  event: { link: "calendar" as GoogleId, setting: "actions.calendar", scope: CALENDAR_EVENTS, what: "add calendar events" },
  archive: { link: "gmail" as GoogleId, setting: "actions.archive", scope: GMAIL_MODIFY, what: "organize your mail" },
  // 0.55: create, rename, move, edit and trash files in Drive
  drive: { link: "drive" as GoogleId, setting: "actions.drive", scope: DRIVE_FULL, what: "change your Drive files" },
};
export type GoogleAction = keyof typeof ACTION_ACCESS;
/** Which permission each kind of card needs: moving and answering events use the calendar one. */
export const NEEDS: Record<"email" | "event" | "move" | "rsvp" | "archive" | "remove" | "mail" | "edit_event" | "file", GoogleAction> = {
  email: "email",
  event: "event",
  move: "event",
  rsvp: "event",
  archive: "archive",
  remove: "event",
  mail: "archive",
  edit_event: "event",
  file: "drive",
};

/** Lyra's Google connectors. Each asks for one read-only permission. */
export const GOOGLE: {
  id: GoogleId;
  label: string;
  noun: string;
  access: string;
  scope: string;
  allow: string[];
  labels: Record<string, string>;
}[] = [
  {
    id: "gmail",
    label: "Mail",
    noun: "mail",
    access: "Can read your mail",
    scope: GMAIL_READONLY,
    allow: ["search_mail", "read_thread"],
    labels: { search_mail: "Searching your mail", read_thread: "Reading the thread" },
  },
  {
    id: "calendar",
    label: "Calendar",
    noun: "calendar",
    access: "Can see your schedule",
    scope: CALENDAR_READONLY,
    allow: ["list_events", "list_calendars"],
    labels: { list_events: "Checking your calendar", list_calendars: "Checking your calendars" },
  },
  {
    id: "drive",
    label: "Files",
    noun: "Drive",
    access: "Can read your files",
    scope: DRIVE_READONLY,
    allow: ["search_files", "read_file"],
    labels: { search_files: "Searching your files", read_file: "Reading the file" },
  },
];

export interface GmailLink {
  email?: string;
  connected_at: string;
}

/** (0.53) a long chat sends its newest SUMMARY_KEEP messages word for word and a summary of the rest, refreshed SUMMARY_MIN at a time */
export const SUMMARY_KEEP = 12;
export const SUMMARY_MIN = 16;

/** What a heads-up check looks for, and how high the bar is for speaking up. */
/** A check-in: nothing needs the user, so Lyra asks for work or gets to know them. */
export function checkInInstructions(userName: string, recent: string[], can: { email: boolean; event: boolean }): string {
  const user = userName === "you" ? "the user" : userName;
  const extra = [can.email && "write emails for their OK", can.event && "add calendar events for their OK"].filter(Boolean).join(", ");
  return `This is a check-in. Things are quiet: nothing needs ${user} right now, and you have room to take more on. Like a good chief of staff with a free afternoon, ask for work or get to know ${user} better.

Pick ONE, whichever would help most right now:
1. Offer a specific project you could do for them, grounded in what you know or can see: their memory and open loops, recent mail, the calendar for the coming week, open tasks. Say what you'd do and what they'd get ("I could go through this week's school emails and pull out every date and form into one list. Want that?"). Only offer what you can really do: research, summarize, compare, plan, draft, keep track, set up a routine or reminders${extra ? `, ${extra}` : ""}.
2. Ask after something in their life you know about and haven't heard the end of: how something went, how someone is doing, what they decided. The way a friend would, because you want to know.
3. Ask one question that would make you more useful and that your memory doesn't answer yet: their work, the people who matter to them, their week, their goals, how they like you to help. One question, not a questionnaire.
4. Ask what's on their plate this week that you could take off it.

Write it the way you'd text a friend: one or two short sentences, warm, in your own voice, no preamble, no "just checking in". Give up to three short replies they can tap (options), written as they'd say them, like "Yes, do that", "Not this week", "Ask me later".
Call post. Use nothing_new only if there's truly nothing worth asking.

Don't repeat what you asked or offered recently:
${recent.length ? recent.map((r) => `- ${r}`).join("\n") : "(nothing yet)"}`;
}

export function headsUpInstructions(connected: string[], userName: string, level: ProactiveLevel): string {
  const user = userName === "you" ? "the user" : userName;
  const look = [
    connected.some((c) => /mail/i.test(c)) && "- Mail since the last check: anything from a real person that's waiting on a reply, a deadline, a bill, or a change of plans.",
    connected.some((c) => /calendar/i.test(c)) && "- Calendar for the next few hours and tomorrow morning: something that needs prep, a clash, an early start, travel time.",
    "- Open tasks: anything Ready for them, waiting on their answer, or past its due date.",
    "- Loose ends and dates in memory: something they said they'd do or decide that's now due, a birthday or deadline coming up in the next week or two.",
  ].filter(Boolean);
  return `This is a heads-up check: you're looking in on ${user}'s day on your own, the way a good chief of staff glances at the inbox and the calendar between other things.

Look at:
${look.join("\n")}

Post when you find something ${user} would be glad you caught: a deadline today or tomorrow, someone waiting on their answer, a clash, something to prepare or leave early for, an offer or a hold about to lapse, a bill nearly due, a date that needs a head start. ${
    level === "light" ? "Keep it to what matters today or tomorrow." : "Smaller things that are worth a nudge count too."
  } Skip newsletters, promotions and automated mail, and skip anything you already told them (see what you reported last time) unless it changed or its deadline is now close. If there's nothing like that, call nothing_new: quiet is fine, and saying the same thing twice is worse than silence.

If you post, write it like a text from you, not an alert: a few words in your own voice to open, then the thing that matters most, then at most two more, each with its next step. Offer to take the next step yourself where you can (draft the reply, set the reminder), and give those as options to tap. No recap of what you checked.`;
}

/** The user message that started a reply: the first one after the previous assistant message. */
export function userMessageBefore(db: DB, channelId: number | null, replyId: number): StoredMessage {
  const recent = listMessages(db, channelId, 40).filter((m) => m.id < replyId);
  let i = recent.length - 1;
  while (i > 0 && recent[i - 1].role === "user") i--;
  return recent[i];
}
