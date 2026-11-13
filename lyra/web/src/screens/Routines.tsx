import { useCallback, useEffect, useState } from "react";
import { compactTimes } from "../../../core/routines";
import { api, onChange, type Channel, type Reminder, type Routine, type RoutineRun } from "../api";
import { Bell, ChannelIcon, Chevron, Clock, Close, Plus, Trash } from "../icons";
import { Thinking } from "../LyraMark";
import { ago, parse } from "../when";

const RUN_LABEL: Record<RoutineRun["status"], string> = {
  running: "Running",
  posted: "Posted",
  quiet: "Nothing new",
  failed: "Didn't finish",
  missed: "Missed",
};

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nextLabel(r: Routine): string {
  if (!r.enabled) return "Paused";
  if (r.running) return "Running now";
  if (!r.next_run_at) return r.schedule;
  const d = parse(r.next_run_at);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Next today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Next tomorrow at ${time}`;
  return `Next ${d.toLocaleDateString(undefined, { weekday: "long" })} at ${time}`;
}

/** The "Scheduled" section of the Tasks tab. */
export function ScheduledSection({ toast }: { toast: (m: string) => void }) {
  const [rows, setRows] = useState<Routine[] | null>(null);
  const [soon, setSoon] = useState<Reminder[]>([]);
  const loadSoon = useCallback(() => void api.reminders().then(setSoon, () => {}), []);
  useEffect(loadSoon, [loadSoon]);
  useEffect(() => onChange((e) => e.type === "reminder" && loadSoon()), [loadSoon]);
  const [open, setOpen] = useState(() => sessionStorage.getItem("lyra.scheduledOpen") !== "0");
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => void api.routines().then(setRows, () => setRows([])), []);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "routine" && load()), [load]);
  useEffect(() => {
    try {
      sessionStorage.setItem("lyra.scheduledOpen", open ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [open]);

  const toggle = async (r: Routine, on: boolean) => {
    try {
      await api.updateRoutine(r.id, { enabled: on });
      toast(on ? `${r.name} is on` : `${r.name} paused`);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className="task-group scheduled">
      <div className="bar">
        <button className="section-label link-like" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Scheduled {rows && rows.length + soon.length > 0 && <span className="count">{rows.length + soon.length}</span>}
          <Chevron size={14} className={`fold${open ? " open" : ""}`} />
        </button>
        <button className="btn quiet small-btn" onClick={() => setAdding(true)}>
          <Plus size={16} /> Routine
        </button>
      </div>
      {open && soon.length > 0 && (
        <div className="group reminders">
          {soon.map((r) => (
            <div className="item" key={`r${r.id}`}>
              <span className="tile">{r.kind === "remind" ? <Bell size={20} /> : <Clock size={20} />}</span>
              <span className="body">
                <div className="title">{r.text}</div>
                <div className="sub">
                  {r.kind === "remind" ? "Reminder" : "Lyra checks back"} · {whenLabel(r.due_at)}
                  {r.channel_name ? ` · ${r.channel_name}` : ""}
                </div>
              </span>
              <button
                className="icon-btn"
                aria-label={`Cancel ${r.kind === "remind" ? "reminder" : "follow-up"}: ${r.text}`}
                onClick={async () => {
                  try {
                    await api.cancelReminder(r.id);
                    toast("Cancelled");
                    loadSoon();
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Close size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      {open &&
        (rows?.length ? (
          <div className="group">
            {rows.map((r) => (
              <div className="item" key={r.id}>
                <a className="body routine-link" href={`#/r/${r.id}`}>
                  <div className="title">{r.name}</div>
                  <div className="sub">
                    {r.schedule} · {nextLabel(r)}
                  </div>
                </a>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  aria-label={`${r.name} on`}
                  checked={!!r.enabled}
                  onChange={(e) => toggle(r, e.target.checked)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mem-empty">
            Routines check things on a schedule and post here only when there's news. Add a morning brief, or ask Lyra: “every Friday at 4, check for school emails”.
          </p>
        ))}
      {adding && <AddRoutineDialog toast={toast} onClose={() => setAdding(false)} onAdded={() => (setAdding(false), load())} />}
    </section>
  );
}

function AddRoutineDialog({ toast, onClose, onAdded }: { toast: (m: string) => void; onClose: () => void; onAdded: () => void }) {
  const [presets, setPresets] = useState<Awaited<ReturnType<typeof api.routinePresets>>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => void api.routinePresets().then(setPresets, () => {}), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  const add = async (key: string) => {
    setBusy(true);
    try {
      const r = await api.addPreset(key);
      toast(`${r.name} added`);
      onAdded();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Cancel" tabIndex={-1} onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="ar-title">
        <h2 id="ar-title" className="dialog-title">
          Add a routine
        </h2>
        <div className="group">
          {presets.map((p) => (
            <button key={p.key} className="item" disabled={busy || p.added} onClick={() => add(p.key)}>
              <span className="tile">
                <Clock />
              </span>
              <span className="body">
                <div className="title">{p.name}</div>
                <div className="sub">{p.added ? "Already added" : p.blurb}</div>
              </span>
              {!p.added && <Plus className="chev" />}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginLeft: 0 }}>
          Want something else? Tell Lyra in chat, like “every Sunday evening, tell me what's on next week”.
        </p>
        <div className="dialog-actions" style={{ gridTemplateColumns: "1fr" }}>
          <button className="btn quiet" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoutinePage({ id, toast, channels }: { id: number; toast: (m: string) => void; channels: Channel[] }) {
  const [data, setData] = useState<{ routine: Routine; runs: RoutineRun[] } | null>(null);
  const [draft, setDraft] = useState<{ name: string; instructions: string; times: string; days: string; always: boolean; channelId: number | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      void api.routine(id).then(setData, (e) => {
        toast(e.message);
        location.hash = "#/tasks";
      }),
    [id, toast],
  );
  useEffect(load, [load]);
  useEffect(() => onChange((e) => (e.type === "routine" && e.routineId === id) || e.type === "message" ? load() : undefined), [id, load]);

  if (!data) return <div className="center-load">Loading…</div>;
  const { routine: r, runs } = data;

  const save = async (patch: Parameters<typeof api.updateRoutine>[1], msg: string) => {
    setBusy(true);
    try {
      await api.updateRoutine(id, patch);
      toast(msg);
      load();
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (draft)
    return (
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await save(
            { name: draft.name, instructions: draft.instructions, times: draft.times, days: draft.days, postMode: draft.always ? "always" : "news", channelId: draft.channelId },
            "Saved",
          );
          if (ok) setDraft(null);
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 24 }}>
          Edit routine
        </h1>
        <div className="float-field">
          <input id="rt-name" value={draft.name} maxLength={60} placeholder=" " onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label htmlFor="rt-name">Name</label>
        </div>
        <label className="field-label" htmlFor="rt-times" style={{ marginTop: 20 }}>
          Times (like 07:00, 18:30 or "every 15 min")
        </label>
        <input id="rt-times" className="field" value={draft.times} autoCapitalize="off" onChange={(e) => setDraft({ ...draft, times: e.target.value })} />
        <p className="field-label" style={{ marginTop: 20 }} id="rt-days">
          Days
        </p>
        <div className="day-picks" role="group" aria-labelledby="rt-days">
          {DAYS.map((d, i) => {
            const on = draft.days.includes(String(i));
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[i]}
                className={`day-pick${on ? " on" : ""}`}
                onClick={() => setDraft({ ...draft, days: on ? draft.days.replace(String(i), "") : `${draft.days}${i}` })}
              >
                {d}
              </button>
            );
          })}
        </div>
        <label className="field-label" htmlFor="rt-ins" style={{ marginTop: 20 }}>
          What to check
        </label>
        <textarea id="rt-ins" className="field area" rows={6} value={draft.instructions} maxLength={2000} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
        <label className="item flat switch-row">
          <span className="body">
            <div className="title">Post every time</div>
            <div className="sub">Off: only when there's something new.</div>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={draft.always} onChange={(e) => setDraft({ ...draft, always: e.target.checked })} />
        </label>
        {channels.length > 0 && (
          <>
            <p className="field-label" style={{ marginTop: 20 }} id="rt-ch">
              Posts in
            </p>
            <div className="chip-row" role="radiogroup" aria-labelledby="rt-ch">
              <button type="button" role="radio" aria-checked={draft.channelId === null} className={`pick${draft.channelId === null ? " on" : ""}`} onClick={() => setDraft({ ...draft, channelId: null })}>
                Everything
              </button>
              {channels.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={draft.channelId === c.id} className={`pick${draft.channelId === c.id ? " on" : ""}`} onClick={() => setDraft({ ...draft, channelId: c.id })}>
                  <ChannelIcon name={c.icon} size={16} /> {c.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn quiet" onClick={() => setDraft(null)}>
            Cancel
          </button>
          <button type="submit" className="btn ink" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    );

  return (
    <div className="screen routine-page">
      <p className="task-meta">
        <span className={`status ${r.enabled ? "s-working-static" : "s-up_next"}`}>{r.enabled ? "On" : "Paused"}</span>
        {r.channel_name && <span className="pick on small">{r.channel_name}</span>}
      </p>
      <h1 className="page-title">{r.name}</h1>
      <p className="task-brief">
        {r.schedule}. {r.post_mode === "always" ? "Posts every time." : "Posts only when there's news."} {r.enabled && nextLabel(r)}.
      </p>

      {r.running && (
        <div className="working-now">
          <Thinking label="Running" />
        </div>
      )}

      <section className="section">
        <h2 className="section-label">What it checks</h2>
        <p className="routine-ins">{r.instructions}</p>
      </section>

      <section className="section">
        <div className="task-actions">
          <button className="btn primary" disabled={busy || r.running} onClick={() => (void api.runRoutine(id), toast("Running now"))}>
            Run now
          </button>
          <button
            className="btn quiet"
            onClick={() =>
              setDraft({ name: r.name, instructions: r.instructions, times: compactTimes(r.times), days: r.days, always: r.post_mode === "always", channelId: r.channel_id })
            }
          >
            Edit
          </button>
          <button className="btn quiet" disabled={busy} onClick={() => save({ enabled: !r.enabled }, r.enabled ? "Paused" : "Turned on")}>
            {r.enabled ? "Pause" : "Turn on"}
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">History</h2>
        {runs.length ? (
          <ol className="log-list">
            {runs.map((x) => (
              <li key={x.id} className={x.status === "posted" ? "log-lyra" : "log-you"}>
                <span className="log-dot" aria-hidden="true" />
                <span className="log-text">
                  <b>{RUN_LABEL[x.status]}</b>
                  {x.note ? ` · ${x.note}` : ""}
                </span>
                <span className="log-when">{ago(parse(x.started_at))}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mem-empty">It hasn't run yet.</p>
        )}
        {r.last_summary && (
          <div className="result-card">
            <p className="needs-label result-label">Last post</p>
            <p className="routine-ins">{r.last_summary}</p>
          </div>
        )}
        <p className="hint" style={{ marginLeft: 0 }}>
          Phones don't let apps think in the background. At each time you'll get a notification; Lyra runs the routine while it's open, or as soon as you open it (within 12 hours).
        </p>
      </section>

      <section className="section">
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Delete “${r.name}”?`)) return;
            await api.deleteRoutine(id);
            toast("Routine deleted");
            location.hash = "#/tasks";
          }}
        >
          <Trash size={18} /> Delete routine
        </button>
      </section>
    </div>
  );
}

/** "Today 4:00 PM", "Tomorrow 9:00 AM", "Thu, Nov 20, 9:00 AM" */
function whenLabel(iso: string, now = new Date()): string {
  const d = parse(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}
