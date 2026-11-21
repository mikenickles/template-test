import { ProviderError } from './errors.js';
import { CLIENT_ACTIVITY, clientDetail, clientTools, runClientTool } from './tools.js';

/**
 * Replies from models behind an OpenAI-compatible /chat/completions API: Ollama on the PC, OpenAI, xAI,
 * Gemini, OpenRouter. With abilities, the model gets the hub's own tools as functions (web search and page
 * reading, memory, folders, Google, follow-ups, the Treehouse guide...), and this loop runs them until it
 * has answered. A model that can't take tools answers without them, with `plainSystem`.
 */

const MAX_STEPS = 10;
const MAX_ACTIVITY = 24;
const MAX_SOURCES = 8;

/** Providers known to accept a request for token counts at the end of a stream. */
const REPORTS_USAGE = new Set(['openai', 'openrouter', 'xai']);

/** What servers say when a model doesn't take tools. */
const NO_TOOLS = /does not support tools|tools? (are|is) not supported|not support(ed)? (for )?(tool|function)|function calling is not (enabled|supported)|tool use is not supported/i;

/**
 * What OpenAI says when a reasoning model won't take tools on /chat/completions while it reasons: "Function
 * tools with reasoning_effort are not supported for … set reasoning_effort to 'none'".
 */
const NO_REASONING_WITH_TOOLS = /reasoning_effort/i;

/** Models found not to take tools, as "provider:model", so they aren't asked again. */
export const withoutTools = new Set();

/** Models that take tools only with reasoning off, as "provider:model". */
export const toolsWithoutReasoning = new Set();

// For estimates only: an image counts as about 1,500 tokens.
const textLength = (content) => (content == null ? 0 : typeof content === 'string' ? content.length : content.reduce((n, p) => n + (p.text?.length ?? 6000), 0));
const short = (value, max = 160) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const asFunction = (tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } });

/** One streamed request. Resolves with the text, any tool calls, and the usage the server reported. */
async function request(def, body, signal, onDelta) {
  let res;
  try {
    res = await fetch(`${def.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(def.apiKey ? { authorization: `Bearer ${def.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`The hub could not reach ${def.label} at ${def.baseUrl}.`);
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let detail = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw);
      detail = parsed.error?.message ?? parsed[0]?.error?.message ?? (typeof parsed.error === 'string' ? parsed.error : detail);
    } catch {
      // not JSON; keep the raw snippet
    }
    const error = new ProviderError(`${def.label} error ${res.status}: ${detail}`);
    error.noTools = Boolean(body.tools) && NO_TOOLS.test(detail);
    error.noReasoningWithTools = Boolean(body.tools) && !body.reasoning_effort && res.status === 400 && NO_REASONING_WITH_TOOLS.test(detail) && /tool/i.test(detail);
    throw error;
  }

  let text = '';
  let buffer = '';
  let usage = null;
  const calls = []; // by index: { id, name, arguments }
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.usage) usage = parsed.usage;
      const delta = parsed.choices?.[0]?.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }
      // Tool calls arrive in pieces (arguments split across chunks) or whole, depending on the server.
      for (const [position, part] of (delta.tool_calls ?? []).entries()) {
        const index = Number.isInteger(part.index) ? part.index : position;
        const call = (calls[index] ??= { id: '', name: '', arguments: '' });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.name += part.function.name;
        if (part.function?.arguments) call.arguments += typeof part.function.arguments === 'string' ? part.function.arguments : JSON.stringify(part.function.arguments);
      }
    }
  }
  return { text, calls: calls.filter((c) => c?.name).map((c, i) => ({ ...c, id: c.id || `call_${i}_${Date.now()}` })), usage };
}

export async function streamOpenAI({
  def,
  model,
  system,
  plainSystem = system,
  messages,
  signal,
  abilities = null,
  onDelta,
  onActivity = () => {},
  onSources = () => {},
  onUsage = () => {},
}) {
  const key = `${def.id}:${model}`;
  const tools = abilities && !withoutTools.has(key) ? clientTools(abilities) : [];
  let useTools = tools.length > 0;
  const conversation = [{ role: 'system', content: useTools ? system : plainSystem }, ...messages];
  const activity = [];
  const sources = new Map();
  let text = '';
  let steps = 0;

  const report = () => onActivity(activity.map((a) => ({ ...a })));
  const usageOf = (reported, sent, out) => {
    const cached = reported?.prompt_tokens_details?.cached_tokens ?? 0;
    return reported
      ? { input: (reported.prompt_tokens ?? 0) - cached, output: reported.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0, searches: 0, requests: 1, estimated: false }
      : { input: Math.ceil(sent / 4), output: Math.ceil(out / 4), cacheRead: 0, cacheWrite: 0, searches: 0, requests: 1, estimated: true };
  };

  for (;;) {
    const body = { model, stream: true, messages: conversation };
    if (REPORTS_USAGE.has(def.id)) body.stream_options = { include_usage: true };
    if (useTools) body.tools = tools.map(asFunction);
    if (useTools && toolsWithoutReasoning.has(key)) body.reasoning_effort = 'none';
    // A new paragraph wherever text resumes after a tool, so "Let me check." and the answer don't run together.
    let started = false;
    const emit = (piece) => {
      if (!started && steps > 0 && text && !text.endsWith('\n')) {
        text += '\n\n';
        onDelta('\n\n');
      }
      started = true;
      text += piece;
      onDelta(piece);
    };
    let step;
    try {
      step = await request(def, body, signal, emit);
    } catch (err) {
      if (err.noReasoningWithTools) {
        // A reasoning model that takes tools here only with reasoning off: keep the tools, and remember.
        toolsWithoutReasoning.add(key);
        continue;
      }
      // Tools didn't work even with reasoning off, or the model doesn't take them: answer without them.
      const failedWithoutReasoning = useTools && body.reasoning_effort === 'none' && err instanceof ProviderError && /400/.test(err.message);
      if (!err.noTools && !failedWithoutReasoning) throw err;
      withoutTools.add(key);
      toolsWithoutReasoning.delete(key);
      useTools = false;
      conversation[0] = { role: 'system', content: plainSystem };
      continue;
    }
    const sent = conversation.reduce((n, m) => n + textLength(m.content), 0);
    onUsage(usageOf(step.usage, sent, step.text.length + step.calls.reduce((n, c) => n + c.arguments.length, 0)));
    if (!useTools || !step.calls.length) break;
    if (++steps > MAX_STEPS) {
      if (!text.trim()) throw new ProviderError('The agent kept using its tools without answering. Try a more specific ask.');
      break;
    }
    conversation.push({
      role: 'assistant',
      content: step.text || null,
      tool_calls: step.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
    });
    for (const call of step.calls) {
      let input = {};
      try {
        input = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        conversation.push({ role: 'tool', tool_call_id: call.id, content: 'The arguments were not valid JSON. Try again.' });
        continue;
      }
      const entry = CLIENT_ACTIVITY[call.name] && activity.length < MAX_ACTIVITY ? { kind: CLIENT_ACTIVITY[call.name], detail: short(clientDetail(call.name, input), 300), done: false, failed: false } : null;
      if (entry) {
        activity.push(entry);
        report();
      }
      const result = await runClientTool(abilities, call.name, input);
      if (entry) {
        entry.done = true;
        entry.failed = Boolean(result.isError);
        report();
      }
      if (result.sources?.length) {
        const before = sources.size;
        for (const s of result.sources) if (!sources.has(s.url) && sources.size < MAX_SOURCES) sources.set(s.url, s);
        if (sources.size !== before) onSources([...sources.values()]);
      }
      conversation.push({ role: 'tool', tool_call_id: call.id, content: result.text });
    }
  }
  return text;
}
