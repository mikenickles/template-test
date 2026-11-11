import type { DB } from "./db.ts";

/** Where memory.md lives: the app's private storage on the phone, IndexedDB in a browser. */
export interface TextStore {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
}

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

const FILE = "memory.md";

/** memory.md plus a snapshot history in SQLite, so every change can be undone. */
export class MemoryStore {
  private content = "";

  private constructor(
    private db: DB,
    private files: TextStore,
  ) {}

  static async open(db: DB, files: TextStore, userName: string): Promise<MemoryStore> {
    const m = new MemoryStore(db, files);
    const existing = await files.read(FILE);
    m.content = existing ?? templateMemory(userName);
    if (existing === null) await files.write(FILE, m.content);
    return m;
  }

  read(): string {
    return this.content;
  }

  private async write(next: string, reason: string): Promise<number> {
    const snap = this.db.run<{ id: number }>("INSERT INTO memory_snapshots (content, reason) VALUES (?, ?) RETURNING id", [
      this.content,
      reason,
    ])!;
    this.content = next.endsWith("\n") ? next : next + "\n";
    await this.files.write(FILE, this.content);
    return snap.id;
  }

  async remember(section: Section, text: string): Promise<{ text: string; snapshotId?: number }> {
    const next = addItem(this.content, section, text);
    const item = cleanItem(text);
    if (next === this.content) return { text: item };
    return { text: item, snapshotId: await this.write(next, `Saved to ${section}: ${item}`) };
  }

  async forget(section: Section, match: string): Promise<{ text: string; snapshotId: number } | { error: string }> {
    const r = removeItem(this.content, section, match);
    if ("error" in r) return r;
    return { text: r.removed, snapshotId: await this.write(r.md, `Removed from ${section}: ${r.removed}`) };
  }

  /** Whole-file edit from the Memory screen. */
  replace(content: string): Promise<number> {
    return this.write(content, "Edited by hand in the app");
  }

  history(limit = 30): Snapshot[] {
    return this.db.all<Snapshot>("SELECT id, reason, created_at FROM memory_snapshots ORDER BY id DESC LIMIT ?", [limit]);
  }

  /** Put the file back to how it was just before snapshot `id`'s change. */
  async restore(id: number): Promise<void> {
    const row = this.db.get<{ content: string }>("SELECT content FROM memory_snapshots WHERE id = ?", [id]);
    if (!row) throw new Error("That version no longer exists.");
    await this.write(row.content, `Restored the version from before change #${id}`);
  }

  addSuggestion(section: Section, text: string): number {
    return this.db.run<{ id: number }>("INSERT INTO memory_suggestions (section, text) VALUES (?, ?) RETURNING id", [
      section,
      cleanItem(text),
    ])!.id;
  }

  async resolveSuggestion(id: number, accept: boolean): Promise<{ section: Section; text: string; snapshotId?: number }> {
    const row = this.db.get<{ section: string; text: string; status: string }>(
      "SELECT section, text, status FROM memory_suggestions WHERE id = ?",
      [id],
    );
    if (!row || !isSection(row.section)) throw new Error("That suggestion no longer exists.");
    if (row.status !== "pending") return { section: row.section, text: row.text };
    this.db.run("UPDATE memory_suggestions SET status = ? WHERE id = ?", [accept ? "saved" : "dismissed", id]);
    if (!accept) return { section: row.section, text: row.text };
    const r = await this.remember(row.section, row.text);
    return { section: row.section, text: r.text, snapshotId: r.snapshotId };
  }

  suggestionStatus(id: number): string | undefined {
    return this.db.get<{ status: string }>("SELECT status FROM memory_suggestions WHERE id = ?", [id])?.status;
  }
}
