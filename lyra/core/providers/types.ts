/**
 * One small, provider-neutral shape for a conversation with tools.
 * Each adapter converts to and from its own SDK's format.
 */

export type Part =
  | { type: "text"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: Record<string, unknown>;
      /** Provider-specific data that must be sent back unchanged (e.g. Gemini thought signatures). */
      meta?: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; name: string; content: string; isError?: boolean }
  /** A photo or PDF the user attached to this message (base64). Sent to the model for this turn only. */
  | { type: "file"; mediaType: string; data: string; name: string }
  /** A provider's own block (e.g. a web search it ran itself), sent back to that provider unchanged and ignored by others. */
  | { type: "native"; provider: string; block: unknown };

export interface Msg {
  role: "user" | "assistant";
  parts: Part[];
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  schema: Record<string, unknown>;
}

/**
 * Splits a system prompt into the part that stays the same from one request to the next
 * (who Lyra is, Lyra's rules) and the part that changes (the time, tasks, memory). Providers
 * that cache by prefix (Claude) cache the stable part across messages; others just drop it.
 */
export const SYSTEM_SPLIT = "\n\n<<lyra:stable-above>>\n\n";

/** The system prompt as one text, marker removed. */
export function plainSystem(system: string): string {
  return system.replace(SYSTEM_SPLIT, "\n\n");
}

/** [stable, changing]; with no marker, all of it counts as changing. */
export function splitSystem(system: string): [string, string] {
  const i = system.indexOf(SYSTEM_SPLIT);
  return i < 0 ? ["", system] : [system.slice(0, i), system.slice(i + SYSTEM_SPLIT.length)];
}

export interface GenerateRequest {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
  /** Let the model search the web with its provider's built-in search. */
  webSearch?: boolean;
  /** Short progress labels, e.g. "Searching the web". */
  onStatus?: (label: string) => void;
}

export interface Source {
  url: string;
  title: string;
}

export interface GenerateResult {
  parts: Part[];
  /** "pause": the provider stopped mid-way (a long search) and wants to be called again to continue. */
  stop: "end" | "tool_use" | "max_tokens" | "pause";
  /** The model searched the web during this call: its answer used outside content. */
  searched?: boolean;
  /** Web pages the answer drew on. */
  sources?: Source[];
  /** Tokens this call used, as the provider counted them. */
  usage?: Usage;
}

export interface Usage {
  /** tokens sent: the prompt, history and tool results (cached ones included) */
  input: number;
  /** tokens the model wrote (reasoning included, where the provider bills it) */
  output: number;
}

/** Keep the first of each URL, in order. */
export function uniqueSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => s.url && !seen.has(s.url) && (seen.add(s.url), true));
}

export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  generate(req: GenerateRequest, onText: (delta: string) => void): Promise<GenerateResult>;
}

export const textOf = (parts: Part[]): string =>
  parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
