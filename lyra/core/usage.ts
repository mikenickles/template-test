/**
 * Token usage, as each provider reports it: one row per day, model and kind of
 * work (chat, worker, routine). Days are the user's local days.
 */
import type { DB } from "./db.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "./providers/types.ts";

/** "voice" rows count seconds of live voice in `input` (GPT-Live bills by time, not tokens). */
export type UsageSource = "chat" | "worker" | "routine" | "proactive" | "voice";

export interface UsageRow {
  /** local day, YYYY-MM-DD */
  day: string;
  provider: string;
  model: string;
  source: UsageSource;
  requests: number;
  input: number;
  output: number;
}

/** YYYY-MM-DD for a moment, in a time zone (the device's by default). */
export function localDay(at = new Date(), timeZone?: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function recordUsage(db: DB, row: Omit<UsageRow, "requests">): void {
  db.run(
    `INSERT INTO usage (day, provider, model, source, requests, input, output) VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (day, provider, model, source) DO UPDATE SET requests = requests + 1, input = input + excluded.input, output = output + excluded.output`,
    [row.day, row.provider, row.model, row.source, Math.max(0, Math.round(row.input)), Math.max(0, Math.round(row.output))],
  );
}

/** Rows from `from` to `to` (both YYYY-MM-DD, inclusive), oldest first. */
export function usageBetween(db: DB, from: string, to: string): UsageRow[] {
  return db.all<UsageRow>("SELECT day, provider, model, source, requests, input, output FROM usage WHERE day >= ? AND day <= ? ORDER BY day", [from, to]);
}

/** One model call, kept for 90 days (0.52): what it was for, and what it used. */
export interface UsageCall {
  id: number;
  at: string;
  day: string;
  source: UsageSource;
  /** what the call was for, in words: "Chat", "Routine: Morning brief", "Task: Find a plumber", "Mail watch" */
  job: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  /** of input, read from the provider's cache */
  cached: number;
}

/** Tokens per job between two local days, most first. */
export interface JobUsage {
  job: string;
  source: UsageSource;
  calls: number;
  input: number;
  output: number;
  cached: number;
  last: string;
}

/** Adds up the calls of one piece of work (a chat reply), for its message. */
export interface UsageTally {
  calls: number;
  input: number;
  output: number;
  cached: number;
  model: string;
}
export const newTally = (): UsageTally => ({ calls: 0, input: 0, output: 0, cached: 0, model: "" });

export function recordCall(db: DB, c: Omit<UsageCall, "id" | "at">): void {
  const r = db.run<{ id: number }>("INSERT INTO usage_log (day, source, job, provider, model, input, output, cached) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id", [
    c.day,
    c.source,
    c.job.slice(0, 120),
    c.provider,
    c.model,
    Math.max(0, Math.round(c.input)),
    Math.max(0, Math.round(c.output)),
    Math.max(0, Math.round(c.cached)),
  ]);
  // keep 90 days
  if (r && r.id % 200 === 0) db.run("DELETE FROM usage_log WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')");
}

export function usageByJob(db: DB, from: string, to: string): JobUsage[] {
  return db.all<JobUsage>(
    `SELECT job, source, COUNT(*) AS calls, SUM(input) AS input, SUM(output) AS output, SUM(cached) AS cached, MAX(at) AS last
     FROM usage_log WHERE day >= ? AND day <= ? GROUP BY job, source ORDER BY SUM(input) + SUM(output) DESC LIMIT 200`,
    [from, to],
  );
}

export function recentCalls(db: DB, limit = 50): UsageCall[] {
  return db.all<UsageCall>("SELECT * FROM usage_log ORDER BY id DESC LIMIT ?", [Math.min(200, limit)]);
}

const JOB_NAMES: Record<UsageSource, string> = { chat: "Chat", worker: "Task", routine: "Routine", proactive: "Tomo on its own", voice: "Voice" };

/** A provider that writes down what each call used: by day and model, and as its own line with what it was for. */
export function metered(provider: ModelProvider, source: UsageSource, db: DB, timeZone?: string, job?: string, tally?: UsageTally): ModelProvider {
  return {
    id: provider.id,
    model: provider.model,
    async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
      const result = await provider.generate(req, onText);
      if (result.usage && (result.usage.input || result.usage.output)) {
        try {
          const day = localDay(new Date(), timeZone);
          recordUsage(db, { day, provider: provider.id, model: provider.model, source, ...result.usage });
          recordCall(db, { day, source, job: job || JOB_NAMES[source], provider: provider.id, model: provider.model, input: result.usage.input ?? 0, output: result.usage.output ?? 0, cached: result.usage.cached ?? 0 });
          if (tally) {
            tally.calls++;
            tally.input += result.usage.input ?? 0;
            tally.output += result.usage.output ?? 0;
            tally.cached += result.usage.cached ?? 0;
            tally.model = provider.model;
          }
        } catch (e) {
          console.error("[lyra] usage not recorded", e);
        }
      }
      return result;
    },
  };
}
