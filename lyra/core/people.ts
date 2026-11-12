// Phase 10: people who matter to the user, as cards: who they are, how to reach them,
// and what Lyra knows about them. Separate from the notebook so "email Dana" just works.
import type { DB } from "./db.ts";

export interface Person {
  id: number;
  name: string;
  /** other names they go by: "Mom", "D" */
  aliases: string[];
  emails: string[];
  phones: string[];
  /** "sister", "Rowan's teacher", "manager at work" */
  relation: string;
  /** facts, one per line */
  notes: string[];
  created_at: string;
  updated_at: string;
}

interface Row {
  id: number;
  name: string;
  aliases: string;
  emails: string;
  phones: string;
  relation: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

const parse = (r: Row): Person => ({ ...r, aliases: JSON.parse(r.aliases), emails: JSON.parse(r.emails), phones: JSON.parse(r.phones), notes: JSON.parse(r.notes) });
const one = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[^\s@<>(),;:"\[\]\\]{2,}$/;
const uniq = (xs: string[]) => [...new Map(xs.filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];

export function listPeople(db: DB): Person[] {
  return db.all<Row>("SELECT * FROM people ORDER BY name COLLATE NOCASE").map(parse);
}

export function getPerson(db: DB, id: number): Person | undefined {
  const r = db.get<Row>("SELECT * FROM people WHERE id = ?", [id]);
  return r && parse(r);
}

/** By name, alias or email (any case); else a unique first-name match. */
export function findPerson(db: DB, query: string): Person | undefined {
  const q = one(query, 120).toLowerCase();
  if (!q) return undefined;
  const all = listPeople(db);
  const exact = all.find((p) => p.name.toLowerCase() === q || p.aliases.some((a) => a.toLowerCase() === q) || p.emails.some((e) => e.toLowerCase() === q));
  if (exact) return exact;
  const first = all.filter((p) => p.name.toLowerCase().split(" ")[0] === q.split(" ")[0]);
  return first.length === 1 ? first[0] : undefined;
}

export interface PersonInput {
  name: string;
  relation?: string;
  email?: string;
  phone?: string;
  fact?: string;
  alias?: string;
}

/** Adds them, or adds to the card that's already there. Returns the card and what changed. */
export function rememberPerson(db: DB, input: PersonInput): { person: Person; created: boolean } {
  const name = one(input.name, 80);
  if (!name) throw new Error("Whose card is this? Give a name.");
  const email = one(input.email, 254).toLowerCase();
  if (email && !EMAIL.test(email)) throw new Error(`"${email}" isn't an email address.`);
  const phone = one(input.phone, 40);
  if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) throw new Error(`"${phone}" isn't a phone number.`);
  const existing = findPerson(db, name) ?? (email ? findPerson(db, email) : undefined);
  const fact = one(input.fact, 300);
  const alias = one(input.alias, 60);
  if (!existing) {
    if (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM people")!.n >= 500) throw new Error("There are already 500 people. Remove some first.");
    const r = db.run<Row>("INSERT INTO people (name, aliases, emails, phones, relation, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *", [
      name,
      JSON.stringify(alias ? [alias] : []),
      JSON.stringify(email ? [email] : []),
      JSON.stringify(phone ? [phone] : []),
      one(input.relation, 80),
      JSON.stringify(fact ? [fact] : []),
    ])!;
    return { person: parse(r), created: true };
  }
  const p = existing;
  const next = {
    // a fuller name replaces a first name ("Dana" → "Dana Ortiz")
    name: name.toLowerCase().startsWith(p.name.toLowerCase()) && name.length > p.name.length ? name : p.name,
    aliases: uniq([...p.aliases, ...(alias ? [alias] : []), ...(name !== p.name && !name.toLowerCase().startsWith(p.name.toLowerCase()) ? [name] : [])]).slice(0, 10),
    emails: uniq([...p.emails, ...(email ? [email] : [])]).slice(0, 10),
    phones: uniq([...p.phones, ...(phone ? [phone] : [])]).slice(0, 10),
    relation: one(input.relation, 80) || p.relation,
    notes: uniq([...p.notes, ...(fact ? [fact] : [])]).slice(-60),
  };
  return { person: updatePerson(db, p.id, next), created: false };
}

export function updatePerson(db: DB, id: number, patch: Partial<Pick<Person, "name" | "aliases" | "emails" | "phones" | "relation" | "notes">>): Person {
  const p = getPerson(db, id);
  if (!p) throw new Error("That person is no longer here.");
  const name = patch.name !== undefined ? one(patch.name, 80) : p.name;
  if (!name) throw new Error("Give them a name.");
  const emails = patch.emails ? uniq(patch.emails.map((e) => one(e, 254).toLowerCase())) : p.emails;
  for (const e of emails) if (!EMAIL.test(e)) throw new Error(`"${e}" isn't an email address.`);
  db.run("UPDATE people SET name = ?, aliases = ?, emails = ?, phones = ?, relation = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [
    name,
    JSON.stringify(patch.aliases ? uniq(patch.aliases.map((a) => one(a, 60))) : p.aliases),
    JSON.stringify(emails),
    JSON.stringify(patch.phones ? uniq(patch.phones.map((x) => one(x, 40))) : p.phones),
    patch.relation !== undefined ? one(patch.relation, 80) : p.relation,
    JSON.stringify(patch.notes ? patch.notes.map((n) => one(n, 300)).filter(Boolean).slice(-60) : p.notes),
    id,
  ]);
  return getPerson(db, id)!;
}

export function deletePerson(db: DB, id: number): void {
  db.run("DELETE FROM people WHERE id = ?", [id]);
}

/** The directory for Lyra's instructions: one line each. */
export function describePeople(people: Person[], max = 60): string {
  return people
    .slice(0, max)
    .map((p) => `- ${p.name}${p.aliases.length ? ` (also ${p.aliases.join(", ")})` : ""}${p.relation ? `: ${p.relation}` : ""}${p.emails.length ? ` · ${p.emails[0]}` : ""}`)
    .join("\n");
}

/** One card in full, for look_up_person. */
export function describePerson(p: Person): string {
  return [
    `${p.name}${p.relation ? `, ${p.relation}` : ""}`,
    p.aliases.length ? `Also called: ${p.aliases.join(", ")}` : "",
    p.emails.length ? `Email: ${p.emails.join(", ")}` : "",
    p.phones.length ? `Phone: ${p.phones.join(", ")}` : "",
    p.notes.length ? `What you know:\n${p.notes.map((n) => `- ${n}`).join("\n")}` : "Nothing noted yet.",
  ]
    .filter(Boolean)
    .join("\n");
}
