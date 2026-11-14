import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import type {
  Msg, Provider, SearchResult, StepResult, ToolCall, ToolResult, TurnRequest, TurnSession,
} from './types.ts';
import { ProviderError } from './types.ts';
import { SEARCH_SYSTEM } from './anthropic.ts';

export function toGeminiContents(history: Msg[]): Content[] {
  const out: Content[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', parts: [{ text: m.text }] });
    } else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.text.trim()) parts.push({ text: m.text });
      for (const c of m.toolCalls) {
        parts.push({ functionCall: { id: c.id, name: c.name, args: (c.input ?? {}) as Record<string, unknown> } });
      }
      if (parts.length) out.push({ role: 'model', parts });
    } else {
      out.push({ role: 'user', parts: m.results.map(toResponsePart) });
    }
  }
  return out;
}

function toResponsePart(r: ToolResult): Part {
  return {
    functionResponse: {
      id: r.id,
      name: r.name,
      response: r.isError ? { error: r.output } : { output: r.output },
    },
  };
}

function wrap(err: unknown, signal?: AbortSignal): never {
  if (err instanceof ProviderError || signal?.aborted) throw err;
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      throw new ProviderError('gemini', 'auth', 'The Gemini API key was rejected.');
    }
    if (err.status === 429) throw new ProviderError('gemini', 'rate_limit', 'Gemini is rate limited right now.');
    if (err.status >= 500) throw new ProviderError('gemini', 'overloaded', 'Gemini is having trouble right now.');
    // Gemini reports a bad key as a 400 with a recognisable status, not a 401.
    const badKey = err.status === 400 && err.message.includes('API_KEY_INVALID');
    throw new ProviderError('gemini', badKey ? 'auth' : 'bad_request', badKey ? 'The Gemini API key was rejected.' : `Gemini rejected the request: ${err.message}`);
  }
  if (err instanceof TypeError) throw new ProviderError('gemini', 'network', 'Could not reach Gemini.');
  throw err;
}

const BLOCKED = new Set<string>([
  FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION,
]);

export function createGemini(apiKey: string): Provider {
  const ai = new GoogleGenAI({ apiKey });

  function startTurn(req: TurnRequest): TurnSession {
    const contents = toGeminiContents(req.history);
    const tools = req.tools.length
      ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }]
      : undefined;
    let counter = 0;

    async function step(results?: ToolResult[]): Promise<StepResult> {
      if (results?.length) contents.push({ role: 'user', parts: results.map(toResponsePart) });
      // Every part the model returns is kept exactly as it arrived (including
      // thought signatures) and sent back untouched on the next step.
      const parts: Part[] = [];
      let finish: string | undefined;
      let blocked = false;
      try {
        const stream = await ai.models.generateContentStream({
          model: req.model,
          contents,
          config: { systemInstruction: req.system, tools, abortSignal: req.signal },
        });
        for await (const chunk of stream) {
          if (chunk.promptFeedback?.blockReason) blocked = true;
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) finish = candidate.finishReason;
          for (const part of candidate?.content?.parts ?? []) {
            parts.push(part);
            if (part.text && !part.thought) req.onText(part.text);
          }
        }
      } catch (err) {
        wrap(err, req.signal);
      }

      if (blocked || (finish && BLOCKED.has(finish))) {
        return { text: '', toolCalls: [], stop: 'refusal', model: req.model };
      }

      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      const toolCalls: ToolCall[] = [];
      for (const part of parts) {
        if (!part.functionCall?.name) continue;
        // Older models do not send ids; give the call one and keep it on the part.
        part.functionCall.id ??= `gem_${Date.now().toString(36)}_${counter++}`;
        toolCalls.push({ id: part.functionCall.id, name: part.functionCall.name, input: part.functionCall.args ?? {} });
      }

      if (toolCalls.length === 0) return { text, toolCalls, stop: 'end', model: req.model };
      if (finish === FinishReason.MAX_TOKENS) return { text, toolCalls: [], stop: 'length', model: req.model };

      contents.push({ role: 'model', parts });
      return { text, toolCalls, stop: 'tools', model: req.model };
    }

    return { step };
  }

  async function complete(req: { model: string; system: string; prompt: string; signal?: AbortSignal }): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: { systemInstruction: req.system, abortSignal: req.signal },
      });
      return response.text ?? '';
    } catch (err) {
      wrap(err, req.signal);
    }
  }

  async function webSearch(req: { model: string; query: string; signal?: AbortSignal }): Promise<SearchResult> {
    try {
      const response = await ai.models.generateContent({
        model: req.model,
        contents: req.query,
        config: { systemInstruction: SEARCH_SYSTEM, tools: [{ googleSearch: {} }], abortSignal: req.signal },
      });
      const sources = new Map<string, string>();
      for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        if (chunk.web?.uri) sources.set(chunk.web.uri, chunk.web.title || chunk.web.uri);
      }
      return {
        text: response.text ?? '',
        sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
      };
    } catch (err) {
      wrap(err, req.signal);
    }
  }

  return { id: 'gemini', startTurn, complete, webSearch };
}
