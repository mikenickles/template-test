import PRINCIPLES from "./principles.md?raw";
import DEFAULT from "./soul.md?raw";

/** Lyra's built-in soul. The user can replace it with their own from the app. */
export const DEFAULT_SOUL: string = DEFAULT;

/**
 * The soul and voice guide together, then the ground rules, with the user's name filled in.
 * The soul is the user's to edit; the ground rules (principles.md) always follow it, so an
 * edited soul can't drop them.
 */
export function character(soul: string | undefined, voice: string, user: string): string {
  return `${(soul?.trim() || DEFAULT_SOUL).replaceAll("{user}", user)}\n\n${voice.replaceAll("{user}", user)}\n\n${PRINCIPLES.replaceAll("{user}", user)}`;
}

/** Only some sections of the ground rules, by heading (for prompts that can't take them all). */
export function groundRules(user: string, headings: string[]): string {
  return PRINCIPLES.split(/\n(?=## )/)
    .filter((s) => headings.some((h) => s.startsWith(`## ${h}`)))
    .map((s) => s.trim().replaceAll("{user}", user))
    .join("\n\n");
}

/** The next two weeks with their weekdays, so a model never has to work one out ("Sat Nov 14"). */
export function calendarAhead(now: Date, timeZone: string, days = 14): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(fmt.format(new Date(now.getTime() + i * 86_400_000)).replace(",", ""));
  return `Calendar: today ${out[0]}; then ${out.slice(1).join(", ")}.`;
}
