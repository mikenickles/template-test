import { db, now } from '../db.ts';

export interface Memory {
  id: number;
  text: string;
  category: string;
  source: string;
  created_at: number;
}

export const CATEGORIES = ['preference', 'person', 'fact', 'instruction'] as const;

export function addMemory(text: string, category: string = 'fact', source: 'arlo' | 'you' = 'arlo'): Memory {
  const clean = text.trim().slice(0, 500);
  const at = now();
  const info = db()
    .prepare('insert into memories(text, category, source, created_at) values(?, ?, ?, ?)')
    .run(clean, category, source, at);
  return { id: Number(info.lastInsertRowid), text: clean, category, source, created_at: at };
}

export function listMemories(): Memory[] {
  return db().prepare('select * from memories order by id desc').all() as unknown as Memory[];
}

export function deleteMemory(id: number): boolean {
  return db().prepare('delete from memories where id = ?').run(id).changes > 0;
}

export function clearMemories(): void {
  db().exec('delete from memories');
}

/** Simple keyword recall: memories ranked by how many of the query's words they contain. */
export function searchMemories(query: string, limit = 8): Memory[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  if (!words.length) return listMemories().slice(0, limit);
  return listMemories()
    .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.id - a.m.id)
    .slice(0, limit)
    .map((x) => x.m);
}

const PROMPT_BUDGET = 6000;

/** The memories that ride along in every conversation (newest first, within a size budget). */
export function memoryBlock(): string {
  const lines: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const m of listMemories()) {
    const line = `- [${m.id}] (${m.category}) ${m.text}`;
    if (used + line.length > PROMPT_BUDGET) {
      omitted++;
      continue;
    }
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return 'Nothing saved yet.';
  if (omitted) lines.push(`(${omitted} older memories not shown; use the recall tool to search them.)`);
  return lines.join('\n');
}
