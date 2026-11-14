/**
 * The provider-neutral conversation format. Arlo stores conversations in this
 * shape, so you can switch between Claude, OpenAI and Gemini mid-conversation.
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini';
export type Effort = 'low' | 'medium' | 'high';

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  output: string;
  isError?: boolean;
}

export type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for an object. */
  schema: Record<string, unknown>;
}

/** end: finished. tools: wants tool results. refusal: declined. length: cut off, tools must not run. */
export type StopReason = 'end' | 'tools' | 'refusal' | 'length';

export interface StepResult {
  text: string;
  toolCalls: ToolCall[];
  stop: StopReason;
  model: string;
}

export interface TurnRequest {
  model: string;
  system: string;
  tools: ToolSpec[];
  history: Msg[];
  effort: Effort;
  signal: AbortSignal;
  onText: (delta: string) => void;
}

/**
 * One user turn. Each provider keeps its own native transcript for the length
 * of the turn (so reasoning state is replayed exactly as the API expects) and
 * only ever appends to it.
 */
export interface TurnSession {
  step(results?: ToolResult[]): Promise<StepResult>;
}

export interface SearchResult {
  text: string;
  sources: { title: string; url: string }[];
}

export interface Provider {
  readonly id: ProviderId;
  startTurn(req: TurnRequest): TurnSession;
  /** A single, tool-free completion (summaries and the like). */
  complete(req: { model: string; system: string; prompt: string; signal?: AbortSignal }): Promise<string>;
  /** Web research using the provider's own search tool, with no access to anything else. */
  webSearch(req: { model: string; query: string; signal?: AbortSignal }): Promise<SearchResult>;
}

export type ProviderErrorKind = 'auth' | 'rate_limit' | 'overloaded' | 'network' | 'bad_request' | 'other';

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  provider: ProviderId;
  constructor(provider: ProviderId, kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
  }
  /** Worth trying another provider instead. */
  get switchable(): boolean {
    return this.kind !== 'bad_request';
  }
}

/** Tool-call ids must be safe for every provider. */
export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'call';
}
