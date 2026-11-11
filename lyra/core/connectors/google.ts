export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

/** Any of these would let Lyra change or send mail. Phase 1 refuses a grant that carries one. */
const WRITE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.insert",
];

export function scopesAreReadOnly(scopes: string[] | string): boolean {
  const granted = (Array.isArray(scopes) ? scopes : scopes.split(/\s+/)).filter(Boolean);
  return granted.includes(GMAIL_READONLY) && !granted.some((s) => WRITE_SCOPES.includes(s));
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
    if (!scopesAreReadOnly(r.grantedScopes)) throw new Error("The Google grant is not read-only, so Lyra won't use it.");
    this.token = { value: r.accessToken, expires: Date.now() + 45 * 60_000 };
    return r.accessToken;
  }

  async invalidate(): Promise<void> {
    const old = this.token?.value;
    this.token = undefined;
    if (old) await this.auth.clearToken?.(old).catch(() => {});
  }
}
