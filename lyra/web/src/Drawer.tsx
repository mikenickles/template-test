import { useEffect, useRef } from "react";
import type { Channel } from "./api";
import { ChannelIcon, Layers, Plus } from "./icons";
import { LyraMark } from "./LyraMark";
import { ago, parse } from "./when";

/** The channel menu: the main chat ("Everything"), each channel, and a way to add one. */
export function Drawer({
  open,
  onClose,
  channels,
  current,
}: {
  open: boolean;
  onClose: () => void;
  channels: Channel[];
  /** null = main chat, a number = that channel, undefined = not in a chat */
  current: number | null | undefined;
}) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    return () => removeEventListener("keydown", key);
  }, [open, onClose]);

  return (
    <div className={`drawer${open ? " open" : ""}`} aria-hidden={!open}>
      <button className="scrim" aria-label="Close menu" tabIndex={-1} onClick={onClose} />
      <nav className="panel" ref={panel} aria-label="Channels" inert={!open}>
        <div className="drawer-head">
          <span className="orb drawer-orb">
            <LyraMark size={22} />
          </span>
          <span className="drawer-title">Lyra</span>
        </div>

        <a className={`nav-item everything${current === null ? " active" : ""}`} href="#/" onClick={onClose}>
          <span className="nav-icon">
            <Layers size={20} />
          </span>
          <span className="body">
            <span className="nav-name">Everything</span>
            <span className="nav-sub">Your main chat, across every channel</span>
          </span>
        </a>

        <p className="drawer-label">Channels</p>
        <div className="channel-list">
          {channels.map((c) => (
            <a key={c.id} className={`nav-item${current === c.id ? " active" : ""}`} href={`#/c/${c.id}`} onClick={onClose}>
              <span className="nav-icon">
                <ChannelIcon name={c.icon} size={20} />
              </span>
              <span className="body">
                <span className="nav-name">{c.name}</span>
                <span className="nav-sub">{c.about || (c.last_at ? `Last used ${ago(parse(c.last_at))}` : "No messages yet")}</span>
              </span>
            </a>
          ))}
          {channels.length === 0 && <p className="drawer-empty">Channels keep one subject together, like Home or a trip, each with its own notes.</p>}
          <a className="nav-item add" href="#/new-channel" onClick={onClose}>
            <span className="nav-icon">
              <Plus size={20} />
            </span>
            <span className="nav-name">New channel</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
