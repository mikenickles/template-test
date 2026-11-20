/**
 * Model routing (0.51): Cove's own background work (mail watch, heads-ups, check-ins,
 * quiet routines, tidy-ups, style learning, life admin scans) runs on a smaller model from
 * the same provider; everything the user talks to, and anything that gets posted, stays on
 * the main model. This picks the smaller partner for a main model.
 */
import type { ProviderChoice } from "./index.ts";

/** The family a main model's background partner comes from, by provider. Bigger → smaller. */
const PAIRS: { provider: ProviderChoice["provider"]; main: RegExp; quick: RegExp; fallback?: string }[] = [
  // Claude: Sonnet and Opus hand background work to Haiku
  { provider: "anthropic", main: /(^|[-_.])(sonnet|opus)([-_.]|$)/i, quick: /(^|[-_.])haiku([-_.]|$)/i, fallback: "claude-haiku-5-5" },
  // OpenAI: Sol hands it to Terra
  { provider: "openai", main: /(^|[-_.])sol([-_.]|$)/i, quick: /(^|[-_.])terra([-_.]|$)/i },
  // Gemini: Pro hands it to Flash
  { provider: "gemini", main: /(^|[-_.])pro([-_.]|$)/i, quick: /(^|[-_.])flash([-_.]|$)/i },
];

/**
 * The background model for `main`, picked from the models the key can use (newest first,
 * as listModels returns them). Returns the main model itself when there's no smaller partner
 * (it's already small, it's an unknown family, or the list has nothing that fits).
 */
export function quickModelFor(main: ProviderChoice, available: string[] | null): string {
  const pair = PAIRS.find((p) => p.provider === main.provider && p.main.test(main.model));
  if (!pair) return main.model;
  // a dated or preview id is skipped when a plain one exists
  const fits = (available ?? []).filter((id) => pair.quick.test(id));
  const plain = fits.find((id) => !/preview|exp|latest|\d{8}/i.test(id));
  return plain ?? fits[0] ?? pair.fallback ?? main.model;
}
