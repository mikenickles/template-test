// The Today view: what needs you, what Lyra said lately, and what's coming up,
// strung together like the stars of Lyra. Shown at the top of the main chat.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Today } from "../../core/today";
import { api, onChange } from "./api";
import { SetupCard } from "./Setup";

/** The same gentle zigzag as the channel menu. */
const SWAY = [2, 11, 0, 9, 3, 10];

const QUICK = ["Brief me", "What's on today?", "What needs a reply?"];
/** When nothing needs you: hand Lyra something, or let it get to know you. */
const QUIET = ["What could you take on for me?", "Ask me something", "Brief me"];

function dayPart(now = new Date()): string {
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  const h = now.getHours();
  return `${day} ${h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night"}`;
}

function headline(t: Today): string {
  const words = ["Nothing", "One thing", "Two things", "Three things", "Four things"];
  if (t.needs > 0) return `${words[t.needs] ?? `${t.needs} things`} ${t.needs === 1 ? "needs" : "need"} you.`;
  return t.items.length ? "Nothing needs you right now." : "All clear.";
}

export function TodayView({ onSend, onShowChat, hasChat, toast }: { onSend: (text: string) => void; onShowChat: () => void; hasChat: boolean; toast: (m: string) => void }) {
  const [today, setToday] = useState<Today | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void api.today().then((t) => alive && setToday(t), () => {});
    load();
    const off = onChange(load);
    const tick = setInterval(load, 60_000);
    return () => {
      alive = false;
      off();
      clearInterval(tick);
    };
  }, []);

  const box = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next = [...el.querySelectorAll<HTMLElement>(".star")].map((s) => {
        const r = s.getBoundingClientRect();
        return { x: Math.round(r.left - base.left + r.width / 2), y: Math.round(r.top - base.top + r.height / 2) };
      });
      setPoints((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [today]);

  if (!today) return <div className="today" aria-busy="true" />;
  return (
    <section className="today" aria-label="Today">
      <p className="today-when">{dayPart()}</p>
      <h1 className="today-head">{headline(today)}</h1>

      {today.items.length > 0 ? (
        <div className="today-list" ref={box}>
          <svg className="constellation-lines" aria-hidden="true">
            {points.length > 1 && <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} />}
          </svg>
          {today.items.map((i, n) => (
            <a key={`${i.kind}-${n}`} className="today-item" href={i.href} style={{ ["--sway" as string]: `${SWAY[n % SWAY.length]}px` }}>
              <span className="star-slot">
                <span className={`star${i.needs ? (n === 0 ? " vega" : " bright") : ""}`} />
              </span>
              <span className="today-label">
                <span className={i.needs || i.kind === "heads_up" || i.kind === "check_in" ? "on" : ""}>{i.label}</span>
                <span>{i.side}</span>
              </span>
              <span className="today-text">{i.text}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="today-empty">No tasks waiting, nothing scheduled in the next day. Ask me anything, or set up a morning brief in Tasks.</p>
      )}

      <SetupCard toast={toast} compact />

      <div className="today-quick">
        {(today.needs ? QUICK : QUIET).map((q) => (
          <button key={q} type="button" className="today-chip" onClick={() => onSend(q)}>
            {q}
          </button>
        ))}
      </div>
      {hasChat && (
        <button type="button" className="today-chat" onClick={onShowChat}>
          Back to the conversation
        </button>
      )}
    </section>
  );
}
