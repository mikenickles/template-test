import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isNative, onChange, type AppState, type Channel } from "./api";
import { Drawer } from "./Drawer";
import { Back, ChannelIcon, Info, Layers, MenuIcon } from "./icons";
import { Avatar } from "./LyraMark";
import { Access } from "./screens/Access";
import { ChannelInfo, NewChannelDialog } from "./screens/ChannelScreens";
import { Chat } from "./screens/Chat";
import { Memory } from "./screens/Memory";
import { DocPage, Docs } from "./screens/Docs";
import { Settings, SETTINGS_SECTIONS, type SettingsSection } from "./screens/Settings";
import { Soul } from "./screens/Soul";
import { TaskPage, Tasks, WorkerLog } from "./screens/Tasks";
import { Activity } from "./screens/Activity";
import { RoutinePage } from "./screens/Routines";
import { SyncConflict } from "./screens/SyncSection";
import { StatusLine } from "./StatusLine";
import { AwaySheet } from "./Away";
import { deliver } from "./attach";
import { appLock, isDesktop, notifier, shares } from "./platform";
import { Star, TasksIcon } from "./icons";

export type Route =
  | { name: "chat"; channelId: number | null; focus?: number }
  | { name: "channel-info"; channelId: number }
  | { name: "tasks" }
  | { name: "task"; taskId: number }
  | { name: "worker-log"; taskId: number }
  | { name: "routine"; routineId: number }
  | { name: "access" }
  | { name: "memory" }
  | { name: "docs" }
  | { name: "activity" }
  | { name: "doc"; docId: number }
  | { name: "soul" }
  | { name: "settings"; section?: SettingsSection };

export function readRoute(hash = location.hash): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  // "?m=123": a message to jump to
  const m = Number(new URLSearchParams(query).get("m")) || undefined;
  const c = path.match(/^c\/(\d+)(\/info)?$/);
  if (c) return c[2] ? { name: "channel-info", channelId: Number(c[1]) } : { name: "chat", channelId: Number(c[1]), focus: m };
  const t = path.match(/^t\/(\d+)(\/log)?$/);
  if (t) return t[2] ? { name: "worker-log", taskId: Number(t[1]) } : { name: "task", taskId: Number(t[1]) };
  const d = path.match(/^d\/(\d+)$/);
  if (d) return { name: "doc", docId: Number(d[1]) };
  const r = path.match(/^r\/(\d+)$/);
  if (r) return { name: "routine", routineId: Number(r[1]) };
  const s = path.match(/^settings\/(\w+)$/);
  if (s && (SETTINGS_SECTIONS as string[]).includes(s[1])) return { name: "settings", section: s[1] as SettingsSection };
  // Docs became Artifacts: #/docs still opens it
  if (path === "artifacts") return { name: "docs" };
  if (path === "tasks" || path === "access" || path === "memory" || path === "soul" || path === "settings" || path === "docs" || path === "activity") return { name: path };
  return { name: "chat", channelId: null, focus: m };
}

/** Where the back button (on screen or Android's) goes from each screen. */
function backFrom(r: Route): string | null {
  switch (r.name) {
    case "chat":
      return r.channelId === null ? null : "#/";
    case "channel-info":
      return `#/c/${r.channelId}`;
    case "memory":
    case "soul":
      return "#/access";
    case "task":
      return "#/tasks";
    case "worker-log":
      return `#/t/${r.taskId}`;
    case "routine":
      return "#/tasks";
    case "doc":
      return "#/artifacts";
    case "settings":
      return r.section ? "#/settings" : "#/";
    default:
      return "#/";
  }
}

/** Desktop layout (sidebar, title bar) in a wide window on a computer; the phone layout otherwise. */
function useWide(): boolean {
  const query = "(min-width: 860px)";
  const can = isDesktop || !isNative;
  const [wide, setWide] = useState(() => can && matchMedia(query).matches);
  useEffect(() => {
    if (!can) return;
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [can]);
  return wide;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const wide = useWide();
  const [state, setState] = useState<AppState | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const [failed, setFailed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const drawerRef = useRef(drawer);
  drawerRef.current = drawer;

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      setDrawer(false);
      document.querySelector(".shell")?.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  // Android back button: close the menu, go back a screen, or leave the app from the main chat.
  useEffect(() => {
    if (!isNative) return;
    const sub = CapApp.addListener("backButton", () => {
      // a sheet or dialog is open (a person, a skill, attach, message actions…): back closes it
      const scrim = document.querySelector<HTMLElement>(".dialog-layer .dialog-scrim");
      if (scrim && !creatingRef.current) return scrim.click();
      if (creatingRef.current) return setCreating(false);
      if (drawerRef.current) return setDrawer(false);
      const to = backFrom(readRoute());
      if (to) location.hash = to;
      else void CapApp.minimizeApp();
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  // App lock: locked when Lyra opens, and again after a minute away. Lyra restarting
  // itself (sync, restore) moments after you unlocked doesn't count as opening.
  const [locked, setLocked] = useState(false);
  const lockOn = useRef(false);
  lockOn.current = !!state?.appLock && isNative;
  const lockChecked = useRef(false);
  useEffect(() => {
    if (state && !lockChecked.current) {
      lockChecked.current = true;
      if (state.appLock && isNative && !recentlyUnlocked()) setLocked(true);
    }
  }, [state]);
  useEffect(() => {
    if (!isNative) return;
    let leftAt = 0;
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        leftAt = Date.now();
        session("lyra.leftAt", String(leftAt));
      } else if (lockOn.current && leftAt && Date.now() - leftAt > LOCK_AFTER) setLocked(true);
      else session("lyra.leftAt", null);
    });
    return () => void sub.then((s) => s.remove());
  }, []);
  const unlocked = useCallback(() => {
    session("lyra.unlockedAt", String(Date.now()));
    setLocked(false);
  }, []);

  // Desktop shortcuts: Ctrl+N new channel, Ctrl+K the message box, Ctrl+, settings, Ctrl+Shift+T tasks.
  useEffect(() => {
    if (isNative) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n" && !e.shiftKey) setCreating(true);
      else if (k === "k" && !e.shiftKey) {
        if (readRoute().name !== "chat") location.hash = "#/";
        setTimeout(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(), 50);
      } else if (k === "," && !e.shiftKey) location.hash = "#/settings";
      else if (k === "t" && e.shiftKey) location.hash = "#/tasks";
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  // While the keyboard is up, the tab bar hides and the message box sits right on the keyboard.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (isNative) {
      const subs = [Keyboard.addListener("keyboardWillShow", () => setKeyboard(true)), Keyboard.addListener("keyboardWillHide", () => setKeyboard(false))];
      return () => subs.forEach((s) => void s.then((h) => h.remove()));
    }
    // in a browser there's no keyboard event: typing in the message box stands in for it
    // only the text field itself: buttons in the message box (attach, remove) don't raise a keyboard
    const isBox = (e: Event) => (e.target as HTMLElement | null)?.matches?.(".composer textarea") === true;
    const on = (e: FocusEvent) => isBox(e) && setKeyboard(true);
    // moving from the text field to Send or attach isn't the keyboard closing
    const off = (e: FocusEvent) => isBox(e) && !(e.relatedTarget as HTMLElement | null)?.closest?.(".composer") && setKeyboard(false);
    // leaving the chat removes the box without a focusout: check on every route change too
    const gone = () => !document.activeElement?.matches?.(".composer textarea") && setKeyboard(false);
    addEventListener("hashchange", gone);
    addEventListener("focusin", on);
    addEventListener("focusout", off);
    return () => {
      removeEventListener("focusin", on);
      removeEventListener("focusout", off);
      removeEventListener("hashchange", gone);
    };
  }, []);

  // Escape closes whatever sheet or dialog is on top, including the ones that don't handle it themselves
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const layers = document.querySelectorAll(".dialog-layer");
      const top = layers[layers.length - 1];
      if (!top) return;
      // after the dialog's own handler has had its turn: if it's still there, close it by its backdrop
      setTimeout(() => top.isConnected && top.querySelector<HTMLElement>(".dialog-scrim")?.click(), 0);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  // Only re-render when the list actually changed, so opening the menu doesn't redraw the chat mid-slide.
  const [readyCount, setReadyCount] = useState(0);
  const refreshCounts = useCallback(() => {
    api
      .taskCounts()
      .then((c) => setReadyCount(c.ready))
      .catch(() => {});
  }, []);
  // Shared to Lyra from another app: open the main chat with it in the message box.
  useEffect(() => {
    const collect = () =>
      void shares.take().then((s) => {
        if (!s) return;
        if (readRoute().name !== "chat") location.hash = "#/";
        deliver(s);
      });
    collect();
    return shares.onShared(collect);
  }, []);
  // Tapping a notification opens the chat it's about.
  // A notification opens its chat; a button on it (one of Lyra's next steps) is sent there too,
  // by the chat once it's on screen.
  useEffect(
    () =>
      notifier.onOpen((hash, say) => {
        if (say) sessionStorage.setItem("lyra.say", JSON.stringify({ hash, say, at: Date.now() }));
        if (location.hash !== hash) location.hash = hash;
        dispatchEvent(new Event("lyra:say"));
      }),
    [],
  );
  // Workers change tasks in the background: keep the badge current.
  useEffect(() => onChange(() => refreshCounts()), [refreshCounts]);
  // The Chat tab returns to whichever chat you were last in.
  const [lastChat, setLastChat] = useState("#/");
  useEffect(() => {
    if (route.name === "chat") setLastChat(route.channelId === null ? "#/" : `#/c/${route.channelId}`);
    refreshCounts();
  }, [route, refreshCounts]);

  const refreshChannels = useCallback(
    () =>
      api
        .channels()
        .then((next) => {
          setChannelsLoaded(true);
          setChannels((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    api.state().then(setState, () => setFailed(true));
    void refreshChannels();
  }, [route, refreshChannels]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // Keep the chosen accent on <html>, and remember it for the next launch's first paint.
  useEffect(() => {
    if (!state) return;
    document.documentElement.dataset.accent = state.accent;
    try {
      localStorage.setItem("lyra.accent", state.accent);
    } catch {
      // fine: it's only to avoid a flash on start
    }
  }, [state?.accent]);

  // Same for the message bubble style.
  useEffect(() => {
    if (!state) return;
    document.documentElement.dataset.bubbles = state.bubbles;
    try {
      localStorage.setItem("lyra.bubbles", state.bubbles);
    } catch {
      // fine: it's only to avoid a flash on start
    }
  }, [state?.bubbles]);

  if (failed && !state)
    return (
      <div className="center-load" style={{ padding: 24, textAlign: "center" }}>
        Lyra couldn't start. Close the app and open it again.
      </div>
    );
  if (!state) return <div className="center-load">Loading…</div>;

  const initial = (state.userName !== "you" ? state.userName : "Me").charAt(0).toUpperCase();
  const inChat = route.name === "chat" || route.name === "tasks";
  const channel = route.name === "chat" && route.channelId !== null ? channels.find((c) => c.id === route.channelId) : undefined;
  const channelMissing = route.name === "chat" && route.channelId !== null && !channel;
  const back = backFrom(route);

  return (
    <div className={`app${drawer && !wide ? " drawer-open" : ""}${keyboard ? " keyboard-open" : ""}${wide ? " desk" : ""}${isDesktop ? " in-desktop" : ""}`}>
      <Drawer
        open={drawer || wide}
        docked={wide}
        onClose={() => setDrawer(false)}
        channels={channels}
        current={route.name === "chat" ? route.channelId : undefined}
        onNewChannel={() => setCreating(true)}
        route={route.name}
        readyCount={readyCount}
        initial={initial}
        status={wide ? <StatusLine state={state} className="in-side" /> : undefined}
      />
      <div className="shell" inert={drawer && !wide}>
        {wide ? (
          <DeskBar route={route} channel={channel} back={back} />
        ) : (
        <header className={`topbar${route.name === "chat" ? " floating" : ""}`}>
          {inChat ? (
            <button
              className="ring"
              aria-label="Channels"
              aria-expanded={drawer}
              onClick={() => {
                void refreshChannels();
                setDrawer(true);
              }}
            >
              <MenuIcon />
            </button>
          ) : (
            <a className="ring" href={back ?? "#/"} aria-label="Back">
              <Back />
            </a>
          )}
          {route.name === "tasks" && <div className="topbar-slot" id="topbar-center" />}
          {route.name === "chat" && !channel && (
            <div className="avatar-stack">
              {route.name === "chat" ? (
                <a className="orb orb-sm" href="#/activity" aria-label="What Lyra's been doing" title="Activity">
                  <Avatar />
                </a>
              ) : (
                <a className="orb orb-sm" href="#/" aria-label="Chat">
                  <Avatar />
                </a>
              )}
              <StatusLine state={state} />
            </div>
          )}
          {inChat && channel && (
            <div className="avatar-stack in-channel">
              <a className="channel-head" href={`#/c/${channel.id}/info`} aria-label={`${channel.name}: channel details`}>
                <span className="orb orb-sm">
                  <Avatar />
                </span>
                <span className="channel-chip">
                  <span>{channel.name}</span>
                </span>
              </a>
              <StatusLine state={state} />
            </div>
          )}
          {!inChat && <span />}
          {route.name === "tasks" ? (
            <div className="topbar-slot" id="topbar-right" />
          ) : inChat ? (
            <a className="ring initial" href="#/settings" aria-label="Settings">
              {initial}
            </a>
          ) : (
            <span />
          )}
        </header>
        )}

        {route.name === "chat" && !channelMissing && (
          <Chat key={route.channelId ?? "main"} focus={route.focus} hasOpenAI={state.keys.openai} userName={state.userName} toast={toast} channel={channel ?? null} onTasksChanged={refreshCounts} />
        )}
        {channelMissing && <MissingChannel loaded={channelsLoaded} />}
        {route.name === "channel-info" && (
          <ChannelInfo key={route.channelId} id={route.channelId} toast={toast} onChange={refreshChannels} />
        )}
        {route.name === "tasks" && <Tasks toast={toast} channels={channels} onCounts={refreshCounts} wide={wide} />}
        {route.name === "task" && <TaskPage key={route.taskId} id={route.taskId} toast={toast} onCounts={refreshCounts} />}
        {route.name === "worker-log" && <WorkerLog key={route.taskId} id={route.taskId} />}
        {route.name === "routine" && <RoutinePage key={route.routineId} id={route.routineId} toast={toast} channels={channels} />}
        {route.name === "access" && <Access state={state} setState={setState} toast={toast} />}
        {route.name === "memory" && <Memory toast={toast} channels={channels} />}
        {route.name === "docs" && <Docs toast={toast} />}
        {route.name === "activity" && <Activity toast={toast} />}
        {route.name === "doc" && <DocPage key={route.docId} id={route.docId} toast={toast} canGoogle={state.connectors.some((c) => c.state !== "unavailable")} />}
        {route.name === "soul" && <Soul toast={toast} userName={state.userName} />}
        {route.name === "settings" && <Settings key={route.section ?? "home"} state={state} setState={setState} toast={toast} section={route.section} />}

        {inChat && !wide && (
          <nav className={`tabbar${route.name === "chat" ? " floating" : ""}`} aria-label="Sections">
            <div className="tabbar-inner">
              <a
                className={`tabbar-item${route.name === "chat" ? " on" : ""}`}
                href={route.name === "chat" ? "#/" : lastChat}
                aria-current={route.name === "chat" ? "page" : undefined}
                onClick={(e) => {
                  // already in the main chat: Chat flips between Today and the conversation
                  if (route.name === "chat" && route.channelId === null) {
                    e.preventDefault();
                    dispatchEvent(new Event("lyra:today"));
                  }
                }}
              >
                <Star size={18} />
                <span>Chat</span>
              </a>
              <a className={`tabbar-item${route.name === "tasks" ? " on" : ""}`} href="#/tasks" aria-current={route.name === "tasks" ? "page" : undefined}>
                <span className="tabbar-icon">
                  <TasksIcon size={20} />
                  {readyCount > 0 && (
                    <span className="badge" aria-label={`${readyCount} ready for you`}>
                      {readyCount}
                    </span>
                  )}
                </span>
                <span>Tasks</span>
              </a>
            </div>
          </nav>
        )}

      </div>
      {/* outside the page that slides aside for the menu, so a message from a form in the menu is seen */}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
      {creating && (
        <NewChannelDialog
          toast={toast}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setDrawer(false);
            void refreshChannels().then(() => (location.hash = `#/c/${id}`));
          }}
        />
      )}
      <SyncConflict />
      <AwaySheet />
      {/* over the app, not instead of it: a half-typed message or an open form is still there after unlocking */}
      {locked && <LockScreen onUnlock={unlocked} />}
      {/* tapping the slid-aside chat closes the menu */}
      {!wide && <button className="shell-scrim" aria-label="Close menu" tabIndex={drawer ? 0 : -1} onClick={() => setDrawer(false)} />}
    </div>
  );
}

/** Shown instead of the app while it's locked. Asks for the fingerprint straight away. */
const LOCK_AFTER = 60_000;

/** sessionStorage survives Lyra reloading itself, not the app being closed. */
function session(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // unavailable: Lyra just locks more often
  }
  return null;
}

/** A link to a channel that's gone (deleted here or on your other device): back to the main chat. */
function MissingChannel({ loaded }: { loaded: boolean }) {
  useEffect(() => {
    if (loaded) location.replace("#/");
  }, [loaded]);
  return <div className="center-load">Loading…</div>;
}

/** Unlocked in this session, and not away for longer than the lock delay since. */
function recentlyUnlocked(): boolean {
  const at = Number(session("lyra.unlockedAt") ?? 0);
  const left = Number(session("lyra.leftAt") ?? 0);
  if (!at) return false;
  return !left || Date.now() - left < LOCK_AFTER;
}

/** Shown instead of the app while it's locked. Asks once when it appears; the button asks again. */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onUnlock);
  done.current = onUnlock;
  const ask = useCallback(async (fresh = false) => {
    setAsking(true);
    setError(null);
    const r = await appLock.unlock({ fresh });
    setAsking(false);
    if (r.ok) done.current();
    else if (r.error) setError(r.error);
  }, []);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
  }, [ask]);
  return (
    <div className="lock-screen">
      <span className="orb orb-lg">
        <Avatar />
      </span>
      <h1>Lyra is locked</h1>
      <p>Unlock with your fingerprint, face or screen lock.</p>
      {error && (
        <p className="hint bad" role="alert">
          {error}
        </p>
      )}
      <button className="btn ink" onClick={() => void ask(true)}>
        {asking ? "Waiting for you…" : "Unlock"}
      </button>
    </div>
  );
}

/**
 * Desktop: a slim title bar over the content. It's also where you drag the window;
 * Windows draws its own minimize, maximize and close buttons at the right.
 */
function DeskBar({ route, channel, back }: { route: Route; channel?: Channel; back: string | null }) {
  const inChat = route.name === "chat";
  const sub = !inChat && route.name !== "tasks" && !(route.name === "settings" && !route.section) && route.name !== "access";
  return (
    <header className="deskbar">
      {sub && back && (
        <a className="desk-back" href={back} aria-label="Back">
          <Back size={20} />
        </a>
      )}
      {inChat && (
        <div className="desk-title">
          <span className="desk-title-icon">{channel ? <ChannelIcon name={channel.icon} size={18} /> : <Layers size={18} />}</span>
          <span className="desk-title-name">{channel ? channel.name : "Everything"}</span>
          {channel?.about && <span className="desk-title-about">{channel.about}</span>}
        </div>
      )}
      <span className="desk-drag" />
      {inChat && !channel && (
        <button type="button" className="desk-action" aria-label="Today" title="Today" onClick={() => dispatchEvent(new Event("lyra:today"))}>
          <Star size={18} />
        </button>
      )}
      {inChat && (
        <a className="desk-action" href={channel ? `#/c/${channel.id}/info` : "#/access"} aria-label={channel ? `${channel.name}: channel details` : "What Lyra can access"} title="Details">
          <Info size={20} />
        </a>
      )}
    </header>
  );
}
