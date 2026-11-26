/** Google sign-in for Gmail, Calendar and Drive. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { gmailProfile } from "../connectors/gmail/server.ts";
import { grantIsAllowed, TokenSource } from "../connectors/google.ts";
import * as S from "../skills.ts";
import * as ST from "../style.ts";
import { getSetting, setSetting } from "../db.ts";
import * as T from "../tasks.ts";
import { type AppState, type GoogleId, ACTION_ACCESS, type GoogleAction, GOOGLE, type GmailLink } from "./shared.ts";
import { part } from "./part.ts";

export const google = part({
  link(id: GoogleId): GmailLink | undefined {
    const raw = getSetting(this.db, id);
    return raw ? (JSON.parse(raw) as GmailLink) : undefined;
  },

    tokenFor(id: GoogleId): TokenSource {
    return this.tokenSources.get(id)!;
  },

  get gmailOn(): boolean {
    return this.connectors.status().some((c) => c.id === "gmail" && c.state === "connected");
  },

  // ---------- Google (Mail, Calendar, Drive) ----------

  /** Ask Google for one service's read-only access. */
  async connectGoogle(id: GoogleId): Promise<AppState> {
    const g = GOOGLE.find((x) => x.id === id);
    if (!g) throw new Error("Unknown connection.");
    if (!this.p.google.available) throw new Error(`${g.label} sign-in works in the Android app.`);
    const r = await this.p.google.authorize([g.scope], true);
    if (!grantIsAllowed(r.grantedScopes, g.scope)) throw new Error(`Google granted more than read-only ${g.noun} access, so Tomo didn't keep it.`);
    await this.tokenFor(id).invalidate();
    let email = r.email ?? GOOGLE.map((x) => this.link(x.id)?.email).find(Boolean);
    if (!email && id === "gmail") email = await gmailProfile(this.tokenFor(id), this.fetch);
    setSetting(this.db, id, JSON.stringify({ email, connected_at: new Date().toISOString() } satisfies GmailLink));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  },

  /** (0.63) mail, calendar and files in one sign-in: one grant for all three read scopes */
  async connectGoogleAll(): Promise<AppState> {
    if (!this.p.google.available) throw new Error("Google sign-in works in the Android app, or on Windows once Google is set up there.");
    const want = GOOGLE.filter((g) => !this.link(g.id));
    if (!want.length) return this.state();
    const r = await this.p.google.authorize(
      want.map((g) => g.scope),
      true,
    );
    const ok = want.filter((g) => grantIsAllowed(r.grantedScopes, g.scope));
    if (!ok.length) throw new Error("Google didn't grant read-only access, so Tomo didn't keep it.");
    let email = r.email ?? GOOGLE.map((x) => this.link(x.id)?.email).find(Boolean);
    for (const g of ok) await this.tokenFor(g.id).invalidate();
    if (!email && ok.some((g) => g.id === "gmail")) email = await gmailProfile(this.tokenFor("gmail"), this.fetch).catch(() => undefined);
    for (const g of ok) setSetting(this.db, g.id, JSON.stringify({ email, connected_at: new Date().toISOString() } satisfies GmailLink));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  },

  /**
   * Stop using one service. Google treats Lyra's access as one grant, so it's
   * only revoked at Google when the last service is disconnected.
   */
  async disconnectGoogle(id: GoogleId): Promise<AppState> {
    const g = GOOGLE.find((x) => x.id === id);
    if (!g) throw new Error("Unknown connection.");
    const others = GOOGLE.filter((x) => x.id !== id && this.link(x.id));
    if (!others.length) {
      try {
        const email = this.link(id)?.email;
        if (email && this.p.google.revoke) await this.p.google.revoke([g.scope], email);
        else {
          const token = await this.tokenFor(id).get();
          await this.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
        }
      } catch {
        /* already signed out or offline: forgetting locally is still right */
      }
    }
    await this.tokenFor(id).invalidate();
    this.db.run("DELETE FROM settings WHERE key = ?", [id]);
    for (const k of Object.keys(ACTION_ACCESS) as GoogleAction[]) if (ACTION_ACCESS[k].link === id) this.db.run("DELETE FROM settings WHERE key = ?", [ACTION_ACCESS[k].setting]);
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  },

  connectGmail(): Promise<AppState> {
    return this.connectGoogle("gmail");
  },

  disconnectGmail(): Promise<AppState> {
    return this.disconnectGoogle("gmail");
  },
});
