import { useCallback, useEffect, useState } from "react";
import { api, onChange } from "../api";
import type { AdminItem } from "../../../core/lifeadmin";
import { describeItem, whenWord } from "../../../core/lifeadmin";
import { ago, parse } from "../when";

type View = Awaited<ReturnType<typeof api.lifeAdmin>>;

const GROUPS: { kind: AdminItem["kind"]; title: string; done: string }[] = [
  { kind: "bill", title: "Bills", done: "Paid" },
  { kind: "subscription", title: "Subscriptions", done: "Cancelled" },
  { kind: "package", title: "Packages", done: "Got it" },
  { kind: "trip", title: "Trips", done: "Done" },
  { kind: "return", title: "Returns", done: "Returned" },
];

const gmail = (thread: string) => `https://mail.google.com/mail/u/0/#all/${thread}`;

/** Phase 18: bills, subscriptions, packages, trips and returns Lyra found in the inbox. */
export function LifeAdmin({ toast }: { toast: (m: string) => void }) {
  const [v, setV] = useState<View | null>(null);
  const load = useCallback(() => void api.lifeAdmin().then(setV, () => {}), []);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "admin" && load()), [load]);

  const scan = async () => {
    try {
      const r = await api.scanLifeAdmin();
      toast(r.added || r.updated ? `Found ${r.added} new${r.updated ? `, updated ${r.updated}` : ""}` : "Nothing new in your mail");
    } catch (e) {
      toast((e as Error).message);
    }
    load();
  };
  const mark = async (i: AdminItem, status: AdminItem["status"], done: string) => {
    try {
      await api.setAdminStatus(i.id, status);
      toast(status === "open" ? "Back on the list" : status === "dismissed" ? "Removed" : done);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (!v) return <p className="hint">Loading…</p>;
  if (!v.gmail)
    return (
      <div className="tasks-empty">
        <p className="tasks-empty-title">Connect Gmail to start.</p>
        <p>Lyra goes through your mail once a day for bills, subscriptions, packages, trips and return windows, and tells you before anything's due. Read-only: Lyra never pays, cancels or replies.</p>
        <a className="btn quiet" href="#/access">
          Connections
        </a>
      </div>
    );

  return (
    <div className="admin">
      <div className="admin-head">
        <p className="page-sub">
          {v.scanning ? "Going through your mail…" : v.lastScan ? `Checked your mail ${ago(parse(v.lastScan))}` : "Not checked yet"}
          {v.total ? ` · Subscriptions about ${v.total} a month` : ""}
        </p>
        <button className="btn quiet" disabled={v.scanning} onClick={() => void scan()}>
          {v.scanning ? "Checking…" : "Check now"}
        </button>
      </div>

      {!v.items.length && !v.scanning && (
        <div className="tasks-empty">
          <p className="tasks-empty-title">{v.lastScan ? "Nothing coming up." : "Nothing here yet."}</p>
          <p>{v.lastScan ? "No bills, renewals, deliveries, trips or return windows in your recent mail." : "Tap Check now, or Lyra will go through your mail later today."}</p>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = v.items.filter((i) => i.kind === g.kind);
        if (!list.length) return null;
        return (
          <section className="section" key={g.kind}>
            <h2 className="section-label">{g.title}</h2>
            <div className="group">
              {list.map((i) => {
                const days = i.due_on ? Math.round((Date.parse(`${i.due_on}T12:00:00Z`) - Date.parse(`${v.today}T12:00:00Z`)) / 86_400_000) : null;
                const soon = days !== null && days <= 3 && (i.kind === "bill" || i.kind === "return");
                return (
                  <div className={`item admin-item${soon ? " soon" : ""}`} key={i.id}>
                    <span className="body">
                      <div className="title">{i.kind === "package" || i.kind === "trip" || i.kind === "return" ? i.title : i.who}</div>
                      <div className="sub">
                        {describeItem(i, v.today)}
                        {i.detail && i.kind !== "trip" ? ` · ${i.detail}` : ""}
                      </div>
                      <div className="admin-actions">
                        <a className="triage-btn" href={gmail(i.thread)} target="_blank" rel="noreferrer noopener">
                          Open in Gmail
                        </a>
                        <button className="triage-btn" onClick={() => void mark(i, "done", g.done)}>
                          {g.done}
                        </button>
                        <button className="triage-btn" onClick={() => void mark(i, "dismissed", "")} aria-label={`Not mine: ${i.title}`}>
                          Not mine
                        </button>
                      </div>
                    </span>
                    {i.due_on && <span className={`admin-when${soon ? " soon" : ""}`}>{whenWord(i.due_on, v.today)}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {v.done.length > 0 && (
        <details className="admin-done">
          <summary>Done and removed ({v.done.length})</summary>
          <div className="group">
            {v.done
              .slice()
              .reverse()
              .map((i) => (
                <div className="item" key={i.id}>
                  <span className="body">
                    <div className="title">{i.kind === "subscription" || i.kind === "bill" ? i.who : i.title}</div>
                    <div className="sub">{i.status === "dismissed" ? "Removed" : "Done"}</div>
                  </span>
                  <button className="btn text" onClick={() => void mark(i, "open", "")}>
                    Put back
                  </button>
                </div>
              ))}
          </div>
        </details>
      )}

      <label className="item admin-switch">
        <span className="body">
          <div className="title">Check my mail every day</div>
          <div className="sub">Read-only. Lyra never pays, cancels or replies; heads-ups come a few days before anything's due.</div>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={v.on}
          onChange={(e) => void api.setLifeAdmin(e.target.checked).then(() => toast(e.target.checked ? "Lyra will check every day" : "Daily check off"))}
        />
      </label>
    </div>
  );
}
