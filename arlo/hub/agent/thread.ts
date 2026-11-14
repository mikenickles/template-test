import { db, now } from '../db.ts';
import { emit } from '../events.ts';
import type { Msg, ToolCall, ToolResult } from '../providers/types.ts';

/** How a message is stored. `note` is something Arlo's hub (not the model) recorded. */
export type StoredRole = 'user' | 'assistant' | 'tool' | 'note';
export type StoredKind = 'chat' | 'routine' | 'summary';

export interface StoredContent {
  text?: string;
  toolCalls?: ToolCall[];
  results?: ToolResult[];
  /** Short human labels for what was done, shown under the reply. */
  actions?: string[];
  /** Local date and time the user wrote this, so the model always knows "now". */
  stamp?: string;
  /** Routine title, for messages a routine started. */
  title?: string;
  model?: string;
}

export interface StoredMessage {
  id: number;
  thread: string;
  role: StoredRole;
  kind: StoredKind;
  content: StoredContent;
  at: number;
}

interface Row { id: number; thread: string; role: string; kind: string; content: string; created_at: number }

function fromRow(r: Row): StoredMessage {
  return {
    id: r.id, thread: r.thread, role: r.role as StoredRole, kind: r.kind as StoredKind,
    content: JSON.parse(r.content) as StoredContent, at: r.created_at,
  };
}

/** What the interface gets: no raw tool payloads, just what a person would want to see. */
export function toView(m: StoredMessage) {
  return {
    id: m.id,
    role: m.role,
    kind: m.kind,
    text: m.content.text ?? '',
    actions: m.content.actions ?? [],
    title: m.content.title,
    at: m.at,
  };
}

export function addMessage(thread: string, role: StoredRole, content: StoredContent, kind: StoredKind = 'chat'): StoredMessage {
  const at = now();
  const info = db()
    .prepare('insert into messages(thread, role, kind, content, created_at) values(?, ?, ?, ?, ?)')
    .run(thread, role, kind, JSON.stringify(content), at);
  const message: StoredMessage = { id: Number(info.lastInsertRowid), thread, role, kind, content, at };
  if (role !== 'tool' && kind !== 'summary') emit({ type: 'message', message: toView(message) });
  return message;
}

export function listMessages(thread: string, afterId = 0): StoredMessage[] {
  const rows = db()
    .prepare('select * from messages where thread = ? and id > ? order by id')
    .all(thread, afterId) as unknown as Row[];
  return rows.map(fromRow);
}

/** The most recent messages a person would see (newest last). */
export function recentVisible(thread: string, limit = 200) {
  const rows = db()
    .prepare("select * from messages where thread = ? and role != 'tool' and kind != 'summary' order by id desc limit ?")
    .all(thread, limit) as unknown as Row[];
  return rows.reverse().map(fromRow).map(toView).filter((v) => v.text || v.actions.length);
}

const KEEP_TAIL = 24;
const COMPACT_AFTER_CHARS = 120_000;
const RESULT_REPLAY_CHARS = 4_000;

function latestSummary(thread: string): StoredMessage | null {
  const row = db()
    .prepare("select * from messages where thread = ? and kind = 'summary' order by id desc limit 1")
    .get(thread) as unknown as Row | undefined;
  return row ? fromRow(row) : null;
}

function toMsg(m: StoredMessage): Msg | null {
  const c = m.content;
  if (m.role === 'user') {
    const stamp = c.stamp ? `[${c.stamp}]\n` : '';
    const lead = m.kind === 'routine' ? `[Routine "${c.title ?? 'untitled'}", started by the schedule rather than typed by the user]\n` : '';
    return { role: 'user', text: stamp + lead + (c.text ?? '') };
  }
  if (m.role === 'note') return { role: 'user', text: `[Note from Arlo's hub, not from the user: ${c.text ?? ''}]` };
  if (m.role === 'assistant') {
    const lead = m.kind === 'routine' ? `[Report from the routine "${c.title ?? 'untitled'}"]\n` : '';
    return { role: 'assistant', text: lead + (c.text ?? ''), toolCalls: c.toolCalls ?? [] };
  }
  if (m.role === 'tool') {
    // Older results are replayed shortened; the full text was only needed in its own turn.
    const results = (c.results ?? []).map((r) =>
      r.output.length > RESULT_REPLAY_CHARS ? { ...r, output: r.output.slice(0, RESULT_REPLAY_CHARS) + '\n…(shortened)' } : r,
    );
    return { role: 'tool', results };
  }
  return null;
}

/**
 * Make a transcript every provider will accept: each batch of tool calls is
 * followed by exactly its results, with nothing left dangling by a turn that
 * was interrupted.
 */
export function repair(history: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    if (m.role === 'assistant' && m.toolCalls.length) {
      const next = history[i + 1];
      const ids = new Set(m.toolCalls.map((c) => c.id));
      if (next?.role === 'tool' && next.results.length === ids.size && next.results.every((r) => ids.has(r.id))) {
        out.push(m, next);
        i++;
      } else if (m.text.trim()) {
        out.push({ role: 'assistant', text: m.text, toolCalls: [] });
      }
    } else if (m.role === 'tool') {
      continue; // results with no matching calls
    } else if (m.role === 'assistant' && !m.text.trim()) {
      continue;
    } else {
      const prev = out[out.length - 1];
      if (m.role === 'user' && prev?.role === 'user') prev.text += '\n\n' + m.text;
      else if (m.role === 'assistant' && prev?.role === 'assistant' && !prev.toolCalls.length) prev.text += '\n\n' + m.text;
      else out.push({ ...m });
    }
  }
  // A conversation must open with the user.
  while (out.length && out[0]!.role !== 'user') out.shift();
  return out;
}

/** The conversation as the model should see it: the running summary, then everything since. */
export function contextWindow(thread: string): { history: Msg[]; chars: number; firstId: number; messages: StoredMessage[] } {
  const summary = latestSummary(thread);
  const messages = listMessages(thread, summary?.id ?? 0).filter((m) => m.kind !== 'summary');
  const history: Msg[] = [];
  if (summary?.content.text) {
    history.push({ role: 'user', text: `[Summary of our earlier conversation, written by Arlo]\n${summary.content.text}` });
    history.push({ role: 'assistant', text: 'Got it — I have that context.', toolCalls: [] });
  }
  for (const m of messages) {
    const msg = toMsg(m);
    if (msg) history.push(msg);
  }
  const repaired = repair(history);
  const chars = repaired.reduce((n, m) => n + JSON.stringify(m).length, 0);
  return { history: repaired, chars, firstId: summary?.id ?? 0, messages };
}

/**
 * When the conversation gets long, fold the older part into a summary and keep
 * the recent tail verbatim. Returns true if it compacted.
 */
export async function compactIfNeeded(
  thread: string,
  summarize: (transcript: string, previous: string) => Promise<string>,
): Promise<boolean> {
  const { chars, messages } = contextWindow(thread);
  if (chars < COMPACT_AFTER_CHARS || messages.length <= KEEP_TAIL) return false;

  // Cut at a user message so no tool call is separated from its result.
  let cut = messages.length - KEEP_TAIL;
  while (cut > 0 && messages[cut]!.role !== 'user') cut--;
  if (cut <= 0) return false;

  const older = messages.slice(0, cut);
  const transcript = older
    .map((m) => {
      const c = m.content;
      if (m.role === 'tool') return (c.results ?? []).map((r) => `(result of ${r.name}) ${r.output.slice(0, 600)}`).join('\n');
      const calls = (c.toolCalls ?? []).map((t) => `(used ${t.name})`).join(' ');
      return `${m.role === 'assistant' ? 'Arlo' : m.role === 'note' ? 'Hub note' : 'User'}: ${c.text ?? ''} ${calls}`.trim();
    })
    .join('\n');
  const previous = latestSummary(thread)?.content.text ?? '';
  const text = (await summarize(transcript, previous)).trim();
  if (!text) return false;

  // The summary takes the id slot just before the first kept message.
  const boundary = older[older.length - 1]!.id;
  const at = now();
  db().exec('begin');
  try {
    const kept = db().prepare('select * from messages where thread = ? and id > ? order by id').all(thread, boundary) as unknown as Row[];
    db().prepare('delete from messages where thread = ? and id > ?').run(thread, boundary);
    db().prepare("insert into messages(thread, role, kind, content, created_at) values(?, 'note', 'summary', ?, ?)")
      .run(thread, JSON.stringify({ text }), at);
    const insert = db().prepare('insert into messages(thread, role, kind, content, created_at) values(?, ?, ?, ?, ?)');
    for (const r of kept) insert.run(r.thread, r.role, r.kind, r.content, r.created_at);
    db().exec('commit');
  } catch (err) {
    db().exec('rollback');
    throw err;
  }
  return true;
}

/** "Fresh start": Arlo keeps its memories but stops carrying this conversation forward. */
export function freshStart(thread: string): void {
  db().prepare("insert into messages(thread, role, kind, content, created_at) values(?, 'note', 'summary', ?, ?)")
    .run(thread, JSON.stringify({ text: '' }), now());
}
