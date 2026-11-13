// Phase 13: the docs Lyra wrote for you (plans, lists, notes), to read, edit, share,
// and save to Google Docs.
import { useCallback, useEffect, useState } from "react";
import type { Doc } from "../../../core/docs";
import { api, onChange } from "../api";
import { Chevron, File as FileIcon, Plus } from "../icons";
import { DocMarkdown } from "../markdown";
import { copyText, isDesktop, shareFile } from "../platform";
import { ago, parse } from "../when";

export function Docs({ toast }: { toast: (m: string) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const load = useCallback(() => void api.docs().then(setDocs, () => setDocs([])), []);
  useEffect(load, [load]);
  useEffect(() => onChange((e) => e.type === "doc" && load()), [load]);

  const create = async () => {
    try {
      const d = await api.saveDoc(null, { title: "Untitled", body: "Start writing here." });
      location.hash = `#/d/${d.id}?edit`;
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="bar">
        <h1 className="page-title">Docs</h1>
        <button className="btn quiet" onClick={() => void create()}>
          <Plus size={16} /> New
        </button>
      </div>
      <p className="page-sub">Plans, lists and notes Lyra wrote for you. Ask for one in chat: “make me a packing list for the camping trip”.</p>
      {docs === null ? (
        <p className="hint">Loading…</p>
      ) : docs.length ? (
        <div className="group">
          {docs.map((d) => (
            <a className="item" key={d.id} href={`#/d/${d.id}`}>
              <span className="tile">
                <FileIcon size={20} />
              </span>
              <span className="body">
                <div className="title">{d.title}</div>
                <div className="sub">
                  Updated {ago(parse(d.updated_at))}
                  {d.gdoc_id ? " · in Google Docs" : ""}
                </div>
              </span>
              <Chevron className="chev" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mem-empty">No docs yet.</p>
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
  if (doc === null) return <div className="center-load">That doc is gone.</div>;

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
        <button className="btn quiet" onClick={() => void copyText(`# ${doc.title}\n\n${doc.body}`).then(() => toast("Copied"))}>
          Copy
        </button>
        {/* on a computer, Copy and Google Docs cover it (the desktop save dialog is for backups) */}
        {!isDesktop && <button className="btn quiet" onClick={() => void run(() => shareFile(`${doc.title.replace(/[^\w .-]+/g, "").trim() || "Lyra doc"}.md`, new TextEncoder().encode(`# ${doc.title}\n\n${doc.body}\n`)))}>
          Share
        </button>}
        {canGoogle && (
          <button
            className="btn quiet"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setDoc(await api.saveDocToGoogle(id));
                toast(doc.gdoc_id ? "Google Doc updated" : "Saved to Google Docs");
              })
            }
          >
            {busy ? "Saving…" : doc.gdoc_id ? "Update Google Doc" : "Save to Google Docs"}
          </button>
        )}
        <button
          className="btn text"
          onClick={() =>
            confirm(`Delete “${doc.title}”?${doc.gdoc_id ? " The copy in Google Docs stays." : ""}`) &&
            void run(async () => {
              await api.deleteDoc(id);
              toast("Deleted");
              location.hash = "#/docs";
            })
          }
        >
          Delete
        </button>
      </div>
      <article className="doc-body">
        <DocMarkdown text={doc.body} />
      </article>
    </div>
  );
}
