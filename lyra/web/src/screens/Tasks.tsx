import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, onChange, type Channel, type Task, type TaskDetail, type TaskStatus, type WorkerRun } from "../api";
import { ChannelIcon, CheckCircle, Chevron, Close, File as FileIcon, Pencil, Plus, Search, Star, Stop, Trash } from "../icons";
import { Thinking } from "../LyraMark";
import { Markdown } from "../markdown";
import { ScheduledSection } from "./Routines";
import { ago, parse } from "../when";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  up_next: "Up next",
  working: "Working",
  ready: "Ready for you",
  stopped: "Stopped",
  done: "Done",
};

/** Active tab, in the order they matter: what needs you first. */
const ACTIVE_ORDER: TaskStatus[] = ["ready", "working", "up_next", "stopped"];

export function StatusText({ status }: { status: TaskStatus }) {
  return <span className={`status s-${status}`}>{STATUS_LABEL[status]}</span>;
}

function subline(t: Task): string {
  const bits: string[] = [];
  if (t.kind === "research") bits.push("Research");
  if (t.channel_name) bits.push(t.channel_name);
  if (t.status === "ready" && t.needs) bits.push(t.needs);
  else if (t.steps_total) bits.push(`${t.steps_done} of ${t.steps_total} steps`);
  else if (t.brief) bits.push(t.brief.split("\n")[0]);
  return bits.join(" · ");
}

function TaskRowView({ t, onToggle }: { t: Task; onToggle: (t: Task) => void }) {
  const done = t.status === "done";
  return (
    <div className={`task-row${done ? " done" : ""}`}>
      <button
        className="task-check"
        aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`}
        aria-pressed={done}
        onClick={() => onToggle(t)}
      >
        <CheckCircle done={done} size={26} />
      </button>
      <a className="task-body" href={`#/t/${t.id}`}>
        <span className="task-title">{t.title}</span>
        <span className="task-sub">
          <StatusText status={t.status} />
          {subline(t) && <span className="task-more"> · {subline(t)}</span>}
        </span>
      </a>
    </div>
  );
}

/** Tomorrow at 9 in the morning, this device's time: when a "Later" task comes back. */
function tomorrowMorning(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

const snoozed = (t: Task) => !!t.snoozed_until && new Date(t.snoozed_until).getTime() > Date.now();

/** A ready task: a card that stands out, since it's waiting on you. */
function ReadyCard({ t }: { t: Task }) {
  return (
    <a className="ready-card" href={`#/t/${t.id}`}>
      <Star size={20} className="ready-star" />
      <span className="ready-body">
        <span className="task-title">{t.title}</span>
        <span className="task-sub">{t.needs || (t.channel_name ? t.channel_name : "Lyra finished its part")}</span>
      </span>
      <Chevron size={18} className="chev" />
    </a>
  );
}

/** Swipe left to put a task off until tomorrow, or mark it done. */
function SwipeRow({ children, onLater, onDone, laterLabel = "Later" }: { children: ReactNode; onLater: () => void; onDone: () => void; laterLabel?: string }) {
  const WIDTH = 152;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; dx: number; locked: boolean } | null>(null);
  // the click that ends a drag isn't a tap
  const dragged = useRef(false);
  const open = dx <= -WIDTH / 2;
  return (
    <div className="swipe">
      <div className="swipe-actions" aria-hidden={!open}>
        <button type="button" className="swipe-later" tabIndex={open ? 0 : -1} onClick={() => (setDx(0), onLater())}>
          {laterLabel}
        </button>
        <button type="button" className="swipe-done" tabIndex={open ? 0 : -1} onClick={() => (setDx(0), onDone())}>
          Done
        </button>
      </div>
      <div
        className={`swipe-front${dragging ? " dragging" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          dragged.current = false;
          start.current = { x: e.clientX, y: e.clientY, dx, locked: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (start.current = null); // scrolling
            if (Math.abs(mx) < 8) return;
            s.locked = true;
            dragged.current = true;
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          setDx(Math.max(-WIDTH - 24, Math.min(0, s.dx + mx)));
        }}
        onPointerUp={() => {
          if (start.current?.locked) setDx((d) => (d < -WIDTH / 2 ? -WIDTH : 0));
          start.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(0);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            dragged.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // a tap on an open row closes it instead of opening the task
          if (dx !== 0) {
            e.preventDefault();
            e.stopPropagation();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Puts children in the top bar's middle/right on the phone, or in the page on a computer. */
function TopSlot({ id, children }: { id: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(id)), [id]);
  return slot ? createPortal(children, slot) : <>{children}</>;
}

export function Tasks({ toast, channels, onCounts, wide = false }: { toast: (m: string) => void; channels: Channel[]; onCounts: () => void; wide?: boolean }) {
  const [tab, setTab] = useState<"active" | "done">(() => (sessionStorage.getItem("lyra.tasksTab") === "done" ? "done" : "active"));
  const [rows, setRows] = useState<Task[] | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .tasks({ status: tab === "done" ? "done" : "open", q: q || undefined })
      .then(setRows)
      .catch((e) => toast(e.message));
  }, [tab, q, toast]);

  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "task" && load()), [load]);
  useEffect(() => {
    try {
      sessionStorage.setItem("lyra.tasksTab", tab);
    } catch {
      /* private mode */
    }
  }, [tab]);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const toggle = async (t: Task) => {
    try {
      await api.updateTask(t.id, { status: t.status === "done" ? "up_next" : "done" });
      toast(t.status === "done" ? "Reopened" : "Marked done");
      load();
      onCounts();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const later = async (t: Task) => {
    try {
      await api.snoozeTask(t.id, tomorrowMorning().toISOString());
      toast("Back tomorrow morning");
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const bringBack = async (t: Task) => {
    try {
      await api.snoozeTask(t.id, null);
      toast("Back in Up next");
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const awake = (rows ?? []).filter((r) => !snoozed(r));
  const groups = tab === "active" ? ACTIVE_ORDER.map((s) => ({ status: s, items: awake.filter((r) => r.status === s) })) : [];
  const putOff = tab === "active" ? (rows ?? []).filter(snoozed) : [];

  const seg = (
    <div className="seg-tabs" role="tablist" aria-label="Tasks">
      {(["active", "done"] as const).map((k) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
          {k === "active" ? "Active" : "Done"}
        </button>
      ))}
    </div>
  );
  const searchBtn = (
    <button
      className="ring"
      aria-label={searching ? "Close search" : "Search tasks"}
      onClick={() => {
        if (searching) setQ("");
        setSearching((v) => !v);
      }}
    >
      {searching ? <Close size={20} /> : <Search size={20} />}
    </button>
  );

  return (
    <div className="screen tasks-screen">
      {wide ? (
        <div className="tasks-head">
          {seg}
          {searchBtn}
        </div>
      ) : (
        <>
          <TopSlot id="topbar-center">{seg}</TopSlot>
          <TopSlot id="topbar-right">{searchBtn}</TopSlot>
        </>
      )}

      {searching && (
        <input ref={searchRef} className="field search" type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
      )}

      {rows === null ? (
        <div className="center-load" style={{ height: 200 }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="tasks-empty">
          <p className="tasks-empty-title">{q ? "No tasks match." : tab === "done" ? "Nothing finished yet." : "Nothing on your plate."}</p>
          {!q && tab === "active" && <p>Hand Lyra something in chat, like “find me a plumber before Monday”, or tap + to add a task yourself.</p>}
        </div>
      ) : tab === "active" ? (
        <>
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section className={`task-group g-${g.status}`} key={g.status}>
                <h2 className="section-label">
                  {STATUS_LABEL[g.status]} <span className="count">{g.items.length}</span>
                </h2>
                {g.items.map((t) =>
                  t.status === "ready" ? (
                    <SwipeRow key={t.id} onLater={() => void later(t)} onDone={() => void toggle(t)}>
                      <ReadyCard t={t} />
                    </SwipeRow>
                  ) : t.status === "working" ? (
                    <TaskRowView key={t.id} t={t} onToggle={toggle} />
                  ) : (
                    <SwipeRow key={t.id} onLater={() => void later(t)} onDone={() => void toggle(t)}>
                      <TaskRowView t={t} onToggle={toggle} />
                    </SwipeRow>
                  ),
                )}
              </section>
            ))}
          {putOff.length > 0 && (
            <section className="task-group g-later">
              <h2 className="section-label">
                Later <span className="count">{putOff.length}</span>
              </h2>
              {putOff.map((t) => (
                <SwipeRow key={t.id} laterLabel="Now" onLater={() => void bringBack(t)} onDone={() => void toggle(t)}>
                  <TaskRowView t={t} onToggle={toggle} />
                </SwipeRow>
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="task-group">
          {rows.map((t) => (
            <TaskRowView key={t.id} t={t} onToggle={toggle} />
          ))}
        </section>
      )}

      {tab === "active" && !q && <ScheduledSection toast={toast} />}

      <button className="fab" aria-label="New task" onClick={() => setCreating(true)}>
        <Plus size={28} strokeWidth={2} />
      </button>

      {creating && (
        <NewTaskDialog
          channels={channels}
          toast={toast}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onCounts();
            location.hash = `#/t/${id}`;
          }}
        />
      )}
    </div>
  );
}

function NewTaskDialog({
  channels,
  toast,
  onClose,
  onCreated,
}: {
  channels: Channel[];
  toast: (m: string) => void;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [channelId, setChannelId] = useState<number | null>(null);
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 120);
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <div className="dialog-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Cancel" tabIndex={-1} onClick={onClose} />
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nt-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || busy) return;
          setBusy(true);
          try {
            const t = await api.createTask({ title, brief, channelId, kind: research ? "research" : "task" });
            onCreated(t.id);
          } catch (err) {
            toast((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <h2 id="nt-title" className="dialog-title">
          New task
        </h2>
        <div className="float-field">
          <input id="nt-name" ref={titleRef} value={title} maxLength={120} placeholder=" " onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="nt-name">Title</label>
        </div>
        <label className="field-label" htmlFor="nt-brief" style={{ marginTop: 20 }}>
          Details
        </label>
        <textarea
          id="nt-brief"
          className="field area"
          rows={3}
          value={brief}
          maxLength={4000}
          placeholder="What does done look like? Any limits?"
          onChange={(e) => setBrief(e.target.value)}
        />
        <label className="item research-pick">
          <span className="body">
            <div className="title">Research it</div>
            <div className="sub">A worker searches the web, reads the best sources, and writes you a report with them.</div>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={research} onChange={(e) => setResearch(e.target.checked)} />
        </label>
        {channels.length > 0 && (
          <>
            <p className="field-label" style={{ marginTop: 20 }} id="nt-ch">
              Channel
            </p>
            <div className="chip-row" role="radiogroup" aria-labelledby="nt-ch">
              <button type="button" role="radio" aria-checked={channelId === null} className={`pick${channelId === null ? " on" : ""}`} onClick={() => setChannelId(null)}>
                None
              </button>
              {channels.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={channelId === c.id} className={`pick${channelId === c.id ? " on" : ""}`} onClick={() => setChannelId(c.id)}>
                  <ChannelIcon name={c.icon} size={16} /> {c.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn ink" disabled={busy || !title.trim()}>
            Add task
          </button>
        </div>
      </form>
    </div>
  );
}

export function TaskPage({ id, toast, onCounts }: { id: number; toast: (m: string) => void; onCounts: () => void }) {
  const [d, setD] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [step, setStep] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | undefined>();
  const [runs, setRuns] = useState<WorkerRun[]>([]);
  const [report, setReport] = useState<{ id: number; title: string } | null>(null);

  const refresh = useCallback(() => {
    api.taskReport(id).then(setReport, () => {});
    api.task(id).then(setD, (e) => {
      toast(e.message);
      location.hash = "#/tasks";
    });
    api.taskActivity(id).then(setActivity, () => {});
    api.workerRuns(id).then(setRuns, () => {});
  }, [id, toast]);

  useEffect(refresh, [refresh]);
  useEffect(() => onChange((e) => e.type === "task" && e.taskId === id && refresh()), [id, refresh]);

  if (!d) return <div className="center-load">Loading…</div>;
  const { task, steps, log } = d;

  const run = async (fn: () => Promise<TaskDetail | void>, done?: string) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setD(next);
      if (done) toast(done);
      onCounts();
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: TaskStatus, msg: string) => run(() => api.updateTask(id, { status }), msg);
  const startWorker = async (note?: string) => {
    if (await run(() => api.startTask(id, note), note ? "Sent to the worker" : "Worker started")) {
      setAnswer("");
      refresh();
    }
  };
  const lastRun = runs.at(-1);
  const waitingOnYou = task.status === "ready" && lastRun?.status === "waiting";
  // the worker's latest result, if it finished
  const result = lastRun?.status === "finished" ? log.find((l) => l.who === "worker" && l.text.startsWith("Result: "))?.text.slice(8) : undefined;
  const chatHref = task.channel_id ? `#/c/${task.channel_id}` : "#/";

  return (
    <div className="screen task-page">
      <div className="task-meta">
        <StatusText status={task.status} />
        {task.kind === "research" && <span className="research-tag">Research</span>}
        {task.channel_name && (
          <a className="pick on small" href={`#/c/${task.channel_id}`}>
            <ChannelIcon name={task.channel_icon ?? "star"} size={14} /> {task.channel_name}
          </a>
        )}
      </div>

      {editing ? (
        <form
          className="task-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.updateTask(id, { title, brief }), "Saved")) setEditing(false);
          }}
        >
          <div className="float-field">
            <input id="te-title" value={title} maxLength={120} placeholder=" " onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="te-title">Title</label>
          </div>
          <label className="field-label" htmlFor="te-brief" style={{ marginTop: 20 }}>
            Details
          </label>
          <textarea id="te-brief" className="field area" rows={5} value={brief} maxLength={4000} onChange={(e) => setBrief(e.target.value)} />
          <div className="form-actions">
            <button type="button" className="btn quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn ink" disabled={busy || !title.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="bar" style={{ alignItems: "flex-start" }}>
            <h1 className="page-title">{task.title}</h1>
            <button
              className="ring"
              aria-label="Edit task"
              onClick={() => {
                setTitle(task.title);
                setBrief(task.brief);
                setEditing(true);
              }}
            >
              <Pencil size={20} />
            </button>
          </div>
          <p className="task-brief">{task.brief || "No details yet."}</p>
        </>
      )}

      {activity && (
        <div className="working-now">
          <Thinking label={activity} />
          <button className="btn quiet" disabled={busy} onClick={() => run(() => api.stopTask(id), "Stopped")}>
            <Stop size={16} /> Stop
          </button>
        </div>
      )}

      {report && (
        <a className="note task-note doc-note report-link" href={`#/d/${report.id}`}>
          <FileIcon size={16} />
          <span className="what">
            <b>Report</b> · {report.title}
          </span>
          <Chevron size={16} className="chev" />
        </a>
      )}

      {result && task.status !== "done" && (
        <div className="result-card">
          <p className="needs-label result-label">What the worker found</p>
          <div className="reply">
            <Markdown text={result} />
          </div>
        </div>
      )}

      {task.status === "ready" && task.needs && (
        <div className="needs">
          <p className="needs-label">{waitingOnYou ? "The worker is asking" : "Lyra needs from you"}</p>
          <p className="needs-text">{task.needs}</p>
          {waitingOnYou ? (
            <form
              className="answer"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) void startWorker(answer);
              }}
            >
              <input className="field" value={answer} placeholder="Your answer" onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" />
              <button className="btn ink" disabled={busy || !answer.trim()}>
                Send
              </button>
            </form>
          ) : (
            <a className="btn ink" href={chatHref}>
              Talk it over in chat
            </a>
          )}
        </div>
      )}

      <section className="section">
        <h2 className="section-label">
          Steps {steps.length > 0 && <span className="count">{`${task.steps_done}/${task.steps_total}`}</span>}
        </h2>
        <div className="steps">
          {steps.map((s) => (
            <div className={`step${s.done ? " done" : ""}`} key={s.id}>
              <button className="task-check" aria-label={s.done ? `Reopen ${s.text}` : `Finish ${s.text}`} aria-pressed={!!s.done} onClick={() => run(() => api.setTaskStep(s.id, !s.done))}>
                <CheckCircle done={!!s.done} size={22} />
              </button>
              <span className="step-text">{s.text}</span>
              <button className="icon-btn small" aria-label={`Remove ${s.text}`} onClick={() => run(() => api.removeTaskStep(id, s.id))}>
                <Close size={16} />
              </button>
            </div>
          ))}
          <form
            className="step add"
            onSubmit={async (e) => {
              e.preventDefault();
              if (step.trim() && (await run(() => api.addTaskStep(id, step)))) setStep("");
            }}
          >
            <span className="task-check" aria-hidden="true">
              <Plus size={20} />
            </span>
            <input className="step-input" value={step} maxLength={200} placeholder="Add a step" onChange={(e) => setStep(e.target.value)} aria-label="Add a step" />
          </form>
        </div>
      </section>

      <section className="section">
        <div className="task-actions">
          {!activity && (task.status === "up_next" || task.status === "stopped") && (
            <button className="btn primary" disabled={busy} onClick={() => startWorker()}>
              {runs.length ? "Resume worker" : "Start worker"}
            </button>
          )}
          {task.status !== "done" ? (
            <button className="btn ink" disabled={busy} onClick={() => setStatus("done", "Marked done")}>
              Mark done
            </button>
          ) : (
            <button className="btn ink" disabled={busy} onClick={() => setStatus("up_next", "Reopened")}>
              Reopen
            </button>
          )}
          {!activity && task.status !== "stopped" && task.status !== "done" && (
            <button className="btn quiet" disabled={busy} onClick={() => setStatus("stopped", "Stopped")}>
              Stop
            </button>
          )}
          {task.status === "stopped" && (
            <button className="btn quiet" disabled={busy} onClick={() => setStatus("up_next", "Back in Up next")}>
              Move to Up next
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Log</h2>
        <ol className="log-list">
          {log.map((l) => (
            <li key={l.id} className={`log-${l.who}`}>
              <span className="log-dot" aria-hidden="true" />
              <span className="log-text">{l.text}</span>
              <span className="log-when">{ago(parse(l.at))}</span>
            </li>
          ))}
        </ol>
        {runs.length > 0 ? (
          <a className="item flat worker-link" href={`#/t/${id}/log`}>
            <span className="body">
              <div className="title">Worker log</div>
              <div className="sub">
                {runs.length} {runs.length === 1 ? "run" : "runs"} · every step the worker took
              </div>
            </span>
            <Chevron className="chev" />
          </a>
        ) : (
          <p className="hint" style={{ marginLeft: 0 }}>
            Start a worker and it writes its progress here as it goes.
          </p>
        )}
      </section>

      <section className="section">
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Delete “${task.title}”? Its steps and log go too.`)) return;
            if (await run(() => api.deleteTask(id), "Task deleted")) location.hash = "#/tasks";
          }}
        >
          <Trash size={18} /> Delete task
        </button>
      </section>
    </div>
  );
}

const RUN_LABEL: Record<WorkerRun["status"], string> = {
  running: "Working",
  waiting: "Waiting for you",
  finished: "Finished",
  failed: "Stopped with an error",
  stopped: "Stopped",
};

interface LogPart {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
}

/** Everything a worker did on a task: its thinking out loud, each tool call and what came back. */
export function WorkerLog({ id }: { id: number }) {
  const [runs, setRuns] = useState<WorkerRun[] | null>(null);
  const [title, setTitle] = useState("");
  const load = useCallback(() => {
    api.workerRuns(id).then(setRuns, () => setRuns([]));
    api.task(id).then((d) => setTitle(d.task.title), () => {});
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "task" && e.taskId === id && load()), [id, load]);

  if (!runs) return <div className="center-load">Loading…</div>;
  const short = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const plain = (s: string) => s.replace(/<\/?untrusted_data[^>]*>/g, "").trim();

  return (
    <div className="screen worker-log">
      <h1 className="page-title">Worker log</h1>
      <p className="page-sub">{title}</p>
      {runs.length === 0 && <p className="mem-empty">No worker has run on this task yet.</p>}
      {runs.map((r, i) => {
        const msgs = JSON.parse(r.transcript) as { role: string; parts: LogPart[] }[];
        return (
          <section className="section" key={r.id}>
            <h2 className="section-label">
              Run {i + 1}{" "}
              <span className="blurb">
                {RUN_LABEL[r.status]} · {r.steps} {r.steps === 1 ? "step" : "steps"} · started {ago(parse(r.started_at))}
              </span>
            </h2>
            <ol className="wl">
              {msgs.flatMap((m, mi) =>
                m.parts.map((p, pi) => {
                  const key = `${mi}-${pi}`;
                  if (p.type === "text" && p.text?.trim())
                    return (
                      <li key={key} className={m.role === "user" ? "wl-you" : "wl-think"}>
                        <span className="wl-kind">{m.role === "user" ? "Instruction" : "Worker"}</span>
                        <span className="wl-text">{short(p.text)}</span>
                      </li>
                    );
                  if (p.type === "tool_call")
                    return (
                      <li key={key} className="wl-call">
                        <span className="wl-kind">{p.name?.replace("__", " · ")}</span>
                        <code className="wl-text">{short(JSON.stringify(p.input ?? {}), 300)}</code>
                      </li>
                    );
                  if (p.type === "tool_result")
                    return (
                      <li key={key} className={`wl-result${p.isError ? " bad" : ""}`}>
                        <span className="wl-kind">{p.isError ? "Problem" : "Result"}</span>
                        <span className="wl-text">{short(plain(p.content ?? ""))}</span>
                      </li>
                    );
                  return null;
                }),
              )}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
