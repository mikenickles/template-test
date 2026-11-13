import Anthropic from "@anthropic-ai/sdk";
import { splitSystem, uniqueSources, type GenerateRequest, type GenerateResult, type ModelProvider, type Msg, type Part, type Source } from "./types.ts";

type AMessage = Anthropic.MessageParam;
type ABlock = Anthropic.ContentBlockParam;

export const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as const;

/** Phase 15: reading a whole page (only addresses already in the conversation: from search, or pasted). */
export function webFetchTool(model: string) {
  const current = /^claude-(fable|mythos|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/.test(model);
  return { type: current ? "web_fetch_20260209" : "web_fetch_20250910", name: "web_fetch", max_uses: 6, max_content_tokens: 24000 } as const;
}
/** Models that turned web fetch down: Lyra carries on without it. */
const noFetch = new Set<string>();

/**
 * The system prompt as cache-friendly blocks: the stable part (who Lyra is, Lyra's rules) is
 * cached across messages, the rest (time, tasks, memory) is cached for the tool steps of
 * one reply. Tools come before the system prompt, so they're cached with the stable part.
 */
export function systemBlocks(system: string): Anthropic.TextBlockParam[] {
  const [stable, changing] = splitSystem(system);
  const blocks: Anthropic.TextBlockParam[] = [];
  if (stable) blocks.push({ type: "text", text: stable, cache_control: { type: "ephemeral" } });
  if (changing) blocks.push({ type: "text", text: changing, cache_control: { type: "ephemeral" } });
  return blocks;
}

/** Mark the end of the conversation so a reply's later tool steps reuse it from the cache. */
export function cacheLast(messages: AMessage[]): AMessage[] {
  const last = messages.at(-1);
  if (!last || typeof last.content === "string") return messages;
  const block = last.content.at(-1) as { type?: string; cache_control?: unknown } | undefined;
  if (!block || !["text", "tool_result", "image", "document"].includes(block.type ?? "")) return messages;
  block.cache_control = { type: "ephemeral" };
  return messages;
}

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
          case "file":
            return p.mediaType === "application/pdf"
              ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data }, title: p.name }]
              : [{ type: "image", source: { type: "base64", media_type: p.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: p.data } }];
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
    else if (b.type === "server_tool_use" || b.type === "web_search_tool_result" || (b.type as string) === "web_fetch_tool_result") {
      if (b.type === "server_tool_use") searched = true;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const r of b.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
      // a page read in full: it's a source too
      const fetched = (b as { content?: { type?: string; url?: string; content?: { title?: string } } }).content;
      if ((b.type as string) === "web_fetch_tool_result" && fetched?.type === "web_fetch_result" && fetched.url?.startsWith("http"))
        sources.push({ url: fetched.url, title: fetched.content?.title || fetched.url });
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
    const fetchOn = !!req.webSearch && !noFetch.has(this.model);
    if (fetchOn) tools.push(webFetchTool(this.model) as unknown as Anthropic.ToolUnion);
    try {
      return await this.run(req, onText, tools);
    } catch (e) {
      // an older model or account without web fetch: carry on with search only
      if (fetchOn && /web_fetch/i.test(String((e as Error).message))) {
        noFetch.add(this.model);
        return this.run(req, onText, tools.filter((t) => (t as { name?: string }).name !== "web_fetch"));
      }
      throw e;
    }
  }

  private async run(req: GenerateRequest, onText: (d: string) => void, tools: Anthropic.ToolUnion[]): Promise<GenerateResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        system: systemBlocks(req.system),
        messages: cacheLast(toAnthropicMessages(req.messages)),
        tools,
      },
      { signal: req.signal },
    );
    stream.on("text", onText);
    stream.on("streamEvent", (ev) => {
      if (ev.type === "content_block_start" && ev.content_block.type === "server_tool_use")
        req.onStatus?.((ev.content_block as { name?: string }).name === "web_fetch" ? "Reading a page" : "Searching the web");
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
