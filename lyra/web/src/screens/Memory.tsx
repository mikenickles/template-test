import { useCallback, useEffect, useState } from "react";
import type { Person } from "../../../core/people";
import type { Skill } from "../../../core/skills";
import { api, type Channel, type MemoryView } from "../api";
import { ChannelIcon, Chevron, Star } from "../icons";
import { ago, parse } from "../when";

const BLURB: Record<string, string> = {
  Rules: "How you like things done",
  People: "Who's who",
  Projects: "What you're working on",
  "Open loops": "Things waiting on someone",
};

export function Memory({ toast, channels }: { toast: (m: string) => void; channels: Channel[] }) {
  const [view, setView] = useState<MemoryView | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [tab, setTab] = useState<"notes" | "people" | "skills">(() =>
    location.hash.includes("people") ? "people" : location.hash.includes("skills") ? "skills" : "notes",
  );
  const [tidyOn, setTidyOn] = useState<boolean | null>(null);
  const [tidying, setTidying] = useState(false);

  useEffect(() => {
    api.memory().then(setView).catch((e) => toast(e.message));
    void api.tidyOn().then(setTidyOn, () => {});
  }, [toast]);

  const tidyNow = async () => {
    setTidying(true);
    try {
      const r = await api.tidyNow();
      if (r.changed) {
        setView(await api.memory());
        toast(`Tidied: ${r.changes.length} ${r.changes.length === 1 ? "change" : "changes"}. Undo is in the chat.`);
      } else toast("Already tidy");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTidying(false);
    }
  };

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
        <div className="bar" style={{ marginBottom: 24 }}>
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
    <div className="screen mem-sections">
      <div className="bar">
        <h1 className="page-title">Memory</h1>
        {tab === "notes" && (
          <button className="btn quiet" onClick={() => setDraft(view.content)}>
            Edit
          </button>
        )}
      </div>
      <p className="page-sub">
        {tab === "people"
          ? "The people who matter to you, and what Lyra knows about each"
          : tab === "skills"
            ? "How you like particular jobs done. Lyra follows one when a request fits"
            : total ? `${total} ${total === 1 ? "fact" : "facts"}` : "Nothing saved yet"}
        {tab === "notes" && last ? ` · changed ${ago(parse(last.created_at))}` : ""}
      </p>

      <div className="seg-tabs mem-tabs" role="tablist" aria-label="Memory">
        <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>
          Notes
        </button>
        <button role="tab" aria-selected={tab === "people"} className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>
          People
        </button>
        <button role="tab" aria-selected={tab === "skills"} className={tab === "skills" ? "on" : ""} onClick={() => setTab("skills")}>
          Skills
        </button>
      </div>

      {tab === "people" && <PeopleList toast={toast} />}
      {tab === "skills" && <SkillList toast={toast} />}

      {tab === "notes" && view.sections.map((s) => (
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

      {tab === "notes" && (
        <section className="section">
          <h2 className="section-label">Weekly tidy-up</h2>
          <div className="group">
            <label className="item">
              <span className="body">
                <div className="title">Tidy my notes each week</div>
                <div className="sub">Lyra merges duplicates, drops what's done or out of date, and tells you what changed in the chat, with an Undo.</div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={!!tidyOn}
                disabled={tidyOn === null}
                onChange={(e) => {
                  const on = e.target.checked;
                  setTidyOn(on);
                  void api.setTidy(on).then(() => toast(on ? "Weekly tidy-up on" : "Weekly tidy-up off"));
                }}
              />
            </label>
          </div>
          <button className="btn quiet tidy-now" onClick={() => void tidyNow()} disabled={tidying || total < 3}>
            {tidying ? "Tidying…" : "Tidy up now"}
          </button>
        </section>
      )}

      {tab === "notes" && channels.length > 0 && (
        <section className="section">
          <h2 className="section-label">
            Channel notebooks <span className="blurb">Facts about one subject each</span>
          </h2>
          <div className="group">
            {channels.map((c) => (
              <a className="item" key={c.id} href={`#/c/${c.id}/info`}>
                <span className="tile">
                  <ChannelIcon name={c.icon} size={20} />
                </span>
                <span className="body">
                  <div className="title">{c.name}</div>
                  <div className="sub">{c.about || "No description yet"}</div>
                </span>
                <Chevron className="chev" />
              </a>
            ))}
          </div>
        </section>
      )}

      {tab === "notes" && view.history.length > 0 && (
        <section className="section">
          <button className="btn quiet" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide changes" : `Recent changes (${view.history.length})`}
          </button>
          {showHistory && (
            <div className="group" style={{ marginTop: 8 }}>
              {view.history.map((h) => (
                <div className="item flat" key={h.id}>
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

const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

/** Phase 17: skills, how the user wants particular jobs done. */
function SkillList({ toast }: { toast: (m: string) => void }) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [editing, setEditing] = useState<Skill | "new" | null>(null);
  const load = useCallback(() => void api.skills().then(setSkills, () => setSkills([])), []);
  useEffect(load, [load]);
  if (!skills) return <p className="hint">Loading…</p>;
  return (
    <section className="section">
      {skills.length ? (
        <div className="group">
          {skills.map((s) => (
            <button className="item skill-item" key={s.id} onClick={() => setEditing(s)}>
              <span className="tile person-initial">
                <Star size={16} />
              </span>
              <span className="body">
                <div className="title">{s.name}</div>
                <div className="sub">
                  {s.use_when}
                  {s.uses ? ` · used ${s.uses === 1 ? "once" : `${s.uses} times`}` : ""}
                </div>
              </span>
              <Chevron className="chev" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mem-empty">
          No skills yet. Show Lyra how you like something done (“When I plan a trip: check flights, block my calendar, make a packing list. Save that as a skill.”), or write one here.
        </p>
      )}
      <button className="btn quiet tidy-now" onClick={() => setEditing("new")}>
        Add a skill
      </button>
      {editing && (
        <SkillSheet
          skill={editing === "new" ? null : editing}
          toast={toast}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function SkillSheet({ skill, toast, onClose, onSaved }: { skill: Skill | null; toast: (m: string) => void; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: skill?.name ?? "", use_when: skill?.use_when ?? "", steps: skill?.steps ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api.saveSkill(skill?.id ?? null, f);
      toast("Saved");
      onSaved();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!skill || !confirm(`Remove the skill “${skill.name}”?`)) return;
    await api.deleteSkill(skill.id);
    toast("Removed");
    onSaved();
  };
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet person-sheet" role="dialog" aria-modal="true" aria-label={skill ? skill.name : "Add a skill"}>
        <div className="action-edit">
          <label className="action-field">
            <span>Name</span>
            <input value={f.name} maxLength={60} placeholder="Trip planning" onChange={set("name")} />
          </label>
          <label className="action-field">
            <span>Use it when</span>
            <input value={f.use_when} maxLength={200} placeholder="I ask you to plan a trip" onChange={set("use_when")} />
          </label>
          <label className="action-field">
            <span>Steps</span>
            <textarea rows={8} value={f.steps} placeholder={"1. Check flights from home\n2. Block the dates on my calendar\n3. Make a packing list"} onChange={set("steps")} />
          </label>
          <p className="hint">Skills change how Lyra does a job, not what it's allowed to do. Sending or booking still waits for your tap.</p>
        </div>
        <div className="action-buttons">
          <button className="btn primary" disabled={busy || !f.name.trim() || !f.use_when.trim() || !f.steps.trim()} onClick={() => void save()}>
            Save
          </button>
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          {skill && (
            <button className="btn text" onClick={() => void remove()}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Phase 10: the people who matter, as cards. */
function PeopleList({ toast }: { toast: (m: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const load = useCallback(() => void api.people().then(setPeople, () => setPeople([])), []);
  useEffect(load, [load]);
  if (!people) return <p className="hint">Loading…</p>;
  return (
    <section className="section">
      {people.length ? (
        <div className="group">
          {people.map((p) => (
            <button className="item" key={p.id} onClick={() => setEditing(p)}>
              <span className="tile person-initial">{p.name.charAt(0).toUpperCase()}</span>
              <span className="body">
                <div className="title">{p.name}</div>
                <div className="sub">{[p.relation, p.emails[0], p.notes.length ? `${p.notes.length} ${p.notes.length === 1 ? "note" : "notes"}` : ""].filter(Boolean).join(" · ") || "No details yet"}</div>
              </span>
              <Chevron className="chev" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mem-empty">No one yet. Tell Lyra about the people who matter (“Dana is my sister, dana@example.com”), or add them here.</p>
      )}
      <button className="btn quiet tidy-now" onClick={() => setEditing("new")}>
        Add a person
      </button>
      {editing && (
        <PersonSheet
          person={editing === "new" ? null : editing}
          toast={toast}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function PersonSheet({ person, toast, onClose, onSaved }: { person: Person | null; toast: (m: string) => void; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: person?.name ?? "",
    relation: person?.relation ?? "",
    aliases: person?.aliases.join(", ") ?? "",
    emails: person?.emails.join(", ") ?? "",
    phones: person?.phones.join(", ") ?? "",
    notes: person?.notes.join("\n") ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api.savePerson(person?.id ?? null, {
        name: f.name,
        relation: f.relation,
        aliases: lines(f.aliases),
        emails: lines(f.emails),
        phones: lines(f.phones),
        notes: f.notes.split("\n").map((x) => x.trim()).filter(Boolean),
      });
      toast("Saved");
      onSaved();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!person || !confirm(`Remove ${person.name}'s card? Lyra forgets what it noted about them.`)) return;
    await api.deletePerson(person.id);
    toast("Removed");
    onSaved();
  };
  const field = (k: keyof typeof f, label: string, multi = false) => (
    <label className="action-field">
      <span>{label}</span>
      {multi ? <textarea rows={5} value={f[k]} onChange={set(k)} /> : <input value={f[k]} onChange={set(k)} />}
    </label>
  );
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet person-sheet" role="dialog" aria-modal="true" aria-label={person ? person.name : "Add a person"}>
        <div className="action-edit">
          {field("name", "Name")}
          {field("relation", "Who they are to you")}
          {field("emails", "Email")}
          {field("phones", "Phone")}
          {field("aliases", "Also called")}
          {field("notes", "What Lyra knows (one per line)", true)}
        </div>
        <div className="action-buttons">
          <button className="btn primary" disabled={busy || !f.name.trim()} onClick={() => void save()}>
            Save
          </button>
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          {person && (
            <button className="btn text" onClick={() => void remove()}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
