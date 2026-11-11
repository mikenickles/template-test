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
  | { type: "tool_result"; id: string; name: string; content: string; isError?: boolean };

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

export interface GenerateRequest {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  parts: Part[];
  stop: "end" | "tool_use" | "max_tokens";
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
