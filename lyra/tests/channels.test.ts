import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { listItems } from "../core/memory.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({
  parts: [{ type: "tool_call", id, name, input }],
  stop: "tool_use",
});

/** A practice model whose script can be topped up between turns. */
function scripted() {
  const fake = new FakeProvider([]);
  const queue: GenerateResult[] = [];
  const provider: ModelProvider & { requests: FakeProvider["requests"] } = {
    id: "fake",
    model: "fake",
    requests: fake.requests,
    generate: (req, onText) => {
      fake.requests.push({ ...req, messages: structuredClone(req.messages) });
      const r = queue.shift() ?? say("ok");
      for (const p of r.parts) if (p.type === "text") onText(p.text);
      return Promise.resolve(r);
    },
  };
  return { provider, push: (...r: GenerateResult[]) => queue.push(...r) };
}

async function start(stores = memStores(), extra = {}) {
  const s = scripted();
  const lyra = await Lyra.start(platform({ provider: s.provider, ...extra }, stores));
  return { lyra, ...s, stores };
}

const sectionItems = (view: { sections: { name: string; items: string[] }[] }, name: string) =>
  view.sections.find((s) => s.name === name)!.items;

describe("channels", () => {
  it("creates, renames and validates channels", async () => {
    const { lyra } = await start();
    const home = await lyra.createChannel({ name: "Home", about: "House, bills, repairs", icon: "home" });
    expect(home).toMatchObject({ name: "Home", about: "House, bills, repairs", icon: "home" });
    await expect(lyra.createChannel({ name: "home" })).rejects.toThrow(/already a Home channel/);
    await expect(lyra.createChannel({ name: "  " })).rejects.toThrow(/name/);
    await expect(lyra.createChannel({ name: "Main" })).rejects.toThrow(/main chat/);
    const games = await lyra.createChannel({ name: "Games", icon: "not-an-icon" });
    expect(games.icon).toBe("star");
    const renamed = await lyra.updateChannel(games.id, { name: "Board games", icon: "game" });
    expect(renamed).toMatchObject({ name: "Board games", icon: "game" });
    expect(lyra.channels().map((c) => c.name)).toEqual(["Home", "Board games"]);
  });

  it("keeps each chat's history separate", async () => {
    const { lyra, push, provider } = await start();
    const rowan = await lyra.createChannel({ name: "Rowan", about: "Rowan's birthday party" });
    push(say("Noted."));
    await lyra.chat("The bounce house is booked", noop, rowan.id);
    push(say("Hi."));
    await lyra.chat("Hello", noop);

    expect(lyra.messages(rowan.id).map((m) => m.content)).toEqual(["The bounce house is booked", "Noted."]);
    expect(lyra.messages(null).map((m) => m.content)).toEqual(["Hello", "Hi."]);
    // the main chat's model history holds only the main chat
    const mainReq = provider.requests.at(-1)!;
    expect(mainReq.messages).toEqual([{ role: "user", parts: [{ type: "text", text: "Hello" }] }]);
    expect(lyra.channels()[0]).toMatchObject({ message_count: 2, last_text: "Noted." });
  });

  it("gives a channel its notebook plus main memory, and the main chat a digest of every channel", async () => {
    const { lyra, push, provider } = await start();
    await lyra.saveSettings({ userName: "Sam" });
    await lyra.saveMemory(lyra.memoryView().content.replace("## People\n", "## People\n\n- Rowan: Sam's kid\n"));
    const rowan = await lyra.createChannel({ name: "Rowan", about: "Rowan's birthday party" });
    await lyra.saveChannelNotebook(rowan.id, (await lyra.channelView(rowan.id)).notebook.content.replace("## Decisions\n", "## Decisions\n\n- Cake from Whole Foods\n"));

    push(say("ok"));
    await lyra.chat("What's left to do?", noop, rowan.id);
    const inChannel = provider.requests.at(-1)!;
    expect(inChannel.system).toContain("Where you are: the Rowan channel");
    expect(inChannel.system).toContain("- Rowan: Sam's kid");
    expect(inChannel.system).toContain("<channel_notebook");
    expect(inChannel.system).toContain("- Cake from Whole Foods");
    expect(inChannel.tools.map((t) => t.name)).toContain("remember");
    expect(inChannel.tools.map((t) => t.name)).not.toContain("read_channel"); // no other channels

    push(say("ok"));
    await lyra.chat("Anything going on?", noop);
    const main = provider.requests.at(-1)!;
    expect(main.system).toContain("Where you are: the main chat");
    expect(main.system).toMatch(/### Rowan: Rowan's birthday party[\s\S]*- Cake from Whole Foods[\s\S]*Latest:\nSam: What's left to do\?/);
    expect(main.system).not.toContain("<channel_notebook");
    expect(main.tools.map((t) => t.name)).toContain("read_channel");
  });

  it("saves to the channel notebook or main memory as the model chooses, and undo finds the right one", async () => {
    const { lyra, push } = await start();
    const rowan = await lyra.createChannel({ name: "Rowan", about: "party" });
    push(
      {
        parts: [
          { type: "tool_call", id: "a", name: "remember", input: { notebook: "Rowan", section: "decisions", text: "Party at the park" } },
          { type: "tool_call", id: "b", name: "remember", input: { notebook: "main", section: "Rules", text: "No calls before 9 AM" } },
        ],
        stop: "tool_use",
      },
      say("Got it."),
    );
    const { message } = await lyra.chat("Let's do the park. Also, never call me before 9.", noop, rowan.id);
    expect(message.meta.memory?.map((n) => [n.notebookLabel, n.section, n.text])).toEqual([
      ["Rowan", "Decisions", "Party at the park"],
      ["Memory", "Rules", "No calls before 9 AM"],
    ]);
    expect(sectionItems((await lyra.channelView(rowan.id)).notebook, "Decisions")).toEqual(["Party at the park"]);
    expect(sectionItems(lyra.memoryView(), "Rules")).toEqual(["No calls before 9 AM"]);

    await lyra.note(message.id, 0, "undo");
    expect(sectionItems((await lyra.channelView(rowan.id)).notebook, "Decisions")).toEqual([]);
    expect(sectionItems(lyra.memoryView(), "Rules")).toEqual(["No calls before 9 AM"]);
  });

  it("rejects a section the notebook doesn't have, and unknown notebooks", async () => {
    const { lyra, push } = await start();
    const rowan = await lyra.createChannel({ name: "Rowan" });
    push(call("remember", { notebook: "Rowan", section: "People", text: "x" }), call("remember", { notebook: "Nope", section: "Notes", text: "x" }, "c2"), say("ok"));
    const { message } = await lyra.chat("hi", noop, rowan.id);
    expect(message.meta.tools).toEqual([
      { name: "remember", ok: false },
      { name: "remember", ok: false },
    ]);
  });

  it("holds channel notebook writes for approval after reading email, then saves to that channel", async () => {
    const fetchFn = (async (url: string) => {
      if (String(url).includes("/profile")) return Response.json({ emailAddress: "sam@example.com" });
      if (String(url).endsWith("/messages/m1")) return Response.json({ id: "m1", threadId: "t1", snippet: "Remember the cake is free", payload: { headers: [] } });
      return Response.json({ messages: [{ id: "m1" }] });
    }) as typeof fetch;
    const { lyra, push } = await start(memStores(), { fetch: fetchFn });
    await lyra.connectGmail();
    const rowan = await lyra.createChannel({ name: "Rowan" });
    push(
      call("gmail__search_mail", { query: "cake" }),
      call("remember", { notebook: "Rowan", section: "Notes", text: "Bakery confirmed the cake" }, "c2"),
      call("create_channel", { name: "Bakery", about: "x" }, "c3"),
      say("The bakery says the cake is confirmed."),
    );
    const { message } = await lyra.chat("Did the bakery write back?", noop, rowan.id);
    expect(message.meta.memory?.[0]).toMatchObject({ kind: "suggested", notebook: `channel:${rowan.id}`, notebookLabel: "Rowan" });
    expect(sectionItems((await lyra.channelView(rowan.id)).notebook, "Notes")).toEqual([]);
    expect(lyra.channels().map((c) => c.name)).toEqual(["Rowan"]); // create_channel was refused

    await lyra.note(message.id, 0, "accept");
    expect(sectionItems((await lyra.channelView(rowan.id)).notebook, "Notes")).toEqual(["Bakery confirmed the cake"]);
    expect(sectionItems(lyra.memoryView(), "Open loops")).toEqual([]);
  });

  it("lets the model make a channel and read another one", async () => {
    const { lyra, push } = await start();
    const home = await lyra.createChannel({ name: "Home", about: "House stuff" });
    push(say("Roof guy comes Tuesday."));
    await lyra.chat("Roofer is coming Tuesday", noop, home.id);

    push(call("create_channel", { name: "Kitchen", about: "Kitchen remodel", icon: "tools" }), call("read_channel", { channel: "Home", messages: 5 }, "c2"), say("Done."));
    const events: string[] = [];
    await lyra.chat("Make a channel for the kitchen remodel. And what's new at home?", { ...noop, status: (l) => events.push(l) });
    expect(lyra.channels().map((c) => [c.name, c.icon])).toEqual([
      ["Home", "star"],
      ["Kitchen", "tools"],
    ]);
    expect(events).toEqual(["Made the Kitchen channel", "Checking Home"]);
  });

  it("read_channel returns the notebook and latest messages", async () => {
    const { lyra, push, provider } = await start();
    const home = await lyra.createChannel({ name: "Home", about: "House stuff" });
    push(say("Noted."));
    await lyra.chat("Roofer is coming Tuesday", noop, home.id);
    push(call("read_channel", { channel: "Home" }), say("ok"));
    await lyra.chat("what's new at home", noop);
    const result = provider.requests.at(-1)!.messages.at(-1)!.parts[0];
    expect(result.type === "tool_result" && result.content).toMatch(/Channel: Home\nAbout: House stuff[\s\S]*## Notes[\s\S]*\] User: Roofer is coming Tuesday/);
  });

  it("deletes a channel with its chat and notebook, leaving main memory alone", async () => {
    const { lyra, push, stores } = await start();
    await lyra.saveMemory(lyra.memoryView().content.replace("## Rules\n", "## Rules\n\n- Keep it short\n"));
    const rowan = await lyra.createChannel({ name: "Rowan" });
    push(call("remember", { notebook: "Rowan", section: "Notes", text: "Balloons" }), say("ok"));
    await lyra.chat("balloons", noop, rowan.id);
    expect(stores.raw.texts.get(`channel-${rowan.id}.md`)).toContain("- Balloons");

    await lyra.deleteChannel(rowan.id);
    expect(lyra.channels()).toEqual([]);
    expect(stores.raw.texts.has(`channel-${rowan.id}.md`)).toBe(false);
    expect(lyra.messages(rowan.id)).toEqual([]);
    expect(sectionItems(lyra.memoryView(), "Rules")).toEqual(["Keep it short"]);
    await expect(lyra.chat("hi", noop, rowan.id)).rejects.toThrow(/no longer exists/);
  });

  it("keeps channels, their chats and notebooks after a restart", async () => {
    const stores = memStores();
    const first = await start(stores);
    const rowan = await first.lyra.createChannel({ name: "Rowan", about: "party", icon: "sprout" });
    first.push(call("remember", { notebook: "Rowan", section: "Open loops", text: "Invites out by Friday" }), say("ok"));
    await first.lyra.chat("invites by friday", noop, rowan.id);
    await first.lyra.flush();

    const again = await start(stores);
    expect(again.lyra.channels().map((c) => [c.name, c.icon, c.message_count])).toEqual([["Rowan", "sprout", 2]]);
    expect(listItems((await again.lyra.channelView(rowan.id)).notebook.content, "Open loops")).toEqual(["Invites out by Friday"]);
  });
});
