// "While you were away": what Lyra did on its own since you last looked.
// Built from what's already saved (no model call), so it's instant and free.
import type { DB } from "./db.ts";

export interface AwayItem {
  kind: "routine" | "heads_up" | "check_in" | "reminder" | "follow_up" | "task";
  /** "Morning brief", "Heads-up", "Ready for you" */
  label: string;
  /** one plain line about it */
  text: string;
  at: string;
  channelId: number | null;
  messageId?: number;
  taskId?: number;
}

const line = (s: string, max = 110) => {
  const t = s.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

/** Things Lyra posted or finished since `since` (ISO), oldest first, at most `limit` (plus how many more). */
export function awaySince(db: DB, since: string, limit = 6): { items: AwayItem[]; more: number } {
  const items: AwayItem[] = [];
  const msgs = db.all<{ id: number; content: string; meta: string; created_at: string; channel_id: number | null }>(
    "SELECT id, content, meta, created_at, channel_id FROM messages WHERE role = 'assistant' AND created_at > ? ORDER BY id",
    [since],
  );
  for (const m of msgs) {
    let meta: { routine?: { name: string }; headsUp?: boolean; checkIn?: boolean; reminder?: { kind: string } } = {};
    try {
      meta = JSON.parse(m.meta);
    } catch {
      continue;
    }
    const base = { at: m.created_at, channelId: m.channel_id, messageId: m.id };
    if (meta.routine) items.push({ ...base, kind: "routine", label: meta.routine.name, text: line(m.content) });
    else if (meta.headsUp) items.push({ ...base, kind: "heads_up", label: "Heads-up", text: line(m.content) });
    else if (meta.checkIn) items.push({ ...base, kind: "check_in", label: "Lyra asks", text: line(m.content) });
    else if (meta.reminder?.kind === "remind") items.push({ ...base, kind: "reminder", label: "Reminder", text: line(m.content.replace(/^Reminder:\s*/, "")) });
    else if (meta.reminder) items.push({ ...base, kind: "follow_up", label: "Follow-up", text: line(m.content) });
  }
  const tasks = db.all<{ id: number; title: string; needs: string; updated_at: string; channel_id: number | null }>(
    "SELECT id, title, needs, updated_at, channel_id FROM tasks WHERE status = 'ready' AND updated_at > ?",
    [since],
  );
  for (const t of tasks) items.push({ kind: "task", label: "Ready for you", text: line(t.title + (t.needs ? `: ${t.needs}` : "")), at: t.updated_at, channelId: t.channel_id, taskId: t.id });
  items.sort((a, b) => a.at.localeCompare(b.at));
  return { items: items.slice(-limit), more: Math.max(0, items.length - limit) };
}
