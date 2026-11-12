import OpenAI from "openai";
import { uniqueSources, type GenerateRequest, type GenerateResult, type ModelProvider, type Msg, type Part, type Source } from "./types.ts";

/**
 * OpenAI through the Responses API. Newer OpenAI models (the reasoning
 * ones) only accept tools here, not in Chat Completions.
 *
 * Nothing is stored on OpenAI's side (store: false). For reasoning models
 * the model's private reasoning comes back encrypted and is sent back with
 * its tool calls, so a multi-step answer keeps its train of thought.
 */

type Item = OpenAI.Responses.ResponseInputItem;
type Reasoning = OpenAI.Responses.ResponseReasoningItem;

export function toResponsesInput(messages: Msg[]): Item[] {
  const out: Item[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") {
        if (p.text) out.push({ role: m.role, content: p.text });
      } else if (p.type === "tool_call") {
        const reasoning = p.meta?.openaiReasoning as Reasoning[] | undefined;
        if (reasoning) out.push(...reasoning);
        out.push({ type: "function_call", call_id: p.id, name: p.name, arguments: JSON.stringify(p.input) });
      } else if (p.type === "tool_result") {
        out.push({ type: "function_call_output", call_id: p.id, output: p.content });
      }
      // "native" parts (another provider's own blocks) have no meaning here and are left out
    }
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Models that refused encrypted reasoning (non-reasoning models); asked again without it. */
const noEncrypted = new Set<string>();
/** Models that refused the web search tool; asked again without it. */
const noSearch = new Set<string>();

export class OpenAIResponsesProvider implements ModelProvider {
  readonly id = "openai";
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    fetchFn?: typeof fetch,
  ) {
    // The key is the user's own, kept in the phone's encrypted storage and sent only to OpenAI.
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, ...(fetchFn ? { fetch: fetchFn } : {}) });
  }

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.run(req, onText, !noEncrypted.has(this.model), !!req.webSearch && !noSearch.has(this.model));
      } catch (e) {
        const err = e as { status?: number; message?: string };
        const msg = err.message ?? "";
        if (err.status !== 400 || attempt > 1) throw e;
        if (/encrypt|reasoning|include/i.test(msg) && !noEncrypted.has(this.model)) noEncrypted.add(this.model);
        else if (/web_search|web search/i.test(msg) && req.webSearch && !noSearch.has(this.model)) noSearch.add(this.model);
        else throw e;
      }
    }
  }

  private async run(req: GenerateRequest, onText: (d: string) => void, encrypted: boolean, search: boolean): Promise<GenerateResult> {
    const tools: OpenAI.Responses.Tool[] = req.tools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.schema,
      strict: false,
    }));
    if (search) tools.push({ type: "web_search" } as OpenAI.Responses.Tool);
    const stream = await this.client.responses.create(
      {
        model: this.model,
        instructions: req.system,
        input: toResponsesInput(req.messages),
        store: false,
        stream: true,
        // reasoning models spend part of this budget thinking
        max_output_tokens: Math.max(req.maxTokens ?? 0, 8000),
        ...(encrypted ? { include: ["reasoning.encrypted_content" as const] } : {}),
        ...(tools.length ? { tools } : {}),
      },
      { signal: req.signal },
    );

    let text = "";
    const calls: Extract<Part, { type: "tool_call" }>[] = [];
    let reasoning: Reasoning[] = [];
    let stop: GenerateResult["stop"] = "end";
    const sources: Source[] = [];
    let searched = false;
    let usage: GenerateResult["usage"];

    for await (const ev of stream) {
      switch (ev.type) {
        case "response.completed":
          if (ev.response.usage) usage = { input: ev.response.usage.input_tokens ?? 0, output: ev.response.usage.output_tokens ?? 0 };
          break;
        case "response.output_text.delta":
          text += ev.delta;
          onText(ev.delta);
          break;
        case "response.output_item.added":
          if (ev.item.type === "web_search_call") {
            searched = true;
            req.onStatus?.("Searching the web");
          }
          break;
        case "response.output_item.done": {
          const item = ev.item;
          if (item.type === "web_search_call") searched = true;
          else if (item.type === "message") {
            for (const c of item.content)
              if (c.type === "output_text") for (const a of c.annotations ?? []) if (a.type === "url_citation") sources.push({ url: a.url, title: a.title || a.url });
          } else if (item.type === "reasoning") reasoning.push(item);
          else if (item.type === "function_call") {
            calls.push({
              type: "tool_call",
              id: item.call_id,
              name: item.name,
              input: parseArgs(item.arguments),
              // reasoning that led to this call goes back with it
              ...(reasoning.length ? { meta: { openaiReasoning: reasoning } } : {}),
            });
            reasoning = [];
          }
          break;
        }
        case "response.incomplete":
          stop = "max_tokens";
          if (ev.response.usage) usage = { input: ev.response.usage.input_tokens ?? 0, output: ev.response.usage.output_tokens ?? 0 };
          break;
        case "response.failed":
          throw new Error(ev.response.error?.message ?? "OpenAI couldn't finish the reply.");
        case "error":
          throw new Error(ev.message);
      }
    }

    const parts: Part[] = [];
    if (text) parts.push({ type: "text", text });
    parts.push(...calls);
    return { parts, stop: calls.length ? "tool_use" : stop, searched, sources: uniqueSources(sources), usage };
  }
}
