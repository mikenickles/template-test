import OpenAI from "openai";
import type { GenerateRequest, GenerateResult, ModelProvider, Msg, Part } from "./types.ts";

type OMessage = OpenAI.Chat.ChatCompletionMessageParam;

export function toOpenAIMessages(system: string, messages: Msg[]): OMessage[] {
  const out: OMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
    if (m.role === "assistant") {
      const calls = m.parts.flatMap((p) =>
        p.type === "tool_call"
          ? [{ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input) } }]
          : [],
      );
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // other providers' "native" parts are skipped
      for (const p of m.parts) if (p.type === "tool_result") out.push({ role: "tool", tool_call_id: p.id, content: p.content });
      if (text) out.push({ role: "user", content: text });
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

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  private client: OpenAI;

  /** baseURL lets this adapter talk to any OpenAI-compatible server, including local ones (Ollama, LM Studio). */
  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    // The key is the user's own, kept in the phone's encrypted storage and sent only to this API.
    this.client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  }

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: req.maxTokens ?? 2048,
        messages: toOpenAIMessages(req.system, req.messages),
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.schema },
              })),
            }
          : {}),
      },
      { signal: req.signal },
    );

    let text = "";
    let finish: string | null = null;
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let usage: GenerateResult["usage"];
    for await (const chunk of stream) {
      if (chunk.usage) usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
      const choice = chunk.choices[0];
      if (!choice) continue;
      const d = choice.delta;
      if (d?.content) {
        text += d.content;
        onText(d.content);
      }
      for (const tc of d?.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(tc.index, cur);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }

    const parts: Part[] = [];
    if (text) parts.push({ type: "text", text });
    for (const [i, c] of [...calls.entries()].sort((a, b) => a[0] - b[0]))
      parts.push({ type: "tool_call", id: c.id || `call_${i}`, name: c.name, input: parseArgs(c.args) });
    const stop = calls.size ? "tool_use" : finish === "length" ? "max_tokens" : "end";
    return { parts, stop, usage };
  }
}
