import { useEffect, useState } from "react";
import { api, type MemoryView } from "../api";
import { ago, parse } from "../when";

const BLURB: Record<string, string> = {
  Rules: "How you like things done",
  People: "Who's who",
  Projects: "What you're working on",
  "Open loops": "Things waiting on someone",
};

export function Memory({ toast }: { toast: (m: string) => void }) {
  const [view, setView] = useState<MemoryView | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    api.memory().then(setView).catch((e) => toast(e.message));
  }, [toast]);

  if (!view) return <div className="center-load">Loading…</div>;

  const save = async () => {
    try {
      setView(await api.saveMemory(draft!));
      setDraft(null);
      toast("Memory saved");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const restore = async (id: number) => {
    if (!confirm("Put memory back to how it was before this change?")) return;
    try {
      setView(await api.restoreMemory(id));
      toast("Memory restored");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const total = view.sections.reduce((n, s) => n + s.items.length, 0);
  const last = view.history[0];

  if (draft !== null)
    return (
      <div className="screen">
        <div className="bar">
          <h1 className="page-title">Edit memory</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={draft === view.content}>
              Save
            </button>
          </div>
        </div>
        <label htmlFor="memory-file" className="sr-only">
          Memory file
        </label>
        <textarea id="memory-file" className="editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck />
        <p className="hint">One fact per line, starting with “- ”. Lyra reads this file before every reply.</p>
      </div>
    );

  return (
    <div className="screen">
      <div className="bar" style={{ marginBottom: 4 }}>
        <h1 className="page-title">Memory</h1>
        <button className="btn quiet" onClick={() => setDraft(view.content)}>
          Edit
        </button>
      </div>
      <p className="page-sub">
        {total ? `${total} ${total === 1 ? "fact" : "facts"}` : "Nothing saved yet"}
        {last ? ` · changed ${ago(parse(last.created_at))}` : ""}
      </p>

      {view.sections.map((s) => (
        <section className="section" key={s.name}>
          <h2 className="section-label">
            {s.name} <span style={{ fontWeight: 400 }}>· {BLURB[s.name]}</span>
          </h2>
          <div className="group">
            {s.items.length ? (
              <ul className="mem-list">
                {s.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            ) : (
              <div className="mem-empty">Nothing yet</div>
            )}
          </div>
        </section>
      ))}

      {view.history.length > 0 && (
        <section className="section">
          <button className="section-label link-btn" style={{ margin: 0 }} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide changes" : `Recent changes (${view.history.length})`}
          </button>
          {showHistory && (
            <div className="group" style={{ marginTop: 8 }}>
              {view.history.map((h) => (
                <div className="item" key={h.id}>
                  <span className="body">
                    <div className="title" style={{ fontSize: 15 }}>
                      {h.reason}
                    </div>
                    <div className="sub">{ago(parse(h.created_at))}</div>
                  </span>
                  <button className="link-btn" onClick={() => restore(h.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
