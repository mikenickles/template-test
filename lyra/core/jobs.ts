/**
 * (0.64) Who does what: every job Tomo does on a model, with a lane that sets its default.
 * The user (or Tomo, when the user asks) can pick a model per job; "auto" follows the lane:
 *   chat  → the main model (picked in Settings › AI model)
 *   deep  → the main model
 *   light → the background partner (Sol → Terra, Sonnet/Opus → Haiku, Pro → Flash)
 *   watch → the smallest partner (Sol → Luna, Claude → Haiku, Pro → Flash-Lite)
 * Watching jobs only look; when they find something to say, the main model writes it.
 */
import type { ProviderChoice, ProviderId } from "./providers/index.ts";

export type Lane = "deep" | "light" | "watch";
export interface Job {
  id: string;
  label: string;
  /** what it does, in a few words */
  what: string;
  /** how often it runs */
  when: string;
  lane: Lane;
}

export const JOBS: Job[] = [
  { id: "task", label: "Tasks and research", what: "Works through a task you hand off: digs through mail, compares options, researches the web, writes a report", when: "When you hand something off", lane: "deep" },
  { id: "dashboard", label: "Dashboard refreshes", what: "Gathers fresh numbers and rebuilds a dashboard", when: "When a dashboard refreshes", lane: "deep" },
  { id: "routine", label: "Routines that always post", what: "Morning briefs and other routines that write something every time", when: "On each routine's schedule", lane: "deep" },
  { id: "followup", label: "Follow-ups", what: "Checks whether someone replied or something happened, and tells you", when: "When a follow-up comes due", lane: "deep" },
  { id: "routine_news", label: "News-only routines (looking)", what: "Looks for anything new for routines that only post news; your chat model writes it if there is", when: "On each routine's schedule", lane: "light" },
  { id: "headsup", label: "Heads-up checks (looking)", what: "Looks over new mail, the next 16 hours and open loops for anything that needs you", when: "Every 1–4 hours, outside quiet hours", lane: "watch" },
  { id: "mailwatch", label: "Mail watch (looking)", what: "Reads new mail from people who matter and decides if it's worth a ping", when: "Every 5 minutes when there's new mail", lane: "watch" },
  { id: "checkin", label: "Check-ins", what: "Writes a friendly nudge when things are quiet", when: "Once a day (light) or every 8 hours (active)", lane: "light" },
  { id: "lifeadmin", label: "Life admin inbox scans", what: "Finds bills, renewals, deliveries, trips and return windows in your mail", when: "Once a day", lane: "light" },
  { id: "summary", label: "Chat summaries", what: "Folds older messages into a short summary so long chats stay cheap", when: "After long stretches of chat", lane: "light" },
  { id: "tidy", label: "Memory tidy-up", what: "Merges duplicate notes and drops stale ones", when: "Once a week", lane: "light" },
  { id: "style", label: "Learning how you talk", what: "Notices how you write so Tomo can match it", when: "Every few days", lane: "light" },
];

export const JOB_IDS = new Set(JOBS.map((j) => j.id));

/** The smallest partner for a main model, for jobs that mostly look and find nothing. */
const TINY: { provider: ProviderId; quick: RegExp; skip?: RegExp; fallback?: string }[] = [
  { provider: "openai", quick: /(^|[-_.])luna([-_.]|$)/i },
  { provider: "anthropic", quick: /(^|[-_.])haiku([-_.]|$)/i, fallback: "claude-haiku-5-5" },
  { provider: "gemini", quick: /flash[-_.]?lite/i },
];

export function tinyModelFor(main: ProviderChoice, available: string[] | null, light: string): string {
  const t = TINY.find((x) => x.provider === main.provider);
  if (!t) return light;
  const fits = (available ?? []).filter((id) => t.quick.test(id));
  const plain = fits.find((id) => !/preview|exp|latest|\d{8}/i.test(id));
  return plain ?? fits[0] ?? (t.fallback && main.provider === "anthropic" ? t.fallback : light);
}

/** A picked model: "auto", or "<provider>:<model>" (any provider with a key). */
export function parsePick(v: string | undefined): ProviderChoice | null {
  const m = /^(anthropic|openai|gemini):(.{1,120})$/.exec(v ?? "");
  return m ? { provider: m[1] as ProviderId, model: m[2] } : null;
}

/** The job a provider request is for, from the Usage page's job name. */
export function jobIdFor(source: string, tier: "main" | "quick", job?: string): string | null {
  const j = job ?? "";
  if (j === "Mail watch") return tier === "quick" ? "mailwatch" : null;
  if (j === "Heads-up check") return tier === "quick" ? "headsup" : null;
  if (j === "Check-in") return "checkin";
  if (j === "Follow-up") return "followup";
  if (j.startsWith("Routine:")) return tier === "quick" ? "routine_news" : "routine";
  if (source === "worker" || j.startsWith("Task:")) return "task";
  return null;
}
