import { config as loadEnv } from "dotenv";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

loadEnv({ path: resolve(import.meta.dirname, "../.env"), quiet: true });

export type ProviderId = "anthropic" | "openai" | "gemini" | "fake";

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  memoryPath: string;
  googleTokenPath: string;
  accessToken: string | undefined;
  userName: string;
  defaultProvider: ProviderId;
  models: Record<Exclude<ProviderId, "fake">, string>;
  keys: { anthropic?: string; openai?: string; gemini?: string };
  openaiBaseUrl?: string;
  google: { clientId?: string; clientSecret?: string };
  webDist: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  const dataDir = expandHome(overrides.dataDir ?? env.LYRA_DATA_DIR ?? "~/.lyra");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const cfg: Config = {
    host: env.LYRA_HOST ?? "127.0.0.1",
    port: Number(env.LYRA_PORT ?? 4310),
    dataDir,
    dbPath: join(dataDir, "lyra.db"),
    memoryPath: join(dataDir, "memory.md"),
    googleTokenPath: join(dataDir, "google-token.json"),
    accessToken: env.LYRA_ACCESS_TOKEN || undefined,
    userName: env.LYRA_USER_NAME || "you",
    defaultProvider: (env.LYRA_PROVIDER as ProviderId) || "anthropic",
    models: {
      anthropic: env.LYRA_ANTHROPIC_MODEL || "claude-haiku-5-5",
      openai: env.LYRA_OPENAI_MODEL || "gpt-6-astra",
      gemini: env.LYRA_GEMINI_MODEL || "gemini-3.8-flash",
    },
    keys: {
      anthropic: env.ANTHROPIC_API_KEY || undefined,
      openai: env.OPENAI_API_KEY || undefined,
      gemini: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || undefined,
    },
    openaiBaseUrl: env.OPENAI_BASE_URL || undefined,
    google: {
      clientId: env.GOOGLE_CLIENT_ID || undefined,
      clientSecret: env.GOOGLE_CLIENT_SECRET || undefined,
    },
    webDist: resolve(import.meta.dirname, "../web/dist"),
    ...overrides,
  };
  if (overrides.dataDir) {
    cfg.dbPath = overrides.dbPath ?? join(dataDir, "lyra.db");
    cfg.memoryPath = overrides.memoryPath ?? join(dataDir, "memory.md");
    cfg.googleTokenPath = overrides.googleTokenPath ?? join(dataDir, "google-token.json");
  }
  return cfg;
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
