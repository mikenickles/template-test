// Getting started (0.47): the few things that turn Lyra from a practice chat into a chief of
// staff, as a short checklist on the welcome screen and the Today view. Each line goes straight
// to where it's done (or does it), ticks itself off, and the card goes away when they're all
// done or you hide it. Nothing new is stored: every step is read from what's already set.
import { useCallback, useEffect, useState } from "react";
import { api, onChange, type AppState } from "./api";
import { Check, Chevron, Close } from "./icons";
import { notifier } from "./platform";

const HIDDEN = "lyra.setupHidden";

export interface SetupStep {
  key: "model" | "name" | "connect" | "notify" | "brief";
  title: string;
  sub: string;
  done: boolean;
  href?: string;
  act?: () => Promise<string | void>;
}

/** What's set up so far. Steps that can't be done on this device (no Google sign-in, no notifications) are left out. */
export function useSetup(): { steps: SetupStep[]; state: AppState | null; reload: () => void } {
  const [state, setState] = useState<AppState | null>(null);
  const [routines, setRoutines] = useState<number | null>(null);
  const [notify, setNotify] = useState<"granted" | "denied" | "prompt" | "unavailable">("unavailable");
  const reload = useCallback(() => {
    void api.state().then(setState, () => {});
    void api.routines().then((r) => setRoutines(r.length), () => {});
    void notifier.permission().then(setNotify, () => {});
  }, []);
  useEffect(() => {
    reload();
    const off = onChange((e) => e.type === "routine" && reload());
    const back = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", back);
    return () => {
      off();
      document.removeEventListener("visibilitychange", back);
    };
  }, [reload]);
  if (!state) return { steps: [], state, reload };

  const google = state.connectors.filter((c) => ["gmail", "calendar", "drive"].includes(c.id));
  const canConnect = google.some((c) => c.state !== "unavailable");
  const steps: SetupStep[] = [
    {
      key: "model",
      title: "Give Lyra a brain",
      sub: "Add an API key from Claude, OpenAI or Gemini. Until then Lyra only practices.",
      done: state.choice.provider !== "fake",
      href: "#/settings/model",
    },
    { key: "name", title: "Tell Lyra your name", sub: "So it knows who it works for.", done: state.userName !== "you", href: "#/settings/you" },
    ...(canConnect
      ? [
          {
            key: "connect" as const,
            title: "Connect your mail and calendar",
            sub: "Read-only. This is how Lyra knows what's coming up.",
            done: google.some((c) => c.state === "connected"),
            href: "#/access",
          },
        ]
      : []),
    ...(notify !== "unavailable"
      ? [
          {
            key: "notify" as const,
            title: "Let Lyra reach you",
            sub: "Notifications for heads-ups, reminders and finished tasks.",
            done: notify === "granted" && state.notifications,
            act: async () => {
              if (!state.notifications) await api.saveSettings({ notifications: true });
              if (notify === "denied") return void (await notifier.openSettings());
              if (!(await notifier.ask())) return "Notifications are still off. You can allow them in your phone's settings.";
              return "Lyra can reach you now";
            },
          },
        ]
      : []),
    {
      key: "brief",
      title: "Get a morning brief",
      sub: "Every day at 7: your day, what needs you, what's due.",
      done: (routines ?? 0) > 0,
      act: async () => {
        await api.addPreset("brief");
        return "Morning brief added. Change it any time in Tasks.";
      },
    },
  ];
  return { steps, state, reload };
}

export function SetupCard({ toast, compact = false }: { toast: (m: string) => void; compact?: boolean }) {
  const { steps, reload } = useSetup();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const left = steps.filter((s) => !s.done);
  if (hidden || !steps.length || !left.length) return null;
  const done = steps.length - left.length;

  const run = async (s: SetupStep) => {
    if (!s.act) return;
    setBusy(s.key);
    try {
      const said = await s.act();
      if (said) toast(said);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  };

  // on the Today view: one line, the next thing to do
  const shown = compact ? left.slice(0, 1) : steps;
  return (
    <section className={`setup${compact ? " compact" : ""}`} aria-label="Getting started">
      <div className="setup-head">
        <span className="setup-title">{compact ? "Finish setting up" : "Getting started"}</span>
        <span className="setup-count" aria-label={`${done} of ${steps.length} done`}>
          {done} of {steps.length}
        </span>
        <button
          className="setup-hide"
          aria-label="Hide getting started"
          title="Hide"
          onClick={() => {
            try {
              localStorage.setItem(HIDDEN, "1");
            } catch {
              /* hidden for now */
            }
            setHidden(true);
          }}
        >
          <Close size={16} />
        </button>
      </div>
      <div className="setup-bar" aria-hidden="true">
        <i style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="setup-steps-list">
        {shown.map((s) => {
          const inner = (
            <>
              <span className={`setup-mark${s.done ? " done" : ""}`}>{s.done && <Check size={14} />}</span>
              <span className="setup-body">
                <span className="setup-step">{s.title}</span>
                {!s.done && <span className="setup-sub">{s.sub}</span>}
              </span>
              {!s.done && <Chevron size={18} className="chev" />}
            </>
          );
          return (
            <li key={s.key}>
              {s.done ? (
                <div className="setup-row done">{inner}</div>
              ) : s.href ? (
                <a className="setup-row" href={s.href}>
                  {inner}
                </a>
              ) : (
                <button className="setup-row" disabled={busy !== null} onClick={() => void run(s)}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
