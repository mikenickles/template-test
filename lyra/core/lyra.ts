/**
 * Lyra's engine. Everything the app does goes through here: it owns the
 * database, memory, model choice, API keys and connectors. It runs inside
 * the Android app; tests and the browser preview run the same code.
 */
import { awaySince, type AwayItem } from "./away.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SqlJsStatic } from "sql.js";
import { CHANNEL_ICONS, runTurn, type TurnEmitter, type TurnInbox, type Workspace } from "./chat.ts";
import { createGmailServer, gmailProfile } from "./connectors/gmail/server.ts";
import { createCalendarServer } from "./connectors/calendar/server.ts";
import { createDriveServer } from "./connectors/drive/server.ts";
import { CALENDAR_EVENTS, CALENDAR_READONLY, DRIVE_FILE, DRIVE_READONLY, GMAIL_COMPOSE, GMAIL_READONLY, grantIsAllowed, TokenSource, type GoogleAuth } from "./connectors/google.ts";
import * as A from "./actions.ts";
import * as P from "./people.ts";
import * as D from "./docs.ts";
import * as S from "./skills.ts";
import * as ST from "./style.ts";
import { SPOTIFY_PLAYBACK, SPOTIFY_PLAYLISTS, SPOTIFY_READ, SpotifyAuth, type OAuthRedirect } from "./connectors/spotify/auth.ts";
import { createSpotifyServer } from "./connectors/spotify/server.ts";
import { runTidy } from "./tidy.ts";
import { wrapUntrusted } from "./untrusted.ts";
import { latestIds, searchMessages, todayView, unreadCounts, type SearchHit, type Today } from "./today.ts";
import { Connectors, type ConnectorStatus } from "./connectors/registry.ts";
import {
  DB,
  findChannel,
  getChannel,
  getMessage,
  getSetting,
  listChannels,
  addMessage,
  deleteMessage,
  pinnedMessages,
  listMessages,
  setSetting,
  updateMessageMeta,
  type BlobStore,
  type Channel,
  type ChannelSummary,
  type StoredMessage,
} from "./db.ts";
import { UpdateSource } from "./updates.ts";
import {
  cancelReminder,
  createReminder,
  describeDue,
  describeReminders,
  dueReminders,
  finishReminder,
  localToDate,
  pendingReminders,
  type Reminder,
} from "./reminders.ts";
import type { Attachment } from "./attachments.ts";
import { localDay, metered, recordUsage, usageBetween, type UsageRow } from "./usage.ts";
import { LIVE_MODEL, LIVE_VOICES, liveSession, type LiveVoice } from "./live.ts";
import { listModels, type ModelOption } from "./providers/models.ts";
import type { ProviderId } from "./providers/index.ts";
import { decryptBackup, encryptBackup, fromBase64, toBase64, type BackupPayload } from "./backup.ts";
import { channelNotebookSpec, cleanItem, mainNotebookSpec, Notebook, type Snapshot, type TextStore } from "./memory.ts";
import {
  createProvider,
  DEFAULT_MODELS,
  listProviders,
  PROVIDERS,
  type Keys,
  type ProviderChoice,
  type ProviderInfo,
} from "./providers/index.ts";
import type { ModelProvider } from "./providers/types.ts";
import { DEFAULT_SOUL } from "./soul.ts";
import * as T from "./tasks.ts";
import { Workers, type WorkerEvent, type WorkerRun } from "./workers.ts";
import * as R from "./routines.ts";

export type LyraEvent = WorkerEvent | R.RoutineEvent | { type: "doc"; docId: number };
export type { Reminder } from "./reminders.ts";

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Platform {
  SQL: SqlJsStatic;
  blobs?: BlobStore;
  texts: TextStore;
  secrets: SecretStore;
  google: GoogleAuth;
  fetch?: typeof fetch;
  timeZone?: string;
  /** Tests pass a provider directly instead of choosing one from settings. */
  provider?: ModelProvider;
  /** Signing in to services other than Google (Spotify): the browser and back. */
  oauth?: OAuthRedirect;
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
  /** Heads-ups: Lyra checks in on its own and speaks up only when something needs you. */
  proactive: Proactive;
  /** Lyra may propose emails / calendar events (you approve each one). */
  actions: { email: boolean; event: boolean };
  /** Phone contacts: on/off, or null where there are none (computer, browser). */
  contacts: boolean | null;
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
}
/** How often a heads-up check runs at each level. */
export const HEADS_UP_EVERY: Record<ProactiveLevel, number> = { off: 0, light: 4 * 3600_000, active: 3600_000 };
const PROACTIVE_DEFAULT: Proactive = { level: "off", quietStart: "21:00", quietEnd: "07:00", checkIns: true };
/** How long between check-ins at each level. */
export const CHECK_IN_EVERY: Record<ProactiveLevel, number> = { off: 0, light: 24 * 3600_000, active: 8 * 3600_000 };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/** Accent colors the user can pick in Settings. The colors themselves live in the app's stylesheet. */
export const ACCENTS = ["lime", "orange", "yellow", "red", "maroon", "navy", "indigo", "teal"] as const;
export type Accent = (typeof ACCENTS)[number];

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
  notifications?: boolean;
  /** Talk like me: mirror how the user talks. */
  mirror?: boolean;
  appLock?: boolean;
  weatherPlace?: WeatherPlace | null;
  liveVoice?: string;
  proactive?: Partial<Proactive>;
}

const SECRET_KEYS = ["anthropic", "openai", "gemini"] as const;

export type GoogleId = "gmail" | "calendar" | "drive";

const GOOGLE_LINKS = ["gmail", "calendar", "drive"];
/** Settings that stay with a device when another device's data arrives through sync. */
const DEVICE_SETTINGS = [...GOOGLE_LINKS, "appLock", "notifications", "actions.gmail", "actions.calendar", "contacts", "spotify", "spotify.playback", "spotify.playlists"];

/** Phase 9: what Lyra may propose, each turned on by the user in Connections. */
const ACTION_ACCESS = {
  email: { link: "gmail" as GoogleId, setting: "actions.gmail", scope: GMAIL_COMPOSE, what: "draft and send mail" },
  event: { link: "calendar" as GoogleId, setting: "actions.calendar", scope: CALENDAR_EVENTS, what: "add calendar events" },
};

/** Lyra's Google connectors. Each asks for one read-only permission. */
const GOOGLE: {
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

interface GmailLink {
  email?: string;
  connected_at: string;
}

export class Lyra {
  private keys: Keys = {};
  private running: AbortController | undefined;
  /** The reply being written: its chat, messages sent meanwhile, and when it's done. */
  private turn: { channelId: number | null; items: string[]; open: boolean; wake?: () => void; done: Promise<StoredMessage> } | undefined;
  private connectors: Connectors;
  /** Spotify sign-in and API (Phase 14). Tokens stay on this device. */
  readonly spotify: SpotifyAuth;
  private tokenSources = new Map<GoogleId, TokenSource>();
  private customSoul: string | undefined;
  private notebooks = new Map<number, Promise<Notebook>>();
  private workspace: Workspace;
  readonly workers: Workers;
  private listeners = new Set<(e: LyraEvent) => void>();
  readonly routinesRunner: R.Routines;

  private constructor(
    private p: Platform,
    private db: DB,
    private memory: Notebook,
  ) {
    const lyra = this;
    this.workspace = {
      main: memory,
      talk: () => ST.styleSection(this.userName === "you" ? "the user" : this.userName, ST.readStyle(this.db)?.notes, ST.mirrorOn(this.db)),
      skills: {
        index: () => S.describeSkills(S.listSkills(this.db)),
        use: (name) => {
          const s = S.findSkill(this.db, name);
          if (!s) return null;
          S.markUsed(this.db, s.id);
          return { id: s.id, name: s.name, steps: s.steps };
        },
        save: (input) => {
          const r = S.saveSkill(this.db, { name: input.name, use_when: input.use_when, steps: input.steps });
          return { id: r.skill.id, name: r.skill.name, created: r.created };
        },
      },
      docs: {
        recent: () => D.describeDocs(D.listDocs(this.db, 12)),
        write: (input, channelId, tainted) => {
          const d = D.createDoc(this.db, { ...input, channelId, tainted });
          this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
          return { id: d.id, title: d.title };
        },
        update: (id, patch, tainted) => {
          const d = D.updateDoc(this.db, id, { ...patch, tainted });
          this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
          return { id: d.id, title: d.title };
        },
        read: (id) => {
          const d = D.getDoc(this.db, id);
          if (!d) throw new Error(`There's no doc #${id}.`);
          const text = `# ${d.title}\n\n${d.body}`;
          return { text: d.tainted ? wrapUntrusted(`doc #${d.id}`, text) : text, tainted: d.tainted };
        },
      },
      people: {
        directory: () => P.describePeople(P.listPeople(this.db)),
        remember: (input) => {
          const r = P.rememberPerson(this.db, input as unknown as P.PersonInput);
          return { id: r.person.id, name: r.person.name, created: r.created };
        },
        lookUp: (name) => {
          const p = P.findPerson(this.db, name);
          return p ? P.describePerson(p) : null;
        },
      },
      // Spotify playback, only while connected with the playback switch on
      get music() {
        return lyra.spotifyLinked && getSetting(lyra.db, "spotify.playback") === "on" ? { control: (action: string, uri?: string) => lyra.controlMusic(action, uri) } : undefined;
      },
      // only while the user has it turned on, on a phone that can
      get contacts() {
        return lyra.contactsOn
          ? {
              find: async (name: string) => {
                const hits = await lyra.p.contacts!.find(String(name).slice(0, 80));
                if (!hits.length) return "No contact by that name.";
                // the user's own address book; names can still be anything, so it's data, not instructions
                return wrapUntrusted(
                  "contacts",
                  hits
                    .slice(0, 5)
                    .map((h) => `- ${h.name}${h.emails.length ? ` · ${h.emails.join(", ")}` : ""}${h.phones.length ? ` · ${h.phones.join(", ")}` : ""}`)
                    .join("\n"),
                );
              },
            }
          : undefined;
      },
      channels: () => this.channels(),
      notebook: (id) => this.notebook(id),
      createChannel: (input) => this.createChannel(input),
      startTask: (id, note) => void this.workers.start(id, "lyra", note),
      actions: {
        allowed: () => this.actionsAllowed(),
        propose: async (kind, input, tainted, channelId) => {
          if (kind === "playlist") {
            if (!this.actionsAllowed().playlist) throw new Error("You can't change Spotify playlists yet: the user can turn it on in Connections.");
            const p = A.checkPlaylist(input);
            // the card shows the songs' real names, straight from Spotify
            const tracks: A.PlaylistDraft["tracks"] = [];
            for (let i = 0; i < p.uris.length; i += 50) {
              const ids = p.uris.slice(i, i + 50).map((u) => u.split(":")[2]);
              const r = await this.spotify.get<{ tracks: ({ uri: string; name: string; artists?: { name: string }[] } | null)[] }>(`/tracks?ids=${ids.join(",")}`);
              for (const t of r.tracks) if (t) tracks.push({ uri: t.uri, name: t.name, artist: (t.artists ?? []).map((a) => a.name).join(", ") });
            }
            if (!tracks.length) throw new Error("Spotify didn't find those songs.");
            const name = p.playlistId ? (await this.spotify.get<{ name: string }>(`/playlists/${p.playlistId}?fields=name`)).name : p.name;
            const row = A.createAction(this.db, "playlist", { name, description: p.description, ...(p.playlistId ? { playlistId: p.playlistId } : {}), tracks }, tainted, channelId);
            return { id: row.id, summary: A.describeAction(row) };
          }
          if (!this.actionsAllowed()[kind]) throw new Error(`You can't ${ACTION_ACCESS[kind].what} yet: the user can turn it on in Connections.`);
          const payload = kind === "email" ? A.checkEmail(input) : A.checkEvent(input, this.p.timeZone);
          const row = A.createAction(this.db, kind, payload, tainted, channelId);
          return { id: row.id, summary: A.describeAction(row, this.p.timeZone) };
        },
        recent: () =>
          A.recentActions(this.db)
            .map((a) => `- #${a.id} ${A.describeAction(a, this.p.timeZone)}: ${a.status === "done" ? (a.result?.did ?? "done") : a.status === "declined" ? "the user said not now" : a.error ? `not done yet (last try failed: ${a.error})` : "waiting for the user's tap"}`)
            .join("\n"),
      },
      reminders: {
        list: () => describeReminders(pendingReminders(this.db), this.p.timeZone),
        create: (kind, text, at, channelId) => {
          const when = localToDate(at, this.p.timeZone);
          if (!when) throw new Error("That time doesn't look right. Use YYYY-MM-DD HH:MM in the user's local time.");
          const r = createReminder(this.db, { kind, text, at: when, channelId });
          this.listeners.forEach((l) => l({ type: "reminder" }));
          return { id: r.id, when: describeDue(when, this.p.timeZone) };
        },
        cancel: (id) => {
          const r = cancelReminder(this.db, id);
          this.listeners.forEach((l) => l({ type: "reminder" }));
          return `Cancelled: ${r.text}`;
        },
      },
      routines: {
        list: () => this.routines(),
        create: (input) => this.createRoutine(input),
        update: (id, input) => this.updateRoutine(id, input),
      },
    };
    for (const g of GOOGLE) this.tokenSources.set(g.id, new TokenSource(p.google, [g.scope]));
    const servers: Record<GoogleId, () => McpServer> = {
      gmail: () => createGmailServer(this.tokenFor("gmail"), this.fetch),
      calendar: () => createCalendarServer(this.tokenFor("calendar"), this.fetch, p.timeZone),
      drive: () => createDriveServer(this.tokenFor("drive"), this.fetch),
    };
    this.spotify = new SpotifyAuth(p.secrets, (...a) => this.fetch(...a));
    this.connectors = new Connectors([
      ...GOOGLE.map((g) => ({
        id: g.id,
        label: g.label,
        access: g.access,
        allow: g.allow,
        labels: g.labels,
        available: () => p.google.available,
        connected: () => !!this.link(g.id),
        account: () => this.link(g.id)?.email,
        server: servers[g.id],
      })),
      {
        id: "spotify",
        label: "Spotify",
        access: "Can see what you play",
        allow: ["now_playing", "recently_played", "top_items", "search", "my_playlists", "playlist_tracks"],
        labels: {
          now_playing: "Checking what's playing",
          recently_played: "Checking what you played",
          top_items: "Looking at your favorites",
          search: "Searching Spotify",
          my_playlists: "Looking at your playlists",
          playlist_tracks: "Reading the playlist",
        },
        available: () => !!p.oauth,
        connected: () => this.spotifyLinked,
        account: () => this.spotifyLink?.name,
        server: () => createSpotifyServer(this.spotify),
      },
    ]);
    this.workers = new Workers({
      db,
      workspace: this.workspace,
      connectors: this.connectors,
      provider: async () => metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), "worker", db, p.timeZone),
      userName: () => this.userName,
      soul: () => this.customSoul,
      timeZone: p.timeZone,
      onEvent: (e) => this.listeners.forEach((l) => l(e)),
      webSearch: () => this.webSearch,
      flush: () => db.flush(),
    });
    this.routinesRunner = new R.Routines({
      db,
      workspace: this.workspace,
      connectors: this.connectors,
      provider: async (source = "routine") => metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), source, db, p.timeZone),
      userName: () => this.userName,
      soul: () => this.customSoul,
      timeZone: p.timeZone,
      webSearch: () => this.webSearch,
      onEvent: (e) => this.listeners.forEach((l) => l(e)),
      flush: () => db.flush(),
    });
  }

  static async start(p: Platform, opts: { resumeWorkers?: boolean } = {}): Promise<Lyra> {
    // notebook and soul edits count as changes too (sync's own state file doesn't)
    const texts = p.texts;
    let lyraRef: Lyra | undefined;
    p = {
      ...p,
      texts: {
        ...texts,
        read: (n) => texts.read(n),
        write: async (n, t) => {
          await texts.write(n, t);
          if (/\.md$/.test(n)) lyraRef?.dataChanged();
        },
        ...(texts.remove ? { remove: (n: string) => texts.remove!(n) } : {}),
      },
    };
    const db = await DB.open(p.SQL, p.blobs);
    const userName = getSetting(db, "userName") ?? "you";
    const memory = await Notebook.open(db, p.texts, mainNotebookSpec(userName));
    const lyra = new Lyra(p, db, memory);
    lyraRef = lyra;
    db.onWrite = () => lyra.dataChanged();
    lyra.customSoul = (await p.texts.read("soul.md"))?.trim() || undefined;
    for (const k of SECRET_KEYS) lyra.keys[k] = (await p.secrets.get(`key.${k}`)) ?? undefined;
    lyra.keys.openaiBaseUrl = getSetting(db, "openaiBaseUrl") || undefined;
    // Workers cut off when the app was closed carry on where they stopped (not after
    // loading another device's data: those runs belong to that device).
    if (opts.resumeWorkers !== false) lyra.workers.resumeInterrupted();
    // an email or event cut off mid-send: back to the user, who can check Gmail/Calendar first
    db.run("UPDATE actions SET status = 'proposed', error = ? WHERE status = 'working'", ["Lyra was closed while doing this. Check it didn't go through before trying again."]);
    return lyra;
  }

  private get fetch(): typeof fetch {
    return this.p.fetch ?? ((...a) => fetch(...a));
  }

  private link(id: GoogleId): GmailLink | undefined {
    const raw = getSetting(this.db, id);
    return raw ? (JSON.parse(raw) as GmailLink) : undefined;
  }

/** Updates from your Drive's "Lyra Updates" folder, through the read-only Files connection. */
  updates(): UpdateSource {
    if (!this.link("drive")) throw new Error("Connect Files (Google Drive) on the Lyra page to get updates.");
    return new UpdateSource(this.tokenFor("drive"), this.fetch);
  }

    private tokenFor(id: GoogleId): TokenSource {
    return this.tokenSources.get(id)!;
  }

  get webSearch(): boolean {
    return getSetting(this.db, "webSearch") !== "off";
  }

  get userName(): string {
    return getSetting(this.db, "userName") || "you";
  }

  // ---------- settings ----------

  private choice(): ProviderChoice {
    const saved = getSetting(this.db, "provider");
    const providers = listProviders(this.keys);
    if (saved) {
      const c = JSON.parse(saved) as ProviderChoice;
      if (PROVIDERS.includes(c.provider) && providers.find((p) => p.id === c.provider)?.ready) return c;
    }
    const first = providers.find((p) => p.ready && p.id !== "fake") ?? providers.find((p) => p.id === "fake")!;
    return { provider: first.id, model: first.defaultModel };
  }

  state(): AppState {
    return {
      name: "Lyra",
      userName: this.userName,
      choice: this.choice(),
      providers: listProviders(this.keys),
      connectors: this.connectors.status(),
      keys: {
        anthropic: !!this.keys.anthropic,
        openai: !!this.keys.openai,
        gemini: !!this.keys.gemini,
        openaiBaseUrl: this.keys.openaiBaseUrl ?? "",
      },
      webSearch: this.webSearch,
      accent: this.accent,
      notifications: getSetting(this.db, "notifications") !== "off",
      mirror: ST.mirrorOn(this.db),
      appLock: getSetting(this.db, "appLock") === "on",
      weatherPlace: this.weatherPlace,
      liveVoice: this.liveVoice,
      proactive: this.proactive,
      actions: this.actionsAllowed(),
      contacts: this.p.contacts?.available ? this.contactsOn : null,
    };
  }

  // ---------- actions: emails and events, done only on the user's tap ----------

  private actionTokens = { email: undefined as TokenSource | undefined, event: undefined as TokenSource | undefined };

  private actionToken(kind: "email" | "event"): TokenSource {
    return (this.actionTokens[kind] ??= new TokenSource(this.p.google, [ACTION_ACCESS[kind].scope]));
  }

  actionsAllowed(): { email: boolean; event: boolean; playlist: boolean } {
    const on = (k: "email" | "event") => !!this.link(ACTION_ACCESS[k].link) && getSetting(this.db, ACTION_ACCESS[k].setting) === "on";
    return { email: on("email"), event: on("event"), playlist: this.spotifyLinked && getSetting(this.db, "spotify.playlists") === "on" };
  }

  /** Turn on (asks Google for that one permission) or off. */
  async allowActions(kind: "email" | "event", on: boolean): Promise<AppState> {
    const a = ACTION_ACCESS[kind];
    if (on) {
      if (!this.link(a.link)) throw new Error(`Connect ${a.link === "gmail" ? "Mail" : "Calendar"} first.`);
      if (!this.p.google.available) throw new Error("Google sign-in isn't available here.");
      const r = await this.p.google.authorize([a.scope], true);
      if (!grantIsAllowed(r.grantedScopes, a.scope)) throw new Error("Google granted more than Lyra asked for, so Lyra didn't keep it.");
      await this.actionToken(kind).invalidate();
    }
    setSetting(this.db, a.setting, on ? "on" : "off");
    await this.db.flush();
    return this.state();
  }

  /** The Today view: what needs the user, what Lyra said lately, what's coming up. */
  today(): Today {
    return todayView(this.db, { timeZone: this.p.timeZone });
  }

  searchMessages(q: string): SearchHit[] {
    return searchMessages(this.db, q);
  }

  unread(seen: Record<string, number>): Record<string, number> {
    return unreadCounts(this.db, seen);
  }

  latestMessageIds(): Record<string, number> {
    return latestIds(this.db);
  }

  /** "Later" on a task: out of Up next until tomorrow morning (or null: back now). */
  async snoozeTask(id: number, until: string | null): Promise<T.TaskRow> {
    const t = T.snoozeTask(this.db, id, until ? new Date(until) : null);
    this.listeners.forEach((l) => l({ type: "task", taskId: id }));
    await this.db.flush();
    return t;
  }

  action(id: number): A.ActionRow | undefined {
    return A.getAction(this.db, id);
  }

  /**
   * The user's tap on a card: send / save as a draft / add to the calendar, or not now.
   * `edited` is the card's fields if the user changed them; they're checked again.
   */
  async decideAction(id: number, choice: "send" | "draft" | "add" | "decline", edited?: Record<string, unknown>): Promise<A.ActionRow> {
    const a = A.getAction(this.db, id);
    if (!a) throw new Error("That's no longer here.");
    if (!A.claimAction(this.db, id)) throw new Error(a.status === "done" ? "That's already done." : a.status === "declined" ? "You said not now to that one." : "That's already being done.");
    if (choice === "decline") {
      A.finishAction(this.db, id, { status: "declined" });
    } else {
      try {
        if (a.kind === "playlist") {
          if (!this.actionsAllowed().playlist) throw new Error("Lyra isn't allowed to change your Spotify playlists on this device. Turn it on in Connections, then try again.");
          const result = await A.doPlaylist(this.spotify, a.payload as A.PlaylistDraft);
          A.finishAction(this.db, id, { status: "done", result });
          await this.db.flush();
          this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
          return A.getAction(this.db, id)!;
        }
        const payload = edited ? (a.kind === "email" ? A.checkEmail(edited) : A.checkEvent(edited, this.p.timeZone)) : a.payload;
        if (!this.actionsAllowed()[a.kind]) throw new Error(`Lyra isn't allowed to ${ACTION_ACCESS[a.kind].what} on ${this.p.google.available ? "this device" : "here"}. Turn it on in Connections, then try again.`);
        const deps: A.ActionDeps = { fetch: this.fetch, compose: this.actionToken("email"), mailRead: this.tokenFor("gmail"), events: this.actionToken("event"), timeZone: this.p.timeZone };
        const result =
          a.kind === "email"
            ? await A.doEmail(deps, payload as A.EmailDraft, choice === "draft" ? "draft" : "send")
            : await A.doEvent(deps, payload as A.EventDraft);
        A.finishAction(this.db, id, { status: "done", payload, result });
      } catch (e) {
        A.finishAction(this.db, id, { status: "proposed", error: (e as Error).message.slice(0, 300) });
      }
    }
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
    return A.getAction(this.db, id)!;
  }

  get proactive(): Proactive {
    try {
      const p = { ...PROACTIVE_DEFAULT, ...(JSON.parse(getSetting(this.db, "proactive") || "{}") as Partial<Proactive>) };
      return (PROACTIVE_LEVELS as readonly string[]).includes(p.level) && HHMM.test(p.quietStart) && HHMM.test(p.quietEnd) ? { ...p, checkIns: p.checkIns !== false } : PROACTIVE_DEFAULT;
    } catch {
      return PROACTIVE_DEFAULT;
    }
  }

  // ---------- live voice (GPT-Live) ----------

  get liveVoice(): LiveVoice {
    const v = getSetting(this.db, "liveVoice") as LiveVoice | undefined;
    return v && (LIVE_VOICES as readonly string[]).includes(v) ? v : "marin";
  }

  /**
   * Start a live voice session: sends the browser's WebRTC offer to OpenAI with the
   * saved key (which never leaves the engine) and returns the answer to connect with.
   */
  async startLive(offerSdp: string, channelId: number | null): Promise<{ id: string; sdp: string }> {
    if (!this.keys.openai) throw new Error("Live voice uses OpenAI's GPT-Live. Add an OpenAI API key in Settings, AI model.");
    const channel = channelId === null ? undefined : getChannel(this.db, channelId);
    const session = liveSession({
      userName: this.userName,
      soul: (this.customSoul?.trim() || DEFAULT_SOUL).replaceAll("{user}", this.userName === "you" ? "the user" : this.userName),
      memory: this.workspace.main.read(),
      channel: channel ? { name: channel.name, about: channel.about, notebook: (await this.workspace.notebook(channel.id)).read() } : undefined,
      voice: this.liveVoice,
      history: listMessages(this.db, channelId, 24)
        .filter((m) => !m.meta.error)
        .map((m) => ({ role: m.role, text: m.content })),
      timeZone: this.p.timeZone,
    });
    const r = await this.fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.keys.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session, transport: { type: "webrtc", sdp: offerSdp } }),
    });
    const j = (await r.json().catch(() => ({}))) as { session?: { id: string }; transport?: { sdp: string }; error?: { message?: string } };
    if (!r.ok || !j.transport?.sdp) {
      if (r.status === 401) throw new Error("OpenAI refused the API key. Check it in Settings, AI model.");
      throw new Error(j.error?.message ? `OpenAI couldn't start the call: ${j.error.message}` : `OpenAI couldn't start the call (${r.status}).`);
    }
    return { id: j.session?.id ?? "", sdp: j.transport.sdp };
  }

  /** Something asked aloud that needs Lyra's tools: runs as a normal turn (saved to the chat) and returns what to say. */
  async liveDelegate(request: string, channelId: number | null): Promise<string> {
    const { message, user } = await this.chat(request, { text: () => {}, status: () => {}, memory: () => {} }, channelId);
    for (const m of [user, message]) updateMessageMeta(this.db, m.id, { ...m.meta, voice: true });
    this.listeners.forEach((l) => l({ type: "message", channelId }));
    const notes = (message.meta.memory ?? []).filter((n) => n.kind === "suggested").length;
    return message.content + (notes ? "\n(One thing is waiting in the chat for the user to confirm before it's saved.)" : "");
  }

  /** Plain conversation from a call, kept in the chat as text. */
  async liveExchange(user: string, assistant: string, channelId: number | null): Promise<void> {
    addMessage(this.db, "user", user.slice(0, 4000), { voice: true }, channelId);
    addMessage(this.db, "assistant", assistant.slice(0, 4000), { voice: true, provider: "openai", model: LIVE_MODEL }, channelId);
    this.listeners.forEach((l) => l({ type: "message", channelId }));
    await this.db.flush();
  }

  /** The call is over: record the minutes GPT-Live billed. */
  async liveEnded(seconds: number): Promise<void> {
    if (seconds > 0) recordUsage(this.db, { day: localDay(new Date(), this.p.timeZone), provider: "openai", model: LIVE_MODEL, source: "voice", input: seconds, output: 0 });
    await this.db.flush();
  }

  /** Token usage between two local days (YYYY-MM-DD, inclusive). */
  usage(from: string, to: string): UsageRow[] {
    return usageBetween(this.db, from, to);
  }

  /** The models this provider's saved key can use (asked from the provider each time). */
  models(provider: ProviderId): Promise<ModelOption[]> {
    return listModels(this.keys, provider, this.fetch);
  }

  get weatherPlace(): WeatherPlace | null {
    try {
      const raw = getSetting(this.db, "weatherPlace");
      return raw ? (JSON.parse(raw) as WeatherPlace) : null;
    } catch {
      return null;
    }
  }

  get accent(): Accent {
    const a = getSetting(this.db, "accent");
    return (ACCENTS as readonly string[]).includes(a ?? "") ? (a as Accent) : "lime";
  }

  async saveSettings(patch: SettingsPatch): Promise<AppState> {
    if (patch.userName !== undefined) setSetting(this.db, "userName", patch.userName.trim().slice(0, 40));
    if (patch.webSearch !== undefined) setSetting(this.db, "webSearch", patch.webSearch ? "on" : "off");
    if (patch.appLock !== undefined) setSetting(this.db, "appLock", patch.appLock ? "on" : "off");
    if (patch.liveVoice !== undefined) {
      if (!(LIVE_VOICES as readonly string[]).includes(patch.liveVoice)) throw new Error("That voice isn't one of the choices.");
      setSetting(this.db, "liveVoice", patch.liveVoice);
    }
    if (patch.weatherPlace !== undefined) {
      const w = patch.weatherPlace;
      if (w && !(w.name?.trim() && Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && Math.abs(w.latitude) <= 90 && Math.abs(w.longitude) <= 180))
        throw new Error("That place doesn't look right.");
      setSetting(this.db, "weatherPlace", w ? JSON.stringify({ name: w.name.trim().slice(0, 80), latitude: w.latitude, longitude: w.longitude }) : "");
    }
    if (patch.notifications !== undefined) setSetting(this.db, "notifications", patch.notifications ? "on" : "off");
    if (patch.mirror !== undefined) setSetting(this.db, "mirror", patch.mirror ? "on" : "off");
    if (patch.proactive !== undefined) {
      const p = { ...this.proactive, ...patch.proactive };
      if (!(PROACTIVE_LEVELS as readonly string[]).includes(p.level)) throw new Error("That heads-up level isn't one of the choices.");
      if (!HHMM.test(p.quietStart) || !HHMM.test(p.quietEnd)) throw new Error("Quiet hours need times like 21:00.");
      const was = this.proactive.level;
      setSetting(this.db, "proactive", JSON.stringify({ level: p.level, quietStart: p.quietStart, quietEnd: p.quietEnd, checkIns: p.checkIns !== false }));
      // turning it on (or up) starts the clock now, so the first check isn't instant
      if (p.level !== "off" && p.level !== was) setSetting(this.db, "headsUpAt", new Date().toISOString());
    }
    if (patch.accent !== undefined) {
      if (!(ACCENTS as readonly string[]).includes(patch.accent)) throw new Error("That color isn't one of the choices.");
      setSetting(this.db, "accent", patch.accent);
    }
    for (const k of SECRET_KEYS) {
      const v = patch.keys?.[k];
      if (v === undefined) continue;
      if (v === null || !v.trim()) {
        await this.p.secrets.remove(`key.${k}`);
        this.keys[k] = undefined;
      } else {
        await this.p.secrets.set(`key.${k}`, v.trim());
        this.keys[k] = v.trim();
      }
    }
    if (patch.openaiBaseUrl !== undefined) {
      const url = patch.openaiBaseUrl.trim();
      if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error("That server address should start with http:// or https://.");
      setSetting(this.db, "openaiBaseUrl", url);
      this.keys.openaiBaseUrl = url || undefined;
    }
    if (patch.provider !== undefined) {
      const info = listProviders(this.keys).find((p) => p.id === patch.provider);
      if (!info) throw new Error("Unknown provider.");
      if (!info.ready) throw new Error(info.hint ?? "That provider isn't set up.");
      const model = patch.model?.trim() || DEFAULT_MODELS[info.id];
      if (!/^[\w.:/-]{1,100}$/.test(model)) throw new Error("That model name looks wrong.");
      setSetting(this.db, "provider", JSON.stringify({ provider: info.id, model }));
    }
    await this.db.flush();
    return this.state();
  }

  // ---------- chat ----------

  /** A chat's messages: channelId null is the main chat. */
  messages(channelId: number | null = null, before?: number, limit = 60): StoredMessage[] {
    return listMessages(this.db, channelId, Math.min(limit, 200), before);
  }

  async chat(
    text: string,
    emit: TurnEmitter,
    channelId: number | null = null,
    attachments: Attachment[] = [],
  ): Promise<{ message: StoredMessage; user: StoredMessage; queued?: boolean }> {
    const clean = text.trim();
    if (!clean && !attachments.length) throw new Error("Say something first.");
    if (clean.length > 20_000) throw new Error("That message is too long.");
    const channel = channelId === null ? null : getChannel(this.db, channelId);
    if (channel === undefined) throw new Error("That channel no longer exists.");
    // Back to back: while Lyra is answering in this chat, a new message joins that reply.
    const t = this.turn;
    if (t && t.open && t.channelId === channelId && !attachments.length) {
      const user = addMessage(this.db, "user", clean, {}, channelId);
      t.items.push(clean);
      t.wake?.();
      void this.db.flush();
      return { message: await t.done, user, queued: true };
    }
    // Otherwise wait for the current reply to finish (a moment ago it stopped taking more).
    while (this.running) {
      if (!this.turn) throw new Error("Lyra is still answering the last message.");
      if (this.turn.channelId !== channelId) throw new Error("Lyra is still answering in another chat.");
      await this.turn.done.catch(() => {});
    }
    this.running = new AbortController();
    let finish!: (m: StoredMessage) => void;
    let fail!: (e: unknown) => void;
    const done = new Promise<StoredMessage>((res, rej) => ((finish = res), (fail = rej)));
    done.catch(() => {});
    const turn: NonNullable<Lyra["turn"]> = { channelId, items: [], open: true, done };
    this.turn = turn;
    const inbox: TurnInbox = {
      take: () => turn.items.splice(0),
      listen: (fn) => (turn.wake = fn),
      close: () => (turn.open = false),
    };
    try {
      const provider = metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), "chat", this.db, this.p.timeZone);
      const message = await runTurn(
        {
          db: this.db,
          workspace: this.workspace,
          channel,
          connectors: this.connectors,
          provider,
          userName: this.userName,
          soul: this.customSoul,
          timeZone: this.p.timeZone,
          webSearch: this.webSearch,
        },
        clean,
        emit,
        this.running.signal,
        attachments,
        inbox,
      );
      finish(message);
      // the cards in this reply know where they are, for "jump to it" from Today
      for (const id of message.meta.actions ?? []) this.db.run("UPDATE actions SET message_id = ? WHERE id = ?", [message.id, id]);
      return { message, user: userMessageBefore(this.db, channelId, message.id) };
    } catch (e) {
      fail(e);
      throw e;
    } finally {
      turn.open = false;
      if (this.turn === turn) this.turn = undefined;
      this.running = undefined;
      void this.db.flush();
    }
  }

  stop(): void {
    this.running?.abort();
  }

  /** A reply is being written or a worker is running: not a moment to swap the data out. */
  get busy(): boolean {
    return !!this.running || this.workers.busyCount > 0;
  }

  async deleteMessage(id: number): Promise<void> {
    deleteMessage(this.db, id);
    await this.db.flush();
  }

  async pinMessage(id: number, pinned: boolean): Promise<StoredMessage> {
    const m = getMessage(this.db, id);
    if (!m) throw new Error("That message no longer exists.");
    const meta = { ...m.meta };
    if (pinned) meta.pinned = true;
    else delete meta.pinned;
    updateMessageMeta(this.db, id, meta);
    await this.db.flush();
    return { ...m, meta };
  }

  pinned(channelId: number | null): StoredMessage[] {
    return pinnedMessages(this.db, channelId);
  }

  // ---------- memory ----------

  private view(book: Notebook): MemoryView {
    return { content: book.read(), sections: book.view(), history: book.history() };
  }

  memoryView(): MemoryView {
    return this.view(this.memory);
  }

  async saveMemory(content: string): Promise<MemoryView> {
    if (content.length > 200_000) throw new Error("That memory file is too big.");
    await this.memory.replace(content);
    return this.memoryView();
  }

  async restoreMemory(id: number): Promise<MemoryView> {
    await this.memory.restore(id);
    return this.memoryView();
  }

  private async bookFor(scope: string | undefined): Promise<Notebook> {
    if (!scope || scope === "main") return this.memory;
    const id = Number(scope.replace(/^channel:/, ""));
    if (!getChannel(this.db, id)) throw new Error("That channel no longer exists.");
    return this.notebook(id);
  }

  /** Undo a note shown under a chat message, or answer a held suggestion. */
  async note(messageId: number, index: number, action: "undo" | "accept" | "dismiss"): Promise<StoredMessage> {
    const msg = getMessage(this.db, messageId);
    const note = msg?.meta.memory?.[index];
    if (!msg || !note) throw new Error("That note is gone.");
    const book = await this.bookFor(note.notebook);
    if (!book.section(note.section)) throw new Error("That note is gone.");

    if (action === "undo" && !note.undone) {
      if (note.kind === "saved") {
        const r = await book.forget(note.section, note.text);
        if ("error" in r) throw new Error("That line was already changed.");
      } else if (note.kind === "removed") await book.remember(note.section, note.text);
      else throw new Error("Nothing to undo.");
      note.undone = true;
    } else if ((action === "accept" || action === "dismiss") && note.kind === "suggested" && note.suggestionId) {
      const r = await book.resolveSuggestion(note.suggestionId, action === "accept");
      note.kind = action === "accept" ? "saved" : "dismissed";
      note.text = r.text;
      if (r.snapshotId) note.snapshotId = r.snapshotId;
    } else throw new Error("Unknown action.");

    updateMessageMeta(this.db, msg.id, msg.meta);
    return getMessage(this.db, msg.id)!;
  }

  // ---------- channels ----------

  channels(): ChannelSummary[] {
    return listChannels(this.db);
  }

  private notebook(id: number): Promise<Notebook> {
    let p = this.notebooks.get(id);
    if (!p) {
      const c = getChannel(this.db, id);
      if (!c) return Promise.reject(new Error("That channel no longer exists."));
      p = Notebook.open(this.db, this.p.texts, channelNotebookSpec(c.id, c.name, c.about));
      p.catch(() => this.notebooks.delete(id));
      this.notebooks.set(id, p);
    }
    return p;
  }

  private clean(input: ChannelInput, current?: Channel): { name: string; about: string; icon: string } {
    const name = cleanItem(input.name ?? current?.name ?? "").slice(0, 32);
    if (!name) throw new Error("Give the channel a name.");
    if (name.toLowerCase() === "main" || name.toLowerCase() === "everything") throw new Error(`"${name}" is taken by the main chat.`);
    const clash = findChannel(this.db, name);
    if (clash && clash.id !== current?.id) throw new Error(`There's already a ${clash.name} channel.`);
    const about = cleanItem(input.about ?? current?.about ?? "").slice(0, 280);
    const icon = (CHANNEL_ICONS as readonly string[]).includes(input.icon ?? "") ? input.icon! : (current?.icon ?? "star");
    return { name, about, icon };
  }

  async createChannel(input: ChannelInput): Promise<Channel> {
    const c = this.clean(input);
    const row = this.db.run<Channel>("INSERT INTO channels (name, about, icon) VALUES (?, ?, ?) RETURNING *", [c.name, c.about, c.icon])!;
    await this.notebook(row.id);
    await this.db.flush();
    return row;
  }

  async updateChannel(id: number, input: Partial<ChannelInput>): Promise<Channel> {
    const current = getChannel(this.db, id);
    if (!current) throw new Error("That channel no longer exists.");
    const c = this.clean({ name: input.name ?? current.name, about: input.about, icon: input.icon }, current);
    const row = this.db.run<Channel>("UPDATE channels SET name = ?, about = ?, icon = ? WHERE id = ? RETURNING *", [c.name, c.about, c.icon, id])!;
    await this.db.flush();
    return row;
  }

  /** Deletes the channel, its chat and its notebook. Main memory is untouched. */
  async deleteChannel(id: number): Promise<void> {
    if (!getChannel(this.db, id)) return;
    const book = await this.notebook(id);
    await book.destroy();
    this.notebooks.delete(id);
    this.db.run("DELETE FROM messages WHERE channel_id = ?", [id]);
    this.db.run("DELETE FROM channels WHERE id = ?", [id]);
    await this.db.flush();
  }

  async channelView(id: number): Promise<ChannelView> {
    const channel = getChannel(this.db, id);
    if (!channel) throw new Error("That channel no longer exists.");
    return { channel, notebook: this.view(await this.notebook(id)) };
  }

  async saveChannelNotebook(id: number, content: string): Promise<ChannelView> {
    if (content.length > 200_000) throw new Error("That notebook is too big.");
    await (await this.notebook(id)).replace(content);
    return this.channelView(id);
  }

  async restoreChannelNotebook(id: number, snapshotId: number): Promise<ChannelView> {
    await (await this.notebook(id)).restore(snapshotId);
    return this.channelView(id);
  }

  // ---------- tasks ----------

  tasks(query: T.TaskQuery = {}): T.TaskRow[] {
    return T.listTasks(this.db, query);
  }

  task(id: number): T.TaskDetail {
    const d = T.taskDetail(this.db, id);
    if (!d) throw new Error("That task no longer exists.");
    return d;
  }

  taskCounts(): Record<T.TaskStatus, number> {
    return T.taskCounts(this.db);
  }

  private async saved<R>(r: R): Promise<R> {
    await this.db.flush();
    return r;
  }

  async createTask(input: T.NewTask): Promise<T.TaskRow> {
    return this.saved(T.createTask(this.db, input, "you"));
  }

  async updateTask(id: number, patch: T.TaskPatch): Promise<T.TaskDetail> {
    T.updateTask(this.db, id, patch, "you");
    return this.saved(this.task(id));
  }

  async addTaskStep(id: number, text: string): Promise<T.TaskDetail> {
    if (!T.getTask(this.db, id)) throw new Error("That task no longer exists.");
    T.addStep(this.db, id, text, true, "you");
    return this.saved(this.task(id));
  }

  async setTaskStep(stepId: number, done: boolean): Promise<T.TaskDetail> {
    const s = T.setStepDone(this.db, stepId, done, "you");
    return this.saved(this.task(s.task_id));
  }

  async removeTaskStep(taskId: number, stepId: number): Promise<T.TaskDetail> {
    T.removeStep(this.db, stepId);
    return this.saved(this.task(taskId));
  }

  async deleteTask(id: number): Promise<void> {
    T.deleteTask(this.db, id);
    await this.db.flush();
  }

  // ---------- workers ----------

  /** Subscribe to background activity (task changes, worker reports). Returns an unsubscribe function. */
  onChange(fn: (e: LyraEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async startTask(id: number, note?: string): Promise<T.TaskDetail> {
    this.workers.start(id, "you", note);
    return this.saved(this.task(id));
  }

  async stopTask(id: number): Promise<T.TaskDetail> {
    this.workers.stop(id);
    await this.workers.done(id);
    return this.saved(this.task(id));
  }

  workerRuns(id: number): WorkerRun[] {
    return this.workers.runs(id);
  }

  /** The report doc a task's worker wrote (Phase 15), if any. */
  taskReport(id: number): { id: number; title: string } | null {
    const d = D.reportFor(this.db, id);
    return d ? { id: d.id, title: d.title } : null;
  }

  taskActivity(id: number): string | undefined {
    return this.workers.isRunning(id) ? (this.workers.activity.get(id) ?? "Working") : undefined;
  }

  // ---------- soul ----------

  /** Who Lyra is: the built-in soul, or the user's edited one. */
  soul(): { content: string; custom: boolean } {
    return { content: this.customSoul ?? DEFAULT_SOUL, custom: !!this.customSoul };
  }

  async saveSoul(content: string): Promise<{ content: string; custom: boolean }> {
    const text = content.trim();
    if (!text) throw new Error("The soul can't be empty. Use Reset to go back to the original.");
    if (text.length > 20_000) throw new Error("That's too long. Keep the soul under 20,000 characters.");
    this.customSoul = text === DEFAULT_SOUL.trim() ? undefined : text;
    if (this.customSoul) await this.p.texts.write("soul.md", `${text}\n`);
    else await this.clearSoulFile();
    return this.soul();
  }

  async resetSoul(): Promise<{ content: string; custom: boolean }> {
    this.customSoul = undefined;
    await this.clearSoulFile();
    return this.soul();
  }

  private async clearSoulFile() {
    if (this.p.texts.remove) await this.p.texts.remove("soul.md");
    else await this.p.texts.write("soul.md", "");
  }

  // ---------- routines ----------

  routines(): (R.RoutineRow & { schedule: string; running: boolean })[] {
    return R.listRoutines(this.db).map((r) => ({ ...r, schedule: R.describeSchedule(r.times, r.days), running: this.routinesRunner.isRunning(r.id) }));
  }

  routine(id: number): { routine: R.RoutineRow & { schedule: string; running: boolean }; runs: R.RoutineRun[] } {
    const r = this.routines().find((x) => x.id === id);
    if (!r) throw new Error("That routine no longer exists.");
    return { routine: r, runs: R.routineRuns(this.db, id) };
  }

  routinePresets() {
    const have = new Set(R.listRoutines(this.db).map((r) => r.name.toLowerCase()));
    return R.PRESETS.map((p) => ({ ...p, added: have.has(p.name.toLowerCase()) }));
  }

  async createRoutine(input: R.RoutineInput): Promise<R.RoutineRow> {
    const r = R.createRoutine(this.db, input);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: r.id }));
    return r;
  }

  async addPreset(key: string): Promise<R.RoutineRow> {
    const p = R.PRESETS.find((x) => x.key === key);
    if (!p) throw new Error("Unknown routine.");
    return this.createRoutine(p);
  }

  async updateRoutine(id: number, input: Partial<R.RoutineInput>): Promise<R.RoutineRow> {
    const r = R.updateRoutine(this.db, id, input);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: id }));
    return r;
  }

  async deleteRoutine(id: number): Promise<void> {
    R.deleteRoutine(this.db, id);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: id }));
  }

  runRoutine(id: number): void {
    this.routinesRunner.runNow(id);
  }

  /** Called every minute while the app is open, and when it opens: runs anything due. */
  tickRoutines(now = new Date()): number[] {
    const started = this.routinesRunner.tick(now);
    this.tickReminders(now);
    if (!this.tickHeadsUp(now) && !this.tickCheckIn(now) && !this.tickTidy(now)) this.tickStyle(now);
    return started;
  }

  // ---------- talking like the user ----------

  private learningStyle = false;

  /** What Lyra has noticed about how the user talks, and whether she mirrors it. */
  talkStyle(): { on: boolean; notes: string[]; updatedAt: string | null; newMessages: number } {
    const s = ST.readStyle(this.db);
    return { on: ST.mirrorOn(this.db), notes: s?.notes ?? [], updatedAt: s?.updatedAt ?? null, newMessages: ST.newSince(this.db, s?.updatedAt) };
  }

  /**
   * Relearn how the user talks every few days once they've sent enough new messages,
   * while they're not mid-conversation. Only their own messages are read.
   */
  tickStyle(now = new Date()): boolean {
    if (!ST.mirrorOn(this.db) || this.learningStyle || this.busy) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    const s = ST.readStyle(this.db);
    if (s && now.getTime() - new Date(s.updatedAt).getTime() < 3 * 86_400_000) return false;
    const tried = getSetting(this.db, "styleTriedAt");
    if (tried && now.getTime() - new Date(tried).getTime() < 86_400_000) return false;
    if (ST.newSince(this.db, s?.updatedAt) < ST.STYLE_MIN_NEW) return false;
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 15 * 60_000) return false;
    setSetting(this.db, "styleTriedAt", now.toISOString());
    void this.learnStyleNow().catch((e) => console.error("[lyra] learning how you talk failed", e));
    return true;
  }

  /** Learn now (also the Settings button). Throws when there isn't enough to go on. */
  async learnStyleNow(): Promise<{ on: boolean; notes: string[]; updatedAt: string | null; newMessages: number }> {
    if (this.learningStyle) throw new Error("Already on it.");
    this.learningStyle = true;
    try {
      const samples = ST.styleSamples(this.db);
      if (samples.length < 10) throw new Error("Lyra needs a few more of your messages to go on. Keep chatting!");
      const provider = metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), "proactive", this.db, this.p.timeZone);
      const notes = await ST.learnStyle(provider, samples, ST.readStyle(this.db)?.notes ?? [], this.userName);
      if (!notes) throw new Error("Not enough to go on yet. Keep chatting and Lyra will pick it up.");
      ST.saveStyle(this.db, notes, samples.length);
      await this.db.flush();
      return this.talkStyle();
    } finally {
      this.learningStyle = false;
    }
  }

  async forgetStyle(): Promise<{ on: boolean; notes: string[]; updatedAt: string | null; newMessages: number }> {
    ST.clearStyle(this.db);
    await this.db.flush();
    return this.talkStyle();
  }

  // ---------- the weekly memory tidy-up (Phase 10) ----------

  private tidying = false;

  get tidyOn(): boolean {
    return getSetting(this.db, "tidy") !== "off";
  }

  /** Once a week, in the daytime, when there's enough saved to be worth it and the user isn't mid-conversation. */
  tickTidy(now = new Date()): boolean {
    if (!this.tidyOn || this.tidying || this.busy) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (local < "09:00" || local >= "20:00" || inQuietHours(local, this.proactive)) return false;
    const lastAt = getSetting(this.db, "tidyAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < 7 * 86_400_000) return false;
    if (this.memory.count() < 12) return false;
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 3600_000) return false;
    setSetting(this.db, "tidyAt", now.toISOString());
    void this.tidyNow().catch((e) => console.error("[lyra] tidy-up failed", e));
    return true;
  }

  /** Tidy now (also the Memory page's button). Posts what changed, or says it's already tidy. */
  async tidyNow(): Promise<{ changed: boolean; changes: string[] }> {
    if (this.tidying) throw new Error("Already tidying.");
    this.tidying = true;
    try {
      const provider = metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), "proactive", this.db, this.p.timeZone);
      const before = this.memory.read();
      const today = new Date().toLocaleDateString("en-US", { timeZone: this.p.timeZone, dateStyle: "full" });
      const r = await runTidy(provider, before, this.memory.sections, this.userName, today);
      if (!r || r.content === before) return { changed: false, changes: [] };
      // the notebook may have changed while the model was thinking: don't overwrite that
      if (this.memory.read() !== before) return { changed: false, changes: [] };
      const snapshotId = await this.memory.tidy(r.content);
      addMessage(this.db, "assistant", `I tidied up my notes about you:\n${r.changes.map((c) => `- ${c}`).join("\n")}`, { tidy: { snapshotId } }, null);
      this.listeners.forEach((l) => l({ type: "message", channelId: null }));
      await this.db.flush();
      return { changed: true, changes: r.changes };
    } finally {
      this.tidying = false;
    }
  }

  /** Put the notebook back the way it was before that tidy-up. */
  async undoTidy(messageId: number): Promise<void> {
    const m = getMessage(this.db, messageId);
    if (!m?.meta.tidy || m.meta.tidy.undone) throw new Error("Nothing to undo there.");
    await this.memory.restore(m.meta.tidy.snapshotId);
    updateMessageMeta(this.db, messageId, { ...m.meta, tidy: { ...m.meta.tidy, undone: true } });
    this.listeners.forEach((l) => l({ type: "message", channelId: null }));
    await this.db.flush();
  }

  async setTidy(on: boolean): Promise<void> {
    setSetting(this.db, "tidy", on ? "on" : "off");
    await this.db.flush();
  }

  // ---------- Spotify (Phase 14) ----------

  private get spotifyLink(): { name: string; connected_at: string } | undefined {
    try {
      const raw = getSetting(this.db, "spotify");
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  get spotifyLinked(): boolean {
    return !!this.spotifyLink;
  }

  async spotifyState(): Promise<{ available: boolean; clientId: string | null; connected: boolean; name?: string; playback: boolean; playlists: boolean }> {
    return {
      available: !!this.p.oauth,
      clientId: await this.spotify.clientId(),
      connected: this.spotifyLinked,
      name: this.spotifyLink?.name,
      playback: this.spotifyLinked && getSetting(this.db, "spotify.playback") === "on",
      playlists: this.actionsAllowed().playlist,
    };
  }

  private spotifyScopes(extra: { playback?: boolean; playlists?: boolean } = {}): string[] {
    const playback = extra.playback ?? getSetting(this.db, "spotify.playback") === "on";
    const playlists = extra.playlists ?? getSetting(this.db, "spotify.playlists") === "on";
    return [...SPOTIFY_READ, ...(playback ? SPOTIFY_PLAYBACK : []), ...(playlists ? SPOTIFY_PLAYLISTS : [])];
  }

  /** Sign in to Spotify (the user's own Spotify app's Client ID, the first time). */
  async connectSpotify(clientId?: string): Promise<AppState> {
    if (!this.p.oauth) throw new Error("Spotify sign-in works in the Android app and the newest Windows app.");
    if (clientId) await this.spotify.setClientId(clientId);
    const r = await this.spotify.connect(this.p.oauth, this.spotifyScopes());
    setSetting(this.db, "spotify", JSON.stringify({ name: r.name, connected_at: new Date().toISOString() }));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  async disconnectSpotify(): Promise<AppState> {
    await this.spotify.forget();
    for (const k of ["spotify", "spotify.playback", "spotify.playlists"]) this.db.run("DELETE FROM settings WHERE key = ?", [k]);
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  /** Playback control or playlist changes: turning one on signs in again with that permission added. */
  async allowSpotify(what: "playback" | "playlists", on: boolean): Promise<AppState> {
    if (!this.spotifyLinked) throw new Error("Connect Spotify first.");
    if (on) {
      if (!this.p.oauth) throw new Error("Spotify sign-in isn't available here.");
      const r = await this.spotify.connect(this.p.oauth, this.spotifyScopes({ [what]: true }));
      const need = what === "playback" ? SPOTIFY_PLAYBACK : SPOTIFY_PLAYLISTS;
      if (!need.every((s) => r.scope.split(" ").includes(s))) throw new Error("Spotify didn't grant that permission.");
    }
    setSetting(this.db, `spotify.${what}`, on ? "on" : "off");
    await this.db.flush();
    return this.state();
  }

  /** Play, pause, skip or queue, when the user asked (playback switch on). */
  async controlMusic(action: string, uri?: string): Promise<string> {
    const u = uri?.trim();
    if (u && !/^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/.test(u)) throw new Error("Give a spotify: URI from search.");
    switch (action) {
      case "play":
        await this.spotify.call("PUT", "/me/player/play", u ? (u.startsWith("spotify:track:") ? { uris: [u] } : { context_uri: u }) : undefined);
        return u ? "Playing it." : "Playing.";
      case "pause":
        await this.spotify.call("PUT", "/me/player/pause");
        return "Paused.";
      case "next":
        await this.spotify.call("POST", "/me/player/next");
        return "Skipped to the next song.";
      case "previous":
        await this.spotify.call("POST", "/me/player/previous");
        return "Back to the previous song.";
      case "queue":
        if (!u?.startsWith("spotify:track:")) throw new Error("Queue takes one song's spotify:track: URI.");
        await this.spotify.call("POST", `/me/player/queue?uri=${encodeURIComponent(u)}`);
        return "Added to the queue.";
      default:
        throw new Error("Action must be play, pause, next, previous or queue.");
    }
  }

  // ---------- skills (Phase 17) ----------

  skills(): S.Skill[] {
    return S.listSkills(this.db);
  }

  async saveSkill(id: number | null, input: { name: string; use_when: string; steps: string }): Promise<S.Skill> {
    const r = S.saveSkill(this.db, { id, ...input });
    await this.db.flush();
    return r.skill;
  }

  async deleteSkill(id: number): Promise<void> {
    S.deleteSkill(this.db, id);
    await this.db.flush();
  }

  // ---------- docs (Phase 13) ----------

  docs(): D.Doc[] {
    return D.listDocs(this.db);
  }

  doc(id: number): D.Doc | undefined {
    return D.getDoc(this.db, id);
  }

  /** Edited by hand in the app. */
  async saveDoc(id: number | null, patch: { title: string; body: string }): Promise<D.Doc> {
    const d = id === null ? D.createDoc(this.db, patch) : D.updateDoc(this.db, id, patch);
    await this.db.flush();
    return d;
  }

  async deleteDoc(id: number): Promise<void> {
    D.deleteDoc(this.db, id);
    await this.db.flush();
  }

  private docsToken: TokenSource | undefined;

  /** Save (or update) the doc in Google Docs. The first time, Google asks for access to the docs Lyra creates. */
  async saveDocToGoogle(id: number): Promise<D.Doc> {
    const d = D.getDoc(this.db, id);
    if (!d) throw new Error("That doc is no longer here.");
    if (!this.p.google.available) throw new Error("Google sign-in isn't available here.");
    this.docsToken ??= new TokenSource(this.p.google, [DRIVE_FILE]);
    const attempt = async (doc: D.Doc) => {
      try {
        return await D.saveToGoogleDocs(doc, this.docsToken!, this.fetch);
      } catch (e) {
        if ((e as Error).message !== "NEEDS_CONSENT") throw e;
        const r = await this.p.google.authorize([DRIVE_FILE], true);
        if (!grantIsAllowed(r.grantedScopes, DRIVE_FILE)) throw new Error("Google granted more than Lyra asked for, so Lyra didn't keep it.");
        await this.docsToken!.invalidate();
        return D.saveToGoogleDocs(doc, this.docsToken!, this.fetch);
      }
    };
    let r: { id: string; link: string };
    try {
      r = await attempt(d);
    } catch (e) {
      // deleted in Google: make a new one
      if ((e as Error).message !== "GONE") throw e;
      r = await attempt({ ...d, gdoc_id: null });
    }
    this.db.run("UPDATE docs SET gdoc_id = ?, gdoc_link = ? WHERE id = ?", [r.id, r.link, id]);
    await this.db.flush();
    return D.getDoc(this.db, id)!;
  }

  // ---------- people (Phase 10) ----------

  people(): P.Person[] {
    return P.listPeople(this.db);
  }

  person(id: number): P.Person | undefined {
    return P.getPerson(this.db, id);
  }

  async savePerson(id: number | null, patch: Partial<Pick<P.Person, "name" | "aliases" | "emails" | "phones" | "relation" | "notes">>): Promise<P.Person> {
    const p = id === null ? P.rememberPerson(this.db, { name: patch.name ?? "", relation: patch.relation }).person : P.getPerson(this.db, id);
    if (!p) throw new Error("That person is no longer here.");
    const saved = P.updatePerson(this.db, p.id, patch);
    await this.db.flush();
    return saved;
  }

  async deletePerson(id: number): Promise<void> {
    P.deletePerson(this.db, id);
    await this.db.flush();
  }

  /** The phone's contacts are on for this device (and the phone can). */
  get contactsOn(): boolean {
    return !!this.p.contacts?.available && getSetting(this.db, "contacts") === "on";
  }

  async allowContacts(on: boolean): Promise<AppState> {
    if (on) {
      if (!this.p.contacts?.available) throw new Error("Contacts work in the Android app.");
      if (!(await this.p.contacts.allow())) throw new Error("Android didn't allow Lyra to read contacts. You can allow it in your phone's Settings, Apps, Lyra.");
    }
    setSetting(this.db, "contacts", on ? "on" : "off");
    await this.db.flush();
    return this.state();
  }

  // ---------- check-ins: when nothing needs you, Lyra asks for work ----------

  /**
   * Once a day (Light) or every 8 hours (Active), in the daytime and never in quiet hours:
   * if nothing is waiting on the user, they aren't mid-conversation, and they've answered
   * the last check-in, Lyra offers to take something on or asks to get to know them.
   */
  tickCheckIn(now = new Date()): boolean {
    const p = this.proactive;
    if (p.level === "off" || !p.checkIns) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    if (this.busy || this.routinesRunner.headsUpRunning) return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (inQuietHours(local, p) || local < "09:00" || local >= "20:00") return false;
    const lastAt = getSetting(this.db, "checkInAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < CHECK_IN_EVERY[p.level]) return false;
    // something already needs them, or Lyra is busy on their behalf: no need to ask for more
    if (todayView(this.db, { timeZone: this.p.timeZone, now }).needs > 0) return false;
    if (this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'working'")!.n > 0) return false;
    // not in the middle of talking
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 2 * 3600_000) return false;
    // the last one is still unanswered: don't stack them (give up waiting after 3 days)
    const lastId = Number(getSetting(this.db, "checkInMessage") ?? 0);
    if (lastId && lastAt && now.getTime() - new Date(lastAt).getTime() < 3 * 86_400_000) {
      const answered = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND channel_id IS NULL AND id > ?", [lastId])!.n > 0;
      if (!answered) return false;
    }
    setSetting(this.db, "checkInAt", now.toISOString());
    let recent: string[] = [];
    try {
      recent = JSON.parse(getSetting(this.db, "checkInRecent") || "[]");
    } catch {
      recent = [];
    }
    this.routinesRunner.headsUp(
      {
        name: "Check-in",
        instructions: checkInInstructions(this.userName, recent, this.actionsAllowed()),
        last_run_at: lastAt || null,
        last_summary: "",
        post_mode: "news",
        channel_id: null,
      },
      (messageId, text) => {
        if (messageId === null) return;
        setSetting(this.db, "checkInMessage", String(messageId));
        setSetting(this.db, "checkInRecent", JSON.stringify([text.replace(/\s+/g, " ").slice(0, 200), ...recent].slice(0, 6)));
        this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Lyra", body: text.split("\n")[0].slice(0, 160) } }));
      },
      "checkIn",
    );
    return true;
  }

  // ---------- heads-ups ----------

  /**
   * Every so often (Settings: Light every 4 hours, Active every hour, never in quiet hours)
   * Lyra checks mail, calendar, tasks and loose ends, and posts only if something needs the user.
   * Returns true when a check started.
   */
  tickHeadsUp(now = new Date()): boolean {
    const p = this.proactive;
    if (p.level === "off") return false;
    // the practice model can't really check anything
    if (!this.p.provider && this.choice().provider === "fake") return false;
    if (this.busy || this.routinesRunner.headsUpRunning) return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (inQuietHours(local, p)) return false;
    const lastAt = getSetting(this.db, "headsUpAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < HEADS_UP_EVERY[p.level]) return false;
    setSetting(this.db, "headsUpAt", now.toISOString());
    const sources = this.connectors.status().filter((c) => c.state === "connected").map((c) => c.id);
    this.routinesRunner.headsUp(
      {
        name: "Heads-up check",
        instructions: headsUpInstructions(sources, this.userName, p.level),
        last_run_at: lastAt || null,
        last_summary: getSetting(this.db, "headsUpLast") ?? "",
        post_mode: "news",
        channel_id: null,
      },
      (messageId, text) => {
        if (messageId === null) return;
        setSetting(this.db, "headsUpLast", text.slice(0, 800));
        this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Heads-up from Lyra", body: text.split("\n")[0].slice(0, 160) } }));
      },
    );
    return true;
  }

  // ---------- reminders and follow-ups ----------

  /** What Lyra did on its own since then: routine posts, heads-ups, reminders, tasks now ready. */
  away(since: string): { items: AwayItem[]; more: number } {
    return awaySince(this.db, since);
  }

  reminders(): Reminder[] {
    return pendingReminders(this.db);
  }

  async cancelReminder(id: number): Promise<void> {
    cancelReminder(this.db, id);
    this.listeners.forEach((l) => l({ type: "reminder" }));
    await this.db.flush();
  }

  /** Post what's due: reminders as a message, follow-ups after Lyra has checked. */
  private tickReminders(now: Date): void {
    const due = dueReminders(this.db, now);
    if (!due.length) return;
    for (const r of due) {
      // marked first, so a second tick can't post it twice
      finishReminder(this.db, r.id, null);
      const late = now.getTime() - new Date(r.due_at).getTime() > 10 * 60_000 ? ` (was due ${describeDue(new Date(r.due_at), this.p.timeZone, now)})` : "";
      const channelId = r.channel_id && getChannel(this.db, r.channel_id) ? r.channel_id : null;
      const announce = (messageId: number, title: string, body: string) => {
        this.db.run("UPDATE reminders SET message_id = ? WHERE id = ?", [messageId, r.id]);
        const m = getMessage(this.db, messageId);
        if (m) updateMessageMeta(this.db, messageId, { ...m.meta, reminder: { id: r.id, kind: r.kind } });
        // the phone already showed a scheduled notification at the time
        this.listeners.forEach((l) => l({ type: "message", channelId, notify: { title, body: body.split("\n")[0].slice(0, 160), scheduled: true } }));
        void this.db.flush();
      };
      if (r.kind === "remind") {
        const msg = addMessage(this.db, "assistant", `Reminder: ${r.text}${late}`, {}, channelId);
        announce(msg.id, "Reminder", r.text);
      } else {
        this.routinesRunner.followUp({ text: r.text, createdAt: r.created_at, channelId }, (messageId, text) => {
          const id = messageId ?? addMessage(this.db, "assistant", `I said I'd check on this: ${r.text}\n\nI couldn't just now${text ? ` (${text})` : ""}. Want me to try again later?`, {}, channelId).id;
          announce(id, "Lyra followed up", text || r.text);
        });
      }
    }
    this.listeners.forEach((l) => l({ type: "reminder" }));
    void this.db.flush();
  }

  // ---------- Google (Mail, Calendar, Drive) ----------

  /** Ask Google for one service's read-only access. */
  async connectGoogle(id: GoogleId): Promise<AppState> {
    const g = GOOGLE.find((x) => x.id === id);
    if (!g) throw new Error("Unknown connection.");
    if (!this.p.google.available) throw new Error(`${g.label} sign-in works in the Android app.`);
    const r = await this.p.google.authorize([g.scope], true);
    if (!grantIsAllowed(r.grantedScopes, g.scope)) throw new Error(`Google granted more than read-only ${g.noun} access, so Lyra didn't keep it.`);
    await this.tokenFor(id).invalidate();
    let email = r.email ?? GOOGLE.map((x) => this.link(x.id)?.email).find(Boolean);
    if (!email && id === "gmail") email = await gmailProfile(this.tokenFor(id), this.fetch);
    setSetting(this.db, id, JSON.stringify({ email, connected_at: new Date().toISOString() } satisfies GmailLink));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  /**
   * Stop using one service. Google treats Lyra's access as one grant, so it's
   * only revoked at Google when the last service is disconnected.
   */
  async disconnectGoogle(id: GoogleId): Promise<AppState> {
    const g = GOOGLE.find((x) => x.id === id);
    if (!g) throw new Error("Unknown connection.");
    const others = GOOGLE.filter((x) => x.id !== id && this.link(x.id));
    if (!others.length) {
      try {
        const email = this.link(id)?.email;
        if (email && this.p.google.revoke) await this.p.google.revoke([g.scope], email);
        else {
          const token = await this.tokenFor(id).get();
          await this.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
        }
      } catch {
        /* already signed out or offline: forgetting locally is still right */
      }
    }
    await this.tokenFor(id).invalidate();
    this.db.run("DELETE FROM settings WHERE key = ?", [id]);
    for (const k of ["email", "event"] as const) if (ACTION_ACCESS[k].link === id) this.db.run("DELETE FROM settings WHERE key = ?", [ACTION_ACCESS[k].setting]);
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  connectGmail(): Promise<AppState> {
    return this.connectGoogle("gmail");
  }

  disconnectGmail(): Promise<AppState> {
    return this.disconnectGoogle("gmail");
  }

  /** Save everything now (the app calls this when it goes to the background). */
  flush(): Promise<void> {
    return this.db.flush();
  }

  // ---------- backup ----------

  private changeListeners = new Set<() => void>();
  /** Called whenever Lyra's data changes (sync watches this). */
  onDataChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
  private dataChanged() {
    this.changeListeners.forEach((f) => f());
  }

  /** Everything Lyra knows, encrypted with the passphrase. API keys and Google sign-ins stay out. */
  async backup(passphrase: string): Promise<Uint8Array> {
    await this.db.flush();
    const files: Record<string, string> = {};
    const names = ["memory.md", "soul.md", ...listChannels(this.db).map((c) => channelNotebookSpec(c.id, c.name, c.about).file)];
    for (const n of names) {
      const t = await this.p.texts.read(n);
      if (t !== null) files[n] = t;
    }
    const payload: BackupPayload = { format: "lyra-backup", version: 1, createdAt: new Date().toISOString(), db: toBase64(this.db.exportBytes()), files };
    return encryptBackup(payload, passphrase);
  }

  /**
   * Replace everything on this phone with a backup. Afterwards this engine is
   * finished: the app must restart (reload) to load the restored data.
   */
  async restore(file: Uint8Array, passphrase: string, opts: { keepThisDevice?: boolean } = {}): Promise<{ messages: number; channels: number }> {
    const payload = await decryptBackup(file, passphrase);
    // Settings that belong to a device, not to Lyra: Google sign-ins are always this
    // device's own; for sync, this device also keeps its lock and notification choices.
    const local = opts.keepThisDevice
      ? this.db.all<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE key IN (${DEVICE_SETTINGS.map(() => "?").join(",")})`, [...DEVICE_SETTINGS])
      : [];
    let bytes: Uint8Array;
    let channels: { id: number; name: string; about: string }[];
    let messages: number;
    try {
      const probe = new this.p.SQL.Database(fromBase64(payload.db));
      messages = Number(probe.exec("SELECT count(*) FROM messages")[0]?.values[0][0] ?? 0);
      channels = (probe.exec("SELECT id, name, about FROM channels")[0]?.values ?? []).map(([id, name, about]) => ({ id: Number(id), name: String(name), about: String(about ?? "") }));
      probe.run(`DELETE FROM settings WHERE key IN (${(opts.keepThisDevice ? DEVICE_SETTINGS : GOOGLE_LINKS).map((k) => `'${k}'`).join(",")})`);
      for (const { key, value } of local) probe.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
      bytes = probe.export();
      probe.close();
    } catch {
      throw new Error("This backup is damaged and can't be restored.");
    }
    if (!this.p.blobs) throw new Error("This device can't restore backups.");

    // stop everything that could write, then swap the files underneath
    this.running?.abort();
    this.workers.stopAll();
    await this.workers.settle();
    await this.db.detach();
    await this.p.blobs.write("lyra.db", bytes);
    for (const [name, text] of Object.entries(payload.files)) {
      if (/^(memory|soul|channel-\d+)\.md$/.test(name)) await this.p.texts.write(name, text);
    }
    if (!("soul.md" in payload.files)) await this.p.texts.write("soul.md", "");
    // a channel whose notebook wasn't in the backup starts fresh, not with this phone's old file
    for (const c of channels) {
      const spec = channelNotebookSpec(c.id, c.name, c.about);
      if (!(spec.file in payload.files)) await this.p.texts.write(spec.file, spec.template);
    }
    return { messages, channels: channels.length };
  }
}

/** What a heads-up check looks for, and how high the bar is for speaking up. */
/** A check-in: nothing needs the user, so Lyra asks for work or gets to know them. */
export function checkInInstructions(userName: string, recent: string[], can: { email: boolean; event: boolean }): string {
  const user = userName === "you" ? "the user" : userName;
  const extra = [can.email && "write emails for their OK", can.event && "add calendar events for their OK"].filter(Boolean).join(", ");
  return `This is a check-in. Things are quiet: nothing needs ${user} right now, and you have room to take more on. Like a good chief of staff with a free afternoon, ask for work or get to know ${user} better.

Pick ONE, whichever would help most right now:
1. Offer a specific project you could do for them, grounded in what you know or can see: their memory and open loops, recent mail, the calendar for the coming week, open tasks. Say what you'd do and what they'd get ("I could go through this week's school emails and pull out every date and form into one list. Want that?"). Only offer what you can really do: research, summarize, compare, plan, draft, keep track, set up a routine or reminders${extra ? `, ${extra}` : ""}.
2. Ask one question that would make you more useful and that your memory doesn't answer yet: their work, the people who matter to them, their week, their goals, how they like you to help. One question, not a questionnaire.
3. Ask what's on their plate this week that you could take off it.

Keep it to two short sentences, warm, no preamble, no "just checking in". Give up to three short replies they can tap (options), written as they'd say them, like "Yes, do that", "Not this week", "Ask me later".
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
    "- Loose ends in memory: something they said they'd do or decide that's now due.",
  ].filter(Boolean);
  return `This is a heads-up check: you're looking in on ${user}'s day on your own, without being asked.

Look at:
${look.join("\n")}

Speak up only for something ${user} would actually want to be interrupted for${level === "light" ? " (the bar is high: only things that matter today)" : ""}. Most checks should end with nothing_new. Skip anything you mentioned last time unless it changed, and skip newsletters, promotions and automated mail.

If you do post: lead with the one thing that matters most, then at most two more, each in a line, and the next step for each. No greeting, no recap of what you checked.`;
}

/** The user message that started a reply: the first one after the previous assistant message. */
function userMessageBefore(db: DB, channelId: number | null, replyId: number): StoredMessage {
  const recent = listMessages(db, channelId, 40).filter((m) => m.id < replyId);
  let i = recent.length - 1;
  while (i > 0 && recent[i - 1].role === "user") i--;
  return recent[i];
}
