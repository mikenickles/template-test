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
import { createPlatform, isNative, notifier } from "./platform";

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

const ready: Promise<Lyra> = createPlatform().then(async (p) => {
  const lyra = await Lyra.start(p);
  // Save to disk whenever the app leaves the screen.
  if (isNative) void CapApp.addListener("pause", () => void lyra.flush());
  addEventListener("pagehide", () => void lyra.flush());
  watchForNotices(lyra);
  return lyra;
});

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
  void notifier.reminders(lyra.state().notifications ? lyra.routines() : []).catch(() => {});
}

function watchForNotices(lyra: Lyra): void {
  syncReminders(lyra);
  // only a task that just became "Ready for you" is news
  const seen = new Map(lyra.tasks({}).map((t) => [t.id, t.status]));
  lyra.onChange((e) => {
    if (e.type === "routine") return syncReminders(lyra);
    if (e.type === "message" && "notify" in e && e.notify) return notice(lyra, e.notify.title, e.notify.body, chatHash(e.channelId));
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
  startTask: async (id: number, note?: string) => {
    const lyra = await ready;
    // a good moment to ask: the worker may finish while you're away
    if (lyra.state().notifications) void notifier.ask().catch(() => {});
    return lyra.startTask(id, note);
  },
  stopTask: async (id: number) => (await ready).stopTask(id),
  workerRuns: async (id: number) => (await ready).workerRuns(id),
  taskActivity: async (id: number) => (await ready).taskActivity(id),
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
};

export interface StreamHandlers {
  text(d: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  reaction?(emoji: string): void;
  done(message: Message, user?: Message): void;
}

/** Send a message; Lyra's reply arrives through the handlers as it's written. */
export async function sendChat(text: string, h: StreamHandlers, channelId: number | null = null): Promise<void> {
  const lyra = await ready;
  const { message, user } = await lyra.chat(text, { text: h.text, status: h.status, memory: h.memory, reaction: h.reaction }, channelId);
  h.done(message, user);
  // you switched away while Lyra was writing
  if (message.content.trim()) notice(lyra, "Lyra", firstLine(message.content), chatHash(channelId));
}
