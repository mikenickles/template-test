import { OAuth2Client } from "google-auth-library";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

/** Any of these would let Lyra change or send mail. Phase 1 refuses a token that carries one. */
const WRITE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.insert",
];

export interface GoogleCreds {
  clientId?: string;
  clientSecret?: string;
}

export interface StoredToken {
  refresh_token: string;
  scope: string;
  email?: string;
  connected_at: string;
}

export function scopesAreReadOnly(scope: string): boolean {
  const granted = scope.split(/\s+/).filter(Boolean);
  return granted.includes(GMAIL_READONLY) && !granted.some((s) => WRITE_SCOPES.includes(s));
}

export function oauthClient(creds: GoogleCreds, redirectUri?: string): OAuth2Client {
  if (!creds.clientId || !creds.clientSecret)
    throw new Error("Google isn't set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.");
  return new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri });
}

export function authUrl(creds: GoogleCreds, redirectUri: string, state: string): string {
  return oauthClient(creds, redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY],
    include_granted_scopes: false,
    state,
  });
}

export async function exchangeCode(
  creds: GoogleCreds,
  redirectUri: string,
  code: string,
  tokenPath: string,
): Promise<StoredToken> {
  const client = oauthClient(creds, redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token. Remove Lyra's access in your Google account and try again.");
  const scope = tokens.scope ?? "";
  if (!scopesAreReadOnly(scope)) {
    client.setCredentials(tokens);
    await client.revokeCredentials().catch(() => {});
    throw new Error("Google granted more than read-only mail access, so Lyra threw the token away. Try again and approve read-only access only.");
  }
  client.setCredentials(tokens);
  let email: string | undefined;
  try {
    const res = await client.request<{ emailAddress: string }>({
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    });
    email = res.data.emailAddress;
  } catch {
    /* the profile is only for display */
  }
  const stored: StoredToken = { refresh_token: tokens.refresh_token, scope, email, connected_at: new Date().toISOString() };
  writeFileSync(tokenPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
  return stored;
}

export function loadToken(tokenPath: string): StoredToken | undefined {
  if (!existsSync(tokenPath)) return undefined;
  try {
    const t = JSON.parse(readFileSync(tokenPath, "utf8")) as StoredToken;
    return t.refresh_token ? t : undefined;
  } catch {
    return undefined;
  }
}

export async function disconnect(creds: GoogleCreds, tokenPath: string): Promise<void> {
  const t = loadToken(tokenPath);
  if (t && creds.clientId && creds.clientSecret) {
    await oauthClient(creds).revokeToken(t.refresh_token).catch(() => {});
  }
  rmSync(tokenPath, { force: true });
}
