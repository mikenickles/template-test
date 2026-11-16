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
    const quick = new FakeProvider([say("- Sam is planning Rowan's party for Saturday the 21st.\n- Lyra said it would find a bakery.")]);
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
    expect(last.system).toContain("Lyra said it would find a bakery");
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
