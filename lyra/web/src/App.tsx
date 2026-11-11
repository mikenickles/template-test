import { App as CapApp } from "@capacitor/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isNative, type AppState, type Channel } from "./api";
import { Drawer } from "./Drawer";
import { Back, ChannelIcon, MenuIcon } from "./icons";
import { LyraMark } from "./LyraMark";
import { Access } from "./screens/Access";
import { ChannelInfo, NewChannel } from "./screens/ChannelScreens";
import { Chat } from "./screens/Chat";
import { Memory } from "./screens/Memory";
import { Settings } from "./screens/Settings";

export type Route =
  | { name: "chat"; channelId: number | null }
  | { name: "channel-info"; channelId: number }
  | { name: "new-channel" }
  | { name: "access" }
  | { name: "memory" }
  | { name: "settings" };

export function readRoute(hash = location.hash): Route {
  const path = hash.replace(/^#\/?/, "").split("?")[0];
  const c = path.match(/^c\/(\d+)(\/info)?$/);
  if (c) return c[2] ? { name: "channel-info", channelId: Number(c[1]) } : { name: "chat", channelId: Number(c[1]) };
  if (path === "new-channel" || path === "access" || path === "memory" || path === "settings") return { name: path };
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
      return "#/access";
    default:
      return "#/";
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [state, setState] = useState<AppState | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const drawerRef = useRef(drawer);
  drawerRef.current = drawer;

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      setDrawer(false);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  // Android back button: close the menu, go back a screen, or leave the app from the main chat.
  useEffect(() => {
    if (!isNative) return;
    const sub = CapApp.addListener("backButton", () => {
      if (drawerRef.current) return setDrawer(false);
      const to = backFrom(readRoute());
      if (to) location.hash = to;
      else void CapApp.minimizeApp();
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  const refreshChannels = useCallback(() => api.channels().then(setChannels).catch(() => {}), []);

  useEffect(() => {
    api.state().then(setState, () => setFailed(true));
    void refreshChannels();
  }, [route, refreshChannels]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  if (failed && !state)
    return (
      <div className="center-load" style={{ padding: 24, textAlign: "center" }}>
        Lyra couldn't start. Close the app and open it again.
      </div>
    );
  if (!state) return <div className="center-load">Loading…</div>;

  const initial = (state.userName !== "you" ? state.userName : "Me").charAt(0).toUpperCase();
  const inChat = route.name === "chat";
  const channel = route.name === "chat" && route.channelId !== null ? channels.find((c) => c.id === route.channelId) : undefined;
  const channelMissing = route.name === "chat" && route.channelId !== null && !channel;
  const back = backFrom(route);

  return (
    <div className="shell">
      <header className="topbar">
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
            <LyraMark />
          </a>
        )}
        {inChat && channel && (
          <a className="channel-chip" href={`#/c/${channel.id}/info`} aria-label={`${channel.name}: channel details`}>
            <ChannelIcon name={channel.icon} size={18} />
            <span>{channel.name}</span>
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
        <Chat key={route.channelId ?? "main"} userName={state.userName} toast={toast} channel={channel ?? null} />
      )}
      {channelMissing && <div className="center-load">Loading…</div>}
      {route.name === "channel-info" && (
        <ChannelInfo key={route.channelId} id={route.channelId} toast={toast} onChange={refreshChannels} />
      )}
      {route.name === "new-channel" && <NewChannel toast={toast} onChange={refreshChannels} />}
      {route.name === "access" && <Access state={state} setState={setState} toast={toast} />}
      {route.name === "memory" && <Memory toast={toast} channels={channels} />}
      {route.name === "settings" && <Settings state={state} setState={setState} toast={toast} />}

      <Drawer open={drawer} onClose={() => setDrawer(false)} channels={channels} current={route.name === "chat" ? route.channelId : undefined} />

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
