/** Routines and what starts them. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { parsePick } from "../jobs.ts";
import { describeNotices, filterNotices } from "../connectors/phone/server.ts";
import * as A from "../actions.ts";
import * as S from "../skills.ts";
import * as MW from "../mailwatch.ts";
import * as PL from "../places.ts";
import { getSetting, setSetting } from "../db.ts";
import { listModels } from "../providers/models.ts";
import * as R from "../routines.ts";
import { MAIL_WATCH_EVERY } from "./shared.ts";
import { part } from "./part.ts";

export const routines = part({
  // ---------- routines ----------

  routines(): (R.RoutineRow & { schedule: string; running: boolean })[] {
    return R.listRoutines(this.db).map((r) => ({ ...r, schedule: R.describeWhen(r), running: this.routinesRunner.isRunning(r.id) }));
  },

  routine(id: number): { routine: R.RoutineRow & { schedule: string; running: boolean }; runs: R.RoutineRun[] } {
    const r = this.routines().find((x) => x.id === id);
    if (!r) throw new Error("That routine no longer exists.");
    return { routine: r, runs: R.routineRuns(this.db, id) };
  },

  routinePresets(): (R.RoutineInput & { key: string; blurb: string; added: boolean })[] {
    const have = new Set(R.listRoutines(this.db).map((r) => r.name.toLowerCase()));
    return R.PRESETS.map((p) => ({ ...p, added: have.has(p.name.toLowerCase()) }));
  },

  /** A trigger has to be something this setup can notice: a saved place, mail that's connected. */
  checkTriggerFits(input: Partial<R.RoutineInput>): void {
    const t = input.trigger === undefined ? null : R.checkTrigger(input.trigger);
    if (!t) return;
    if (t.kind === "mail" && !this.gmailOn) throw new Error("Connect Mail first (on the Tomo page), so Tomo can see when that email arrives.");
    if (t.kind === "place") {
      const p = PL.matchPlace(this.places(), t.place);
      if (!p) throw new Error(`"${t.place}" isn't a saved place yet. Save it on the phone: Settings, Notifications, Places and travel, "Save where I am now".`);
      (input.trigger as { place: string }).place = p.name;
    }
  },

  /** (0.67) a routine's model from what the user (or Tomo) wrote: "default", "provider:model", or a name like "haiku" */
  async routineModel(text: string): Promise<string> {
    const s = text.trim();
    if (!s || /^(default|auto)$/i.test(s)) return "";
    const pick = parsePick(s);
    if (pick) {
      if (!this.keys[pick.provider as "anthropic" | "openai" | "gemini"]) throw new Error(`There's no ${pick.provider} key saved, so that model can't be used.`);
      return `${pick.provider}:${pick.model}`;
    }
    const want = s.toLowerCase().replace(/^claude\s+/, "").replace(/\s+/g, "-");
    const found: { provider: string; id: string; label: string }[] = [];
    for (const prov of ["anthropic", "openai", "gemini"] as const) {
      if (!this.keys[prov]) continue;
      const list = await listModels(this.keys, prov, this.fetch).catch(() => []);
      for (const m of list) if (m.id.toLowerCase().includes(want) || m.label.toLowerCase().replace(/\s+/g, "-").includes(want)) found.push({ provider: prov, id: m.id, label: m.label });
    }
    if (!found.length) throw new Error(`No model called "${s}" with the keys saved. Models are listed in Settings › AI model.`);
    // the plain current one over dated or preview ids
    const best = found.find((m) => !/preview|exp|latest|\d{8}/i.test(m.id)) ?? found[0];
    return `${best.provider}:${best.id}`;
  },

  async createRoutine(input: R.RoutineInput): Promise<R.RoutineRow> {
    this.checkTriggerFits(input);
    if (input.model) input = { ...input, model: await this.routineModel(input.model) };
    const r = R.createRoutine(this.db, input);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: r.id }));
    return r;
  },

  async addPreset(key: string): Promise<R.RoutineRow> {
    const p = R.PRESETS.find((x) => x.key === key);
    if (!p) throw new Error("Unknown routine.");
    return this.createRoutine(p);
  },

  async updateRoutine(id: number, input: Partial<R.RoutineInput>): Promise<R.RoutineRow> {
    this.checkTriggerFits(input);
    if (input.model !== undefined) input = { ...input, model: await this.routineModel(input.model) };
    const r = R.updateRoutine(this.db, id, input);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: id }));
    return r;
  },

  async deleteRoutine(id: number): Promise<void> {
    R.deleteRoutine(this.db, id);
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "routine", routineId: id }));
  },

  runRoutine(id: number): void {
    this.routinesRunner.runNow(id);
  },

  // ---------- triggers (0.48): routines that start when something happens ----------

  triggered(kind: R.Trigger["kind"]): { r: R.RoutineRow; t: R.Trigger }[] {
    return R.listRoutines(this.db)
      .filter((r) => r.enabled)
      .map((r) => ({ r, t: R.triggerOf(r) }))
      .filter((x): x is { r: R.RoutineRow; t: R.Trigger } => x.t?.kind === kind);
  },

  /**
   * Mail triggers: every few minutes, one plain Gmail search per routine (no AI). The first look
   * only notes what's already there; after that, new mail that matches starts the routine.
   */
  tickTriggers(now = new Date()): boolean {
    const mail = this.triggered("mail");
    if (!mail.length || !this.gmailOn || this.checkingTriggers) return false;
    const last = getSetting(this.db, "triggersAt");
    if (last && now.getTime() - new Date(last).getTime() < MAIL_WATCH_EVERY) return false;
    setSetting(this.db, "triggersAt", now.toISOString());
    this.checkingTriggers = true;
    void (async () => {
      for (const { r, t } of mail) {
        const res = await this.connectors.call("gmail__search_mail", { query: R.mailTriggerQuery(t as Extract<R.Trigger, { kind: "mail" }>), max_results: 10 });
        if (res.isError) continue;
        const key = `trigger.seen.${r.id}`;
        const before = getSetting(this.db, key);
        let seen: string[] = [];
        try {
          seen = JSON.parse(before ?? "[]") as string[];
        } catch {
          seen = [];
        }
        const f = MW.fresh(MW.parseMailList(res.content), seen);
        if (JSON.stringify(f.seen) !== JSON.stringify(seen) || before === undefined) setSetting(this.db, key, JSON.stringify(f.seen));
        if (before === undefined || !f.fresh.length) continue;
        this.routinesRunner.runNow(
          r.id,
          `New email${f.fresh.length > 1 ? "s" : ""} just arrived:\n${f.fresh.map((m) => `- from ${m.from || "(unknown)"}, subject "${m.subject || "(none)"}" (thread ${m.thread}; read it with read_thread)`).join("\n")}`,
        );
      }
    })()
      .catch((e) => console.error("[lyra] triggers", e))
      .finally(() => (this.checkingTriggers = false));
    return true;
  },

  /**
   * Notification triggers, on the phone that reads them: any new notification since the last
   * look that mentions the words starts the routine. Returns how many routines started.
   */
  async tickNoticeTriggers(since: number): Promise<number> {
    const list = this.triggered("notice");
    if (!list.length || !since || !this.p.notices || getSetting(this.db, "notices") !== "on") return 0;
    const at = since;
    const recent = await this.p.notices.recent(at).catch(() => []);
    let started = 0;
    for (const { r, t } of list) {
      const hits = filterNotices(recent, { search: (t as Extract<R.Trigger, { kind: "notice" }>).match });
      if (!hits.length) continue;
      this.routinesRunner.runNow(r.id, `New on the phone just now:\n${describeNotices(hits.slice(0, 8), this.p.timeZone)}`);
      started++;
    }
    return started;
  },

  /** Called every minute while the app is open, and when it opens: runs anything due. */
  tickRoutines(now = new Date()): number[] {
    const started = this.routinesRunner.tick(now);
    this.tickReminders(now);
    this.tickMailWatch(now);
    this.tickTriggers(now);
    this.tickLifeAdmin(now);
    this.tickBirthdays(now);
    if (!this.tickHeadsUp(now) && !this.tickCheckIn(now) && !this.tickTidy(now)) this.tickStyle(now);
    return started;
  },
});
