import OpenAI from 'openai';
import type {
  Msg, Provider, SearchResult, StepResult, ToolCall, ToolResult, TurnRequest, TurnSession,
} from './types.ts';
import { ProviderError, safeId } from './types.ts';
import { SEARCH_SYSTEM } from './anthropic.ts';

type InputItem = OpenAI.Responses.ResponseInputItem;

export function toOpenAIInput(history: Msg[]): InputItem[] {
  const out: InputItem[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text });
    } else if (m.role === 'assistant') {
      if (m.text.trim()) out.push({ role: 'assistant', content: m.text });
      for (const c of m.toolCalls) {
        out.push({ type: 'function_call', call_id: safeId(c.id), name: c.name, arguments: JSON.stringify(c.input ?? {}) });
      }
    } else {
      for (const r of m.results) out.push(toOutputItem(r));
    }
  }
  return out;
}

function toOutputItem(r: ToolResult): InputItem {
  return { type: 'function_call_output', call_id: safeId(r.id), output: r.output };
}

function parseArgs(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null; // fails schema validation downstream, and the model is told why
  }
}

function wrap(err: unknown): never {
  if (err instanceof ProviderError) throw err;
  if (err instanceof OpenAI.APIUserAbortError) throw err;
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    throw new ProviderError('openai', 'auth', 'The OpenAI API key was rejected.');
  }
  if (err instanceof OpenAI.RateLimitError) {
    throw new ProviderError('openai', 'rate_limit', 'OpenAI is rate limited right now (or out of credit).');
  }
  if (err instanceof OpenAI.APIConnectionError) {
    throw new ProviderError('openai', 'network', 'Could not reach OpenAI.');
  }
  if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.NotFoundError) {
    throw new ProviderError('openai', 'bad_request', `OpenAI rejected the request: ${err.message}`);
  }
  if (err instanceof OpenAI.APIError) {
    const overloaded = typeof err.status === 'number' && err.status >= 500;
    throw new ProviderError('openai', overloaded ? 'overloaded' : 'other', `OpenAI error: ${err.message}`);
  }
  throw err;
}

export function createOpenAI(apiKey: string): Provider {
  const client = new OpenAI({ apiKey });

  function startTurn(req: TurnRequest): TurnSession {
    const input = toOpenAIInput(req.history);
    const tools: OpenAI.Responses.Tool[] = req.tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.schema,
      strict: false,
    }));

    async function step(results?: ToolResult[]): Promise<StepResult> {
      if (results) for (const r of results) input.push(toOutputItem(r));
      let response: OpenAI.Responses.Response;
      try {
        const stream = client.responses.stream(
          {
            model: req.model,
            instructions: req.system,
            input,
            tools,
            // Stateless: nothing is kept on OpenAI's side, so reasoning state is
            // carried in the transcript itself.
            store: false,
            include: ['reasoning.encrypted_content'],
            reasoning: { effort: req.effort },
          },
          { signal: req.signal },
        );
        stream.on('response.output_text.delta', (e) => req.onText(e.delta));
        response = await stream.finalResponse();
      } catch (err) {
        wrap(err);
      }

      const refused = response.output.some(
        (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
      );
      if (refused) return { text: '', toolCalls: [], stop: 'refusal', model: response.model };

      const text = response.output_text ?? '';
      const toolCalls: ToolCall[] = response.output
        .filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call')
        .map((item) => ({ id: item.call_id, name: item.name, input: parseArgs(item.arguments) }));

      if (toolCalls.length === 0) return { text, toolCalls, stop: 'end', model: response.model };
      if (response.status === 'incomplete') return { text, toolCalls: [], stop: 'length', model: response.model };

      input.push(...(response.output as InputItem[]));
      return { text, toolCalls, stop: 'tools', model: response.model };
    }

    return { step };
  }

  async function complete(req: { model: string; system: string; prompt: string; signal?: AbortSignal }): Promise<string> {
    try {
      const response = await client.responses.create(
        { model: req.model, instructions: req.system, input: req.prompt, store: false, reasoning: { effort: 'low' } },
        { signal: req.signal },
      );
      return response.output_text ?? '';
    } catch (err) {
      wrap(err);
    }
  }

  async function webSearch(req: { model: string; query: string; signal?: AbortSignal }): Promise<SearchResult> {
    try {
      const response = await client.responses.create(
        {
          model: req.model,
          instructions: SEARCH_SYSTEM,
          input: req.query,
          tools: [{ type: 'web_search' }],
          store: false,
        },
        { signal: req.signal },
      );
      const sources = new Map<string, string>();
      for (const item of response.output) {
        if (item.type !== 'message') continue;
        for (const part of item.content) {
          if (part.type !== 'output_text') continue;
          for (const a of part.annotations ?? []) {
            if (a.type === 'url_citation') sources.set(a.url, a.title || a.url);
          }
        }
      }
      return {
        text: response.output_text ?? '',
        sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
      };
    } catch (err) {
      wrap(err);
    }
  }

  return { id: 'openai', startTurn, complete, webSearch };
}
