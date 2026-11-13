import { describe, expect, it } from "vitest";
import { DB, addMessage } from "../core/db.ts";
import { Lyra } from "../core/lyra.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { cleanNotes, learnStyle, ratedReplies, styleSamples } from "../core/style.ts";
import { platform, SQL } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>): GenerateResult => ({ parts: [{ type: "tool_call", id: "s1", name, input }], stop: "tool_use" });

function scripted(replies: GenerateResult[]) {
  const requests: GenerateRequest[] = [];
  const provider: ModelProvider = {
    id: "claude",
    model: "claude-test",
    async generate(req) {
      requests.push(req);
      return replies.shift() ?? say("ok");
    },
  };
  return { provider, requests };
}

const NOTES = ['Says "hell yeah" and "lol" a lot', "All lowercase, few capitals", "Swears casually when hyped", "Uses 🔥 and 😂 now and then"];

describe("talking like the user", () => {
  it("learns only from the user's own short messages, and keeps notes to clean single lines", async () => {
    const db = await DB.open(SQL);
    addMessage(db, "user", "hell yeah lol", {}, null);
    addMessage(db, "assistant", "Nice!", {}, null);
    addMessage(db, "user", "x".repeat(500), {}, null); // a paste
    addMessage(db, "user", "sounds good dude", {}, null);
    expect(styleSamples(db)).toEqual(["hell yeah lol", "sounds good dude"]);
    expect(cleanNotes(["- one\ntwo", "", 3, ...Array(10).fill("more")])).toEqual(["one two", "3", ...Array(6).fill("more")]);
  });

  it("asks the model about how they talk, not what they said", async () => {
    const m = scripted([call("save_style", { notes: NOTES })]);
    const samples = Array.from({ length: 12 }, (_, i) => `hell yeah ${i} lol`);
    expect(await learnStyle(m.provider, samples, [], "Mike")).toEqual(NOTES);
    expect(m.requests[0].system).toMatch(/never about what they talked about/);
    expect(m.requests[0].system).toContain("- hell yeah 3 lol");
    expect(await learnStyle(scripted([]).provider, samples.slice(0, 5), [], "Mike")).toBeNull();
  });

  it("mirrors in chat and routines, learns every few days when idle, and turns off cleanly", async () => {
    const m = scripted([]);
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    await lyra.saveSettings({ proactive: { level: "off" } });
    await lyra.saveSettings({ userName: "Mike" });
    await lyra.chat("yo", noop);
    expect(m.requests[0].system).toMatch(/## Talking like Mike[^]*"Hell yeah!" back is exactly right[^]*go by the recent chat/);
    expect(lyra.state().mirror).toBe(true);

    // not enough messages yet
    for (let i = 0; i < 25; i++) addMessage((lyra as unknown as { db: DB }).db, "user", `hell yeah ${i} lol`, {}, null);
    const later = new Date(Date.now() + 20 * 60_000);
    m.requests.length = 0;
    const replies = [call("save_style", { notes: NOTES })];
    m.provider.generate = async (req) => (m.requests.push(req), replies.shift() ?? say("ok"));
    expect(lyra.tickStyle(new Date())).toBe(false); // they just wrote: not mid-conversation
    expect(lyra.tickStyle(later)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(lyra.talkStyle().notes).toEqual(NOTES);
    expect(lyra.tickStyle(new Date(later.getTime() + 60_000))).toBe(false); // learned just now

    await lyra.chat("lol", noop);
    expect(m.requests.at(-1)!.system).toContain('- Says "hell yeah" and "lol" a lot');

    const r = await lyra.addPreset("bills");
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(m.requests.at(-1)!.system).toMatch(/You're running one of your scheduled routines[^]*## Talking like Mike/);

    await lyra.saveSettings({ mirror: false });
    await lyra.chat("ok", noop);
    expect(m.requests.at(-1)!.system).not.toContain("## Talking like");
    expect(lyra.tickStyle(new Date(later.getTime() + 5 * 86_400_000))).toBe(false);

    await lyra.forgetStyle();
    expect(lyra.talkStyle().notes).toEqual([]);
  });

  it("takes a thumbs up or down on Lyra's replies, and learns what the user likes from them", async () => {
    const m = scripted([]);
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    await lyra.saveSettings({ proactive: { level: "off" } });
    await lyra.saveSettings({ userName: "Mike" });
    const db = (lyra as unknown as { db: DB }).db;
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      addMessage(db, "user", `what's on ${i}`, {}, null);
      ids.push(addMessage(db, "assistant", `Here's a long answer ${i} `.repeat(30), {}, null).id);
    }
    const mine = addMessage(db, "user", "thanks", {}, null).id;
    await expect(lyra.rateReply(mine, "up")).rejects.toThrow(/Only Lyra's replies/);

    const up = await lyra.rateReply(ids[0], "up", "ignored on a thumbs up");
    expect(up.meta.feedback).toMatchObject({ rating: "up" });
    expect(up.meta.feedback!.why).toBeUndefined();
    await lyra.rateReply(ids[1], "down", "Too long;  Too formal");
    await lyra.rateReply(ids[2], "down");
    expect((await lyra.rateReply(ids[2], null)).meta.feedback).toBeUndefined();
    await lyra.rateReply(ids[2], "down", "Too long");

    const rated = ratedReplies(db);
    expect(rated.map((r) => r.rating)).toEqual(["up", "down", "down"]);
    expect(rated[1]).toMatchObject({ why: "Too long; Too formal", asked: "what's on 1" });
    expect(rated[1].reply.length).toBeLessThanOrEqual(501);

    // three ratings are enough to learn from, even before 20 new messages
    const replies = [call("save_style", { notes: ["Keep answers to a line or two; longer ones were too long"] })];
    m.requests.length = 0;
    m.provider.generate = async (req) => (m.requests.push(req), replies.shift() ?? say("ok"));
    expect(lyra.tickStyle(new Date(Date.now() + 20 * 60_000))).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(m.requests[0].system).toMatch(/what they like in a reply[^]*<rated_replies>[^]*👍 liked[^]*👎 didn't like \(Too long; Too formal\)[^]*they said: what's on 1/);
    expect(lyra.talkStyle().notes).toEqual(["Keep answers to a line or two; longer ones were too long"]);

    await lyra.chat("hi", noop);
    expect(m.requests.at(-1)!.system).toMatch(/talks and likes replies \(these win over your general format habits\):\n- Keep answers to a line or two/);
  });
});
