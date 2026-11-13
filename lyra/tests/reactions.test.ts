import { describe, expect, it } from "vitest";
import { historyFor, runTurn, type TurnContext } from "../core/chat.ts";
import type { Connectors } from "../core/connectors/registry.ts";
import { DB, listMessages } from "../core/db.ts";
import { mainNotebookSpec, Notebook } from "../core/memory.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { memStores, SQL } from "./helpers.ts";

const noConnectors = {
  status: () => [],
  tools: async () => [],
  owns: () => false,
  label: () => "",
  call: async () => ({ content: "", isError: true }),
  reset: async () => {},
} as unknown as Connectors;

async function setup(script: GenerateResult[] = []) {
  const db = await DB.open(SQL);
  const main = await Notebook.open(db, memStores().texts, mainNotebookSpec("Sam"));
  const workspace = {
    main,
    channels: () => [],
    notebook: () => Promise.reject(new Error("no channels")),
    createChannel: () => Promise.reject(new Error("no channels")),
  };
  const ctx: TurnContext = { db, workspace, channel: null, connectors: noConnectors, provider: new FakeProvider(script), userName: "Sam" };
  const seen: string[] = [];
  const emit = { text: () => {}, status: () => {}, memory: () => {}, reaction: (e: string) => seen.push(e) };
  return { db, ctx, emit, seen };
}

const call = (input: Record<string, unknown>): GenerateResult => ({ parts: [{ type: "tool_call", id: "r1", name: "react", input }], stop: "tool_use" });
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });

describe("reactions", () => {
  it("puts the reaction on the user's message, and a reaction alone is a whole reply", async () => {
    const t = await setup();
    const reply = await runTurn(t.ctx, "thanks!", t.emit);
    expect(t.seen).toEqual(["❤️"]);
    expect(reply.content).toBe("");
    const [user] = listMessages(t.db, null);
    expect(user.meta.reaction).toBe("❤️");
    // The reaction is still Lyra's turn in the next message's history: without it the next thing the
    // user says would be glued onto "thanks!" and that would be answered again (on the practice model, forever).
    expect(historyFor(listMessages(t.db, null))).toEqual([
      { role: "user", parts: [{ type: "text", text: "thanks!" }] },
      { role: "assistant", parts: [{ type: "text", text: "[reacted ❤️ to their message, no words]" }] },
    ]);
    const next = await runTurn(t.ctx, "remember that the gate code is 4412", t.emit);
    expect(next.content).toBe("Got it.");
    expect(t.ctx.workspace.main.read()).toContain("the gate code is 4412");
  });

  it("never writes out the note that stands for an earlier reaction", async () => {
    const t = await setup([say("[reacted ❤️ to their message, no words]\n\nAnytime!")]);
    expect((await runTurn(t.ctx, "you're the best", t.emit)).content).toBe("[reacted ❤️ to their message, no words]\n\nAnytime!".split("\n\n")[1]);
  });

  it("can react and still say something", async () => {
    const t = await setup([call({ emoji: "🎉" }), say("Rowan's going to love it.")]);
    const reply = await runTurn(t.ctx, "the cake came out perfect", t.emit);
    expect(reply.content).toBe("Rowan's going to love it.");
    expect(listMessages(t.db, null)[0].meta.reaction).toBe("🎉");
  });

  it("refuses emoji outside the set", async () => {
    const t = await setup([call({ emoji: "💀" }), say("Ha.")]);
    await runTurn(t.ctx, "lol", t.emit);
    expect(t.seen).toEqual([]);
    expect(listMessages(t.db, null)[0].meta.reaction).toBeUndefined();
  });
});

describe("warm replies", () => {
  it("a reply written together with a reaction ends there, without asking the model again", async () => {
    const { Lyra } = await import("../core/lyra.ts");
    const { FakeProvider } = await import("../core/providers/fake.ts");
    const { platform } = await import("./helpers.ts");
    const provider = new FakeProvider([
      { parts: [{ type: "text", text: "That's huge, congratulations!! 🙌" }, { type: "tool_call", id: "r1", name: "react", input: { emoji: "🎉" } }], stop: "tool_use" },
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    const { message, user } = await lyra.chat("I got the job!!", { text: () => {}, status: () => {}, memory: () => {} });
    expect(provider.requests.length).toBe(1);
    expect(message.content).toBe("That's huge, congratulations!! 🙌");
    expect(user.meta.reaction).toBe("🎉");
    expect(provider.requests[0].system).toMatch(/React often/);
  });
});
