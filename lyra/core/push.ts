/**
 * Push: the home base rings your phone when Lyra has something, even with Lyra closed there.
 *
 * There's no Lyra server, so this goes through Google's push service (Firebase Cloud
 * Messaging) with a free Firebase project of your own:
 *  - google-services.json (the app's public settings) is read on the home base, kept in the
 *    synced settings, and used by the phone to sign up for push; the phone's push address
 *    (its token) syncs back the same way.
 *  - the service account key (the right to send) stays on the home base only, with the API
 *    keys; it is never synced or backed up.
 * A notification carries one line of text: the title and the first line of Lyra's post.
 */

export interface PushConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  senderId: string;
}

export interface PushAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface PushDevice {
  name: string;
  token: string;
  at: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Reads google-services.json (from the Firebase console) for this app's package. */
export function parseGoogleServices(text: string, packageName: string): PushConfig {
  let j: { project_info?: Record<string, unknown>; client?: { client_info?: { mobilesdk_app_id?: unknown; android_client_info?: { package_name?: unknown } }; api_key?: { current_key?: unknown }[] }[] };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("That isn't the google-services.json file (it should start with a { ).");
  }
  if (!j.project_info || !Array.isArray(j.client)) throw new Error("That isn't a google-services.json file. Download it from your Firebase project's Android app.");
  const client = j.client.find((c) => c.client_info?.android_client_info?.package_name === packageName);
  if (!client) throw new Error(`That file is for a different app. In Firebase, add an Android app with the package name ${packageName}.`);
  const cfg = {
    projectId: str(j.project_info.project_id),
    senderId: str(j.project_info.project_number),
    appId: str(client.client_info?.mobilesdk_app_id),
    apiKey: str(client.api_key?.[0]?.current_key),
  };
  if (!cfg.projectId || !cfg.senderId || !cfg.appId || !cfg.apiKey) throw new Error("That google-services.json is missing some details. Download it again from Firebase.");
  return cfg;
}

/** Reads a Firebase service account key (Project settings, Service accounts, Generate new private key). */
export function parseServiceAccount(text: string): PushAccount {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("That isn't the service account key file (it should start with a { ).");
  }
  const a = { projectId: str(j.project_id), clientEmail: str(j.client_email), privateKey: str(j.private_key) };
  if (j.type !== "service_account" || !a.projectId || !a.clientEmail || !a.privateKey.includes("PRIVATE KEY")) throw new Error("That isn't a service account key. In Firebase: Project settings, Service accounts, Generate new private key.");
  return a;
}

const b64url = (bytes: Uint8Array | string) => {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A signed request for a short-lived token that may only send messages. */
export async function signedAssertion(a: PushAccount, now = Date.now()): Promise<string> {
  const der = Uint8Array.from(atob(a.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000);
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: a.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }),
  )}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

export type PushResult = "sent" | "gone" | "failed";

export class PushSender {
  private token?: { value: string; until: number };

  constructor(
    private account: PushAccount,
    private fetchFn: typeof fetch,
  ) {}

  private async access(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const r = await this.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signedAssertion(this.account) }).toString(),
    });
    if (!r.ok) throw new Error(`Google didn't accept the service account key (${r.status}). Make a new key in Firebase and add it again.`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    this.token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  /** One notification to one device. "gone": that device's address is no longer valid (app removed, or re-registered). */
  async send(deviceToken: string, n: { title: string; body: string; hash?: string }): Promise<PushResult> {
    const r = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.projectId)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.access()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: n.title.slice(0, 80), body: n.body.slice(0, 240) },
          data: { hash: n.hash ?? "#/" },
          android: { priority: "HIGH", notification: { channel_id: "lyra_push", icon: "ic_stat_lyra" } },
        },
      }),
    });
    if (r.ok) return "sent";
    if (r.status === 404 || (r.status === 400 && /UNREGISTERED|not a valid FCM registration token/i.test(await r.text().catch(() => "")))) return "gone";
    if (r.status === 401) this.token = undefined;
    return "failed";
  }
}
