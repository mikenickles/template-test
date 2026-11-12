// "While you were away": when you come back after a while, a short list of what Lyra
// did on its own meanwhile. Only things it did by itself; nothing if nothing happened.
import { App as CapApp } from "@capacitor/app";
import { useEffect, useState } from "react";
import type { AwayItem } from "../../core/away";
import { api } from "./api";
import { isNative } from "./platform";

/** Shorter breaks than this aren't "away". */
export const AWAY_AFTER = 20 * 60_000;
const KEY = "lyra.leftAt";

function store(v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(KEY);
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    // no storage: no summary, nothing breaks
  }
  return null;
}

interface Away {
  since: string;
  items: AwayItem[];
  more: number;
}

function useAway(): [Away | null, () => void] {
  const [away, setAway] = useState<Away | null>(null);
  useEffect(() => {
    const left = () => {
      // the first moment you left counts, not each time Android pauses Lyra again
      if (!store()) store(new Date().toISOString());
    };
    const back = () => {
      const since = store();
      store(null);
      if (!since || Date.now() - new Date(since).getTime() < AWAY_AFTER) return;
      void api.away(since).then((r) => r.items.length && setAway({ since, ...r }), () => {});
    };
    const visible = () => (document.visibilityState === "visible" ? back() : left());
    let subs: { remove: () => void }[] = [];
    if (isNative) {
      void Promise.all([CapApp.addListener("pause", left), CapApp.addListener("resume", back)]).then((s) => (subs = s));
      void CapApp.getState().then((s) => s.isActive && back());
    } else {
      document.addEventListener("visibilitychange", visible);
      if (document.visibilityState === "visible") back();
    }
    addEventListener("pagehide", left);
    return () => {
      subs.forEach((s) => s.remove());
      document.removeEventListener("visibilitychange", visible);
      removeEventListener("pagehide", left);
    };
  }, []);
  return [away, () => setAway(null)];
}

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString(undefined, today ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
};

const hrefFor = (i: AwayItem) => (i.taskId ? `#/t/${i.taskId}` : i.channelId === null ? "#/" : `#/c/${i.channelId}`);

/** The sheet itself; renders nothing until there's something to say. */
export function AwaySheet() {
  const [away, close] = useAway();
  if (!away) return null;
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={close} />
      <div className="sheet away" role="dialog" aria-modal="true" aria-labelledby="away-title">
        <h2 id="away-title" className="away-title">
          While you were away
        </h2>
        <p className="away-since">Since {time(away.since)}</p>
        <div className="group">
          {away.items.map((i) => (
            <a
              key={`${i.kind}-${i.messageId ?? i.taskId}`}
              className="item away-item"
              href={hrefFor(i)}
              onClick={close}
            >
              <span className="body">
                <span className="away-label">
                  {i.label}
                  <span className="away-time">{time(i.at)}</span>
                </span>
                <span className="away-text">{i.text}</span>
              </span>
            </a>
          ))}
        </div>
        {away.more > 0 && <p className="hint">And {away.more} earlier, in the chat.</p>}
        <button className="btn ink away-done" onClick={close} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}
