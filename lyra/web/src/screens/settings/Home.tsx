/** Settings home: the search box and the rows to each page. */
import { useState, type ReactNode } from "react";
import { api, isNative, syncApi, type AppState, type SyncStatus } from "../../api";
import { Search, Bell, Chart, Chevron, Cloud, Cpu, Plug, Refresh, User } from "../../icons";
import { compact, dayKey } from "../../usageData";
import { installer, thisDevice } from "../../platform";
import { useEffect } from "react";
import { ask } from "../../ask";
import { FINDER, ACCENT_CHOICES, TITLES } from "./choices";

/** The front page: one row per area, each saying where things stand. */
export function SettingsHome({ state }: { state: AppState }) {
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
  const accent = ACCENT_CHOICES.find((a) => a.id === state.accent)?.label ?? "";
  const alerts = [state.notifications ? "Notifications on" : "Notifications off", `heads-ups ${state.proactive.level}`, ...(isNative ? [state.appLock ? "app lock on" : "app lock off"] : [])].join(", ");

  const connected = state.connectors.filter((c) => c.state === "connected").length;
  const usable = state.connectors.filter((c) => c.state !== "unavailable").length;
  const rows: { href: string; icon: ReactNode; title: string; sub: string }[] = [
    { href: "#/settings/model", icon: <Cpu />, title: TITLES.model, sub: state.choice.provider === "fake" ? "Practice mode. Add a key to use a real model." : `${provider?.label} · ${state.choice.model}` },
    { href: "#/settings/usage", icon: <Chart />, title: TITLES.usage, sub: usage === null ? "Tokens per model, by day, week or month" : usage ? `${compact(usage)} tokens today` : "No tokens used today" },
    { href: "#/settings/you", icon: <User />, title: TITLES.you, sub: [state.userName !== "you" ? state.userName : "Name not set", accent, state.weatherPlace?.name.split(",")[0]].filter(Boolean).join(" · ") },
    { href: "#/settings/alerts", icon: <Bell />, title: TITLES.alerts, sub: alerts },
    { href: "#/settings/sync", icon: <Cloud />, title: TITLES.sync, sub: sync?.enabled ? (sync.lastError ? "Sync needs attention" : `Syncing as ${sync.deviceName}`) : "Sync is off" },
    { href: "#/access", icon: <Plug />, title: "Connections", sub: connected ? `${connected} of ${usable} connected` : "Mail, Calendar and Files: none connected yet" },
    { href: "#/settings/about", icon: <Refresh />, title: TITLES.about, sub: `Tomo ${version}` },
  ];

  // find any setting by a word in it (0.47): "quiet", "backup", "haptics", "spotify"
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? FINDER.filter((f) => (isNative || !f.phone) && words.every((w) => `${f.label} ${f.more} ${f.where}`.toLowerCase().includes(w))) : [];

  return (
    <div className="screen">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Tomo lives on {thisDevice}.</p>
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
          {!found.length && <p className="hint settings-none">Nothing by that name. Try another word, or ask Tomo in chat.</p>}
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
