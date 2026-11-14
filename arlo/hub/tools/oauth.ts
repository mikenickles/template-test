import crypto from 'node:crypto';
import { deleteSecret, getSecret, setSecret } from '../secrets.ts';
import { getSettings } from '../settings.ts';

export type OAuthService = 'google' | 'spotify';

interface Config {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: () => string;
  clientSecret: () => string | null;
  extraAuthParams: Record<string, string>;
}

/**
 * Least privilege. Google: read and manage mail (no permanent delete), manage
 * the calendar, read Drive, and write only to files Arlo itself created.
 */
const CONFIG: Record<OAuthService, Config> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    clientId: () => getSettings().googleClientId,
    clientSecret: () => getSecret('google.clientSecret'),
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  spotify: {
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
      'playlist-read-private', 'playlist-modify-private', 'playlist-modify-public', 'user-library-read',
    ],
    clientId: () => getSettings().spotifyClientId,
    clientSecret: () => null,
    extraAuthParams: {},
  },
};

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account?: string;
}

const pending = new Map<string, { service: OAuthService; verifier: string; redirect: string; expires: number }>();

/** Loopback redirect, by IP literal: both Google and Spotify require this form for local apps. */
export function redirectUri(service: OAuthService, port: number): string {
  return `http://127.0.0.1:${port}/oauth/${service}/callback`;
}

export function beginAuth(service: OAuthService, port: number): string {
  const cfg = CONFIG[service];
  const clientId = cfg.clientId();
  if (!clientId) throw new Error(`Add your ${service === 'google' ? 'Google' : 'Spotify'} client ID first.`);
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(18).toString('base64url');
  const redirect = redirectUri(service, port);
  for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
  pending.set(state, { service, verifier, redirect, expires: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: cfg.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...cfg.extraAuthParams,
  });
  return `${cfg.authUrl}?${params}`;
}

async function tokenRequest(service: OAuthService, body: Record<string, string>, fetchImpl: typeof fetch) {
  const cfg = CONFIG[service];
  const secret = cfg.clientSecret();
  const res = await fetchImpl(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId(), ...(secret ? { client_secret: secret } : {}), ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === 'string' ? json.error : `http_${res.status}`;
    throw Object.assign(new Error(String(json.error_description ?? code)), { code });
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

/** Finish the browser round-trip. `whoAmI` fetches a display name for the connected account. */
export async function finishAuth(
  service: OAuthService,
  query: URLSearchParams,
  fetchImpl: typeof fetch,
  whoAmI: (accessToken: string) => Promise<string | undefined>,
): Promise<void> {
  const state = query.get('state') ?? '';
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || entry.service !== service || entry.expires < Date.now()) throw new Error('That sign-in link expired. Please start again.');
  if (query.get('error')) throw new Error(`Sign-in was cancelled (${query.get('error')}).`);
  const code = query.get('code');
  if (!code) throw new Error('No sign-in code came back.');
  const t = await tokenRequest(
    service,
    { grant_type: 'authorization_code', code, redirect_uri: entry.redirect, code_verifier: entry.verifier },
    fetchImpl,
  );
  if (!t.refresh_token) throw new Error('No long-lived access was granted. Please try connecting again.');
  const tokens: Tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
  tokens.account = await whoAmI(t.access_token).catch(() => undefined);
  setSecret(`${service}.tokens`, JSON.stringify(tokens));
}

const refreshing = new Map<OAuthService, Promise<string>>();

/** A valid access token, refreshed when needed (one refresh at a time). */
export async function accessToken(service: OAuthService, fetchImpl: typeof fetch): Promise<string> {
  const raw = getSecret(`${service}.tokens`);
  const name = service === 'google' ? 'Google' : 'Spotify';
  if (!raw) throw new Error(`${name} is not connected.`);
  const tokens = JSON.parse(raw) as Tokens;
  if (tokens.expires_at - Date.now() > 60_000) return tokens.access_token;

  let job = refreshing.get(service);
  if (!job) {
    job = (async () => {
      try {
        const t = await tokenRequest(service, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, fetchImpl);
        const next: Tokens = {
          ...tokens,
          access_token: t.access_token,
          refresh_token: t.refresh_token ?? tokens.refresh_token,
          expires_at: Date.now() + (t.expires_in ?? 3600) * 1000,
        };
        setSecret(`${service}.tokens`, JSON.stringify(next));
        return next.access_token;
      } catch (err) {
        if ((err as { code?: string }).code === 'invalid_grant') {
          deleteSecret(`${service}.tokens`);
          throw new Error(`The ${name} connection has expired. Reconnect it from the menu under Connections.`);
        }
        throw err;
      } finally {
        refreshing.delete(service);
      }
    })();
    refreshing.set(service, job);
  }
  return job;
}

export function connectedAccount(service: OAuthService): string | null {
  const raw = getSecret(`${service}.tokens`);
  if (!raw) return null;
  return (JSON.parse(raw) as Tokens).account ?? 'Connected';
}

export async function disconnect(service: OAuthService, fetchImpl: typeof fetch): Promise<void> {
  const raw = getSecret(`${service}.tokens`);
  deleteSecret(`${service}.tokens`);
  if (raw && service === 'google') {
    // Best effort: also withdraw the grant on Google's side.
    const { refresh_token } = JSON.parse(raw) as Tokens;
    await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh_token)}`, { method: 'POST' }).catch(() => {});
  }
}

/** An authorised JSON request that turns API errors into readable messages. */
export async function api<T = unknown>(
  service: OAuthService,
  fetchImpl: typeof fetch,
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal; raw?: boolean } = {},
): Promise<T> {
  const token = await accessToken(service, fetchImpl);
  const isJson = init.body !== undefined && typeof init.body !== 'string';
  const res = await fetchImpl(url, {
    method: init.method ?? 'GET',
    signal: init.signal,
    headers: { authorization: `Bearer ${token}`, ...(isJson ? { 'content-type': 'application/json' } : {}), ...init.headers },
    body: init.body === undefined ? undefined : isJson ? JSON.stringify(init.body) : (init.body as string),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; reason?: string } | string };
      const e = parsed.error;
      message = typeof e === 'string' ? e : e?.message ?? message;
      if (typeof e === 'object' && e?.reason) message += ` (${e.reason})`;
    } catch { /* not JSON */ }
    throw Object.assign(new Error(message), { status: res.status });
  }
  if (init.raw) return text as T;
  return (text ? JSON.parse(text) : {}) as T;
}
