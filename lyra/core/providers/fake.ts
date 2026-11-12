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
    // Practice has no real tokens: estimate at four characters each, so the Usage page has something to show.
    if (!result.usage) {
      const chars = (parts: Part[]) => parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : JSON.stringify(p).length), 0);
      result.usage = { input: Math.ceil((req.system.length + req.messages.reduce((n, m) => n + chars(m.parts), 0)) / 4), output: Math.ceil(chars(result.parts) / 4) };
    }
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
      if (result.name === "react") return { parts: [], stop: "end" };
      if (result.name === "set_reminder") return say("Okay, I'll remind you.");
      if (result.name === "suggest_replies") return say("Here are a couple of next steps.");
      if (result.name === "forget") return say("Done, that's gone.");
      if (result.name === "propose_email" || result.name === "propose_event") return say("It's ready for you to check.");
      return say(`Here's what I found.\n\n${result.content.replace(/<\/?untrusted_data[^>]*>/g, "").trim().slice(0, 400)}`);
    }

    const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
    const files = last?.parts.flatMap((p) => (p.type === "file" ? [p.name] : [])) ?? [];
    if (files.length) return say(`Got ${files.length === 1 ? "it" : "them"}: ${files.join(", ")}.\n\nThe practice model can't look inside. Add an API key in Settings and I'll read it properly.`);
    if (/^(thanks|thank you|thx|ty)\b/i.test(text.trim()) && has("react")) return call("react", { emoji: "❤️" });
    // "remind me in 5 minutes to stretch": the practice model can set reminders
    const remind = text.match(/^remind me in (\d+) min(?:ute)?s? to (.+)$/i);
    if (remind && has("set_reminder")) {
      const at = new Date(Date.now() + Number(remind[1]) * 60_000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      return call("set_reminder", { text: remind[2], at: `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())} ${p2(at.getHours())}:${p2(at.getMinutes())}` });
    }
    if (/^what('s| is) next/i.test(text) && has("suggest_replies")) return call("suggest_replies", { options: ["Add it to my tasks", "Remind me Friday"] });
    const rem = text.match(/^remember(?: that)?[:\s]+(.+)$/i);
    if (rem && has("remember")) return call("remember", { section: "Open loops", text: rem[1] });
    const forget = text.match(/^forget[:\s]+(.+)$/i);
    if (forget && has("forget")) return call("forget", { section: "Open loops", match: forget[1] });
    // "email dana@example.com saying yes to Friday": the practice model can propose an email (the user still taps Send)
    const mail = text.match(/^e-?mail (\S+@\S+) saying (.+)$/i);
    if (mail && has("propose_email")) return call("propose_email", { to: [mail[1]], subject: "Quick note", body: mail[2] });
    if (/\b(e-?mail|inbox|mail)\b/i.test(text) && has("gmail__search_mail"))
      return call("gmail__search_mail", { query: "newer_than:7d", max_results: 5 });
    return say(
      "I'm running on the practice model, so I can't really think yet.\n\nAdd an API key in Settings and pick a model there.",
    );
  }
}
