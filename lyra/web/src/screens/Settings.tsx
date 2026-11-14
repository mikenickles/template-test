import { useCallback, useRef, useState, type ReactNode } from "react";
import { api, isNative, syncApi, type AppState, type SyncStatus } from "../api";
import { Search, Bell, Chart, Check, Chevron, Cloud, Cpu, Plug, Refresh, User } from "../icons";
import { compact, dayKey } from "../usageData";
import { Usage } from "./Usage";
import { useSlidingPill } from "../pill";
import { haptic, hapticsOn, setHaptics } from "../haptics";
import { setSounds, sound, soundsOn } from "../sounds";
import { appLock, background, installer, isDesktop, notifier, thisDevice, type BackgroundState } from "../platform";
import { BackupSection } from "./Backup";
import { ModelSettings } from "./ModelSettings";
import { GoogleSetupSection, SyncSection } from "./SyncSection";
import { UpdatesSection } from "./UpdatesSection";
import { WeatherSection } from "./WeatherSection";
import { PlacesSection } from "./PlacesSection";
import { useEffect } from "react";
import { ask } from "../ask";

export type SettingsSection = "model" | "usage" | "you" | "alerts" | "sync" | "about";
export const SETTINGS_SECTIONS: SettingsSection[] = ["model", "usage", "you", "alerts", "sync", "about"];

const BUBBLE_CHOICES: { id: AppState["bubbles"]; label: string; about: string }[] = [
  { id: "softer", label: "Softer", about: "Charcoal, or soft white in dark mode" },
  { id: "accent", label: "Accent", about: "A tint of your accent color" },
  { id: "neutral", label: "Soft neutral", about: "A quiet grey" },
  { id: "classic", label: "Classic", about: "Solid black, or white in dark mode" },
];

/** The whole look, as a mood. Each card previews itself. */
const THEME_CHOICES: { id: AppState["theme"]; label: string; about: string }[] = [
  { id: "paper", label: "Paper", about: "Warm paper and ink. The original." },
  { id: "zine", label: "Zine", about: "Photocopied: ink edges, hard shadows, grain." },
  { id: "radio", label: "Night Radio", about: "Always dark, with a warm glow." },
  { id: "film", label: "Film", about: "Faded and soft, with a little grain." },
];

/** Every setting by name, with a few other words people might type, and where it lives. */
const FINDER: { label: string; more: string; where: string; href: string; phone?: boolean }[] = [
  { label: "AI model and API keys", more: "claude openai gemini gpt key provider brain practice", where: "AI model", href: "#/settings/model" },
  { label: "Web search", more: "internet browse look up online", where: "AI model", href: "#/settings/model" },
  { label: "Live voice", more: "talk call speak voice mode", where: "AI model", href: "#/settings/model" },
  { label: "Usage", more: "tokens cost spend money how much", where: "Usage", href: "#/settings/usage" },
  { label: "Your name", more: "call me who", where: "You and appearance", href: "#/settings/you" },
  { label: "Look", more: "theme zine night radio film paper dark mode style grain", where: "You and appearance", href: "#/settings/you" },
  { label: "Accent color", more: "colour lime orange theme", where: "You and appearance", href: "#/settings/you" },
  { label: "Your messages", more: "bubble bubbles chat style", where: "You and appearance", href: "#/settings/you" },
  { label: "Talk like me", more: "mirror slang how lyra talks style tone", where: "You and appearance", href: "#/settings/you" },
  { label: "Weather", more: "city place forecast temperature", where: "You and appearance", href: "#/settings/you" },
  { label: "Sounds", more: "audio noise chime bell mute", where: "You and appearance", href: "#/settings/you" },
  { label: "Haptics", more: "vibrate vibration buzz tap feel", where: "You and appearance", href: "#/settings/you", phone: true },
  { label: "Notifications", more: "notify alerts push checkup test permission", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Heads-ups", more: "proactive off light active speak first", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Quiet hours", more: "night sleep do not disturb overnight", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Check-ins", more: "check in when it's quiet ask", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Mail watch", more: "email new mail important people", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Keep watch", more: "background battery closed tray always on", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Places and location", more: "geofence place reminders saved places home work gps", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "Tell me when to leave", more: "leave now travel directions maps drive", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "App lock", more: "fingerprint face pin biometric privacy security", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "Sync between devices", more: "phone computer drive passphrase", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Home base", more: "always on computer laptop push firebase ring my phone", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Back up and restore", more: "backup export import move new phone file", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Updates", more: "version new release install", where: "Updates", href: "#/settings/about" },
  { label: "Mail, Calendar and Files", more: "gmail google drive connect connections access disconnect", where: "The Lyra page", href: "#/access" },
  { label: "Spotify", more: "music now playing playlists playback", where: "The Lyra page", href: "#/access" },
  { label: "Phone notifications and contacts", more: "texts messages read notifications address book", where: "The Lyra page", href: "#/access", phone: true },
  { label: "What Lyra may do with your OK", more: "send email write emails calendar changes archive tidy inbox texts playlists", where: "The Lyra page", href: "#/access" },
  { label: "Memory", more: "what lyra knows notes people skills forget remember", where: "Memory", href: "#/memory" },
  { label: "Soul", more: "personality character voice who lyra is", where: "Soul", href: "#/soul" },
  { label: "Routines", more: "morning brief schedule scheduled daily", where: "Tasks", href: "#/tasks" },
  { label: "Activity", more: "log history what lyra did", where: "Activity", href: "#/activity" },
];

const ACCENT_CHOICES: { id: AppState["accent"]; label: string }[] = [
  { id: "lime", label: "Lime" },
  { id: "orange", label: "Burnt orange" },
  { id: "yellow", label: "Yellow" },
  { id: "red", label: "Red" },
  { id: "maroon", label: "Maroon" },
  { id: "navy", label: "Navy" },
  { id: "indigo", label: "Indigo" },
  { id: "teal", label: "Teal" },
];

const TITLES: Record<SettingsSection, string> = {
  model: "AI model",
  usage: "Usage",
  you: "You and appearance",
  alerts: "Notifications and privacy",
  sync: "Sync and backup",
  about: "Updates",
};

interface Props {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
  section?: SettingsSection;
}

export function Settings({ state, setState, toast, section }: Props) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<AppState>, done: string) => {
    setBusy(true);
    try {
      setState(await fn());
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!section) return <SettingsHome state={state} />;
  return (
    <div className="screen">
      <h1 className="page-title">{TITLES[section]}</h1>
      {section === "model" && (
        <>
          <p className="page-sub">
            Your keys stay in {isNative ? "Android's encrypted storage" : isDesktop ? "Windows' encrypted storage for your account" : "this browser"} and only go to the provider they belong to.
          </p>
          <ModelSettings state={state} run={run} busy={busy} />
        </>
      )}
      {section === "usage" && <Usage />}
      {section === "you" && <YouSection state={state} setState={setState} toast={toast} run={run} busy={busy} />}
      {section === "alerts" && <AlertsSection state={state} run={run} busy={busy} toast={toast} />}
      {section === "sync" && (
        <>
          <SyncSection toast={toast} />
          <GoogleSetupSection toast={toast} />
          <BackupSection toast={toast} />
        </>
      )}
      {section === "about" && <UpdatesSection />}
    </div>
  );
}

/** The front page: one row per area, each saying where things stand. */
function SettingsHome({ state }: { state: AppState }) {
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [version, setVersion] = useState(__LYRA_VERSION__);
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    const today = dayKey(new Date());
    void api.usage(today, today).then((rows) => setUsage(rows.filter((r) => r.source !== "voice").reduce((n, r) => n + r.input + r.output, 0)), () => {});
    void syncApi.status().then(setSync, () => {});
    void installer.version().then(setVersion, () => {});
    return syncApi.onChange(() => void syncApi.status().then(setSync, () => {}));
  }, []);
  const [q, setQ] = useState("");
  const provider = state.providers.find((p) => p.id === state.choice.provider);
  const connected = state.connectors.filter((c) => c.state === "connected").length;
  const usable = state.connectors.filter((c) => c.state !== "unavailable").length;
  const accent = ACCENT_CHOICES.find((a) => a.id === state.accent)?.label ?? "";
  const alerts = [state.notifications ? "Notifications on" : "Notifications off", `heads-ups ${state.proactive.level}`, ...(isNative ? [state.appLock ? "app lock on" : "app lock off"] : [])].join(", ");

  const rows: { href: string; icon: ReactNode; title: string; sub: string }[] = [
    { href: "#/settings/model", icon: <Cpu />, title: TITLES.model, sub: state.choice.provider === "fake" ? "Practice mode. Add a key to use a real model." : `${provider?.label} · ${state.choice.model}` },
    { href: "#/settings/usage", icon: <Chart />, title: TITLES.usage, sub: usage === null ? "Tokens per model, by day, week or month" : usage ? `${compact(usage)} tokens today` : "No tokens used today" },
    { href: "#/settings/you", icon: <User />, title: TITLES.you, sub: [state.userName !== "you" ? state.userName : "Name not set", accent, state.weatherPlace?.name.split(",")[0]].filter(Boolean).join(" · ") },
    { href: "#/settings/alerts", icon: <Bell />, title: TITLES.alerts, sub: alerts },
    { href: "#/settings/sync", icon: <Cloud />, title: TITLES.sync, sub: sync?.enabled ? (sync.lastError ? "Sync needs attention" : `Syncing as ${sync.deviceName}`) : "Sync is off" },
    { href: "#/access", icon: <Plug />, title: "Connections", sub: connected ? `${connected} of ${usable} connected` : "Mail, Calendar and Files: none connected yet" },
    { href: "#/settings/about", icon: <Refresh />, title: TITLES.about, sub: `Lyra ${version}` },
  ];

  // find any setting by a word in it (0.47): "quiet", "backup", "haptics", "spotify"
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? FINDER.filter((f) => (isNative || !f.phone) && words.every((w) => `${f.label} ${f.more} ${f.where}`.toLowerCase().includes(w))) : [];

  return (
    <div className="screen">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Lyra lives on {thisDevice}.</p>
      <label className="settings-search">
        <Search size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a setting" aria-label="Find a setting" />
      </label>
      {words.length > 0 && (
        <div className="group settings-home settings-found">
          {found.map((f) => (
            <a className="item" href={f.href} key={f.label}>
              <span className="body">
                <div className="title">{f.label}</div>
                <div className="sub">{f.where}</div>
              </span>
              <Chevron className="chev" />
            </a>
          ))}
          {!found.length && <p className="hint settings-none">Nothing by that name. Try another word, or ask Lyra in chat.</p>}
        </div>
      )}
      <div className="group settings-home" hidden={words.length > 0}>
        {rows.map((r) => (
          <a className="item" href={r.href} key={r.href}>
            <span className="tile">{r.icon}</span>
            <span className="body">
              <div className="title">{r.title}</div>
              <div className="sub">{r.sub}</div>
            </span>
            <Chevron className="chev" />
          </a>
        ))}
      </div>
    </div>
  );
}

function YouSection({ state, setState, toast, run, busy }: Omit<Props, "section"> & { run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(state.userName === "you" ? "" : state.userName);
  return (
    <>
      <section className="section">
        <h2 className="section-label">You</h2>
        <label className="field-label" htmlFor="name">
          What should Lyra call you?
        </label>
        <div className="field-row">
          <input id="name" className="field" value={name} placeholder="Your first name" onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          {name.trim() !== (state.userName === "you" ? "" : state.userName) && (
            <button className="btn ink" disabled={busy} onClick={() => void run(() => api.saveSettings({ userName: name }), "Saved")}>
              Save
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Look</h2>
        <div className="theme-styles" role="radiogroup" aria-label="Look">
          {THEME_CHOICES.map((t) => (
            <label key={t.id} className="theme-style" data-theme={t.id}>
              <input type="radio" name="theme" value={t.id} checked={state.theme === t.id} disabled={busy} onChange={() => void run(() => api.saveSettings({ theme: t.id }), `${t.label} it is`)} />
              <span className="theme-sample" aria-hidden="true">
                <i className="theme-dot" />
                <i className="theme-line" />
                <i className="theme-line short" />
              </span>
              <span className="name">{t.label}</span>
              <span className="about">{t.about}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Accent color</h2>
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {ACCENT_CHOICES.map((c) => (
            <label key={c.id} className="swatch" data-accent={c.id}>
              <input type="radio" name="accent" value={c.id} checked={state.accent === c.id} disabled={busy} onChange={() => void run(() => api.saveSettings({ accent: c.id }), `${c.label} it is`)} />
              <span className="swatch-dot">{state.accent === c.id && <Check size={20} />}</span>
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Your messages</h2>
        <div className="bubble-styles" role="radiogroup" aria-label="Your messages">
          {BUBBLE_CHOICES.map((b) => (
            <label key={b.id} className="bubble-style" data-bubbles={b.id}>
              <input
                type="radio"
                name="bubbles"
                value={b.id}
                checked={state.bubbles === b.id}
                disabled={busy}
                onChange={() => void run(() => api.saveSettings({ bubbles: b.id }), `${b.label} it is`)}
              />
              <span className="sample" aria-hidden="true">
                Hey Lyra!
              </span>
              <span className="name">{b.label}</span>
              <span className="about">{b.about}</span>
            </label>
          ))}
        </div>
      </section>

      <TalkLikeMe state={state} run={run} busy={busy} toast={toast} />

      <WeatherSection state={state} setState={setState} toast={toast} />

      <HapticsSection />
    </>
  );
}

/** Sounds (any device, off to start) and little taps under your finger (the phone). */
function HapticsSection() {
  const [on, setOn] = useState(hapticsOn);
  const [sounds, setSoundsOn] = useState(soundsOn);
  return (
    <section className="section">
      <h2 className="section-label">Feel</h2>
      <div className="group">
        <label className="item">
          <span className="body">
            <div className="title">Sounds</div>
            <div className="sub">A few soft notes: when you send, when Lyra answers, when something gets done, and a bell when Lyra speaks first.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={sounds}
            onChange={(e) => {
              setSounds(e.target.checked);
              setSoundsOn(e.target.checked);
              if (e.target.checked) sound.reply(true);
            }}
          />
        </label>
        {isNative && (
        <label className="item">
          <span className="body">
            <div className="title">Haptics</div>
            <div className="sub">A light tap when you send, switch tabs, swipe a task or tick one off.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={on}
            onChange={(e) => {
              setHaptics(e.target.checked);
              setOn(e.target.checked);
              haptic.done();
            }}
          />
        </label>
        )}
      </div>
    </section>
  );
}

type TalkStyle = Awaited<ReturnType<typeof api.talkStyle>>;

/** Lyra mirrors how you talk, and what Lyra has noticed so far. */
function TalkLikeMe({ state, run, busy, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean; toast: (m: string) => void }) {
  const [style, setStyle] = useState<TalkStyle | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => void api.talkStyle().then(setStyle, () => {}), [state.mirror]);
  const act = async (fn: () => Promise<TalkStyle>, done: string) => {
    setWorking(true);
    try {
      setStyle(await fn());
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="section">
      <h2 className="section-label">How Lyra talks to you</h2>
      <div className="group">
        <label className="item">
          <span className="body">
            <div className="title">Talk like me</div>
            <div className="sub">Lyra picks up your slang, energy and emoji over time and talks a bit more like you. Lyra learns only from your own messages and the replies you rate with a thumbs up or down, never your email.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={state.mirror}
            disabled={busy}
            onChange={(e) => void run(() => api.saveSettings({ mirror: e.target.checked }), e.target.checked ? "Lyra will talk more like you" : "Lyra will keep its own voice")}
          />
        </label>
      </div>
      {state.mirror && style && (
        <>
          {style.notes.length ? (
            <>
              <p className="hint">What Lyra has noticed so far:</p>
              <ul className="style-notes">
                {style.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">Nothing learned yet. Lyra goes by your recent chat for now, and every few days takes note of how you talk.</p>
          )}
          <div className="field-row">
            <button className="btn quiet" disabled={working} onClick={() => void act(() => api.learnStyleNow(), "Updated")}>
              {working ? "Listening…" : style.notes.length ? "Update now" : "Learn now"}
            </button>
            {style.notes.length > 0 && (
              <button className="btn text" disabled={working} onClick={() => void ask("Forget what Lyra noticed about how you talk?").then<unknown>((ok) => ok && act(() => api.forgetStyle(), "Forgotten"))}>
                Forget
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const LEVELS = [
  { id: "off", label: "Off", sub: "Lyra speaks when spoken to (plus your routines and reminders)." },
  { id: "light", label: "Light", sub: "Every 4 hours Lyra looks at your mail, calendar and tasks, and only speaks up for something that matters today." },
  { id: "active", label: "Active", sub: "Every hour, with a lower bar: things coming up, replies people are waiting on, tasks ready for you." },
] as const;

function HeadsUps({ state, run, busy }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
  const p = state.proactive;
  const level = LEVELS.find((l) => l.id === p.level)!;
  const levelPill = useSlidingPill(p.level);
  const quiet = (k: "quietStart" | "quietEnd", v: string) => v && v !== p[k] && void run(() => api.saveSettings({ proactive: { [k]: v } }), "Quiet hours saved");
  // saved a moment after the last change (a phone's picker, or typing on a computer), not on every keystroke
  const wait = useRef<{ quietStart?: number; quietEnd?: number }>({});
  const soon = (k: "quietStart" | "quietEnd", v: string) => {
    clearTimeout(wait.current[k]);
    wait.current[k] = window.setTimeout(() => quiet(k, v), 900);
  };
  return (
    <section className="section">
      <h2 className="section-label">Heads-ups</h2>
      <div className="seg" role="radiogroup" aria-label="Heads-ups" ref={levelPill}>
        <span className="slide-pill" aria-hidden="true" />
        {LEVELS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={p.level === l.id}
            className={p.level === l.id ? "on" : ""}
            disabled={busy}
            onClick={() => p.level !== l.id && void run(() => api.saveSettings({ proactive: { level: l.id } }), l.id === "off" ? "Heads-ups off" : `Heads-ups: ${l.label}`)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="hint">{level.sub}</p>
      {p.level !== "off" && (
        <div className="group">
          <label className="item" htmlFor="quiet-start">
            <span className="body">
              <div className="title">Quiet from</div>
              <div className="sub">No heads-ups overnight. Reminders you set still come.</div>
            </span>
            <input id="quiet-start" type="time" className="select" defaultValue={p.quietStart} key={`qs${p.quietStart}`} onChange={(e) => soon("quietStart", e.target.value)} />
          </label>
          <label className="item" htmlFor="quiet-end">
            <span className="body">
              <div className="title">Until</div>
            </span>
            <input id="quiet-end" type="time" className="select" defaultValue={p.quietEnd} key={`qe${p.quietEnd}`} onChange={(e) => soon("quietEnd", e.target.value)} />
          </label>
        </div>
      )}
      {p.level !== "off" && (
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">Check in when it's quiet</div>
              <div className="sub">
                When nothing needs you, Lyra offers to take something on or asks something to get to know you, {p.level === "active" ? "up to twice a day" : "about once a day"}. Never while you're mid-conversation, and not again until you've answered.
              </div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={p.checkIns}
              disabled={busy}
              onChange={(e) => void run(() => api.saveSettings({ proactive: { checkIns: e.target.checked } }), e.target.checked ? "Lyra will check in" : "No check-ins")}
            />
          </label>
          {state.connectors.some((c) => c.id === "gmail" && c.state === "connected") && (
            <label className="item">
              <span className="body">
                <div className="title">Watch for important mail</div>
                <div className="sub">
                  Every 5 minutes Lyra checks for new mail from people on your People cards, or that Gmail marks Important. Only something new gets read, and you hear about it only if it needs you, with buttons for the next step.
                </div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={p.mailWatch}
                disabled={busy}
                onChange={(e) => void run(() => api.saveSettings({ proactive: { mailWatch: e.target.checked } }), e.target.checked ? "Lyra will watch your mail" : "Mail watch off")}
              />
            </label>
          )}
        </div>
      )}
      {p.level !== "off" && <p className="hint">Each check uses some tokens even when it stays quiet. They show on the Usage page under heads-ups. Checks run while Lyra is open, or in the background with {isNative ? "Keep watch" : "the tray"} (below){isNative ? "" : ". With sync on, your phone does the checking"}.</p>}
    </section>
  );
}

/** Keep working with the app out of sight: the phone's "Keep watch", the computer's tray. */
function BackgroundSection({ toast }: { toast: (m: string) => void }) {
  const [bg, setBg] = useState<BackgroundState | null | undefined>(undefined);
  const [routinesHere, setRoutinesHere] = useState(true);
  const [homeBase, setHomeBase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void background.state().then(setBg, () => setBg(null));
    void syncApi.status().then((s) => {
      setRoutinesHere(s.routinesHere);
      setHomeBase(s.homeBase?.fresh ? s.homeBase.name : null);
    }, () => {});
  }, []);
  if (bg === undefined || (!isNative && !isDesktop)) return null;
  const change = async (patch: Partial<BackgroundState>, done: string) => {
    setBusy(true);
    try {
      setBg(await background.set(patch));
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="section">
      <h2 className="section-label">In the background</h2>
      {bg === null ? (
        <p className="hint">Keeping Lyra running in the tray needs the newest Windows app. Get it from Settings, Updates.</p>
      ) : (
        <>
          <div className="group">
            <label className="item">
              <span className="body">
                <div className="title">{isNative ? "Keep watch" : "Keep running in the tray"}</div>
                <div className="sub">
                  {isNative
                    ? "Routines, heads-ups and follow-ups keep running after you leave Lyra, checked every 15 minutes. Android requires a notification while it's on, so it shows what's next and the latest from Lyra. Uses a little more battery."
                    : "Closing the window leaves Lyra in the tray, so routines, heads-ups and sync keep going. Quit from the tray icon."}
                </div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={bg.on}
                disabled={busy}
                onChange={(e) => void change({ on: e.target.checked }, e.target.checked ? (isNative ? "Keeping watch" : "Lyra stays in the tray") : isNative ? "Stopped keeping watch" : "Closing the window quits Lyra")}
              />
            </label>
            {isDesktop && (
              <label className="item">
                <span className="body">
                  <div className="title">Open when Windows starts</div>
                  <div className="sub">Starts quietly in the tray when you sign in.</div>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={!!bg.atLogin}
                  disabled={busy || !bg.on}
                  onChange={(e) => void change({ atLogin: e.target.checked }, e.target.checked ? "Lyra opens with Windows" : "Lyra won't open with Windows")}
                />
              </label>
            )}
          </div>
          {isNative && homeBase && bg?.on && (
            <p className="hint">
              {homeBase} is Lyra's home base, so the background work happens there and this phone doesn't need Keep watch. You can turn it off; the notification goes with it. Your phone takes over on its own if {homeBase} goes quiet (when Lyra is open).
            </p>
          )}
          {isNative && <p className="hint">Swiping Lyra away from your recent apps stops it until you open it again.</p>}
          {isDesktop && !routinesHere && <p className="hint">With sync on, your phone runs routines and heads-ups. To run them on this computer instead, make it Lyra's home base under Sync and backup.</p>}
        </>
      )}
    </section>
  );
}

/**
 * Everything that has to be right for Lyra to reach you unasked, checked one by one,
 * each with the tap that fixes it, and a test notification.
 */
function NotificationCheckup({ state, run, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; toast: (m: string) => void }) {
  const [perm, setPerm] = useState<Awaited<ReturnType<typeof notifier.permission>> | null>(null);
  const [watch, setWatch] = useState<BackgroundState | null>(null);
  const [battery, setBattery] = useState<boolean | null>(null);
  const check = useCallback(() => {
    void notifier.permission().then(setPerm, () => setPerm("unavailable"));
    void background.state().then(setWatch, () => setWatch(null));
    void background.batteryOk().then(setBattery, () => setBattery(null));
  }, []);
  useEffect(check, [check]);
  // coming back from Android's settings: look again
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [check]);
  if (perm === null || perm === "unavailable") return null;

  const practice = state.choice.provider === "fake";
  const rows: { ok: boolean; title: string; sub: string; fix?: ReactNode }[] = [
    {
      ok: perm === "granted" && state.notifications,
      title: "Notifications allowed",
      sub: perm === "denied" ? "Android has them turned off for Lyra." : !state.notifications ? "Turned off in Lyra." : "Lyra can reach you.",
      fix:
        perm === "denied" ? (
          <button className="btn quiet" onClick={() => void notifier.openSettings()}>
            Open settings
          </button>
        ) : (
          <button
            className="btn quiet"
            onClick={() =>
              void run(async () => {
                if (!(await api.allowNotifications())) throw new Error("Android said no. Tap Open settings to allow them.");
                return api.saveSettings({ notifications: true });
              }, "Notifications on").then(check)
            }
          >
            Allow
          </button>
        ),
    },
    {
      ok: !practice,
      title: "A real AI model",
      sub: practice ? "The practice model can't write heads-ups or check-ins." : "Heads-ups and check-ins can run.",
      fix: (
        <a className="btn quiet" href="#/settings/model">
          Set up
        </a>
      ),
    },
    {
      ok: state.proactive.level !== "off",
      title: "Heads-ups on",
      sub: state.proactive.level === "off" ? "Off: Lyra only speaks when spoken to." : `${state.proactive.level === "active" ? "Active" : "Light"}, with check-ins ${state.proactive.checkIns ? "on" : "off"}.`,
      fix: (
        <button className="btn quiet" onClick={() => void run(() => api.saveSettings({ proactive: { level: "light", checkIns: true } }), "Heads-ups: Light")}>
          Turn on
        </button>
      ),
    },
  ];
  if (watch)
    rows.push({
      ok: watch.on,
      title: isDesktop ? "Keep running in the tray" : "Keep watch on",
      sub: watch.on ? "Lyra keeps checking with the app in the background." : "Off: Lyra only checks while the app is open.",
      fix: (
        <button className="btn quiet" onClick={() => void background.set({ on: true }).then((s) => (setWatch(s), toast("Lyra will keep watch")), (e) => toast((e as Error).message))}>
          Turn on
        </button>
      ),
    });
  if (battery !== null)
    rows.push({
      ok: battery,
      title: "Not held back by battery saving",
      sub: battery ? "Lyra's 15-minute check-ins get through." : "Android may delay or skip Lyra's background checks.",
      fix: (
        <button className="btn quiet" onClick={() => void background.askBattery()}>
          Allow
        </button>
      ),
    });
  const all = rows.every((r) => r.ok);

  return (
    <section className="section">
      <h2 className="section-label">Checkup</h2>
      <p className="hint">{all ? "All set: Lyra can reach you without being asked." : "A few things stop Lyra reaching you without being asked. Each is one tap."}</p>
      <div className="group">
        {rows.map((r) => (
          <div className="item checkup-row" key={r.title}>
            <span className={`checkup-mark${r.ok ? " ok" : ""}`} aria-label={r.ok ? "OK" : "Needs fixing"}>
              {r.ok ? <Check size={16} /> : "!"}
            </span>
            <span className="body">
              <div className="title">{r.title}</div>
              <div className="sub">{r.sub}</div>
            </span>
            {!r.ok && r.fix}
          </div>
        ))}
      </div>
      {!isDesktop && <p className="hint">Don't swipe Lyra away from your recent apps: that stops Lyra until you open the app again. Reminders, routine nudges and life admin heads-ups still arrive; heads-ups and check-ins need Lyra running.</p>}
      <button
        className="btn quiet"
        onClick={() =>
          void notifier.test().then(
            () => toast(isDesktop ? "Sent" : "Coming in a few seconds: switch to your home screen to see it"),
            (e) => toast((e as Error).message),
          )
        }
      >
        Send me a test notification
      </button>
    </section>
  );
}

function AlertsSection({ state, run, busy, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean; toast: (m: string) => void }) {
  return (
    <>
      <NotificationCheckup state={state} run={run} toast={toast} />
      <section className="section">
        <h2 className="section-label">Notifications</h2>
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">Notify me</div>
              <div className="sub">When Lyra finishes a reply after you've switched away, a routine or heads-up posts news, or a task is ready for you. Plus a reminder at each routine's time.</div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={state.notifications}
              disabled={busy}
              onChange={(e) => {
                const on = e.target.checked;
                void run(async () => {
                  if (on && !(await api.allowNotifications())) throw new Error("Android has notifications off for Lyra. Turn them on in your phone's Settings, Apps, Lyra.");
                  return api.saveSettings({ notifications: on });
                }, on ? "Notifications on" : "Notifications off");
              }}
            />
          </label>
        </div>
        {!isNative && !isDesktop && <p className="hint">Notifications work in the Android and Windows apps.</p>}
      </section>

      <HeadsUps state={state} run={run} busy={busy} />
      <BackgroundSection toast={toast} />
      <PlacesSection toast={toast} />

      <section className="section">
        <h2 className="section-label">Privacy</h2>
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">App lock</div>
              <div className="sub">Ask for your fingerprint, face or screen lock to open Lyra, and again after it's been away a minute.</div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={state.appLock}
              disabled={busy || !isNative}
              onChange={(e) => {
                const on = e.target.checked;
                void run(async () => {
                  if (on && !(await appLock.available())) throw new Error("Set a screen lock on your phone first (Settings, Security), then turn this on.");
                  // prove it works before relying on it
                  const r = await appLock.unlock();
                  if (!r.ok) throw new Error(r.error ? `App lock wasn't turned on: ${r.error}` : "App lock wasn't turned on.");
                  return api.saveSettings({ appLock: on });
                }, on ? "App lock on" : "App lock off");
              }}
            />
          </label>
        </div>
        {!isNative && <p className="hint">App lock is in the phone app for now.</p>}
      </section>
    </>
  );
}
