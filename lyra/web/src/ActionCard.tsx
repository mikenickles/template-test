// A proposed email or calendar event, as a card under Lyra's reply. Shows exactly what
// will happen; nothing does until the user taps Send / Save to Drafts / Add.
import { useEffect, useState } from "react";
import type { ActionRow, ArchiveDraft, EmailDraft, EventDraft, MoveDraft, PlaylistDraft, RsvpDraft, TextDraft } from "../../core/actions";
import { api, onChange } from "./api";
import { Calendar, ChatIcon, Mail, Music } from "./icons";
import { haptic } from "./haptics";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });

function eventWhen(v: EventDraft): string {
  const d = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s.replace(" ", "T"));
  const day: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (v.allDay) return v.end !== v.start ? `${d(v.start).toLocaleDateString(undefined, day)} to ${d(v.end).toLocaleDateString(undefined, day)}, all day` : `${d(v.start).toLocaleDateString(undefined, day)}, all day`;
  const s = d(v.start);
  const e = d(v.end);
  return `${s.toLocaleDateString(undefined, day)}, ${s.toLocaleTimeString(undefined, time)} to ${s.toDateString() === e.toDateString() ? e.toLocaleTimeString(undefined, time) : e.toLocaleString(undefined, { ...day, ...time })}`;
}

const DONE: Record<string, string> = {
  sent: "Sent",
  drafted: "Saved to Drafts",
  added: "Added to your calendar",
  made: "Playlist made",
  added_songs: "Songs added",
  moved: "Moved",
  accepted: "Said yes",
  declined: "Said no",
  tentative: "Said maybe",
  archived: "Archived",
  opened: "Opened in Messages",
};

export function ActionCards({ ids, toast }: { ids: number[]; toast: (m: string) => void }) {
  return (
    <div className="actions-cards">
      {ids.map((id) => (
        <ActionCard key={id} id={id} toast={toast} />
      ))}
    </div>
  );
}

function ActionCard({ id, toast }: { id: number; toast: (m: string) => void }) {
  const [a, setA] = useState<ActionRow | null | undefined>(undefined);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => void api.action(id).then((r) => setA(r ?? null), () => setA(null));
    load();
    return onChange(load); // done on another device and synced, or retried
  }, [id]);
  if (a === undefined) return null;
  if (a === null) return <div className="action-card gone">This was removed.</div>;

  if (a.kind === "playlist") return <PlaylistCard a={a} setA={setA} toast={toast} />;
  if (a.kind === "move" || a.kind === "rsvp" || a.kind === "archive" || a.kind === "text") return <SimpleCard a={a} setA={setA} toast={toast} />;
  const email = a.kind === "email" ? (a.payload as EmailDraft) : null;
  const event = a.kind === "event" ? (a.payload as EventDraft) : null;
  const open = a.status === "proposed";

  const startEdit = () =>
    setEditing(
      email
        ? { to: email.to.join(", "), cc: email.cc.join(", "), subject: email.subject, body: email.body }
        : {
            title: event!.title,
            start: event!.allDay ? event!.start : event!.start.replace(" ", "T"),
            end: event!.allDay ? event!.end : event!.end.replace(" ", "T"),
            location: event!.location,
            attendees: event!.attendees.join(", "),
          },
    );

  const edited = (): Record<string, unknown> | undefined => {
    if (!editing) return undefined;
    if (email) return { ...editing, reply_to_thread: email.replyToThread };
    return { ...editing, description: event!.description };
  };

  const decide = async (choice: "send" | "draft" | "add" | "decline") => {
    setBusy(true);
    try {
      const r = await api.decideAction(id, choice, choice === "decline" ? undefined : edited());
      setA(r);
      if (r.status === "done") {
        haptic.done();
        setEditing(null);
        toast(DONE[r.result?.did ?? ""] ?? "Done");
      } else if (r.error) toast(r.error);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k: string, label: string, opts: { type?: string; multiline?: boolean } = {}) => (
    <label className="action-field">
      <span>{label}</span>
      {opts.multiline ? (
        <textarea rows={6} value={editing![k] ?? ""} onChange={(e) => setEditing({ ...editing!, [k]: e.target.value })} />
      ) : (
        <input type={opts.type ?? "text"} value={editing![k] ?? ""} onChange={(e) => setEditing({ ...editing!, [k]: e.target.value })} />
      )}
    </label>
  );

  return (
    <div className={`action-card ${a.status}`} aria-label={email ? "Email for your OK" : "Event for your OK"} role="group">
      <div className="action-head">
        <span className="action-kind">
          {email ? <Mail size={16} /> : <Calendar size={16} />}
          {email ? (email.replyToThread ? "Reply" : "Email") : "Calendar event"}
        </span>
        <span className="action-state">
          {a.status === "done" ? `${DONE[a.result?.did ?? ""] ?? "Done"} · ${when(a.result!.at)}` : a.status === "declined" ? "Not sent" : a.status === "working" ? "Working…" : "Waiting for your OK"}
        </span>
      </div>

      {open && a.tainted && <p className="action-warn">Written after reading an email or the web. Check who it goes to before you {email ? "send it" : "add it"}.</p>}

      {editing ? (
        <div className="action-edit">
          {email ? (
            <>
              {field("to", "To")}
              {field("cc", "Cc")}
              {!email.replyToThread && field("subject", "Subject")}
              {field("body", "Message", { multiline: true })}
            </>
          ) : (
            <>
              {field("title", "Title")}
              {field("start", "Starts", { type: event!.allDay ? "date" : "datetime-local" })}
              {field("end", "Ends", { type: event!.allDay ? "date" : "datetime-local" })}
              {field("location", "Where")}
              {field("attendees", "Invite (emails)")}
            </>
          )}
        </div>
      ) : email ? (
        <div className="action-body">
          <div className="action-line">
            <span>To</span>
            <b>{email.to.join(", ")}</b>
          </div>
          {!!email.cc.length && (
            <div className="action-line">
              <span>Cc</span>
              <b>{email.cc.join(", ")}</b>
            </div>
          )}
          {email.subject && (
            <div className="action-line">
              <span>Subject</span>
              <b>{email.subject}</b>
            </div>
          )}
          <p className="action-text">{email.body}</p>
        </div>
      ) : (
        <div className="action-body">
          <div className="action-title">{event!.title}</div>
          <div className="action-sub">{eventWhen(event!)}</div>
          {event!.location && <div className="action-sub">{event!.location}</div>}
          {!!event!.attendees.length && <div className="action-sub">Invites {event!.attendees.join(", ")}</div>}
        </div>
      )}

      {open && a.error && <p className="action-error">{a.error}</p>}

      {open && (
        <div className="action-buttons">
          {email ? (
            <>
              <button className="btn primary" disabled={busy} onClick={() => void decide("send")}>
                Send
              </button>
              <button className="btn quiet" disabled={busy} onClick={() => void decide("draft")}>
                Save to Drafts
              </button>
            </>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => void decide("add")}>
              {event!.attendees.length ? `Add and invite ${event!.attendees.length}` : "Add to calendar"}
            </button>
          )}
          {editing ? (
            <button className="btn quiet" disabled={busy} onClick={() => setEditing(null)}>
              Undo edits
            </button>
          ) : (
            <button className="btn quiet" disabled={busy} onClick={startEdit}>
              Edit
            </button>
          )}
          <button className="btn text" disabled={busy} onClick={() => void decide("decline")}>
            Not now
          </button>
        </div>
      )}
      {a.status === "done" && a.result?.link && (
        <a className="action-link" href={a.result.link} target="_blank" rel="noreferrer noopener">
          {email ? "Open in Gmail" : "Open in Calendar"}
        </a>
      )}
    </div>
  );
}

/** Phase 14: a Spotify playlist to make, or songs to add, shown song by song. */
function PlaylistCard({ a, setA, toast }: { a: ActionRow; setA: (r: ActionRow) => void; toast: (m: string) => void }) {
  const p = a.payload as PlaylistDraft;
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const open = a.status === "proposed";
  const decide = async (choice: "add" | "decline") => {
    setBusy(true);
    try {
      const r = await api.decideAction(a.id, choice);
      setA(r);
      if (r.status === "done") (haptic.done(), toast(DONE[r.result?.did ?? ""] ?? "Done"));
      else if (r.error) toast(r.error);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const shown = all ? p.tracks : p.tracks.slice(0, 8);
  return (
    <div className={`action-card ${a.status}`} aria-label="Playlist for your OK" role="group">
      <div className="action-head">
        <span className="action-kind">
          <Music size={16} />
          {p.playlistId ? "Add to playlist" : "New playlist"}
        </span>
        <span className="action-state">
          {a.status === "done" ? `${DONE[a.result?.did ?? ""] ?? "Done"} · ${when(a.result!.at)}` : a.status === "declined" ? "Not made" : a.status === "working" ? "Working…" : "Waiting for your OK"}
        </span>
      </div>
      {open && a.tainted && <p className="action-warn">Put together after reading outside content. Check the songs before you tap.</p>}
      <div className="action-body">
        <div className="action-title">{p.name}</div>
        {p.description && <div className="action-sub">{p.description}</div>}
        <ol className="playlist-songs">
          {shown.map((t) => (
            <li key={t.uri}>
              <span>{t.name}</span> <span className="action-sub">{t.artist}</span>
            </li>
          ))}
        </ol>
        {p.tracks.length > 8 && (
          <button className="link-btn" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `All ${p.tracks.length} songs`}
          </button>
        )}
      </div>
      {open && a.error && <p className="action-error">{a.error}</p>}
      {open && (
        <div className="action-buttons">
          <button className="btn primary" disabled={busy} onClick={() => void decide("add")}>
            {p.playlistId ? `Add ${p.tracks.length} songs` : "Make playlist"}
          </button>
          <button className="btn text" disabled={busy} onClick={() => void decide("decline")}>
            Not now
          </button>
        </div>
      )}
      {a.status === "done" && a.result?.link && (
        <a className="action-link" href={a.result.link} target="_blank" rel="noreferrer noopener">
          Open in Spotify
        </a>
      )}
    </div>
  );
}

/** 0.45: move an event, answer an invitation, archive mail, or write a text. One tap does it. */
function SimpleCard({ a, setA, toast }: { a: ActionRow; setA: (r: ActionRow) => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const open = a.status === "proposed";
  const decide = async (choice: "do" | "decline") => {
    setBusy(true);
    try {
      const r = await api.decideAction(a.id, choice, a.kind === "text" && body !== null ? { body } : undefined);
      setA(r);
      if (r.status === "done") (haptic.done(), toast(DONE[r.result?.did ?? ""] ?? "Done"));
      else if (r.error) toast(r.error);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  let icon = <Calendar size={16} />;
  let kind = "";
  let go = "";
  let label = "";
  let content: React.ReactNode = null;
  if (a.kind === "move") {
    const m = a.payload as MoveDraft;
    kind = "New time";
    go = "Move it";
    label = "Event move for your OK";
    const to = eventWhen({ title: m.title, start: m.start, end: m.end, allDay: m.allDay, location: "", description: "", attendees: [] });
    content = (
      <>
        <div className="action-title">{m.title}</div>
        <div className="action-sub action-was">{m.was}</div>
        <div className="action-sub action-now">→ {to}</div>
        {m.guests > 0 && <div className="action-sub">{m.guests === 1 ? "1 guest is" : `${m.guests} guests are`} told about the new time.</div>}
      </>
    );
  } else if (a.kind === "rsvp") {
    const r = a.payload as RsvpDraft;
    kind = "Answer invitation";
    go = r.response === "accepted" ? "Say yes" : r.response === "declined" ? "Say no" : "Say maybe";
    label = "Invitation answer for your OK";
    content = (
      <>
        <div className="action-title">{r.title}</div>
        <div className="action-sub">
          {r.when}
          {r.organizer ? ` · from ${r.organizer}` : ""}
        </div>
        <div className={`action-answer a-${r.response}`}>{r.response === "accepted" ? "Yes, going" : r.response === "declined" ? "No, can't make it" : "Maybe"}</div>
        {r.note && <div className="action-sub">“{r.note}”</div>}
      </>
    );
  } else if (a.kind === "archive") {
    const t = (a.payload as ArchiveDraft).threads;
    icon = <Mail size={16} />;
    kind = "Tidy inbox";
    go = `Archive ${t.length}`;
    label = "Archive for your OK";
    content = (
      <>
        <ul className="archive-list">
          {t.map((x) => (
            <li key={x.id}>
              <span className="action-title-sm">{x.subject}</span>
              <span className="action-sub">{x.from}</span>
            </li>
          ))}
        </ul>
        <div className="action-sub">Out of the inbox; still in All Mail and search.</div>
      </>
    );
  } else {
    const x = a.payload as TextDraft;
    icon = <ChatIcon size={16} />;
    kind = `Text to ${x.to}`;
    go = "Open in Messages";
    label = "Text for your OK";
    content = (
      <>
        <div className="action-sub">{x.number}</div>
        {body !== null ? (
          <textarea className="action-textarea" value={body} rows={3} onChange={(e) => setBody(e.target.value)} aria-label="Text" />
        ) : (
          <div className="action-text-bubble">{x.body}</div>
        )}
      </>
    );
  }

  return (
    <div className={`action-card ${a.status}`} aria-label={label} role="group">
      <div className="action-head">
        <span className="action-kind">
          {icon}
          {kind}
        </span>
        <span className="action-state">
          {a.status === "done" ? `${DONE[a.result?.did ?? ""] ?? "Done"} · ${when(a.result!.at)}` : a.status === "declined" ? "Not now" : a.status === "working" ? "Working…" : "Waiting for your OK"}
        </span>
      </div>
      {open && a.tainted && <p className="action-warn">Put together after reading outside content. Check it before you tap.</p>}
      <div className="action-body">{content}</div>
      {open && a.error && <p className="action-error">{a.error}</p>}
      {open && (
        <div className="action-buttons">
          <button className="btn primary" disabled={busy || (body !== null && !body.trim())} onClick={() => void decide("do")}>
            {go}
          </button>
          {a.kind === "text" && body === null && (
            <button className="btn quiet" disabled={busy} onClick={() => setBody((a.payload as TextDraft).body)}>
              Edit
            </button>
          )}
          <button className="btn text" disabled={busy} onClick={() => void decide("decline")}>
            Not now
          </button>
        </div>
      )}
      {a.status === "done" && a.result?.link && (
        <a className="action-link" href={a.result.link} target="_blank" rel="noreferrer noopener">
          Open in Calendar
        </a>
      )}
    </div>
  );
}
