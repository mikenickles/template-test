import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const lastUserText = (req: GenerateRequest) =>
  req.messages
    .filter((m) => m.role === "user")
    .at(-1)!
    .parts.map((p) => (p.type === "text" ? p.text : ""))
    .join("|");

/** A model you drive by hand: each call waits until you say what it writes. */
function manual() {
  const calls: { req: GenerateRequest; write: (d: string) => void; finish: (r: GenerateResult) => void }[] = [];
  let arrived: () => void = () => {};
  const provider: ModelProvider = {
    id: "claude",
    model: "claude-test",
    generate: (req, onText) =>
      new Promise<GenerateResult>((resolve, reject) => {
        req.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        calls.push({ req: { ...req, messages: structuredClone(req.messages) }, write: onText, finish: resolve });
        arrived();
      }),
  };
  const next = (n: number) => new Promise<void>((r) => (calls.length >= n ? r() : (arrived = () => calls.length >= n && r())));
  return { provider, calls, next };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("back-to-back messages", () => {
  it("a message sent while Lyra is still thinking joins the same thought", async () => {
    const m = manual();
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    const text: string[] = [];
    const first = lyra.chat("dinner friday?", { text: (d) => text.push(d), status: () => {}, memory: () => {} });
    await m.next(1);
    const second = lyra.chat("oh and it's for 6 people", { text: () => {}, status: () => {}, memory: () => {} });
    await m.next(2); // the first try was stopped and started again
    expect(m.calls[1].req.messages.length).toBe(1);
    expect(lastUserText(m.calls[1].req)).toMatch(/dinner friday\?\|.*added, while you were working:\noh and it's for 6 people/);
    m.calls[1].write("Table for six on Friday, got it.");
    m.calls[1].finish(say("Table for six on Friday, got it."));
    const [a, b] = await Promise.all([first, second]);
    expect(a.message.id).toBe(b.message.id);
    expect(b.queued).toBe(true);
    expect(a.user.content).toBe("dinner friday?");
    expect(b.user.content).toBe("oh and it's for 6 people");
    expect(lyra.messages(null).map((x) => [x.role, x.content])).toEqual([
      ["user", "dinner friday?"],
      ["user", "oh and it's for 6 people"],
      ["assistant", "Table for six on Friday, got it."],
    ]);
    expect(text.join("")).toBe("Table for six on Friday, got it.");
  });

  it("once Lyra is writing, she finishes and then answers what was added, in the same reply", async () => {
    const m = manual();
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    const text: string[] = [];
    const first = lyra.chat("how's my day", { text: (d) => text.push(d), status: () => {}, memory: () => {} });
    await m.next(1);
    m.calls[0].write("Pretty clear.");
    const second = lyra.chat("hell yeah", { text: () => {}, status: () => {}, memory: () => {} });
    await tick();
    expect(m.calls.length).toBe(1); // not restarted: she was already writing
    m.calls[0].finish(say("Pretty clear."));
    await m.next(2);
    expect(m.calls[1].req.messages.at(-2)!.role).toBe("assistant");
    expect(lastUserText(m.calls[1].req)).toBe("hell yeah");
    m.calls[1].write("Hell yeah!");
    m.calls[1].finish(say("Hell yeah!"));
    const [a, b] = await Promise.all([first, second]);
    expect(a.message.content).toBe("Pretty clear.\n\nHell yeah!");
    expect(b.message.id).toBe(a.message.id);
  });

  it("a message after the reply is done starts its own turn; another chat has to wait", async () => {
    const m = manual();
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    const ch = await lyra.createChannel({ name: "Home" });
    const first = lyra.chat("one", { text: () => {}, status: () => {}, memory: () => {} });
    await m.next(1);
    await expect(lyra.chat("elsewhere", { text: () => {}, status: () => {}, memory: () => {} }, ch.id)).rejects.toThrow(/another chat/);
    m.calls[0].write("ok one");
    m.calls[0].finish(say("ok one"));
    await first;
    const second = lyra.chat("two", { text: () => {}, status: () => {}, memory: () => {} });
    await m.next(2);
    m.calls[1].write("ok two");
    m.calls[1].finish(say("ok two"));
    expect((await second).queued).toBeUndefined();
    expect(lyra.messages(null).map((x) => x.content)).toEqual(["one", "ok one", "two", "ok two"]);
  });

  it("Stop still stops, queued messages and all", async () => {
    const m = manual();
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    const first = lyra.chat("one", { text: () => {}, status: () => {}, memory: () => {} });
    await m.next(1);
    m.calls[0].write("Working on");
    const second = lyra.chat("two", { text: () => {}, status: () => {}, memory: () => {} });
    lyra.stop();
    const [a, b] = await Promise.all([first, second]);
    expect(a.message.content).toMatch(/Stopped\.$/);
    expect(b.message.id).toBe(a.message.id);
  });
});
