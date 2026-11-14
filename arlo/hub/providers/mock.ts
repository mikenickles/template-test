import type { Msg, Provider, StepResult, StopReason, ToolResult, TurnRequest } from './types.ts';

export interface MockStep {
  text?: string;
  toolCalls?: { name: string; input: unknown }[];
  stop?: StopReason;
}

/** Decides what the pretend model does next, given the conversation and the latest tool results. */
export type MockScript = (state: { history: Msg[]; results: ToolResult[] | undefined; step: number; tools: string[] }) => MockStep;

/** A scripted stand-in for a model: no network, fully predictable. Used by tests and demo mode. */
export function createMock(script: MockScript, opts: { wordDelayMs?: number } = {}): Provider {
  let ids = 0;
  return {
    id: 'anthropic',
    startTurn(req: TurnRequest) {
      let step = 0;
      return {
        async step(results?: ToolResult[]): Promise<StepResult> {
          const next = script({ history: req.history, results, step: step++, tools: req.tools.map((t) => t.name) });
          const text = next.text ?? '';
          for (const word of text.split(/(?<=\s)/)) {
            if (req.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            req.onText(word);
            if (opts.wordDelayMs) await new Promise((r) => setTimeout(r, opts.wordDelayMs));
          }
          const toolCalls = (next.toolCalls ?? []).map((c) => ({ id: `mock_${++ids}`, name: c.name, input: c.input }));
          return { text, toolCalls, stop: next.stop ?? (toolCalls.length ? 'tools' : 'end'), model: 'demo' };
        },
      };
    },
    async complete() {
      return 'Earlier we talked through a few everyday things.';
    },
    async webSearch(req) {
      return { text: `Here is what I found about "${req.query}".`, sources: [{ title: 'Example', url: 'https://example.com' }] };
    },
  };
}
