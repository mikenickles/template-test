// The activity log: everything Lyra did on her own, newest first. Most of it is read from
// what's already recorded (background task runs with their transcripts, routine runs, the
// heads-ups, check-ins, reminders, follow-ups and tidy-ups she posted); the few jobs that
// leave no other trace (life admin scans, learning how you talk) write a row to
// activity_log. Opening one shows what it came to and the steps it took.
import type { DB } from "./db.ts";
import type { Msg } from "./providers/types.ts";

export type ActivityKind = "task" | "routine" | "heads_up" | "check_in" | "reminder" | "follow_up" | "life_admin" | "tidy" | "style";
export type ActivityStatus = "running" | "done" | "quiet" | "waiting" | "failed" | "stopped" | "missed";

export interface Activity {
  /** "w12" (a task run), "r4" (a routine run), "m88" (a message Lyra posted), "a3" (activity_log) */
  id: string;
  kind: ActivityKind;
  title: string;
  /** one line: what it came to */
  summary: string;
  status: ActivityStatus;
  at: string;
  ended: string | null;
}

export interface ActivityStep {
  label: string;
  detail: string;
  ok: boolean;
}

export interface ActivityDetail extends Activity {
  /** the result in full (Markdown) */
  body: string;
  steps: ActivityStep[];
  /** where to go from here */
  links: { label: string; href: string }[];
}

const line = (s: string, max = 160) => {
  const first = s.replace(/\r/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
};
const z = (s: string | null) => (s && !s.endsWith("Z") ? `${s}Z` : s);

/** Write a row for a job that leaves no other record. */
export function logActivity(db: DB, a: { kind: ActivityKind; title: string; summary: string; status: ActivityStatus; detail?: string; startedAt?: string }): void {
  db.run("INSERT INTO activity_log (kind, title, summary, status, started_at, detail) VALUES (?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?)", [
    a.kind,
    a.title.slice(0, 120),
    a.summary.slice(0, 300),
    a.status,
    a.startedAt ?? null,
    (a.detail ?? "").slice(0, 4000),
  ]);
}

const WORKER: Record<string, ActivityStatus> = { running: "running", waiting: "waiting", finished: "done", failed: "failed", stopped: "stopped" };
const ROUTINE: Record<string, ActivityStatus> = { running: "running", posted: "done", quiet: "quiet", failed: "failed", missed: "missed" };

/** Newest first, across everything. */
export function listActivity(db: DB, opts: { limit?: number; kind?: ActivityKind[] } = {}): Activity[] {
  const limit = opts.limit ?? 150;
  const out: Activity[] = [];
  const want = (k: ActivityKind) => !opts.kind || opts.kind.includes(k);

  if (want("task"))
    for (const r of db.all<{ id: number; status: string; started_at: string; ended_at: string | null; title: string; task_id: number }>(
      "SELECT w.id, w.status, w.started_at, w.ended_at, t.title, t.id AS task_id FROM worker_runs w JOIN tasks t ON t.id = w.task_id ORDER BY w.id DESC LIMIT ?",
      [limit],
    )) {
      // what the run came to: its last log line ("Result: …", a question, why it stopped)
      // what the run came to: its result if it has one, else its last real log line (not a status change)
      const last =
        db.get<{ text: string }>("SELECT text FROM task_log WHERE task_id = ? AND who = 'worker' AND at >= ? AND text LIKE 'Result: %' ORDER BY id DESC LIMIT 1", [r.task_id, r.started_at]) ??
        db.get<{ text: string }>("SELECT text FROM task_log WHERE task_id = ? AND who = 'worker' AND at >= ? AND text NOT LIKE 'The worker set it to %' ORDER BY id DESC LIMIT 1", [r.task_id, r.started_at]);
      out.push({ id: `w${r.id}`, kind: "task", title: r.title, summary: line((last?.text ?? "").replace(/^Result: /, "")), status: WORKER[r.status] ?? "done", at: z(r.started_at)!, ended: z(r.ended_at) });
    }

  if (want("routine"))
    for (const r of db.all<{ id: number; status: string; started_at: string; ended_at: string | null; note: string; message_id: number | null; name: string }>(
      "SELECT x.id, x.status, x.started_at, x.ended_at, x.note, x.message_id, r.name FROM routine_runs x JOIN routines r ON r.id = x.routine_id ORDER BY x.id DESC LIMIT ?",
      [limit],
    )) {
      const posted = r.message_id ? db.get<{ content: string }>("SELECT content FROM messages WHERE id = ?", [r.message_id])?.content : undefined;
      const summary = posted ? line(posted) : r.status === "quiet" ? `Nothing new${r.note ? `: ${line(r.note, 120)}` : ""}` : line(r.note);
      out.push({ id: `r${r.id}`, kind: "routine", title: r.name, summary, status: ROUTINE[r.status] ?? "done", at: z(r.started_at)!, ended: z(r.ended_at) });
    }

  // what Lyra posted on her own
  const posts: [ActivityKind, string, string][] = [
    ["heads_up", "$.headsUp", "Heads-up"],
    ["check_in", "$.checkIn", "Checked in"],
    ["life_admin", "$.lifeAdmin", "Life admin heads-up"],
    ["tidy", "$.tidy", "Tidied my notes about you"],
  ];
  for (const [kind, path, title] of posts) {
    if (!want(kind)) continue;
    for (const m of db.all<{ id: number; content: string; created_at: string }>(
      `SELECT id, content, created_at FROM messages WHERE role = 'assistant' AND json_extract(meta, '${path}') IS NOT NULL ORDER BY id DESC LIMIT ?`,
      [limit],
    ))
      out.push({ id: `m${m.id}`, kind, title, summary: line(m.content), status: "done", at: z(m.created_at)!, ended: z(m.created_at) });
  }
  if (want("reminder") || want("follow_up"))
    for (const m of db.all<{ id: number; content: string; created_at: string; kind: string }>(
      "SELECT id, content, created_at, json_extract(meta, '$.reminder.kind') AS kind FROM messages WHERE role = 'assistant' AND json_extract(meta, '$.reminder') IS NOT NULL ORDER BY id DESC LIMIT ?",
      [limit],
    )) {
      const kind: ActivityKind = m.kind === "remind" ? "reminder" : "follow_up";
      if (!want(kind)) continue;
      out.push({ id: `m${m.id}`, kind, title: kind === "reminder" ? "Reminded you" : "Followed up", summary: line(m.content.replace(/^Reminder: /, "")), status: "done", at: z(m.created_at)!, ended: z(m.created_at) });
    }

  for (const a of db.all<{ id: number; kind: ActivityKind; title: string; summary: string; status: ActivityStatus; started_at: string; ended_at: string | null }>(
    "SELECT id, kind, title, summary, status, started_at, ended_at FROM activity_log ORDER BY id DESC LIMIT ?",
    [limit],
  ))
    if (want(a.kind)) out.push({ id: `a${a.id}`, kind: a.kind, title: a.title, summary: a.summary, status: a.status, at: z(a.started_at)!, ended: z(a.ended_at) });

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

// ---------- one item, in detail ----------

const STEP: Record<string, string> = {
  log_progress: "Noted progress",
  update_steps: "Updated the checklist",
  ask_user: "Asked you",
  write_report: "Wrote the report",
  finish: "Finished",
  use_skill: "Followed a skill",
  search_mail: "Searched your mail",
  read_thread: "Read an email",
  list_events: "Checked your calendar",
  list_calendars: "Checked your calendars",
  search_files: "Searched your files",
  read_file: "Read a file",
  now_playing: "Checked what's playing",
  recently_played: "Checked what you played",
  top_items: "Looked at your favorites",
  search: "Searched Spotify",
  my_playlists: "Looked at your playlists",
  playlist_tracks: "Read a playlist",
  web_search: "Searched the web",
  web_fetch: "Read a web page",
};

function stepDetail(name: string, input: Record<string, unknown>): string {
  const pick = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const v =
    pick("note") ||
    pick("question") ||
    pick("query") ||
    pick("title") ||
    pick("name") ||
    pick("log") ||
    pick("url") ||
    (name === "list_events" ? [pick("start"), pick("end")].filter(Boolean).join(" to ") : "") ||
    (name === "update_steps" ? [...(Array.isArray(input.add) ? input.add.map(String) : []), ...(Array.isArray(input.done) ? input.done.map((n) => `step ${n} done`) : [])].join(", ") : "");
  return line(v, 140);
}

/** The steps a worker took, from its transcript. */
export function stepsFromTranscript(transcript: Msg[]): ActivityStep[] {
  const steps: ActivityStep[] = [];
  const failed = new Set<string>();
  for (const m of transcript) for (const p of m.parts) if (p.type === "tool_result" && p.isError) failed.add(p.id);
  for (const m of transcript) {
    if (m.role !== "assistant") continue;
    for (const p of m.parts) {
      if (p.type === "tool_call") {
        const bare = p.name.replace(/^[a-z]+__/, "");
        steps.push({ label: STEP[bare] ?? bare.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), detail: stepDetail(bare, p.input), ok: !failed.has(p.id) });
      } else if (p.type === "native") {
        // a provider's own web search or page read
        const b = p.block as { type?: string; name?: string; input?: Record<string, unknown> };
        if (b?.type === "server_tool_use" && b.name && STEP[b.name]) steps.push({ label: STEP[b.name], detail: stepDetail(b.name, b.input ?? {}), ok: true });
      }
    }
  }
  return steps;
}

export function activityDetail(db: DB, id: string): ActivityDetail | null {
  const n = Number(id.slice(1));
  if (!Number.isInteger(n)) return null;
  const base = (kind?: ActivityKind[]) => listActivity(db, { limit: 2000, kind }).find((a) => a.id === id);

  if (id.startsWith("w")) {
    const r = db.get<{ task_id: number; transcript: string; started_at: string; ended_at: string | null }>("SELECT task_id, transcript, started_at, ended_at FROM worker_runs WHERE id = ?", [n]);
    const a = base(["task"]);
    if (!r || !a) return null;
    let transcript: Msg[] = [];
    try {
      transcript = JSON.parse(r.transcript) as Msg[];
    } catch {
      transcript = [];
    }
    const result = db.get<{ text: string }>("SELECT text FROM task_log WHERE task_id = ? AND who = 'worker' AND text LIKE 'Result: %' AND at >= ? ORDER BY id DESC LIMIT 1", [r.task_id, r.started_at]);
    let steps = stepsFromTranscript(transcript);
    // a run that used no tools still has its log: show that instead
    if (!steps.length)
      steps = db
        .all<{ text: string }>("SELECT text FROM task_log WHERE task_id = ? AND who = 'worker' AND at >= ? AND (? IS NULL OR at <= ?) ORDER BY id", [r.task_id, r.started_at, r.ended_at, r.ended_at])
        .filter((l) => !/^Result: /.test(l.text))
        .map((l) => ({ label: line(l.text, 120), detail: "", ok: true }));
    return { ...a, body: result?.text.replace(/^Result: /, "") ?? "", steps, links: [{ label: "Open the task", href: `#/t/${r.task_id}` }] };
  }
  if (id.startsWith("r")) {
    const r = db.get<{ routine_id: number; message_id: number | null; note: string; channel_id: number | null }>(
      "SELECT x.routine_id, x.message_id, x.note, m.channel_id FROM routine_runs x LEFT JOIN messages m ON m.id = x.message_id WHERE x.id = ?",
      [n],
    );
    const a = base(["routine"]);
    if (!r || !a) return null;
    const posted = r.message_id ? db.get<{ content: string }>("SELECT content FROM messages WHERE id = ?", [r.message_id])?.content : undefined;
    const links = [{ label: "Open the routine", href: `#/r/${r.routine_id}` }];
    if (r.message_id) links.unshift({ label: "See it in the chat", href: `${r.channel_id ? `#/c/${r.channel_id}` : "#/"}?m=${r.message_id}` });
    return { ...a, body: posted ?? r.note, steps: [], links };
  }
  if (id.startsWith("m")) {
    const m = db.get<{ content: string; channel_id: number | null }>("SELECT content, channel_id FROM messages WHERE id = ?", [n]);
    const a = base();
    if (!m || !a) return null;
    return { ...a, body: m.content, steps: [], links: [{ label: "See it in the chat", href: `${m.channel_id ? `#/c/${m.channel_id}` : "#/"}?m=${n}` }] };
  }
  if (id.startsWith("a")) {
    const r = db.get<{ detail: string }>("SELECT detail FROM activity_log WHERE id = ?", [n]);
    const a = base();
    if (!r || !a) return null;
    const links = a.kind === "life_admin" ? [{ label: "Open Life admin", href: "#/tasks?admin" }] : a.kind === "style" ? [{ label: "See what she noticed", href: "#/settings/you" }] : [];
    return { ...a, body: r.detail, steps: [], links };
  }
  return null;
}
