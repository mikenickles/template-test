import { useEffect, useRef } from "react";
import type { Channel } from "./api";
import { ChannelIcon, Gear, Layers, Notebook, Plus, Spark, TasksIcon } from "./icons";
import { Avatar } from "./LyraMark";

/**
 * The channel menu. It sits behind the app; opening it slides the chat aside.
 * Channels hang off "Everything" because the main chat sees across all of them.
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
}) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || docked) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    panel.current?.querySelector<HTMLElement>(".nav-item.active, .nav-item")?.focus();
    return () => removeEventListener("keydown", key);
  }, [open, onClose, docked]);

  return (
    <nav className={`drawer-panel${docked ? " docked" : ""}`} ref={panel} aria-label="Channels" aria-hidden={!open} inert={!open}>
      <div className="drawer-head">
        <span className="orb drawer-orb">
          <Avatar />
        </span>
        <span className="drawer-title">Lyra</span>
      </div>
      <hr className="drawer-rule" />

      <a className={`nav-item everything${current === null ? " active" : ""}`} href="#/" onClick={onClose}>
        <span className="nav-icon">
          <Layers size={28} />
        </span>
        <span className="body">
          <span className="nav-name">Everything</span>
          <span className="nav-sub">All chat context across every channel</span>
        </span>
      </a>

      <ul className="tree">
        {channels.map((c) => (
          <li key={c.id} className="branch">
            <a className={`nav-item${current === c.id ? " active" : ""}`} href={`#/c/${c.id}`} onClick={onClose}>
              <span className="nav-icon">
                <ChannelIcon name={c.icon} size={24} />
              </span>
              <span className="nav-name">{c.name}</span>
            </a>
          </li>
        ))}
        <li className="tree-add">
          <button type="button" className="nav-item add" onClick={onNewChannel}>
            <span className="nav-icon">
              <Plus size={24} />
            </span>
            <span className="nav-name">New channel</span>
          </button>
        </li>
      </ul>
      {channels.length === 0 && (
        <p className="drawer-empty">Channels keep one subject together, like Home or a trip, each with its own notebook.</p>
      )}

      {docked ? (
        <div className="side-sections">
          <a className={`nav-item side${/^(tasks|task|worker-log|routine)$/.test(route) ? " active" : ""}`} href="#/tasks">
            <span className="nav-icon">
              <TasksIcon size={20} />
            </span>
            <span className="nav-name">Tasks</span>
            {readyCount > 0 && (
              <span className="badge side-badge" aria-label={`${readyCount} ready for you`}>
                {readyCount}
              </span>
            )}
          </a>
          <a className={`nav-item side${route === "memory" ? " active" : ""}`} href="#/memory">
            <span className="nav-icon">
              <Notebook size={20} />
            </span>
            <span className="nav-name">Memory</span>
          </a>
          <a className={`nav-item side${route === "access" || route === "soul" ? " active" : ""}`} href="#/access">
            <span className="nav-icon">
              <Spark size={20} />
            </span>
            <span className="nav-name">Lyra</span>
          </a>
          <a className={`nav-item side${route === "settings" ? " active" : ""}`} href="#/settings">
            <span className="nav-icon">
              <Gear size={20} />
            </span>
            <span className="nav-name">Settings</span>
            {initial && <span className="side-initial">{initial}</span>}
          </a>
        </div>
      ) : (
        <a className="ring drawer-foot" href="#/memory" onClick={onClose} aria-label="Memory">
          <Notebook size={22} />
        </a>
      )}
    </nav>
  );
}
