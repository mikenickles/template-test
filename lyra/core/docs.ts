// Phase 13: documents Lyra writes for you (plans, itineraries, lists, comparisons),
// kept in the app, editable, and optionally saved to Google Docs with one tap.
import type { DB } from "./db.ts";
import { NeedsConsentError, type TokenSource } from "./connectors/google.ts";

export interface Doc {
  id: number;
  title: string;
  /** Markdown */
  body: string;
  channel_id: number | null;
  /** written after reading outside content (mail, web): read back as data, never instructions */
  tainted: boolean;
  /** the Google Doc it was saved to, if any */
  gdoc_id: string | null;
  gdoc_link: string | null;
  /** the task whose worker wrote it (a report) */
  task_id: number | null;
  created_at: string;
  updated_at: string;
}

interface Row extends Omit<Doc, "tainted"> {
  tainted: number;
}

const parse = (r: Row): Doc => ({ ...r, tainted: !!r.tainted });
const MAX_BODY = 60_000;
const title = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

export function listDocs(db: DB, limit = 200): Doc[] {
  return db.all<Row>("SELECT * FROM docs ORDER BY updated_at DESC, id DESC LIMIT ?", [limit]).map(parse);
}

export function getDoc(db: DB, id: number): Doc | undefined {
  const r = db.get<Row>("SELECT * FROM docs WHERE id = ?", [id]);
  return r && parse(r);
}

export function createDoc(db: DB, input: { title: unknown; body: unknown; channelId?: number | null; tainted?: boolean; taskId?: number | null }): Doc {
  const t = title(input.title);
  if (!t) throw new Error("Give the doc a title.");
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) throw new Error("The doc is empty.");
  if (body.length > MAX_BODY) throw new Error("That's too long for one doc. Split it in two.");
  if (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM docs")!.n >= 1000) throw new Error("There are already 1,000 docs. Delete some first.");
  const r = db.run<Row>("INSERT INTO docs (title, body, channel_id, tainted, task_id) VALUES (?, ?, ?, ?, ?) RETURNING *", [t, body, input.channelId ?? null, input.tainted ? 1 : 0, input.taskId ?? null])!;
  return parse(r);
}

/** Replace the body, add to the end, and/or rename. */
export function updateDoc(db: DB, id: number, patch: { title?: unknown; body?: unknown; append?: unknown; tainted?: boolean }): Doc {
  const d = getDoc(db, id);
  if (!d) throw new Error(`There's no doc #${id}.`);
  let body = d.body;
  if (patch.body !== undefined) body = String(patch.body).replace(/\r\n?/g, "\n").trim();
  if (patch.append !== undefined && String(patch.append).trim()) body = `${body}\n\n${String(patch.append).replace(/\r\n?/g, "\n").trim()}`;
  if (!body) throw new Error("A doc can't be empty. Delete it instead.");
  if (body.length > MAX_BODY) throw new Error("That's too long for one doc.");
  const t = patch.title !== undefined ? title(patch.title) || d.title : d.title;
  db.run("UPDATE docs SET title = ?, body = ?, tainted = MAX(tainted, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [t, body, patch.tainted ? 1 : 0, id]);
  return getDoc(db, id)!;
}

export function deleteDoc(db: DB, id: number): void {
  db.run("DELETE FROM docs WHERE id = ?", [id]);
}

/** For Lyra's instructions: the most recent docs, one line each. */
export function describeDocs(docs: Doc[], max = 12): string {
  return docs
    .slice(0, max)
    .map((d) => `- #${d.id} ${d.title} (updated ${d.updated_at.slice(0, 10)})`)
    .join("\n");
}

// ---------- Google Docs (only files Lyra itself made: drive.file) ----------

const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** Save the doc to Google Docs: a new Google Doc the first time, the same one after that. */
export async function saveToGoogleDocs(d: Doc, tokens: TokenSource, fetchFn: typeof fetch): Promise<{ id: string; link: string }> {
  let token: string;
  try {
    token = await tokens.get();
  } catch (e) {
    if (e instanceof NeedsConsentError || /NEEDS_CONSENT/.test(String((e as Error).message))) throw new Error("NEEDS_CONSENT");
    throw e;
  }
  const send = async (type: string) => {
    const boundary = `lyra${crypto.randomUUID().replace(/-/g, "")}`;
    const meta = d.gdoc_id ? { name: d.title } : { name: d.title, mimeType: "application/vnd.google-apps.document" };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\n\r\n${d.body}\r\n--${boundary}--`;
    return fetchFn(`${UPLOAD}${d.gdoc_id ? `/${encodeURIComponent(d.gdoc_id)}` : ""}?uploadType=multipart&fields=id,webViewLink`, {
      method: d.gdoc_id ? "PATCH" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
  };
  // Markdown keeps headings and lists; plain text if Google won't convert it
  let r = await send("text/markdown");
  if (r.status === 400) r = await send("text/plain");
  if (r.status === 401 || r.status === 403) {
    await tokens.invalidate();
    throw new Error("Google refused. Try again, and approve Lyra's access to the docs it creates.");
  }
  if (r.status === 404 && d.gdoc_id) throw new Error("GONE");
  if (!r.ok) throw new Error(`Google said ${r.status}.`);
  const j = (await r.json()) as { id: string; webViewLink?: string };
  return { id: j.id, link: j.webViewLink && j.webViewLink.startsWith("https://") ? j.webViewLink : `https://docs.google.com/document/d/${j.id}/edit` };
}

/** The report a task's worker wrote, if any (the newest). */
export function reportFor(db: DB, taskId: number): Doc | undefined {
  const r = db.get<Row>("SELECT * FROM docs WHERE task_id = ? ORDER BY id DESC LIMIT 1", [taskId]);
  return r && parse(r);
}
