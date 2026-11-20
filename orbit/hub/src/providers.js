import Anthropic from '@anthropic-ai/sdk';

/**
 * Built-in model providers. Anything with kind "openai" speaks the
 * OpenAI-compatible /chat/completions API, which covers most other vendors and
 * local runtimes. Extra entries in config.json with a baseUrl are added as
 * custom OpenAI-compatible providers.
 */
const CATALOG = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
  },
  { id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', envKeys: ['OPENAI_API_KEY'] },
  { id: 'xai', label: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1', envKeys: ['XAI_API_KEY'] },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKeys: ['GEMINI_API_KEY'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKeys: ['OPENROUTER_API_KEY'],
  },
  { id: 'ollama', label: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', keyless: true },
  { id: 'demo', label: 'Demo', kind: 'demo', keyless: true, models: ['demo'] },
];

export class ProviderError extends Error {
  name = 'ProviderError';
}

export class Providers {
  /** @param {Record<string, {apiKey?: string, baseUrl?: string, label?: string}>} config */
  constructor(config = {}, env = process.env) {
    this.defs = new Map();
    for (const def of CATALOG) {
      const own = config[def.id] ?? {};
      const apiKey = own.apiKey || def.envKeys?.map((k) => env[k]).find(Boolean) || '';
      this.defs.set(def.id, { ...def, baseUrl: own.baseUrl || def.baseUrl, apiKey, configKey: own.apiKey || '' });
    }
    for (const [id, own] of Object.entries(config)) {
      if (this.defs.has(id) || !own?.baseUrl) continue;
      this.defs.set(id, {
        id,
        label: own.label || id,
        kind: 'openai',
        baseUrl: own.baseUrl,
        apiKey: own.apiKey || '',
        keyless: !own.apiKey,
      });
    }
  }

  /** Public description of each provider. Never includes keys. */
  list() {
    return [...this.defs.values()].map((d) => ({
      id: d.id,
      label: d.label,
      configured: Boolean(d.keyless || d.apiKey),
      models: d.models ?? [],
    }));
  }

  has(id) {
    return this.defs.has(id);
  }

  isConfigured(id) {
    const d = this.defs.get(id);
    return Boolean(d && (d.keyless || d.apiKey));
  }

  #anthropic(def) {
    // With no key in config.json the SDK resolves credentials from the environment.
    return def.configKey ? new Anthropic({ apiKey: def.configKey }) : new Anthropic();
  }

  /** Live model ids for a provider, falling back to the built-in suggestions. */
  async models(id) {
    const def = this.defs.get(id);
    if (!def) throw new ProviderError(`Unknown provider "${id}"`);
    if (def.kind === 'demo' || !this.isConfigured(id)) return def.models ?? [];
    try {
      if (def.kind === 'anthropic') {
        const ids = [];
        for await (const m of this.#anthropic(def).models.list()) ids.push(m.id);
        return ids;
      }
      const res = await fetch(`${def.baseUrl}/models`, {
        headers: def.apiKey ? { authorization: `Bearer ${def.apiKey}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return def.models ?? [];
      const body = await res.json();
      return (body.data ?? []).map((m) => String(m.id).replace(/^models\//, '')).sort();
    } catch {
      return def.models ?? [];
    }
  }

  /**
   * Stream one reply. Calls onDelta with text chunks as they arrive and
   * resolves with the final text (authoritative: it can differ from the
   * concatenated deltas when a fallback model took over mid-stream).
   */
  async stream({ provider, model, system, messages, signal, onDelta, agent }) {
    const def = this.defs.get(provider);
    if (!def) throw new ProviderError(`Unknown provider "${provider}"`);
    if (!this.isConfigured(provider)) {
      throw new ProviderError(`${def.label} needs an API key. Add one to config.json on your PC, then restart the hub.`);
    }
    if (def.kind === 'demo') return streamDemo({ messages, signal, onDelta, agent });
    if (def.kind === 'anthropic') {
      return streamAnthropic({ client: this.#anthropic(def), model, system, messages, signal, onDelta });
    }
    return streamOpenAICompatible({ def, model, system, messages, signal, onDelta });
  }
}

async function streamAnthropic({ client, model, system, messages, signal, onDelta }) {
  try {
    // `fallbacks: "default"` lets the API retry on a substitute model if the
    // requested one declines; models without fallback support just ignore it.
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system,
        messages,
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onDelta(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    // Only text after the last fallback hand-off belongs to the model that answered.
    const lastFallback = final.content.findLastIndex((b) => b.type === 'fallback');
    const text = final.content
      .slice(lastFallback + 1)
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (final.stop_reason === 'refusal' && !text.trim()) {
      throw new ProviderError('The model declined to answer this one.');
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

async function streamOpenAICompatible({ def, model, system, messages, signal, onDelta }) {
  let res;
  try {
    res = await fetch(`${def.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(def.apiKey ? { authorization: `Bearer ${def.apiKey}` } : {}),
      },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages] }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`The hub could not reach ${def.label} at ${def.baseUrl}.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message ?? parsed[0]?.error?.message ?? detail;
    } catch {
      // not JSON; keep the raw snippet
    }
    throw new ProviderError(`${def.label} error ${res.status}: ${detail}`);
  }

  let text = '';
  let buffer = '';
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
      let piece;
      try {
        piece = JSON.parse(data).choices?.[0]?.delta?.content;
      } catch {
        continue;
      }
      if (typeof piece === 'string' && piece) {
        text += piece;
        onDelta(piece);
      }
    }
  }
  return text;
}

/** Canned replies so the app can be tried end to end before any key is added. */
async function streamDemo({ messages, signal, onDelta, agent }) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const topic = last.replace(/^\[[^\]]+\]:\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const who = agent?.role ? `${agent.name}, ${agent.role}` : agent?.name ?? 'a demo agent';
  const reply =
    `Hi, I'm ${who}. This is **demo mode**, so I can't really think about ` +
    `"${topic}" yet. Add an API key to the hub's config.json and switch my model to get real answers.`;
  let text = '';
  for (const word of reply.split(/(?<=\s)/)) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 25));
    text += word;
    onDelta(word);
  }
  return text;
}
