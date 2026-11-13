// Spotify sign-in (OAuth with PKCE: no app secret), with the user's own Spotify
// developer app. Tokens stay on this device. Lyra asks only for what each switch needs.
import type { SecretStore } from "../../lyra.ts";

export const SPOTIFY_READ = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
];
/** Play, pause, skip, queue (Spotify only allows this with Premium). */
export const SPOTIFY_PLAYBACK = ["user-modify-playback-state"];
/** Make playlists and add songs to yours, each one with the user's tap. */
export const SPOTIFY_PLAYLISTS = ["playlist-modify-private", "playlist-modify-public"];
const ALLOWED = new Set([...SPOTIFY_READ, ...SPOTIFY_PLAYBACK, ...SPOTIFY_PLAYLISTS]);

/** A grant is only used if it has nothing beyond what Lyra asks for. */
export function spotifyGrantIsAllowed(scope: string): boolean {
  return scope.split(/\s+/).filter(Boolean).every((s) => ALLOWED.has(s));
}

/** How the platform gets the user through Spotify's sign-in page and back. */
export interface OAuthRedirect {
  /** Opens `authUrl(redirectUri)` in the browser and resolves with the URL Spotify sent the user back to. */
  authorize(authUrl: (redirectUri: string) => string): Promise<{ redirectUri: string; returned: string }>;
}

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class SpotifyAuth {
  private access: { token: string; expires: number; scope: string } | undefined;

  constructor(
    private secrets: SecretStore,
    private fetchFn: typeof fetch,
  ) {}

  async clientId(): Promise<string | null> {
    return this.secrets.get("spotify.client");
  }

  async setClientId(id: string): Promise<void> {
    const clean = id.trim();
    if (!/^[0-9a-f]{32}$/i.test(clean)) throw new Error("That doesn't look like a Spotify Client ID (32 letters and numbers, from your app's page on developer.spotify.com).");
    await this.secrets.set("spotify.client", clean);
  }

  /** Sign in (or sign in again with more permissions). Returns the Spotify account's name. */
  async connect(redirect: OAuthRedirect, scopes: string[]): Promise<{ name: string; scope: string }> {
    const client = await this.clientId();
    if (!client) throw new Error("Add your Spotify app's Client ID first.");
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const { redirectUri, returned } = await redirect.authorize(
      (redirectUri) =>
        `${ACCOUNTS}/authorize?${new URLSearchParams({
          client_id: client,
          response_type: "code",
          redirect_uri: redirectUri,
          code_challenge_method: "S256",
          code_challenge: challenge,
          state,
          scope: scopes.join(" "),
          show_dialog: "true",
        })}`,
    );
    const back = new URL(returned);
    if (back.searchParams.get("state") !== state) throw new Error("Spotify sign-in didn't match. Try again.");
    const err = back.searchParams.get("error");
    if (err) throw new Error(err === "access_denied" ? "Spotify sign-in was cancelled." : `Spotify said: ${err}`);
    const code = back.searchParams.get("code");
    if (!code) throw new Error("Spotify sign-in didn't finish.");
    const t = await this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: client, code_verifier: verifier });
    const me = await this.get<{ display_name?: string; id: string }>("/me");
    return { name: me.display_name || me.id, scope: t.scope };
  }

  private async token(body: Record<string, string>): Promise<{ scope: string }> {
    const r = await this.fetchFn(`${ACCOUNTS}/api/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
    if (!r.ok || !j.access_token) {
      if (j.error === "invalid_grant") {
        await this.forget();
        throw new Error("SPOTIFY_EXPIRED");
      }
      throw new Error(`Spotify sign-in failed${j.error_description ? `: ${j.error_description}` : ""}.`);
    }
    const scope = j.scope ?? "";
    if (!spotifyGrantIsAllowed(scope)) {
      await this.forget();
      throw new Error("Spotify granted more than Lyra asked for, so Lyra didn't keep it.");
    }
    this.access = { token: j.access_token, expires: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000, scope };
    if (j.refresh_token) await this.secrets.set("spotify.refresh", j.refresh_token);
    return { scope };
  }

  /** What this sign-in allows (space-separated scopes). */
  async scope(): Promise<string> {
    await this.bearer();
    return this.access?.scope ?? "";
  }

  private async bearer(): Promise<string> {
    if (this.access && this.access.expires > Date.now()) return this.access.token;
    const refresh = await this.secrets.get("spotify.refresh");
    const client = await this.clientId();
    if (!refresh || !client) throw new Error("SPOTIFY_EXPIRED");
    await this.token({ grant_type: "refresh_token", refresh_token: refresh, client_id: client });
    return this.access!.token;
  }

  async forget(): Promise<void> {
    this.access = undefined;
    await this.secrets.remove("spotify.refresh");
  }

  /** A Spotify Web API call. Throws friendly errors. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.fetchFn(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${await this.bearer()}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (r.status === 401 && attempt === 0) {
        this.access = undefined;
        continue;
      }
      if (r.status === 204 || r.status === 202) return {} as T;
      const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; reason?: string } };
      if (r.ok) return j;
      const why = j.error?.reason ?? j.error?.message ?? "";
      if (r.status === 404 && /NO_ACTIVE_DEVICE|device/i.test(why)) throw new Error("Nothing is playing on any device. Open Spotify on your phone or computer first.");
      if (r.status === 403 && /PREMIUM/i.test(why)) throw new Error("Spotify only lets apps control playback with Premium.");
      if (r.status === 403) throw new Error("Spotify refused. If your Spotify developer app is in development mode, add your account under its User Management.");
      if (r.status === 429) throw new Error("Spotify says too many requests. Try again in a minute.");
      throw new Error(`Spotify said ${r.status}${why ? `: ${why}` : ""}.`);
    }
    throw new Error("SPOTIFY_EXPIRED");
  }

  get<T>(path: string): Promise<T> {
    return this.call<T>("GET", path);
  }
}
