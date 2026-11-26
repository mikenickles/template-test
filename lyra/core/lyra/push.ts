/** Push to the phone from the home base. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as A from "../actions.ts";
import * as D from "../docs.ts";
import * as S from "../skills.ts";
import * as PU from "../push.ts";
import * as SC from "../scan.ts";
import { getSetting, setSetting, updateMessageMeta } from "../db.ts";
import * as T from "../tasks.ts";
import * as R from "../routines.ts";
import { part } from "./part.ts";

export const push = part({
  pushDevices(): Record<string, PU.PushDevice> {
    try {
      return JSON.parse(getSetting(this.db, "push.devices") ?? "{}") as Record<string, PU.PushDevice>;
    } catch {
      return {};
    }
  },

  /** The app's push settings (synced), for a phone to sign up with. */
  pushConfig(): PU.PushConfig | null {
    try {
      return JSON.parse(getSetting(this.db, "push.config") ?? "null") as PU.PushConfig | null;
    } catch {
      return null;
    }
  },

  /** Set up: which phones have signed up, and whether this device holds the key to send. */
  async pushStatus(): Promise<{ configured: boolean; canSend: boolean; devices: { id: string; name: string; at: string }[] }> {
    return {
      configured: !!this.pushConfig(),
      canSend: !!this.pushConfig() && !!(await this.p.secrets.get("push.account")),
      devices: Object.entries(this.pushDevices()).map(([id, d]) => ({ id, name: d.name, at: d.at })),
    };
  },

  /** On the home base: the two files from your Firebase project. The sending key stays on this device. */
  async setupPush(googleServices: string, serviceAccount: string): Promise<void> {
    const cfg = PU.parseGoogleServices(googleServices, "app.lyra.chief");
    const account = PU.parseServiceAccount(serviceAccount);
    if (account.projectId !== cfg.projectId) throw new Error("Those two files are from different Firebase projects.");
    // a signature made now proves the key is usable before anything is saved
    await PU.signedAssertion(account).catch(() => {
      throw new Error("That service account key can't be read. Generate a new one in Firebase.");
    });
    await this.p.secrets.set("push.account", JSON.stringify(account));
    if (this.pushConfig()?.projectId !== cfg.projectId) setSetting(this.db, "push.devices", "{}");
    setSetting(this.db, "push.config", JSON.stringify(cfg));
    this.pushSender = undefined;
    await this.db.flush();
  },

  async forgetPush(): Promise<void> {
    await this.p.secrets.remove("push.account");
    this.db.run("DELETE FROM settings WHERE key IN ('push.config', 'push.devices')");
    this.pushSender = undefined;
    await this.db.flush();
  },

  /** A phone that signed up for push: its address, for the home base to send to. */
  async registerPushDevice(deviceId: string, name: string, token: string): Promise<boolean> {
    const all = this.pushDevices();
    if (all[deviceId]?.token === token && all[deviceId]?.name === name) return false;
    all[deviceId] = { name: name.slice(0, 40), token, at: new Date().toISOString() };
    setSetting(this.db, "push.devices", JSON.stringify(all));
    await this.db.flush();
    return true;
  },

  /**
   * The newest post in that chat reached a phone by push, so a phone that loads it later doesn't
   * announce it a second time.
   */
  markPushed(channelId: number | null): void {
    const m = this.db.get<{ id: number; meta: string }>(
      channelId === null
        ? "SELECT id, meta FROM messages WHERE role = 'assistant' AND channel_id IS NULL ORDER BY id DESC LIMIT 1"
        : "SELECT id, meta FROM messages WHERE role = 'assistant' AND channel_id = ? ORDER BY id DESC LIMIT 1",
      channelId === null ? [] : [channelId],
    );
    if (!m) return;
    updateMessageMeta(this.db, m.id, { ...(JSON.parse(m.meta || "{}") as import("../db.ts").MessageMeta), pushed: true });
    void this.db.flush();
  },

  /** Ring every signed-up phone. Returns how many it reached. Does nothing without the sending key. */
  async push(title: string, body: string, hash = "#/", options: string[] = []): Promise<number> {
    const devices = this.pushDevices();
    if (!Object.keys(devices).length || !this.pushConfig()) return 0;
    if (!this.pushSender) {
      const raw = await this.p.secrets.get("push.account");
      if (!raw) return 0;
      this.pushSender = new PU.PushSender(JSON.parse(raw) as PU.PushAccount, this.fetch);
    }
    let sent = 0;
    let gone = false;
    for (const [id, d] of Object.entries(devices)) {
      const r = await this.pushSender.send(d.token, { title, body, hash, options }).catch(() => "failed" as const);
      if (r === "sent") sent++;
      if (r === "gone") {
        delete devices[id];
        gone = true;
      }
    }
    if (gone) {
      setSetting(this.db, "push.devices", JSON.stringify(devices));
      void this.db.flush();
    }
    return sent;
  },

  /**
   * What Lyra posted unasked after that message: routine news, heads-ups, check-ins.
   * For a device that just loaded the home base's data, to tell the user what's new.
   * (Reminders and life admin are scheduled on the phone itself, so they aren't here.)
   */
  ownPostsSince(id: number): { id: number; channelId: number | null; title: string; body: string }[] {
    return this.db
      .all<{ id: number; channel_id: number | null; content: string; meta: string }>(
        `SELECT id, channel_id, content, meta FROM messages WHERE id > ? AND role = 'assistant' AND json_extract(meta, '$.pushed') IS NULL
           AND (json_extract(meta, '$.routine') IS NOT NULL OR json_extract(meta, '$.headsUp') IS NOT NULL OR json_extract(meta, '$.checkIn') IS NOT NULL
                OR json_extract(meta, '$.reminder.kind') = 'follow_up' OR json_extract(meta, '$.worker') IS NOT NULL)
         ORDER BY id`,
        [id],
      )
      .map((m) => {
        const meta = JSON.parse(m.meta || "{}") as import("../db.ts").MessageMeta;
        return {
          id: m.id,
          channelId: m.channel_id,
          title: meta.routine?.name ?? (meta.headsUp ? "Heads-up from Tomo" : meta.reminder ? "Tomo followed up" : "Tomo"),
          body: m.content.trim().split("\n")[0].replace(/[*`#>]/g, "").slice(0, 160),
        };
      });
  },
});
