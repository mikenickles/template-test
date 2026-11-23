// (0.62) "It understands before you send": while the user types, the composer shows a quiet chip
// with what Tomo is about to do (a reminder at the time it read, a task, a look at the calendar).
// This is a plain reader with no model call; what it shows goes along with the message as a hint,
// so the reply does what the chip said (and the user can fix the time on the chip first).

export type Intent =
  | { kind: "reminder"; what: string; at: Date | null }
  | { kind: "task"; what: string }
  | { kind: "calendar"; day: Date | null };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = "(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?";
const PARTS: Record<string, [number, number]> = {
  morning: [9, 0],
  "this morning": [9, 0],
  "tomorrow morning": [9, 0],
  noon: [12, 0],
  lunch: [12, 0],
  "at lunch": [12, 0],
  lunchtime: [12, 0],
  afternoon: [14, 0],
  "this afternoon": [14, 0],
  "after work": [17, 30],
  "end of day": [17, 0],
  eod: [17, 0],
  evening: [18, 0],
  "this evening": [18, 0],
  tonight: [20, 0],
  midnight: [23, 59],
};

const dayIndex = (w: string) => DAYS.findIndex((d) => d.startsWith(w.toLowerCase().slice(0, 3)));
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

/** The day a phrase points at ("tomorrow", "friday", "next tue"), with the words it used. */
export function readDay(text: string, now: Date): { day: Date; words: string } | null {
  const t = text.toLowerCase();
  let m = /\b(today|tonight|this (?:morning|afternoon|evening))\b/.exec(t);
  if (m) return { day: startOfDay(now), words: m[0].startsWith("this") ? "" : m[0] };
  m = /\b(?:tomorrow|tmrw|tmr)\b/.exec(t);
  if (m) return { day: addDays(startOfDay(now), 1), words: m[0] };
  m = /\b(?:this )?weekend\b/.exec(t);
  if (m) {
    const ahead = (6 - now.getDay() + 7) % 7 || (now.getDay() === 6 ? 0 : 7);
    return { day: addDays(startOfDay(now), ahead), words: m[0] };
  }
  m = new RegExp(`\\b(?:(on|this|next)\\s+)?(${DAY_RE})\\b`).exec(t);
  if (m) {
    const want = dayIndex(m[2]);
    if (want >= 0) {
      // "friday" said on a Friday means next week's
      const ahead = (want - now.getDay() + 7) % 7 || 7;
      return { day: addDays(startOfDay(now), ahead), words: m[0] };
    }
  }
  return null;
}

/** When a reminder phrase points at: a day and a time, "in 20 minutes", or null when it names none. */
export function readWhen(text: string, now: Date): { at: Date; words: string[] } | null {
  const t = text.toLowerCase();
  const words: string[] = [];
  const rel = /\bin (\d+|an?|a few|half an) (min(?:ute)?s?|hours?|hrs?|days?)\b/.exec(t);
  if (rel) {
    const n = rel[1] === "a few" ? 3 : rel[1] === "half an" ? 0.5 : /^an?$/.test(rel[1]) ? 1 : Number(rel[1]);
    const unit = rel[2].startsWith("min") ? 60_000 : rel[2].startsWith("d") ? 86_400_000 : 3_600_000;
    return { at: new Date(now.getTime() + n * unit), words: [rel[0]] };
  }
  const day = readDay(t, now);
  if (day?.words) words.push(day.words);
  let hm: [number, number] | null = null;
  const clock = /\b(?:at |@ ?|by )?(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.?|p\.m\.?)(?![a-z])|\b(?:at|@|by) (\d{1,2})(?::(\d{2}))?\b(?! ?(?:min|hour|day|%))/.exec(t);
  if (clock) {
    let h = Number(clock[1] ?? clock[4]);
    const min = Number(clock[2] ?? clock[5] ?? 0);
    const ap = clock[3]?.[0];
    if (h <= 23 && min < 60) {
      if (ap === "p" && h < 12) h += 12;
      if (ap === "a" && h === 12) h = 0;
      if (!ap && h >= 1 && h <= 7) h += 12; // "at 5" means 5 PM
      hm = [h, min];
      words.push(clock[0]);
    }
  }
  if (!hm) {
    const part = Object.keys(PARTS)
      .sort((a, b) => b.length - a.length)
      .find((k) => new RegExp(`\\b${k}\\b`).test(t));
    if (part) {
      hm = PARTS[part];
      words.push(part);
    }
  }
  if (!day && !hm) return null;
  const base = day ? day.day : startOfDay(now);
  const [h, min] = hm ?? [9, 0];
  let at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, min);
  // a time with no day that has already passed today means tomorrow
  if (!day && at.getTime() <= now.getTime()) at = addDays(at, 1);
  return { at, words };
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+(?:on|at|by|this|next|for|in)\s*$/i, "")
    .replace(/^[\s,:;-]+|[\s,.;:!?-]+$/g, "")
    .replace(/^(?:to|about|that)\s+/i, "")
    .trim();

/** What the user is about to ask for, read from the text in the box. */
export function readIntent(text: string, now = new Date()): Intent | null {
  const t = text.trim();
  if (t.length < 8 || t.length > 300 || t.includes("\n")) return null;
  const rem = /^(?:hey tomo,? |tomo,? )?(?:please |pls |can you |could you )?(?:remind me|don'?t let me forget|set a reminder)(?: to| about| that)?\s+(.+)$/i.exec(t);
  if (rem) {
    const when = readWhen(rem[1], now);
    let what = rem[1];
    for (const w of when?.words ?? []) what = what.replace(new RegExp(`\\s*\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ");
    what = tidy(what);
    return what.length >= 2 ? { kind: "reminder", what, at: when?.at ?? null } : null;
  }
  const task =
    /^(?:please )?(?:add (?:a )?(?:task|to-?do)(?: to)?|new task|task|to-?do)\s*[:\-–]?\s+(.+)$/i.exec(t) ??
    /^(?:please )?(?:add|put) (.+?) (?:to|on) (?:my )?(?:tasks?|to-?dos?|to-?do list|task list)$/i.exec(t);
  if (task) {
    const what = tidy(task[1]);
    return what.length >= 2 ? { kind: "task", what } : null;
  }
  if (/\b(am i (?:free|busy|around)|what'?s on|what do i have|anything on|my (?:schedule|calendar|day)\b)/i.test(t)) {
    return { kind: "calendar", day: readDay(t, now)?.day ?? null };
  }
  return null;
}

/** "Fri 5:30 PM", "today 9:00 AM", "tomorrow 8 PM" */
export function whenLabel(at: Date, now = new Date()): string {
  const days = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? at.toLocaleDateString("en-US", { weekday: "short" }) : at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: at.getMinutes() ? "2-digit" : undefined });
  return `${day} ${time}`;
}

/** The chip's words: a title and a line under it. */
export function intentChip(i: Intent, now = new Date()): { title: string; sub: string } {
  if (i.kind === "reminder") return i.at ? { title: `Reminder · ${whenLabel(i.at, now)}`, sub: `“${i.what}”` } : { title: "Reminder", sub: `“${i.what}” · tap to pick a time` };
  if (i.kind === "task") return { title: "New task · Up next", sub: `“${i.what}”` };
  const day = i.day ? whenLabel(i.day, now).split(" ")[0] : "";
  return { title: `Checks your calendar${day ? ` · ${day}` : ""}`, sub: "Tomo looks before answering" };
}

/** The hint that goes with the message, so the reply does what the chip said. */
export function intentHint(i: Intent, now = new Date()): string | null {
  if (i.kind === "reminder") {
    if (!i.at) return null;
    const when = i.at.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `While typing, the app showed a reminder "${i.what}" for ${when} (${i.at.getFullYear()}). Set it for exactly that time unless the message itself says otherwise.`;
  }
  if (i.kind === "task") return `While typing, the app showed this would become a new task: "${i.what}".`;
  return null;
}
