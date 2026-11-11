import type { DB } from "./db.ts";

/** Where notebooks live: the app's private storage on the phone, IndexedDB in a browser. */
export interface TextStore {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove?(name: string): Promise<void>;
}

/** Main memory: things about the user in general. */
export const SECTIONS = ["Rules", "People", "Projects", "Open loops"] as const;
export type Section = (typeof SECTIONS)[number];

/** A channel's notebook: facts about that one subject. */
export const CHANNEL_SECTIONS = ["Notes", "Decisions", "Open loops"] as const;

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

export function templateChannel(name: string, about: string): string {
  return `# ${cleanItem(name)}

Lyra's notebook for this channel${about ? `: ${cleanItem(about)}` : ""}.
Facts about this subject live here. Things about you in general go in main memory.

## Notes

## Decisions

## Open loops
`;
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

function locate(md: string, section: string): Located {
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

export function listItems(md: string, section: string): string[] {
  const { lines, header, end } = locate(md, section);
  if (header === -1) return [];
  return lines
    .slice(header + 1, end)
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim());
}

export function addItem(md: string, section: string, text: string): string {
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

export function removeItem(md: string, section: string, match: string): RemoveResult {
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

export interface NotebookSpec {
  /** "main", or "channel:<id>" */
  scope: string;
  file: string;
  sections: readonly string[];
  template: string;
}

/** A markdown notebook plus a snapshot history in SQLite, so every change can be undone. */
export class Notebook {
  private content = "";

  private constructor(
    private db: DB,
    private files: TextStore,
    readonly spec: NotebookSpec,
  ) {}

  static async open(db: DB, files: TextStore, spec: NotebookSpec): Promise<Notebook> {
    const n = new Notebook(db, files, spec);
    const existing = await files.read(spec.file);
    n.content = existing ?? spec.template;
    if (existing === null) await files.write(spec.file, n.content);
    return n;
  }

  get scope(): string {
    return this.spec.scope;
  }

  get sections(): readonly string[] {
    return this.spec.sections;
  }

  /** Accepts any capitalisation of a section name; returns the canonical one. */
  section(name: string): string | undefined {
    return this.spec.sections.find((s) => s.toLowerCase() === name.trim().toLowerCase());
  }

  read(): string {
    return this.content;
  }

  view(): { name: string; items: string[] }[] {
    return this.spec.sections.map((s) => ({ name: s, items: listItems(this.content, s) }));
  }

  count(): number {
    return this.view().reduce((n, s) => n + s.items.length, 0);
  }

  private async write(next: string, reason: string): Promise<number> {
    const snap = this.db.run<{ id: number }>("INSERT INTO memory_snapshots (scope, content, reason) VALUES (?, ?, ?) RETURNING id", [
      this.scope,
      this.content,
      reason,
    ])!;
    this.content = next.endsWith("\n") ? next : next + "\n";
    await this.files.write(this.spec.file, this.content);
    return snap.id;
  }

  private need(section: string): string {
    const s = this.section(section);
    if (!s) throw new Error(`Section must be one of: ${this.spec.sections.join(", ")}.`);
    return s;
  }

  async remember(section: string, text: string): Promise<{ section: string; text: string; snapshotId?: number }> {
    const s = this.need(section);
    const next = addItem(this.content, s, text);
    const item = cleanItem(text);
    if (next === this.content) return { section: s, text: item };
    return { section: s, text: item, snapshotId: await this.write(next, `Saved to ${s}: ${item}`) };
  }

  async forget(section: string, match: string): Promise<{ section: string; text: string; snapshotId: number } | { error: string }> {
    const s = this.section(section);
    if (!s) return { error: `Section must be one of: ${this.spec.sections.join(", ")}.` };
    const r = removeItem(this.content, s, match);
    if ("error" in r) return r;
    return { section: s, text: r.removed, snapshotId: await this.write(r.md, `Removed from ${s}: ${r.removed}`) };
  }

  /** Whole-file edit from the app. */
  replace(content: string): Promise<number> {
    return this.write(content, "Edited by hand in the app");
  }

  history(limit = 30): Snapshot[] {
    return this.db.all<Snapshot>("SELECT id, reason, created_at FROM memory_snapshots WHERE scope = ? ORDER BY id DESC LIMIT ?", [
      this.scope,
      limit,
    ]);
  }

  /** Put the file back to how it was just before snapshot `id`'s change. */
  async restore(id: number): Promise<void> {
    const row = this.db.get<{ content: string }>("SELECT content FROM memory_snapshots WHERE id = ? AND scope = ?", [id, this.scope]);
    if (!row) throw new Error("That version no longer exists.");
    await this.write(row.content, `Restored the version from before change #${id}`);
  }

  addSuggestion(section: string, text: string): number {
    return this.db.run<{ id: number }>("INSERT INTO memory_suggestions (scope, section, text) VALUES (?, ?, ?) RETURNING id", [
      this.scope,
      this.need(section),
      cleanItem(text),
    ])!.id;
  }

  async resolveSuggestion(id: number, accept: boolean): Promise<{ section: string; text: string; snapshotId?: number }> {
    const row = this.db.get<{ section: string; text: string; status: string }>(
      "SELECT section, text, status FROM memory_suggestions WHERE id = ? AND scope = ?",
      [id, this.scope],
    );
    if (!row) throw new Error("That suggestion no longer exists.");
    if (row.status !== "pending") return { section: row.section, text: row.text };
    this.db.run("UPDATE memory_suggestions SET status = ? WHERE id = ?", [accept ? "saved" : "dismissed", id]);
    if (!accept) return { section: row.section, text: row.text };
    return this.remember(row.section, row.text);
  }

  suggestionStatus(id: number): string | undefined {
    return this.db.get<{ status: string }>("SELECT status FROM memory_suggestions WHERE id = ?", [id])?.status;
  }

  /** Delete the notebook and its history (when its channel is deleted). */
  async destroy(): Promise<void> {
    this.db.run("DELETE FROM memory_snapshots WHERE scope = ?", [this.scope]);
    this.db.run("DELETE FROM memory_suggestions WHERE scope = ?", [this.scope]);
    if (this.files.remove) await this.files.remove(this.spec.file);
    else await this.files.write(this.spec.file, "");
  }
}

export function mainNotebookSpec(userName: string): NotebookSpec {
  return { scope: "main", file: "memory.md", sections: SECTIONS, template: templateMemory(userName) };
}

export function channelNotebookSpec(id: number, name: string, about: string): NotebookSpec {
  return { scope: `channel:${id}`, file: `channel-${id}.md`, sections: CHANNEL_SECTIONS, template: templateChannel(name, about) };
}
