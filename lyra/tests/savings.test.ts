import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });

describe("long chats keep a running summary (0.53)", () => {
  it("folds older messages into a summary, then sends the summary and only the newer messages", async () => {
    const main = new FakeProvider(Array.from({ length: 30 }, (_, i) => say(`Answer ${i}`)));
    const quick = new FakeProvider([say("- Sam is planning Rowan's party for Saturday the 21st.\n- Tomo said it would find a bakery.")]);
    const lyra = await Lyra.start(platform({ provider: main, quickProvider: quick }));
    // 14 exchanges = 28 messages: 16 older ones past the 12 newest
    for (let i = 0; i < 14; i++) await lyra.chat(`Message ${i} about the party`, noop);
    await new Promise((r) => setTimeout(r, 20));
    expect(quick.requests).toHaveLength(1);
    expect(quick.requests[0].messages[0].parts[0].type === "text" && quick.requests[0].messages[0].parts[0].text).toContain("Message 0 about the party");
    const s = lyra.chatSummary(null)!;
    expect(s.text).toContain("Rowan's party");
    // the next reply: the summary is in the system prompt, and the old messages aren't sent
    await lyra.chat("what's left?", noop);
    const last = main.requests.at(-1)!;
    expect(last.system).toContain("## Earlier in this chat");
    expect(last.system).toContain("Tomo said it would find a bakery");
    const sent = JSON.stringify(last.messages);
    expect(sent).not.toContain("Message 0 about the party");
    expect(sent).toContain("Message 13 about the party");
    expect(last.messages.length).toBeLessThanOrEqual(14);
  });

  it("short chats are left alone, and the practice model never summarizes", async () => {
    const quick = new FakeProvider([]);
    const lyra = await Lyra.start(platform({ provider: new FakeProvider([]), quickProvider: quick }));
    for (let i = 0; i < 5; i++) await lyra.chat(`hello ${i}`, noop);
    expect(await lyra.summarizeChat(null)).toBe(false);
    const practice = await Lyra.start(platform({ provider: new FakeProvider([]) }));
    for (let i = 0; i < 15; i++) await practice.chat(`hello ${i}`, noop);
    expect(await practice.summarizeChat(null)).toBe(false);
    expect(quick.requests).toHaveLength(0);
  });
});

describe("tools on demand (0.53.1)", () => {
  it("rarer tools are named in more_tools, and loading one adds it for the rest of the reply", async () => {
    const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
    const p = new FakeProvider([call("more_tools", { names: ["create_routine", "nope"] }), say("Which days?")]);
    const lyra = await Lyra.start(platform({ provider: p }));
    await lyra.chat("check the school mail every friday", noop);
    const first = p.requests[0].tools.map((t) => t.name);
    expect(first).not.toContain("create_routine");
    expect(first).not.toContain("make_dashboard");
    expect(first).toContain("set_reminder");
    expect(p.requests[0].tools.find((t) => t.name === "more_tools")!.description).toMatch(/^- create_routine: /m);
    expect(p.requests[1].tools.map((t) => t.name)).toContain("create_routine");
    const told = p.requests[1].messages.at(-1)!.parts[0];
    expect(told.type === "tool_result" && told.content).toMatch(/^Ready: create_routine\. Call it now\. Not available: nope\./);
    // the same tools go out with every message, so the provider's cache holds
    await lyra.chat("thanks", noop);
    expect(p.requests.at(-1)!.tools.map((t) => t.name)).toEqual(first);
  });

  it("the practice model loads a tool before using it", async () => {
    const lyra = await Lyra.start(platform());
    const { message } = await lyra.chat("make a dashboard called Spending", noop);
    expect(message.meta.docs?.[0]).toMatchObject({ kind: "dashboard", title: "Spending" });
  });
});
