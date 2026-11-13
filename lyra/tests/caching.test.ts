import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../core/prompt.ts";
import { cacheLast, systemBlocks, toAnthropicMessages } from "../core/providers/anthropic.ts";
import { plainSystem, SYSTEM_SPLIT, splitSystem } from "../core/providers/types.ts";

const base = { userName: "Sam", timeZone: "America/Los_Angeles", connectors: [], channels: [], memory: "" } as unknown as Parameters<typeof buildSystemPrompt>[0];

describe("cache-friendly prompts", () => {
  it("keeps who Lyra is and her rules identical between messages; time, tasks and memory come after", () => {
    const a = buildSystemPrompt({ ...base, now: new Date("2026-11-13T17:01:00Z"), memory: "- Likes oolong", tasks: "#1 Plumber" });
    const b = buildSystemPrompt({ ...base, now: new Date("2026-11-13T19:42:00Z"), memory: "- Likes espresso", tasks: "#2 Cake" });
    const [sa, ca] = splitSystem(a);
    const [sb] = splitSystem(b);
    expect(sa).toBe(sb);
    expect(sa).toContain("# Ground rules");
    expect(sa).not.toMatch(/2026|oolong|Plumber/);
    expect(ca).toMatch(/^# Right now\nIt's Friday, November 13, 2026/);
    expect(ca).toContain("Likes oolong");
  });

  it("Claude gets two cached blocks; other providers get one text without the marker", () => {
    const sys = `Stable${SYSTEM_SPLIT}Changing`;
    expect(systemBlocks(sys)).toEqual([
      { type: "text", text: "Stable", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Changing", cache_control: { type: "ephemeral" } },
    ]);
    expect(systemBlocks("No marker")).toEqual([{ type: "text", text: "No marker", cache_control: { type: "ephemeral" } }]);
    expect(plainSystem(sys)).toBe("Stable\n\nChanging");
  });

  it("marks the end of the conversation for the tool steps of a reply", () => {
    const msgs = cacheLast(toAnthropicMessages([{ role: "user", parts: [{ type: "text", text: "hi" }] }]));
    expect(JSON.stringify(msgs.at(-1))).toContain('"cache_control":{"type":"ephemeral"}');
  });
});
