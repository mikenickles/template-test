import { describe, expect, it } from "vitest";
import { excerptOf, splitQuote, withQuote } from "../core/quote.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateRequest } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };

describe("replying to one message", () => {
  it("carries a short quote on the first line, and reads it back", () => {
    const sent = withQuote("**Ortiz Plumbing:** Thu 8 to 10 AM,\n$95 visit", "book this one");
    expect(sent).toBe("> Ortiz Plumbing: Thu 8 to 10 AM, $95 visit\n\nbook this one");
    expect(splitQuote(sent)).toEqual({ quote: "Ortiz Plumbing: Thu 8 to 10 AM, $95 visit", text: "book this one" });
    expect(splitQuote("just a message")).toEqual({ quote: null, text: "just a message" });
    expect(splitQuote("> a quote the user typed themselves")).toMatchObject({ quote: null });
    expect(excerptOf("x".repeat(300)).length).toBe(140);
  });

  it("the model sees the quote with the message", async () => {
    const seen: GenerateRequest[] = [];
    const provider = new FakeProvider([{ parts: [{ type: "text", text: "Booked." }], stop: "end" }]);
    const generate = provider.generate.bind(provider);
    provider.generate = (req, ...rest) => (seen.push(req), generate(req, ...rest));
    const lyra = await Lyra.start(platform({ provider }));
    await lyra.chat(withQuote("Ortiz can come Thursday at 8.", "yes that one"), noop);
    const last = seen[0].messages.filter((m) => m.role === "user").at(-1)!.parts[0];
    expect(last.type === "text" && last.text).toBe("> Ortiz can come Thursday at 8.\n\nyes that one");
    expect(seen[0].system).toContain("Replies to one message");
  });
});
