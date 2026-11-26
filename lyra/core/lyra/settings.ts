/** The app's state and settings, and Tomo's own summary of its setup. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as S from "../skills.ts";
import * as ST from "../style.ts";
import { getSetting, setSetting } from "../db.ts";
import { LIVE_VOICES } from "../live.ts";
import { DEFAULT_MODELS, listProviders, type Keys } from "../providers/index.ts";
import * as T from "../tasks.ts";
import * as R from "../routines.ts";
import { type AppState, PROACTIVE_LEVELS, type Proactive, PROACTIVE_DEFAULT, HHMM, type WeatherPlace, ACCENTS, type Accent, ACCENT_NAMES, OLD_ACCENTS, BUBBLES, type Bubbles, THEMES, type Theme, THEME_NAMES, OLD_THEMES, type SettingsPatch, SECRET_KEYS } from "./shared.ts";
import { part } from "./part.ts";

export const settings = part({
  state(): AppState {
    return {
      name: "Tomo",
      userName: this.userName,
      choice: this.choice(),
      providers: listProviders(this.keys),
      connectors: this.connectors.status(),
      keys: {
        anthropic: !!this.keys.anthropic,
        openai: !!this.keys.openai,
        gemini: !!this.keys.gemini,
        openaiBaseUrl: this.keys.openaiBaseUrl ?? "",
      },
      webSearch: this.webSearch,
      accent: this.accent,
      bubbles: this.bubbles,
      theme: this.theme,
      notifications: getSetting(this.db, "notifications") !== "off",
      mirror: ST.mirrorOn(this.db),
      appLock: getSetting(this.db, "appLock") === "on",
      weatherPlace: this.weatherPlace,
      liveVoice: this.liveVoice,
      backgroundModel: getSetting(this.db, "backgroundModel") || "auto",
      proactive: this.proactive,
      actions: (({ email, event, archive, file, text }) => ({ email, event, archive, file, text: this.p.sms ? text : null }))(this.actionsAllowed()),
      contacts: this.p.contacts?.available ? this.contactsOn : null,
      notices: this.p.notices ? getSetting(this.db, "notices") === "on" : null,
      browser: this.p.browser ? getSetting(this.db, "browser") === "on" : null,
    };
  },

  get proactive(): Proactive {
    try {
      const p = { ...PROACTIVE_DEFAULT, ...(JSON.parse(getSetting(this.db, "proactive") || "{}") as Partial<Proactive>) };
      return (PROACTIVE_LEVELS as readonly string[]).includes(p.level) && HHMM.test(p.quietStart) && HHMM.test(p.quietEnd) ? { ...p, checkIns: p.checkIns !== false, mailWatch: p.mailWatch !== false } : PROACTIVE_DEFAULT;
    } catch {
      return PROACTIVE_DEFAULT;
    }
  },

  get weatherPlace(): WeatherPlace | null {
    try {
      const raw = getSetting(this.db, "weatherPlace");
      return raw ? (JSON.parse(raw) as WeatherPlace) : null;
    } catch {
      return null;
    }
  },

  get bubbles(): Bubbles {
    const b = getSetting(this.db, "bubbles");
    return (BUBBLES as readonly string[]).includes(b ?? "") ? (b as Bubbles) : "softer";
  },

  get theme(): Theme {
    const t = getSetting(this.db, "theme");
    return (THEMES as readonly string[]).includes(t ?? "") ? (t as Theme) : (OLD_THEMES[t ?? ""] ?? "paper");
  },

  get accent(): Accent {
    const a = getSetting(this.db, "accent");
    return (ACCENTS as readonly string[]).includes(a ?? "") ? (a as Accent) : (OLD_ACCENTS[a ?? ""] ?? "orange");
  },

  async saveSettings(patch: SettingsPatch): Promise<AppState> {
    if (patch.userName !== undefined) setSetting(this.db, "userName", patch.userName.trim().slice(0, 40));
    if (patch.webSearch !== undefined) setSetting(this.db, "webSearch", patch.webSearch ? "on" : "off");
    if (patch.appLock !== undefined) setSetting(this.db, "appLock", patch.appLock ? "on" : "off");
    if (patch.backgroundModel !== undefined) {
      const v = patch.backgroundModel.trim();
      if (!/^(auto|same|[\w.:/-]{1,100})$/.test(v)) throw new Error("That model name looks wrong.");
      setSetting(this.db, "backgroundModel", v);
    }
    if (patch.liveVoice !== undefined) {
      if (!(LIVE_VOICES as readonly string[]).includes(patch.liveVoice)) throw new Error("That voice isn't one of the choices.");
      setSetting(this.db, "liveVoice", patch.liveVoice);
    }
    if (patch.weatherPlace !== undefined) {
      const w = patch.weatherPlace;
      if (w && !(w.name?.trim() && Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && Math.abs(w.latitude) <= 90 && Math.abs(w.longitude) <= 180))
        throw new Error("That place doesn't look right.");
      setSetting(this.db, "weatherPlace", w ? JSON.stringify({ name: w.name.trim().slice(0, 80), latitude: w.latitude, longitude: w.longitude }) : "");
    }
    if (patch.notifications !== undefined) setSetting(this.db, "notifications", patch.notifications ? "on" : "off");
    if (patch.mirror !== undefined) setSetting(this.db, "mirror", patch.mirror ? "on" : "off");
    if (patch.proactive !== undefined) {
      const p = { ...this.proactive, ...patch.proactive };
      if (!(PROACTIVE_LEVELS as readonly string[]).includes(p.level)) throw new Error("That heads-up level isn't one of the choices.");
      if (!HHMM.test(p.quietStart) || !HHMM.test(p.quietEnd)) throw new Error("Quiet hours need times like 21:00.");
      const was = this.proactive.level;
      setSetting(this.db, "proactive", JSON.stringify({ level: p.level, quietStart: p.quietStart, quietEnd: p.quietEnd, checkIns: p.checkIns !== false, mailWatch: p.mailWatch !== false }));
      // turning it on (or up) starts the clock now, so the first check isn't instant
      if (p.level !== "off" && p.level !== was) setSetting(this.db, "headsUpAt", new Date().toISOString());
    }
    if (patch.accent !== undefined) {
      if (!(ACCENTS as readonly string[]).includes(patch.accent)) throw new Error("That color isn't one of the choices.");
      setSetting(this.db, "accent", patch.accent);
    }
    if (patch.theme !== undefined) {
      if (!(THEMES as readonly string[]).includes(patch.theme)) throw new Error("That look isn't one of the choices.");
      setSetting(this.db, "theme", patch.theme);
    }
    if (patch.bubbles !== undefined) {
      if (!(BUBBLES as readonly string[]).includes(patch.bubbles)) throw new Error("That style isn't one of the choices.");
      setSetting(this.db, "bubbles", patch.bubbles);
    }
    for (const k of SECRET_KEYS) {
      const v = patch.keys?.[k];
      if (v === undefined) continue;
      if (v === null || !v.trim()) {
        await this.p.secrets.remove(`key.${k}`);
        this.keys[k] = undefined;
      } else {
        await this.p.secrets.set(`key.${k}`, v.trim());
        this.keys[k] = v.trim();
      }
    }
    if (patch.openaiBaseUrl !== undefined) {
      const url = patch.openaiBaseUrl.trim();
      if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error("That server address should start with http:// or https://.");
      setSetting(this.db, "openaiBaseUrl", url);
      this.keys.openaiBaseUrl = url || undefined;
    }
    if (patch.provider !== undefined) {
      const info = listProviders(this.keys).find((p) => p.id === patch.provider);
      if (!info) throw new Error("Unknown provider.");
      if (!info.ready) throw new Error(info.hint ?? "That provider isn't set up.");
      const model = patch.model?.trim() || DEFAULT_MODELS[info.id];
      if (!/^[\w.:/-]{1,100}$/.test(model)) throw new Error("That model name looks wrong.");
      setSetting(this.db, "provider", JSON.stringify({ provider: info.id, model }));
    }
    await this.db.flush();
    return this.state();
  },

  /**
   * (0.63.3) Tomo's own setup, in plain lines, so it can answer questions about itself and say
   * where each thing is changed: models, connections, switches, heads-ups, and this device.
   */
  async setupSummary(): Promise<string> {
    const s = this.state();
    const on = (b: boolean | null | undefined) => (b ? "on" : "off");
    const main = s.choice;
    const prov = s.providers.find((p) => p.id === main.provider)?.label ?? main.provider;
    let quick = "";
    try {
      const q = await this.quickChoice();
      const set = s.backgroundModel || "auto";
      quick = set === "same" ? "the same model as chat" : `${q.model}${set === "auto" ? " (picked automatically to pair with the main model)" : " (picked by the user)"}`;
    } catch {
      quick = s.backgroundModel;
    }
    const conns = s.connectors.map((c) => `${c.label}: ${c.state === "connected" ? `connected${c.account ? ` (${c.account})` : ""}` : c.state === "unavailable" ? "not available on this device" : c.state === "error" ? "needs reconnecting" : "not connected"}`);
    const p = s.proactive;
    const device = (await this.deviceFacts?.().catch(() => [] as string[])) ?? [];
    return [
      `- AI model for chat, tasks, voice and dashboards: ${main.provider === "fake" ? "the practice model (no real AI yet; an API key is needed)" : `${main.model} from ${prov}`}. Changed in Settings › AI model.`,
      `- Background model setting: ${main.provider === "fake" ? "the practice model" : quick}. Who does what (job id: model; change with set_job_model when ${s.userName} asks, or Settings › AI model › Who does what): ${(await this.jobModels().catch(() => [])).map((j) => `${j.id} (${j.label}): ${j.model}${j.pick !== "auto" && j.pick !== "main" ? " (picked)" : ""}`).join("; ")}.`,
      `- Routines on their own model (set per routine in its editor, or with update_routine's model when ${s.userName} asks; the rest follow the routine jobs above): ${R.listRoutines(this.db).filter((r) => r.model).map((r) => `${r.name}: ${r.model.slice(r.model.indexOf(":") + 1)}`).join("; ") || "none"}.`,
      `- Web search: ${on(s.webSearch)} (Settings › AI model). Keys saved for: ${(["anthropic", "openai", "gemini"] as const).filter((k) => s.keys[k]).join(", ") || "none"}.`,
      `- Connections (the Tomo page, opened by tapping Tomo's face): ${conns.join("; ")}.`,
      `- Approval switches on the Tomo page (each action still waits for a tap on its card): write emails ${on(s.actions.email)}, add/change events ${on(s.actions.event)}, organize mail ${on(s.actions.archive)}, change Drive files ${on(s.actions.file)}${s.actions.text !== null ? `, texts ${on(s.actions.text)}` : ""}${s.browser !== null ? `, use the browser ${on(s.browser)}` : ""}${s.contacts !== null ? `, phone contacts ${on(s.contacts)}` : ""}${s.notices !== null ? `, phone notifications ${on(s.notices)}` : ""}.`,
      `- Heads-ups: ${p.level}${p.level !== "off" ? ` (every ${p.level === "active" ? "hour" : "4 hours"})` : ""}, quiet hours ${p.quietStart}–${p.quietEnd}, check-ins ${on(p.checkIns)}, mail watch ${on(p.mailWatch)}. Settings › Notifications. Phone notifications ${on(s.notifications)}.`,
      `- Life admin inbox scans ${on(this.lifeAdminOn)}, weekly memory tidy-up ${on(this.tidyOn)}, talk like ${s.userName} ${on(s.mirror)} (Settings › You).`,
      `- Look: ${THEME_NAMES[s.theme]} look (choices: ${THEMES.map((t) => THEME_NAMES[t]).join(", ")}), ${ACCENT_NAMES[s.accent]} accent (choices: ${ACCENTS.map((a) => ACCENT_NAMES[a]).join(", ")}), ${s.bubbles} message bubbles; app lock ${on(s.appLock)}; weather for ${s.weatherPlace?.name ?? "no place set"}; live voice "${s.liveVoice}".`,
      ...device.map((d) => `- ${d}`),
      `- The app: Tomo${this.p.version ? ` ${this.p.version}` : ""}, Android phone app and Windows app; updates come from the "Lyra Updates" folder in ${s.userName}'s Drive (Settings › About).`,
    ].join("\n");
  },
});
