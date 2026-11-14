// The Lyra page: Lyra's profile. Who Lyra is (shortcuts to Activity, Memory, Skills, Soul),
// a few numbers, what Lyra can see (a tile per service; tap one for what it can and can't do,
// and to disconnect), what it may do with your OK, and its promise.
import { useEffect, useState, type ReactNode } from "react";
import { api, type AppState, type ConnectorStatus } from "../api";
import { Bell, Bulb, Calendar, ChatIcon, Check, Close, File, Inbox, Mail, Music, Notebook, People, Plus, Pulse, Shield, Spark } from "../icons";
import { Avatar } from "../LyraMark";
import { PinnedList } from "./Pinned";
import { notices, type NoticeApp } from "../platform";

type GoogleId = "gmail" | "calendar" | "drive";
type ServiceId = GoogleId | "contacts" | "notices" | "spotify";
type SpotifyState = Awaited<ReturnType<typeof api.spotifyState>>;

const ICONS: Record<ServiceId, ReactNode> = { gmail: <Mail />, calendar: <Calendar />, drive: <File />, contacts: <People />, notices: <Bell />, spotify: <Music /> };
const NAMES: Record<GoogleId, string> = { gmail: "Gmail", calendar: "Google Calendar", drive: "Google Drive" };
const SHORT: Record<ServiceId, string> = { gmail: "Mail", calendar: "Calendar", drive: "Files", contacts: "Contacts", notices: "Notifications", spotify: "Spotify" };
const PROMISE: Record<GoogleId, string> = {
  gmail: "Lyra can now read your mail. It can't send, delete or change anything on its own.",
  calendar: "Lyra can now see your schedule. It can't add, change or answer events on its own.",
  drive: "Lyra can now find and read your files. It can't change, share or delete them.",
};

/** What each service lets Lyra do, and what it never does, for the sheet. */
function abilities(id: ServiceId, state: AppState, spotify: SpotifyState | null): { yes: string[]; no: string[] } {
  switch (id) {
    case "gmail":
      return {
        yes: ["Read and search your mail", ...(state.actions.email ? ["Write emails for you to check and send"] : []), ...(state.actions.archive ? ["Archive mail you approve"] : [])],
        no: ["Send, delete or change anything on its own"],
      };
    case "calendar":
      return { yes: ["See your schedule", ...(state.actions.event ? ["Add, move or answer events when you tap"] : [])], no: ["Add, change or answer events on its own"] };
    case "drive":
      return { yes: ["Find and read your files"], no: ["Change, share or delete them"] };
    case "contacts":
      return { yes: ["Look up one name when you mention someone"], no: ["Copy or upload your address book"] };
    case "notices":
      return {
        yes: ["Read texts, chats and app alerts from the last two days", "Mention what's waiting when you ask or in a brief"],
        no: ["Reply to, dismiss or open anything", "Keep them anywhere but this phone", "See sign-in codes (blanked out)"],
      };
    case "spotify":
      return {
        yes: ["See what you play and your playlists", ...(spotify?.playback ? ["Play, pause and skip when you ask"] : []), ...(spotify?.playlists ? ["Make playlists you add with a tap"] : [])],
        no: ["Change your library on its own"],
      };
  }
}

export function Access({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [counts, setCounts] = useState<{ done: number; remembered: number } | null>(null);
  const [spotify, setSpotify] = useState<SpotifyState | null>(null);
  const [busy, setBusy] = useState<ServiceId | null>(null);
  const [open, setOpen] = useState<ServiceId | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; title: string; body: string } | null>(null);
  const google = state.connectors.filter((c): c is ConnectorStatus & { id: GoogleId } => c.id in NAMES);
  const unavailable = google.some((c) => c.state === "unavailable");
  const account = google.find((c) => c.state === "connected" && c.account)?.account;

  const reloadSpotify = () => void api.spotifyState().then(setSpotify, () => {});
  useEffect(reloadSpotify, [state]);
  useEffect(() => {
    const week = Date.now() - 7 * 86_400_000;
    void Promise.all([api.activity().catch(() => []), api.memory().catch(() => null), api.people().catch(() => [])]).then(([acts, mem, people]) =>
      setCounts({
        done: acts.filter((a) => new Date(a.at).getTime() >= week).length,
        remembered: (mem?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0) + people.length,
      }),
    );
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
      setOpen(null);
      toast(`${NAMES[id]} disconnected`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // one tile per service: connected ones open their sheet; others connect (or explain)
  const tiles: { id: ServiceId; on: boolean; status: string; tone?: "bad"; tap: () => void }[] = [
    ...google.map((c) => ({
      id: c.id,
      on: c.state === "connected",
      tone: c.state === "error" ? ("bad" as const) : undefined,
      status: busy === c.id ? "Opening sign-in…" : c.state === "connected" ? "Reading" : c.state === "error" ? "Tap to reconnect" : c.state === "unavailable" ? "Phone app only" : "Not connected",
      tap: () => (c.state === "connected" || c.state === "unavailable" ? setOpen(c.id) : void connect(c.id)),
    })),
    ...(state.notices !== null ? [{ id: "notices" as const, on: !!state.notices, status: state.notices ? "Reading" : "Off", tap: () => setOpen("notices") }] : []),
    ...(state.contacts !== null ? [{ id: "contacts" as const, on: !!state.contacts, status: state.contacts ? "On this phone" : "Off", tap: () => setOpen("contacts") }] : []),
    ...(spotify ? [{ id: "spotify" as const, on: spotify.connected, status: spotify.connected ? "Connected" : spotify.available ? "Not connected" : "Phone or Windows app", tap: () => setOpen("spotify") }] : []),
  ];
  const connected = tiles.filter((t) => t.on).length;

  return (
    <div className="screen lyra-page">
      <div className="lp-head">
        <span className="lp-orb">
          <Avatar />
          <i className="lp-dot" aria-hidden="true" />
        </span>
        <h1 className="lp-name">Lyra</h1>
        <p className="lp-status">Your chief of staff · here for you</p>
        <nav className="lp-actions" aria-label="Lyra">
          <a className="lp-action" href="#/activity">
            <span className="c">
              <Pulse />
            </span>
            Activity
          </a>
          <a className="lp-action" href="#/memory">
            <span className="c">
              <Notebook />
            </span>
            Memory
          </a>
          <a className="lp-action" href="#/memory?skills">
            <span className="c">
              <Bulb />
            </span>
            Skills
          </a>
          <a className="lp-action" href="#/soul">
            <span className="c">
              <Spark />
            </span>
            Soul
          </a>
        </nav>
      </div>

      <div className="lp-stats">
        <a className="lp-stat" href="#/activity">
          <b>{counts?.done ?? "–"}</b>
          <span>done this week</span>
        </a>
        <a className="lp-stat" href="#/memory">
          <b>{counts?.remembered ?? "–"}</b>
          <span>remembered</span>
        </a>
        <div className="lp-stat">
          <b>{connected}</b>
          <span>connected</span>
        </div>
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
        <h2 className="section-label">What Lyra can see</h2>
        {account && <p className="lp-account">Google · {account} · read only</p>}
        <div className="lp-grid">
          {tiles.map((t) => (
            <button key={t.id} className={`lp-svc${t.on ? "" : " off"}`} disabled={busy === t.id} onClick={t.tap}>
              <span className="t">{ICONS[t.id]}</span>
              <span>
                <span className="n">{SHORT[t.id]}</span>
                <span className={`s${t.tone ? ` ${t.tone}` : ""}`}>
                  <i />
                  {t.status}
                </span>
              </span>
            </button>
          ))}
          {tiles.length % 2 === 1 && (
            <div className="lp-svc more" aria-hidden="true">
              <Plus size={18} /> More soon
            </div>
          )}
        </div>
        {unavailable && <p className="hint">Google sign-in works in the Android app. This browser preview can't connect.</p>}
      </section>

      <WithYourOk state={state} setState={setState} toast={toast} spotify={spotify} reloadSpotify={reloadSpotify} />

      <div className="lp-promise">
        <h3>
          <Shield size={20} />
          Lyra's promise
        </h3>
        <ul>
          <li>
            <Check size={18} />
            Looks on its own. Never sends, books, pays or deletes without your tap.
          </li>
          <li>
            <Check size={18} />
            Treats email and web pages as information, never as instructions.
          </li>
          <li>
            <Check size={18} />
            Asks Google only for what it needs, and refuses anything wider.
          </li>
        </ul>
      </div>

      {open && (
        <ServiceSheet
          id={open}
          state={state}
          setState={setState}
          toast={toast}
          spotify={spotify}
          reloadSpotify={reloadSpotify}
          google={google.find((c) => c.id === open)}
          onDisconnect={() => open in NAMES && void disconnect(open as GoogleId)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** One service: what Lyra can and can't do with it, its switch or setup, and Disconnect. */
function ServiceSheet({
  id,
  state,
  setState,
  toast,
  spotify,
  reloadSpotify,
  google,
  onDisconnect,
  onClose,
}: {
  id: ServiceId;
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
  spotify: SpotifyState | null;
  reloadSpotify: () => void;
  google?: ConnectorStatus;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);

  const run = async (fn: () => Promise<AppState>, done: string, close = false) => {
    setBusy(true);
    try {
      setState(await fn());
      toast(done);
      setSetup(false);
      if (close) onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      reloadSpotify();
    }
  };

  const can = abilities(id, state, spotify);
  const on = id === "notices" ? !!state.notices : id === "contacts" ? !!state.contacts : id === "spotify" ? !!spotify?.connected : google?.state === "connected";
  const sub =
    id === "notices"
      ? state.notices
        ? "On this phone only"
        : "Off"
      : id === "contacts"
      ? "Your phone's contacts"
      : id === "spotify"
        ? spotify?.connected
          ? `Spotify${spotify.name ? ` · ${spotify.name}` : ""}`
          : spotify?.available
            ? "Not connected yet"
            : "Works in the Android app and the newest Windows app"
        : google?.state === "unavailable"
          ? "Needs the Android app"
          : `${NAMES[id as GoogleId]}${google?.account ? ` · ${google.account}` : ""}`;

  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet lp-sheet" role="dialog" aria-modal="true" aria-label={SHORT[id]}>
        <div className="lp-sheet-head">
          <span className={`t${on ? "" : " off"}`}>{ICONS[id]}</span>
          <div>
            <h2>{SHORT[id]}</h2>
            <p>{sub}</p>
          </div>
        </div>

        <div className="lp-can">
          {can.yes.map((y) => (
            <div key={y}>
              <Check size={20} className="yes" />
              {y}
            </div>
          ))}
          {can.no.map((n) => (
            <div key={n}>
              <Close size={20} className="no" />
              {n}
            </div>
          ))}
        </div>

        {id === "notices" && <NoticesPanel state={state} setState={setState} toast={toast} />}

        {id === "contacts" && (
          <div className="group lp-sheet-group">
            <label className="item">
              <span className="body">
                <div className="title">Look up contacts</div>
                <div className="sub">One name at a time, when you mention someone.</div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={!!state.contacts}
                disabled={busy}
                onChange={(e) => void run(() => api.allowContacts(e.target.checked), e.target.checked ? "Lyra can look up your contacts" : "Contacts off")}
              />
            </label>
          </div>
        )}

        {id === "spotify" && spotify?.connected && (
          <div className="group lp-sheet-group">
            <label className="item">
              <span className="body">
                <div className="title">Show what's playing</div>
                <div className="sub">The song shows under Lyra's avatar, and its headphones glow.</div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={spotify.nowPlaying}
                disabled={busy}
                onChange={(e) => void run(() => api.showNowPlaying(e.target.checked), e.target.checked ? "Lyra shows what's playing" : "Now playing: off")}
              />
            </label>
            <label className="item">
              <span className="body">
                <div className="title">Control playback</div>
                <div className="sub">Play, pause, skip or queue when you ask. Spotify only allows this with Premium.</div>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={spotify.playback}
                disabled={busy}
                onChange={(e) => void run(() => api.allowSpotify("playback", e.target.checked), e.target.checked ? "Lyra can control playback" : "Playback control off")}
              />
            </label>
          </div>
        )}

        {id === "spotify" && spotify?.available && !spotify.connected && (setup || !spotify.clientId) && (
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
          </div>
        )}

        <div className="lp-sheet-actions">
          <button className="btn quiet" onClick={onClose}>
            Close
          </button>
          {id in NAMES && google?.state === "connected" && (
            <button className="btn quiet lp-bad" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
          {id === "spotify" && spotify?.connected && (
            <button className="btn quiet lp-bad" disabled={busy} onClick={() => confirm("Disconnect Spotify?") && void run(() => api.disconnectSpotify(), "Spotify disconnected", true)}>
              Disconnect
            </button>
          )}
          {id === "spotify" && spotify?.available && !spotify.connected && (
            <button
              className="btn ink"
              disabled={busy || ((setup || !spotify.clientId) && !clientId.trim())}
              onClick={() => void run(() => (setup || !spotify.clientId ? api.connectSpotify(clientId) : api.connectSpotify()), "Spotify connected")}
            >
              {busy ? "Opening Spotify…" : "Connect"}
            </button>
          )}
        </div>
        {id === "spotify" && spotify?.available && !spotify.connected && spotify.clientId && !setup && (
          <button className="link-btn" onClick={() => setSetup(true)}>
            Use a different Spotify app
          </button>
        )}
      </div>
    </div>
  );
}

/** Writing emails, adding events, making playlists: each one only when you tap. */
function WithYourOk({
  state,
  setState,
  toast,
  spotify,
  reloadSpotify,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
  spotify: SpotifyState | null;
  reloadSpotify: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const linked = (id: GoogleId) => state.connectors.find((c) => c.id === id)?.state === "connected";
  const flip = async (kind: string, fn: () => Promise<AppState>, done: string) => {
    setBusy(kind);
    try {
      setState(await fn());
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
      reloadSpotify();
    }
  };
  const rows = [
    {
      kind: "email",
      icon: <Mail />,
      title: "Write emails",
      sub: linked("gmail") ? "Goes only when you tap Send" : "Connect Mail first",
      ready: linked("gmail"),
      checked: state.actions.email,
      set: (on: boolean) => flip("email", () => api.allowActions("email", on), on ? "Lyra can write emails for your OK" : "Write emails: off"),
    },
    {
      kind: "event",
      icon: <Calendar />,
      title: "Calendar changes",
      sub: linked("calendar") ? "Add, move or answer events, only when you tap" : "Connect Calendar first",
      ready: linked("calendar"),
      checked: state.actions.event,
      set: (on: boolean) => flip("event", () => api.allowActions("event", on), on ? "Lyra can add events with your OK" : "Add calendar events: off"),
    },
    {
      kind: "archive",
      icon: <Inbox />,
      title: "Tidy your inbox",
      sub: linked("gmail") ? "Archives mail only when you tap Archive" : "Connect Mail first",
      ready: linked("gmail"),
      checked: state.actions.archive,
      set: (on: boolean) => flip("archive", () => api.allowActions("archive", on), on ? "Lyra can tidy your inbox with your OK" : "Tidy your inbox: off"),
    },
    ...(state.actions.text !== null
      ? [
          {
            kind: "text",
            icon: <ChatIcon />,
            title: "Write texts",
            sub: "Opens Messages with the text ready; you send it",
            ready: true,
            checked: !!state.actions.text,
            set: (on: boolean) => flip("text", () => api.allowActions("text", on), on ? "Lyra can write texts for you to send" : "Write texts: off"),
          },
        ]
      : []),
    ...(spotify?.available || spotify?.connected
      ? [
          {
            kind: "playlists",
            icon: <Music />,
            title: "Make playlists",
            sub: spotify.connected ? "Made only when you tap Add" : "Connect Spotify first",
            ready: spotify.connected,
            checked: spotify.playlists,
            set: (on: boolean) => flip("playlists", () => api.allowSpotify("playlists", on), on ? "Lyra can make playlists for your OK" : "Playlists off"),
          },
        ]
      : []),
  ];
  return (
    <section className="section">
      <h2 className="section-label">With your OK each time</h2>
      <div className="group">
        {rows.map((r) => (
          <label className="item" key={r.kind}>
            <span className={`tile${r.checked && r.ready ? " on" : ""}`}>{r.icon}</span>
            <span className="body">
              <div className="title">{r.title}</div>
              <div className="sub">{r.sub}</div>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={r.checked && r.ready} disabled={busy !== null || !r.ready} onChange={(e) => void r.set(e.target.checked)} />
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * Reading the phone's notifications: Android turns it on (Notification access), Lyra can't.
 * Off: what it means and a button to Android's page. On: which apps to leave out, and off.
 */
function NoticesPanel({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [apps, setApps] = useState<NoticeApp[] | null>(null);
  const [asked, setAsked] = useState(false);
  const loadApps = () => void notices.apps().then((a) => setApps(a.sort((x, y) => y.last - x.last)), () => setApps([]));
  useEffect(() => {
    if (state.notices) loadApps();
  }, [state.notices]);
  // back from Android settings: if access is on now, turn it on here
  useEffect(() => {
    if (!asked) return;
    const back = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (await notices.access()) {
          setState(await api.allowNotices(true));
          toast("Lyra can read your notifications");
          setAsked(false);
        }
      } catch (e) {
        toast((e as Error).message);
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [asked]);

  if (!state.notices)
    return (
      <div className="lp-notice-setup">
        <p className="hint">Android asks you to turn this on yourself: find <b>Lyra</b> on the next screen and switch it on, then come back.</p>
        <button className="btn ink lp-wide" onClick={() => void notices.open().then(() => setAsked(true))}>
          Turn on in Android settings
        </button>
        {asked && (
          <p className="hint">
            Greyed out, or Android says it's a restricted setting? Lyra was installed from a file, so Android wants one more step: open{" "}
            <button className="link-btn inline" onClick={() => void notices.appInfo()}>
              App info for Lyra
            </button>
            , tap ⋮ at the top, choose <b>Allow restricted settings</b>, then try again.
          </p>
        )}
      </div>
    );

  return (
    <>
      {apps && apps.length > 0 && (
        <>
          <p className="sub-label lp-sub">Apps Lyra reads</p>
          <div className="group lp-sheet-group lp-apps">
            {apps.map((a) => (
              <label className="item" key={a.pkg}>
                <span className="body">
                  <div className="title">{a.label}</div>
                  <div className="sub">{a.blocked ? "Left out" : `${a.count} lately`}</div>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={!a.blocked}
                  onChange={async (e) => {
                    await notices.block(a.pkg, !e.target.checked).catch((err) => toast((err as Error).message));
                    loadApps();
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {apps && !apps.length && <p className="hint">Nothing yet. New notifications show up here as they arrive, and you can leave any app out.</p>}
      <div className="lp-sheet-row">
        <button
          className="btn quiet"
          onClick={async () => {
            await notices.clear().catch(() => {});
            loadApps();
            toast("Forgotten");
          }}
        >
          Forget what's kept
        </button>
        <button
          className="btn quiet lp-bad"
          onClick={async () => {
            setState(await api.allowNotices(false));
            toast("Lyra won't read notifications. You can also turn access off in Android settings.");
          }}
        >
          Turn off
        </button>
      </div>
    </>
  );
}
