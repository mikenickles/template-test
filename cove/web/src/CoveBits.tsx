// Small pieces of Cove's look that several screens share: the soft brush strokes, and
// "While you were away" (a card on the welcome screen, a short timeline on Tasks).
import { useEffect, useState } from "react";
import type { Activity } from "../../core/activity";
import { api } from "./api";
import { Chevron, Moon } from "./icons";
import { ago, parse } from "./when";

/** Soft painted strokes in the corner of a page. Pure decoration. */
export function Brushes({ place = "top-right" }: { place?: "top-right" | "top-left" | "footer" }) {
  if (place === "footer")
    return (
      <svg className="brush brush-footer" viewBox="0 0 200 24" aria-hidden="true">
        <path d="M4 15 C 40 4, 70 22, 104 12 S 168 6, 196 13" />
        <path d="M34 20 C 70 13, 110 22, 150 16" />
      </svg>
    );
  return (
    <svg className={`brush brush-${place}`} viewBox="0 0 260 150" aria-hidden="true">
      <path d="M8 40 C 60 10, 110 70, 170 38 S 240 18, 262 30" />
      <path d="M60 112 C 120 92, 170 128, 262 98" />
    </svg>
  );
}

const DAY = 24 * 3600_000;

/** What Cove did lately that's worth a look (quiet checks left out), newest first. */
function useRecent(limit: number): Activity[] | null {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    void api.activity().then(
      (all) => setItems(all.filter((a) => a.status !== "quiet" && Date.now() - parse(a.at).getTime() < DAY).slice(0, limit)),
      () => setItems([]),
    );
  }, [limit]);
  return items;
}

/** The welcome screen's card: how many things happened, and the newest one. */
export function AwayCard() {
  const items = useRecent(20);
  if (!items?.length) return null;
  const first = items[0];
  return (
    <a className="away-card" href="#/activity">
      <span className="away-card-icon">
        <Moon size={20} />
      </span>
      <span className="away-card-body">
        <b>While you were away</b>
        <span>
          {items.length === 1 ? "1 update" : `${items.length} updates`} · {first.title.toLowerCase().startsWith(first.summary.toLowerCase().slice(0, 12)) ? first.title : first.summary || first.title}
        </span>
      </span>
      <Chevron size={18} className="chev" />
    </a>
  );
}

/** Tasks: the last few things Cove did, as a little timeline. */
export function AwayTimeline() {
  const items = useRecent(4);
  if (!items?.length) return null;
  return (
    <section className="away-timeline">
      <h2 className="serif-title">While you were away</h2>
      <ol>
        {items.map((a) => (
          <li key={a.id} className={a.status === "running" || a.status === "waiting" ? "live" : ""}>
            <span className="away-dot" aria-hidden="true" />
            <span className="away-when">{parse(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            <a className="away-what" href="#/activity">
              {a.title}
            </a>
            {a.summary && a.summary !== a.title && <span className="away-sub">{a.summary}</span>}
          </li>
        ))}
      </ol>
      <span className="sr-only">{ago(parse(items[0].at))}</span>
    </section>
  );
}
