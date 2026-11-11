/**
 * Lyra's engine. Everything the app does goes through here: it owns the
 * database, memory, model choice, API keys and connectors. It runs inside
 * the Android app; tests and the browser preview run the same code.
 */
import type { SqlJsStatic } from "sql.js";
import { runTurn, type TurnEmitter } from "./chat.ts";
import { createGmailServer, gmailProfile } from "./connectors/gmail/server.ts";
import { GMAIL_READONLY, scopesAreReadOnly, TokenSource, type GoogleAuth } from "./connectors/google.ts";
import { Connectors, type ConnectorStatus } from "./connectors/registry.ts";
import { DB, getMessage, getSetting, listMessages, setSetting, updateMessageMeta, type BlobStore, type StoredMessage } from "./db.ts";
import { isSection, listItems, MemoryStore, SECTIONS, type Snapshot, type TextStore } from "./memory.ts";
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

  private constructor(
    private p: Platform,
    private db: DB,
    private memory: MemoryStore,
  ) {
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
    const memory = await MemoryStore.open(db, p.texts, userName);
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

  messages(before?: number, limit = 60): StoredMessage[] {
    return listMessages(this.db, Math.min(limit, 200), before);
  }

  get busy(): boolean {
    return !!this.running;
  }

  async chat(text: string, emit: TurnEmitter): Promise<{ message: StoredMessage; user: StoredMessage }> {
    const clean = text.trim();
    if (!clean) throw new Error("Say something first.");
    if (clean.length > 20_000) throw new Error("That message is too long.");
    if (this.running) throw new Error("Lyra is still answering the last message.");
    this.running = new AbortController();
    try {
      const provider = this.p.provider ?? (await createProvider(this.keys, this.choice()));
      const message = await runTurn(
        { db: this.db, memory: this.memory, connectors: this.connectors, provider, userName: this.userName, timeZone: this.p.timeZone },
        clean,
        emit,
        this.running.signal,
      );
      return { message, user: listMessages(this.db, 2)[0] };
    } finally {
      this.running = undefined;
      void this.db.flush();
    }
  }

  stop(): void {
    this.running?.abort();
  }

  // ---------- memory ----------

  memoryView(): MemoryView {
    const content = this.memory.read();
    return {
      content,
      sections: SECTIONS.map((s) => ({ name: s, items: listItems(content, s) })),
      history: this.memory.history(),
    };
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

  /** Undo a note shown under a chat message, or answer a held suggestion. */
  async note(messageId: number, index: number, action: "undo" | "accept" | "dismiss"): Promise<StoredMessage> {
    const msg = getMessage(this.db, messageId);
    const note = msg?.meta.memory?.[index];
    if (!msg || !note || !isSection(note.section)) throw new Error("That note is gone.");

    if (action === "undo" && !note.undone) {
      if (note.kind === "saved") {
        const r = await this.memory.forget(note.section, note.text);
        if ("error" in r) throw new Error("That line was already changed.");
      } else if (note.kind === "removed") await this.memory.remember(note.section, note.text);
      else throw new Error("Nothing to undo.");
      note.undone = true;
    } else if ((action === "accept" || action === "dismiss") && note.kind === "suggested" && note.suggestionId) {
      const r = await this.memory.resolveSuggestion(note.suggestionId, action === "accept");
      note.kind = action === "accept" ? "saved" : "dismissed";
      note.text = r.text;
      if (r.snapshotId) note.snapshotId = r.snapshotId;
    } else throw new Error("Unknown action.");

    updateMessageMeta(this.db, msg.id, msg.meta);
    return getMessage(this.db, msg.id)!;
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
