/**
 * Lyra's engine. Everything the app does goes through here: it owns the
 * database, memory, model choice, API keys and connectors. It runs inside
 * the Android app; tests and the browser preview run the same code.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SqlJsStatic } from "sql.js";
import { CHANNEL_ICONS, runTurn, type TurnEmitter, type Workspace } from "./chat.ts";
import { createGmailServer, gmailProfile } from "./connectors/gmail/server.ts";
import { createCalendarServer } from "./connectors/calendar/server.ts";
import { createDriveServer } from "./connectors/drive/server.ts";
import { CALENDAR_READONLY, DRIVE_READONLY, GMAIL_READONLY, grantIsReadOnly, TokenSource, type GoogleAuth } from "./connectors/google.ts";
import { Connectors, type ConnectorStatus } from "./connectors/registry.ts";
import {
  DB,
  findChannel,
  getChannel,
  getMessage,
  getSetting,
  listChannels,
  listMessages,
  setSetting,
  updateMessageMeta,
  type BlobStore,
  type Channel,
  type ChannelSummary,
  type StoredMessage,
} from "./db.ts";
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

export type LyraEvent = WorkerEvent | R.RoutineEvent;

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
}

const SECRET_KEYS = ["anthropic", "openai", "gemini"] as const;

export type GoogleId = "gmail" | "calendar" | "drive";

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
  private connectors: Connectors;
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
    this.workspace = {
      main: memory,
      channels: () => this.channels(),
      notebook: (id) => this.notebook(id),
      createChannel: (input) => this.createChannel(input),
      startTask: (id, note) => void this.workers.start(id, "lyra", note),
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
    this.connectors = new Connectors(
      GOOGLE.map((g) => ({
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
    );
    this.workers = new Workers({
      db,
      workspace: this.workspace,
      connectors: this.connectors,
      provider: async () => this.p.provider ?? createProvider(this.keys, this.choice()),
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
      provider: async () => this.p.provider ?? createProvider(this.keys, this.choice()),
      userName: () => this.userName,
      soul: () => this.customSoul,
      timeZone: p.timeZone,
      webSearch: () => this.webSearch,
      onEvent: (e) => this.listeners.forEach((l) => l(e)),
      flush: () => db.flush(),
    });
  }

  static async start(p: Platform): Promise<Lyra> {
    const db = await DB.open(p.SQL, p.blobs);
    const userName = getSetting(db, "userName") ?? "you";
    const memory = await Notebook.open(db, p.texts, mainNotebookSpec(userName));
    const lyra = new Lyra(p, db, memory);
    lyra.customSoul = (await p.texts.read("soul.md"))?.trim() || undefined;
    for (const k of SECRET_KEYS) lyra.keys[k] = (await p.secrets.get(`key.${k}`)) ?? undefined;
    lyra.keys.openaiBaseUrl = getSetting(db, "openaiBaseUrl") || undefined;
    // Workers cut off when the app was closed carry on where they stopped.
    lyra.workers.resumeInterrupted();
    return lyra;
  }

  private get fetch(): typeof fetch {
    return this.p.fetch ?? ((...a) => fetch(...a));
  }

  private link(id: GoogleId): GmailLink | undefined {
    const raw = getSetting(this.db, id);
    return raw ? (JSON.parse(raw) as GmailLink) : undefined;
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
    };
  }

  get accent(): Accent {
    const a = getSetting(this.db, "accent");
    return (ACCENTS as readonly string[]).includes(a ?? "") ? (a as Accent) : "lime";
  }

  async saveSettings(patch: SettingsPatch): Promise<AppState> {
    if (patch.userName !== undefined) setSetting(this.db, "userName", patch.userName.trim().slice(0, 40));
    if (patch.webSearch !== undefined) setSetting(this.db, "webSearch", patch.webSearch ? "on" : "off");
    if (patch.notifications !== undefined) setSetting(this.db, "notifications", patch.notifications ? "on" : "off");
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

  get busy(): boolean {
    return !!this.running;
  }

  async chat(text: string, emit: TurnEmitter, channelId: number | null = null): Promise<{ message: StoredMessage; user: StoredMessage }> {
    const clean = text.trim();
    if (!clean) throw new Error("Say something first.");
    if (clean.length > 20_000) throw new Error("That message is too long.");
    if (this.running) throw new Error("Lyra is still answering the last message.");
    const channel = channelId === null ? null : getChannel(this.db, channelId);
    if (channel === undefined) throw new Error("That channel no longer exists.");
    this.running = new AbortController();
    try {
      const provider = this.p.provider ?? (await createProvider(this.keys, this.choice()));
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
      );
      return { message, user: listMessages(this.db, channelId, 2)[0] };
    } finally {
      this.running = undefined;
      void this.db.flush();
    }
  }

  stop(): void {
    this.running?.abort();
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
    return this.routinesRunner.tick(now);
  }

  // ---------- Google (Mail, Calendar, Drive) ----------

  /** Ask Google for one service's read-only access. */
  async connectGoogle(id: GoogleId): Promise<AppState> {
    const g = GOOGLE.find((x) => x.id === id);
    if (!g) throw new Error("Unknown connection.");
    if (!this.p.google.available) throw new Error(`${g.label} sign-in works in the Android app.`);
    const r = await this.p.google.authorize([g.scope], true);
    if (!grantIsReadOnly(r.grantedScopes, g.scope)) throw new Error(`Google granted more than read-only ${g.noun} access, so Lyra didn't keep it.`);
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
}
