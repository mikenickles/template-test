import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Channel, type Task, type TaskDetail, type TaskStatus } from "../api";
import { ChannelIcon, CheckCircle, Close, Pencil, Plus, Search, Trash } from "../icons";
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

export function Tasks({ toast, channels, onCounts }: { toast: (m: string) => void; channels: Channel[]; onCounts: () => void }) {
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

  const groups = tab === "active" ? ACTIVE_ORDER.map((s) => ({ status: s, items: (rows ?? []).filter((r) => r.status === s) })) : [];

  return (
    <div className="screen tasks-screen">
      <div className="tasks-head">
        <div className="tabs" role="tablist">
          {(["active", "done"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
              {k === "active" ? "Active" : "Done"}
            </button>
          ))}
        </div>
        <button
          className="icon-btn"
          aria-label={searching ? "Close search" : "Search tasks"}
          onClick={() => {
            if (searching) setQ("");
            setSearching((v) => !v);
          }}
        >
          {searching ? <Close size={22} /> : <Search size={22} />}
        </button>
      </div>

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
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section className="task-group" key={g.status}>
              <h2 className="section-label">
                {STATUS_LABEL[g.status]} <span className="count">{g.items.length}</span>
              </h2>
              {g.items.map((t) => (
                <TaskRowView key={t.id} t={t} onToggle={toggle} />
              ))}
            </section>
          ))
      ) : (
        <section className="task-group">
          {rows.map((t) => (
            <TaskRowView key={t.id} t={t} onToggle={toggle} />
          ))}
        </section>
      )}

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
            const t = await api.createTask({ title, brief, channelId });
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.task(id).then(setD, (e) => {
      toast(e.message);
      location.hash = "#/tasks";
    });
  }, [id, toast]);

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
  const chatHref = task.channel_id ? `#/c/${task.channel_id}` : "#/";

  return (
    <div className="screen task-page">
      <div className="task-meta">
        <StatusText status={task.status} />
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

      {task.status === "ready" && task.needs && (
        <div className="needs">
          <p className="needs-label">Lyra needs from you</p>
          <p className="needs-text">{task.needs}</p>
          <a className="btn ink" href={chatHref}>
            Answer in chat
          </a>
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
          {task.status !== "done" ? (
            <button className="btn ink" disabled={busy} onClick={() => setStatus("done", "Marked done")}>
              Mark done
            </button>
          ) : (
            <button className="btn ink" disabled={busy} onClick={() => setStatus("up_next", "Reopened")}>
              Reopen
            </button>
          )}
          {task.status !== "stopped" && task.status !== "done" && (
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
        {!log.some((l) => l.who === "worker") && (
          <p className="hint" style={{ marginLeft: 0 }}>
            When background workers arrive (Phase 4), each one writes its progress here.
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
