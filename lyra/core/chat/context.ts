/** What a chat turn works with: the workspace (Lyra's abilities, as chat sees them), the turn's context, its emitter and inbox. */
import type { Connectors } from "../connectors/registry.ts";
import { type Channel, type ChannelSummary, type DB, type MemoryNote } from "../db.ts";
import { type Notebook } from "../memory.ts";
import type { RoutineInput } from "../routines.ts";
import { type ModelProvider } from "../providers/types.ts";

export const CHANNEL_ICONS = ["home", "sprout", "game", "heart", "work", "travel", "tools", "book", "money", "star"] as const;

export interface TurnEmitter {
  text(delta: string): void;
  /** What's been written so far is replaced with this (a "let me look" line gives way to the answer). */
  reset?(text: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  /** Lyra reacted to the user's message with this emoji. */
  reaction?(emoji: string): void;
  /** (0.62) one plain step of the work, in the past tense ("Searched your mail for "dinner""), for "How I got this". */
  step?(text: string): void;
}

/**
 * Messages the user sends while a reply is still being written (back to back, like
 * texting). They're already saved; the turn picks them up before its next step.
 */
export interface TurnInbox {
  /** Take whatever has arrived since last time. */
  take(): string[];
  /** Called when a message arrives (or with undefined to stop listening). */
  listen(fn: (() => void) | undefined): void;
  /** The turn is wrapping up: anything later starts a new turn. */
  close(): void;
}

/** The reactions Lyra can put on a message, like a tapback. */
export const REACTIONS = ["❤️", "👍", "😂", "💀", "🎉", "😮", "😢", "🙏", "🔥", "🙌", "😅"] as const;

/** What a turn can see and change beyond its own chat: notebooks and channels. */
export interface Workspace {
  main: Notebook;
  channels(): ChannelSummary[];
  notebook(channelId: number): Promise<Notebook>;
  createChannel(input: { name: string; about: string; icon?: string }): Promise<Channel>;
  /** Hand a task to a background worker. Throws if it can't start (e.g. too many running). */
  startTask?(id: number, note?: string): void;
  /** Scheduled routines. */
  routines?: {
    list(): { id: number; name: string; schedule: string; enabled: number; post_mode: string; channel_name: string | null; model?: string }[];
    create(input: RoutineInput): Promise<{ id: number; name: string }>;
    update(id: number, input: Partial<RoutineInput>): Promise<{ id: number; name: string }>;
  };
  /** Docs Lyra writes (Phase 13). */
  docs?: {
    recent(): string;
    write(input: { title: unknown; body: unknown }, channelId: number | null, tainted: boolean): { id: number; title: string };
    update(id: number, patch: { title?: unknown; body?: unknown; append?: unknown }, tainted: boolean): { id: number; title: string };
    /** how many docs, or dashboards, there are */
    count(kind: "doc" | "dashboard"): number;
    /** the text, its title, and whether it holds outside content */
    read(id: number): { text: string; title: string; tainted: boolean };
    /**
     * Make or change a dashboard. refresh: the model's words for how to rebuild it; ask: the user's
     * own request. After outside content was read, only the user's words are kept as the recipe.
     */
    dashboard(input: { id?: number; title?: unknown; dashboard: unknown; refresh?: unknown; ask?: string }, channelId: number | null, tainted: boolean): { id: number; title: string; created: boolean };
  };
  /** How to talk like the user (empty when that's turned off). */
  talk?(): string;
  /** Life admin (Phase 18): bills, subscriptions, packages, trips and returns from the inbox. */
  lifeAdmin?: {
    connected(): boolean;
    list(): string;
    total(): string;
    scan(): Promise<string>;
    /** userText: the user's own message, when outside content was read this turn */
    mark(id: number, status: "done" | "dismissed" | "open", userText?: string): string;
  };
  /** Skills (Phase 17): how the user wants particular jobs done. */
  skills?: {
    index(): string;
    use(name: string): { id: number; name: string; steps: string } | null;
    save(input: Record<string, unknown>): { id: number; name: string; created: boolean };
  };
  /** Spotify playback (Phase 14), when the user turned it on. */
  music?: { control(action: string, uri?: string): Promise<string> };
  /** (0.64) which model does each job; set only when the user asks */
  models?: { table(): Promise<string>; set(job: string, model: string): Promise<string> };
  /** People cards (Phase 10). */
  people?: {
    directory(): string;
    remember(input: Record<string, unknown>): { id: number; name: string; created: boolean };
    lookUp(name: string): string | null;
  };
  /** The phone's contacts, looked up by name, when the user turned it on. */
  contacts?: { find(name: string): Promise<string> };
  /** Emails and events Lyra proposes; the user approves each one on a card. */
  actions?: {
    allowed(): { email: boolean; event: boolean; playlist?: boolean; move?: boolean; rsvp?: boolean; archive?: boolean; text?: boolean; remove?: boolean; mail?: boolean; edit_event?: boolean; file?: boolean; browser?: boolean };
    propose(kind: "email" | "event" | "playlist" | "move" | "rsvp" | "archive" | "text" | "remove" | "mail" | "edit_event" | "file" | "browser", input: Record<string, unknown>, tainted: boolean, channelId: number | null): Promise<{ id: number; summary: string }>;
    /** recent proposals and what happened to them, one per line */
    recent(): string;
  };
  /** One-off reminders and follow-ups. `at` is the user's local time, YYYY-MM-DD HH:MM. */
  reminders?: {
    list(): string;
    create(kind: "remind" | "follow_up", text: string, at: string, channelId: number | null): { id: number; when: string };
    cancel(id: number): string;
    /** a reminder for arriving at or leaving a place (set on the phone as a geofence) */
    atPlace?(text: string, place: string, on: "arrive" | "leave", channelId: number | null): Promise<{ id: number; place: string }>;
    cancelPlace?(id: number): string;
  };
}

export interface TurnContext {
  db: DB;
  workspace: Workspace;
  /** null for the main chat ("Everything") */
  channel: Channel | null;
  connectors: Connectors;
  provider: ModelProvider;
  userName: string;
  soul?: string;
  timeZone?: string;
  /** The model may search the web with its built-in search. */
  webSearch?: boolean;
  /** (0.53) a running summary of this chat up to a message: older messages aren't sent, the summary is */
  earlier?: { upTo: number; text: string };
  /** (0.62) what the composer chip showed while the user typed (core/intent.ts intentHint) */
  preview?: string;
  /** (0.63.3) Tomo's own settings, in plain lines (Lyra.setupSummary) */
  setup?: string;
}

export const MAIN = "main";
export const who = (ctx: TurnContext) => (ctx.userName === "you" ? "User" : ctx.userName);
