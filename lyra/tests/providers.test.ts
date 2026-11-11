import { describe, expect, it } from "vitest";
import { fromAnthropicContent, toAnthropicMessages } from "../core/providers/anthropic.ts";
import { fromGeminiParts, toGeminiContents } from "../core/providers/gemini.ts";
import { toOpenAIMessages } from "../core/providers/openai.ts";
import type { Msg } from "../core/providers/types.ts";

const convo: Msg[] = [
  { role: "user", parts: [{ type: "text", text: "Any mail from school?" }] },
  {
    role: "assistant",
    parts: [
      { type: "text", text: "Checking." },
      { type: "tool_call", id: "c1", name: "gmail__search_mail", input: { query: "from:school" }, meta: { thoughtSignature: "sig" } },
    ],
  },
  { role: "user", parts: [{ type: "tool_result", id: "c1", name: "gmail__search_mail", content: "1 message" }] },
];

describe("anthropic mapping", () => {
  it("maps calls and results to tool_use / tool_result blocks", () => {
    const out = toAnthropicMessages(convo);
    expect(out[1].content).toEqual([
      { type: "text", text: "Checking." },
      { type: "tool_use", id: "c1", name: "gmail__search_mail", input: { query: "from:school" } },
    ]);
    expect(out[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "1 message", is_error: undefined }] });
  });

  it("reads tool_use blocks back", () => {
    const { parts } = fromAnthropicContent([
      { type: "text", text: "hi", citations: null },
      { type: "tool_use", id: "x", name: "remember", input: { section: "Rules", text: "a" }, caller: { type: "direct" } },
    ] as never);
    expect(parts).toEqual([
      { type: "text", text: "hi" },
      { type: "tool_call", id: "x", name: "remember", input: { section: "Rules", text: "a" } },
    ]);
  });
});

describe("openai mapping", () => {
  it("uses a system message, tool_calls and tool role results", () => {
    const out = toOpenAIMessages("sys", convo);
    expect(out[0]).toEqual({ role: "system", content: "sys" });
    expect(out[2]).toEqual({
      role: "assistant",
      content: "Checking.",
      tool_calls: [{ id: "c1", type: "function", function: { name: "gmail__search_mail", arguments: '{"query":"from:school"}' } }],
    });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "1 message" });
    expect(out).toHaveLength(4);
  });
});

describe("gemini mapping", () => {
  it("sends thought signatures back with function calls", () => {
    const out = toGeminiContents(convo);
    expect(out[1].role).toBe("model");
    expect(out[1].parts?.[1]).toEqual({
      functionCall: { id: "c1", name: "gmail__search_mail", args: { query: "from:school" } },
      thoughtSignature: "sig",
    });
    expect(out[2].parts?.[0]).toEqual({ functionResponse: { id: "c1", name: "gmail__search_mail", response: { output: "1 message" } } });
  });

  it("joins streamed text, skips thoughts, keeps signatures", () => {
    const parts = fromGeminiParts([
      { text: "thinking", thought: true },
      { text: "Hel" },
      { text: "lo" },
      { functionCall: { name: "remember", args: { section: "Rules", text: "x" } }, thoughtSignature: "s1" },
    ]);
    expect(parts[0]).toEqual({ type: "text", text: "Hello" });
    expect(parts[1]).toMatchObject({ type: "tool_call", name: "remember", meta: { thoughtSignature: "s1" } });
  });
});
