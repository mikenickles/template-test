import Anthropic from '@anthropic-ai/sdk';
import { streamAnthropic } from './anthropic.js';
import { streamOpenAI } from './openai.js';
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
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    keyless: true,
    // Ollama can download models itself, so the app offers a few small ones that run on most PCs.
    pullable: true,
    installUrl: 'https://ollama.com/download',
  },
  { id: 'demo', label: 'Demo', kind: 'demo', keyless: true, models: ['demo'] },
];

/** Small models worth suggesting for a PC: what to download, and how big the download is. */
export const SMALL_MODELS = [
  { model: 'llama3.2', label: 'Llama 3.2 (3B)', size: '2.0 GB', note: 'A good first pick. Runs on most PCs with 8 GB of memory.' },
  { model: 'gemma3:4b', label: 'Gemma 3 (4B)', size: '3.3 GB', note: 'A little smarter and slower. Best with 16 GB of memory.' },
  { model: 'gemma3:1b', label: 'Gemma 3 (1B)', size: '0.8 GB', note: 'Tiny and quick, for older PCs. Keep its jobs simple.' },
];

/** A model name as Ollama spells them: "llama3.2", "gemma3:4b", "someone/model:tag". */
const MODEL_NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?(:[a-z0-9][a-z0-9._-]*)?$/i;

/** Ollama lists "llama3.2" as "llama3.2:latest"; both name the same model. */
const sameModel = (a, b) => (a.includes(':') ? a : `${a}:latest`) === (b.includes(':') ? b : `${b}:latest`);

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
    /** Local runtimes (no key): whether each answered when last asked, and its installed models. */
    this.local = new Map();
    /** Model downloads in progress, by provider: { model, status, percent, error }. */
    this.downloads = new Map();
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

  #isLocal(d) {
    return d.keyless && d.kind === 'openai';
  }

  /**
   * Asks each local runtime (Ollama and the like) whether it is running and which models it has.
   * Answers are reused for a few seconds, since every app refresh asks.
   */
  async checkLocal({ force = false } = {}) {
    await Promise.all(
      [...this.defs.values()].filter((d) => this.#isLocal(d)).map(async (d) => {
        const last = this.local.get(d.id);
        if (!force && last && Date.now() - last.checkedAt < 5000) return;
        let status = { running: false, models: [], checkedAt: Date.now() };
        try {
          const res = await fetch(`${d.baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
          if (res.ok) {
            const body = await res.json();
            status = { ...status, running: true, models: (body.data ?? []).map((m) => String(m.id)).sort() };
          }
        } catch {
          // Not installed, not started, or not answering: all mean "not running" to the app.
        }
        this.local.set(d.id, status);
      }),
    );
  }

  /** Public description of each provider. Never includes keys, only where a key came from. */
  list() {
    return [...this.defs.values()].map((d) => ({
      id: d.id,
      label: d.label,
      configured: this.isConfigured(d.id),
      models: this.#isLocal(d) ? this.local.get(d.id)?.models ?? [] : d.models ?? [],
      // Local runtimes: whether it answered, a page to install it from, and small models to download.
      local: this.#isLocal(d),
      running: this.#isLocal(d) ? Boolean(this.local.get(d.id)?.running) : null,
      installUrl: d.installUrl ?? null,
      suggestions: d.pullable ? SMALL_MODELS : [],
      download: this.downloads.get(d.id) ?? null,
      // Whether a key can be added from the app, where to get one, and where the current one came from.
      takesKey: !d.keyless && d.kind !== 'demo',
      keyUrl: d.keyUrl ?? null,
      keySource: d.configKey ? 'app' : d.apiKey ? 'environment' : null,
      keyHint: d.configKey ? `…${d.configKey.slice(-4)}` : null,
      // Abilities work on Claude and on OpenAI-compatible models (through the hub's own tools); running
      // code needs Anthropic's sandbox, so it's Claude only.
      abilities: d.kind === 'anthropic' || d.kind === 'openai',
      runsCode: d.kind === 'anthropic',
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

  /** "anthropic", "openai" (any OpenAI-compatible server) or "demo". */
  kindOf(id) {
    return this.defs.get(id)?.kind ?? null;
  }

  /**
   * Whether agents on this provider can use abilities: Claude, with Anthropic's tools and the hub's, and
   * OpenAI-compatible models, with the hub's own tools (see openai.js).
   */
  supportsAbilities(id) {
    const kind = this.defs.get(id)?.kind;
    return kind === 'anthropic' || kind === 'openai';
  }

  /** Ready to reply: a key, or for a local runtime, running with at least one model. */
  isConfigured(id) {
    const d = this.defs.get(id);
    if (!d) return false;
    if (this.#isLocal(d)) {
      const status = this.local.get(id);
      // Before the first check, assume it is there; a reply that fails says why.
      return status ? status.running && status.models.length > 0 : true;
    }
    return Boolean(d.keyless || d.apiKey);
  }

  /**
   * Starts downloading [model] into a local runtime that can fetch its own models (Ollama).
   * Progress shows in list() as `download`; when it finishes the model appears in `models`.
   */
  pull(id, model) {
    const d = this.defs.get(id);
    if (!d?.pullable) throw new ProviderError(`${d?.label ?? 'That provider'} can't download models.`);
    const name = String(model ?? '').trim();
    if (!MODEL_NAME.test(name) || name.length > 120) throw new ProviderError(`"${name}" isn't a model name. Try one like llama3.2.`);
    const busy = this.downloads.get(id);
    if (busy && !busy.error) throw new ProviderError(`${busy.model} is still downloading.`);
    const progress = { model: name, status: 'Starting', percent: 0, error: null };
    this.downloads.set(id, progress);
    this.#download(d, progress).catch(() => {});
    return progress;
  }

  /** Clears a finished or failed download from the list. */
  clearDownload(id) {
    if (this.downloads.get(id)?.error) this.downloads.delete(id);
  }

  async #download(d, progress) {
    const origin = new URL(d.baseUrl).origin;
    try {
      const res = await fetch(`${origin}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: progress.model, stream: true }),
      });
      if (!res.ok) throw new ProviderError(`${d.label} couldn't start the download (${res.status}).`);
      // One JSON object per line: { status, total, completed } while layers download, then { status: "success" }.
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines.filter((l) => l.trim())) {
          const event = JSON.parse(line);
          if (event.error) throw new ProviderError(/not found|file does not exist/i.test(event.error)
            ? `${d.label} has no model called "${progress.model}". Check the name on ollama.com/library.`
            : `The download stopped: ${event.error}`);
          if (event.total && event.completed != null) progress.percent = Math.min(99, Math.floor((event.completed / event.total) * 100));
          progress.status = /^(downloading|pulling) /.test(event.status ?? '') ? 'Downloading' : event.status === 'success' ? 'Done' : 'Getting ready';
          if (event.status === 'success') done = true;
        }
      }
      if (!done) throw new ProviderError('The download stopped before it finished. Try again.');
      this.downloads.delete(d.id);
      await this.checkLocal({ force: true });
    } catch (err) {
      progress.error = err instanceof ProviderError ? err.message
        : `Couldn't reach ${d.label} on your PC. Make sure it is installed and running.`;
      progress.status = 'Failed';
    }
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
  async stream({ provider, model, system, plainSystem, messages, signal, onDelta, agent, abilities, onActivity, onSources, onReset, onUsage = () => {} }) {
    const def = this.defs.get(provider);
    if (!def) throw new ProviderError(`Unknown provider "${provider}"`);
    if (this.#isLocal(def)) {
      await this.checkLocal();
      const status = this.local.get(provider);
      if (!status?.running) {
        throw new ProviderError(`${def.label} isn't running on your PC. Install it${def.installUrl ? ` from ${def.installUrl.replace('https://', '')}` : ''}, or start it, then try again.`);
      }
      if (!status.models.some((m) => sameModel(m, model))) {
        throw new ProviderError(def.pullable
          ? `${model} isn't downloaded yet. Get it in Settings, under AI models, ${def.label}.`
          : `${def.label} doesn't have ${model}. Load it there, then try again.`);
      }
    } else if (!this.isConfigured(provider)) {
      throw new ProviderError(`${def.label} needs an API key. Add one in the app, in Settings, under AI models.`);
    }
    if (def.kind === 'demo') return streamDemo({ messages: asText(messages), signal, onDelta, agent });
    if (def.kind === 'anthropic') {
      return streamAnthropic({
        client: this.#anthropic(def),
        model,
        system,
        messages: forAnthropic(messages),
        signal,
        abilities,
        onDelta,
        onActivity,
        onSources,
        onReset,
        onUsage,
      });
    }
    return streamOpenAI({ def, model, system, plainSystem, messages: forOpenAI(messages), signal, abilities, onDelta, onActivity, onSources, onUsage });
  }
}

/*
 * A turn's content is a string, or a list of parts: { type: 'text', text }, { type: 'image', mediaType,
 * data, name } and { type: 'pdf', data, name }, with data in base64. Each provider gets them its way.
 */
const mapParts = (messages, part) =>
  messages.map((m) => (typeof m.content === 'string' ? m : { role: m.role, content: m.content.map(part) }));

export function forAnthropic(messages) {
  return mapParts(messages, (p) => {
    if (p.type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } };
    if (p.type === 'pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data }, title: p.name };
    return { type: 'text', text: p.text };
  });
}

/** OpenAI-compatible servers take images as data URLs; PDFs are only named, since few of them read PDFs. */
export function forOpenAI(messages) {
  return mapParts(messages, (p) => {
    if (p.type === 'image') return { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
    if (p.type === 'pdf') return { type: 'text', text: `[${p.name} is attached, but this model can't read PDFs.]` };
    return { type: 'text', text: p.text };
  });
}

function asText(messages) {
  return messages.map((m) =>
    typeof m.content === 'string' ? m : { role: m.role, content: m.content.map((p) => p.text ?? `[${p.name}]`).join('\n\n') },
  );
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
