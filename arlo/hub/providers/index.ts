import { getSettings, providerKey } from '../settings.ts';
import { createAnthropic } from './anthropic.ts';
import { createGemini } from './gemini.ts';
import { createOpenAI } from './openai.ts';
import type { Provider, ProviderId } from './types.ts';

export interface Candidate {
  provider: Provider;
  model: string;
}

const cache = new Map<string, Provider>();
let override: Provider | null = null;

/** Tests and demo mode replace the real providers with a scripted one. */
export function setProviderOverride(provider: Provider | null): void {
  override = provider;
}

function build(id: ProviderId, key: string): Provider {
  const s = getSettings();
  const cacheKey = `${id}:${key}:${s.claudeRefusalFallback}`;
  let provider = cache.get(cacheKey);
  if (!provider) {
    provider =
      id === 'anthropic' ? createAnthropic(key, { refusalFallback: s.claudeRefusalFallback })
      : id === 'openai' ? createOpenAI(key)
      : createGemini(key);
    cache.set(cacheKey, provider);
  }
  return provider;
}

/** Providers to try, in the owner's preferred order, limited to those with a key. */
export function candidates(): Candidate[] {
  const s = getSettings();
  if (override) return [{ provider: override, model: 'demo' }];
  const out: Candidate[] = [];
  for (const id of s.providerOrder) {
    const key = providerKey(id);
    if (key) out.push({ provider: build(id, key), model: s.models[id] });
  }
  return out;
}
