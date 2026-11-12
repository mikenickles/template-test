import { useState, type ReactNode } from "react";
import { api, isNative, syncApi, type AppState, type SyncStatus } from "../api";
import { Bell, Check, Chevron, Cloud, Cpu, Plug, Refresh, User } from "../icons";
import { appLock, installer, isDesktop, thisDevice } from "../platform";
import { BackupSection } from "./Backup";
import { ModelSettings } from "./ModelSettings";
import { GoogleSetupSection, SyncSection } from "./SyncSection";
import { UpdatesSection } from "./UpdatesSection";
import { WeatherSection } from "./WeatherSection";
import { useEffect } from "react";

export type SettingsSection = "model" | "you" | "alerts" | "sync" | "about";
export const SETTINGS_SECTIONS: SettingsSection[] = ["model", "you", "alerts", "sync", "about"];

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
      {section === "you" && <YouSection state={state} setState={setState} toast={toast} run={run} busy={busy} />}
      {section === "alerts" && <AlertsSection state={state} run={run} busy={busy} />}
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
  useEffect(() => {
    void syncApi.status().then(setSync, () => {});
    void installer.version().then(setVersion, () => {});
    return syncApi.onChange(() => void syncApi.status().then(setSync, () => {}));
  }, []);
  const provider = state.providers.find((p) => p.id === state.choice.provider);
  const connected = state.connectors.filter((c) => c.state === "connected").length;
  const accent = ACCENT_CHOICES.find((a) => a.id === state.accent)?.label ?? "";
  const alerts = [state.notifications ? "Notifications on" : "Notifications off", ...(isNative ? [state.appLock ? "app lock on" : "app lock off"] : [])].join(", ");

  const rows: { href: string; icon: ReactNode; title: string; sub: string }[] = [
    { href: "#/settings/model", icon: <Cpu />, title: TITLES.model, sub: state.choice.provider === "fake" ? "Practice mode. Add a key to use a real model." : `${provider?.label} · ${state.choice.model}` },
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

      <WeatherSection state={state} setState={setState} toast={toast} />
    </>
  );
}

function AlertsSection({ state, run, busy }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
  return (
    <>
      <section className="section">
        <h2 className="section-label">Notifications</h2>
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">Notify me</div>
              <div className="sub">When Lyra finishes a reply after you've switched away, a routine posts news, or a task is ready for you. Plus a reminder at each routine's time.</div>
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
