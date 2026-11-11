import { useEffect, useState, type ReactNode } from "react";
import { api, type AppState, type ConnectorStatus } from "../api";
import { Calendar, Chevron, File, Mail, Notebook, Plus } from "../icons";
import { LyraMark } from "../LyraMark";

const onThisComputer = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

export function Access({
  state,
  setState,
  toast,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
}) {
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const [notice] = useState(() => ({ error: params.get("error"), connected: params.get("connected") }));
  const [memCount, setMemCount] = useState<number | null>(null);
  const gmail = state.connectors.find((c) => c.id === "gmail")!;

  useEffect(() => {
    if (notice.error || notice.connected) history.replaceState(null, "", "#/access");
    api
      .memory()
      .then((m) => setMemCount(m.sections.reduce((n, s) => n + s.items.length, 0)))
      .catch(() => {});
  }, [notice]);

  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? Lyra will stop being able to read your mail.")) return;
    try {
      setState(await api.disconnectGmail());
      toast("Gmail disconnected");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="page-head">
        <div className="round mark" style={{ margin: "0 auto", width: 96, height: 96 }}>
          <LyraMark size={56} />
        </div>
        <h1>Lyra</h1>
        <p>Your chief of staff, running on your own computer</p>
      </div>

      {notice.connected && (
        <div className="banner good" role="status">
          <strong>Gmail is connected</strong>
          Lyra can now read your mail. It can't send, delete or change anything.
        </div>
      )}
      {notice.error && (
        <div className="banner bad" role="alert">
          <strong>Gmail didn't connect</strong>
          {notice.error}
        </div>
      )}

      <section className="section">
        <h2 className="section-label">What Lyra has access to</h2>
        <div className="group">
          <MailRow c={gmail} onDisconnect={disconnect} />
          <Soon icon={<Calendar />} title="Calendar" when="Coming in phase 5" />
          <Soon icon={<File />} title="Files and docs" when="Coming in phase 5" />
        </div>
        {gmail.state === "not_configured" && (
          <p className="hint">
            To connect Gmail, add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> and
            restart Lyra. The README has the steps.
          </p>
        )}
        {(gmail.state === "not_connected" || gmail.state === "error") && !onThisComputer() && (
          <p className="hint">Google only allows this sign-in on the computer Lyra runs on. Open Lyra there and tap Mail.</p>
        )}
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

function MailRow({ c, onDisconnect }: { c: ConnectorStatus; onDisconnect: () => void }) {
  const inner = (sub: string, tone = "", on = false, action = <Chevron className="chev" />) => (
    <>
      <span className={`tile${on ? " on" : ""}`}>
        <Mail />
      </span>
      <span className="body">
        <div className="title">Mail</div>
        <div className={`sub ${tone}`}>{sub}</div>
      </span>
      {action}
    </>
  );

  if (c.state === "connected")
    return (
      <div className="item">
        {inner(
          `Can read your mail${c.account ? ` · ${c.account}` : ""}`,
          "",
          true,
          <button className="btn quiet" onClick={onDisconnect}>
            Disconnect
          </button>,
        )}
      </div>
    );
  if (c.state === "error")
    return (
      <a className="item" href="/auth/google/start">
        {inner(c.detail ?? "Something's wrong. Tap to reconnect.", "bad")}
      </a>
    );
  if (c.state === "not_connected" && onThisComputer())
    return (
      <a className="item" href="/auth/google/start">
        {inner("Connect Gmail, read-only", "", false, <span className="tile empty"><Plus /></span>)}
      </a>
    );
  return <div className="item">{inner(c.state === "not_configured" ? "Not set up yet" : "Not connected", "", false, <span />)}</div>;
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
