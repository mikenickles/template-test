/**
 * Where the engine's storage and sign-in come from.
 *  - In the Android app: files in the app's private storage, API keys in
 *    Android's encrypted Keystore, Google sign-in through Play services.
 *  - In a desktop browser (development preview): IndexedDB and localStorage,
 *    and no Gmail.
 */
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Clipboard } from "@capacitor/clipboard";
import { Share } from "@capacitor/share";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { NeedsConsentError, type GoogleAuth } from "../../core/connectors/google";
import type { BlobStore } from "../../core/db";
import type { Platform, SecretStore } from "../../core/lyra";
import type { TextStore } from "../../core/memory";

export const isNative = Capacitor.isNativePlatform();

/** The Windows app's bridge (desktop/preload.cjs). Missing on the phone and in a browser. */
interface DesktopBridge {
  files: { read(name: string): Promise<string | Uint8Array | null>; write(name: string, data: string | Uint8Array): Promise<void>; remove(name: string): Promise<void> };
  secrets: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
  google: { authorize(scopes: string[], interactive: boolean): Promise<{ accessToken: string; grantedScopes: string[]; email?: string }>; signOut(): Promise<void> };
  backups: { keep(name: string, bytes: Uint8Array): Promise<string>; saveAs(name: string, bytes: Uint8Array): Promise<string | null>; openFolder(): Promise<void> };
  notify(title: string, body: string, hash: string): Promise<void>;
  onOpenHash(fn: (hash: string) => void): () => void;
  /** shell 3 and later */
  shell?: { prefs(): Promise<ShellPrefs>; setPrefs(p: Partial<ShellPrefs>): Promise<ShellPrefs> };
  updates: {
    info(): Promise<{ shellVersion: number; bundledVersion: string; runningVersion: string }>;
    installPack(bytes: Uint8Array): Promise<{ installed: boolean; needsFullInstall: boolean; version: string }>;
    ok(): Promise<void>;
    relaunch(): Promise<void>;
  };
}
interface ShellPrefs {
  tray: boolean;
  openAtLogin: boolean;
}
const desk = (globalThis as { lyraDesktop?: DesktopBridge }).lyraDesktop;
/** Electron prefixes errors from the desktop side with "Error invoking remote method 'x': Error: ". */
const clean = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
  async (...a: A): Promise<R> => {
    try {
      return await fn(...a);
    } catch (e) {
      throw new Error(((e as Error).message ?? "").replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };
const deskSecrets: SecretStore | undefined = desk && {
  get: clean((k: string) => desk.secrets.get(k)),
  set: clean((k: string, v: string) => desk.secrets.set(k, v)),
  remove: clean((k: string) => desk.secrets.remove(k)),
};
export const isDesktop = !!desk;
/** What this device is called in sync. */
export const deviceKind = isNative ? "Phone" : isDesktop ? "Computer" : "Browser";
/** "this phone" / "this computer", for sentences. */
export const thisDevice = isNative ? "this phone" : isDesktop ? "this computer" : "this browser";

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

/** Notebooks, the soul and sync's state file are text; the database is binary. */
const isTextFile = (name: string) => /\.(md|json)$/.test(name);

const nativeFiles: BlobStore & TextStore = {
  async read(name: string) {
    try {
      const text = isTextFile(name);
      const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: text ? Encoding.UTF8 : undefined });
      if (typeof r.data !== "string") return null;
      return (text ? r.data : fromBase64(r.data)) as never;
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
  remove: nativeRemove,
};

async function nativeRemove(name: string) {
  try {
    await Filesystem.deleteFile({ path: name, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lyra", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const desktopFiles: BlobStore & TextStore = {
  read: (name: string) => desk!.files.read(name) as never,
  write: (name: string, data: Uint8Array | string) => desk!.files.write(name, data),
  remove: (name: string) => desk!.files.remove(name),
};

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
  async remove(name: string) {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(name);
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

/** Desktop: Google's sign-in for desktop apps, in your browser (desktop/main.cjs). */
const desktopGoogle: GoogleAuth = {
  available: true,
  async authorize(scopes, interactive) {
    try {
      return await desk!.google.authorize(scopes, interactive);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("NEEDS_CONSENT")) throw new NeedsConsentError();
      // ipc prefixes "Error invoking remote method ...: Error: "
      throw new Error(msg.replace(/^.*?Error: /, "") || "Google sign-in failed.");
    }
  },
};

/** Desktop only: the "Desktop app" OAuth client from your Google Cloud project. */
export const desktopGoogleSetup = {
  async get(): Promise<{ id: string; secret: string } | null> {
    if (!desk) return null;
    const raw = await desk.secrets.get("google.client");
    return raw ? (JSON.parse(raw) as { id: string; secret: string }) : null;
  },
  async set(id: string, secret: string): Promise<void> {
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim())) throw new Error("That client ID should end with .apps.googleusercontent.com");
    if (!secret.trim()) throw new Error("Paste the client secret too.");
    await desk!.secrets.set("google.client", JSON.stringify({ id: id.trim(), secret: secret.trim() }));
    await desk!.google.signOut(); // a new client needs a fresh approval
  },
};

const webGoogle: GoogleAuth = {
  available: false,
  authorize: () => Promise.reject(new Error("Gmail sign-in works in the Android app.")),
};

export async function createPlatform(): Promise<Platform> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const files = isNative ? nativeFiles : isDesktop ? desktopFiles : webFiles;
  return {
    SQL,
    blobs: files,
    texts: files,
    secrets: isNative ? nativeSecrets : isDesktop ? deskSecrets! : webSecrets,
    google: isNative ? nativeGoogle : isDesktop ? desktopGoogle : webGoogle,
    ...(isNative ? { contacts: phoneContacts } : {}),
  };
}

// ---------- the phone's contacts (looked up by name, only once allowed) ----------

const NativeContacts = registerPlugin<{
  allow(): Promise<{ allowed: boolean }>;
  find(o: { name: string }): Promise<{ contacts: { name: string; emails: string[]; phones: string[] }[] }>;
}>("LyraContacts");

const phoneContacts = {
  available: true,
  allow: async () => (await NativeContacts.allow()).allowed,
  find: async (name: string) => (await NativeContacts.find({ name })).contacts,
};

// ---------- notifications ----------

/** Routine reminders are ids 100000+, one-off notices 200000+, reminders and follow-ups 300000+. */
const REMINDER_BASE = 100_000;
const NOTICE_BASE = 200_000;
const ONE_OFF_BASE = 300_000;
let noticeId = NOTICE_BASE;

async function allowed(): Promise<boolean> {
  if (!isNative) return false;
  let p = await LocalNotifications.checkPermissions();
  if (p.display === "prompt" || p.display === "prompt-with-rationale") p = await LocalNotifications.requestPermissions();
  return p.display === "granted";
}

export interface ReminderRoutine {
  id: number;
  name: string;
  times: string;
  days: string;
  enabled: number;
  channel_id: number | null;
}

export const notifier = {
  /** Ask Android for permission to show notifications (only asks once; later it's in system settings). */
  ask: allowed,

  /** Replace all routine reminders with the current schedule. */
  async reminders(list: ReminderRoutine[]): Promise<void> {
    if (!isNative) return; // routines run on the phone
    const active = list.filter((r) => r.enabled);
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] as { id: number }[] }));
    const old = pending.notifications.filter((n) => n.id >= REMINDER_BASE && n.id < NOTICE_BASE);
    if (old.length) await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) });
    if (!active.length || !(await allowed())) return;
    const notifications = active.flatMap((r) =>
      r.times.split(",").flatMap((t, ti) => {
        const [hour, minute] = t.split(":").map(Number);
        return r.days.split("").map((d) => ({
          id: REMINDER_BASE + r.id * 100 + Number(d) * 10 + ti,
          title: r.name,
          body: "Tap to open Lyra and it'll run now.",
          schedule: { on: { weekday: Number(d) + 1, hour, minute }, allowWhileIdle: false },
          extra: { hash: r.channel_id ? `#/c/${r.channel_id}` : "#/" },
        }));
      }),
    );
    await LocalNotifications.schedule({ notifications });
  },

  /** Schedule a notification for each reminder and follow-up, so they arrive even with Lyra closed. */
  async oneOffs(list: { id: number; kind: "remind" | "follow_up"; text: string; due_at: string; channel_id: number | null }[]): Promise<void> {
    if (!isNative) return;
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] as { id: number }[] }));
    const old = pending.notifications.filter((n) => n.id >= ONE_OFF_BASE && n.id < ONE_OFF_BASE + 1_000_000);
    if (old.length) await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) });
    const future = list.filter((r) => new Date(r.due_at).getTime() > Date.now() + 5_000);
    if (!future.length || (await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: future.map((r) => ({
        id: ONE_OFF_BASE + (r.id % 1_000_000),
        title: r.kind === "remind" ? "Reminder" : "Lyra is checking back",
        body: r.kind === "remind" ? r.text : `${r.text} Open Lyra for the update.`,
        // allowWhileIdle so a reminder isn't held back by battery saving
        schedule: { at: new Date(r.due_at), allowWhileIdle: true },
        extra: { hash: r.channel_id ? `#/c/${r.channel_id}` : "#/" },
      })),
    });
  },

  /** Tell the user about news while Lyra is in the background. */
  async now(title: string, body: string, hash: string): Promise<void> {
    if (desk) return desk.notify(title, body, hash);
    // never pop the permission question from the background: only send if already allowed
    if (!isNative || (await LocalNotifications.checkPermissions()).display !== "granted") return;
    noticeId = noticeId >= NOTICE_BASE + 90_000 ? NOTICE_BASE : noticeId + 1;
    await LocalNotifications.schedule({ notifications: [{ id: noticeId, title, body, extra: { hash } }] });
  },

  /** Opening a notification goes to the chat it's about. */
  onOpen(fn: (hash: string) => void): () => void {
    if (desk) return desk.onOpenHash(fn);
    if (!isNative) return () => {};
    const sub = LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
      const hash = (a.notification.extra as { hash?: string } | undefined)?.hash;
      if (hash) fn(hash);
    });
    return () => void sub.then((s) => s.remove());
  },
};

// ---------- backups, clipboard, app lock ----------

/** Hand a backup file to the user: Android's share sheet (Drive, email, Files…), or a download in a browser. */
export async function shareFile(name: string, bytes: Uint8Array): Promise<void> {
  if (desk) {
    await desk.backups.saveAs(name, bytes);
    return;
  }
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const { uri } = await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: "Save your Lyra backup" });
  } catch (e) {
    // closing the share sheet without picking anything isn't an error
    if (!/cancel/i.test((e as Error).message ?? "")) throw e;
  }
  // The copy stays in the app's private cache (Android clears it over time): the app you
  // shared to, like Drive, may still be reading it after the share sheet closes.
}

export async function copyText(text: string): Promise<void> {
  if (isNative) await Clipboard.write({ string: text });
  else await navigator.clipboard.writeText(text);
}

let prompting: Promise<{ ok: boolean; error?: string }> | null = null;

export const appLock = {
  /** Whether this phone can lock Lyra: it needs a screen lock (PIN, pattern or password) at least. */
  async available(): Promise<boolean> {
    if (!isNative) return false;
    const r = await BiometricAuth.checkBiometry();
    return r.isAvailable || r.deviceIsSecure;
  },
  /**
   * Fingerprint or face, with the phone's PIN as a fallback. Android tracks one prompt
   * at a time (a second one would swallow the first's answer), so overlapping calls
   * share the prompt that's already open. `fresh` starts over: when you can tap Lyra's
   * own Unlock button, no prompt is on screen, so one still "open" was lost.
   */
  unlock(opts: { fresh?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    if (!isNative) return Promise.resolve({ ok: true });
    if (opts.fresh) prompting = null;
    if (!prompting) {
      const mine: Promise<{ ok: boolean; error?: string }> =
      BiometricAuth.authenticate({
        reason: "Unlock Lyra",
        androidTitle: "Unlock Lyra",
        androidSubtitle: "Use your fingerprint, face or screen lock",
        allowDeviceCredential: true,
        androidConfirmationRequired: false,
      })
        .then(() => ({ ok: true }))
        .catch((e: { code?: string; message?: string }) => {
          const cancelled = /cancel/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
          return { ok: false, error: cancelled ? undefined : e.message || "Couldn't unlock." };
        })
        .finally(() => {
          if (prompting === mine) prompting = null;
        });
      prompting = mine;
    }
    return prompting;
  },
};

/** Desktop: keep a copy of each sync snapshot in Documents\\Lyra Backups (newest 20). */
export async function keepBackupCopy(name: string, bytes: Uint8Array): Promise<void> {
  if (desk) await desk.backups.keep(name, bytes);
}

export async function openBackupsFolder(): Promise<void> {
  await desk?.backups.openFolder();
}

// ---------- updates ----------

interface ApkInstallerPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(opts: { name: string }): Promise<void>;
}
const ApkInstaller = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

/** How this device installs an update it found in Drive. */
export const installer = {
  /** The version running now (on the computer, a pack can be newer than the app that came in the zip). */
  async version(): Promise<string> {
    return desk ? (await desk.updates.info()).runningVersion : __LYRA_VERSION__;
  },
  /** Phone: save the APK and open Android's installer (it asks you to confirm). */
  async installApk(name: string, bytes: Uint8Array): Promise<"opened" | "needs-permission"> {
    if (!(await ApkInstaller.canInstall()).allowed) {
      await ApkInstaller.openInstallSettings();
      return "needs-permission";
    }
    await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
    await ApkInstaller.install({ name });
    return "opened";
  },
  /** Computer: unpack the new app code; it runs after a restart. */
  installPack: (bytes: Uint8Array) => desk!.updates.installPack(bytes),
  relaunch: () => desk!.updates.relaunch(),
  /** Computer: the app started fine on this code (a pack that never gets here is rolled back). */
  started: () => desk?.updates.ok(),
};

// ---------- live voice, and "Share to Lyra" (phone) ----------

const ShareTarget = registerPlugin<{
  take(): Promise<{ text?: string; files?: { name: string; mediaType: string; data: string }[]; skipped?: number }>;
  addListener(event: "shared", fn: () => void): Promise<{ remove(): Promise<void> }>;
}>("ShareTarget");

/** Live voice (GPT-Live) needs the microphone: the phone app, a browser, or a Windows app new enough to allow it. */
export const liveVoice = {
  async available(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return false;
    if (desk) return (await desk.updates.info()).shellVersion >= 2;
    return true;
  },
  /** on the computer: this copy of the Windows app predates live voice */
  needsNewDesktop: async () => !!desk && (await desk.updates.info()).shellVersion < 2,
};

/** Text, links, photos and PDFs shared to Lyra from other apps. */
export const shares = {
  async take() {
    if (!isNative) return null;
    const r = await ShareTarget.take();
    return r.text || r.files?.length || r.skipped ? { text: r.text, files: r.files ?? [], skipped: r.skipped ?? 0 } : null;
  },
  onShared(fn: () => void): () => void {
    if (!isNative) return () => {};
    const sub = ShareTarget.addListener("shared", fn);
    return () => void sub.then((s) => s.remove());
  },
};

// ---------- working in the background ----------
// Phone: "Keep watch" runs a quiet foreground service so Lyra keeps going in the background,
// woken every 15 minutes. Computer: closing the window leaves Lyra in the tray.

const NativeBackground = registerPlugin<{
  status(): Promise<{ on: boolean }>;
  set(o: { on: boolean }): Promise<{ on: boolean }>;
  done(): Promise<void>;
}>("LyraBackground");

export interface BackgroundState {
  /** keeps working with the app out of sight */
  on: boolean;
  /** computer only: starts with Windows, in the tray */
  atLogin?: boolean;
}

export const background = {
  /** null: this device can't (a browser, or a Windows app from before the tray) */
  async state(): Promise<BackgroundState | null> {
    if (isNative) return { on: (await NativeBackground.status()).on };
    if (desk?.shell) {
      const p = await desk.shell.prefs();
      return { on: p.tray, atLogin: p.openAtLogin };
    }
    return null;
  },
  async set(s: Partial<BackgroundState>): Promise<BackgroundState | null> {
    if (isNative) return { on: (await NativeBackground.set({ on: !!s.on })).on };
    if (desk?.shell) {
      const p = await desk.shell.setPrefs({ ...(s.on !== undefined ? { tray: s.on } : {}), ...(s.atLogin !== undefined ? { openAtLogin: s.atLogin } : {}) });
      return { on: p.tray, atLogin: p.openAtLogin };
    }
    return null;
  },
  /** phone: the 15-minute wake-up; `run` does what's due, then the phone may sleep again */
  onTick(run: () => Promise<void>): void {
    if (!isNative) return;
    addEventListener("lyraBackgroundTick", () => {
      void run()
        .catch(() => {})
        .finally(() => void NativeBackground.done().catch(() => {}));
    });
  },
};
