import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, onChange, type Activity as Item, type ActivityDetail, type ActivityKind } from "../api";
import { Bell, Calendar, Check, Chevron, Close, Mail, Notebook, Refresh, Spark, Star, TasksIcon, User } from "../icons";
import { Avatar } from "../LyraMark";
import { Markdown } from "../markdown";
import { clock, dayLabel, parse } from "../when";

const FILTERS: { id: string; label: string; kinds?: ActivityKind[] }[] = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks", kinds: ["task"] },
  { id: "routines", label: "Routines", kinds: ["routine"] },
  { id: "own", label: "On her own", kinds: ["heads_up", "check_in", "life_admin", "tidy", "style"] },
  { id: "reminders", label: "Reminders", kinds: ["reminder", "follow_up"] },
];

const ICON: Record<ActivityKind, ReactNode> = {
  task: <TasksIcon size={20} />,
  routine: <Refresh size={20} />,
  heads_up: <Spark size={20} />,
  check_in: <Star size={20} />,
  reminder: <Bell size={20} />,
  follow_up: <Calendar size={20} />,
  life_admin: <Mail size={20} />,
  tidy: <Notebook size={20} />,
  style: <User size={20} />,
};

const STATUS: Record<Item["status"], string> = {
  running: "Working",
  done: "Completed",
  quiet: "Nothing new",
  waiting: "Waiting for you",
  failed: "Didn't finish",
  stopped: "Stopped",
  missed: "Missed",
};

/** Everything Lyra did on her own, by day; tap one to see what it came to and the steps it took. */
export function Activity({ toast }: { toast: (m: string) => void }) {
  const [filter, setFilter] = useState(() => sessionStorage.getItem("lyra.activityFilter") ?? "all");
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    void api.activity(FILTERS.find((f) => f.id === filter)?.kinds).then(setItems, () => setItems([]));
  }, [filter]);
  useEffect(() => {
    load();
    sessionStorage.setItem("lyra.activityFilter", filter);
  }, [load, filter]);
  // new runs, posts and scans show up as they happen
  useEffect(() => onChange((e) => ["task", "routine", "message", "admin"].includes(e.type) && load()), [load]);

  const working = items?.filter((i) => i.status === "running").length ?? 0;
  const days: [string, Item[]][] = [];
  for (const i of items ?? []) {
    const d = dayLabel(parse(i.at));
    const last = days[days.length - 1];
    if (last && last[0] === d) last[1].push(i);
    else days.push([d, [i]]);
  }

  return (
    <div className="screen activity">
      <div className="activity-head">
        <span className="orb orb-lg">
          <Avatar />
        </span>
        <h1 className="activity-name">Lyra</h1>
        <p className="activity-status">{working ? `Working on ${working === 1 ? "something" : `${working} things`}` : "Here for you"}</p>
      </div>

      <div className="activity-filters" role="tablist" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="hint">Loading…</p>
      ) : items.length === 0 ? (
        <div className="tasks-empty">
          <p className="tasks-empty-title">Nothing yet.</p>
          <p>When Lyra works on a task, runs a routine, checks your mail or gives you a heads-up, it shows here, step by step.</p>
        </div>
      ) : (
        <>
          <p className="activity-count">
            {items.length} {items.length === 1 ? "thing" : "things"} Lyra did
          </p>
          {days.map(([day, list]) => {
            const shut = closed.has(day);
            return (
              <section key={day} className="activity-day">
                <button
                  className="activity-day-head"
                  aria-expanded={!shut}
                  onClick={() =>
                    setClosed((s) => {
                      const n = new Set(s);
                      if (n.has(day)) n.delete(day);
                      else n.add(day);
                      return n;
                    })
                  }
                >
                  <span>{day}</span>
                  <Chevron size={16} className={`activity-chev${shut ? "" : " open"}`} />
                </button>
                {!shut &&
                  list.map((i) => (
                    <button key={i.id} className="activity-row" onClick={() => setOpen(i.id)}>
                      <span className={`activity-icon k-${i.kind}${i.status === "running" ? " live" : ""}`}>{ICON[i.kind]}</span>
                      <span className="activity-body">
                        <span className="activity-title">{i.title}</span>
                        {i.summary && <span className="activity-summary">{i.summary}</span>}
                        <span className="activity-time">
                          {i.status !== "done" && <span className={`activity-state s-${i.status}`}>{STATUS[i.status]} · </span>}
                          {clock(parse(i.at))}
                        </span>
                      </span>
                    </button>
                  ))}
              </section>
            );
          })}
        </>
      )}

      {open && <ActivitySheet id={open} toast={toast} onClose={() => setOpen(null)} />}
    </div>
  );
}

const SHOWN = 10;

function ActivitySheet({ id, toast, onClose }: { id: string; toast: (m: string) => void; onClose: () => void }) {
  const [d, setD] = useState<ActivityDetail | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    api.activityDetail(id).then(setD, (e) => {
      toast((e as Error).message);
      onClose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const steps = d ? (all ? d.steps : d.steps.slice(-SHOWN)) : [];
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet activity-sheet" role="dialog" aria-modal="true" aria-label={d?.title ?? "Activity"}>
        {!d ? (
          <p className="hint">Loading…</p>
        ) : (
          <>
            <div className="activity-sheet-top">
              <span className={`activity-pill s-${d.status}`}>{STATUS[d.status]}</span>
              <span className="activity-when">{clock(parse(d.at))}</span>
              <button className="ring activity-close" aria-label="Close" onClick={onClose}>
                <Close size={18} />
              </button>
            </div>
            <h2 className="activity-sheet-title">{d.title}</h2>
            {/* the summary is the result's first line: say it once */}
            {d.summary && !d.body.trim().startsWith(d.summary.replace(/…$/, "")) && <p className="activity-sheet-summary">{d.summary}</p>}
            {d.body && (
              <div className="activity-sheet-body">
                <Markdown text={d.body} />
              </div>
            )}
            {d.steps.length > 0 && (
              <>
                {d.steps.length > SHOWN && !all && (
                  <button className="link-btn activity-earlier" onClick={() => setAll(true)}>
                    Show earlier steps ({d.steps.length - SHOWN})
                  </button>
                )}
                <h3 className="section-label">Steps</h3>
                <ol className="activity-steps">
                  {steps.map((s, i) => (
                    <li key={i} className={s.ok ? "ok" : "bad"}>
                      <span className="activity-tick" aria-label={s.ok ? "Done" : "Didn't work"}>
                        {s.ok ? <Check size={16} /> : <Close size={14} />}
                      </span>
                      <span>
                        <span className="activity-step">{s.label}</span>
                        {s.detail && <span className="activity-step-detail">{s.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {d.links.length > 0 && (
              <div className="action-buttons">
                {d.links.map((l) => (
                  <a key={l.href} className="btn quiet" href={l.href} onClick={onClose}>
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
