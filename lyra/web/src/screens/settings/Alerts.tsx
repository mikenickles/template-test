/** Settings, Notifications and privacy: the checkup, heads-ups, keeping watch in the background. */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { api, isNative, syncApi, type AppState } from "../../api";
import { Check } from "../../icons";
import { Usage } from "../Usage";
import { useSlidingPill } from "../../pill";
import { appLock, background, isDesktop, notifier, type BackgroundState } from "../../platform";
import { PlacesSection } from "../PlacesSection";
import { useEffect } from "react";

export const LEVELS = [
  { id: "off", label: "Off", sub: "Tomo speaks when spoken to (plus your routines and reminders)." },
  { id: "light", label: "Light", sub: "Every 4 hours Tomo looks at your mail, calendar and tasks, and only speaks up for something that matters today." },
  { id: "active", label: "Active", sub: "Every hour, with a lower bar: things coming up, replies people are waiting on, tasks ready for you." },
] as const;

export function HeadsUps({ state, run, busy }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
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
                When nothing needs you, Tomo offers to take something on or asks something to get to know you, {p.level === "active" ? "up to twice a day" : "about once a day"}. Never while you're mid-conversation, and not again until you've answered.
              </div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={p.checkIns}
              disabled={busy}
              onChange={(e) => void run(() => api.saveSettings({ proactive: { checkIns: e.target.checked } }), e.target.checked ? "Tomo will check in" : "No check-ins")}
            />
          </label>
          {state.connectors.some((c) => c.id === "gmail" && c.state === "connected") && (
            <label className="item">
              <span className="body">
                <div className="title">Watch for important mail</div>
                <div className="sub">
                  Every 5 minutes Tomo checks for new mail from people on your People cards, or that Gmail marks Important. Only something new gets read, and you hear about it only if it needs you, with buttons for the next step.
                </div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={p.mailWatch}
                disabled={busy}
                onChange={(e) => void run(() => api.saveSettings({ proactive: { mailWatch: e.target.checked } }), e.target.checked ? "Tomo will watch your mail" : "Mail watch off")}
              />
            </label>
          )}
        </div>
      )}
      {p.level !== "off" && <p className="hint">Each check uses some tokens even when it stays quiet. They show on the Usage page under heads-ups. Checks run while Tomo is open, or in the background with {isNative ? "Keep watch" : "the tray"} (below){isNative ? "" : ". With sync on, your phone does the checking"}.</p>}
    </section>
  );
}

/** Keep working with the app out of sight: the phone's "Keep watch", the computer's tray. */
export function BackgroundSection({ toast }: { toast: (m: string) => void }) {
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
        <p className="hint">Keeping Tomo running in the tray needs the newest Windows app. Get it from Settings, Updates.</p>
      ) : (
        <>
          <div className="group">
            <label className="item">
              <span className="body">
                <div className="title">{isNative ? "Keep watch" : "Keep running in the tray"}</div>
                <div className="sub">
                  {isNative
                    ? `Routines, heads-ups and follow-ups keep running after you leave Tomo, checked every ${bg.every ?? 15} minutes. Android requires a notification while it's on, so it shows what's next and the latest from Tomo. Uses a little more battery.`
                    : "Closing the window leaves Tomo in the tray, so routines, heads-ups and sync keep going. Quit from the tray icon."}
                </div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={bg.on}
                disabled={busy}
                onChange={(e) => void change({ on: e.target.checked }, e.target.checked ? (isNative ? "Keeping watch" : "Tomo stays in the tray") : isNative ? "Stopped keeping watch" : "Closing the window quits Tomo")}
              />
            </label>
            {isNative && bg.on && (
              <div className="item">
                <span className="body">
                  <div className="title">Check every</div>
                  <div className="sub">Less often saves battery; reminders and alarms still arrive on time.</div>
                </span>
                <div className="seg" role="radiogroup" aria-label="Check every">
                  {[15, 30, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={(bg.every ?? 15) === m}
                      className={(bg.every ?? 15) === m ? "on" : ""}
                      disabled={busy}
                      onClick={() => void change({ every: m }, m === 60 ? "Checking every hour" : `Checking every ${m} minutes`)}
                    >
                      {m === 60 ? "1 hr" : `${m} min`}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                  onChange={(e) => void change({ atLogin: e.target.checked }, e.target.checked ? "Tomo opens with Windows" : "Tomo won't open with Windows")}
                />
              </label>
            )}
          </div>
          {isNative && homeBase && bg?.on && (
            <p className="hint">
              {homeBase} is Tomo's home base, so the background work happens there and this phone doesn't need Keep watch. You can turn it off; the notification goes with it. Your phone takes over on its own if {homeBase} goes quiet (when Tomo is open).
            </p>
          )}
          {isNative && <p className="hint">Swiping Tomo away from your recent apps stops it until you open it again.</p>}
          {isDesktop && !routinesHere && <p className="hint">With sync on, your phone runs routines and heads-ups. To run them on this computer instead, make it Tomo's home base under Sync and backup.</p>}
        </>
      )}
    </section>
  );
}

/**
 * Everything that has to be right for Lyra to reach you unasked, checked one by one,
 * each with the tap that fixes it, and a test notification.
 */
export function NotificationCheckup({ state, run, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; toast: (m: string) => void }) {
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
      sub: perm === "denied" ? "Android has them turned off for Tomo." : !state.notifications ? "Turned off in Tomo." : "Tomo can reach you.",
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
      sub: state.proactive.level === "off" ? "Off: Tomo only speaks when spoken to." : `${state.proactive.level === "active" ? "Active" : "Light"}, with check-ins ${state.proactive.checkIns ? "on" : "off"}.`,
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
      sub: watch.on ? "Tomo keeps checking with the app in the background." : "Off: Tomo only checks while the app is open.",
      fix: (
        <button className="btn quiet" onClick={() => void background.set({ on: true }).then((s) => (setWatch(s), toast("Tomo will keep watch")), (e) => toast((e as Error).message))}>
          Turn on
        </button>
      ),
    });
  if (battery !== null)
    rows.push({
      ok: battery,
      title: "Not held back by battery saving",
      sub: battery ? "Tomo's 15-minute check-ins get through." : "Android may delay or skip Tomo's background checks.",
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
      <p className="hint">{all ? "All set: Tomo can reach you without being asked." : "A few things stop Tomo reaching you without being asked. Each is one tap."}</p>
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
      {!isDesktop && <p className="hint">Don't swipe Tomo away from your recent apps: that stops Tomo until you open the app again. Reminders, routine nudges and life admin heads-ups still arrive; heads-ups and check-ins need Tomo running.</p>}
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

export function AlertsSection({ state, run, busy, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean; toast: (m: string) => void }) {
  return (
    <>
      <NotificationCheckup state={state} run={run} toast={toast} />
      <section className="section">
        <h2 className="section-label">Notifications</h2>
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">Notify me</div>
              <div className="sub">When Tomo finishes a reply after you've switched away, a routine or heads-up posts news, or a task is ready for you. Plus a reminder at each routine's time.</div>
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
                  if (on && !(await api.allowNotifications())) throw new Error("Android has notifications off for Tomo. Turn them on in your phone's Settings, Apps, Tomo.");
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
              <div className="sub">Ask for your fingerprint, face or screen lock to open Tomo, and again after it's been away a minute.</div>
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
