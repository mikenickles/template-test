import type { GenerateRequest, GenerateResult, ModelProvider, Part } from "./types.ts";

/**
 * A model stand-in with no API key, for tests and for clicking around the app offline.
 * Give it a script of results to replay, or let it follow a few simple rules.
 */
export class FakeProvider implements ModelProvider {
  readonly id = "fake";
  readonly model = "fake";
  readonly requests: GenerateRequest[] = [];

  constructor(private script: GenerateResult[] = []) {}

  async generate(req: GenerateRequest, onText: (d: string) => void): Promise<GenerateResult> {
    this.requests.push({ ...req, messages: structuredClone(req.messages) });
    const result = this.script.length ? this.script.shift()! : this.rules(req);
    for (const p of result.parts) {
      if (p.type !== "text") continue;
      for (const word of p.text.split(/(?<= )/)) onText(word);
    }
    return result;
  }

  private rules(req: GenerateRequest): GenerateResult {
    const last = req.messages[req.messages.length - 1];
    const has = (name: string) => req.tools.some((t) => t.name === name);
    const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
    const call = (name: string, input: Record<string, unknown>): GenerateResult => ({
      parts: [{ type: "tool_call", id: `fake_${Date.now().toString(36)}`, name, input } as Part],
      stop: "tool_use",
    });

    const result = last?.parts.find((p) => p.type === "tool_result");
    if (result && result.type === "tool_result") {
      if (result.isError) return say(`That didn't work: ${result.content.slice(0, 160)}`);
      if (result.name === "remember") return say("Got it.");
      if (result.name === "forget") return say("Done, that's gone.");
      return say(`Here's what I found.\n\n${result.content.replace(/<\/?untrusted_data[^>]*>/g, "").trim().slice(0, 400)}`);
    }

    const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
    const rem = text.match(/^remember(?: that)?[:\s]+(.+)$/i);
    if (rem && has("remember")) return call("remember", { section: "Open loops", text: rem[1] });
    const forget = text.match(/^forget[:\s]+(.+)$/i);
    if (forget && has("forget")) return call("forget", { section: "Open loops", match: forget[1] });
    if (/\b(e-?mail|inbox|mail)\b/i.test(text) && has("gmail__search_mail"))
      return call("gmail__search_mail", { query: "newer_than:7d", max_results: 5 });
    return say(
      "I'm running on the practice model, so I can't really think yet.\n\nAdd an API key in .env and pick a provider in Settings.",
    );
  }
}
