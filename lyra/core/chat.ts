import type { Connectors } from "./connectors/registry.ts";
import { attachmentParts, attachmentReminder, checkAttachments, type Attachment } from "./attachments.ts";
import { addMessage, listMessages, updateMessageMeta, type Channel, type ChannelSummary, type DB, type MemoryNote, type StoredMessage, type TaskNote } from "./db.ts";
import { CHANNEL_SECTIONS, SECTIONS, type Notebook } from "./memory.ts";
import { buildSystemPrompt, type ChannelDigest } from "./prompt.ts";
import { describeSchedule, type RoutineInput } from "./routines.ts";
import { uniqueSources, type ModelProvider, type Msg, type Part, type Source, type ToolDef } from "./providers/types.ts";
import {
  addStep,
  createTask,
  describeTasks,
  getTask,
  listTasks,
  log as logTask,
  parseStatus,
  setStepDone,
  STATUS_LABEL,
  STATUSES,
  taskDetail,
  updateTask,
  type TaskStatus,
} from "./tasks.ts";

export const MAX_STEPS = 8;
const HISTORY = 40;

export const CHANNEL_ICONS = ["home", "sprout", "game", "heart", "work", "travel", "tools", "book", "money", "star"] as const;

export interface TurnEmitter {
  text(delta: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  /** Lyra reacted to the user's message with this emoji. */
  reaction?(emoji: string): void;
}

/** The reactions Lyra can put on a message, like a tapback. */
export const REACTIONS = ["❤️", "👍", "😂", "🎉", "😮", "😢", "🙏", "🔥"] as const;

/** What a turn can see and change beyond its own chat: notebooks and channels. */
export interface Workspace {
  main: Notebook;
  channels(): ChannelSummary[];
  notebook(channelId: number): Promise<Notebook>;
  createChannel(input: { name: string; about: string; icon?: string }): Promise<Channel>;
  /** Hand a task to a background worker. Throws if it can't start (e.g. too many running). */
  startTask?(id: number, note?: string): void;
  /** Scheduled routines. */
  routines?: {
    list(): { id: number; name: string; schedule: string; enabled: number; post_mode: string; channel_name: string | null }[];
    create(input: RoutineInput): Promise<{ id: number; name: string }>;
    update(id: number, input: Partial<RoutineInput>): Promise<{ id: number; name: string }>;
  };
  /** One-off reminders and follow-ups. `at` is the user's local time, YYYY-MM-DD HH:MM. */
  reminders?: {
    list(): string;
    create(kind: "remind" | "follow_up", text: string, at: string, channelId: number | null): { id: number; when: string };
    cancel(id: number): string;
  };
}

export interface TurnContext {
  db: DB;
  workspace: Workspace;
  /** null for the main chat ("Everything") */
  channel: Channel | null;
  connectors: Connectors;
  provider: ModelProvider;
  userName: string;
  soul?: string;
  timeZone?: string;
  /** The model may search the web with its built-in search. */
  webSearch?: boolean;
}

const MAIN = "main";

function memoryTools(channels: ChannelSummary[], current: Channel | null): ToolDef[] {
  const notebooks = [MAIN, ...channels.map((c) => c.name)];
  const sections = [...new Set([...SECTIONS, ...CHANNEL_SECTIONS])];
  const notebookHelp =
    `"${MAIN}" is your memory of the user in general (sections: ${SECTIONS.join(", ")}).` +
    (channels.length ? ` A channel name is that subject's notebook (sections: ${CHANNEL_SECTIONS.join(", ")}).` : "") +
    (current ? ` You're in the ${current.name} channel.` : "");
  const tools: ToolDef[] = [
    {
      name: "react",
      description:
        "Put an emoji reaction on the user's latest message, the way a friend taps a reaction on a text. " +
        "Use it now and then when it fits: good news, thanks, a joke, something sad, a win. Not on every message. " +
        "When nothing more needs saying (\"thanks!\", \"ok cool\"), the reaction can be your whole reply: send no text.",
      schema: {
        type: "object",
        properties: { emoji: { type: "string", enum: [...REACTIONS] } },
        required: ["emoji"],
      },
    },
    {
      name: "remember",
      description: "Save one lasting fact to a notebook. One short line that makes sense on its own.",
      schema: {
        type: "object",
        properties: {
          notebook: { type: "string", enum: notebooks, description: notebookHelp },
          section: { type: "string", enum: sections, description: "A section of that notebook." },
          text: { type: "string", description: "The fact, as one short line." },
        },
        required: ["notebook", "section", "text"],
      },
    },
    {
      name: "forget",
      description: "Remove one line from a notebook, e.g. a fact that changed or an open loop that closed.",
      schema: {
        type: "object",
        properties: {
          notebook: { type: "string", enum: notebooks, description: notebookHelp },
          section: { type: "string", enum: sections },
          match: { type: "string", description: "Words from the line to remove. Must match exactly one line." },
        },
        required: ["notebook", "section", "match"],
      },
    },
    {
      name: "create_channel",
      description:
        "Make a new channel: a separate chat with its own notebook for one ongoing subject. Only when the user asks for one, or agrees to your suggestion.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short name, one or two words, e.g. 'Home', 'Rowan', 'Kitchen'." },
          about: { type: "string", description: "One line on what the channel is for." },
          icon: { type: "string", enum: [...CHANNEL_ICONS] },
        },
        required: ["name", "about"],
      },
    },
  ];
  const statusNames = STATUSES.map((s) => STATUS_LABEL[s]);
  tools.push(
    {
      name: "create_task",
      description:
        "Add a task: something the user hands off that takes real work, or that they ask you to track. With start, a background worker begins on it now from your brief and reports back in this chat.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short and specific, e.g. 'Find a plumber for the kitchen leak'." },
          details: {
            type: "string",
            description: "The written brief the worker starts from: the goal, what done looks like, limits (budget, dates), and everything relevant you already know.",
          },
          start: { type: "boolean", description: "Start a background worker on it now (default true). False just tracks it as Up next." },
          steps: { type: "array", items: { type: "string" }, description: "Optional checklist, a few short steps." },
          channel: {
            type: "string",
            enum: ["none", ...channels.map((c) => c.name)],
            description: current ? `Defaults to this channel (${current.name}).` : "Defaults to none (the main chat).",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "update_task",
      description: "Change a task: its status, what you need from the user, its steps, or add a note to its log.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The task number, e.g. 12 for #12." },
          status: { type: "string", enum: statusNames, description: "Ready for you = you need the user's input or review; say what in 'needs'." },
          needs: { type: "string", description: "With Ready for you: the one question or decision you need from the user." },
          note: { type: "string", description: "A line for the task's log." },
          add_steps: { type: "array", items: { type: "string" } },
          finish_steps: { type: "array", items: { type: "integer" }, description: "Step numbers (1 = first) that are now done." },
        },
        required: ["id"],
      },
    },
    {
      name: "start_task",
      description:
        "Start or resume the background worker on a task, e.g. after the user answers the worker's question. Pass their answer or new instructions as note.",
      schema: {
        type: "object",
        properties: { id: { type: "integer" }, note: { type: "string", description: "The user's answer or extra instructions for the worker." } },
        required: ["id"],
      },
    },
    {
      name: "list_tasks",
      description: "Look up tasks. With an id, returns that task's details, numbered steps and recent log.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["Open", ...statusNames] },
          search: { type: "string" },
        },
      },
    },
  );
  tools.push(
    {
      name: "set_reminder",
      description: "Remind the user of something at a time: a phone notification then (even with Lyra closed) and a message here.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind them of, as they'd want to read it: 'Call Dad about Sunday'." },
          at: { type: "string", description: "The user's local time, YYYY-MM-DD HH:MM." },
        },
        required: ["text", "at"],
      },
    },
    {
      name: "follow_up",
      description:
        "Schedule yourself to check back on something left open (a reply the user is waiting for, a delivery, a decision). At that time you check with your tools and post a short update here.",
      schema: {
        type: "object",
        properties: {
          about: { type: "string", description: "What to check and what the user wants to know, e.g. 'Has Ortiz Plumbing replied with a quote?'" },
          at: { type: "string", description: "The user's local time, YYYY-MM-DD HH:MM." },
        },
        required: ["about", "at"],
      },
    },
    {
      name: "cancel_reminder",
      description: "Cancel a reminder or follow-up that's no longer needed. The coming ones are listed in your instructions with their #id.",
      schema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    },
    {
      name: "suggest_replies",
      description: "Offer the user up to three next steps as buttons under your reply, written as they'd say them. Tapping one sends it as their message. Write your reply text as usual too.",
      schema: {
        type: "object",
        properties: { options: { type: "array", items: { type: "string", maxLength: 48 }, maxItems: 3 } },
        required: ["options"],
      },
    },
  );
  tools.push(
    {
      name: "create_routine",
      description:
        "Set up a routine: a scheduled check that runs on its own (while Lyra is open or when it next opens) and posts here only when there's news. E.g. a morning brief, a weekly school-mail check, a watch for bills.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short, e.g. 'Friday school check'." },
          instructions: { type: "string", description: "What to check and what counts as worth posting. Written for the assistant that will run it." },
          times: { type: "string", description: "Local times, HH:MM, comma-separated, e.g. '07:00' or '08:00,20:00'." },
          days: { type: "string", description: "Days as digits, 0 = Sunday … 6 = Saturday. '0123456' every day, '12345' weekdays." },
          always_post: { type: "boolean", description: "Post every run (like a daily brief) instead of only when there's news." },
          channel: { type: "string", enum: ["none", ...channels.map((c) => c.name)], description: current ? `Defaults to this channel (${current.name}).` : "Where it posts. Defaults to the main chat." },
        },
        required: ["name", "instructions", "times"],
      },
    },
    {
      name: "update_routine",
      description: "Change, pause or resume a routine. Pass only what changes.",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          enabled: { type: "boolean" },
          times: { type: "string" },
          days: { type: "string" },
          instructions: { type: "string" },
          name: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_routines",
      description: "See the user's routines with their schedules.",
      schema: { type: "object", properties: {} },
    },
  );
  const others = channels.filter((c) => c.id !== current?.id);
  if (others.length)
    tools.push({
      name: "read_channel",
      description: "Read another channel: what it's for, its notebook, and its latest messages.",
      schema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: others.map((c) => c.name) },
          messages: { type: "integer", minimum: 1, maximum: 40, description: "How many recent messages (default 12)." },
        },
        required: ["channel"],
      },
    });
  return tools;
}

/** Recent chat as model messages: text only, alternating roles, starting with the user. */
export function historyFor(messages: StoredMessage[]): Msg[] {
  const out: Msg[] = [];
  for (const m of messages) {
    const text = [m.content.trim(), m.meta.attachments?.length ? attachmentReminder(m.meta.attachments) : ""].filter(Boolean).join("\n\n");
    if (m.meta.error || !text) continue;
    const last = out[out.length - 1];
    if (last?.role === m.role) {
      const t = last.parts[0];
      if (t.type === "text") t.text += `\n\n${text}`;
    } else out.push({ role: m.role, parts: [{ type: "text", text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const who = (ctx: TurnContext) => (ctx.userName === "you" ? "User" : ctx.userName);

/** What the main chat knows about each channel without opening it. */
async function digests(ctx: TurnContext): Promise<ChannelDigest[]> {
  const out: ChannelDigest[] = [];
  for (const c of ctx.workspace.channels()) {
    const recent = listMessages(ctx.db, c.id, 4)
      .filter((m) => !m.meta.error && m.content.trim())
      .map((m) => `${m.role === "user" ? who(ctx) : "Lyra"}: ${clip(m.content.replace(/\s+/g, " "), 160)}`);
    out.push({ name: c.name, about: c.about, notebook: clip((await ctx.workspace.notebook(c.id)).read(), 1200), recent, lastAt: c.last_at });
  }
  return out;
}

/**
 * One turn of a chat (the main one or a channel): save the user's message,
 * let the model answer (calling tools as needed), stream text as it
 * arrives, save the reply.
 */
export async function runTurn(ctx: TurnContext, userText: string, emit: TurnEmitter, signal?: AbortSignal, attachments: Attachment[] = []): Promise<StoredMessage> {
  const channelId = ctx.channel?.id ?? null;
  const attached = checkAttachments(attachments);
  const userMessage = addMessage(ctx.db, "user", userText, attached.length ? { attachments: attached } : {}, channelId);
  let reacted = false;
  const messages = historyFor(listMessages(ctx.db, channelId, HISTORY));
  if (attached.length) {
    // this turn the model gets the files themselves, in place of the "attached earlier" note
    const mine = messages[messages.length - 1];
    const first = mine.parts[0];
    const note = attachmentReminder(attached);
    if (first.type === "text") first.text = first.text.endsWith(note) ? first.text.slice(0, -note.length).trimEnd() : first.text;
    mine.parts.push(...attachmentParts(attachments, attached));
  }
  const notes: MemoryNote[] = [];
  const taskNotes: TaskNote[] = [];
  const toolsUsed: { name: string; ok: boolean }[] = [];
  // Once outside content has been read, notebook changes need the user's tap.
  const state = { tainted: false };
  let reply = "";

  const say = (d: string) => {
    if (!d) return;
    reply += d;
    emit.text(d);
  };

  const sources: Source[] = [];
  let suggestions: string[] = [];
  const meta = () => ({
    memory: notes,
    ...(suggestions.length ? { suggestions } : {}),
    ...(taskNotes.length ? { tasks: taskNotes } : {}),
    ...(sources.length ? { sources: uniqueSources(sources).slice(0, 8) } : {}),
    tools: toolsUsed,
    provider: ctx.provider.id,
    model: ctx.provider.model,
  });

  try {
    const channels = ctx.workspace.channels();
    const tools = [...memoryTools(channels, ctx.channel), ...(await ctx.connectors.tools())];
    const system = buildSystemPrompt({
      userName: ctx.userName,
      soul: ctx.soul,
      memory: ctx.workspace.main.read(),
      connectors: ctx.connectors.status(),
      timeZone: ctx.timeZone,
      channel: ctx.channel ? { ...ctx.channel, notebook: (await ctx.workspace.notebook(ctx.channel.id)).read() } : undefined,
      channels: ctx.channel ? channels.map((c) => ({ name: c.name, about: c.about })) : await digests(ctx),
      tasks: describeTasks(listTasks(ctx.db, { status: "open", channelId: ctx.channel ? ctx.channel.id : undefined, limit: 40 }), !ctx.channel),
      reminders: ctx.workspace.reminders?.list(),
      webSearch: !!ctx.webSearch,
    });

    for (let step = 0; step < MAX_STEPS; step++) {
      let started = false;
      const result = await ctx.provider.generate(
        { system, messages, tools, signal, webSearch: !!ctx.webSearch, onStatus: (l) => emit.status(l) },
        (d) => {
          if (!started && reply.trim()) say("\n\n");
          started = true;
          say(d);
        },
      );
      messages.push({ role: "assistant", parts: result.parts });
      // Web results are other people's words, just like email.
      if (result.searched) state.tainted = true;
      if (result.sources) sources.push(...result.sources);
      const calls = result.parts.filter((p): p is Extract<Part, { type: "tool_call" }> => p.type === "tool_call");
      if (!calls.length) {
        if (result.stop === "pause") continue; // a long search: let the model carry on
        break;
      }

      const results: Part[] = [];
      for (const call of calls) {
        if (call.name === "react") {
          const emoji = String(call.input.emoji ?? "");
          const ok = (REACTIONS as readonly string[]).includes(emoji);
          if (ok) {
            reacted = true;
            userMessage.meta = { ...userMessage.meta, reaction: emoji };
            updateMessageMeta(ctx.db, userMessage.id, userMessage.meta);
            emit.reaction?.(emoji);
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({
            type: "tool_result",
            id: call.id,
            name: call.name,
            content: ok ? "Reacted. Add text only if there's more to say." : `Pick one of: ${REACTIONS.join(" ")}`,
            isError: !ok,
          });
          continue;
        }
        if (call.name === "suggest_replies") {
          // a button the user taps becomes their own message, so outside content can't write one
          const list = Array.isArray(call.input.options) ? call.input.options : [];
          const clean = list.map((o) => String(o).replace(/\s+/g, " ").trim()).filter((o) => o && o.length <= 60).slice(0, 3);
          const ok = !state.tainted && clean.length > 0;
          if (ok) suggestions = clean;
          toolsUsed.push({ name: call.name, ok });
          results.push({
            type: "tool_result",
            id: call.id,
            name: call.name,
            content: ok ? "Shown as buttons under your reply." : state.tainted ? "Not shown: outside content was read this turn." : "Give one to three short options.",
            isError: !ok,
          });
          continue;
        }
        const r = await runTool(ctx, call.name, call.input, state, notes, emit, taskNotes);
        if (ctx.connectors.owns(call.name) && !r.isError) state.tainted = true;
        toolsUsed.push({ name: call.name, ok: !r.isError });
        results.push({ type: "tool_result", id: call.id, name: call.name, content: r.content, isError: r.isError });
      }
      messages.push({ role: "user", parts: results });
      if (step === MAX_STEPS - 1) say(`${reply.trim() ? "\n\n" : ""}I stopped there so this doesn't run on. Want me to keep going?`);
    }
    // A reaction alone is a complete reply, like a tapback on a text.
    if (!reply.trim() && !(reacted && !notes.length && !taskNotes.length)) say(notes.length ? "Got it." : "Done.");
    return addMessage(ctx.db, "assistant", reply.trim(), meta(), channelId);
  } catch (e) {
    const aborted = signal?.aborted;
    const why = aborted ? "Stopped." : `I couldn't finish that. ${friendlyError(e)}`;
    if (!aborted) console.error("[lyra] turn failed:", e);
    say(`${reply.trim() ? "\n\n" : ""}${why}`);
    return addMessage(ctx.db, "assistant", reply.trim(), { ...meta(), error: true }, channelId);
  }
}

async function pickNotebook(ctx: TurnContext, name: unknown): Promise<{ book: Notebook; label: string } | { error: string }> {
  const wanted = String(name ?? MAIN).trim();
  if (!wanted || wanted.toLowerCase() === MAIN) return { book: ctx.workspace.main, label: "Memory" };
  const ch = ctx.workspace.channels().find((c) => c.name.toLowerCase() === wanted.toLowerCase());
  if (!ch) return { error: `There's no notebook called "${wanted}". Use "${MAIN}" or a channel name.` };
  return { book: await ctx.workspace.notebook(ch.id), label: ch.name };
}

async function runTool(
  ctx: TurnContext,
  name: string,
  input: Record<string, unknown>,
  state: { tainted: boolean },
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
          content: "Held for approval: outside content was read this turn, so the user will tap to confirm before it's saved.",
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
    if (state.tainted) return fail("Not created: outside content was read this turn. Ask the user to confirm in their next message.");
    try {
      const c = await ctx.workspace.createChannel({ name: String(input.name ?? ""), about: String(input.about ?? ""), icon: String(input.icon ?? "") });
      emit.status(`Made the ${c.name} channel`);
      return { content: `Created the ${c.name} channel. It's in the menu at the top left.`, isError: false };
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  if (name === "create_task" || name === "update_task" || name === "start_task") {
    // A task may later be carried out by a worker, so outside content can't create or steer one.
    if (state.tainted)
      return fail("Not changed: outside content was read this turn. Tell the user what you'd add or change, and do it once they say yes.");
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
        const t = createTask(ctx.db, { title: String(input.title ?? ""), brief: String(input.details ?? ""), steps, channelId }, "lyra");
        let started = "";
        if (input.start !== false && ctx.workspace.startTask) {
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

  if (name === "set_reminder" || name === "follow_up" || name === "cancel_reminder") {
    const rs = ctx.workspace.reminders;
    if (!rs) return fail("Reminders aren't available.");
    if (name === "cancel_reminder") {
      try {
        return { content: rs.cancel(Number(input.id)), isError: false };
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    if (state.tainted) return fail("Not set: outside content was read this turn. Tell the user what you'd set and when, and set it once they say yes.");
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
              .map((r) => `- #${r.id} ${r.name}: ${r.schedule}${r.enabled ? "" : " (paused)"}, ${r.post_mode === "always" ? "always posts" : "posts only news"}${r.channel_name ? `, in ${r.channel_name}` : ""}`)
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
        const r = await rs.create({
          name: String(input.name ?? ""),
          instructions: String(input.instructions ?? ""),
          times: String(input.times ?? ""),
          days: typeof input.days === "string" ? input.days : "0123456",
          postMode: input.always_post ? "always" : "news",
          channelId,
        });
        emit.status(`Set up ${r.name}`);
        const sched = describeSchedule(String(input.times ?? ""), typeof input.days === "string" ? input.days : "0123456");
        return { content: `Routine #${r.id} "${r.name}" set: ${sched}. It's on the Tasks tab under Scheduled.`, isError: false };
      }
      const patch: Partial<RoutineInput> = {};
      if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
      if (typeof input.times === "string") patch.times = input.times;
      if (typeof input.days === "string") patch.days = input.days;
      if (typeof input.instructions === "string") patch.instructions = input.instructions;
      if (typeof input.name === "string") patch.name = input.name;
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
    const lines = msgs.map((m) => `[${m.created_at.slice(0, 16).replace("T", " ")}] ${m.role === "user" ? who(ctx) : "Lyra"}: ${m.content}`);
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

function friendlyError(e: unknown): string {
  const err = e as { status?: number; message?: string };
  if (err.status === 401 || err.status === 403) return "The API key was refused. Check it in Settings.";
  if (err.status === 404) return "That model name wasn't found. Pick another in Settings.";
  if (err.status === 429) return "The model is rate limited right now. Try again in a minute.";
  if (err.status && err.status >= 500) return "The model service is having trouble. Try again shortly.";
  return err.message ? err.message.slice(0, 200) : "Something went wrong.";
}
