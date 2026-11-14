import { db } from './db.ts';
import { getSecret, hasSecret } from './secrets.ts';
import type { Effort, ProviderId } from './providers/types.ts';

export interface Settings {
  agentName: string;
  userName: string;
  /** Extra personality notes in the owner's own words. Empty means the default voice. */
  persona: string;
  /** Which model family to try first; the others are fallbacks when their keys are set. */
  providerOrder: ProviderId[];
  models: Record<ProviderId, string>;
  effort: Effort;
  /** Let Anthropic retry a declined Claude request on another Claude model. */
  claudeRefusalFallback: boolean;
  /** Accept connections from other devices (your phone). Off = this computer only. */
  remoteAccess: boolean;
  /** The kill switch: no tools run and no routines fire while this is on. */
  paused: boolean;
  quietStart: string;
  quietEnd: string;
  /** Most unprompted messages Arlo may send in a day. */
  proactiveDailyCap: number;
  wallet: { enabled: boolean; perPurchase: number; perDay: number; currency: string };
  googleClientId: string;
  spotifyClientId: string;
  onboarded: boolean;
}

export const DEFAULTS: Settings = {
  agentName: 'Arlo',
  userName: '',
  persona: '',
  providerOrder: ['anthropic', 'openai', 'gemini'],
  models: { anthropic: 'claude-opus-5-5', openai: 'gpt-6-astra', gemini: 'gemini-4-hydrogen' },
  effort: 'medium',
  claudeRefusalFallback: true,
  remoteAccess: false,
  paused: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  proactiveDailyCap: 6,
  wallet: { enabled: false, perPurchase: 5000, perDay: 10000, currency: 'usd' },
  googleClientId: '',
  spotifyClientId: '',
  onboarded: false,
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const row = db().prepare("select value from kv where key = 'settings'").get() as { value: string } | undefined;
  const stored = row ? (JSON.parse(row.value) as Partial<Settings>) : {};
  cache = {
    ...DEFAULTS,
    ...stored,
    models: { ...DEFAULTS.models, ...stored.models },
    wallet: { ...DEFAULTS.wallet, ...stored.wallet },
  };
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    models: { ...current.models, ...patch.models },
    wallet: { ...current.wallet, ...patch.wallet },
  };
  db().prepare("insert into kv(key, value) values('settings', ?) on conflict(key) do update set value = excluded.value")
    .run(JSON.stringify(next));
  cache = next;
  return next;
}

export function resetSettingsCacheForTests(): void {
  cache = null;
}

const ENV_KEYS: Record<ProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

/** A provider key saved in Settings, or failing that the usual environment variable. */
export function providerKey(id: ProviderId): string | null {
  const saved = getSecret(`key.${id}`);
  if (saved) return saved;
  for (const name of ENV_KEYS[id]) if (process.env[name]) return process.env[name]!;
  return null;
}

export function hasProviderKey(id: ProviderId): boolean {
  return hasSecret(`key.${id}`) || ENV_KEYS[id].some((name) => !!process.env[name]);
}

/** Is `date` inside the quiet hours window (which may cross midnight)? */
export function isQuiet(date: Date, s: Pick<Settings, 'quietStart' | 'quietEnd'> = getSettings()): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const start = toMinutes(s.quietStart);
  const end = toMinutes(s.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
