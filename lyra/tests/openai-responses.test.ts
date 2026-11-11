import { describe, expect, it } from "vitest";
import { OpenAIResponsesProvider, toResponsesInput } from "../core/providers/openai-responses.ts";
import type { Msg } from "../core/providers/types.ts";

/** A stand-in for api.openai.com that replays streamed events and records requests. */
function fakeOpenAI(replies: (Record<string, unknown>[] | { status: number; message: string })[]) {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    bodies.push(JSON.parse(String(init?.body)));
    const r = replies.shift();
    if (!r) throw new Error("no more replies");
    if (!Array.isArray(r))
      return new Response(JSON.stringify({ error: { message: r.message, type: "invalid_request_error" } }), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    const sse = r.map((ev) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join("");
    return new Response(sse, { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return { fetchFn, bodies, urls };
}

const reasoningItem = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "ENC" };

const toolTurn = [
  { type: "response.output_item.done", output_index: 0, item: reasoningItem },
  { type: "response.output_text.delta", item_id: "m1", output_index: 1, content_index: 0, delta: "Checking " },
  { type: "response.output_text.delta", item_id: "m1", output_index: 1, content_index: 0, delta: "your mail." },
  {
    type: "response.output_item.done",
    output_index: 2,
    item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "gmail__search_mail", arguments: '{"query":"from:school"}' },
  },
  { type: "response.completed", response: { id: "r1", status: "completed", output: [] } },
];

const req = {
  system: "You are Lyra.",
  messages: [{ role: "user", parts: [{ type: "text", text: "Anything from school?" }] }] as Msg[],
  tools: [{ name: "gmail__search_mail", description: "search", schema: { type: "object", properties: { query: { type: "string" } } } }],
};

describe("OpenAI Responses API", () => {
  it("sends instructions, tools and no storage, and reads text and tool calls from the stream", async () => {
    const api = fakeOpenAI([toolTurn]);
    const p = new OpenAIResponsesProvider("sk-test", "gpt-6.1-sol", api.fetchFn);
    let streamed = "";
    const r = await p.generate(req, (d) => (streamed += d));

    expect(api.urls[0]).toBe("https://api.openai.com/v1/responses");
    expect(api.bodies[0]).toMatchObject({
      model: "gpt-6.1-sol",
      instructions: "You are Lyra.",
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      input: [{ role: "user", content: "Anything from school?" }],
      tools: [{ type: "function", name: "gmail__search_mail", description: "search", strict: false }],
    });
    expect(api.bodies[0]).not.toHaveProperty("reasoning_effort");
    expect(streamed).toBe("Checking your mail.");
    expect(r.stop).toBe("tool_use");
    expect(r.parts).toEqual([
      { type: "text", text: "Checking your mail." },
      { type: "tool_call", id: "call_1", name: "gmail__search_mail", input: { query: "from:school" }, meta: { openaiReasoning: [reasoningItem] } },
    ]);
  });

  it("sends the reasoning back with its tool call and the tool's result", async () => {
    const api = fakeOpenAI([toolTurn, [{ type: "response.output_text.delta", delta: "Nothing new." }, { type: "response.completed", response: {} }]]);
    const p = new OpenAIResponsesProvider("sk-test", "gpt-6.1-sol", api.fetchFn);
    const first = await p.generate(req, () => {});
    const messages: Msg[] = [
      ...req.messages,
      { role: "assistant", parts: first.parts },
      { role: "user", parts: [{ type: "tool_result", id: "call_1", name: "gmail__search_mail", content: "0 messages" }] },
    ];
    const second = await p.generate({ ...req, messages }, () => {});
    expect(second).toEqual({ parts: [{ type: "text", text: "Nothing new." }], stop: "end" });
    expect(api.bodies[1].input).toEqual([
      { role: "user", content: "Anything from school?" },
      { role: "assistant", content: "Checking your mail." },
      reasoningItem,
      { type: "function_call", call_id: "call_1", name: "gmail__search_mail", arguments: '{"query":"from:school"}' },
      { type: "function_call_output", call_id: "call_1", output: "0 messages" },
    ]);
  });

  it("asks again without encrypted reasoning for models that don't support it", async () => {
    const api = fakeOpenAI([
      { status: 400, message: "Encrypted content is not supported with this model." },
      [{ type: "response.output_text.delta", delta: "Hi." }, { type: "response.completed", response: {} }],
      [{ type: "response.output_text.delta", delta: "Again." }, { type: "response.completed", response: {} }],
    ]);
    const p = new OpenAIResponsesProvider("sk-test", "gpt-plain", api.fetchFn);
    expect((await p.generate(req, () => {})).parts).toEqual([{ type: "text", text: "Hi." }]);
    expect(api.bodies[0]).toHaveProperty("include");
    expect(api.bodies[1]).not.toHaveProperty("include");
    await p.generate(req, () => {});
    expect(api.bodies[2]).not.toHaveProperty("include"); // remembered
  });

  it("surfaces other errors and failed responses", async () => {
    const bad = fakeOpenAI([{ status: 401, message: "Incorrect API key provided" }]);
    await expect(new OpenAIResponsesProvider("sk-bad", "m", bad.fetchFn).generate(req, () => {})).rejects.toMatchObject({ status: 401 });

    const failed = fakeOpenAI([[{ type: "response.failed", response: { error: { message: "The model had a problem." } } }]]);
    await expect(new OpenAIResponsesProvider("sk", "m2", failed.fetchFn).generate(req, () => {})).rejects.toThrow("The model had a problem.");
  });

  it("marks a reply cut off by the token limit", async () => {
    const api = fakeOpenAI([[{ type: "response.output_text.delta", delta: "Partial" }, { type: "response.incomplete", response: {} }]]);
    const r = await new OpenAIResponsesProvider("sk", "m3", api.fetchFn).generate(req, () => {});
    expect(r.stop).toBe("max_tokens");
  });

  it("maps plain conversation history", () => {
    expect(
      toResponsesInput([
        { role: "user", parts: [{ type: "text", text: "a" }] },
        { role: "assistant", parts: [{ type: "text", text: "b" }] },
      ]),
    ).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });
});
