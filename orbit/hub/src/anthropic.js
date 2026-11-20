import Anthropic from '@anthropic-ai/sdk';
import { ProviderError } from './errors.js';
import { FOLDER_ACTIVITY, FOLDER_TOOLS, runFolderTool } from './folders.js';
import { MEMORY_ACTIVITY, MEMORY_TOOLS } from './memory.js';
import { CREW_TOOL } from './intro.js';

/** Tools the hub runs itself, and what each looks like in the chat. */
const CLIENT_ACTIVITY = { ...FOLDER_ACTIVITY, ...MEMORY_ACTIVITY };

const MAX_TOKENS = 64000;
/** Round trips through the hub's own tools (shared folders) in one reply. */
const MAX_STEPS = 16;
/** Times one reply may resume after the API pauses a long run of web searches or code. */
const MAX_CONTINUATIONS = 5;
const MAX_ACTIVITY = 24;
const MAX_SOURCES = 8;

/** Models whose web tools can filter results with code before reading them. */
const DYNAMIC_WEB = /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-[678]|sonnet-4-6)/;
/** Models without server-side fallback. */
const NO_FALLBACK = /^claude-haiku/;

/**
 * The tools an agent's abilities turn on. Web search and code run on Anthropic's side; folder tools run
 * here on the hub. With both web and code on, the basic web tools are used so the model has one code
 * sandbox rather than two.
 */
export function anthropicTools(model, { web = false, code = false, folders = null, memory = null, crew = null } = {}) {
  const tools = [];
  if (web) {
    const dynamic = DYNAMIC_WEB.test(model) && !code;
    tools.push(
      dynamic ? { type: 'web_search_20260209', name: 'web_search' } : { type: 'web_search_20250305', name: 'web_search' },
      dynamic ? { type: 'web_fetch_20260209', name: 'web_fetch' } : { type: 'web_fetch_20250910', name: 'web_fetch' },
    );
  }
  if (code) tools.push({ type: 'code_execution_20260521', name: 'code_execution' });
  if (folders?.list().length) tools.push(...FOLDER_TOOLS);
  if (memory) tools.push(...MEMORY_TOOLS);
  if (crew) tools.push(CREW_TOOL);
  return tools;
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const short = (value, max = 160) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** What a server tool call looks like in the chat, or null to leave it out. */
function serverActivity(block, abilities) {
  switch (block.name) {
    case 'web_search':
      return { kind: 'search', detail: short(block.input?.query) };
    case 'web_fetch':
      return { kind: 'page', detail: short(block.input?.url, 500) };
    case 'code_execution':
    case 'bash_code_execution':
    case 'text_editor_code_execution':
      // Web tools also run code to filter results; only show it when the agent can run code itself.
      return abilities.code ? { kind: 'code', detail: '' } : null;
    default:
      return null;
  }
}

/** A response's usage in the hub's terms. Searches are counted, not priced. */
export function usageOf(usage = {}) {
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    searches: (usage.server_tool_use?.web_search_requests ?? 0) + (usage.server_tool_use?.web_fetch_requests ?? 0),
    requests: 1,
    estimated: false,
  };
}

/**
 * The parts of a response that can be sent back in the next request. After a mid-output fallback, the
 * declined model's thinking, client tool calls, and unanswered server tool calls before the last
 * fallback block are left out; the fallback block itself stays where it was.
 */
export function echoable(content) {
  const boundary = content.findLastIndex((b) => b.type === 'fallback');
  if (boundary < 0) return content;
  const answered = new Set(content.filter((b) => b.type.endsWith('_tool_result')).map((b) => b.tool_use_id));
  return content.filter((b, i) => {
    if (i >= boundary || b.type === 'text' || b.type.endsWith('_tool_result')) return true;
    return b.type === 'server_tool_use' && answered.has(b.id);
  });
}

/**
 * Streams one agent reply from Claude, running tools as it asks for them, until it has answered.
 *
 * onDelta gets text as it arrives. onActivity gets the reply's tool use so far ("searched", "read a
 * page", "ran code", "read a file"), each entry marked done once its result is back. onSources gets the
 * web pages the reply cites. onReset replaces the text shown so far, when a step has to be run again.
 * Resolves with the reply's full text.
 */
export async function streamAnthropic({
  client,
  model,
  system,
  messages,
  signal,
  abilities = {},
  onDelta,
  onActivity = () => {},
  onSources = () => {},
  onReset = () => {},
  onUsage = () => {},
}) {
  const tools = anthropicTools(model, abilities);
  const conversation = [...messages];
  const activity = [];
  const byCall = new Map(); // tool call id -> its activity entry
  const sources = new Map(); // url -> { title, url }
  let text = '';
  let steps = 0;
  let continuations = 0;
  let retries = 0;

  const reportActivity = () => onActivity(activity.map((a) => ({ ...a })));
  const note = (callId, entry) => {
    // Repeated code runs share one entry; everything else gets its own, up to a limit.
    const existing = entry.kind === 'code' ? activity.find((a) => a.kind === 'code') : null;
    if (existing) {
      existing.done = false;
      byCall.set(callId, existing);
    } else if (activity.length < MAX_ACTIVITY) {
      const fresh = { ...entry, done: false, failed: false };
      activity.push(fresh);
      byCall.set(callId, fresh);
    }
    reportActivity();
  };
  const finish = (callId, failed) => {
    const entry = byCall.get(callId);
    if (!entry) return;
    entry.done = true;
    entry.failed = Boolean(failed);
    reportActivity();
  };
  const track = (block) => {
    if (!block) return;
    if (block.type === 'server_tool_use') {
      const entry = serverActivity(block, abilities);
      if (entry) note(block.id, entry);
    } else if (block.type === 'tool_use' && CLIENT_ACTIVITY[block.name]) {
      const input = block.input ?? {};
      const detail = block.name === 'search_files' ? input.query : MEMORY_ACTIVITY[block.name] ? input.note : input.path;
      note(block.id, { kind: CLIENT_ACTIVITY[block.name], detail: short(detail, 300) });
    } else if (block.type.endsWith('_tool_result')) {
      finish(block.tool_use_id, String(block.content?.type ?? '').endsWith('_error'));
    } else if (block.type === 'text' && block.citations?.length) {
      const before = sources.size;
      for (const c of block.citations) {
        if (c.type !== 'web_search_result_location' || !c.url || sources.has(c.url) || sources.size >= MAX_SOURCES) continue;
        sources.set(c.url, { title: short(c.title) || hostOf(c.url), url: c.url });
      }
      if (sources.size !== before) onSources([...sources.values()]);
    }
  };
  /** Consecutive assistant content (a paused turn and its continuation) stays one message. */
  const pushAssistant = (content) => {
    const last = conversation.at(-1);
    if (last?.role === 'assistant' && Array.isArray(last.content)) last.content = [...last.content, ...content];
    else conversation.push({ role: 'assistant', content });
  };

  try {
    for (;;) {
      const textBefore = text;
      // A new paragraph wherever text resumes after a tool, so "Let me check." and the answer don't run together.
      let previous = steps + continuations > 0 ? 'tool' : null;
      const fallback = !NO_FALLBACK.test(model);
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: conversation,
          ...(tools.length ? { tools } : {}),
          cache_control: { type: 'ephemeral' },
          // `fallbacks: "default"` lets the API finish on a substitute model if the requested one declines.
          ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
        },
        { signal },
      );
      stream.on('streamEvent', (event, snapshot) => {
        if (event.type === 'content_block_start') {
          const type = event.content_block.type;
          // A fallback model carries on from the declined model's text, so no break after a fallback block.
          if (type === 'text' && previous && previous !== 'text' && previous !== 'fallback' && text && !text.endsWith('\n')) {
            text += '\n\n';
            onDelta('\n\n');
          }
          previous = type;
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          onDelta(event.delta.text);
        } else if (event.type === 'content_block_stop') {
          track(snapshot.content[event.index]);
        }
      });

      let final;
      try {
        final = await stream.finalMessage();
        retries = 0;
      } catch (err) {
        // A tool input the SDK couldn't parse at all: run the step again. API errors are real failures.
        if (err instanceof Anthropic.APIError || signal?.aborted || retries++ >= 2) throw err;
        text = textBefore;
        onReset(text);
        continue;
      }

      onUsage(usageOf(final.usage));
      const stop = final.stop_reason;
      if (stop === 'refusal') {
        // A refusal can cut a tool call off mid-input, so this step's tools never run.
        if (!text.trim()) throw new ProviderError('The model declined to answer this one.');
        break;
      }
      if (stop === 'pause_turn') {
        // The API paused a long run of server tools; sending the turn back resumes it.
        if (++continuations > MAX_CONTINUATIONS) break;
        pushAssistant(echoable(final.content));
        continue;
      }
      const boundary = final.content.findLastIndex((b) => b.type === 'fallback');
      const calls = final.content.slice(boundary + 1).filter((b) => b.type === 'tool_use');
      // end_turn, or max_tokens (a tool call cut off there never runs), or anything else that ends the reply.
      if (stop !== 'tool_use' || !calls.length) break;
      if (++steps > MAX_STEPS) {
        if (!text.trim()) throw new ProviderError('The agent kept looking through files without answering. Try a more specific ask.');
        break;
      }
      pushAssistant(echoable(final.content));
      const results = [];
      for (const call of calls) {
        let result = { text: `There is no tool called "${call.name}".`, isError: true };
        if (abilities.folders && FOLDER_ACTIVITY[call.name]) result = await runFolderTool(abilities.folders, call.name, call.input);
        else if (abilities.memory && MEMORY_ACTIVITY[call.name]) result = await abilities.memory.run(call.name, call.input);
        else if (abilities.crew && call.name === CREW_TOOL.name) result = await abilities.crew.run(call.input);
        finish(call.id, result.isError);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: result.text, ...(result.isError ? { is_error: true } : {}) });
      }
      // Every result for the step goes back in one message.
      conversation.push({ role: 'user', content: results });
    }
    if (activity.some((a) => !a.done)) {
      for (const a of activity) a.done = true;
      reportActivity();
    }
    return text;
  } catch (err) {
    if (err instanceof ProviderError || err instanceof Anthropic.APIUserAbortError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ProviderError('Anthropic rejected the API key configured on the hub.');
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new ProviderError(`Anthropic doesn't recognize the model "${model}".`);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ProviderError('Anthropic rate limit reached. Try again in a moment.');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ProviderError('The hub could not reach Anthropic. Check the PC’s internet connection.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new ProviderError(`Anthropic error${err.status ? ` ${err.status}` : ''}: ${err.message}`);
    }
    throw err;
  }
}
