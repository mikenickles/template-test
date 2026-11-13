import { useState, type ReactNode } from "react";
import { api, isNative, syncApi, type AppState, type SyncStatus } from "../api";
import { Bell, Chart, Check, Chevron, Cloud, Cpu, Plug, Refresh, User } from "../icons";
import { compact, dayKey } from "../usageData";
import { Usage } from "./Usage";
import { appLock, background, installer, isDesktop, thisDevice, type BackgroundState } from "../platform";
import { BackupSection } from "./Backup";
import { ModelSettings } from "./ModelSettings";
import { GoogleSetupSection, SyncSection } from "./SyncSection";
import { UpdatesSection } from "./UpdatesSection";
import { WeatherSection } from "./WeatherSection";
import { useEffect } from "react";

export type SettingsSection = "model" | "usage" | "you" | "alerts" | "sync" | "about";
export const SETTINGS_SECTIONS: SettingsSection[] = ["model", "usage", "you", "alerts", "sync", "about"];

const BUBBLE_CHOICES: { id: AppState["bubbles"]; label: string; about: string }[] = [
  { id: "softer", label: "Softer", about: "Charcoal, or soft white in dark mode" },
  { id: "accent", label: "Accent", about: "A tint of your accent color" },
  { id: "neutral", label: "Soft neutral", about: "A quiet grey" },
  { id: "classic", label: "Classic", about: "Solid black, or white in dark mode" },
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
  const provider = state.providers.find((p) => p.id === state.choice.provider);
  const connected = state.connectors.filter((c) => c.state === "connected").length;
  const accent = ACCENT_CHOICES.find((a) => a.id === state.accent)?.label ?? "";
  const alerts = [state.notifications ? "Notifications on" : "Notifications off", `heads-ups ${state.proactive.level}`, ...(isNative ? [state.appLock ? "app lock on" : "app lock off"] : [])].join(", ");

  const rows: { href: string; icon: ReactNode; title: string; sub: string }[] = [
    { href: "#/settings/model", icon: <Cpu />, title: TITLES.model, sub: state.choice.provider === "fake" ? "Practice mode. Add a key to use a real model." : `${provider?.label} · ${state.choice.model}` },
    { href: "#/settings/usage", icon: <Chart />, title: TITLES.usage, sub: usage === null ? "Tokens per model, by day, week or month" : usage ? `${compact(usage)} tokens today` : "No tokens used today" },
    { href: "#/settings/you", icon: <User />, title: TITLES.you, sub: [state.userName !== "you" ? state.userName : "Name not set", accent, state.weatherPlace?.name.split(",")[0]].filter(Boolean).join(" · ") },
    { href: "#/settings/alerts", icon: <Bell />, title: TITLES.alerts, sub: alerts },
    { href: "#/settings/sync", icon: <Cloud />, title: TITLES.sync, sub: sync?.enabled ? (sync.lastError ? "Sync needs attention" : `Syncing as ${sync.deviceName}`) : "Sync is off" },
    { href: "#/access", icon: <Plug />, title: "Connections", sub: connected ? `${connected} of ${state.connectors.length} connected: Mail, Calendar, Files` : "Mail, Calendar and Files: none connected yet" },
    { href: "#/settings/about", icon: <Refresh />, title: TITLES.about, sub: `Lyra ${version}` },
  ];

  return (
    <div className="screen">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Lyra lives on {thisDevice}.</p>
      <div className="group settings-home">
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
    </>
  );
}

type TalkStyle = Awaited<ReturnType<typeof api.talkStyle>>;

/** Lyra mirrors how you talk, and what she's noticed so far. */
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
            <div className="sub">Lyra picks up your slang, energy and emoji over time and talks a bit more like you. She learns only from your own messages, never your email.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={state.mirror}
            disabled={busy}
            onChange={(e) => void run(() => api.saveSettings({ mirror: e.target.checked }), e.target.checked ? "Lyra will talk more like you" : "Lyra will keep her own voice")}
          />
        </label>
      </div>
      {state.mirror && style && (
        <>
          {style.notes.length ? (
            <>
              <p className="hint">What she's noticed so far:</p>
              <ul className="style-notes">
                {style.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">Nothing learned yet. She goes by your recent chat for now, and every few days she takes note of how you talk.</p>
          )}
          <div className="field-row">
            <button className="btn quiet" disabled={working} onClick={() => void act(() => api.learnStyleNow(), "Updated")}>
              {working ? "Listening…" : style.notes.length ? "Update now" : "Learn now"}
            </button>
            {style.notes.length > 0 && (
              <button className="btn text" disabled={working} onClick={() => confirm("Forget what Lyra noticed about how you talk?") && void act(() => api.forgetStyle(), "Forgotten")}>
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
  const quiet = (k: "quietStart" | "quietEnd", v: string) => v && v !== p[k] && void run(() => api.saveSettings({ proactive: { [k]: v } }), "Quiet hours saved");
  return (
    <section className="section">
      <h2 className="section-label">Heads-ups</h2>
      <div className="seg" role="radiogroup" aria-label="Heads-ups">
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
            <input id="quiet-start" type="time" className="select" value={p.quietStart} disabled={busy} onChange={(e) => quiet("quietStart", e.target.value)} />
          </label>
          <label className="item" htmlFor="quiet-end">
            <span className="body">
              <div className="title">Until</div>
            </span>
            <input id="quiet-end" type="time" className="select" value={p.quietEnd} disabled={busy} onChange={(e) => quiet("quietEnd", e.target.value)} />
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void background.state().then(setBg, () => setBg(null));
    void syncApi.status().then((s) => setRoutinesHere(s.routinesHere), () => {});
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
                    ? "Routines, heads-ups and follow-ups keep running after you leave Lyra, checked every 15 minutes. Android shows a small \u201ckeeping watch\u201d notification while it's on. Uses a little more battery."
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
          {isNative && <p className="hint">Swiping Lyra away from your recent apps stops it until you open it again.</p>}
          {isDesktop && !routinesHere && <p className="hint">With sync on, your phone runs routines and heads-ups. The tray keeps sync and notifications going here.</p>}
        </>
      )}
    </section>
  );
}

function AlertsSection({ state, run, busy, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean; toast: (m: string) => void }) {
  return (
    <>
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
