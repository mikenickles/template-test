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
  /** "MM-DD", or "YYYY-MM-DD" when the year is known; "" when not noted */
  birthday: string;
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
  birthday: string;
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
  birthday?: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const LONGEST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A birthday as written by a person or a model ("March 3", "3 Mar 1984", "3/14", "1984-03-03",
 * "03-03") → "MM-DD" or "YYYY-MM-DD". "" stays "" (not noted); anything else that isn't a date throws.
 */
export function parseBirthday(raw: unknown): string {
  const s = one(raw, 40).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  let y = 0;
  let m = 0;
  let d = 0;
  let hit: RegExpMatchArray | null;
  if ((hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = s.match(/^(\d{1,2})-(\d{1,2})$/))) [m, d] = [+hit[1], +hit[2]];
  else if ((hit = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/))) [m, d, y] = [+hit[1], +hit[2], +(hit[3] ?? 0)];
  else if ((hit = s.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/))) [m, d, y] = [MONTHS.findIndex((x) => x.startsWith(hit![1])) + 1, +hit[2], +(hit[3] ?? 0)];
  else if ((hit = s.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/))) [d, m, y] = [+hit[1], MONTHS.findIndex((x) => x.startsWith(hit![2])) + 1, +(hit[3] ?? 0)];
  if (m < 1 || m > 12 || d < 1 || d > LONGEST[m - 1] || (y && (y < 1900 || y > 2100))) throw new Error(`"${one(raw, 40)}" isn't a birthday I can read. Try "March 3" or "1984-03-03".`);
  const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return y ? `${y}-${md}` : md;
}

/** "March 3" (the year, when known, isn't shown: it's for working out the age). */
export function birthdayLabel(birthday: string): string {
  const [m, d] = birthday.slice(-5).split("-").map(Number);
  return birthday ? `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${d}` : "";
}

/** The next time this birthday comes round, on or after `today` (YYYY-MM-DD): the date, days away, and the age if the year is known. */
export function nextBirthday(birthday: string, today: string): { date: string; days: number; age?: number } | null {
  if (!birthday) return null;
  const md = birthday.slice(-5);
  const born = birthday.length > 5 ? +birthday.slice(0, 4) : 0;
  const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  for (let y = +today.slice(0, 4); ; y++) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    // born on February 29: the 28th in other years
    const date = `${y}-${md === "02-29" && !leap ? "02-28" : md}`;
    if (date >= today) return { date, days: Math.round((utc(date) - utc(today)) / 86_400_000), ...(born && y > born ? { age: y - born } : {}) };
  }
}

/**
 * What to say about birthdays today, with no model call: once a few days ahead ("soon", 3 days
 * or fewer) and once on the day. `seen` holds what's been said per person ("<date>:soon" | "<date>:day").
 */
export function birthdayNotices(people: Person[], today: string, seen: Record<string, string>): { text: string; soon: boolean; seen: Record<string, string> } | null {
  const lines: string[] = [];
  const next: Record<string, string> = {};
  let soon = false;
  for (const p of people) {
    const b = nextBirthday(p.birthday, today);
    if (!b) continue;
    const was = seen[p.id];
    if (was?.startsWith(b.date)) next[p.id] = was;
    const who = p.name.split(" ")[0];
    if (b.days === 0 && was !== `${b.date}:day`) {
      lines.push(`It's ${who}'s birthday today${b.age ? ` (${b.age})` : ""} 🎂`);
      next[p.id] = `${b.date}:day`;
    } else if (b.days > 0 && b.days <= 3 && !was?.startsWith(b.date)) {
      const day = b.days === 1 ? "tomorrow" : `on ${new Date(`${b.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}`;
      lines.push(`${who}'s birthday is ${day}${b.age ? ` (turning ${b.age})` : ""}.`);
      next[p.id] = `${b.date}:soon`;
      soon = true;
    }
  }
  return lines.length ? { text: lines.join("\n"), soon, seen: next } : Object.keys(next).length !== Object.keys(seen).length ? { text: "", soon: false, seen: next } : null;
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
  const birthday = parseBirthday(input.birthday);
  if (!existing) {
    if (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM people")!.n >= 500) throw new Error("There are already 500 people. Remove some first.");
    const r = db.run<Row>("INSERT INTO people (name, aliases, emails, phones, relation, notes, birthday) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *", [
      name,
      JSON.stringify(alias ? [alias] : []),
      JSON.stringify(email ? [email] : []),
      JSON.stringify(phone ? [phone] : []),
      one(input.relation, 80),
      JSON.stringify(fact ? [fact] : []),
      birthday,
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
    birthday: birthday || p.birthday,
  };
  return { person: updatePerson(db, p.id, next), created: false };
}

export function updatePerson(db: DB, id: number, patch: Partial<Pick<Person, "name" | "aliases" | "emails" | "phones" | "relation" | "notes" | "birthday">>): Person {
  const p = getPerson(db, id);
  if (!p) throw new Error("That person is no longer here.");
  const name = patch.name !== undefined ? one(patch.name, 80) : p.name;
  if (!name) throw new Error("Give them a name.");
  const emails = patch.emails ? uniq(patch.emails.map((e) => one(e, 254).toLowerCase())) : p.emails;
  for (const e of emails) if (!EMAIL.test(e)) throw new Error(`"${e}" isn't an email address.`);
  const birthday = patch.birthday !== undefined ? parseBirthday(patch.birthday) : p.birthday;
  db.run("UPDATE people SET name = ?, aliases = ?, emails = ?, phones = ?, relation = ?, notes = ?, birthday = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [
    name,
    JSON.stringify(patch.aliases ? uniq(patch.aliases.map((a) => one(a, 60))) : p.aliases),
    JSON.stringify(emails),
    JSON.stringify(patch.phones ? uniq(patch.phones.map((x) => one(x, 40))) : p.phones),
    patch.relation !== undefined ? one(patch.relation, 80) : p.relation,
    JSON.stringify(patch.notes ? patch.notes.map((n) => one(n, 300)).filter(Boolean).slice(-60) : p.notes),
    birthday,
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
    p.birthday ? `Birthday: ${birthdayLabel(p.birthday)}${p.birthday.length > 5 ? `, ${p.birthday.slice(0, 4)}` : ""}` : "",
    p.notes.length ? `What you know:\n${p.notes.map((n) => `- ${n}`).join("\n")}` : "Nothing noted yet.",
  ]
    .filter(Boolean)
    .join("\n");
}
