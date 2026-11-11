import type { Connectors } from "./connectors/registry.ts";
import { addMessage, listMessages, type DB, type MemoryNote, type StoredMessage } from "./db.ts";
import { isSection, SECTIONS, type MemoryStore } from "./memory.ts";
import { buildSystemPrompt } from "./prompt.ts";
import type { ModelProvider, Msg, Part, ToolDef } from "./providers/types.ts";

export const MAX_STEPS = 8;
const HISTORY = 40;

export interface TurnEmitter {
  text(delta: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
}

export interface TurnContext {
  db: DB;
  memory: MemoryStore;
  connectors: Connectors;
  provider: ModelProvider;
  userName: string;
  timeZone?: string;
}

const MEMORY_TOOLS: ToolDef[] = [
  {
    name: "remember",
    description: "Save one lasting fact to your notes about the user. One short line that makes sense on its own.",
    schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: [...SECTIONS], description: "Where the fact belongs." },
        text: { type: "string", description: "The fact, as one short line." },
      },
      required: ["section", "text"],
    },
  },
  {
    name: "forget",
    description: "Remove one line from your notes, e.g. a fact that changed or an open loop that closed.",
    schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: [...SECTIONS] },
        match: { type: "string", description: "Words from the line to remove. Must match exactly one line." },
      },
      required: ["section", "match"],
    },
  },
];

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

/**
 * One turn of the main chat: save the user's message, let the model answer
 * (calling tools as needed), stream text as it arrives, save the reply.
 */
export async function runTurn(
  ctx: TurnContext,
  userText: string,
  emit: TurnEmitter,
  signal?: AbortSignal,
): Promise<StoredMessage> {
  addMessage(ctx.db, "user", userText);
  const messages = historyFor(listMessages(ctx.db, HISTORY));
  const notes: MemoryNote[] = [];
  const toolsUsed: { name: string; ok: boolean }[] = [];
  // Once outside content has been read, memory changes need the user's tap.
  let tainted = false;
  let reply = "";

  const say = (d: string) => {
    if (!d) return;
    reply += d;
    emit.text(d);
  };

  const meta = () => ({ memory: notes, tools: toolsUsed, provider: ctx.provider.id, model: ctx.provider.model });

  try {
    const tools = [...MEMORY_TOOLS, ...(await ctx.connectors.tools())];
    const system = buildSystemPrompt({
      userName: ctx.userName,
      memory: ctx.memory.read(),
      connectors: ctx.connectors.status(),
      timeZone: ctx.timeZone,
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
        const r = await runTool(ctx, call.name, call.input, tainted, notes, emit);
        if (ctx.connectors.owns(call.name) && !r.isError) tainted = true;
        toolsUsed.push({ name: call.name, ok: !r.isError });
        results.push({ type: "tool_result", id: call.id, name: call.name, content: r.content, isError: r.isError });
      }
      messages.push({ role: "user", parts: results });
      if (step === MAX_STEPS - 1) say(`${reply.trim() ? "\n\n" : ""}I stopped there so this doesn't run on. Want me to keep going?`);
    }
    if (!reply.trim()) say(notes.length ? "Got it." : "Done.");
    return addMessage(ctx.db, "assistant", reply.trim(), meta());
  } catch (e) {
    const aborted = signal?.aborted;
    const why = aborted ? "Stopped." : `I couldn't finish that. ${friendlyError(e)}`;
    if (!aborted) console.error("[lyra] turn failed:", e);
    say(`${reply.trim() ? "\n\n" : ""}${why}`);
    return addMessage(ctx.db, "assistant", reply.trim(), { ...meta(), error: true });
  }
}

async function runTool(
  ctx: TurnContext,
  name: string,
  input: Record<string, unknown>,
  tainted: boolean,
  notes: MemoryNote[],
  emit: TurnEmitter,
): Promise<{ content: string; isError: boolean }> {
  const note = (n: MemoryNote) => {
    notes.push(n);
    emit.memory(n);
  };

  if (name === "remember" || name === "forget") {
    const section = String(input.section ?? "");
    if (!isSection(section)) return { content: `Section must be one of: ${SECTIONS.join(", ")}.`, isError: true };

    if (name === "remember") {
      const text = String(input.text ?? "");
      if (tainted) {
        const suggestionId = ctx.memory.addSuggestion(section, text);
        note({ kind: "suggested", section, text, suggestionId });
        return {
          content: "Held for approval: outside content was read this turn, so the user will tap to confirm before it's saved.",
          isError: false,
        };
      }
      try {
        const r = ctx.memory.remember(section, text);
        if (r.snapshotId) note({ kind: "saved", section, text: r.text, snapshotId: r.snapshotId });
        return { content: r.snapshotId ? "Saved." : "Already in memory.", isError: false };
      } catch (e) {
        return { content: (e as Error).message, isError: true };
      }
    }

    if (tainted)
      return {
        content: "Not removed: outside content was read this turn. Ask the user to confirm in their next message.",
        isError: true,
      };
    const r = ctx.memory.forget(section, String(input.match ?? ""));
    if ("error" in r) return { content: r.error, isError: true };
    note({ kind: "removed", section, text: r.text, snapshotId: r.snapshotId });
    return { content: `Removed: ${r.text}`, isError: false };
  }

  if (ctx.connectors.owns(name)) {
    emit.status(ctx.connectors.label(name));
    return ctx.connectors.call(name, input);
  }
  return { content: `Unknown tool ${name}.`, isError: true };
}

function friendlyError(e: unknown): string {
  const err = e as { status?: number; message?: string };
  if (err.status === 401 || err.status === 403) return "The API key was refused. Check it in .env.";
  if (err.status === 404) return "That model name wasn't found. Pick another in Settings.";
  if (err.status === 429) return "The model is rate limited right now. Try again in a minute.";
  if (err.status && err.status >= 500) return "The model service is having trouble. Try again shortly.";
  return err.message ? err.message.slice(0, 200) : "Something went wrong.";
}
