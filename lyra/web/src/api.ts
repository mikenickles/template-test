/**
 * The UI's way into Lyra. Everything runs on the phone: this file starts the
 * engine once and exposes the same calls the screens have always used.
 */
import { App as CapApp } from "@capacitor/app";
import type { ChannelSummary, MemoryNote as CoreNote, StoredMessage, TaskNote as CoreTaskNote } from "../../core/db";
import type { NewTask, TaskDetail as CoreTaskDetail, TaskPatch, TaskQuery, TaskRow, TaskStatus as CoreStatus } from "../../core/tasks";
import type { WorkerRun as CoreRun } from "../../core/workers";
import type { LyraEvent as WorkerEvent } from "../../core/lyra";
import type { RoutineInput, RoutineRow, RoutineRun as CoreRoutineRun } from "../../core/routines";
import {
  Lyra,
  type AppState as CoreState,
  type ChannelInput,
  type ChannelView as CoreChannelView,
  type MemoryView as CoreMemory,
  type SettingsPatch,
} from "../../core/lyra";
import type { Attachment } from "../../core/attachments";
import { backupName } from "../../core/backup";
import type { Platform } from "../../core/lyra";
import type { Activity, ActivityDetail, ActivityKind } from "../../core/activity";
export type { Activity, ActivityDetail, ActivityKind };
import { HOME_STALE_MS, readSyncState, Sync, type SnapshotInfo, type SyncResult } from "../../core/sync";
import { DriveSyncRemote } from "../../core/sync-drive";
import { applyUpdate, checkForUpdate, watchForUpdates } from "./updater";
import { watchWidget } from "./widget";
import { background, createPlatform, deviceKind, isDesktop, isNative, keepBackupCopy, notifier, places, push, shareFile } from "./platform";
import { directionsLink, driveSeconds, leaveAt } from "../../core/places";

export type MemoryNote = CoreNote;
export type Message = StoredMessage;
export type AppState = CoreState;
export type MemoryView = CoreMemory;
export type ConnectorStatus = CoreState["connectors"][number];
export type ProviderInfo = CoreState["providers"][number];
export type Channel = ChannelSummary;
export type ChannelView = CoreChannelView;
export type Task = TaskRow;
export type TaskDetail = CoreTaskDetail;
export type TaskStatus = CoreStatus;
export type TaskNote = CoreTaskNote;
export type WorkerRun = CoreRun;
export type Routine = RoutineRow & { schedule: string; running: boolean };
export type RoutineRun = CoreRoutineRun;
export type { Reminder } from "../../core/reminders";
export type { WorkerEvent };

/** Background activity (workers updating tasks or posting reports). */
export function onChange(fn: (e: WorkerEvent) => void): () => void {
  let off: (() => void) | undefined;
  let cancelled = false;
  void ready.then((l) => {
    if (!cancelled) off = l.onChange(fn);
  });
  return () => {
    cancelled = true;
    off?.();
  };
}
export { isNative };

let platform: Platform;
let sync: Sync;

const ready: Promise<Lyra> = createPlatform().then(async (p) => {
  platform = p;
  const state = await readSyncState(p.texts, deviceKind);
  const pulledAfter = state.justPulled ? Number(localStorage.getItem(PULLED_AFTER) ?? NaN) : NaN;
  localStorage.removeItem(PULLED_AFTER);
  // right after loading another device's data, its running workers stay with that device
  const lyra = await Lyra.start(p, { resumeWorkers: !state.justPulled });
  sync = new Sync(lyra, new DriveSyncRemote(p.google), p.texts, p.secrets, state);
  if (isDesktop) sync.onSnapshot = (bytes, info) => void keepBackupCopy(autoName(info.savedAt), bytes).catch(() => {});
  await sync.started();
  // Save to disk whenever the app leaves the screen.
  if (isNative) void CapApp.addListener("pause", () => void lyra.flush());
  addEventListener("pagehide", () => void lyra.flush());
  watchForNotices(lyra);
  watchPlaces(lyra);
  void askToNotify(lyra);
  void signUpForPush(lyra);
  if (Number.isFinite(pulledAfter)) void tellWhatsNew(lyra, pulledAfter);
  runRoutines(lyra);
  watchSync(lyra);
  watchForUpdates(lyra);
  watchWidget(lyra);
  // catch up with the other device before showing anything (but don't hang on a slow network)
  if (state.enabled) await Promise.race([syncNow(lyra), new Promise((r) => setTimeout(r, 6000))]);
  return lyra;
});

// ---------- routines ----------
// Routines run on schedule while Lyra is open, and catch up when it's opened. With sync
// on, one device runs them, so the same brief isn't posted twice: the home base (a computer
// that's always on) while it's been heard from, otherwise the phone.

const routinesRunHere = () => sync.runsJobs(!isDesktop);
const BEAT_EVERY = 5 * 60_000;

/** The home base hasn't managed to catch up for this long: it stops saying it's here, so a phone takes the work back. */
const HOME_STUCK_MS = 10 * 60_000;

function runRoutines(lyra: Lyra): void {
  let beatAt = 0;
  let okAt = Date.now();
  const tick = async () => {
    if (restarting) return;
    if (sync.state.enabled && sync.state.home) {
      // the home base works from the latest data, and holds off while another device is in use
      const r = await syncNow(lyra);
      if (restarting) return;
      const stuck = r === "busy" || r === "conflict";
      if (!stuck) okAt = Date.now();
      // it only says "I'm here" while it can actually do the work (not when sync keeps failing)
      if (Date.now() - okAt < HOME_STUCK_MS && Date.now() - beatAt > BEAT_EVERY && sync.state.home) {
        beatAt = Date.now();
        await sync.beat().catch((e) => console.error("[lyra] home base", e));
        syncChanged();
      }
      if (stuck || sync.othersActive()) return;
    }
    if (!routinesRunHere() || restarting) return;
    try {
      lyra.tickRoutines();
    } catch (e) {
      console.error("[lyra] routines", e);
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000);
  // the phone keeping watch in the background: load what the home base did (that restarts Lyra, which
  // then tells you what's new), or run what's due here, give it a couple of minutes, save, send to sync
  background.onTick(async () => {
    if (sync.state.enabled) await syncNow(lyra);
    if (restarting) return;
    await onWake().catch(() => {});
    await tick();
    await Promise.race([lyra.routinesRunner.settle(), new Promise((r) => setTimeout(r, 150_000))]);
    await lyra.flush();
    if (sync.state.enabled) await syncNow(lyra, { pull: false });
  });
  if (isNative) void CapApp.addListener("resume", () => void tick());
  else document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void tick());
}

// A device that loads another's data restarts. If Lyra posted unasked in the meantime
// (the home base's routines and heads-ups), say so here, unless you're looking at Lyra.
const PULLED_AFTER = "lyra.pulledAfter";

/**
 * Ask for the phone's notification permission once, when it matters: you've started using Lyra and
 * Lyra is set to speak up unasked. (Android only shows its question once; after a no it's in Settings.)
 */
async function askToNotify(lyra: Lyra): Promise<void> {
  try {
    if (!isNative || !lyra.state().notifications || localStorage.getItem("lyra.askedToNotify")) return;
    if ((await notifier.permission()) !== "prompt") return;
    const ask = async () => {
      if (localStorage.getItem("lyra.askedToNotify") || !lyra.lastMessageId()) return;
      localStorage.setItem("lyra.askedToNotify", "1");
      if (await notifier.ask()) syncReminders(lyra);
    };
    // right away if you've already chatted; otherwise after your first exchange
    if (lyra.lastMessageId()) return void ask();
    const stop = lyra.onChange((e) => {
      if (e.type !== "message") return;
      stop();
      void ask();
    });
  } catch (e) {
    console.error("[lyra] notification permission", e);
  }
}

// ---------- places: reminders on arrival, and when to leave ----------

/** Leave-now nudges are this phone's choice (localStorage), since they use where it is. */
export const LEAVE_NOW = "lyra.leaveNow";
const placeCache = new Map<string, { lat: number; lng: number } | null>();
/** Extra work for the phone's 15-minute wake-up (places), set once places are watched. */
let onWake: () => Promise<void> = async () => {};
let leaveAtLast = 0;

function watchPlaces(lyra: Lyra): void {
  if (!places.available) return;
  // the pending place reminders become the phone's geofences
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fences = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if ((await places.access()) !== "always") return;
        await places.fences(lyra.placeReminders().map((r) => ({ id: r.id, text: r.text, place: r.place, lat: r.lat, lng: r.lng, radius: r.radius, on: r.on_event })));
      } catch (e) {
        console.error("[lyra] place reminders", e);
      }
    }, 800);
  };
  // ones that went off while Lyra was closed (Android showed them): mark them done
  const fired = async () => {
    const ids = await places.fired().catch(() => [] as number[]);
    if (ids.length) await lyra.placeRemindersFired(ids);
  };
  fences();
  void fired().then(() => planLeaving(lyra, true));
  lyra.onChange((e) => e.type === "reminder" && fences());
  void CapApp.addListener("resume", () => {
    void fired();
    void planLeaving(lyra, true);
  });
  // on each 15-minute wake-up (run inside the routines' handler, which holds the wake lock)
  onWake = async () => {
    await fired();
    await planLeaving(lyra, true);
  };
  setInterval(() => void planLeaving(lyra), 60_000);
}

/** Schedule a nudge at the time to leave for each event with a place in the next few hours. */
async function planLeaving(lyra: Lyra, now = false): Promise<void> {
  try {
    if (localStorage.getItem(LEAVE_NOW) !== "1" || !lyra.state().notifications) return;
    // every 10 minutes while open (and on each wake-up or return)
    if (!now && Date.now() - leaveAtLast < 10 * 60_000) return;
    leaveAtLast = Date.now();
    if ((await places.access()) === "none") return;
    const trips = await lyra.upcomingTrips();
    if (!trips.length) return void (await notifier.leaveNotices([]));
    const here = await places.here();
    const out: Parameters<typeof notifier.leaveNotices>[0] = [];
    for (const t of trips) {
      let to = placeCache.get(t.place);
      if (to === undefined) {
        to = (await places.find(t.place, here).catch(() => []))[0] ?? null;
        placeCache.set(t.place, to);
      }
      if (!to) continue;
      const secs = await driveSeconds(here, to, (...a) => fetch(...a));
      const at = secs === null ? null : leaveAt(t.start, secs);
      if (!at || secs === null) continue;
      const starts = new Date(t.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      out.push({
        key: `${t.id}`,
        at,
        title: `Time to leave for ${t.title}`,
        body: `About ${Math.round(secs / 60)} min by car from where you are (without traffic). It starts at ${starts}.`,
        maps: directionsLink(to),
      });
    }
    await notifier.leaveNotices(out);
  } catch (e) {
    console.error("[lyra] leave now", e);
  }
}

/** On a phone, once the home base has set push up: sign up, and pass this phone's address along through sync. */
async function signUpForPush(lyra: Lyra): Promise<void> {
  const cfg = lyra.pushConfig();
  if (!push.available || !cfg || !sync.state.enabled || !lyra.state().notifications) return;
  try {
    await lyra.registerPushDevice(sync.state.device, sync.state.deviceName, await push.register(cfg));
  } catch (e) {
    console.error("[lyra] push sign-up", e);
    pushError = (e as Error).message;
  }
}
let pushError: string | undefined;

/** The home base rings the phones: Lyra's own posts and tasks that are ready, whether or not this computer's window is showing. */
function ring(lyra: Lyra, title: string, body: string, hash: string, channelId?: number | null, options: string[] = []): void {
  if (!sync.state.enabled || !sync.state.home) return;
  void lyra
    .push(title, body, hash, options)
    // a phone that loads this post later won't announce it again
    .then((reached) => reached > 0 && channelId !== undefined && lyra.markPushed(channelId))
    .catch((e) => console.error("[lyra] push", e));
}

// Reminders made on this computer while it's the home base: a phone only has one of these on its
// own schedule once it has synced since. (One made on a phone, that phone already has.)
const HOME_MADE = "lyra.homeMade";
const homeMade = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(HOME_MADE) || "[]") as number[];
  } catch {
    return [];
  }
};

async function tellWhatsNew(lyra: Lyra, after: number): Promise<void> {
  try {
    if (!lyra.state().notifications) return;
    const showing = isNative ? (await CapApp.getState()).isActive : document.visibilityState === "visible";
    if (showing) return;
    const posts = lyra.ownPostsSince(after);
    for (const p of posts.slice(-3)) await notifier.now(p.title, p.body, p.channelId === null ? "#/" : `#/c/${p.channelId}`);
  } catch (e) {
    console.error("[lyra] what's new", e);
  }
}

// ---------- sync ----------
// Changes upload a few seconds after they happen; while open, Lyra checks for the other
// device's changes every minute and whenever you come back to it. Loading the other
// device's data restarts the app, so it never happens mid-reply or mid-sentence.

let restarting = false;
const syncListeners = new Set<() => void>();
const syncChanged = () => syncListeners.forEach((f) => f());

/** "Lyra auto 2026-11-12 14-03-22.lyra" */
function autoName(iso: string): string {
  const d = new Date(iso || Date.now());
  const p = (n: number) => String(n).padStart(2, "0");
  return `Lyra auto ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.lyra`;
}

/** A text field with something typed in it, other than the message box (which is checked on its own). */
function editingField(el: Element | null): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  return !el.closest(".composer") && !!el.value.trim();
}

function restartApp(): void {
  restarting = true;
  location.replace(`${location.pathname}#/`);
  location.reload();
}

async function syncNow(lyra: Lyra, opts: { pull?: boolean } = {}): Promise<SyncResult> {
  if (!sync.state.enabled || restarting) return "off";
  // a half-written message or a photo waiting to send: not a moment to reload
  const typing = !!document.querySelector<HTMLTextAreaElement>(".composer textarea")?.value.trim() || !!document.querySelector(".drafts");
  // nor while a form, sheet or editor is open (a doc, a routine, a person): the reload would throw the edits away
  const editing = !!document.querySelector(".dialog-layer, .editor, .doc-screen textarea, .action-edit") || editingField(document.activeElement);
  // (the home base with nobody at it doesn't wait on a draft or an open sheet: it would stop doing its job)
  const unattended = !!sync.state.home && !isNative && !document.hasFocus();
  // nor in the middle of a voice call, a routine, a heads-up or a mail scan
  const canPull = opts.pull !== false && !lyra.working && (unattended || (!typing && !editing)) && !document.body.dataset.call;
  try {
    const last = lyra.lastMessageId();
    const r = await sync.check(canPull);
    if (r === "pulled") {
      localStorage.setItem(PULLED_AFTER, String(last));
      restartApp();
    }
    return r;
  } catch (e) {
    console.error("[lyra] sync", e);
    return "busy";
  } finally {
    syncChanged();
  }
}

function watchSync(lyra: Lyra): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  lyra.onDataChange(() => {
    if (!sync.state.enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(lyra), 4000);
  });
  setInterval(() => document.visibilityState === "visible" && void syncNow(lyra), 60_000);
  const away = () => void syncNow(lyra, { pull: false }); // send what's new before Android pauses Lyra
  const back = () => void syncNow(lyra);
  if (isNative) {
    void CapApp.addListener("pause", away);
    void CapApp.addListener("resume", back);
  } else document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? back() : away()));
}

export interface SyncStatus {
  enabled: boolean;
  deviceName: string;
  lastSync?: string;
  lastError?: string;
  pending: boolean;
  conflict?: SnapshotInfo;
  routinesHere: boolean;
  /** this device is the home base */
  home: boolean;
  /** another device is the home base: its name, when it was last heard from, and whether that's recent */
  homeBase?: { name: string; at: string; fresh: boolean };
  /** this computer is the home base but can't do all of the job: what's missing here */
  homeGaps: string[];
}

/** What a home base needs on this computer itself: API keys and Google connections don't sync between devices. */
function homeGaps(lyra: Lyra): string[] {
  const s = lyra.state();
  const gaps: string[] = [];
  if (s.choice.provider === "fake") gaps.push("an AI model (add your API key here, in Settings, AI model)");
  const off = s.connectors.filter((c) => ["gmail", "calendar"].includes(c.id) && c.state !== "connected").map((c) => c.label);
  if (off.length) gaps.push(`${off.join(" and ")} connected on this computer (on the Lyra page)`);
  return gaps;
}

export const updatesApi = {
  check: async () => checkForUpdate(await ready),
  apply: async () => applyUpdate(await ready),
};

export const syncApi = {
  status: async (): Promise<SyncStatus> => {
    await ready;
    const s = sync.state;
    const beat = !s.home && s.homeBeat && s.homeBeat.device !== s.device ? s.homeBeat : undefined;
    return {
      enabled: s.enabled,
      deviceName: s.deviceName,
      lastSync: s.lastSync,
      lastError: s.lastError,
      pending: s.dirty,
      conflict: s.conflict,
      routinesHere: routinesRunHere(),
      home: !!s.home,
      homeGaps: s.home ? homeGaps(await ready) : [],
      homeBase: beat && { name: beat.deviceName, at: beat.at, fresh: Date.now() - new Date(beat.at).getTime() < HOME_STALE_MS },
    };
  },
  /** Push: set up on the home base, phones sign up by themselves. */
  push: async () => {
    const lyra = await ready;
    return { ...(await lyra.pushStatus()), thisDevice: sync.state.device, error: pushError };
  },
  setupPush: async (googleServices: string, serviceAccount: string) => {
    await (await ready).setupPush(googleServices, serviceAccount);
    syncChanged();
  },
  forgetPush: async () => {
    await (await ready).forgetPush();
    await push.forget();
    syncChanged();
  },
  testPush: async () => (await ready).push("Lyra", "This is a test from your home base. Push is working.", "#/"),
  /** Make this computer the one that does Lyra's background work (or stop). Turns heads-ups on if they were off. */
  setHome: async (on: boolean): Promise<{ headsUpsOn: boolean }> => {
    const lyra = await ready;
    try {
      await sync.setHome(on);
      let headsUpsOn = false;
      if (on && lyra.state().proactive.level === "off") {
        await lyra.saveSettings({ proactive: { ...lyra.state().proactive, level: "light" } });
        headsUpsOn = true;
      }
      return { headsUpsOn };
    } finally {
      syncChanged();
    }
  },
  onChange(fn: () => void): () => void {
    syncListeners.add(fn);
    return () => syncListeners.delete(fn);
  },
  /** Step 1 of turning sync on: approve Lyra's Drive folder; says whether another device already synced. */
  connect: async (): Promise<SnapshotInfo | undefined> => {
    await ready;
    await DriveSyncRemote.connect(platform.google);
    return sync.existing();
  },
  /** Step 2: with a passphrase. Joining loads the other device's data and restarts the app. */
  enable: async (passphrase: string, deviceName: string): Promise<SyncResult> => {
    await ready;
    try {
      const r = await sync.enable(passphrase, deviceName.trim().slice(0, 40) || deviceKind);
      if (r === "pulled") restartApp();
      return r;
    } finally {
      syncChanged();
    }
  },
  disable: async () => {
    await ready;
    await sync.disable();
    syncChanged();
  },
  now: async (): Promise<SyncResult> => {
    const lyra = await ready;
    if (!sync.state.enabled) return "off";
    const r = await sync.check(!lyra.busy);
    syncChanged();
    if (r === "pulled") restartApp();
    return r;
  },
  resolve: async (keep: "this" | "other"): Promise<SyncResult> => {
    await ready;
    try {
      const r = await sync.resolve(keep);
      if (r === "pulled") restartApp();
      return r;
    } finally {
      syncChanged();
    }
  },
};

// ---------- notifications ----------
// Lyra only tells you about things while it's out of sight: a reply that finished, a routine's
// post, a task that's ready for you. Routine reminders are scheduled ahead on the phone.

// (After a reload in the background the app must not assume it's on screen, or it would stay quiet.)
let active = !isNative;
if (isNative) {
  void CapApp.getState().then((s) => (active = s.isActive));
  void CapApp.addListener("appStateChange", (s) => (active = s.isActive));
}
/** Is the user looking at Lyra right now? On a computer that means the window is showing and in front. */
const inFront = () => (isNative ? active : document.visibilityState === "visible" && document.hasFocus());

const firstLine = (text: string) => text.trim().split("\n")[0].replace(/[*`#>]/g, "").slice(0, 160);
const chatHash = (channelId: number | null) => (channelId === null ? "#/" : `#/c/${channelId}`);

function notice(lyra: Lyra, title: string, body: string, hash: string, options: string[] = []): void {
  if (inFront() || !lyra.state().notifications) return;
  void notifier.now(title, body, hash, options).catch(() => {});
}

function syncReminders(lyra: Lyra): void {
  const on = lyra.state().notifications;
  void notifier.reminders(on ? lyra.routines() : []).catch(() => {});
  void notifier.oneOffs(on ? lyra.reminders() : []).catch(() => {});
  void notifier.adminNotices(on ? lyra.lifeAdminNotices() : []).catch(() => {});
}

function watchForNotices(lyra: Lyra): void {
  syncReminders(lyra);
  // only a task that just became "Ready for you" is news
  const seen = new Map(lyra.tasks({}).map((t) => [t.id, t.status]));
  const knownReminders = new Set(lyra.reminders().map((r) => r.id));
  lyra.onChange((e) => {
    if (e.type === "reminder") {
      for (const r of lyra.reminders()) {
        if (knownReminders.has(r.id)) continue;
        knownReminders.add(r.id);
        if (sync.state.enabled && sync.state.home) localStorage.setItem(HOME_MADE, JSON.stringify([...homeMade(), r.id].slice(-200)));
      }
    }
    if (e.type === "routine" || e.type === "reminder" || e.type === "admin") return syncReminders(lyra);
    if (e.type === "message" && "notify" in e && e.notify) {
      const n = e.notify as { title: string; body: string; scheduled?: boolean; since?: string; reminderId?: number; options?: string[] };
      if (n.scheduled) {
        // A reminder or a life admin heads-up: a phone that knew about it showed its own notification
        // at the time. On a computer, say it even while Lyra is open.
        if (!isNative && lyra.state().notifications) void notifier.now(n.title, n.body, chatHash(e.channelId)).catch(() => {});
        // The home base rings the phone only for one the phone couldn't have had: made here, or
        // found here, and the phone hasn't caught up since.
        const phoneHasIt = n.reminderId !== undefined ? !homeMade().includes(n.reminderId) || sync.caughtUpSince(n.since) : sync.caughtUpSince(n.since);
        if (!phoneHasIt) ring(lyra, n.title, n.body, chatHash(e.channelId));
        return;
      }
      ring(lyra, n.title, n.body, chatHash(e.channelId), e.channelId, n.options);
      return notice(lyra, n.title, n.body, chatHash(e.channelId), n.options);
    }
    if (e.type === "task") {
      let d: ReturnType<Lyra["task"]> | undefined;
      try {
        d = lyra.task(e.taskId);
      } catch {
        // deleted
      }
      const before = seen.get(e.taskId);
      if (!d) return void seen.delete(e.taskId);
      seen.set(e.taskId, d.task.status);
      if (d.task.status === "ready" && before !== "ready") {
        ring(lyra, `Ready for you: ${d.task.title}`, d.task.needs || "Lyra finished its part.", `#/t/${e.taskId}`);
        notice(lyra, `Ready for you: ${d.task.title}`, d.task.needs || "Lyra finished its part.", `#/t/${e.taskId}`);
      }
    }
  });
}

export const api = {
  state: async () => (await ready).state(),
  messages: async (channelId: number | null, before?: number) => ({ messages: (await ready).messages(channelId, before) }),
  stop: async () => (await ready).stop(),
  memory: async () => (await ready).memoryView(),
  saveMemory: async (content: string) => (await ready).saveMemory(content),
  restoreMemory: async (id: number) => (await ready).restoreMemory(id),
  editNote: async (section: string, old: string | null, next: string | null) => (await ready).editMemoryNote(section, old, next),
  note: async (messageId: number, index: number, action: "undo" | "accept" | "dismiss") => ({
    message: await (await ready).note(messageId, index, action),
  }),
  saveSettings: async (patch: SettingsPatch) => {
    const lyra = await ready;
    const s = await lyra.saveSettings(patch);
    if (patch.notifications !== undefined) syncReminders(lyra);
    return s;
  },
  startLive: async (offerSdp: string, channelId: number | null) => (await ready).startLive(offerSdp, channelId),
  liveDelegate: async (request: string, channelId: number | null) => (await ready).liveDelegate(request, channelId),
  liveExchange: async (user: string, assistant: string, channelId: number | null) => (await ready).liveExchange(user, assistant, channelId),
  liveEnded: async (seconds: number) => (await ready).liveEnded(seconds),
  usage: async (from: string, to: string) => (await ready).usage(from, to),
  away: async (since: string) => (await ready).away(since),
  today: async () => (await ready).today(),
  search: async (q: string) => (await ready).searchMessages(q),
  unread: async (seen: Record<string, number>) => (await ready).unread(seen),
  latestMessageIds: async () => (await ready).latestMessageIds(),
  snoozeTask: async (id: number, until: string | null) => (await ready).snoozeTask(id, until),
  models: async (provider: "anthropic" | "openai" | "gemini" | "fake") => (await ready).models(provider),
  deleteMessage: async (id: number) => (await ready).deleteMessage(id),
  pinMessage: async (id: number, pinned: boolean) => (await ready).pinMessage(id, pinned),
  pinned: async (channelId: number | null) => (await ready).pinned(channelId),
  /** Make an encrypted backup and hand it to the share sheet. */
  backup: async (passphrase: string) => shareFile(backupName(), await (await ready).backup(passphrase)),
  /** Replace everything with a backup, then restart the app on the restored data. */
  restore: async (file: Uint8Array, passphrase: string) => {
    const r = await (await ready).restore(file, passphrase);
    try {
      sessionStorage.setItem("lyra.restored", JSON.stringify(r));
    } catch {
      // only for the welcome-back note
    }
    location.replace(location.pathname + "#/");
    location.reload();
    return r;
  },
  /** Turn on notifications; false if Android said no. */
  allowNotifications: async () => (isNative ? notifier.ask() : true),
  channels: async () => (await ready).channels(),
  createChannel: async (input: ChannelInput) => (await ready).createChannel(input),
  updateChannel: async (id: number, input: Partial<ChannelInput>) => (await ready).updateChannel(id, input),
  deleteChannel: async (id: number) => (await ready).deleteChannel(id),
  channelView: async (id: number) => (await ready).channelView(id),
  saveChannelNotebook: async (id: number, content: string) => (await ready).saveChannelNotebook(id, content),
  restoreChannelNotebook: async (id: number, snapshotId: number) => (await ready).restoreChannelNotebook(id, snapshotId),
  tasks: async (q: TaskQuery = {}) => (await ready).tasks(q),
  task: async (id: number) => (await ready).task(id),
  taskCounts: async () => (await ready).taskCounts(),
  createTask: async (input: NewTask) => (await ready).createTask(input),
  updateTask: async (id: number, patch: TaskPatch) => (await ready).updateTask(id, patch),
  addTaskStep: async (id: number, text: string) => (await ready).addTaskStep(id, text),
  setTaskStep: async (stepId: number, done: boolean) => (await ready).setTaskStep(stepId, done),
  removeTaskStep: async (taskId: number, stepId: number) => (await ready).removeTaskStep(taskId, stepId),
  deleteTask: async (id: number) => (await ready).deleteTask(id),
  reminders: async () => (await ready).reminders(),
  cancelReminder: async (id: number) => (await ready).cancelReminder(id),
  startTask: async (id: number, note?: string) => {
    const lyra = await ready;
    // a good moment to ask: the worker may finish while you're away
    if (lyra.state().notifications) void notifier.ask().catch(() => {});
    return lyra.startTask(id, note);
  },
  stopTask: async (id: number) => (await ready).stopTask(id),
  workerRuns: async (id: number) => (await ready).workerRuns(id),
  taskActivity: async (id: number) => (await ready).taskActivity(id),
  taskReport: async (id: number) => (await ready).taskReport(id),
  soul: async () => (await ready).soul(),
  saveSoul: async (content: string) => (await ready).saveSoul(content),
  resetSoul: async () => (await ready).resetSoul(),
  routines: async () => (await ready).routines(),
  routine: async (id: number) => (await ready).routine(id),
  routinePresets: async () => (await ready).routinePresets(),
  addPreset: async (key: string) => (await ready).addPreset(key),
  createRoutine: async (input: RoutineInput) => (await ready).createRoutine(input),
  updateRoutine: async (id: number, input: Partial<RoutineInput>) => (await ready).updateRoutine(id, input),
  deleteRoutine: async (id: number) => (await ready).deleteRoutine(id),
  runRoutine: async (id: number) => (await ready).runRoutine(id),
  connectGmail: async () => (await ready).connectGmail(),
  disconnectGmail: async () => (await ready).disconnectGmail(),
  connectGoogle: async (id: "gmail" | "calendar" | "drive") => (await ready).connectGoogle(id),
  disconnectGoogle: async (id: "gmail" | "calendar" | "drive") => (await ready).disconnectGoogle(id),
  allowActions: async (kind: "email" | "event", on: boolean) => (await ready).allowActions(kind, on),
  allowContacts: async (on: boolean) => (await ready).allowContacts(on),
  spotifyState: async () => (await ready).spotifyState(),
  connectSpotify: async (clientId?: string) => (await ready).connectSpotify(clientId),
  disconnectSpotify: async () => (await ready).disconnectSpotify(),
  allowSpotify: async (what: "playback" | "playlists", on: boolean) => (await ready).allowSpotify(what, on),
  docs: async () => (await ready).docs(),
  doc: async (id: number) => (await ready).doc(id),
  saveDoc: async (id: number | null, patch: { title: string; body: string }) => (await ready).saveDoc(id, patch),
  deleteDoc: async (id: number) => (await ready).deleteDoc(id),
  saveDocToGoogle: async (id: number) => (await ready).saveDocToGoogle(id),
  refreshDashboard: async (id: number) => (await ready).refreshDashboard(id),
  talkStyle: async () => (await ready).talkStyle(),
  learnStyleNow: async () => (await ready).learnStyleNow(),
  forgetStyle: async () => (await ready).forgetStyle(),
  replyingIn: async () => (await ready).replyingIn(),
  lifeAdmin: async () => (await ready).lifeAdmin(),
  activity: async (kind?: ActivityKind[]) => (await ready).activity({ kind }),
  activityDetail: async (id: string) => (await ready).activityDetail(id),
  scanLifeAdmin: async () => (await ready).scanLifeAdmin(),
  setLifeAdmin: async (on: boolean) => (await ready).setLifeAdmin(on),
  setAdminStatus: async (id: number, status: "open" | "done" | "dismissed") => (await ready).setAdminStatus(id, status),
  skills: async () => (await ready).skills(),
  saveSkill: async (id: number | null, input: { name: string; use_when: string; steps: string }) => (await ready).saveSkill(id, input),
  deleteSkill: async (id: number) => (await ready).deleteSkill(id),
  people: async () => (await ready).people(),
  person: async (id: number) => (await ready).person(id),
  savePerson: async (id: number | null, patch: Parameters<Lyra["savePerson"]>[1]) => (await ready).savePerson(id, patch),
  deletePerson: async (id: number) => (await ready).deletePerson(id),
  tidyNow: async () => (await ready).tidyNow(),
  undoTidy: async (messageId: number) => (await ready).undoTidy(messageId),
  setTidy: async (on: boolean) => (await ready).setTidy(on),
  tidyOn: async () => (await ready).tidyOn,
  action: async (id: number) => (await ready).action(id),
  decideAction: async (id: number, choice: "send" | "draft" | "add" | "decline", edited?: Record<string, unknown>) => (await ready).decideAction(id, choice, edited),
  scanAction: async (messageId: number, which: number | "all") => (await ready).scanAction(messageId, which),
  places: async () => (await ready).places(),
  savePlace: async (name: string) => (await ready).savePlace(name),
  forgetPlace: async (name: string) => (await ready).forgetPlace(name),
  placeReminders: async () => (await ready).placeReminders(),
  cancelPlaceReminder: async (id: number) => (await ready).cancelPlaceReminder(id),
  /** Turn leave-now nudges on or off on this phone, and plan them right away. */
  setLeaveNow: async (on: boolean) => {
    const lyra = await ready;
    localStorage.setItem(LEAVE_NOW, on ? "1" : "0");
    if (on) await planLeaving(lyra, true);
    else await notifier.leaveNotices([]);
  },
};

export interface StreamHandlers {
  text(d: string): void;
  /** replace what's been written so far */
  reset?(text: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  reaction?(emoji: string): void;
  done(message: Message, user?: Message): void;
}

/** Send a message; Lyra's reply arrives through the handlers as it's written. */
export async function sendChat(text: string, h: StreamHandlers, channelId: number | null = null, attachments: Attachment[] = []): Promise<void> {
  const lyra = await ready;
  const { message, user, queued } = await lyra.chat(text, { text: h.text, reset: h.reset, status: h.status, memory: h.memory, reaction: h.reaction }, channelId, attachments);
  h.done(message, user);
  // sent back to back: the first message's send already tells you about this reply
  if (queued) return;
  // you switched away while Lyra was writing
  if (message.content.trim()) notice(lyra, "Lyra", firstLine(message.content), chatHash(channelId));
}
