// A scanned paper, as a card under Lyra's reply: what on it needs doing, each with a button.
// The tap does it (a reminder, or a task on your list), right away.
import { useState } from "react";
import { actionFor, remindAt, type Scan, type ScanItem } from "../../core/scan";
import { api } from "./api";
import { Bell, Calendar, Check, File as FileIcon, TasksIcon } from "./icons";

/** "2026-11-17" → "Tue, Nov 17"; with a time, "Tue, Nov 17, 3:30 PM". */
function day(when: string): string {
  const [d, t] = when.split(" ");
  const at = new Date(`${d}T${t ?? "12:00"}:00`);
  const date = at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return t ? `${date}, ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : date;
}

/** The button's words: "Remind me Mon 9 AM", or "Add to my list". */
function label(i: ScanItem): string | null {
  const a = actionFor(i);
  if (a === "task") return "Add to my list";
  if (a !== "remind") return null;
  const at = remindAt(i);
  if (!at || new Date(at.replace(" ", "T")).getTime() < Date.now()) return "Add to my list";
  const [d, t] = at.split(" ");
  const when = new Date(`${d}T${t}:00`);
  return `Remind me ${when.toLocaleDateString("en-US", { weekday: "short" })} ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")}`;
}

const ICON = { date: <Calendar size={16} />, deadline: <Bell size={16} />, todo: <TasksIcon size={16} />, amount: <FileIcon size={16} /> };

export function ScanCard({ messageId, scan, toast }: { messageId: number; scan: Scan; toast: (m: string) => void }) {
  const [card, setCard] = useState(scan);
  const [busy, setBusy] = useState(false);
  const act = async (which: number | "all") => {
    setBusy(true);
    try {
      const m = await api.scanAction(messageId, which);
      if (m.meta.scan) setCard(m.meta.scan);
      toast(which === "all" ? "Done: reminders set and the rest is on your list" : "Done");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = card.items.filter((i) => !i.done && label(i));
  return (
    <section className="scan-card" aria-label={card.title}>
      <div className="scan-head">
        <span className="scan-title">{card.title}</span>
        {open.length > 1 && (
          <button className="link-btn" disabled={busy} onClick={() => void act("all")}>
            Do all
          </button>
        )}
      </div>
      <ul className="scan-items">
        {card.items.map((i, n) => {
          const l = label(i);
          return (
            <li key={n} className={i.done ? "done" : ""}>
              <span className={`scan-icon k-${i.kind}`}>{ICON[i.kind]}</span>
              <span className="scan-text">
                <span>{i.text}</span>
                {i.when && <span className="scan-when">{day(i.when)}</span>}
              </span>
              {i.done ? (
                <span className="scan-done">
                  <Check size={14} /> {i.done === "remind" ? "Reminder set" : "On your list"}
                </span>
              ) : l ? (
                <button className="triage-btn" disabled={busy} onClick={() => void act(n)}>
                  {l}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
