/**
 * Where the engine's storage and sign-in come from.
 *  - In the Android app: files in the app's private storage, API keys in
 *    Android's encrypted Keystore, Google sign-in through Play services.
 *  - In a desktop browser (development preview): IndexedDB and localStorage,
 *    and no Gmail.
 */
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { NeedsConsentError, type GoogleAuth } from "../../core/connectors/google";
import type { BlobStore } from "../../core/db";
import type { Platform, SecretStore } from "../../core/lyra";
import type { TextStore } from "../../core/memory";

export const isNative = Capacitor.isNativePlatform();

// ---------- files ----------

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const nativeFiles: BlobStore & TextStore = {
  async read(name: string) {
    try {
      const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: name.endsWith(".md") ? Encoding.UTF8 : undefined });
      if (typeof r.data !== "string") return null;
      return (name.endsWith(".md") ? r.data : fromBase64(r.data)) as never;
    } catch {
      return null;
    }
  },
  async write(name: string, data: Uint8Array | string) {
    await Filesystem.writeFile({
      path: name,
      directory: Directory.Data,
      data: typeof data === "string" ? data : toBase64(data),
      encoding: typeof data === "string" ? Encoding.UTF8 : undefined,
    });
  },
};

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lyra", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const webFiles: BlobStore & TextStore = {
  async read(name: string) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("files").objectStore("files").get(name);
      req.onsuccess = () => resolve((req.result ?? null) as never);
      req.onerror = () => reject(req.error);
    });
  },
  async write(name: string, data: Uint8Array | string) {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(data, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

// ---------- secrets ----------

const nativeSecrets: SecretStore = {
  async get(key) {
    const v = await SecureStorage.get(`lyra.${key}`, false, false);
    return typeof v === "string" ? v : null;
  },
  set: (key, value) => SecureStorage.set(`lyra.${key}`, value, false, false),
  async remove(key) {
    await SecureStorage.remove(`lyra.${key}`, false);
  },
};

/** Browser preview only: keys stay in this browser's localStorage. */
const webSecrets: SecretStore = {
  get: async (key) => localStorage.getItem(`lyra.${key}`),
  set: async (key, value) => localStorage.setItem(`lyra.${key}`, value),
  remove: async (key) => localStorage.removeItem(`lyra.${key}`),
};

// ---------- Google sign-in ----------

interface GoogleAuthPlugin {
  authorize(opts: { scopes: string[]; interactive: boolean }): Promise<{ accessToken: string; grantedScopes: string[]; email?: string }>;
  clearToken(opts: { token: string }): Promise<void>;
  revoke(opts: { scopes: string[]; email: string }): Promise<void>;
}

const NativeGoogle = registerPlugin<GoogleAuthPlugin>("GoogleAuth");

const nativeGoogle: GoogleAuth = {
  available: true,
  async authorize(scopes, interactive) {
    try {
      return await NativeGoogle.authorize({ scopes, interactive });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "NEEDS_CONSENT") throw new NeedsConsentError();
      if (err.code === "CANCELLED") throw new Error("Google sign-in was cancelled.");
      throw new Error(err.message || "Google sign-in failed.");
    }
  },
  clearToken: (token) => NativeGoogle.clearToken({ token }),
  revoke: (scopes, email) => NativeGoogle.revoke({ scopes, email }),
};

const webGoogle: GoogleAuth = {
  available: false,
  authorize: () => Promise.reject(new Error("Gmail sign-in works in the Android app.")),
};

export async function createPlatform(): Promise<Platform> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const files = isNative ? nativeFiles : webFiles;
  return {
    SQL,
    blobs: files,
    texts: files,
    secrets: isNative ? nativeSecrets : webSecrets,
    google: isNative ? nativeGoogle : webGoogle,
  };
}
