import { useEffect, useState, type ReactNode } from "react";
import { api, type AppState, type ConnectorStatus } from "../api";
import { Calendar, Chevron, File, Mail, Notebook, Plus, Spark } from "../icons";
import { Orb } from "../LyraMark";
import { thisDevice } from "../platform";
import { PinnedList } from "./Pinned";

type GoogleId = "gmail" | "calendar" | "drive";

const ICONS: Record<GoogleId, ReactNode> = { gmail: <Mail />, calendar: <Calendar />, drive: <File /> };
const NAMES: Record<GoogleId, string> = { gmail: "Gmail", calendar: "Google Calendar", drive: "Google Drive" };
const PROMISE: Record<GoogleId, string> = {
  gmail: "Lyra can now read your mail. It can't send, delete or change anything.",
  calendar: "Lyra can now see your schedule. It can't add, change or answer events.",
  drive: "Lyra can now find and read your files. It can't change, share or delete them.",
};

export function Access({
  state,
  setState,
  toast,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
}) {
  const [memCount, setMemCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<GoogleId | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; title: string; body: string } | null>(null);
  const google = state.connectors.filter((c): c is ConnectorStatus & { id: GoogleId } => c.id in ICONS);
  const unavailable = google.some((c) => c.state === "unavailable");

  useEffect(() => {
    api
      .memory()
      .then((m) => setMemCount(m.sections.reduce((n, s) => n + s.items.length, 0)))
      .catch(() => {});
  }, []);

  const connect = async (id: GoogleId) => {
    setBusy(id);
    try {
      setState(await api.connectGoogle(id));
      setNotice({ tone: "good", title: `${NAMES[id]} is connected`, body: PROMISE[id] });
    } catch (e) {
      setNotice({ tone: "bad", title: `${NAMES[id]} didn't connect`, body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: GoogleId) => {
    if (!confirm(`Disconnect ${NAMES[id]}? Lyra will stop being able to use it.`)) return;
    try {
      setState(await api.disconnectGoogle(id));
      setNotice(null);
      toast(`${NAMES[id]} disconnected`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="page-head">
        <Orb size="lg" />
        <h1>Lyra</h1>
        <p>Chief of staff · lives on {thisDevice}</p>
      </div>

      {notice && (
        <div className={`banner ${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
          <strong>{notice.title}</strong>
          {notice.body}
          {/Google on this computer/.test(notice.body) && (
            <a className="banner-link" href="#/settings/sync?google">
              Open Google setup
            </a>
          )}
        </div>
      )}

      <PinnedList channelId={null} toast={toast} />

      <section className="section">
        <h2 className="section-label">What Lyra has access to</h2>
        <div className="group">
          {google.map((c) => (
            <ConnectorRow key={c.id} c={c} busy={busy === c.id} onConnect={() => connect(c.id)} onDisconnect={() => disconnect(c.id)} />
          ))}
        </div>
        <p className="hint">Read-only, always. Lyra asks Google only for permission to look, and refuses anything more.</p>
        {unavailable && <p className="hint">Google sign-in works in the Android app. This browser preview can't connect.</p>}
      </section>

      <section className="section">
        <h2 className="section-label">Who Lyra is, and what it knows</h2>
        <div className="group">
          <a className="item" href="#/soul">
            <span className="tile">
              <Spark />
            </span>
            <span className="body">
              <div className="title">Soul</div>
              <div className="sub">Lyra's character and how it talks to you</div>
            </span>
            <Chevron className="chev" />
          </a>
          <a className="item" href="#/memory">
            <span className="tile">
              <Notebook />
            </span>
            <span className="body">
              <div className="title">Memory</div>
              <div className="sub">
                {memCount === null ? "Rules, people, projects and open loops" : `${memCount} ${memCount === 1 ? "fact" : "facts"} saved`}
              </div>
            </span>
            <Chevron className="chev" />
          </a>
        </div>
      </section>
    </div>
  );
}

function ConnectorRow({
  c,
  busy,
  onConnect,
  onDisconnect,
}: {
  c: ConnectorStatus & { id: GoogleId };
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const body = (sub: string, tone = "", on = false) => (
    <>
      <span className={`tile${on ? " on" : ""}`}>{ICONS[c.id]}</span>
      <span className="body">
        <div className="title">{c.label}</div>
        <div className={`sub ${tone}`}>{sub}</div>
      </span>
    </>
  );

  if (c.state === "connected")
    return (
      <div className="item">
        {body(`${c.access}${c.account ? ` · ${c.account}` : ""}`, "", true)}
        <button className="btn quiet" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  if (c.state === "error")
    return (
      <button className="item" onClick={onConnect} disabled={busy}>
        {body(c.detail ?? "Something's wrong. Tap to reconnect.", "bad")}
        <Chevron className="chev" />
      </button>
    );
  if (c.state === "not_connected")
    return (
      <button className="item" onClick={onConnect} disabled={busy}>
        {body(busy ? "Opening Google sign-in…" : `Connect ${NAMES[c.id]}, read-only`)}
        <span className="tile empty">
          <Plus />
        </span>
      </button>
    );
  return (
    <div className="item">
      {body("Needs the Android app")}
      <span className="pill">Phone only</span>
    </div>
  );
}
