/** Tasks, the workers that do them, and the activity log. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as D from "../docs.ts";
import * as AC from "../activity.ts";
import * as SC from "../scan.ts";
import * as T from "../tasks.ts";
import { type WorkerRun } from "../workers.ts";
import * as R from "../routines.ts";
import { part } from "./part.ts";

export const tasks = part({
  /**
   * What Lyra is working on right now (0.45), for the live progress notification: each task
   * being worked, Lyra's latest step on it, and how far through its checklist it is.
   */
  liveWork(): { id: number; title: string; note: string; done: number; total: number; since: number }[] {
    return T.listTasks(this.db, { status: "working", limit: 5 }).map((t) => {
      const last = this.db.get<{ text: string }>("SELECT text FROM task_log WHERE task_id = ? AND who != 'you' ORDER BY id DESC LIMIT 1", [t.id]);
      const run = this.db.get<{ started_at: string }>("SELECT started_at FROM worker_runs WHERE task_id = ? ORDER BY id DESC LIMIT 1", [t.id]);
      const since = run ? Date.parse(run.started_at.endsWith("Z") ? run.started_at : `${run.started_at.replace(" ", "T")}Z`) : Date.now();
      return { id: t.id, title: t.title, note: (last?.text ?? "Getting started").replace(/^Result: /, "").slice(0, 200), done: t.steps_done, total: t.steps_total, since: Number.isNaN(since) ? Date.now() : since };
    });
  },

  /** "Later" on a task: out of Up next until tomorrow morning (or null: back now). */
  async snoozeTask(id: number, until: string | null): Promise<T.TaskRow> {
    const t = T.snoozeTask(this.db, id, until ? new Date(until) : null);
    this.listeners.forEach((l) => l({ type: "task", taskId: id }));
    await this.db.flush();
    return t;
  },

  // ---------- tasks ----------

  tasks(query: T.TaskQuery = {}): T.TaskRow[] {
    return T.listTasks(this.db, query);
  },

  task(id: number): T.TaskDetail {
    const d = T.taskDetail(this.db, id);
    if (!d) throw new Error("That task no longer exists.");
    return d;
  },

  taskCounts(): Record<T.TaskStatus, number> {
    return T.taskCounts(this.db);
  },

  async saved<R>(r: R): Promise<R> {
    await this.db.flush();
    return r;
  },

  async createTask(input: T.NewTask): Promise<T.TaskRow> {
    return this.saved(T.createTask(this.db, input, "you"));
  },

  async updateTask(id: number, patch: T.TaskPatch): Promise<T.TaskDetail> {
    T.updateTask(this.db, id, patch, "you");
    return this.saved(this.task(id));
  },

  async addTaskStep(id: number, text: string): Promise<T.TaskDetail> {
    if (!T.getTask(this.db, id)) throw new Error("That task no longer exists.");
    T.addStep(this.db, id, text, true, "you");
    return this.saved(this.task(id));
  },

  async setTaskStep(stepId: number, done: boolean): Promise<T.TaskDetail> {
    const s = T.setStepDone(this.db, stepId, done, "you");
    return this.saved(this.task(s.task_id));
  },

  async removeTaskStep(taskId: number, stepId: number): Promise<T.TaskDetail> {
    T.removeStep(this.db, stepId);
    return this.saved(this.task(taskId));
  },

  async deleteTask(id: number): Promise<void> {
    T.deleteTask(this.db, id);
    await this.db.flush();
  },

  async startTask(id: number, note?: string): Promise<T.TaskDetail> {
    this.workers.start(id, "you", note);
    return this.saved(this.task(id));
  },

  async stopTask(id: number): Promise<T.TaskDetail> {
    this.workers.stop(id);
    await this.workers.done(id);
    return this.saved(this.task(id));
  },

  workerRuns(id: number): WorkerRun[] {
    return this.workers.runs(id);
  },

  /** The report doc a task's worker wrote (Phase 15), if any. */
  taskReport(id: number): { id: number; title: string } | null {
    const d = D.reportFor(this.db, id);
    return d ? { id: d.id, title: d.title } : null;
  },

  taskActivity(id: number): string | undefined {
    return this.workers.isRunning(id) ? (this.workers.activity.get(id) ?? "Working") : undefined;
  },

  /** Post what's due: reminders as a message, follow-ups after Lyra has checked. */
  // ---------- the activity log ----------

  /** Everything Lyra did unasked, newest first. */
  activity(opts: { kind?: AC.ActivityKind[]; limit?: number } = {}): AC.Activity[] {
    return AC.listActivity(this.db, opts);
  },

  activityDetail(id: string): AC.ActivityDetail {
    const d = AC.activityDetail(this.db, id);
    if (!d) throw new Error("That's no longer in the log.");
    return d;
  },
});
