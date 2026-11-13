// Skills: how the user wants particular jobs done, taught once ("when I plan a trip:
// check flights, block the calendar, make a packing list"). Lyra sees each skill's name
// and "use when", and reads the full steps only when a request fits (use_skill).
// Skills change how Lyra does things, never what it's allowed to do.
import type { DB } from "./db.ts";

export interface Skill {
  id: number;
  name: string;
  /** one line: when to use it */
  use_when: string;
  /** the steps, Markdown (usually a short numbered list) */
  steps: string;
  uses: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

const one = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const MAX_STEPS = 6000;

export function listSkills(db: DB): Skill[] {
  return db.all<Skill>("SELECT * FROM skills ORDER BY name COLLATE NOCASE");
}

export function getSkill(db: DB, id: number): Skill | undefined {
  return db.get<Skill>("SELECT * FROM skills WHERE id = ?", [id]);
}

export function findSkill(db: DB, name: string): Skill | undefined {
  return db.get<Skill>("SELECT * FROM skills WHERE name = ? COLLATE NOCASE", [one(name, 60)]);
}

/** Create, or replace the one with the same name (or id). */
export function saveSkill(db: DB, input: { id?: number | null; name: unknown; use_when: unknown; steps: unknown }): { skill: Skill; created: boolean } {
  const name = one(input.name, 60);
  if (!name) throw new Error("Give the skill a short name, like 'Trip planning'.");
  const useWhen = one(input.use_when, 200);
  if (!useWhen) throw new Error("Say when to use it, in one line.");
  const steps = String(input.steps ?? "").replace(/\r\n?/g, "\n").trim();
  if (!steps) throw new Error("A skill needs its steps.");
  if (steps.length > MAX_STEPS) throw new Error("Those steps are too long. Keep a skill to the essentials.");
  const existing = input.id ? getSkill(db, input.id) : findSkill(db, name);
  const clash = findSkill(db, name);
  if (existing && clash && clash.id !== existing.id) throw new Error(`There's already a skill called ${clash.name}.`);
  if (existing) {
    db.run("UPDATE skills SET name = ?, use_when = ?, steps = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [name, useWhen, steps, existing.id]);
    return { skill: getSkill(db, existing.id)!, created: false };
  }
  if (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM skills")!.n >= 100) throw new Error("There are already 100 skills. Remove some first.");
  const r = db.run<Skill>("INSERT INTO skills (name, use_when, steps) VALUES (?, ?, ?) RETURNING *", [name, useWhen, steps])!;
  return { skill: r, created: true };
}

export function deleteSkill(db: DB, id: number): void {
  db.run("DELETE FROM skills WHERE id = ?", [id]);
}

export function markUsed(db: DB, id: number): void {
  db.run("UPDATE skills SET uses = uses + 1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
}

/** The index for Lyra's instructions: name and when to use, one line each. */
export function describeSkills(skills: Skill[]): string {
  return skills.map((s) => `- ${s.name}: ${s.use_when}`).join("\n");
}
