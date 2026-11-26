/** What this device lets Tomo use: contacts, notifications, the browser link. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as S from "../skills.ts";
import { getSetting, setSetting } from "../db.ts";
import { type AppState } from "./shared.ts";
import type { Lyra } from "../lyra.ts";
import { part } from "./part.ts";

export const device = part({
  /** The phone's contacts are on for this device (and the phone can). */
  get contactsOn(): boolean {
    return !!this.p.contacts?.available && getSetting(this.db, "contacts") === "on";
  },

  /**
   * Reading notifications follows Android's Notification access: on once the user allows it
   * there (Lyra can't turn it on itself), off when they turn it off here or there.
   */
  /** (0.56) Let Lyra use your own browser (through its extension): the Windows app starts listening for it. */
  async allowBrowser(on: boolean): Promise<AppState> {
    if (!this.p.browser) throw new Error("Using your browser works in Tomo's Windows app (the newest one).");
    await this.p.browser.listen(on);
    if (!on) await this.p.browser.close().catch(() => {});
    setSetting(this.db, "browser", on ? "on" : "off");
    await this.db.flush();
    await this.connectors.reset();
    return this.state();
  },

  /** The link as it is now: listening, and whether the extension is connected. */
  browserStatus(): Promise<{ listening: boolean; connected: boolean; agent: string }> {
    return this.p.browser ? this.p.browser.status() : Promise.resolve({ listening: false, connected: false, agent: "" });
  },

  async allowNotices(on: boolean): Promise<AppState> {
    if (on) {
      if (!this.p.notices) throw new Error("Reading notifications works in the Android app.");
      if (!(await this.p.notices.access())) throw new Error("NEEDS_ACCESS");
    }
    setSetting(this.db, "notices", on ? "on" : "off");
    await this.db.flush();
    return this.state();
  },

  /** On start and on coming back to Lyra: notice when access was turned on or off in Android settings. */
  async syncNotices(): Promise<AppState> {
    if (!this.p.notices) return this.state();
    const access = await this.p.notices.access().catch(() => false);
    const on = getSetting(this.db, "notices") === "on";
    // allowed in Android settings and never turned off here: on. Taken away there: off.
    if (access && !on && getSetting(this.db, "notices") !== "off") return this.allowNotices(true);
    if (!access && on) return this.allowNotices(false);
    return this.state();
  },

  async allowContacts(on: boolean): Promise<AppState> {
    if (on) {
      if (!this.p.contacts?.available) throw new Error("Contacts work in the Android app.");
      if (!(await this.p.contacts.allow())) throw new Error("Android didn't allow Tomo to read contacts. You can allow it in your phone's Settings, Apps, Tomo.");
    }
    setSetting(this.db, "contacts", on ? "on" : "off");
    await this.db.flush();
    return this.state();
  },
});
