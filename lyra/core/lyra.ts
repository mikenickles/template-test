/**
 * Lyra's engine. Everything the app does goes through here: it owns the
 * database, memory, model choice, API keys and connectors. It runs inside
 * the Android app; tests and the browser preview run the same code.
 */
import type { SqlJsStatic } from "sql.js";
import { CHANNEL_ICONS, runTurn, type TurnEmitter, type Workspace } from "./chat.ts";
import { createGmailServer, gmailProfile } from "./connectors/gmail/server.ts";
import { GMAIL_READONLY, scopesAreReadOnly, TokenSource, type GoogleAuth } from "./connectors/google.ts";
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
}

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
}

const SECRET_KEYS = ["anthropic", "openai", "gemini"] as const;

interface GmailLink {
  email?: string;
  connected_at: string;
}

export class Lyra {
  private keys: Keys = {};
  private running: AbortController | undefined;
  private connectors: Connectors;
  private tokens: TokenSource;
  private notebooks = new Map<number, Promise<Notebook>>();
  private workspace: Workspace;

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
    };
    this.tokens = new TokenSource(p.google, [GMAIL_READONLY]);
    this.connectors = new Connectors([
      {
        id: "gmail",
        label: "Mail",
        access: "Can read your mail",
        allow: ["search_mail", "read_thread"],
        labels: { search_mail: "Searching your mail", read_thread: "Reading the thread" },
        available: () => p.google.available,
        connected: () => !!this.gmail(),
        account: () => this.gmail()?.email,
        server: () => createGmailServer(this.tokens, this.fetch),
      },
    ]);
  }

  static async start(p: Platform): Promise<Lyra> {
    const db = await DB.open(p.SQL, p.blobs);
    const userName = getSetting(db, "userName") ?? "you";
    const memory = await Notebook.open(db, p.texts, mainNotebookSpec(userName));
    const lyra = new Lyra(p, db, memory);
    for (const k of SECRET_KEYS) lyra.keys[k] = (await p.secrets.get(`key.${k}`)) ?? undefined;
    lyra.keys.openaiBaseUrl = getSetting(db, "openaiBaseUrl") || undefined;
    return lyra;
  }

  private get fetch(): typeof fetch {
    return this.p.fetch ?? ((...a) => fetch(...a));
  }

  private gmail(): GmailLink | undefined {
    const raw = getSetting(this.db, "gmail");
    return raw ? (JSON.parse(raw) as GmailLink) : undefined;
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
    };
  }

  async saveSettings(patch: SettingsPatch): Promise<AppState> {
    if (patch.userName !== undefined) setSetting(this.db, "userName", patch.userName.trim().slice(0, 40));
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
          timeZone: this.p.timeZone,
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
    const about = cleanItem(input.about ?? current?.about ?? "").slice(0, 140);
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

  // ---------- Gmail ----------

  async connectGmail(): Promise<AppState> {
    if (!this.p.google.available) throw new Error("Gmail sign-in works in the Android app.");
    const r = await this.p.google.authorize([GMAIL_READONLY], true);
    if (!scopesAreReadOnly(r.grantedScopes)) throw new Error("Google granted more than read-only mail access, so Lyra didn't keep it.");
    this.tokens.invalidate();
    const email = r.email ?? (await gmailProfile(this.tokens, this.fetch));
    setSetting(this.db, "gmail", JSON.stringify({ email, connected_at: new Date().toISOString() } satisfies GmailLink));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  async disconnectGmail(): Promise<AppState> {
    try {
      const email = this.gmail()?.email;
      if (email && this.p.google.revoke) await this.p.google.revoke([GMAIL_READONLY], email);
      else {
        const token = await this.tokens.get();
        await this.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
      }
    } catch {
      /* already signed out or offline: forgetting locally is still right */
    }
    this.tokens.invalidate();
    this.db.run("DELETE FROM settings WHERE key = 'gmail'");
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  }

  /** Save everything now (the app calls this when it goes to the background). */
  flush(): Promise<void> {
    return this.db.flush();
  }
}
