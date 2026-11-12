// Phase 10: the weekly memory tidy-up. Lyra rereads its notebook about the user and
// merges duplicates, drops what's stale or done, and fixes contradictions. The change
// is saved as a version (one tap undoes it) and Lyra posts what it changed.
import { cleanItem, listItems } from "./memory.ts";
import { neutralize } from "./untrusted.ts";
import type { ModelProvider, ToolDef } from "./providers/types.ts";

/** Swap one section's items, leaving everything else in the file exactly as it was. */
export function replaceItems(md: string, section: string, items: string[]): string {
  const lines = md.split("\n");
  const header = lines.findIndex((l) => l.trim().toLowerCase() === `## ${section}`.toLowerCase());
  if (header === -1) return md;
  let end = lines.length;
  for (let i = header + 1; i < lines.length; i++)
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  const body = items.map((i) => `- ${cleanItem(i)}`).filter((l) => l !== "- ");
  return [...lines.slice(0, header + 1), ...body, "", ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n");
}

export interface TidyResult {
  content: string;
  changes: string[];
}

/**
 * Checks the tidied sections before anything is saved: only known sections, no section
 * grows, and no more than half of everything goes in one tidy-up.
 */
export function applyTidy(md: string, sections: readonly string[], proposed: Record<string, unknown>, changes: unknown): TidyResult {
  const list = (Array.isArray(changes) ? changes : []).map((c) => cleanItem(String(c))).filter(Boolean).slice(0, 12);
  if (!list.length) throw new Error("Say what changed.");
  let next = md;
  let before = 0;
  let after = 0;
  for (const s of sections) {
    const old = listItems(md, s);
    before += old.length;
    const raw = proposed[s];
    if (raw === undefined) {
      after += old.length;
      continue;
    }
    if (!Array.isArray(raw)) throw new Error(`"${s}" must be a list.`);
    const items = [...new Set(raw.map((i) => cleanItem(String(i))).filter(Boolean))];
    if (items.length > old.length) throw new Error(`A tidy-up doesn't add facts: "${s}" grew.`);
    after += items.length;
    next = replaceItems(next, s, items);
  }
  for (const k of Object.keys(proposed)) if (!sections.includes(k)) throw new Error(`There's no section "${k}".`);
  if (after < before / 2) throw new Error("That removes more than half of what's saved. Tidy less at once.");
  return { content: next, changes: list };
}

const TOOLS: ToolDef[] = [
  {
    name: "tidy_memory",
    description: "Save the tidied notebook: each section's full list of items after tidying, and a short list of what you changed.",
    schema: {
      type: "object",
      properties: {
        sections: { type: "object", description: "Section name → its complete list of items after tidying. Leave out sections you didn't change.", additionalProperties: { type: "array", items: { type: "string" } } },
        changes: { type: "array", items: { type: "string" }, description: "What you changed, one short line each: 'Merged two notes about Dana's birthday'." },
      },
      required: ["sections", "changes"],
    },
  },
  { name: "nothing_to_tidy", description: "The notebook is already in good shape.", schema: { type: "object", properties: {} } },
];

export async function runTidy(provider: ModelProvider, md: string, sections: readonly string[], userName: string, today: string): Promise<TidyResult | null> {
  const user = userName === "you" ? "the user" : userName;
  const system = `You are Lyra, ${user}'s chief of staff, tidying your own notebook about ${user}. Today is ${today}.

Make it shorter and truer without losing anything that matters:
- Merge duplicates and notes that say the same thing into one line.
- Remove open loops that are clearly done or past (a date that has passed, "waiting on X" that was answered later in the notebook).
- Where two notes contradict, keep the newer-looking one.
- Never invent facts, never reword a rule's meaning, and keep each line one fact.
If it's already tidy, call nothing_to_tidy. Otherwise call tidy_memory with the full item list of each section you changed.

<notebook>
${neutralize(md.trim())}
</notebook>`;
  const result = await provider.generate({ system, messages: [{ role: "user", parts: [{ type: "text", text: "Tidy the notebook now." }] }], tools: TOOLS }, () => {});
  const call = result.parts.find((p) => p.type === "tool_call");
  if (!call || call.type !== "tool_call" || call.name !== "tidy_memory") return null;
  return applyTidy(md, sections, (call.input.sections ?? {}) as Record<string, unknown>, call.input.changes);
}
