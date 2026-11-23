// Artifacts: what Lyra made for you to keep. Docs (Phase 13: plans, lists, notes, to read,
// edit, share and save to Google Docs) and dashboards (numbers and status at a glance,
// drawn from data by the app, with Refresh when Lyra knows how to rebuild one).
import { useCallback, useEffect, useState } from "react";
import { EmptyScene, askTomo } from "../EmptyScene";
import { checkDashboard, describeDashboard, type Dashboard } from "../../../core/dashboard";
import type { Doc } from "../../../core/docs";
import { api, onChange } from "../api";
import { DashboardView } from "../Dashboard";
import { Chart, File as FileIcon, Plus, Refresh } from "../icons";
import { DocMarkdown } from "../markdown";
import { copyText, isDesktop, shareFile } from "../platform";
import { ago, parse } from "../when";
import { ask } from "../ask";
import { MoreMenu } from "../MoreMenu";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "doc", label: "Docs" },
  { id: "dashboard", label: "Dashboards" },
] as const;

/** A stored dashboard, or null when it can't be read. */
function dashboardOf(d: Doc): Dashboard | null {
  try {
    return checkDashboard(JSON.parse(d.body));
  } catch {
    return null;
  }
}

export function Docs({ toast }: { toast: (m: string) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>(() => {
    const f = sessionStorage.getItem("lyra.artifactFilter");
    return f === "doc" || f === "dashboard" ? f : "all";
  });
  useEffect(() => sessionStorage.setItem("lyra.artifactFilter", filter), [filter]);
  const load = useCallback(() => void api.docs().then(setDocs, () => setDocs([])), []);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "doc" && load()), [load]);

  const [making, setMaking] = useState(false);
  const create = async () => {
    if (making) return; // a double tap makes one doc, not two
    setMaking(true);
    try {
      const d = await api.saveDoc(null, { title: "Untitled", body: "Start writing here." });
      location.hash = `#/d/${d.id}?edit`;
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setMaking(false);
    }
  };

  const shown = (docs ?? []).filter((d) => filter === "all" || d.kind === filter);
  return (
    <div className="screen">
      <div className="bar">
        <h1 className="page-title">Artifacts</h1>
        <button className="btn quiet" disabled={making} onClick={() => void create()}>
          <Plus size={16} /> New doc
        </button>
      </div>
      {!docs?.length && <p className="page-sub">Made by Tomo. Ask in chat for a doc or a dashboard.</p>}
      {!!docs?.length && (
        <div className="activity-filters artifact-filters" role="tablist" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {docs === null ? (
        <p className="hint">Loading…</p>
      ) : shown.length ? (
        <div className="art-grid">
          {shown.map((d) => (
            <a className="art-card" key={d.id} href={`#/d/${d.id}`} aria-label={`${d.kind === "dashboard" ? "Dashboard" : "Doc"}: ${d.title}`}>
              <ArtPreview d={d} />
              <span className="art-body">
                <span className="art-title">{d.title}</span>
                <span className="art-meta">
                  {d.kind === "dashboard" ? <Chart size={13} /> : <FileIcon size={13} />}
                  {ago(parse(d.kind === "dashboard" && d.refreshed_at ? d.refreshed_at : d.updated_at))}
                  {d.gdoc_id ? " · Google Docs" : ""}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <EmptyScene
          pose="read"
          title={docs.length ? (filter === "dashboard" ? "No dashboards yet" : "No docs yet") : "Your shelf is empty"}
          text={filter === "dashboard" ? "Dashboards track things for you, like spending or workouts, and keep themselves up to date." : "Plans, notes and research Tomo writes for you end up here."}
          action={{ label: filter === "dashboard" ? "Ask for a dashboard" : "Ask Tomo to write something", onClick: () => askTomo(filter === "dashboard" ? "What dashboard could you make for me?" : "What could you write up for me?") }}
        />
      )}
    </div>
  );
}

/** A little picture of what's inside: a dashboard's first number and bars, or a doc's opening lines. */
function ArtPreview({ d }: { d: Doc }) {
  if (d.kind === "dashboard") {
    const dash = dashboardOf(d);
    const stat = dash?.blocks.flatMap((b) => (b.type === "stats" ? b.items : []))[0];
    const bars = dash?.blocks.flatMap((b) => (b.type === "bar" ? b.items : [])).slice(0, 4) ?? [];
    const max = Math.max(1, ...bars.map((b) => b.value));
    return (
      <span className="art-preview dash" aria-hidden="true">
        {stat && (
          <>
            <span className="art-stat-label">{stat.label}</span>
            <span className="art-stat">{stat.value}</span>
          </>
        )}
        {bars.length > 0 && (
          <span className="art-bars">
            {bars.map((b, i) => (
              <i key={i} style={{ width: `${Math.max(8, (b.value / max) * 100)}%` }} />
            ))}
          </span>
        )}
        {!stat && !bars.length && <Chart size={28} />}
      </span>
    );
  }
  const lines = d.body
    .split("\n")
    .map((l) => l.replace(/^#+\s*|^[-*]\s+(\[[ x]\]\s*)?|^\d+\.\s+|[*_`>|]/g, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return (
    <span className="art-preview doc" aria-hidden="true">
      {lines.length ? lines.map((l, i) => <span key={i}>{l}</span>) : <FileIcon size={28} />}
    </span>
  );
}

function DashboardPage({ doc, toast, onChange: set }: { doc: Doc; toast: (m: string) => void; onChange: (d: Doc) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const dash = dashboardOf(doc);
  const refresh = async () => {
    setRefreshing(true);
    try {
      set(await api.refreshDashboard(doc.id));
      toast("Refreshed");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="screen doc-screen dash-screen">
      <p className="today-when dash-when">
        Dashboard · {doc.refreshed_at ? `Refreshed ${ago(parse(doc.refreshed_at))}` : `Made ${ago(parse(doc.created_at))}`}
      </p>
      <h1 className="page-title">{doc.title}</h1>
      {dash?.subtitle && <p className="page-sub">{dash.subtitle}</p>}
      <div className="doc-actions">
        {doc.instructions.trim() ? (
          <button className="btn primary" disabled={refreshing} onClick={() => void refresh()}>
            <Refresh size={16} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
        {dash && (
          <button className="btn quiet" onClick={() => void copyText(`${doc.title}\n\n${describeDashboard(dash)}`).then(() => toast("Copied"), () => toast("Couldn't copy. Your browser didn't allow it."))}>
            Copy
          </button>
        )}
        <MoreMenu
          label="More for this dashboard"
          items={[
            {
              label: "Delete",
              bad: true,
              onClick: () =>
                void ask(`Delete “${doc.title}”?`).then<unknown>((ok) => ok &&
                api.deleteDoc(doc.id).then(
                  () => {
                    toast("Deleted");
                    location.hash = "#/artifacts";
                  },
                  (e) => toast((e as Error).message),
                )),
            },
          ]}
        />
      </div>
      {dash ? <DashboardView d={dash} /> : <p className="mem-empty">This dashboard can't be shown. Ask Tomo to make it again.</p>}
      {doc.instructions.trim() ? (
        <p className="hint dash-how">How Tomo refreshes it: {doc.instructions}</p>
      ) : (
        <p className="hint dash-how">To change it, ask Tomo in chat: “update my {doc.title} dashboard”.</p>
      )}
    </div>
  );
}

export function DocPage({ id, toast, canGoogle }: { id: number; toast: (m: string) => void; canGoogle: boolean }) {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void api.doc(id).then((d) => setDoc(d ?? null), () => setDoc(null)), [id]);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "doc" && e.docId === id && !draft && load()), [id, load, draft]);
  // a brand-new doc opens ready to edit
  useEffect(() => {
    if (doc && location.hash.endsWith("?edit") && !draft) setDraft({ title: doc.title, body: doc.body });
  }, [doc, draft]);

  if (doc === undefined) return <div className="center-load">Loading…</div>;
  if (doc === null) return <div className="center-load">That's gone.</div>;
  if (doc.kind === "dashboard") return <DashboardPage doc={doc} toast={toast} onChange={setDoc} />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (draft)
    return (
      <div className="screen doc-screen">
        <div className="bar" style={{ marginBottom: 16 }}>
          <h1 className="page-title">Edit doc</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn quiet" onClick={() => (setDraft(null), history.replaceState(null, "", `#/d/${id}`))}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={busy || !draft.title.trim() || !draft.body.trim()}
              onClick={() =>
                void run(async () => {
                  setDoc(await api.saveDoc(id, draft));
                  setDraft(null);
                  history.replaceState(null, "", `#/d/${id}`);
                  toast("Saved");
                })
              }
            >
              Save
            </button>
          </div>
        </div>
        <label className="action-field">
          <span>Title</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="action-field" style={{ marginTop: 12 }}>
          <span>Text (headings with #, lists with -)</span>
          <textarea className="editor" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} spellCheck />
        </label>
      </div>
    );

  return (
    <div className="screen doc-screen">
      <h1 className="page-title">{doc.title}</h1>
      <p className="page-sub">
        Updated {ago(parse(doc.updated_at))}
        {doc.gdoc_link && (
          <>
            {" · "}
            <a className="doc-link" href={doc.gdoc_link} target="_blank" rel="noreferrer noopener">
              Open in Google Docs
            </a>
          </>
        )}
      </p>
      <div className="doc-actions">
        <button className="btn quiet" onClick={() => setDraft({ title: doc.title, body: doc.body })}>
          Edit
        </button>
        <button className="btn quiet" onClick={() => void copyText(`# ${doc.title}\n\n${doc.body}`).then(() => toast("Copied"), () => toast("Couldn't copy. Your browser didn't allow it."))}>
          Copy
        </button>
        {/* (0.54) the rest in one menu, so the row doesn't wrap */}
        <MoreMenu
          label="More for this doc"
          items={[
            // on a computer, Copy and Google Docs cover it (the desktop save dialog is for backups)
            ...(!isDesktop
              ? [{ label: "Share", onClick: () => void run(() => shareFile(`${doc.title.replace(/[^\w .-]+/g, "").trim() || "Tomo doc"}.md`, new TextEncoder().encode(`# ${doc.title}\n\n${doc.body}\n`))) }]
              : []),
            ...(canGoogle
              ? [
                  {
                    label: busy ? "Saving…" : doc.gdoc_id ? "Update Google Doc" : "Save to Google Docs",
                    disabled: busy,
                    onClick: () =>
                      void run(async () => {
                        setDoc(await api.saveDocToGoogle(id));
                        toast(doc.gdoc_id ? "Google Doc updated" : "Saved to Google Docs");
                      }),
                  },
                ]
              : []),
            {
              label: "Delete",
              bad: true,
              onClick: () =>
                void ask(`Delete “${doc.title}”?${doc.gdoc_id ? " The copy in Google Docs stays." : ""}`).then<unknown>((ok) => ok &&
                run(async () => {
                  await api.deleteDoc(id);
                  toast("Deleted");
                  location.hash = "#/artifacts";
                })),
            },
          ]}
        />
      </div>
      <article className="doc-body">
        <DocMarkdown text={doc.body} />
      </article>
    </div>
  );
}
