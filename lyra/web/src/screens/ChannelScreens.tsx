import { useEffect, useState } from "react";
import { api, type ChannelView } from "../api";
import { CHANNEL_ICON_NAMES, ChannelIcon, Pencil, Trash } from "../icons";
import { ago, parse } from "../when";

const BLURB: Record<string, string> = {
  Notes: "Facts about this subject",
  Decisions: "What's been settled",
  "Open loops": "Still waiting on someone",
};

const LABELS: Record<string, string> = {
  home: "Home",
  sprout: "Kids and growing things",
  game: "Games",
  heart: "Family and health",
  work: "Work",
  travel: "Travel",
  tools: "Projects and repairs",
  book: "Learning",
  money: "Money",
  star: "Anything",
};

interface FormValue {
  name: string;
  about: string;
  icon: string;
}

function ChannelForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValue;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: FormValue) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="channel-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <label className="field-label" htmlFor="ch-name">
        Name
      </label>
      <input
        id="ch-name"
        className="field"
        value={v.name}
        maxLength={32}
        placeholder="Home, Rowan, Kitchen…"
        onChange={(e) => setV({ ...v, name: e.target.value })}
        autoFocus={!initial.name}
      />
      <label className="field-label" htmlFor="ch-about" style={{ marginTop: 20 }}>
        What's it for?
      </label>
      <input
        id="ch-about"
        className="field"
        value={v.about}
        maxLength={140}
        placeholder="One line, like “Rowan's 7th birthday party”"
        onChange={(e) => setV({ ...v, about: e.target.value })}
      />
      <p className="field-label" style={{ marginTop: 20 }} id="ch-icon-label">
        Icon
      </p>
      <div className="icon-grid" role="radiogroup" aria-labelledby="ch-icon-label">
        {CHANNEL_ICON_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={v.icon === name}
            aria-label={LABELS[name] ?? name}
            className={`icon-choice${v.icon === name ? " on" : ""}`}
            onClick={() => setV({ ...v, icon: name })}
          >
            <ChannelIcon name={name} size={22} />
          </button>
        ))}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary" disabled={busy || !v.name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function NewChannel({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen">
      <h1 className="page-title">New channel</h1>
      <p className="page-sub">A separate chat for one ongoing subject, with its own notebook. Lyra still remembers things about you in main memory.</p>
      <ChannelForm
        initial={{ name: "", about: "", icon: "star" }}
        submitLabel="Create channel"
        busy={busy}
        onSubmit={async (v) => {
          setBusy(true);
          try {
            const c = await api.createChannel(v);
            onChange();
            location.hash = `#/c/${c.id}`;
          } catch (e) {
            toast((e as Error).message);
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function ChannelInfo({ id, toast, onChange }: { id: number; toast: (m: string) => void; onChange: () => void }) {
  const [view, setView] = useState<ChannelView | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.channelView(id).then(setView, (e) => {
      toast(e.message);
      location.hash = "#/";
    });
  }, [id, toast]);

  if (!view) return <div className="center-load">Loading…</div>;
  const { channel, notebook } = view;
  const total = notebook.sections.reduce((n, s) => n + s.items.length, 0);

  const run = async (fn: () => Promise<ChannelView | void>, done?: string) => {
    setBusy(true);
    try {
      const v = await fn();
      if (v) setView(v);
      if (done) toast(done);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null)
    return (
      <div className="screen">
        <div className="bar" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Edit notebook</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={busy || draft === notebook.content}
              onClick={async () => (await run(() => api.saveChannelNotebook(id, draft), "Notebook saved")) && setDraft(null)}
            >
              Save
            </button>
          </div>
        </div>
        <label htmlFor="nb-file" className="sr-only">
          {channel.name} notebook
        </label>
        <textarea id="nb-file" className="editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck />
        <p className="hint">One fact per line, starting with “- ”. Lyra reads this before every reply in {channel.name}.</p>
      </div>
    );

  return (
    <div className="screen mem-sections">
      {editing ? (
        <>
          <h1 className="page-title" style={{ marginBottom: 24 }}>
            Edit channel
          </h1>
          <ChannelForm
            initial={{ name: channel.name, about: channel.about, icon: channel.icon }}
            submitLabel="Save"
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={async (v) => {
              const ok = await run(async () => {
                await api.updateChannel(id, v);
                onChange();
                return api.channelView(id);
              }, "Saved");
              if (ok) setEditing(false);
            }}
          />
        </>
      ) : (
        <div className="page-head">
          <span className="channel-badge lg">
            <ChannelIcon name={channel.icon} size={40} />
          </span>
          <div className="bar" style={{ width: "100%", alignItems: "flex-end" }}>
            <h1>{channel.name}</h1>
            <button className="ring" aria-label="Edit channel" onClick={() => setEditing(true)}>
              <Pencil size={20} />
            </button>
          </div>
          <p>{channel.about || "No description yet"}</p>
        </div>
      )}

      {!editing && (
        <>
          <div className="bar">
            <h2 className="section-label" style={{ margin: 0 }}>
              Notebook <span className="count">{total || ""}</span>
            </h2>
            <button className="btn quiet" onClick={() => setDraft(notebook.content)}>
              Edit
            </button>
          </div>
          <p className="hint" style={{ margin: "8px 0 0" }}>
            Lyra saves facts about {channel.name} here. Things about you go in main memory.
          </p>

          {notebook.sections.map((s) => (
            <section className="section" key={s.name}>
              <h2 className="section-label">
                {s.name}
                {s.items.length > 0 && <span className="count">{s.items.length}</span>}
                <span className="blurb">{BLURB[s.name]}</span>
              </h2>
              {s.items.length ? (
                <div className="group">
                  <ul className="mem-list">
                    {s.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mem-empty">Nothing yet</p>
              )}
            </section>
          ))}

          {notebook.history.length > 0 && (
            <section className="section">
              <button className="btn quiet" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "Hide changes" : `Recent changes (${notebook.history.length})`}
              </button>
              {showHistory && (
                <div className="group" style={{ marginTop: 8 }}>
                  {notebook.history.map((h) => (
                    <div className="item flat" key={h.id}>
                      <span className="body">
                        <div className="title" style={{ fontSize: 15 }}>
                          {h.reason}
                        </div>
                        <div className="sub">{ago(parse(h.created_at))}</div>
                      </span>
                      <button
                        className="link-btn"
                        onClick={() =>
                          confirm("Put the notebook back to how it was before this change?") &&
                          run(() => api.restoreChannelNotebook(id, h.id), "Notebook restored")
                        }
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="section">
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Delete ${channel.name}? Its chat and notebook are removed for good. Main memory stays as it is.`)) return;
                if (await run(() => api.deleteChannel(id), `${channel.name} deleted`)) {
                  onChange();
                  location.hash = "#/";
                }
              }}
            >
              <Trash size={18} /> Delete channel
            </button>
          </section>
        </>
      )}
    </div>
  );
}
