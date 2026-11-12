import { describe, expect, it } from "vitest";
import { clock, LiveCall, liveSession, LIVE_MODEL } from "../core/live.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const input = (delta: string) => ({ type: "session.input_transcript.delta", delta });
const output = (delta: string) => ({ type: "session.output_transcript.delta", delta });

function call(delegate: (req: string) => Promise<string> = async () => "done") {
  const sent: Record<string, unknown>[] = [];
  const kept: [string, string][] = [];
  const c = new LiveCall({ send: (e) => sent.push(e), delegate, exchange: (u, a) => kept.push([u, a]), changed: () => {} });
  return { c, sent, kept };
}

describe("live voice call", () => {
  it("builds captions from the transcript and keeps each plain exchange", () => {
    const { c, kept } = call();
    c.handle({ type: "session.started" });
    expect(c.status).toBe("listening");
    c.handle(input("How's it "));
    c.handle(input("going?"));
    expect(c.heard).toBe("How's it going?");
    c.handle(output("Pretty good. "));
    c.handle(output("You?"));
    expect([c.status, c.said]).toEqual(["speaking", "Pretty good. You?"]);
    expect(kept).toEqual([]); // not until the exchange is over
    c.handle(input("Same."));
    expect(kept).toEqual([["How's it going?", "Pretty good. You?"]]);
    c.handle(output("Good to hear."));
    c.end();
    expect(kept[1]).toEqual(["Same.", "Good to hear."]);
    expect(c.status).toBe("ended");
  });

  it("hands delegated work to Lyra's engine and sends the answer back for that delegation", async () => {
    let release!: (v: string) => void;
    const asked: string[] = [];
    const { c, sent, kept } = call((req) => {
      asked.push(req);
      return new Promise((r) => (release = r));
    });
    c.handle({ type: "session.started" });
    c.handle(input("What's on my calendar tomorrow?"));
    c.handle(output("One sec, checking."));
    c.handle({ type: "session.delegation.created", delegation: { id: "dlg_1", target: "client", type: "delegation" } });
    expect(c.status).toBe("working");
    expect(asked).toEqual(["What's on my calendar tomorrow?"]);
    release("Dentist at 9, then lunch with Dad at 12:30.");
    await new Promise((r) => setTimeout(r));
    expect(sent).toEqual([{ type: "session.instructions.append", delegation_id: "dlg_1", content: expect.stringContaining("Dentist at 9") }]);
    expect(c.status).toBe("listening");
    c.handle(output("You've got the dentist at nine, then lunch with your dad."));
    c.handle(input("Thanks"));
    // the engine saved that exchange itself: the call doesn't save it twice
    expect(kept).toEqual([]);
  });

  it("ignores delegations it doesn't own, reports failures, and tracks billed time", async () => {
    const { c, sent } = call(async () => {
      throw new Error("Calendar isn't connected.");
    });
    c.handle({ type: "session.delegation.created", delegation: { id: "x", target: "responses" } });
    expect(sent).toEqual([]);
    c.handle(input("Check my calendar"));
    c.handle({ type: "session.delegation.created", delegation: { id: "dlg_2", target: "client" } });
    await new Promise((r) => setTimeout(r));
    expect(String(sent[0].content)).toContain("That didn't work: Calendar isn't connected.");
    c.handle({ type: "session.usage.updated", usage: { seconds: 30 } });
    c.handle({ type: "session.usage.updated", usage: { seconds: 96 } });
    c.handle({ type: "session.usage.updated", usage: { seconds: 90 } }); // cumulative: never goes back
    expect(c.seconds).toBe(96);
    expect(c.cost).toBeCloseTo(0.08);
    expect(clock(96)).toBe("1:36");
    c.handle({ type: "error", error: { message: "Bad event" } });
    expect(c.error).toBe("Bad event");
  });

  it("starts the session with Lyra's character, memory and recent chat, and keeps the key in the engine", async () => {
    const s = liveSession({ userName: "Mike", soul: "Warm and brief.", memory: "- Rowan's party is Saturday", voice: "marin", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hey Mike." }] });
    expect(s.model).toBe(LIVE_MODEL);
    expect(s.delegation).toEqual({ type: "client" });
    expect(s.audio.output.voice).toBe("marin");
    expect(s.instructions).toContain("Rowan's party is Saturday");
    expect(s.input.map((m) => m.role)).toEqual(["user", "assistant"]);

    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ session: { id: "live_1" }, transport: { type: "webrtc", sdp: "ANSWER" } }));
    }) as typeof fetch;
    const lyra = await Lyra.start(platform({ provider: new FakeProvider([say("Dentist at 9.")]), fetch: fetchFn }));
    await expect(lyra.startLive("OFFER", null)).rejects.toThrow(/OpenAI API key/);
    await lyra.saveSettings({ userName: "Mike", keys: { openai: "sk-live-test" } });
    expect(await lyra.startLive("OFFER", null)).toEqual({ id: "live_1", sdp: "ANSWER" });
    expect(calls[0].url).toBe("https://api.openai.com/v1/live/sessions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-live-test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.transport).toEqual({ type: "webrtc", sdp: "OFFER" });
    expect(body.session.model).toBe("gpt-live-1");

    // a delegated request runs as a normal turn; plain talk is saved as a voice exchange; minutes are recorded
    expect(await lyra.liveDelegate("What's tomorrow?", null)).toBe("Dentist at 9.");
    await lyra.liveExchange("Thanks", "Anytime.", null);
    expect(lyra.messages(null).map((m) => [m.role, m.content, !!m.meta.voice])).toEqual([
      ["user", "What's tomorrow?", true],
      ["assistant", "Dentist at 9.", true],
      ["user", "Thanks", true],
      ["assistant", "Anytime.", true],
    ]);
    await lyra.liveEnded(96);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    expect(lyra.usage(today, today).find((r) => r.source === "voice")).toMatchObject({ provider: "openai", model: "gpt-live-1", input: 96, requests: 1 });
  });
});
