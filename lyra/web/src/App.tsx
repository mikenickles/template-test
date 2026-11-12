import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isNative, onChange, type AppState, type Channel } from "./api";
import { Drawer } from "./Drawer";
import { Back, ChannelIcon, MenuIcon } from "./icons";
import { Avatar } from "./LyraMark";
import { Access } from "./screens/Access";
import { ChannelInfo, NewChannelDialog } from "./screens/ChannelScreens";
import { Chat } from "./screens/Chat";
import { Memory } from "./screens/Memory";
import { Settings } from "./screens/Settings";
import { Soul } from "./screens/Soul";
import { TaskPage, Tasks, WorkerLog } from "./screens/Tasks";
import { RoutinePage } from "./screens/Routines";
import { SyncConflict } from "./screens/SyncSection";
import { appLock, notifier } from "./platform";
import { ChatIcon, TasksIcon } from "./icons";

export type Route =
  | { name: "chat"; channelId: number | null }
  | { name: "channel-info"; channelId: number }
  | { name: "tasks" }
  | { name: "task"; taskId: number }
  | { name: "worker-log"; taskId: number }
  | { name: "routine"; routineId: number }
  | { name: "access" }
  | { name: "memory" }
  | { name: "soul" }
  | { name: "settings" };

export function readRoute(hash = location.hash): Route {
  const path = hash.replace(/^#\/?/, "").split("?")[0];
  const c = path.match(/^c\/(\d+)(\/info)?$/);
  if (c) return c[2] ? { name: "channel-info", channelId: Number(c[1]) } : { name: "chat", channelId: Number(c[1]) };
  const t = path.match(/^t\/(\d+)(\/log)?$/);
  if (t) return t[2] ? { name: "worker-log", taskId: Number(t[1]) } : { name: "task", taskId: Number(t[1]) };
  const r = path.match(/^r\/(\d+)$/);
  if (r) return { name: "routine", routineId: Number(r[1]) };
  if (path === "tasks" || path === "access" || path === "memory" || path === "soul" || path === "settings") return { name: path };
  return { name: "chat", channelId: null };
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
    default:
      return "#/";
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [state, setState] = useState<AppState | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
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
      if (creatingRef.current) return setCreating(false);
      if (drawerRef.current) return setDrawer(false);
      const to = backFrom(readRoute());
      if (to) location.hash = to;
      else void CapApp.minimizeApp();
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  // App lock: locked when Lyra opens, and again after a minute away.
  const [locked, setLocked] = useState(false);
  const lockOn = useRef(false);
  lockOn.current = !!state?.appLock && isNative;
  const lockChecked = useRef(false);
  useEffect(() => {
    if (state && !lockChecked.current) {
      lockChecked.current = true;
      if (state.appLock && isNative) setLocked(true);
    }
  }, [state]);
  useEffect(() => {
    if (!isNative) return;
    let leftAt = 0;
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) leftAt = Date.now();
      else if (lockOn.current && leftAt && Date.now() - leftAt > 60_000) setLocked(true);
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  // While the keyboard is up, the tab bar hides and the message box sits right on the keyboard.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (isNative) {
      const subs = [Keyboard.addListener("keyboardWillShow", () => setKeyboard(true)), Keyboard.addListener("keyboardWillHide", () => setKeyboard(false))];
      return () => subs.forEach((s) => void s.then((h) => h.remove()));
    }
    // in a browser there's no keyboard event: typing in the message box stands in for it
    const isBox = (e: Event) => (e.target as HTMLElement | null)?.closest?.(".composer") != null;
    const on = (e: FocusEvent) => isBox(e) && setKeyboard(true);
    const off = (e: FocusEvent) => isBox(e) && setKeyboard(false);
    addEventListener("focusin", on);
    addEventListener("focusout", off);
    return () => {
      removeEventListener("focusin", on);
      removeEventListener("focusout", off);
    };
  }, []);

  // Only re-render when the list actually changed, so opening the menu doesn't redraw the chat mid-slide.
  const [readyCount, setReadyCount] = useState(0);
  const refreshCounts = useCallback(() => {
    api
      .taskCounts()
      .then((c) => setReadyCount(c.ready))
      .catch(() => {});
  }, []);
  // Tapping a notification opens the chat it's about.
  useEffect(() => notifier.onOpen((hash) => (location.hash = hash)), []);
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
        .then((next) => setChannels((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)))
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

  if (failed && !state)
    return (
      <div className="center-load" style={{ padding: 24, textAlign: "center" }}>
        Lyra couldn't start. Close the app and open it again.
      </div>
    );
  if (!state) return <div className="center-load">Loading…</div>;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  const initial = (state.userName !== "you" ? state.userName : "Me").charAt(0).toUpperCase();
  const inChat = route.name === "chat" || route.name === "tasks";
  const channel = route.name === "chat" && route.channelId !== null ? channels.find((c) => c.id === route.channelId) : undefined;
  const channelMissing = route.name === "chat" && route.channelId !== null && !channel;
  const back = backFrom(route);

  return (
    <div className={`app${drawer ? " drawer-open" : ""}${keyboard ? " keyboard-open" : ""}`}>
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        channels={channels}
        current={route.name === "chat" ? route.channelId : undefined}
        onNewChannel={() => setCreating(true)}
      />
      <div className="shell" inert={drawer}>
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
          {inChat && !channel && (
            <a className="orb orb-sm" href="#/access" aria-label="What Lyra can access">
              <Avatar />
            </a>
          )}
          {inChat && channel && (
            <a className="channel-head" href={`#/c/${channel.id}/info`} aria-label={`${channel.name}: channel details`}>
              <span className="orb orb-sm">
                <Avatar />
              </span>
              <span className="channel-chip">
                <ChannelIcon name={channel.icon} size={16} />
                <span>{channel.name}</span>
              </span>
            </a>
          )}
          {!inChat && <span />}
          {inChat ? (
            <a className="ring initial" href="#/settings" aria-label="Settings">
              {initial}
            </a>
          ) : (
            <span />
          )}
        </header>

        {route.name === "chat" && !channelMissing && (
          <Chat key={route.channelId ?? "main"} userName={state.userName} toast={toast} channel={channel ?? null} onTasksChanged={refreshCounts} />
        )}
        {channelMissing && <div className="center-load">Loading…</div>}
        {route.name === "channel-info" && (
          <ChannelInfo key={route.channelId} id={route.channelId} toast={toast} onChange={refreshChannels} />
        )}
        {route.name === "tasks" && <Tasks toast={toast} channels={channels} onCounts={refreshCounts} />}
        {route.name === "task" && <TaskPage key={route.taskId} id={route.taskId} toast={toast} onCounts={refreshCounts} />}
        {route.name === "worker-log" && <WorkerLog key={route.taskId} id={route.taskId} />}
        {route.name === "routine" && <RoutinePage key={route.routineId} id={route.routineId} toast={toast} channels={channels} />}
        {route.name === "access" && <Access state={state} setState={setState} toast={toast} />}
        {route.name === "memory" && <Memory toast={toast} channels={channels} />}
        {route.name === "soul" && <Soul toast={toast} userName={state.userName} />}
        {route.name === "settings" && <Settings state={state} setState={setState} toast={toast} />}

        {inChat && (
          <nav className={`tabbar${route.name === "chat" ? " floating" : ""}`} aria-label="Sections">
            <div className="tabbar-inner">
              <a className={`tabbar-item${route.name === "chat" ? " on" : ""}`} href={route.name === "chat" ? "#/" : lastChat} aria-current={route.name === "chat" ? "page" : undefined}>
                <ChatIcon size={24} />
                <span>Chat</span>
              </a>
              <a className={`tabbar-item${route.name === "tasks" ? " on" : ""}`} href="#/tasks" aria-current={route.name === "tasks" ? "page" : undefined}>
                <span className="tabbar-icon">
                  <TasksIcon size={24} />
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

        {toastMsg && (
          <div className="toast" role="status">
            {toastMsg}
          </div>
        )}
      </div>
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
      {/* tapping the slid-aside chat closes the menu */}
      <button className="shell-scrim" aria-label="Close menu" tabIndex={drawer ? 0 : -1} onClick={() => setDrawer(false)} />
    </div>
  );
}

/** Shown instead of the app while it's locked. Asks for the fingerprint straight away. */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [asking, setAsking] = useState(false);
  const ask = useCallback(async () => {
    setAsking(true);
    const ok = await appLock.unlock();
    setAsking(false);
    if (ok) onUnlock();
  }, [onUnlock]);
  useEffect(() => {
    void ask();
  }, [ask]);
  return (
    <div className="lock-screen">
      <span className="orb orb-lg">
        <Avatar />
      </span>
      <h1>Lyra is locked</h1>
      <p>Unlock with your fingerprint, face or screen lock.</p>
      <button className="btn ink" onClick={() => void ask()} disabled={asking}>
        Unlock
      </button>
    </div>
  );
}
