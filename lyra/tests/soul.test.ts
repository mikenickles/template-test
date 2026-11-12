import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import type { GenerateRequest, ModelProvider } from "../core/providers/types.ts";
import { DEFAULT_SOUL } from "../core/soul.ts";
import { memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };

function recorder() {
  const systems: string[] = [];
  const provider: ModelProvider = {
    id: "fake",
    model: "fake",
    generate: async (req: GenerateRequest) => {
      systems.push(req.system);
      return { parts: [{ type: "text", text: "ok" }], stop: "end" };
    },
  };
  return { provider, systems };
}

describe("Lyra's soul", () => {
  it("is in the chat, worker and routine prompts, with the user's name filled in", async () => {
    const { provider, systems } = recorder();
    const lyra = await Lyra.start(platform({ provider }, memStores()));
    await lyra.saveSettings({ userName: "Sam" });
    await lyra.chat("hi", noop);
    const t = await lyra.createTask({ title: "Something" });
    await lyra.startTask(t.id);
    await lyra.workers.settle();
    const r = await lyra.addPreset("bills");
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(systems).toHaveLength(3);
    for (const s of systems) {
      expect(s).toContain("You are Lyra, Sam's chief of staff and the person in their corner.");
      expect(s).toContain("**Bullets for lists.**");
      expect(s).toContain("Lead with the point."); // the voice guide is still there
      expect(s).not.toContain("{user}");
    }
  });

  it("can be edited, survives a restart, and resets to the original", async () => {
    const stores = memStores();
    const first = recorder();
    const lyra = await Lyra.start(platform({ provider: first.provider }, stores));
    expect(lyra.soul()).toEqual({ content: DEFAULT_SOUL, custom: false });
    await lyra.saveSoul("You are Lyra. Talk to {user} like a pirate.");
    await expect(lyra.saveSoul("   ")).rejects.toThrow(/empty/);

    const again = recorder();
    const l2 = await Lyra.start(platform({ provider: again.provider }, stores));
    expect(l2.soul().custom).toBe(true);
    await l2.chat("hi", noop);
    expect(again.systems[0]).toContain("Talk to the user like a pirate.");
    expect(again.systems[0]).not.toContain("the person in their corner");

    expect(await l2.resetSoul()).toEqual({ content: DEFAULT_SOUL, custom: false });
    expect(stores.raw.texts.has("soul.md")).toBe(false);
  });
});
