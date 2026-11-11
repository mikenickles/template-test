import initSqlJs from "sql.js";
import type { GoogleAuth } from "../core/connectors/google.ts";
import { NeedsConsentError } from "../core/connectors/google.ts";
import type { BlobStore } from "../core/db.ts";
import type { Platform, SecretStore } from "../core/lyra.ts";
import type { TextStore } from "../core/memory.ts";

export const SQL = await initSqlJs();

/** Storage that lives in plain maps, so a test can "restart" the app with the same data. */
export function memStores() {
  const blobs = new Map<string, Uint8Array>();
  const texts = new Map<string, string>();
  const secrets = new Map<string, string>();
  return {
    blobs: { read: async (n) => blobs.get(n) ?? null, write: async (n, b) => void blobs.set(n, b) } satisfies BlobStore,
    texts: { read: async (n) => texts.get(n) ?? null, write: async (n, t) => void texts.set(n, t) } satisfies TextStore,
    secrets: {
      get: async (k) => secrets.get(k) ?? null,
      set: async (k, v) => void secrets.set(k, v),
      remove: async (k) => void secrets.delete(k),
    } satisfies SecretStore,
    raw: { blobs, texts, secrets },
  };
}

export function fakeGoogle(scopes: string[] = ["https://www.googleapis.com/auth/gmail.readonly"]) {
  const g = {
    available: true,
    consented: false,
    calls: [] as boolean[],
    async authorize(_s: string[], interactive: boolean) {
      g.calls.push(interactive);
      if (interactive) g.consented = true;
      if (!g.consented) throw new NeedsConsentError();
      return { accessToken: "tok", grantedScopes: scopes };
    },
  };
  return g satisfies GoogleAuth;
}

export function platform(over: Partial<Platform> = {}, stores = memStores()): Platform {
  return { SQL, blobs: stores.blobs, texts: stores.texts, secrets: stores.secrets, google: fakeGoogle(), timeZone: "America/Los_Angeles", ...over };
}
