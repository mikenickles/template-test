import type { Connectors } from "./connectors/registry.ts";
import { addMessage, listMessages, type Channel, type ChannelSummary, type DB, type MemoryNote, type StoredMessage } from "./db.ts";
import { CHANNEL_SECTIONS, SECTIONS, type Notebook } from "./memory.ts";
import { buildSystemPrompt, type ChannelDigest } from "./prompt.ts";
import type { ModelProvider, Msg, Part, ToolDef } from "./providers/types.ts";

export const MAX_STEPS = 8;
const HISTORY = 40;

export const CHANNEL_ICONS = ["home", "sprout", "game", "heart", "work", "travel", "tools", "book", "money", "star"] as const;

export interface TurnEmitter {
  text(delta: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
}

/** What a turn can see and change beyond its own chat: notebooks and channels. */
export interface Workspace {
  main: Notebook;
  channels(): ChannelSummary[];
  notebook(channelId: number): Promise<Notebook>;
  createChannel(input: { name: string; about: string; icon?: string }): Promise<Channel>;
}

export interface TurnContext {
  db: DB;
  workspace: Workspace;
  /** null for the main chat ("Everything") */
  channel: Channel | null;
  connectors: Connectors;
  provider: ModelProvider;
  userName: string;
  timeZone?: string;
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
    if (m.meta.error || !m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last?.role === m.role) {
      const t = last.parts[0];
      if (t.type === "text") t.text += `\n\n${m.content}`;
    } else out.push({ role: m.role, parts: [{ type: "text", text: m.content }] });
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
      .filter((m) => !m.meta.error)
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
export async function runTurn(ctx: TurnContext, userText: string, emit: TurnEmitter, signal?: AbortSignal): Promise<StoredMessage> {
  const channelId = ctx.channel?.id ?? null;
  addMessage(ctx.db, "user", userText, {}, channelId);
  const messages = historyFor(listMessages(ctx.db, channelId, HISTORY));
  const notes: MemoryNote[] = [];
  const toolsUsed: { name: string; ok: boolean }[] = [];
  // Once outside content has been read, notebook changes need the user's tap.
  const state = { tainted: false };
  let reply = "";

  const say = (d: string) => {
    if (!d) return;
    reply += d;
    emit.text(d);
  };

  const meta = () => ({ memory: notes, tools: toolsUsed, provider: ctx.provider.id, model: ctx.provider.model });

  try {
    const channels = ctx.workspace.channels();
    const tools = [...memoryTools(channels, ctx.channel), ...(await ctx.connectors.tools())];
    const system = buildSystemPrompt({
      userName: ctx.userName,
      memory: ctx.workspace.main.read(),
      connectors: ctx.connectors.status(),
      timeZone: ctx.timeZone,
      channel: ctx.channel ? { ...ctx.channel, notebook: (await ctx.workspace.notebook(ctx.channel.id)).read() } : undefined,
      channels: ctx.channel ? channels.map((c) => ({ name: c.name, about: c.about })) : await digests(ctx),
    });

    for (let step = 0; step < MAX_STEPS; step++) {
      let started = false;
      const result = await ctx.provider.generate({ system, messages, tools, signal }, (d) => {
        if (!started && reply.trim()) say("\n\n");
        started = true;
        say(d);
      });
      messages.push({ role: "assistant", parts: result.parts });
      const calls = result.parts.filter((p): p is Extract<Part, { type: "tool_call" }> => p.type === "tool_call");
      if (!calls.length) break;

      const results: Part[] = [];
      for (const call of calls) {
        const r = await runTool(ctx, call.name, call.input, state, notes, emit);
        if (ctx.connectors.owns(call.name) && !r.isError) state.tainted = true;
        toolsUsed.push({ name: call.name, ok: !r.isError });
        results.push({ type: "tool_result", id: call.id, name: call.name, content: r.content, isError: r.isError });
      }
      messages.push({ role: "user", parts: results });
      if (step === MAX_STEPS - 1) say(`${reply.trim() ? "\n\n" : ""}I stopped there so this doesn't run on. Want me to keep going?`);
    }
    if (!reply.trim()) say(notes.length ? "Got it." : "Done.");
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

  if (name === "read_channel") {
    const ch = ctx.workspace.channels().find((c) => c.name.toLowerCase() === String(input.channel ?? "").trim().toLowerCase());
    if (!ch) return fail("There's no channel by that name.");
    emit.status(`Checking ${ch.name}`);
    const n = Math.min(Math.max(Number(input.messages) || 12, 1), 40);
    const msgs = listMessages(ctx.db, ch.id, n).filter((m) => !m.meta.error);
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
