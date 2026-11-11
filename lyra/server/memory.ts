import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { DB } from "./db.ts";

export const SECTIONS = ["Rules", "People", "Projects", "Open loops"] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

export function templateMemory(userName: string): string {
  const who = userName === "you" ? "the person Lyra works for" : userName;
  return `# Lyra memory

What Lyra knows about ${who}. Lyra reads this at the start of every conversation.
You can edit it by hand at any time. Keep one fact per line.

## Rules

## People

## Projects

## Open loops
`;
}

/** Collapse to one tidy line so a fact can't smuggle in new headings. */
export function cleanItem(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[-*#>\s]+/, "")
    .trim()
    .slice(0, 300);
}

interface Located {
  lines: string[];
  /** index of the "## Section" line, or -1 */
  header: number;
  /** index one past the section's last line */
  end: number;
}

function locate(md: string, section: Section): Located {
  const lines = md.split("\n");
  const header = lines.findIndex((l) => l.trim().toLowerCase() === `## ${section}`.toLowerCase());
  if (header === -1) return { lines, header, end: -1 };
  let end = lines.length;
  for (let i = header + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, header, end };
}

export function listItems(md: string, section: Section): string[] {
  const { lines, header, end } = locate(md, section);
  if (header === -1) return [];
  return lines
    .slice(header + 1, end)
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim());
}

export function addItem(md: string, section: Section, text: string): string {
  const item = cleanItem(text);
  if (!item) throw new Error("Nothing to remember.");
  if (listItems(md, section).some((i) => i.toLowerCase() === item.toLowerCase())) return md;
  let { lines, header, end } = locate(md, section);
  if (header === -1) {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", `## ${section}`, "");
    header = lines.length - 2;
    end = lines.length;
  }
  // insert after the last non-blank line of the section
  let at = end;
  while (at > header + 1 && lines[at - 1].trim() === "") at--;
  const needsGap = at === header + 1;
  const insert = needsGap ? ["", `- ${item}`] : [`- ${item}`];
  lines.splice(at, 0, ...insert);
  // keep exactly one blank line before the next heading
  const after = at + insert.length;
  if (after < lines.length && lines[after].trim() !== "") lines.splice(after, 0, "");
  return lines.join("\n");
}

export type RemoveResult = { md: string; removed: string } | { error: string };

export function removeItem(md: string, section: Section, match: string): RemoveResult {
  const needle = match.trim().toLowerCase();
  if (!needle) return { error: "Say which line to forget." };
  const { lines, header, end } = locate(md, section);
  if (header === -1) return { error: `There's no ${section} section.` };
  const hits: number[] = [];
  for (let i = header + 1; i < end; i++) {
    const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
    if (m && m[1].toLowerCase().includes(needle)) hits.push(i);
  }
  if (hits.length === 0) return { error: `Nothing in ${section} matches "${match}".` };
  if (hits.length > 1) {
    const exact = hits.filter((i) => lines[i].replace(/^\s*[-*]\s+/, "").trim().toLowerCase() === needle);
    if (exact.length !== 1) return { error: `${hits.length} lines in ${section} match "${match}". Be more specific.` };
    hits.splice(0, hits.length, exact[0]);
  }
  const removed = lines[hits[0]].replace(/^\s*[-*]\s+/, "").trim();
  lines.splice(hits[0], 1);
  return { md: lines.join("\n"), removed };
}

export interface Snapshot {
  id: number;
  reason: string;
  created_at: string;
}

/** The memory file plus a snapshot history in SQLite, so every change can be undone. */
export class MemoryStore {
  constructor(
    private db: DB,
    readonly path: string,
    userName: string,
  ) {
    if (!existsSync(path)) writeFileSync(path, templateMemory(userName), { mode: 0o600 });
  }

  read(): string {
    return readFileSync(this.path, "utf8");
  }

  private write(next: string, reason: string): number {
    const before = this.read();
    const snap = this.db
      .prepare("INSERT INTO memory_snapshots (content, reason) VALUES (?, ?) RETURNING id")
      .get(before, reason) as { id: number };
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, next.endsWith("\n") ? next : next + "\n", { mode: 0o600 });
    renameSync(tmp, this.path);
    return snap.id;
  }

  remember(section: Section, text: string): { text: string; snapshotId?: number } {
    const md = this.read();
    const next = addItem(md, section, text);
    const item = cleanItem(text);
    if (next === md) return { text: item };
    return { text: item, snapshotId: this.write(next, `Saved to ${section}: ${item}`) };
  }

  forget(section: Section, match: string): { text: string; snapshotId: number } | { error: string } {
    const r = removeItem(this.read(), section, match);
    if ("error" in r) return r;
    return { text: r.removed, snapshotId: this.write(r.md, `Removed from ${section}: ${r.removed}`) };
  }

  /** Whole-file edit from the Memory screen. */
  replace(content: string): number {
    return this.write(content, "Edited by hand in the app");
  }

  history(limit = 30): Snapshot[] {
    return this.db
      .prepare("SELECT id, reason, created_at FROM memory_snapshots ORDER BY id DESC LIMIT ?")
      .all(limit) as Snapshot[];
  }

  /** Put the file back to how it was just before snapshot `id`'s change. */
  restore(id: number): void {
    const row = this.db.prepare("SELECT content FROM memory_snapshots WHERE id = ?").get(id) as
      | { content: string }
      | undefined;
    if (!row) throw new Error("That version no longer exists.");
    this.write(row.content, `Restored the version from before change #${id}`);
  }

  addSuggestion(section: Section, text: string): number {
    const row = this.db
      .prepare("INSERT INTO memory_suggestions (section, text) VALUES (?, ?) RETURNING id")
      .get(section, cleanItem(text)) as { id: number };
    return row.id;
  }

  resolveSuggestion(id: number, accept: boolean): { section: Section; text: string; snapshotId?: number } {
    const row = this.db
      .prepare("SELECT section, text, status FROM memory_suggestions WHERE id = ?")
      .get(id) as { section: string; text: string; status: string } | undefined;
    if (!row || !isSection(row.section)) throw new Error("That suggestion no longer exists.");
    if (row.status !== "pending") return { section: row.section, text: row.text };
    this.db.prepare("UPDATE memory_suggestions SET status = ? WHERE id = ?").run(accept ? "saved" : "dismissed", id);
    if (!accept) return { section: row.section, text: row.text };
    const r = this.remember(row.section, row.text);
    return { section: row.section, text: r.text, snapshotId: r.snapshotId };
  }

  suggestionStatus(id: number): string | undefined {
    const row = this.db.prepare("SELECT status FROM memory_suggestions WHERE id = ?").get(id) as
      | { status: string }
      | undefined;
    return row?.status;
  }
}
