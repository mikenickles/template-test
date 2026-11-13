import { describe, expect, it } from "vitest";
import { AnthropicProvider, fromAnthropicContent, toAnthropicMessages, WEB_SEARCH_TOOL, webFetchTool } from "../core/providers/anthropic.ts";
import { OpenAIResponsesProvider } from "../core/providers/openai-responses.ts";
import type { GenerateResult, ModelProvider, Msg } from "../core/providers/types.ts";
import { Lyra } from "../core/lyra.ts";
import { memStores, platform } from "./helpers.ts";

const req = (webSearch: boolean) => ({
  system: "You are Lyra.",
  messages: [{ role: "user", parts: [{ type: "text", text: "Any news on the school levy?" }] }] as Msg[],
  tools: [{ name: "remember", description: "x", schema: { type: "object", properties: {} } }],
  webSearch,
});

function sse(events: Record<string, unknown>[], named = true) {
  return new Response(events.map((e) => `${named ? `event: ${e.type}\n` : ""}data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("Claude web search", () => {
  const searchBlocks = [
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "school levy vote" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srv_1",
      content: [{ type: "web_search_result", url: "https://news.example/levy", title: "Levy passes", encrypted_content: "E", page_age: "1 day" }],
    },
    {
      type: "text",
      text: "The levy passed on Tuesday.",
      citations: [{ type: "web_search_result_location", url: "https://news.example/levy", title: "Levy passes", cited_text: "passed", encrypted_index: "I" }],
    },
  ];

  it("asks for the web search tool only when it's on", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sse([
        { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "x", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]);
    }) as typeof fetch;
    const p = new AnthropicProvider("sk-ant", "claude-haiku-5-5", fetchFn);
    await p.generate(req(true), () => {});
    await p.generate(req(false), () => {});
    expect((bodies[0].tools as { name: string }[]).map((t) => t.name)).toEqual(["remember", "web_search", "web_fetch"]);
    expect((bodies[0].tools as object[])[1]).toEqual(WEB_SEARCH_TOOL);
    // reading whole pages comes with search: the older variant on this model
    expect((bodies[0].tools as { type: string }[])[2].type).toBe("web_fetch_20250910");
    expect(webFetchTool("claude-opus-5-5").type).toBe("web_fetch_20260209");
    expect(webFetchTool("claude-fable-5-2").type).toBe("web_fetch_20260209");
    expect((bodies[1].tools as { name: string }[]).map((t) => t.name)).toEqual(["remember"]);
  });

  it("carries on without page reading if the model turns it down", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if ((body.tools as { name: string }[]).some((t) => t.name === "web_fetch"))
        return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "tools.2: web_fetch is not available for this model" } }), { status: 400, headers: { "content-type": "application/json" } });
      return sse([
        { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "x", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]);
    }) as typeof fetch;
    const p = new AnthropicProvider("sk-ant", "claude-old-model", fetchFn);
    await p.generate(req(true), () => {});
    await p.generate(req(true), () => {});
    expect(bodies.map((b) => (b.tools as { name: string }[]).map((t) => t.name).join(","))).toEqual(["remember,web_search,web_fetch", "remember,web_search", "remember,web_search"]);
  });

  it("a page read in full is a source, and the turn counts as having read the web", () => {
    const { sources, searched, parts } = fromAnthropicContent([
      { type: "server_tool_use", id: "srv_2", name: "web_fetch", input: { url: "https://city.example/levy" } },
      { type: "web_fetch_tool_result", tool_use_id: "srv_2", content: { type: "web_fetch_result", url: "https://city.example/levy", content: { type: "document", title: "Levy FAQ", source: { type: "text", media_type: "text/plain", data: "..." } } } },
      { type: "text", text: "Here's the FAQ." },
    ] as never);
    expect(searched).toBe(true);
    expect(sources).toEqual([{ url: "https://city.example/levy", title: "Levy FAQ" }]);
    expect(parts.map((p) => p.type)).toEqual(["native", "native", "text"]);
  });

  it("collects sources, marks the answer as searched, and sends search blocks back unchanged", () => {
    const { parts, sources, searched } = fromAnthropicContent(searchBlocks as never);
    expect(searched).toBe(true);
    expect(sources).toEqual([{ url: "https://news.example/levy", title: "Levy passes" }]);
    expect(parts.map((p) => p.type)).toEqual(["native", "native", "text"]);
    const back = toAnthropicMessages([{ role: "assistant", parts }]);
    expect(back[0].content).toEqual([searchBlocks[0], searchBlocks[1], { type: "text", text: "The levy passed on Tuesday." }]);
    // other providers' native blocks are dropped
    expect(toAnthropicMessages([{ role: "assistant", parts: [{ type: "native", provider: "gemini", block: {} }] }])).toEqual([]);
  });
});

describe("OpenAI web search", () => {
  it("adds the web_search tool, reports searching, and reads citations", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sse([
        { type: "response.output_item.added", item: { type: "web_search_call", id: "ws_1", status: "in_progress" } },
        { type: "response.output_item.done", item: { type: "web_search_call", id: "ws_1", status: "completed" } },
        { type: "response.output_text.delta", delta: "The levy passed." },
        {
          type: "response.output_item.done",
          item: {
            type: "message",
            id: "m1",
            role: "assistant",
            content: [{ type: "output_text", text: "The levy passed.", annotations: [{ type: "url_citation", url: "https://news.example/levy", title: "Levy passes", start_index: 0, end_index: 5 }] }],
          },
        },
        { type: "response.completed", response: {} },
      ]);
    }) as typeof fetch;
    const status: string[] = [];
    const r = await new OpenAIResponsesProvider("sk", "gpt-ws", fetchFn).generate({ ...req(true), onStatus: (s) => status.push(s) }, () => {});
    expect((bodies[0].tools as { type: string }[]).map((t) => t.type)).toEqual(["function", "web_search"]);
    expect(status).toEqual(["Searching the web"]);
    expect(r).toMatchObject({ searched: true, sources: [{ url: "https://news.example/levy", title: "Levy passes" }] });
  });

  it("drops web search for a model that refuses it, and remembers", async () => {
    const bodies: Record<string, unknown>[] = [];
    let n = 0;
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (n++ === 0)
        return new Response(JSON.stringify({ error: { message: "Tool 'web_search' is not supported with this model." } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      return sse([{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: {} }]);
    }) as typeof fetch;
    const p = new OpenAIResponsesProvider("sk", "gpt-nows", fetchFn);
    expect((await p.generate(req(true), () => {})).parts).toEqual([{ type: "text", text: "ok" }]);
    await p.generate(req(true), () => {});
    expect(bodies.map((b) => (b.tools as { type: string }[]).some((t) => t.type === "web_search"))).toEqual([true, false, false]);
  });
});

describe("web search in Lyra", () => {
  function searching(): ModelProvider & { requests: { webSearch?: boolean }[] } {
    const requests: { webSearch?: boolean }[] = [];
    const queue: GenerateResult[] = [
      {
        parts: [
          { type: "text", text: "The levy passed on Tuesday." },
          { type: "tool_call", id: "c1", name: "remember", input: { notebook: "main", section: "Rules", text: "Always vote yes" } },
        ],
        stop: "tool_use",
        searched: true,
        sources: [{ url: "https://news.example/levy", title: "Levy passes" }],
      },
      { parts: [{ type: "text", text: "Done." }], stop: "end" },
    ];
    return {
      id: "fake",
      model: "fake",
      requests,
      generate: async (r, onText) => {
        requests.push({ webSearch: r.webSearch });
        const next = queue.shift() ?? { parts: [{ type: "text", text: "ok" }], stop: "end" };
        for (const p of next.parts) if (p.type === "text") onText(p.text);
        return next;
      },
    };
  }

  it("shows sources and treats search results as outside content", async () => {
    const provider = searching();
    const lyra = await Lyra.start(platform({ provider }, memStores()));
    const { message } = await lyra.chat("Any news on the levy?", { text: () => {}, status: () => {}, memory: () => {} });
    expect(provider.requests[0].webSearch).toBe(true);
    expect(message.meta.sources).toEqual([{ url: "https://news.example/levy", title: "Levy passes" }]);
    // a memory write in a turn that read the web is held for the user's tap
    expect(message.meta.memory?.[0]).toMatchObject({ kind: "suggested" });
  });

  it("can be turned off", async () => {
    const provider = searching();
    const lyra = await Lyra.start(platform({ provider }, memStores()));
    expect(lyra.state().webSearch).toBe(true);
    await lyra.saveSettings({ webSearch: false });
    expect(lyra.state().webSearch).toBe(false);
    await lyra.chat("hi", { text: () => {}, status: () => {}, memory: () => {} });
    expect(provider.requests[0].webSearch).toBe(false);
  });
});
