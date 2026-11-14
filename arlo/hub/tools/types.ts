import { z } from 'zod';
import type { SearchResult, ToolSpec } from '../providers/types.ts';

/**
 * How much say the owner gets before a tool runs. This is enforced by the hub,
 * never left to the model's judgement.
 *
 *  read    - looks something up; changes nothing.
 *  act     - small, easily undone, affects only the owner's own things.
 *  confirm - reaches other people or is hard to undo. Always shown for approval.
 *  money   - spends money. Always shown for approval, and capped.
 */
export type Risk = 'read' | 'act' | 'confirm' | 'money';

export type Connection = 'google' | 'spotify' | 'stripe';

/** What the owner sees on an approval card. Built from the real input, not from the model's words. */
export interface Card {
  title: string;
  rows: { label: string; value: string }[];
  body?: string;
  /** Shown in caution colour, e.g. "This can't be undone." */
  warning?: string;
  /** Button text, e.g. "Send". */
  confirmLabel: string;
  /** What to say once it has happened, e.g. "Email sent". */
  done: string;
}

export interface ToolContext {
  fetch: typeof fetch;
  signal: AbortSignal;
  /** Web research through the active model provider's own search tool. */
  search: (query: string) => Promise<SearchResult>;
}

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  risk: Risk;
  /** The account this tool needs; it is only offered once that account is connected. */
  needs?: Connection;
  /** Extra condition for offering the tool at all (e.g. the wallet is switched on). */
  available?: () => boolean;
  /** The result contains text written by other people (email, invites, documents, the web). */
  untrusted?: boolean;
  /** An `act` tool that still needs approval once untrusted content is in the turn. */
  guarded?: boolean;
  /** An `act` tool that needs approval for this particular input (e.g. an event that invites other people). */
  escalate?: (input: z.infer<S>) => boolean;
  /** Short present-tense label, e.g. "Checking your calendar". */
  label: (input: z.infer<S>) => string;
  /** Required for confirm and money tools. */
  card?: (input: z.infer<S>) => Card;
  /** Refuse before even asking, with a reason (e.g. over the spending cap). */
  check?: (input: z.infer<S>) => string | null;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool {
  if ((tool.risk === 'confirm' || tool.risk === 'money' || tool.guarded || tool.escalate) && !tool.card) {
    throw new Error(`Tool ${tool.name} can require approval, so it needs a card.`);
  }
  return tool as unknown as Tool;
}

/** Long validation regexes are noise to a model; the hub still enforces them when the call comes in. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || (key === 'pattern' && 'format' in node)) continue;
    out[key] = tidy(value);
  }
  return out;
}

export function toSpec(tool: Tool): ToolSpec {
  const schema = tidy(z.toJSONSchema(tool.schema, { io: 'input' })) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, schema };
}

/** Trim long values so a card stays readable. */
export function clip(text: string, max = 280): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}
