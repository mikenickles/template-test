import { useCallback, useEffect, useState } from "react";
import { api, type AppState } from "./api";
import { Back } from "./icons";
import { LyraMark } from "./LyraMark";
import { Access } from "./screens/Access";
import { Chat } from "./screens/Chat";
import { Memory } from "./screens/Memory";
import { Settings } from "./screens/Settings";

type Route = "chat" | "access" | "memory" | "settings";

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, "").split("?")[0];
  return r === "access" || r === "memory" || r === "settings" ? r : "chat";
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [state, setState] = useState<AppState | null>(null);
  const [failed, setFailed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    api.state().then(setState, () => setFailed(true));
  }, [route]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  if (failed && !state)
    return (
      <div className="center-load" style={{ padding: 24, textAlign: "center" }}>
        Can't reach Lyra. Check that it's running on your computer, then reload.
      </div>
    );
  if (!state) return <div className="center-load">Loading…</div>;

  const initial = (state.userName !== "you" ? state.userName : "Me").charAt(0).toUpperCase();
  const back = route === "memory" ? "#/access" : "#/";

  return (
    <div className="shell">
      <header className="topbar">
        {route === "chat" ? (
          <span />
        ) : (
          <a className="ring" href={back} aria-label="Back">
            <Back />
          </a>
        )}
        {route === "chat" ? (
          <a className="orb orb-sm" href="#/access" aria-label="What Lyra can access">
            <LyraMark />
          </a>
        ) : (
          <span />
        )}
        {route === "chat" ? (
          <a className="ring initial" href="#/settings" aria-label="Settings">
            {initial}
          </a>
        ) : (
          <span />
        )}
      </header>

      {route === "chat" && <Chat userName={state.userName} toast={toast} />}
      {route === "access" && <Access state={state} setState={setState} toast={toast} />}
      {route === "memory" && <Memory toast={toast} />}
      {route === "settings" && <Settings state={state} setState={setState} toast={toast} />}

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
