import Anthropic from "@anthropic-ai/sdk";
import type { GenerateRequest, GenerateResult, ModelProvider, Msg, Part } from "./types.ts";

type AMessage = Anthropic.MessageParam;
type ABlock = Anthropic.ContentBlockParam;

export function toAnthropicMessages(messages: Msg[]): AMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.parts.map((p): ABlock => {
      switch (p.type) {
        case "text":
          return { type: "text", text: p.text };
        case "tool_call":
          return { type: "tool_use", id: p.id, name: p.name, input: p.input };
        case "tool_result":
          return { type: "tool_result", tool_use_id: p.id, content: p.content, is_error: p.isError };
      }
    }),
  }));
}

export function fromAnthropicContent(content: Anthropic.ContentBlock[]): Part[] {
  const parts: Part[] = [];
  for (const b of content) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "tool_use")
      parts.push({ type: "tool_call", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
  }
  return parts;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        // Cache the stable system prompt (voice + rules + memory) across turns.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: toAnthropicMessages(req.messages),
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.schema as Anthropic.Tool.InputSchema,
        })),
      },
      { signal: req.signal },
    );
    stream.on("text", onText);
    const msg = await stream.finalMessage();
    return {
      parts: fromAnthropicContent(msg.content),
      stop: msg.stop_reason === "tool_use" ? "tool_use" : msg.stop_reason === "max_tokens" ? "max_tokens" : "end",
    };
  }
}
