import { useEffect, useState, type ReactNode } from "react";
import { api, type AppState, type ConnectorStatus } from "../api";
import { Calendar, Chevron, File, Mail, Music, Notebook, Plus, Spark, User } from "../icons";
import { Orb } from "../LyraMark";
import { thisDevice } from "../platform";
import { PinnedList } from "./Pinned";

type GoogleId = "gmail" | "calendar" | "drive";

const ICONS: Record<GoogleId, ReactNode> = { gmail: <Mail />, calendar: <Calendar />, drive: <File /> };
const NAMES: Record<GoogleId, string> = { gmail: "Gmail", calendar: "Google Calendar", drive: "Google Drive" };
const PROMISE: Record<GoogleId, string> = {
  gmail: "Lyra can now read your mail. It can't send, delete or change anything on its own.",
  calendar: "Lyra can now see your schedule. It can't add, change or answer events on its own.",
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
        <p className="hint">On its own, Lyra can only look. Anything that writes needs your tap each time (below), and Lyra refuses any wider permission.</p>
        {unavailable && <p className="hint">Google sign-in works in the Android app. This browser preview can't connect.</p>}
      </section>

      {state.contacts !== null && <PhoneContacts state={state} setState={setState} toast={toast} />}

      <SpotifySection state={state} setState={setState} toast={toast} />

      {!unavailable && <WithYourOk state={state} setState={setState} toast={toast} />}

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

type SpotifyState = Awaited<ReturnType<typeof api.spotifyState>>;

/** Phase 14: Spotify, with the user's own Spotify developer app. */
function SpotifySection({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [s, setS] = useState<SpotifyState | null>(null);
  const [clientId, setClientId] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const reload = () => void api.spotifyState().then(setS, () => {});
  useEffect(reload, [state]);
  if (!s) return null;
  const run = async (fn: () => Promise<AppState>, done: string) => {
    setBusy(true);
    try {
      setState(await fn());
      toast(done);
      setSetup(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  };
  return (
    <section className="section">
      <h2 className="section-label">Music</h2>
      <div className="group">
        {s.connected ? (
          <div className="item">
            <span className="tile on">
              <Music />
            </span>
            <span className="body">
              <div className="title">Spotify</div>
              <div className="sub">Can see what you play{s.name ? ` · ${s.name}` : ""}</div>
            </span>
            <button className="btn quiet" disabled={busy} onClick={() => confirm("Disconnect Spotify?") && void run(() => api.disconnectSpotify(), "Spotify disconnected")}>
              Disconnect
            </button>
          </div>
        ) : !s.available ? (
          <div className="item">
            <span className="tile">
              <Music />
            </span>
            <span className="body">
              <div className="title">Spotify</div>
              <div className="sub">Works in the Android app and the newest Windows app.</div>
            </span>
          </div>
        ) : (
          <button className="item" disabled={busy} onClick={() => (s.clientId ? void run(() => api.connectSpotify(), "Spotify connected") : setSetup(true))}>
            <span className="tile">
              <Music />
            </span>
            <span className="body">
              <div className="title">Spotify</div>
              <div className="sub">{busy ? "Opening Spotify sign-in…" : s.clientId ? "Connect Spotify, look only" : "Set up Spotify (about 3 minutes)"}</div>
            </span>
            <span className="tile empty">
              <Plus />
            </span>
          </button>
        )}
        {s.connected && (
          <>
            <label className="item">
              <span className="body">
                <div className="title">Control playback</div>
                <div className="sub">Play, pause, skip or queue when you ask. Spotify only allows this with Premium.</div>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={s.playback} disabled={busy} onChange={(e) => void run(() => api.allowSpotify("playback", e.target.checked), e.target.checked ? "Lyra can control playback" : "Playback control off")} />
            </label>
            <label className="item">
              <span className="body">
                <div className="title">Make playlists</div>
                <div className="sub">Lyra puts together playlists for you to check; each is made only when you tap.</div>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={s.playlists} disabled={busy} onChange={(e) => void run(() => api.allowSpotify("playlists", e.target.checked), e.target.checked ? "Lyra can make playlists for your OK" : "Playlists off")} />
            </label>
          </>
        )}
      </div>
      {setup && (
        <div className="setup-box">
          <ol className="setup-steps">
            <li>
              On <b>developer.spotify.com/dashboard</b>, log in and tap <b>Create app</b>. Any name and description.
            </li>
            <li>
              Under <b>Redirect URIs</b>, add both <b>app.lyra.chief://spotify</b> and <b>http://127.0.0.1/spotify</b>. Tick <b>Web API</b>, agree, and save.
            </li>
            <li>
              Open the app's <b>Settings</b>, copy the <b>Client ID</b>, and paste it here. No secret is needed.
            </li>
          </ol>
          <label className="action-field">
            <span>Client ID</span>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="32 letters and numbers" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
          <div className="action-buttons">
            <button className="btn primary" disabled={busy || !clientId.trim()} onClick={() => void run(() => api.connectSpotify(clientId), "Spotify connected")}>
              {busy ? "Opening Spotify…" : "Connect"}
            </button>
            <button className="btn quiet" onClick={() => setSetup(false)}>
              Cancel
            </button>
          </div>
          <p className="hint">Your Spotify app works for your own account straight away. Lyra only looks unless you turn on the switches that appear once you're connected.</p>
        </div>
      )}
      {s.available && !s.connected && s.clientId && !setup && (
        <button className="link-btn" onClick={() => setSetup(true)}>
          Use a different Spotify app
        </button>
      )}
    </section>
  );
}

/** Phase 10: look a name up in the phone's contacts. */
function PhoneContacts({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="section">
      <div className="group">
        <label className="item">
          <span className={`tile${state.contacts ? " on" : ""}`}>
            <User />
          </span>
          <span className="body">
            <div className="title">Phone contacts</div>
            <div className="sub">When you mention someone, Lyra can look up their email or number here. One name at a time; it never copies your address book.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={!!state.contacts}
            disabled={busy}
            onChange={async (e) => {
              const on = e.target.checked;
              setBusy(true);
              try {
                setState(await api.allowContacts(on));
                toast(on ? "Lyra can look up your contacts" : "Contacts off");
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
    </section>
  );
}

/** Phase 9: Lyra may write emails and add events, each one only when you tap. */
function WithYourOk({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState<"email" | "event" | null>(null);
  const linked = (id: GoogleId) => state.connectors.find((c) => c.id === id)?.state === "connected";
  const rows = [
    {
      kind: "email" as const,
      link: "gmail" as GoogleId,
      title: "Write emails",
      sub: "Lyra writes emails and replies for you to check. Each one goes only when you tap Send (or Save to Drafts).",
      need: "Connect Gmail first",
      on: "Lyra can write emails for your OK",
    },
    {
      kind: "event" as const,
      link: "calendar" as GoogleId,
      title: "Add calendar events",
      sub: "Lyra suggests events; each is added only when you tap Add. Guests are invited only if you asked.",
      need: "Connect Google Calendar first",
      on: "Lyra can add events with your OK",
    },
  ];
  const flip = async (kind: "email" | "event", on: boolean, done: string) => {
    setBusy(kind);
    try {
      setState(await api.allowActions(kind, on));
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="section">
      <h2 className="section-label">With your OK each time</h2>
      <div className="group">
        {rows.map((r) => (
          <label className="item" key={r.kind}>
            <span className={`tile${state.actions[r.kind] ? " on" : ""}`}>{ICONS[r.link]}</span>
            <span className="body">
              <div className="title">{r.title}</div>
              <div className="sub">{linked(r.link) ? r.sub : r.need}</div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={state.actions[r.kind]}
              disabled={busy !== null || !linked(r.link)}
              onChange={(e) => void flip(r.kind, e.target.checked, e.target.checked ? r.on : `${r.title}: off`)}
            />
          </label>
        ))}
      </div>
      <p className="hint">Turning one on asks Google for that one permission. Lyra uses it only after your tap, never on its own, and never because an email or web page asked. Turning it off stops Lyra offering; to remove Google's permission too, disconnect that service.</p>
    </section>
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
