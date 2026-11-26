/** Running one tool call from the model: every chat tool's handler, with the refusals for turns that read outside content. */
import { listMessages, type Channel, type MemoryNote, type TaskNote } from "../db.ts";
import { type Notebook } from "../memory.ts";
import type { RoutineInput } from "../routines.ts";
import { addStep, createTask, describeTasks, getTask, listTasks, log as logTask, parseStatus, setStepDone, STATUS_LABEL, STATUSES, taskDetail, updateTask, type TaskStatus } from "../tasks.ts";
import { type TurnEmitter, type TurnContext, MAIN, who } from "./context.ts";
import type { TurnState } from "../chat.ts";

export async function pickNotebook(ctx: TurnContext, name: unknown): Promise<{ book: Notebook; label: string } | { error: string }> {
  const wanted = String(name ?? MAIN).trim();
  if (!wanted || wanted.toLowerCase() === MAIN) return { book: ctx.workspace.main, label: "Memory" };
  const ch = ctx.workspace.channels().find((c) => c.name.toLowerCase() === wanted.toLowerCase());
  if (!ch) return { error: `There's no notebook called "${wanted}". Use "${MAIN}" or a channel name.` };
  return { book: await ctx.workspace.notebook(ch.id), label: ch.name };
}

/** The user asking, in their own words, for a reminder or for Lyra to check back. */
/**
 * Added to every "not done, outside content was read" result. Seen with a real model: after such
 * a result the reply became only about the thing that wasn't saved, and the answer was lost.
 */
export const ANSWER_FIRST =
  " This is not an error and not news: your reply is still the full answer to what they asked. Mention this at most as one short offer at the very end (\"Want me to save that?\"), never as the reply itself, and never say it is waiting, held or needs confirming. Don't apologize for it or write a \"correction\": the user hasn't seen anything to correct.";

export const ASKED_REMINDER = /\b(remind(er|ers|s)?|nudge|ping me|don'?t let me forget|follow[- ]?up|check back|check in on|keep an eye|let me know (when|if|once)|tell me (when|if|once)|alert me|heads[- ]?up)\b/i;
/** The user asking for something to go on their list. */
export const ASKED_TASK = /\b(tasks?|to-?dos?|my list|add (it|that|this|them|those|these|everything|anything|all)|put (it|that|this|them|those) (on|in)|track (it|this|that|them))\b/i;

export async function runTool(
  ctx: TurnContext,
  name: string,
  input: Record<string, unknown>,
  state: TurnState,
  notes: MemoryNote[],
  emit: TurnEmitter,
  taskNotes: TaskNote[] = [],
): Promise<{ content: string; isError: boolean }> {
  const note = (n: MemoryNote) => {
    notes.push(n);
    emit.memory(n);
  };
  const fail = (content: string) => ({ content, isError: true });

  if (name === "remember" || name === "forget") {
    const picked = await pickNotebook(ctx, input.notebook);
    if ("error" in picked) return fail(picked.error);
    const { book, label } = picked;
    const section = book.section(String(input.section ?? ""));
    if (!section) return fail(`The ${label} notebook's sections are: ${book.sections.join(", ")}.`);
    const where = { notebook: book.scope, notebookLabel: label, section };

    if (name === "remember") {
      const text = String(input.text ?? "");
      if (state.tainted) {
        try {
          const suggestionId = book.addSuggestion(section, text);
          note({ kind: "suggested", ...where, text, suggestionId });
        } catch (e) {
          return fail((e as Error).message);
        }
        return {
          content: "Shown to the user as a suggestion they can tap to keep (outside content was read this turn). Nothing more to do or say about it: carry on with the answer to what they asked.",
          isError: false,
        };
      }
      try {
        const r = await book.remember(section, text);
        if (r.snapshotId) note({ kind: "saved", ...where, text: r.text, snapshotId: r.snapshotId });
        return { content: r.snapshotId ? "Saved." : "Already in that notebook.", isError: false };
      } catch (e) {
        return fail((e as Error).message);
      }
    }

    if (state.tainted) return fail("Not removed: outside content was read this turn. Ask the user to confirm in their next message.");
    const r = await book.forget(section, String(input.match ?? ""));
    if ("error" in r) return fail(r.error);
    note({ kind: "removed", ...where, text: r.text, snapshotId: r.snapshotId });
    return { content: `Removed: ${r.text}`, isError: false };
  }

  if (name === "create_channel") {
    if (state.tainted) return fail(`Not created: outside content was read this turn. Make it once the user says yes.${ANSWER_FIRST}`);
    try {
      const c = await ctx.workspace.createChannel({ name: String(input.name ?? ""), about: String(input.about ?? ""), icon: String(input.icon ?? "") });
      emit.status(`Made the ${c.name} channel`);
      return { content: `Created the ${c.name} channel. It's in the menu at the top left.`, isError: false };
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  if (name === "create_task" || name === "update_task" || name === "start_task") {
    // A task may later be carried out by a worker, so outside content can't start or steer one. A
    // to-do the user asked for themselves can still be added: it just waits, unstarted.
    const listOnly = state.tainted && name === "create_task" && state.asked(ASKED_TASK);
    if (state.tainted && !listOnly)
      return fail(`Not changed: outside content was read this turn. Offer what you'd add or change with suggest_replies; do it once they say yes.${ANSWER_FIRST}`);
    try {
      if (name === "create_task") {
        const ch = String(input.channel ?? "").trim();
        let channelId: number | null = ctx.channel?.id ?? null;
        if (ch.toLowerCase() === "none") channelId = null;
        else if (ch) {
          const found = ctx.workspace.channels().find((c) => c.name.toLowerCase() === ch.toLowerCase());
          if (!found) return fail(`There's no ${ch} channel.`);
          channelId = found.id;
        }
        const steps = Array.isArray(input.steps) ? input.steps.map(String) : [];
        if (input.research === true && !ctx.webSearch) return fail("Research needs web search, which is off. Ask the user to turn it on in Settings, AI model, Web.");
        const t = createTask(ctx.db, { title: String(input.title ?? ""), brief: String(input.details ?? ""), steps, channelId, kind: input.research === true ? "research" : "task" }, "lyra");
        let started = "";
        if (listOnly) started = " It's on the list as Up next. It isn't started, because this reply read outside content: they can tap Start on it.";
        else if (input.start !== false && ctx.workspace.startTask) {
          try {
            ctx.workspace.startTask(t.id);
            started = " A worker started on it and will report back here.";
          } catch (e) {
            started = ` It's waiting as Up next: ${(e as Error).message}`;
          }
        }
        const fresh = getTask(ctx.db, t.id)!;
        taskNotes.push({ id: t.id, title: t.title, kind: "created", status: fresh.status });
        return { content: `Added task #${t.id}: ${t.title}.${started || " It's waiting as Up next."}`, isError: false };
      }
      if (name === "start_task") {
        const t = getTask(ctx.db, Number(input.id));
        if (!t) return fail(`There's no task #${input.id}.`);
        if (!ctx.workspace.startTask) return fail("Workers aren't available.");
        ctx.workspace.startTask(t.id, typeof input.note === "string" ? input.note : undefined);
        taskNotes.push({ id: t.id, title: t.title, kind: "updated", status: getTask(ctx.db, t.id)!.status });
        return { content: `The worker is on #${t.id} and will report back here.`, isError: false };
      }
      const id = Number(input.id);
      const detail = taskDetail(ctx.db, id);
      if (!detail) return fail(`There's no task #${input.id}.`);
      let status: TaskStatus | undefined;
      if (input.status !== undefined) {
        status = parseStatus(input.status);
        if (!status) return fail(`Status must be one of: ${STATUSES.map((s) => STATUS_LABEL[s]).join(", ")}.`);
      }
      for (const s of Array.isArray(input.add_steps) ? input.add_steps : []) addStep(ctx.db, id, String(s), true, "lyra");
      for (const n of Array.isArray(input.finish_steps) ? input.finish_steps : []) {
        const step = detail.steps[Number(n) - 1];
        if (step) setStepDone(ctx.db, step.id, true, "lyra");
      }
      if (typeof input.note === "string" && input.note.trim()) logTask(ctx.db, id, "lyra", input.note);
      const t = updateTask(ctx.db, id, { status, needs: typeof input.needs === "string" ? input.needs : undefined }, "lyra");
      taskNotes.push({ id: t.id, title: t.title, kind: "updated", status: t.status });
      return { content: `Updated #${t.id}: ${t.title} is ${STATUS_LABEL[t.status]}.`, isError: false };
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  if (name === "set_reminder" || name === "follow_up" || name === "cancel_reminder" || name === "remind_at_place") {
    const rs = ctx.workspace.reminders;
    if (!rs) return fail("Reminders aren't available.");
    if (name === "cancel_reminder") {
      if (state.tainted) return fail("Not cancelled: outside content was read this turn. Ask the user, and cancel it once they say yes.");
      try {
        const id = String(input.id ?? "");
        if (/^p\d+$/i.test(id)) {
          if (!rs.cancelPlace) return fail("Place reminders aren't available here.");
          return { content: rs.cancelPlace(Number(id.slice(1))), isError: false };
        }
        return { content: rs.cancel(Number(id)), isError: false };
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    // a reminder the user asked for in their own words is theirs to ask for, whatever was read since
    if (state.tainted && !state.asked(ASKED_REMINDER))
      return fail(`Not set: outside content was read this turn and they didn't ask for a reminder. Offer it with suggest_replies (what, and when); set it once they say yes.${ANSWER_FIRST}`);
    if (name === "remind_at_place") {
      if (!rs.atPlace) return fail("Place reminders aren't available.");
      try {
        const r = await rs.atPlace(String(input.text ?? ""), String(input.place ?? ""), input.on === "leave" ? "leave" : "arrive", ctx.channel?.id ?? null);
        emit.status(`Reminder set for ${r.place}`);
        return { content: `Set (#p${r.id}): it goes off on their phone ${input.on === "leave" ? "when they leave" : "when they get to"} ${r.place}.`, isError: false };
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    const kind = name === "set_reminder" ? "remind" : "follow_up";
    try {
      const r = rs.create(kind, String((kind === "remind" ? input.text : input.about) ?? ""), String(input.at ?? ""), ctx.channel?.id ?? null);
      emit.status(kind === "remind" ? `Reminder set for ${r.when}` : `Follow-up set for ${r.when}`);
      return { content: `Set (#${r.id}) for ${r.when}.`, isError: false };
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  if (name === "create_routine" || name === "update_routine" || name === "list_routines") {
    const rs = ctx.workspace.routines;
    if (!rs) return fail("Routines aren't available.");
    if (name === "list_routines") {
      const list = rs.list();
      return {
        content: list.length
          ? list
              .map((r) => `- #${r.id} ${r.name}: ${r.schedule}${r.enabled ? "" : " (paused)"}, ${r.post_mode === "always" ? "always posts" : "posts only news"}${r.channel_name ? `, in ${r.channel_name}` : ""}, runs on ${r.model ? r.model.slice(r.model.indexOf(":") + 1) : "the default routine model"}`)
              .join("\n")
          : "No routines yet.",
        isError: false,
      };
    }
    // A routine keeps running unattended, so outside content can't set one up or change it.
    if (state.tainted) return fail("Not changed: outside content was read this turn. Tell the user what you'd set up, and do it once they say yes.");
    try {
      if (name === "create_routine") {
        const ch = String(input.channel ?? "").trim();
        let channelId: number | null = ctx.channel?.id ?? null;
        if (ch.toLowerCase() === "none") channelId = null;
        else if (ch) {
          const found = ctx.workspace.channels().find((c) => c.name.toLowerCase() === ch.toLowerCase());
          if (!found) return fail(`There's no ${ch} channel.`);
          channelId = found.id;
        }
        const when = input.when && typeof input.when === "object" ? input.when : undefined;
        const r = await rs.create({
          name: String(input.name ?? ""),
          instructions: String(input.instructions ?? ""),
          times: String(input.times ?? ""),
          days: typeof input.days === "string" ? input.days : "0123456",
          // a routine set off by something happening says so each time, unless told otherwise
          postMode: input.always_post ?? !!when ? "always" : "news",
          channelId,
          ...(when ? { trigger: when } : {}),
          ...(typeof input.model === "string" && input.model.trim() ? { model: input.model } : {}),
        });
        emit.status(`Set up ${r.name}`);
        const sched = rs.list().find((x) => x.id === r.id)?.schedule ?? "";
        return { content: `Routine #${r.id} "${r.name}" set: ${sched}. It's on the Tasks tab under Scheduled.`, isError: false };
      }
      const patch: Partial<RoutineInput> = {};
      if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
      if (typeof input.times === "string") patch.times = input.times;
      if (typeof input.days === "string") patch.days = input.days;
      if (typeof input.instructions === "string") patch.instructions = input.instructions;
      if (typeof input.name === "string") patch.name = input.name;
      if (typeof input.model === "string") patch.model = input.model;
      const r = await rs.update(Number(input.id), patch);
      return { content: `Updated routine #${r.id} "${r.name}".`, isError: false };
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  if (name === "list_tasks") {
    if (input.id !== undefined) {
      const d = taskDetail(ctx.db, Number(input.id));
      if (!d) return fail(`There's no task #${input.id}.`);
      const steps = d.steps.map((s, i) => `${i + 1}. [${s.done ? "x" : " "}] ${s.text}`).join("\n");
      const log = d.log
        .slice(0, 15)
        .map((l) => `${l.at.slice(0, 16).replace("T", " ")} ${l.text}`)
        .join("\n");
      return {
        content: `#${d.task.id} ${d.task.title}\nStatus: ${STATUS_LABEL[d.task.status]}${d.task.needs ? ` (needs: ${d.task.needs})` : ""}\nChannel: ${d.task.channel_name ?? "none"}\nDetails: ${d.task.brief || "(none)"}\nSteps:\n${steps || "(none)"}\nLog (newest first):\n${log}`,
        isError: false,
      };
    }
    const st = String(input.status ?? "Open");
    const status = st.toLowerCase() === "open" ? "open" : parseStatus(st);
    if (!status) return fail("Unknown status.");
    const rows = listTasks(ctx.db, { status, q: typeof input.search === "string" ? input.search : undefined, limit: 30 });
    return { content: rows.length ? describeTasks(rows, true) : "No tasks match.", isError: false };
  }

  if (name === "read_channel") {
    const ch = ctx.workspace.channels().find((c) => c.name.toLowerCase() === String(input.channel ?? "").trim().toLowerCase());
    if (!ch) return fail("There's no channel by that name.");
    emit.status(`Checking ${ch.name}`);
    const n = Math.min(Math.max(Number(input.messages) || 12, 1), 40);
    const msgs = listMessages(ctx.db, ch.id, n).filter((m) => !m.meta.error && m.content.trim());
    const book = await ctx.workspace.notebook(ch.id);
    const lines = msgs.map((m) => `[${m.created_at.slice(0, 16).replace("T", " ")}] ${m.role === "user" ? who(ctx) : "Tomo"}: ${m.content}`);
    return {
      content: `Channel: ${ch.name}\nAbout: ${ch.about || "(not set)"}\n\nNotebook:\n${book.read().trim()}\n\nLatest messages (oldest first):\n${lines.join("\n") || "(none yet)"}`,
      isError: false,
    };
  }

  if (ctx.connectors.owns(name)) {
    emit.status(ctx.connectors.label(name));
    return ctx.connectors.call(name, input);
  }
  return fail(`Unknown tool ${name}.`);
}
