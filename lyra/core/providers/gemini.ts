import { GoogleGenAI, type Content, type Part as GPart } from "@google/genai";
import { uniqueSources, type GenerateRequest, type GenerateResult, type ModelProvider, type Msg, type Part, type Source } from "./types.ts";

/** Models that refused Google Search next to Lyra's own tools; asked again without it. */
const noSearch = new Set<string>();

export function toGeminiContents(messages: Msg[]): Content[] {
  return messages
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: m.parts.flatMap((p): GPart[] => {
        switch (p.type) {
          case "native":
            return []; // another provider's own blocks
          case "file":
            return [{ inlineData: { mimeType: p.mediaType, data: p.data } }];
          case "text":
            return p.text ? [{ text: p.text }] : [];
          case "tool_call":
            return [
              {
                functionCall: { id: p.id, name: p.name, args: p.input },
                // Gemini rejects follow-up turns unless the call's thought signature comes back with it.
                ...(typeof p.meta?.thoughtSignature === "string" ? { thoughtSignature: p.meta.thoughtSignature } : {}),
              },
            ];
          case "tool_result":
            return [
              {
                functionResponse: {
                  id: p.id,
                  name: p.name,
                  response: p.isError ? { error: p.content } : { output: p.content },
                },
              },
            ];
        }
      }),
    }))
    .filter((c) => c.parts.length);
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
    const search = !!req.webSearch && !noSearch.has(this.model);
    let wrote = false;
    try {
      return await this.run(
        req,
        (d) => {
          wrote = true;
          onText(d);
        },
        search,
      );
    } catch (e) {
      // Some models can't mix Google Search with function tools: try once more without it.
      const err = e as { status?: number; message?: string };
      if (search && !wrote && (err.status === 400 || /search|tool/i.test(err.message ?? ""))) {
        noSearch.add(this.model);
        return this.run(req, onText, false);
      }
      throw e;
    }
  }

  private async run(req: GenerateRequest, onText: (d: string) => void, search: boolean): Promise<GenerateResult> {
    const tools: Record<string, unknown>[] = [];
    if (req.tools.length)
      tools.push({
        functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })),
      });
    if (search) tools.push({ googleSearch: {} });
    const stream = await this.ai.models.generateContentStream({
      model: this.model,
      contents: toGeminiContents(req.messages),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens ?? 2048,
        abortSignal: req.signal,
        ...(tools.length ? { tools } : {}),
      },
    });

    const all: GPart[] = [];
    let finish: string | undefined;
    const sources: Source[] = [];
    let searched = false;
    let usage: { input: number; output: number } | undefined;
    for await (const chunk of stream) {
      const um = chunk.usageMetadata;
      if (um) usage = { input: um.promptTokenCount ?? 0, output: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0) };
      const cand = chunk.candidates?.[0];
      const g = cand?.groundingMetadata;
      if (g?.webSearchQueries?.length) searched = true;
      for (const c of g?.groundingChunks ?? []) if (c.web?.uri) sources.push({ url: c.web.uri, title: c.web.title || c.web.uri });
      for (const p of cand?.content?.parts ?? []) {
        all.push(p);
        if (!p.thought && typeof p.text === "string" && p.text) onText(p.text);
      }
      if (cand?.finishReason) finish = cand.finishReason;
    }
    const parts = fromGeminiParts(all, `call_${Date.now().toString(36)}`);
    const hasCalls = parts.some((p) => p.type === "tool_call");
    return {
      parts,
      stop: hasCalls ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end",
      searched: searched || sources.length > 0,
      sources: uniqueSources(sources),
      usage,
    };
  }
}
