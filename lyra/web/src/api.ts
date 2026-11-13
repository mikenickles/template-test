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
import { readSyncState, Sync, type SnapshotInfo, type SyncResult } from "../../core/sync";
import { DriveSyncRemote } from "../../core/sync-drive";
import { applyUpdate, checkForUpdate, watchForUpdates } from "./updater";
import { watchWidget } from "./widget";
import { background, createPlatform, deviceKind, isDesktop, isNative, keepBackupCopy, notifier, shareFile } from "./platform";

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
  // right after loading another device's data, its running workers stay with that device
  const lyra = await Lyra.start(p, { resumeWorkers: !state.justPulled });
  sync = new Sync(lyra, new DriveSyncRemote(p.google), p.texts, p.secrets, state);
  if (isDesktop) sync.onSnapshot = (bytes, info) => void keepBackupCopy(autoName(info.savedAt), bytes).catch(() => {});
  await sync.started();
  // Save to disk whenever the app leaves the screen.
  if (isNative) void CapApp.addListener("pause", () => void lyra.flush());
  addEventListener("pagehide", () => void lyra.flush());
  watchForNotices(lyra);
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
// on, only the phone runs them, so the same brief isn't posted twice.

const routinesRunHere = () => !(isDesktop && sync.state.enabled);

function runRoutines(lyra: Lyra): void {
  const tick = () => {
    if (!routinesRunHere() || restarting) return;
    try {
      lyra.tickRoutines();
    } catch (e) {
      console.error("[lyra] routines", e);
    }
  };
  tick();
  setInterval(tick, 60_000);
  // the phone keeping watch in the background: run what's due, give it a couple of minutes to finish, save, send to sync
  background.onTick(async () => {
    tick();
    await Promise.race([lyra.routinesRunner.settle(), new Promise((r) => setTimeout(r, 150_000))]);
    await lyra.flush();
    if (sync.state.enabled) await syncNow(lyra, { pull: false });
  });
  if (isNative) void CapApp.addListener("resume", tick);
  else document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());
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
  // nor in the middle of a voice call
  const canPull = opts.pull !== false && !lyra.busy && !typing && !editing && !document.body.dataset.call;
  try {
    const r = await sync.check(canPull);
    if (r === "pulled") restartApp();
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
}

export const updatesApi = {
  check: async () => checkForUpdate(await ready),
  apply: async () => applyUpdate(await ready),
};

export const syncApi = {
  status: async (): Promise<SyncStatus> => {
    await ready;
    const s = sync.state;
    return { enabled: s.enabled, deviceName: s.deviceName, lastSync: s.lastSync, lastError: s.lastError, pending: s.dirty, conflict: s.conflict, routinesHere: routinesRunHere() };
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

let foreground = true;
if (isNative) void CapApp.addListener("appStateChange", (s) => (foreground = s.isActive));
else document.addEventListener("visibilitychange", () => (foreground = document.visibilityState === "visible"));

const firstLine = (text: string) => text.trim().split("\n")[0].replace(/[*_`#>]/g, "").slice(0, 160);
const chatHash = (channelId: number | null) => (channelId === null ? "#/" : `#/c/${channelId}`);

function notice(lyra: Lyra, title: string, body: string, hash: string): void {
  if (foreground || !lyra.state().notifications) return;
  void notifier.now(title, body, hash).catch(() => {});
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
  lyra.onChange((e) => {
    if (e.type === "routine" || e.type === "reminder" || e.type === "admin") return syncReminders(lyra);
    if (e.type === "message" && "notify" in e && e.notify) {
      // reminders: the phone already showed its scheduled notification; on a computer, say it even while Lyra is open
      if (e.notify.scheduled) {
        if (!isNative && lyra.state().notifications) void notifier.now(e.notify.title, e.notify.body, chatHash(e.channelId)).catch(() => {});
        return;
      }
      return notice(lyra, e.notify.title, e.notify.body, chatHash(e.channelId));
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
      if (d.task.status === "ready" && before !== "ready") notice(lyra, `Ready for you: ${d.task.title}`, d.task.needs || "Lyra finished its part.", `#/t/${e.taskId}`);
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
};

export interface StreamHandlers {
  text(d: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  reaction?(emoji: string): void;
  done(message: Message, user?: Message): void;
}

/** Send a message; Lyra's reply arrives through the handlers as it's written. */
export async function sendChat(text: string, h: StreamHandlers, channelId: number | null = null, attachments: Attachment[] = []): Promise<void> {
  const lyra = await ready;
  const { message, user, queued } = await lyra.chat(text, { text: h.text, status: h.status, memory: h.memory, reaction: h.reaction }, channelId, attachments);
  h.done(message, user);
  // sent back to back: the first message's send already tells you about this reply
  if (queued) return;
  // you switched away while Lyra was writing
  if (message.content.trim()) notice(lyra, "Lyra", firstLine(message.content), chatHash(channelId));
}
