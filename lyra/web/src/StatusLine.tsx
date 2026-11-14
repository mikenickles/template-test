/**
 * The little status under Lyra's avatar: what it's doing right now (a reply, a
 * worker, a routine), what's waiting for you, and when idle, the weather and
 * what's coming up, taking turns.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, onChange, type AppState } from "./api";
import { chatText, musicText, readyText, routineText, upNext, weatherText, workingText } from "./statusText";
import { currentWeather } from "./weather";
import { onUpdateState, updateState } from "./updater";

// ---- what the chat is doing (set by the chat screen) ----
let chatStatus: string | null = null;
const chatSubs = new Set<() => void>();
export function setChatStatus(s: string | null): void {
  if (s === chatStatus) return;
  chatStatus = s;
  chatSubs.forEach((f) => f());
}
const useChatStatus = () =>
  useSyncExternalStore(
    (f) => {
      chatSubs.add(f);
      return () => chatSubs.delete(f);
    },
    () => chatStatus,
  );

export interface StatusItem {
  key: string;
  text: string;
  /** happening right now: shown first, with a pulsing dot */
  live?: boolean;
  href?: string;
  /** what's playing on Spotify: drawn with little moving bars */
  music?: boolean;
}

function useStatusItems(state: AppState): StatusItem[] {
  const chat = useChatStatus();
  const [background, setBackground] = useState<StatusItem[]>([]);
  const [weather, setWeather] = useState<StatusItem | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [working, routines, counts, reminders] = await Promise.all([api.tasks({ status: "working", limit: 3 }), api.routines(), api.taskCounts(), api.reminders()]);
        const items: StatusItem[] = [
          ...(working.length
            ? [{ key: "work", text: workingText(working[0].title, working.length), live: true, href: working.length === 1 ? `#/t/${working[0].id}` : "#/tasks" }]
            : []),
          ...routines.filter((r) => r.running).map((r) => ({ key: `r${r.id}`, text: routineText(r.name), live: true, href: `#/r/${r.id}` })),
        ];
        if (counts.ready) items.push({ key: "ready", text: readyText(counts.ready), href: "#/tasks" });
        // the soonest of routines, reminders and follow-ups
        const next = upNext([
          ...routines,
          ...reminders.map((r) => ({ name: r.kind === "remind" ? "Reminder" : "Check back", enabled: 1, next_run_at: r.due_at })),
        ]);
        if (next) items.push({ key: "next", text: next });
        if (alive) setBackground(items);
      } catch {
        // the status line is a nicety: never an error
      }
    };
    void load();
    const off = onChange(() => void load()); // tasks, routines and reminders all announce changes
    const t = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      off();
      clearInterval(t);
    };
  }, []);

  const place = state.weatherPlace;
  useEffect(() => {
    if (!place) return setWeather(null);
    let alive = true;
    const load = () =>
      currentWeather(place)
        .then((w) => alive && setWeather({ key: "weather", text: weatherText(w.icon, w.temp, w.text) }))
        .catch(() => alive && setWeather(null));
    void load();
    const t = setInterval(load, 30 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [place?.latitude, place?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // what's playing on Spotify (0.46): looked up every half minute while Lyra is on screen
  const [music, setMusic] = useState<StatusItem | null>(null);
  const spotify = state.connectors.some((c) => c.id === "spotify" && c.state === "connected");
  useEffect(() => {
    if (!spotify) return setMusic(null);
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void api.nowPlaying().then(
        (p) => alive && setMusic(p ? { key: `music:${p.title}`, text: musicText(p.title, p.artist), music: true } : null),
        () => alive && setMusic(null),
      );
    };
    load();
    const t = setInterval(load, 30_000);
    document.addEventListener("visibilitychange", load);
    const off = onChange(load); // connecting, disconnecting or flipping the switch
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
      off();
    };
  }, [spotify, state]); // state: the "Show what's playing" switch
  // Lyra's headphones glow while something plays
  useEffect(() => {
    if (music) document.body.dataset.music = "on";
    else delete document.body.dataset.music;
    return () => void delete document.body.dataset.music;
  }, [!!music]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useSyncExternalStore(onUpdateState, updateState);
  const items: StatusItem[] = [];
  if (update.kind === "available" || update.kind === "ready") items.push({ key: "update", text: update.kind === "ready" ? "Restart to update" : "Update ready", href: "#/settings/about" });
  if (chat) items.push({ key: "chat", text: chatText(chat), live: true });
  items.push(...background.filter((i) => i.live));
  if (music) items.push(music);
  items.push(...background.filter((i) => !i.live));
  if (weather) items.push(weather);
  return items;
}

export function StatusLine({ state, className = "" }: { state: AppState; className?: string }) {
  const items = useStatusItems(state);
  const live = items.filter((i) => i.live);
  const idle = items.filter((i) => !i.live);
  // something happening wins; otherwise the quiet items take turns
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (live.length || idle.length < 2) return;
    const t = setInterval(() => setTurn((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, [live.length, idle.length]);
  const item = live[0] ?? idle[turn % Math.max(idle.length, 1)] ?? { key: "here", text: "Here for you" };

  const body = (
    <>
      {item.music ? (
        <span className="status-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span className={`status-dot${item.live ? " live" : ""}`} aria-hidden="true" />
      )}
      <span className="status-text">{item.text}</span>
    </>
  );
  return (
    <div className={`status-line ${className}`} role="status" aria-label={item.music ? `Playing: ${item.text}` : `Lyra: ${item.text}`}>
      {item.href ? (
        <a key={item.key} className="status-pill" href={item.href}>
          {body}
        </a>
      ) : (
        <span key={item.key} className="status-pill">
          {body}
        </span>
      )}
    </div>
  );
}
