/** Life admin: bills, subscriptions, packages, trips and returns from the inbox. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as A from "../actions.ts";
import * as S from "../skills.ts";
import * as LA from "../lifeadmin.ts";
import * as AC from "../activity.ts";
import { getSetting, addMessage, setSetting } from "../db.ts";
import { localToDate } from "../reminders.ts";
import { localDay, metered } from "../usage.ts";
import * as T from "../tasks.ts";
import { inQuietHours } from "./shared.ts";
import { part } from "./part.ts";

export const lifeadmin = part({
  get lifeAdminOn(): boolean {
    return getSetting(this.db, "lifeAdmin") !== "off";
  },

  /** The list, the monthly cost of subscriptions, and how the scan stands. */
  lifeAdmin(): { on: boolean; gmail: boolean; items: LA.AdminItem[]; done: LA.AdminItem[]; total: string; lastScan: string | null; scanning: boolean; today: string } {
    const all = LA.listItems(this.db, { status: "all" });
    return {
      on: this.lifeAdminOn,
      gmail: this.gmailOn,
      items: all.filter((i) => i.status === "open"),
      done: all.filter((i) => i.status !== "open").slice(-30),
      total: LA.monthlyTotal(all.filter((i) => i.status === "open")),
      lastScan: getSetting(this.db, "lifeAdminAt") || null,
      scanning: this.scanning,
      today: LA.localDay(new Date(), this.p.timeZone),
    };
  },

  /** Life admin heads-ups to schedule on the phone: at 9:00 local on their day. */
  lifeAdminNotices(now = new Date()): { id: number; at: string; text: string }[] {
    if (!this.lifeAdminOn) return [];
    const today = LA.localDay(now, this.p.timeZone);
    return LA.upcomingNotices(this.db, today)
      .map((n) => ({ id: n.id, at: localToDate(`${n.day} 09:00`, this.p.timeZone)?.toISOString() ?? "", text: n.text }))
      .filter((n) => n.at && Date.parse(n.at) > now.getTime() + 60_000);
  },

  async setLifeAdmin(on: boolean): Promise<void> {
    setSetting(this.db, "lifeAdmin", on ? "on" : "off");
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "admin" }));
  },

  async setAdminStatus(id: number, status: LA.AdminItem["status"]): Promise<void> {
    LA.setStatus(this.db, id, status);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "admin" }));
  },

  /** Go through the inbox now: since the last scan (a month the first time). */
  async scanLifeAdmin(): Promise<{ added: number; updated: number }> {
    if (!this.gmailOn) throw new Error("Connect Gmail first, in Connections.");
    if (this.scanning) throw new Error("Already going through your mail.");
    this.scanning = true;
    this.listeners.forEach((l) => l({ type: "admin" }));
    const startedAt = new Date().toISOString();
    try {
      const last = getSetting(this.db, "lifeAdminAt");
      const days = last ? Math.min(30, Math.max(2, Math.ceil((Date.now() - new Date(last).getTime()) / 86_400_000) + 1)) : 30;
      const today = LA.localDay(new Date(), this.p.timeZone);
      const provider = metered(await this.modelForJob("lifeadmin"), "proactive", this.db, this.p.timeZone, "Life admin inbox scan");
      const found = await LA.scanInbox({
        provider,
        connectors: this.connectors,
        userName: this.userName,
        timeZone: this.p.timeZone,
        days,
        known: LA.describeForModel(LA.listItems(this.db), today),
      });
      const r = LA.saveItems(this.db, found);
      setSetting(this.db, "lifeAdminAt", new Date().toISOString());
      AC.logActivity(this.db, {
        kind: "life_admin",
        title: "Went through your mail",
        summary: r.added || r.updated ? `Found ${r.added} new${r.updated ? `, updated ${r.updated}` : ""}` : "Nothing new",
        status: r.added || r.updated ? "done" : "quiet",
        detail: `Looked at the last ${days} day${days === 1 ? "" : "s"} of mail for bills, subscriptions, packages, trips and return windows.${
          found.length ? `\n\n${found.map((i) => `- ${i!.kind}: ${i!.who}${i!.title && i!.title !== i!.who ? `, ${i!.title}` : ""}`).join("\n")}` : ""
        }`,
        startedAt,
      });
      LA.tidyItems(this.db, today);
      await this.db.flush();
      return r;
    } catch (e) {
      AC.logActivity(this.db, { kind: "life_admin", title: "Went through your mail", summary: "Couldn't finish", status: "failed", detail: (e as Error).message, startedAt });
      void this.db.flush();
      throw e;
    } finally {
      this.scanning = false;
      this.listeners.forEach((l) => l({ type: "admin" }));
    }
  },

  tickLifeAdmin(now = new Date()): void {
    if (!this.lifeAdminOn) return;
    const today = LA.localDay(now, this.p.timeZone);
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    LA.tidyItems(this.db, today);
    // from 9:00, the time the phone's own scheduled heads-up goes off (so it's said once)
    if (local >= "09:00" && local < "21:00" && !inQuietHours(local, this.proactive)) {
      const n = LA.dueNotices(this.db, today);
      if (n) {
        addMessage(this.db, "assistant", n.text, { lifeAdmin: { ids: n.ids } }, null);
        // the phone showed its scheduled notification at 9:00; a computer says it now
        const since = this.db.get<{ at: string | null }>(`SELECT MAX(created_at) AS at FROM admin_items WHERE id IN (${n.ids.map(() => "?").join(",")})`, n.ids)?.at ?? undefined;
        this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Life admin", body: n.text.split("\n")[0].slice(0, 160), scheduled: true, since } }));
        void this.db.flush();
      }
    }
    if (!this.gmailOn || this.scanning || this.busy) return;
    if (!this.p.provider && this.choice().provider === "fake") return;
    if (local < "06:00" || local >= "22:00") return;
    const last = getSetting(this.db, "lifeAdminAt");
    const tried = getSetting(this.db, "lifeAdminTriedAt");
    if (last && now.getTime() - new Date(last).getTime() < 20 * 3600_000) return;
    if (tried && now.getTime() - new Date(tried).getTime() < 3 * 3600_000) return;
    setSetting(this.db, "lifeAdminTriedAt", now.toISOString());
    void this.scanLifeAdmin().catch((e) => console.error("[lyra] life admin scan failed", e));
  },
});
