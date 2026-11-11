import { GoogleGenAI, type Content, type Part as GPart } from "@google/genai";
import type { GenerateRequest, GenerateResult, ModelProvider, Msg, Part } from "./types.ts";

export function toGeminiContents(messages: Msg[]): Content[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.parts.map((p): GPart => {
      switch (p.type) {
        case "text":
          return { text: p.text };
        case "tool_call":
          return {
            functionCall: { id: p.id, name: p.name, args: p.input },
            // Gemini rejects follow-up turns unless the call's thought signature comes back with it.
            ...(typeof p.meta?.thoughtSignature === "string" ? { thoughtSignature: p.meta.thoughtSignature } : {}),
          };
        case "tool_result":
          return {
            functionResponse: {
              id: p.id,
              name: p.name,
              response: p.isError ? { error: p.content } : { output: p.content },
            },
          };
      }
    }),
  }));
}

export function fromGeminiParts(gparts: GPart[], idPrefix = "call"): Part[] {
  const parts: Part[] = [];
  let n = 0;
  for (const g of gparts) {
    if (g.thought) continue;
    if (g.functionCall?.name) {
      parts.push({
        type: "tool_call",
        id: g.functionCall.id || `${idPrefix}_${n++}`,
        name: g.functionCall.name,
        input: g.functionCall.args ?? {},
        ...(g.thoughtSignature ? { meta: { thoughtSignature: g.thoughtSignature } } : {}),
      });
    } else if (typeof g.text === "string" && g.text) {
      const last = parts[parts.length - 1];
      if (last?.type === "text") last.text += g.text;
      else parts.push({ type: "text", text: g.text });
    }
  }
  return parts;
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini";
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    const stream = await this.ai.models.generateContentStream({
      model: this.model,
      contents: toGeminiContents(req.messages),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens ?? 2048,
        abortSignal: req.signal,
        ...(req.tools.length
          ? {
              tools: [
                {
                  functionDeclarations: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parametersJsonSchema: t.schema,
                  })),
                },
              ],
            }
          : {}),
      },
    });

    const all: GPart[] = [];
    let finish: string | undefined;
    for await (const chunk of stream) {
      const cand = chunk.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        all.push(p);
        if (!p.thought && typeof p.text === "string" && p.text) onText(p.text);
      }
      if (cand?.finishReason) finish = cand.finishReason;
    }
    const parts = fromGeminiParts(all, `call_${Date.now().toString(36)}`);
    const hasCalls = parts.some((p) => p.type === "tool_call");
    return { parts, stop: hasCalls ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end" };
  }
}
