import { useEffect, useState, type ReactNode } from "react";
import { api, type AppState, type ConnectorStatus } from "../api";
import { Calendar, Chevron, File, Mail, Notebook, Plus } from "../icons";
import { Orb } from "../LyraMark";

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; title: string; body: string } | null>(null);
  const gmail = state.connectors.find((c) => c.id === "gmail")!;

  useEffect(() => {
    api
      .memory()
      .then((m) => setMemCount(m.sections.reduce((n, s) => n + s.items.length, 0)))
      .catch(() => {});
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      setState(await api.connectGmail());
      setNotice({ tone: "good", title: "Gmail is connected", body: "Lyra can now read your mail. It can't send, delete or change anything." });
    } catch (e) {
      setNotice({ tone: "bad", title: "Gmail didn't connect", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? Lyra will stop being able to read your mail.")) return;
    try {
      setState(await api.disconnectGmail());
      setNotice(null);
      toast("Gmail disconnected");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="page-head">
        <Orb size="lg" />
        <h1>Lyra</h1>
        <p>Chief of staff · lives on this phone</p>
      </div>

      {notice && (
        <div className={`banner ${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
          <strong>{notice.title}</strong>
          {notice.body}
        </div>
      )}

      <section className="section">
        <h2 className="section-label">What Lyra has access to</h2>
        <div className="group">
          <MailRow c={gmail} busy={busy} onConnect={connect} onDisconnect={disconnect} />
          <Soon icon={<Calendar />} title="Calendar" when="Coming in phase 5" />
          <Soon icon={<File />} title="Files and docs" when="Coming in phase 5" />
        </div>
        {gmail.state === "unavailable" && <p className="hint">Gmail works in the Android app. This browser preview can't sign in to Google.</p>}
      </section>

      <section className="section">
        <h2 className="section-label">What Lyra knows</h2>
        <div className="group">
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

function MailRow({
  c,
  busy,
  onConnect,
  onDisconnect,
}: {
  c: ConnectorStatus;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const body = (sub: string, tone = "", on = false) => (
    <>
      <span className={`tile${on ? " on" : ""}`}>
        <Mail />
      </span>
      <span className="body">
        <div className="title">Mail</div>
        <div className={`sub ${tone}`}>{sub}</div>
      </span>
    </>
  );

  if (c.state === "connected")
    return (
      <div className="item">
        {body(`Can read your mail${c.account ? ` · ${c.account}` : ""}`, "", true)}
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
        {body(busy ? "Opening Google sign-in…" : "Connect Gmail, read-only")}
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

function Soon({ icon, title, when }: { icon: ReactNode; title: string; when: string }) {
  return (
    <div className="item">
      <span className="tile">{icon}</span>
      <span className="body">
        <div className="title">{title}</div>
        <div className="sub">{when}</div>
      </span>
    </div>
  );
}
