/** Learning how the user talks, and the weekly memory tidy-up. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as S from "../skills.ts";
import * as ST from "../style.ts";
import * as AC from "../activity.ts";
import { runTidy } from "../tidy.ts";
import { getMessage, getSetting, addMessage, setSetting, updateMessageMeta } from "../db.ts";
import { metered } from "../usage.ts";
import * as T from "../tasks.ts";
import { inQuietHours } from "./shared.ts";
import { part } from "./part.ts";

export const learning = part({
  /** What Lyra has noticed about how the user talks, and whether Lyra mirrors it. */
  talkStyle(): { on: boolean; notes: string[]; updatedAt: string | null; newMessages: number } {
    const s = ST.readStyle(this.db);
    return { on: ST.mirrorOn(this.db), notes: s?.notes ?? [], updatedAt: s?.updatedAt ?? null, newMessages: ST.newSince(this.db, s?.updatedAt) };
  },

  /**
   * Relearn how the user talks every few days once they've sent enough new messages,
   * while they're not mid-conversation. Only their own messages are read.
   */
  tickStyle(now = new Date()): boolean {
    if (!ST.mirrorOn(this.db) || this.learningStyle || this.busy) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    const s = ST.readStyle(this.db);
    // three ratings since last time count for more than chat alone: relearn after a day, not three
    const rated = ST.ratedSince(this.db, s?.updatedAt) >= 3;
    if (s && now.getTime() - new Date(s.updatedAt).getTime() < (rated ? 1 : 3) * 86_400_000) return false;
    const tried = getSetting(this.db, "styleTriedAt");
    if (tried && now.getTime() - new Date(tried).getTime() < 86_400_000) return false;
    if (!rated && ST.newSince(this.db, s?.updatedAt) < ST.STYLE_MIN_NEW) return false;
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 15 * 60_000) return false;
    setSetting(this.db, "styleTriedAt", now.toISOString());
    void this.learnStyleNow().catch((e) => console.error("[lyra] learning how you talk failed", e));
    return true;
  },

  /** Learn now (also the Settings button). Throws when there isn't enough to go on. */
  async learnStyleNow(): Promise<{ on: boolean; notes: string[]; updatedAt: string | null; newMessages: number }> {
    if (this.learningStyle) throw new Error("Already on it.");
    this.learningStyle = true;
    try {
      const samples = ST.styleSamples(this.db);
      const rated = ST.ratedReplies(this.db);
      if (samples.length < 10 && rated.length < 3) throw new Error("Tomo needs a few more of your messages to go on. Keep chatting!");
      const provider = metered(await this.modelForJob("style"), "proactive", this.db, this.p.timeZone, "Learning how you talk");
      const notes = await ST.learnStyle(provider, samples, ST.readStyle(this.db)?.notes ?? [], this.userName, rated);
      if (!notes) throw new Error("Not enough to go on yet. Keep chatting and Tomo will pick it up.");
      ST.saveStyle(this.db, notes, samples.length);
      AC.logActivity(this.db, { kind: "style", title: "Noticed how you talk", summary: notes[0] ?? "", status: "done", detail: notes.map((n) => `- ${n}`).join("\n") });
      await this.db.flush();
      return this.talkStyle();
    } finally {
      this.learningStyle = false;
    }
  },

  async forgetStyle(): Promise<{ on: boolean; notes: string[]; updatedAt: string | null; newMessages: number }> {
    ST.clearStyle(this.db);
    await this.db.flush();
    return this.talkStyle();
  },

  get tidyOn(): boolean {
    return getSetting(this.db, "tidy") !== "off";
  },

  /** Once a week, in the daytime, when there's enough saved to be worth it and the user isn't mid-conversation. */
  tickTidy(now = new Date()): boolean {
    if (!this.tidyOn || this.tidying || this.busy) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (local < "09:00" || local >= "20:00" || inQuietHours(local, this.proactive)) return false;
    const lastAt = getSetting(this.db, "tidyAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < 7 * 86_400_000) return false;
    if (this.memory.count() < 12) return false;
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 3600_000) return false;
    setSetting(this.db, "tidyAt", now.toISOString());
    void this.tidyNow().catch((e) => console.error("[lyra] tidy-up failed", e));
    return true;
  },

  /** Tidy now (also the Memory page's button). Posts what changed, or says it's already tidy. */
  async tidyNow(): Promise<{ changed: boolean; changes: string[] }> {
    if (this.tidying) throw new Error("Already tidying.");
    this.tidying = true;
    try {
      const provider = metered(await this.modelForJob("tidy"), "proactive", this.db, this.p.timeZone, "Memory tidy-up");
      const before = this.memory.read();
      const today = new Date().toLocaleDateString("en-US", { timeZone: this.p.timeZone, dateStyle: "full" });
      const r = await runTidy(provider, before, this.memory.sections, this.userName, today);
      if (!r || r.content === before) return { changed: false, changes: [] };
      // the notebook may have changed while the model was thinking: don't overwrite that
      if (this.memory.read() !== before) return { changed: false, changes: [] };
      const snapshotId = await this.memory.tidy(r.content);
      addMessage(this.db, "assistant", `I tidied up my notes about you:\n${r.changes.map((c) => `- ${c}`).join("\n")}`, { tidy: { snapshotId } }, null);
      this.listeners.forEach((l) => l({ type: "message", channelId: null }));
      await this.db.flush();
      return { changed: true, changes: r.changes };
    } finally {
      this.tidying = false;
    }
  },

  /** Put the notebook back the way it was before that tidy-up. */
  async undoTidy(messageId: number): Promise<void> {
    const m = getMessage(this.db, messageId);
    if (!m?.meta.tidy || m.meta.tidy.undone) throw new Error("Nothing to undo there.");
    await this.memory.restore(m.meta.tidy.snapshotId);
    updateMessageMeta(this.db, messageId, { ...m.meta, tidy: { ...m.meta.tidy, undone: true } });
    this.listeners.forEach((l) => l({ type: "message", channelId: null }));
    await this.db.flush();
  },

  async setTidy(on: boolean): Promise<void> {
    setSetting(this.db, "tidy", on ? "on" : "off");
    await this.db.flush();
  },
});
