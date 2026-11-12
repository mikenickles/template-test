/** The status line's wording. Every status fits in STATUS_MAX characters, so it is never cut off. */
import { parse } from "./when";

/** A status is always shown whole: never longer than this, never cut off with "…". */
export const STATUS_MAX = 24;

/** The first wording that fits. The last one must always fit (it's checked in tests). */
export function fit(...options: string[]): string {
  return options.find((o) => [...o].length <= STATUS_MAX) ?? options[options.length - 1];
}

/** "7 AM", "7:30 AM": shorter than the full clock. */
export function shortTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/** What the chat is doing, in a few words ("Searching your mail" fits; anything longer becomes "Working…"). */
export function chatText(label: string): string {
  return fit(label.replace(/…$/, "") + "…", "Working…");
}

export const workingText = (title: string, count = 1) => (count > 1 ? `Working on ${count} tasks` : fit(`Working on: ${title}`, `Working: ${title}`, "Working on a task"));
export const routineText = (name: string) => fit(`Running ${name}`, "Running a routine");
export const readyText = (n: number) => fit(`${n} ${n === 1 ? "thing" : "things"} ready for you`, `${n} ready for you`, "Tasks ready for you");
export const weatherText = (icon: string, temp: number, text: string) => fit(`${icon} ${temp}° · ${text}`, `${icon} ${temp}°`);

/** "Morning brief at 7 AM", "Brief tomorrow 8 AM", or nothing if not within a day. Always fits. */
export function upNext(routines: { name: string; enabled: number; next_run_at: string | null }[], now = new Date()): string | null {
  const next = routines
    .filter((r) => r.enabled && r.next_run_at)
    .map((r) => ({ name: r.name, at: parse(r.next_run_at!) }))
    .filter((r) => r.at.getTime() > now.getTime() && r.at.getTime() - now.getTime() < 24 * 3600_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (!next) return null;
  const t = shortTime(next.at);
  return next.at.toDateString() === now.toDateString()
    ? fit(`${next.name} at ${t}`, `Routine at ${t}`)
    : fit(`${next.name} tomorrow ${t}`, `${next.name} at ${t}`, `Tomorrow ${t}`);
}


/** The home-screen widget: a status that always fits, and the latest thing Lyra posted on its own. */
export function widgetWords(
  d: { working: { title: string }[]; ready: number; upcoming: { name: string; enabled: number; next_run_at: string | null }[]; latest?: { label: string; text: string } },
  now = new Date(),
): { status: string; detail: string } {
  const next = upNext(d.upcoming, now);
  const status = d.working.length ? workingText(d.working[0].title, d.working.length) : d.ready ? readyText(d.ready) : (next ?? fit("Here when you need me", "Here for you"));
  return { status, detail: d.latest ? `${d.latest.label}: ${d.latest.text}` : "Tap to talk to Lyra" };
}
