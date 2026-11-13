import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { checkTriage } from "../core/triage.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

const CARD = {
  range: "Last 24 hours",
  summary: "Dana needs an answer about Friday; the rest can wait.",
  needs_you: [{ thread_id: "18c2a9f0e1d", from: "Dana Ortiz", subject: "Friday?", why: "Wants a yes or no by tonight" }],
  can_wait: [{ thread_id: "18c2a9f0e2e", from: "School office", subject: "Picture day", why: "Next week" }],
  newsletters: [
    { thread_id: "18c2a9f0e3f", from: "Store", subject: "50% off" },
    { thread_id: "not a thread", from: "Spoof", subject: "dropped" },
  ],
};

/** Gmail connected, with a pretend Gmail that's empty. */
async function withGmail(provider: FakeProvider) {
  const google = { available: true, authorize: async () => ({ accessToken: "t", grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"], email: "sam@example.com" }) };
  const fetch = (async () => new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof globalThis.fetch;
  const lyra = await Lyra.start(platform({ provider, google, fetch }));
  await lyra.connectGoogle("gmail");
  return lyra;
}

describe("inbox triage", () => {
  it("keeps only real threads, and refuses an empty card", () => {
    const t = checkTriage(CARD);
    expect(t.needs).toEqual([{ thread: "18c2a9f0e1d", from: "Dana Ortiz", subject: "Friday?", why: "Wants a yes or no by tonight" }]);
    expect(t.fyi.map((i) => i.from)).toEqual(["Store"]);
    expect(() => checkTriage({ range: "x", needs_you: [], can_wait: [], newsletters: [] })).toThrow(/empty/);
  });

  it("is something Lyra does when asked: no card tool without Gmail, a card after reading the inbox", async () => {
    const without = new FakeProvider([say("Hi.")]);
    const l0 = await Lyra.start(platform({ provider: without }));
    await l0.chat("hi", noop);
    expect(without.requests[0].tools.map((t) => t.name)).not.toContain("show_triage");

    const provider = new FakeProvider([call("gmail__search_mail", { query: "in:inbox newer_than:1d" }), call("show_triage", CARD, "c2"), say("One thing needs you: Dana, about Friday.")]);
    const lyra = await withGmail(provider);
    const { message } = await lyra.chat("Go through my inbox", noop);
    expect(provider.requests[0].system).toMatch(/Inbox triage: only when/);
    expect(message.meta.triage).toMatchObject({ range: "Last 24 hours", needs: [{ from: "Dana Ortiz" }], later: [{ from: "School office" }], fyi: [{ from: "Store" }] });
    expect(message.content).toBe("One thing needs you: Dana, about Friday.");
  });

  it("a triage routine posts the same card", async () => {
    const provider = new FakeProvider([call("post", { message: "Morning: one thing needs you.", triage: CARD })]);
    const lyra = await withGmail(provider);
    const r = await lyra.createRoutine({ name: "Inbox triage", instructions: "Triage my inbox since the last run.", times: "08:00", postMode: "always" });
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    const posted = lyra.messages(null).at(-1)!;
    expect(posted.meta.routine?.name).toBe("Inbox triage");
    expect(posted.meta.triage?.needs[0].subject).toBe("Friday?");
    expect(provider.requests[0].tools.find((t) => t.name === "post")!.schema).toHaveProperty("properties.triage");
  });
});
