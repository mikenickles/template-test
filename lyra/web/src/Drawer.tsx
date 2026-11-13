import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api, onChange, type Channel } from "./api";
import { Close, File as FileIcon, Gear, Search, Spark, TasksIcon } from "./icons";
import { Avatar } from "./LyraMark";
import { onSeen, seenNow } from "./seen";
import type { SearchHit } from "../../core/today";

/** How far each star sits from the line's spine: a gentle zigzag, like the Today view. */
const SWAY = [0, 9, 1, 8, 2, 10];

/**
 * The channel menu: Everything and each channel as stars joined into a constellation.
 * A channel with something new from Lyra glows in the accent color.
 */
export function Drawer({
  open,
  onClose,
  channels,
  current,
  onNewChannel,
  docked = false,
  route = "",
  readyCount = 0,
  initial = "",
  status,
}: {
  open: boolean;
  onClose: () => void;
  channels: Channel[];
  /** null = main chat, a number = that channel, undefined = not in a chat */
  current: number | null | undefined;
  onNewChannel: () => void;
  /** Desktop: always shown beside the app, with the app's sections at the bottom. */
  docked?: boolean;
  /** the current screen's name, to mark it in the sidebar */
  route?: string;
  readyCount?: number;
  initial?: string;
  /** Desktop: Lyra's status, under its name */
  status?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const unread = useUnread(open || docked);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Focus the menu once when it opens, not on every redraw (that stole focus from the
  // New channel dialog on top and made the phone keyboard flicker).
  useEffect(() => {
    if (!open || docked) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    addEventListener("keydown", key);
    panel.current?.querySelector<HTMLElement>(".star-row.active, .star-row")?.focus();
    return () => removeEventListener("keydown", key);
  }, [open, docked]);

  // a fresh search each time the menu opens
  useEffect(() => {
    if (!open && !docked) setQuery("");
  }, [open, docked]);

  const sections: { href: string; label: string; icon: ReactNode; on: boolean; badge?: number; initial?: string }[] = [
    { href: "#/tasks", label: "Tasks", icon: <TasksIcon size={20} />, on: /^(tasks|task|worker-log|routine)$/.test(route), badge: readyCount },
    { href: "#/artifacts", label: "Artifacts", icon: <FileIcon size={20} />, on: route === "docs" || route === "doc" },
    // Memory opens from the Lyra page
    { href: "#/access", label: "Lyra", icon: <Spark size={20} />, on: route === "access" || route === "soul" || route === "memory" },
    { href: "#/settings", label: "Settings", icon: <Gear size={20} />, on: route === "settings", initial },
  ];

  return (
    <nav className={`drawer-panel${docked ? " docked" : ""}`} ref={panel} aria-label="Channels" aria-hidden={!open} inert={!open}>
      {/* Lyra: opens the activity log */}
      <a className="drawer-head" href="#/activity" aria-label="Lyra: recent activity" onClick={() => !docked && onClose()}>
        <span className="orb drawer-orb">
          <Avatar />
        </span>
        <span className="drawer-name">
          <span className="drawer-title">Lyra</span>
          {status}
        </span>
      </a>

      <label className="drawer-search">
        <Search size={18} />
        <input type="search" placeholder="Search all chats" aria-label="Search all chats" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button type="button" className="drawer-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <Close size={16} />
          </button>
        )}
      </label>

      {query.trim().length > 1 ? (
        <SearchResults query={query} onPick={onClose} />
      ) : (
        <Constellation channels={channels} current={current} unread={unread} onPick={onClose} onNewChannel={onNewChannel} />
      )}

      {docked ? (
        <div className="side-sections">
          {sections.map((s) => (
            <a key={s.href} className={`nav-item side${s.on ? " active" : ""}`} href={s.href}>
              <span className="nav-icon">{s.icon}</span>
              <span className="nav-name">{s.label}</span>
              {!!s.badge && (
                <span className="badge side-badge" aria-label={`${s.badge} ready for you`}>
                  {s.badge}
                </span>
              )}
              {s.initial && <span className="side-initial">{s.initial}</span>}
            </a>
          ))}
        </div>
      ) : (
        <div className="drawer-sections">
          {sections.map((s) => (
            <a key={s.href} className={`drawer-section${s.on ? " active" : ""}`} href={s.href} onClick={onClose}>
              <span className="drawer-section-icon">
                {s.icon}
                {!!s.badge && <span className="dot-badge" aria-label={`${s.badge} ready for you`} />}
              </span>
              {s.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

/** Lyra's new messages per chat ("main" or a channel id) since you last looked, on this device. */
function useUnread(active: boolean): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () =>
      void seenNow()
        .then((seen) => api.unread(seen))
        .then((c) => alive && setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c)))
        .catch(() => {});
    load();
    const offData = onChange(load);
    const offSeen = onSeen(load);
    return () => {
      alive = false;
      offData();
      offSeen();
    };
  }, [active]);
  return counts;
}

function Constellation({
  channels,
  current,
  unread,
  onPick,
  onNewChannel,
}: {
  channels: Channel[];
  current: number | null | undefined;
  unread: Record<string, number>;
  onPick: () => void;
  onNewChannel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);

  // draw the lines between the stars wherever they ended up (sizes differ on phone and desktop)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next = [...el.querySelectorAll<HTMLElement>(".star")].map((s) => {
        const r = s.getBoundingClientRect();
        return { x: Math.round(r.left - base.left + r.width / 2), y: Math.round(r.top - base.top + r.height / 2) };
      });
      setPoints((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [channels.length]);

  const solid = points.slice(0, -1);
  const last = points.slice(-2);
  const mainNew = unread.main ?? 0;

  return (
    <div className="constellation" ref={box}>
      <svg className="constellation-lines" aria-hidden="true">
        {solid.length > 1 && <polyline points={solid.map((p) => `${p.x},${p.y}`).join(" ")} />}
        {last.length === 2 && <polyline className="to-new" points={last.map((p) => `${p.x},${p.y}`).join(" ")} />}
      </svg>

      <a
        className={`star-row everything${current === null ? " active" : ""}`}
        href="#/"
        onClick={(e) => {
          // already there: Everything flips to the Today view and back
          if (current === null) {
            e.preventDefault();
            dispatchEvent(new Event("lyra:today"));
          }
          onPick();
        }}
      >
        <span className="star-slot">
          <span className="star vega" />
        </span>
        <span className="star-body">
          <span className="star-name">Everything</span>
          <span className="star-sub">Sees across every channel</span>
        </span>
        {mainNew > 0 && current !== null && <span className="new-pill">{mainNew} new</span>}
      </a>

      {channels.map((c, i) => {
        const n = unread[String(c.id)] ?? 0;
        const fresh = n > 0 && current !== c.id;
        return (
          <a
            key={c.id}
            className={`star-row${current === c.id ? " active" : ""}`}
            href={`#/c/${c.id}`}
            onClick={onPick}
            style={{ ["--sway" as string]: `${SWAY[(i + 1) % SWAY.length]}px` }}
          >
            <span className="star-slot">
              <span className={`star${fresh ? " bright" : ""}`} />
            </span>
            <span className="star-name">{c.name}</span>
            {fresh && <span className="new-pill">{n} new</span>}
          </a>
        );
      })}

      <button type="button" className="star-row add" onClick={onNewChannel} style={{ ["--sway" as string]: `${SWAY[(channels.length + 1) % SWAY.length]}px` }}>
        <span className="star-slot">
          <span className="star hollow" />
        </span>
        <span className="star-name">New channel</span>
      </button>
      {channels.length === 0 && <p className="drawer-empty">Channels keep one subject together, like Home or a trip, each with its own notebook.</p>}
    </div>
  );
}

function SearchResults({ query, onPick }: { query: string; onPick: () => void }) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => void api.search(query).then((h) => alive && setHits(h), () => alive && setHits([])), 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);
  if (!hits) return <p className="drawer-empty">Searching…</p>;
  if (!hits.length) return <p className="drawer-empty">Nothing in your chats matches “{query.trim()}”.</p>;
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <ul className="search-hits" aria-label="Search results">
      {hits.map((h) => (
        <li key={h.messageId}>
          <a className="search-hit" href={`${h.channelId === null ? "#/" : `#/c/${h.channelId}`}?m=${h.messageId}`} onClick={onPick}>
            <span className="search-where">
              {h.channelName ?? "Everything"} · {h.role === "user" ? "You" : "Lyra"}
              <span>{when(h.at)}</span>
            </span>
            <span className="search-snippet">{h.snippet}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
