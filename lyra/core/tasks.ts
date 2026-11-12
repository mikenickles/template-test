/**
 * Tasks: one row for each thing handed off to Lyra, with steps and a log.
 * In Phase 3 nothing runs them in the background yet; Phase 4's workers
 * will pick up "up next" tasks and write their progress to the log.
 */
import { cleanItem } from "./memory.ts";
import type { DB } from "./db.ts";

export const STATUSES = ["up_next", "working", "ready", "stopped", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  up_next: "Up next",
  working: "Working",
  ready: "Ready for you",
  stopped: "Stopped",
  done: "Done",
};

export type Who = "you" | "lyra" | "worker";

export interface Task {
  id: number;
  title: string;
  brief: string;
  status: TaskStatus;
  /** What Lyra needs from the user, when status is "ready". */
  needs: string;
  channel_id: number | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  /** put off ("Later"): out of Up next until this time */
  snoozed_until: string | null;
}

export interface TaskRow extends Task {
  channel_name: string | null;
  channel_icon: string | null;
  steps_total: number;
  steps_done: number;
}

export interface Step {
  id: number;
  task_id: number;
  position: number;
  text: string;
  done: number;
}

export interface LogEntry {
  id: number;
  task_id: number;
  at: string;
  who: Who;
  text: string;
}

export interface TaskDetail {
  task: TaskRow;
  steps: Step[];
  log: LogEntry[];
}

export function isStatus(s: unknown): s is TaskStatus {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s);
}

/** Accepts "Ready for you", "ready", "up next" and so on. */
export function parseStatus(s: unknown): TaskStatus | undefined {
  if (typeof s !== "string") return undefined;
  const k = s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isStatus(k)) return k;
  return (Object.entries(STATUS_LABEL).find(([, label]) => label.toLowerCase() === s.trim().toLowerCase())?.[0] as TaskStatus) ?? undefined;
}

const now = () => new Date().toISOString();
const oneLine = (s: string, max: number) => cleanItem(s).slice(0, max);
const longText = (s: string, max: number) => s.replace(/\r\n/g, "\n").trim().slice(0, max);

const ROW = `SELECT t.*, c.name AS channel_name, c.icon AS channel_icon,
    (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id) AS steps_total,
    (SELECT COUNT(*) FROM task_steps s WHERE s.task_id = t.id AND s.done = 1) AS steps_done
  FROM tasks t LEFT JOIN channels c ON c.id = t.channel_id`;

export interface TaskQuery {
  /** "open" = everything but done */
  status?: TaskStatus | "open";
  /** null = tasks not in a channel; undefined = any */
  channelId?: number | null;
  q?: string;
  limit?: number;
}

export function listTasks(db: DB, query: TaskQuery = {}): TaskRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.status === "open") where.push("t.status != 'done'");
  else if (query.status) {
    where.push("t.status = ?");
    params.push(query.status);
  }
  if (query.channelId === null) where.push("t.channel_id IS NULL");
  else if (query.channelId !== undefined) {
    where.push("t.channel_id = ?");
    params.push(query.channelId);
  }
  if (query.q?.trim()) {
    where.push("(t.title LIKE ? ESCAPE '\\' OR t.brief LIKE ? ESCAPE '\\' OR t.needs LIKE ? ESCAPE '\\')");
    const like = `%${query.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    params.push(like, like, like);
  }
  const order = query.status === "done" ? "t.done_at DESC, t.id DESC" : "t.updated_at DESC, t.id DESC";
  return db.all<TaskRow>(`${ROW}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ?`, [
    ...params,
    query.limit ?? 200,
  ]);
}

export function getTask(db: DB, id: number): TaskRow | undefined {
  return db.get<TaskRow>(`${ROW} WHERE t.id = ?`, [id]);
}

export function taskDetail(db: DB, id: number): TaskDetail | undefined {
  const task = getTask(db, id);
  if (!task) return undefined;
  return {
    task,
    steps: db.all<Step>("SELECT * FROM task_steps WHERE task_id = ? ORDER BY position, id", [id]),
    log: db.all<LogEntry>("SELECT * FROM task_log WHERE task_id = ? ORDER BY id DESC LIMIT 200", [id]),
  };
}

export function taskCounts(db: DB): Record<TaskStatus, number> {
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const r of db.all<{ status: TaskStatus; n: number }>("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status")) out[r.status] = r.n;
  return out;
}

export function log(db: DB, taskId: number, who: Who, text: string): void {
  db.run("INSERT INTO task_log (task_id, who, text) VALUES (?, ?, ?)", [taskId, who, longText(text, 2000)]);
}

function touch(db: DB, id: number) {
  db.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [now(), id]);
}

export interface NewTask {
  title: string;
  brief?: string;
  steps?: string[];
  channelId?: number | null;
}

export function createTask(db: DB, input: NewTask, who: Who): TaskRow {
  const title = oneLine(input.title ?? "", 120);
  if (!title) throw new Error("Give the task a title.");
  if (input.channelId != null && !db.get("SELECT id FROM channels WHERE id = ?", [input.channelId])) throw new Error("That channel no longer exists.");
  const row = db.run<{ id: number }>("INSERT INTO tasks (title, brief, channel_id) VALUES (?, ?, ?) RETURNING id", [
    title,
    longText(input.brief ?? "", 4000),
    input.channelId ?? null,
  ])!;
  for (const s of (input.steps ?? []).slice(0, 30)) addStep(db, row.id, s, false);
  log(db, row.id, who, who === "you" ? "You added this task." : "Lyra added this task.");
  return getTask(db, row.id)!;
}

export interface TaskPatch {
  title?: string;
  brief?: string;
  status?: TaskStatus;
  needs?: string;
  channelId?: number | null;
}

export function updateTask(db: DB, id: number, patch: TaskPatch, who: Who): TaskRow {
  const t = getTask(db, id);
  if (!t) throw new Error("That task no longer exists.");
  const by = who === "you" ? "You" : who === "lyra" ? "Lyra" : "The worker";
  if (patch.title !== undefined) {
    const title = oneLine(patch.title, 120);
    if (!title) throw new Error("Give the task a title.");
    if (title !== t.title) {
      db.run("UPDATE tasks SET title = ? WHERE id = ?", [title, id]);
      log(db, id, who, `${by} renamed it to “${title}”.`);
    }
  }
  if (patch.brief !== undefined && longText(patch.brief, 4000) !== t.brief) {
    db.run("UPDATE tasks SET brief = ? WHERE id = ?", [longText(patch.brief, 4000), id]);
    log(db, id, who, `${by} edited the details.`);
  }
  if (patch.channelId !== undefined && patch.channelId !== t.channel_id) {
    if (patch.channelId !== null && !db.get("SELECT id FROM channels WHERE id = ?", [patch.channelId])) throw new Error("That channel no longer exists.");
    db.run("UPDATE tasks SET channel_id = ? WHERE id = ?", [patch.channelId, id]);
    log(db, id, who, `${by} moved it.`);
  }
  if (patch.needs !== undefined) db.run("UPDATE tasks SET needs = ? WHERE id = ?", [oneLine(patch.needs, 300), id]);
  if (patch.status !== undefined && patch.status !== t.status) {
    if (!isStatus(patch.status)) throw new Error("Unknown status.");
    db.run("UPDATE tasks SET status = ?, done_at = ? WHERE id = ?", [patch.status, patch.status === "done" ? now() : null, id]);
    // what Lyra was waiting for no longer applies once it isn't waiting
    if (patch.status !== "ready" && patch.needs === undefined) db.run("UPDATE tasks SET needs = '' WHERE id = ?", [id]);
    const needs = patch.status === "ready" && patch.needs ? `: ${oneLine(patch.needs, 300)}` : ".";
    log(db, id, who, `${by} set it to ${STATUS_LABEL[patch.status]}${needs}`);
  }
  touch(db, id);
  return getTask(db, id)!;
}

export function deleteTask(db: DB, id: number): void {
  db.run("DELETE FROM tasks WHERE id = ?", [id]);
}

export function addStep(db: DB, taskId: number, text: string, logIt = true, who: Who = "you"): Step {
  const clean = oneLine(text, 200);
  if (!clean) throw new Error("Write the step first.");
  const pos = (db.get<{ p: number | null }>("SELECT MAX(position) AS p FROM task_steps WHERE task_id = ?", [taskId])?.p ?? 0) + 1;
  const step = db.run<Step>("INSERT INTO task_steps (task_id, position, text) VALUES (?, ?, ?) RETURNING *", [taskId, pos, clean])!;
  if (logIt) {
    log(db, taskId, who, `${who === "you" ? "You" : "Lyra"} added a step: ${clean}`);
    touch(db, taskId);
  }
  return step;
}

export function setStepDone(db: DB, stepId: number, done: boolean, who: Who): Step {
  const s = db.get<Step>("SELECT * FROM task_steps WHERE id = ?", [stepId]);
  if (!s) throw new Error("That step no longer exists.");
  if (!!s.done !== done) {
    db.run("UPDATE task_steps SET done = ? WHERE id = ?", [done ? 1 : 0, stepId]);
    log(db, s.task_id, who, `${who === "you" ? "You" : who === "lyra" ? "Lyra" : "The worker"} ${done ? "finished" : "reopened"}: ${s.text}`);
    touch(db, s.task_id);
  }
  return db.get<Step>("SELECT * FROM task_steps WHERE id = ?", [stepId])!;
}

export function removeStep(db: DB, stepId: number): void {
  const s = db.get<Step>("SELECT * FROM task_steps WHERE id = ?", [stepId]);
  if (!s) return;
  db.run("DELETE FROM task_steps WHERE id = ?", [stepId]);
  touch(db, s.task_id);
}

/** One line per open task, for the model's context. */
export function describeTasks(rows: TaskRow[], withChannel: boolean): string {
  return rows
    .map((t) => {
      const bits = [`#${t.id} [${STATUS_LABEL[t.status]}] ${t.title}`];
      if (withChannel && t.channel_name) bits.push(`(in ${t.channel_name})`);
      if (t.steps_total) bits.push(`steps ${t.steps_done}/${t.steps_total}`);
      if (t.status === "ready" && t.needs) bits.push(`needs: ${t.needs}`);
      return `- ${bits.join(" ")}`;
    })
    .join("\n");
}

/** "Later": out of Up next until `until` (null brings it back now). */
export function snoozeTask(db: DB, id: number, until: Date | null, who: Who = "you"): TaskRow {
  const t = getTask(db, id);
  if (!t) throw new Error("That task no longer exists.");
  if (until && Number.isNaN(until.getTime())) throw new Error("That time doesn't look right.");
  db.run("UPDATE tasks SET snoozed_until = ? WHERE id = ?", [until ? until.toISOString() : null, id]);
  if (until) log(db, id, who, `${who === "you" ? "You" : "Lyra"} put it off until later.`);
  return getTask(db, id)!;
}
