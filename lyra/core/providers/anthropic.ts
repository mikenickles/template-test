import Anthropic from "@anthropic-ai/sdk";
import { uniqueSources, type GenerateRequest, type GenerateResult, type ModelProvider, type Msg, type Part, type Source } from "./types.ts";

type AMessage = Anthropic.MessageParam;
type ABlock = Anthropic.ContentBlockParam;

export const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as const;

export function toAnthropicMessages(messages: Msg[]): AMessage[] {
  return messages
    .map((m) => ({
      role: m.role,
      content: m.parts.flatMap((p): ABlock[] => {
        switch (p.type) {
          case "text":
            return p.text ? [{ type: "text", text: p.text }] : [];
          case "tool_call":
            return [{ type: "tool_use", id: p.id, name: p.name, input: p.input }];
          case "tool_result":
            return [{ type: "tool_result", tool_use_id: p.id, content: p.content, is_error: p.isError }];
          case "native":
            // Claude's own web search blocks go back exactly as they came; other providers' are dropped.
            return p.provider === "anthropic" ? [p.block as ABlock] : [];
        }
      }),
    }))
    .filter((m) => m.content.length);
}

export function fromAnthropicContent(content: Anthropic.ContentBlock[]): { parts: Part[]; sources: Source[]; searched: boolean } {
  const parts: Part[] = [];
  const sources: Source[] = [];
  let searched = false;
  for (const b of content) {
    if (b.type === "text") {
      parts.push({ type: "text", text: b.text });
      for (const c of b.citations ?? []) if (c.type === "web_search_result_location") sources.push({ url: c.url, title: c.title ?? c.url });
    } else if (b.type === "tool_use") parts.push({ type: "tool_call", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
    else if (b.type === "server_tool_use" || b.type === "web_search_tool_result") {
      if (b.type === "server_tool_use") searched = true;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const r of b.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
      // keep only what the API accepts back as input
      const { caller: _caller, ...block } = b as typeof b & { caller?: unknown };
      parts.push({ type: "native", provider: "anthropic", block });
    }
  }
  return { parts, sources: uniqueSources(sources), searched };
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    fetchFn?: typeof fetch,
  ) {
    // The key is the user's own, kept in the phone's encrypted storage and sent only to Anthropic.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, ...(fetchFn ? { fetch: fetchFn } : {}) });
  }

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    const tools: Anthropic.ToolUnion[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema as Anthropic.Tool.InputSchema,
    }));
    if (req.webSearch) tools.push(WEB_SEARCH_TOOL as unknown as Anthropic.ToolUnion);
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        // Cache the stable system prompt (voice + rules + memory) across turns.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: toAnthropicMessages(req.messages),
        tools,
      },
      { signal: req.signal },
    );
    stream.on("text", onText);
    stream.on("streamEvent", (ev) => {
      if (ev.type === "content_block_start" && ev.content_block.type === "server_tool_use") req.onStatus?.("Searching the web");
    });
    const msg = await stream.finalMessage();
    const { parts, sources, searched } = fromAnthropicContent(msg.content);
    const r = msg.stop_reason;
    const u = msg.usage;
    return {
      parts,
      sources,
      searched,
      usage: { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 },
      stop: r === "tool_use" ? "tool_use" : r === "max_tokens" ? "max_tokens" : r === "pause_turn" ? "pause" : "end",
    };
  }
}
