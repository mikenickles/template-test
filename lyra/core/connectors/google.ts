export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
export const CALENDAR_READONLY = "https://www.googleapis.com/auth/calendar.readonly";
export const DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly";
/**
 * Phase 9, each only if the user turns it on in Connections: write emails (as drafts, or
 * sent) and add calendar events. Lyra's model never gets a tool that uses these; the app
 * uses them only after the user taps Send / Save to Drafts / Add on a card in the chat.
 */
export const GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
export const CALENDAR_EVENTS = "https://www.googleapis.com/auth/calendar.events";
/** Phase 13: only the files Lyra itself creates in Drive (its Google Docs). It can't see any other file. */
export const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
/** Lyra's own hidden folder in your Drive, for sync. It can't see or change any of your files. */
export const DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

/**
 * The only Google permissions Lyra will ever accept: reading, who you are, its own
 * hidden sync folder (which holds nothing of yours but Lyra's encrypted snapshots),
 * and the two approve-each-one permissions above. Google returns earlier grants
 * alongside new ones, so each of these has to be allowed here or it would spoil
 * every read-only grant. Anything wider (all of Gmail, deleting, all of Drive or
 * Calendar settings) is refused.
 */
const ALLOWED = new Set([
  GMAIL_READONLY,
  CALENDAR_READONLY,
  DRIVE_READONLY,
  DRIVE_APPDATA,
  GMAIL_COMPOSE,
  CALENDAR_EVENTS,
  DRIVE_FILE,
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
]);

/**
 * A grant is usable only if it includes the scope we asked for and nothing
 * beyond the list above. Google can return earlier grants alongside the new
 * one, so every scope in it is checked.
 */
export function grantIsAllowed(scopes: string[] | string, required: string): boolean {
  const granted = (Array.isArray(scopes) ? scopes : scopes.split(/\s+/)).filter(Boolean);
  return granted.includes(required) && granted.every((s) => ALLOWED.has(s));
}


export class NeedsConsentError extends Error {
  constructor(message = "Google needs you to approve Lyra again.") {
    super(message);
  }
}

/**
 * Google sign-in, provided by the platform. On Android this is Google Play
 * services' Authorization API: it keeps the long-lived grant itself and hands
 * Lyra short-lived access tokens, so no refresh token is ever stored in the app.
 */
export interface GoogleAuth {
  readonly available: boolean;
  /** interactive=false never shows UI; it throws NeedsConsentError instead. */
  authorize(scopes: string[], interactive: boolean): Promise<{ accessToken: string; grantedScopes: string[]; email?: string }>;
  /** Drop a cached token so the next authorize() fetches a fresh one. */
  clearToken?(token: string): Promise<void>;
  /** Remove Lyra's access for this account. */
  revoke?(scopes: string[], email: string): Promise<void>;
}

/** Caches an access token for most of its hour and asks again quietly when it runs out. */
export class TokenSource {
  private token: { value: string; expires: number } | undefined;

  constructor(
    private auth: GoogleAuth,
    private scopes: string[],
  ) {}

  async get(): Promise<string> {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const r = await this.auth.authorize(this.scopes, false);
    if (!grantIsAllowed(r.grantedScopes, this.scopes[0])) throw new Error("The Google grant includes more than Lyra asked for, so Lyra won't use it.");
    this.token = { value: r.accessToken, expires: Date.now() + 45 * 60_000 };
    return r.accessToken;
  }

  async invalidate(): Promise<void> {
    const old = this.token?.value;
    this.token = undefined;
    if (old) await this.auth.clearToken?.(old).catch(() => {});
  }
}
