import Anthropic from '@anthropic-ai/sdk';
import { streamAnthropic } from './anthropic.js';
import { ProviderError } from './errors.js';

export { ProviderError };

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
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKeys: ['OPENAI_API_KEY'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  { id: 'xai', label: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1', envKeys: ['XAI_API_KEY'], keyUrl: 'https://console.x.ai' },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKeys: ['GEMINI_API_KEY'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKeys: ['OPENROUTER_API_KEY'],
    keyUrl: 'https://openrouter.ai/keys',
  },
  { id: 'ollama', label: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', keyless: true },
  { id: 'demo', label: 'Demo', kind: 'demo', keyless: true, models: ['demo'] },
];

/** What checking a key found. `unreachable` means the provider couldn't be asked, not that the key is bad. */
export class KeyCheck {
  constructor(ok, message = '', unreachable = false) {
    this.ok = ok;
    this.message = message;
    this.unreachable = unreachable;
  }
}

export class Providers {
  /**
   * @param {Record<string, {apiKey?: string, baseUrl?: string, label?: string}>} config  The `providers`
   *   section of config.json. Keys set from the app are written back into it.
   * @param {(config: object) => void} onChange  Called after a key changes, to persist the config.
   */
  constructor(config = {}, env = process.env, onChange = () => {}) {
    this.config = config;
    this.env = env;
    this.onChange = onChange;
    this.defs = new Map();
    for (const def of CATALOG) {
      const own = config[def.id] ?? {};
      this.defs.set(def.id, { ...def, baseUrl: own.baseUrl || def.baseUrl, configKey: own.apiKey || '' });
      this.#resolveKey(def.id);
    }
    for (const [id, own] of Object.entries(config)) {
      if (this.defs.has(id) || !own?.baseUrl) continue;
      this.defs.set(id, {
        id,
        label: own.label || id,
        kind: 'openai',
        baseUrl: own.baseUrl,
        apiKey: own.apiKey || '',
        configKey: own.apiKey || '',
        keyless: !own.apiKey,
      });
    }
  }

  /** A key saved in config.json wins; otherwise one from the environment. */
  #resolveKey(id) {
    const d = this.defs.get(id);
    d.apiKey = d.configKey || d.envKeys?.map((k) => this.env[k]).find(Boolean) || '';
  }

  /** Public description of each provider. Never includes keys, only where a key came from. */
  list() {
    return [...this.defs.values()].map((d) => ({
      id: d.id,
      label: d.label,
      configured: Boolean(d.keyless || d.apiKey),
      models: d.models ?? [],
      // Whether a key can be added from the app, where to get one, and where the current one came from.
      takesKey: !d.keyless && d.kind !== 'demo',
      keyUrl: d.keyUrl ?? null,
      keySource: d.configKey ? 'app' : d.apiKey ? 'environment' : null,
      keyHint: d.configKey ? `…${d.configKey.slice(-4)}` : null,
      // Web search, code and shared folders: only Claude models get these for now.
      abilities: d.kind === 'anthropic',
    }));
  }

  takesKey(id) {
    const d = this.defs.get(id);
    return Boolean(d && !d.keyless && d.kind !== 'demo');
  }

  /** Asks the provider whether [apiKey] works, without saving it. */
  async checkKey(id, apiKey) {
    const def = this.defs.get(id);
    if (!def) return new KeyCheck(false, `Unknown provider "${id}".`);
    try {
      if (def.kind === 'anthropic') {
        await new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
        return new KeyCheck(true);
      }
      const res = await fetch(`${def.baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return new KeyCheck(true);
      if (res.status === 401 || res.status === 403) return new KeyCheck(false, `${def.label} didn't accept that key.`);
      return new KeyCheck(false, `${def.label} answered with an error (${res.status}). Try again in a moment.`, true);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return new KeyCheck(false, `${def.label} didn't accept that key.`);
      }
      if (err instanceof Anthropic.APIError && err.status) {
        return new KeyCheck(false, `${def.label} answered with an error (${err.status}). Try again in a moment.`, true);
      }
      return new KeyCheck(false, `Your PC couldn't reach ${def.label} to check the key. Check its internet connection.`, true);
    }
  }

  /** Saves a key for a provider and starts using it immediately. */
  setKey(id, apiKey) {
    const d = this.defs.get(id);
    d.configKey = apiKey;
    this.config[id] = { ...(this.config[id] ?? {}), apiKey };
    this.#resolveKey(id);
    this.onChange(this.config);
  }

  /** Forgets a key saved from the app. A key from the environment, if any, takes over again. */
  removeKey(id) {
    const d = this.defs.get(id);
    d.configKey = '';
    if (this.config[id]) this.config[id] = { ...this.config[id], apiKey: '' };
    this.#resolveKey(id);
    this.onChange(this.config);
  }

  has(id) {
    return this.defs.has(id);
  }

  /** Whether agents on this provider can use abilities (web search, code, shared folders). */
  supportsAbilities(id) {
    return this.defs.get(id)?.kind === 'anthropic';
  }

  isConfigured(id) {
    const d = this.defs.get(id);
    return Boolean(d && (d.keyless || d.apiKey));
  }

  #anthropic(def) {
    // With no key in config.json the SDK resolves credentials from the environment.
    const baseURL = def.baseUrl ? { baseURL: def.baseUrl } : {};
    return def.configKey ? new Anthropic({ apiKey: def.configKey, ...baseURL }) : new Anthropic(baseURL);
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
   * Stream one reply. Calls onDelta with text chunks as they arrive and resolves with the final text.
   * Claude models also get the agent's `abilities` ({web, code, folders}) and report their tool use
   * through onActivity, cited pages through onSources, and a re-run step through onReset.
   */
  async stream({ provider, model, system, messages, signal, onDelta, agent, abilities, onActivity, onSources, onReset }) {
    const def = this.defs.get(provider);
    if (!def) throw new ProviderError(`Unknown provider "${provider}"`);
    if (!this.isConfigured(provider)) {
      throw new ProviderError(`${def.label} needs an API key. Add one to config.json on your PC, then restart the hub.`);
    }
    if (def.kind === 'demo') return streamDemo({ messages, signal, onDelta, agent });
    if (def.kind === 'anthropic') {
      return streamAnthropic({
        client: this.#anthropic(def),
        model,
        system,
        messages,
        signal,
        abilities,
        onDelta,
        onActivity,
        onSources,
        onReset,
      });
    }
    return streamOpenAICompatible({ def, model, system, messages, signal, onDelta });
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
