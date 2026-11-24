// (0.66.3) OpenAI's web search writes citation markers into the reply text; they never show.
import { describe, expect, it } from "vitest";
import { cleanModelText, streamCleaner } from "../core/cleantext.ts";
import { metered } from "../core/usage.ts";
import type { ModelProvider } from "../core/providers/types.ts";

const MARK = "citeturn700572forecast0turn483885search3";
const REPLY = `Carmichael's foggy, high near 58°F. I couldn't verify an all-day percentage. ${MARK}\n\nA flood warning runs through 4 PM Thursday. citeturn446393search3`;

describe("clean model text", () => {
  it("drops citation markers, stray private-use characters and bare ids", () => {
    expect(cleanModelText(REPLY)).toBe("Carmichael's foggy, high near 58°F. I couldn't verify an all-day percentage.\n\nA flood warning runs through 4 PM Thursday.");
    expect(cleanModelText("Rain at 11 citeturn700572forecast0turn483885search3.")).toBe("Rain at 11.");
    expect(cleanModelText("odd  char")).toBe("odd char");
    expect(cleanModelText("Turn 2 at the light, then search 3 shops.")).toBe("Turn 2 at the light, then search 3 shops.");
  });

  it("holds a marker split across streamed pieces until it closes", () => {
    const c = streamCleaner();
    const pieces = ["Foggy today. ci", "teturn7", "00572forecast0 More soon."];
    const shown = pieces.map((p) => c.push(p)).join("") + c.flush();
    expect(shown).not.toMatch(/[-]|turn\d/);
    expect(shown).toContain("Foggy today.");
    expect(shown).toContain("More soon.");
  });

  it("cleans every model call's streamed and final text", async () => {
    const raw: ModelProvider = {
      id: "openai",
      model: "test",
      async generate(_req, onText) {
        onText("Foggy. citeturn1");
        onText("search0");
        return { parts: [{ type: "text", text: `Foggy. ${MARK}` }], stop: "end" };
      },
    };
    // no usage in the result, so the database is never touched
    const p = metered(raw, "chat", null as never);
    let streamed = "";
    const r = await p.generate({ system: "", messages: [], tools: [] } as never, (d) => (streamed += d));
    expect(streamed).toBe("Foggy. ");
    expect(r.parts[0]).toEqual({ type: "text", text: "Foggy." });
  });
});
