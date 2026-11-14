import { logActivity, notify } from '../agent/activity.ts';
import type { Approval } from '../agent/approvals.ts';
import { createApproval, decide, settle, waitFor } from '../agent/approvals.ts';
import { addMessage } from '../agent/thread.ts';
import { emit } from '../events.ts';
import type { SearchResult, ToolCall, ToolResult } from '../providers/types.ts';
import { getSettings } from '../settings.ts';
import { getTool } from './index.ts';
import type { Tool } from './types.ts';

const MAX_OUTPUT = 60_000;
const APPROVAL_WAIT_MS = 10 * 60_000;

let fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Tests and demo mode swap in a fake network. */
export function setFetch(impl: typeof fetch): void {
  fetchImpl = impl;
}

export interface ExecContext {
  thread: string;
  turnId: string;
  /** Someone is in the conversation and can answer an approval card now. */
  interactive: boolean;
  signal: AbortSignal;
  /** Set once anything written by other people has entered this turn. */
  taint: { on: boolean };
  search: (query: string) => Promise<SearchResult>;
}

/** The single rule for when the owner must say yes first. */
export function needsApproval(tool: Tool, input: unknown, tainted: boolean): boolean {
  if (tool.risk === 'confirm' || tool.risk === 'money') return true;
  if (tool.risk !== 'act') return false;
  return !!tool.escalate?.(input) || (!!tool.guarded && tainted);
}

const WAITING =
  'This is waiting for the user to approve it. It has NOT happened yet. If they approve later it will run on its own, ' +
  'so do not request it again. Tell them it is waiting for their OK.';
const DECLINED = 'The user declined this. It did not happen. Do not try again; ask what they would like instead.';

async function invoke(tool: Tool, input: unknown, signal: AbortSignal, search: ExecContext['search']) {
  try {
    const value = await tool.run(input, { fetch: fetchImpl, signal, search });
    let output = typeof value === 'string' ? value : JSON.stringify(value ?? { ok: true });
    if (output.length > MAX_OUTPUT) output = output.slice(0, MAX_OUTPUT) + '\n…(cut short)';
    if (tool.untrusted) {
      // The wrapper tag cannot be closed from inside the content.
      output = `<untrusted_content source="${tool.name}">\n${output.replaceAll('untrusted_content', 'untrusted-content')}\n</untrusted_content>`;
    }
    return { output, isError: false };
  } catch (err) {
    if (signal.aborted) return { output: 'Stopped by the user.', isError: true };
    return { output: `That did not work: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export async function executeCall(call: ToolCall, ctx: ExecContext): Promise<ToolResult> {
  const reply = (output: string, isError = false): ToolResult => ({ id: call.id, name: call.name, output, isError });

  const tool = getTool(call.name);
  if (!tool) return reply(`There is no tool called "${call.name}".`, true);
  if (getSettings().paused) return reply('Arlo is paused by the owner, so no tools can run right now.', true);

  const parsed = tool.schema.safeParse(call.input);
  if (!parsed.success) {
    // Covers input that was cut off or mangled in transit as well as plain mistakes.
    return reply(
      JSON.stringify({
        INVALID_JSON: JSON.stringify(call.input ?? null),
        problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`),
      }),
      true,
    );
  }
  const input = parsed.data;
  const label = tool.label(input);
  emit({ type: 'status', turnId: ctx.turnId, text: label });

  const refusal = tool.check?.(input);
  if (refusal) {
    logActivity(tool.name, label, 'failed');
    return reply(refusal, true);
  }

  let approval: Approval | null = null;
  if (needsApproval(tool, input, ctx.taint.on)) {
    approval = createApproval(ctx.thread, tool, input, ctx.interactive);
    notify(`${getSettings().agentName} needs your OK`, approval.card.title);
    if (!ctx.interactive) {
      logActivity(tool.name, approval.card.title, 'waiting');
      return reply(WAITING);
    }
    emit({ type: 'status', turnId: ctx.turnId, text: 'Waiting for your OK' });
    const decision = await waitFor(approval.id, APPROVAL_WAIT_MS, ctx.signal);
    if (decision === 'timeout') {
      if (ctx.signal.aborted) {
        await decide(approval.id, 'decline', async () => {});
        return reply('Stopped by the user.', true);
      }
      logActivity(tool.name, approval.card.title, 'waiting');
      return reply(WAITING);
    }
    if (decision === 'declined') {
      logActivity(tool.name, approval.card.title, 'declined');
      return reply(DECLINED);
    }
    emit({ type: 'status', turnId: ctx.turnId, text: label });
  }

  const result = await invoke(tool, input, ctx.signal, ctx.search);
  if (tool.untrusted && !result.isError) ctx.taint.on = true;
  if (approval) settle(approval.id, result.isError ? 'failed' : 'done', result.isError ? result.output : approval.card.done);
  logActivity(tool.name, approval?.card.done ?? label, result.isError ? 'failed' : 'done');
  return reply(result.output, result.isError);
}

/**
 * Run an action the owner approved after its turn had already ended (they were
 * away, or it came from a routine). The outcome is noted in the conversation.
 */
export async function runApproved(approval: Approval): Promise<void> {
  const tool = getTool(approval.tool);
  const fail = (why: string) => {
    settle(approval.id, 'failed', why);
    logActivity(approval.tool, approval.card.title, 'failed');
    addMessage('main', 'note', { text: `${approval.card.title} That did not go through: ${why}` });
  };
  if (!tool) return fail('that action is no longer available.');
  if (getSettings().paused) return fail('Arlo is paused.');
  const refusal = tool.check?.(approval.input);
  if (refusal) return fail(refusal);

  const noSearch = async (): Promise<SearchResult> => ({ text: '', sources: [] });
  const result = await invoke(tool, approval.input, new AbortController().signal, noSearch);
  if (result.isError) return fail(result.output);
  settle(approval.id, 'done', approval.card.done);
  logActivity(approval.tool, approval.card.done, 'done');
  addMessage('main', 'note', { text: `${approval.card.done}.` });
}
