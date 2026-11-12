import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { fakeGoogle, memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });

describe("Lyra engine", () => {
  it("starts on the practice model until a key is added, and keeps keys out of the database", async () => {
    const stores = memStores();
    const lyra = await Lyra.start(platform({}, stores));
    expect(lyra.state().choice.provider).toBe("fake");

    const s = await lyra.saveSettings({ userName: "Sam", keys: { anthropic: "sk-ant-test" }, provider: "anthropic" });
    expect(s.choice).toEqual({ provider: "anthropic", model: "claude-haiku-5-5" });
    expect(s.keys.anthropic).toBe(true);
    expect(stores.raw.secrets.get("key.anthropic")).toBe("sk-ant-test");
    const dbBytes = Buffer.from(stores.raw.blobs.get("lyra.db")!).toString("latin1");
    expect(dbBytes).not.toContain("sk-ant-test");

    await lyra.saveSettings({ keys: { anthropic: null } });
    expect(lyra.state().choice.provider).toBe("fake");
    expect(stores.raw.secrets.has("key.anthropic")).toBe(false);
  });

  it("refuses a provider that isn't set up, and bad model names", async () => {
    const lyra = await Lyra.start(platform());
    await expect(lyra.saveSettings({ provider: "gemini" })).rejects.toThrow(/Gemini API key/);
    expect(lyra.state().accent).toBe("lime");
    expect(lyra.state().notifications).toBe(true);
    expect((await lyra.saveSettings({ notifications: false })).notifications).toBe(false);
    expect((await lyra.saveSettings({ accent: "maroon" })).accent).toBe("maroon");
    await expect(lyra.saveSettings({ accent: "chartreuse" })).rejects.toThrow(/choices/);
    await lyra.saveSettings({ keys: { gemini: "g" } });
    await expect(lyra.saveSettings({ provider: "gemini", model: "bad model!" })).rejects.toThrow(/model name/);
    await expect(lyra.saveSettings({ openaiBaseUrl: "ftp://x" })).rejects.toThrow(/http/);
  });

  it("keeps the chat and memory after a restart", async () => {
    const stores = memStores();
    const script: GenerateResult[] = [
      { parts: [{ type: "tool_call", id: "c1", name: "remember", input: { section: "People", text: "Rowan turns 7 on Nov 14" } }], stop: "tool_use" },
      say("Got it."),
    ];
    const lyra = await Lyra.start(platform({ provider: new FakeProvider(script) }, stores));
    const { message, user } = await lyra.chat("Rowan turns 7 on Nov 14", noop);
    expect(user.content).toBe("Rowan turns 7 on Nov 14");
    expect(message.meta.memory?.[0]).toMatchObject({ kind: "saved", section: "People" });
    await lyra.flush();

    const again = await Lyra.start(platform({}, stores));
    expect(again.messages().map((m) => m.content)).toEqual(["Rowan turns 7 on Nov 14", "Got it."]);
    expect(again.memoryView().sections.find((s) => s.name === "People")!.items).toEqual(["Rowan turns 7 on Nov 14"]);

    // undo from the chat note
    const m = await again.note(message.id, 0, "undo");
    expect(m.meta.memory?.[0].undone).toBe(true);
    expect(again.memoryView().sections.find((s) => s.name === "People")!.items).toEqual([]);
  });

  it("only answers one message at a time", async () => {
    let release!: () => void;
    const slow = { id: "slow", model: "slow", generate: () => new Promise<GenerateResult>((r) => (release = () => r(say("ok")))) };
    const lyra = await Lyra.start(platform({ provider: slow }));
    const first = lyra.chat("one", noop);
    await expect(lyra.chat("two", noop)).rejects.toThrow(/still answering/);
    release();
    await first;
  });

  it("connects Gmail read-only and refuses a grant that can send", async () => {
    const fetchFn = (async () => Response.json({ emailAddress: "sam@example.com" })) as typeof fetch;
    const lyra = await Lyra.start(platform({ fetch: fetchFn }));
    const s = await lyra.connectGmail();
    expect(s.connectors[0]).toMatchObject({ state: "connected", account: "sam@example.com" });
    await lyra.disconnectGmail();
    expect(lyra.state().connectors[0].state).toBe("not_connected");

    const greedy = await Lyra.start(
      platform({ fetch: fetchFn, google: fakeGoogle(["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]) }),
    );
    await expect(greedy.connectGmail()).rejects.toThrow(/read-only/);
    expect(greedy.state().connectors[0].state).toBe("not_connected");
  });

  it("says Gmail needs the Android app when sign-in isn't available", async () => {
    const lyra = await Lyra.start(platform({ google: { available: false, authorize: async () => Promise.reject(new Error("no")) } }));
    expect(lyra.state().connectors[0].state).toBe("unavailable");
    await expect(lyra.connectGmail()).rejects.toThrow(/Android app/);
  });
});
