import { describe, expect, it } from "vitest";
import { listModels } from "../core/providers/models.ts";

const fake = (body: unknown, seen: { url?: string; headers?: Record<string, string> } = {}, status = 200) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

describe("model lists", () => {
  it("lists Claude models newest first, with their names", async () => {
    const seen: { url?: string; headers?: Record<string, string> } = {};
    const list = await listModels({ anthropic: "sk-ant-x" }, "anthropic", fake({ data: [
      { id: "claude-old", display_name: "Claude Old", created_at: "2024-01-01T00:00:00Z" },
      { id: "claude-new", display_name: "Claude New", created_at: "2026-01-01T00:00:00Z" },
    ] }, seen));
    expect(list).toEqual([{ id: "claude-new", label: "Claude New" }, { id: "claude-old", label: "Claude Old" }]);
    expect(seen.headers?.["x-api-key"]).toBe("sk-ant-x");
  });

  it("keeps only OpenAI's chat models, but everything from your own server", async () => {
    const data = [{ id: "gpt-6-astra", created: 3 }, { id: "text-embedding-3-large", created: 9 }, { id: "gpt-image-2", created: 8 }, { id: "o4-mini", created: 2 }, { id: "whisper-1", created: 1 }];
    expect((await listModels({ openai: "sk-x" }, "openai", fake({ data }))).map((m) => m.id)).toEqual(["gpt-6-astra", "o4-mini"]);
    const seen: { url?: string } = {};
    const own = await listModels({ openaiBaseUrl: "http://192.168.1.20:11434/v1/" }, "openai", fake({ data: [{ id: "llama3" }, { id: "qwen3:30b" }] }, seen));
    expect(own.map((m) => m.id)).toEqual(["llama3", "qwen3:30b"]);
    expect(seen.url).toBe("http://192.168.1.20:11434/v1/models");
  });

  it("keeps Gemini's text models and drops the 'models/' prefix", async () => {
    const list = await listModels({ gemini: "k" }, "gemini", fake({ models: [
      { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-pro", displayName: "Gemini 3.8 Pro", supportedGenerationMethods: ["generateContent"] },
    ] }));
    expect(list).toEqual([{ id: "gemini-3.8-pro", label: "Gemini 3.8 Pro" }, { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }]);
  });

  it("says so when the key is refused, and returns nothing without a key", async () => {
    await expect(listModels({ anthropic: "bad" }, "anthropic", fake({}, {}, 401))).rejects.toThrow(/refused/);
    expect(await listModels({}, "gemini", fake({}))).toEqual([]);
  });
});
