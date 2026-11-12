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

/** A provider that writes down what each call used. */
export function metered(provider: ModelProvider, source: UsageSource, db: DB, timeZone?: string): ModelProvider {
  return {
    id: provider.id,
    model: provider.model,
    async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
      const result = await provider.generate(req, onText);
      if (result.usage && (result.usage.input || result.usage.output)) {
        try {
          recordUsage(db, { day: localDay(new Date(), timeZone), provider: provider.id, model: provider.model, source, ...result.usage });
        } catch (e) {
          console.error("[lyra] usage not recorded", e);
        }
      }
      return result;
    },
  };
}
