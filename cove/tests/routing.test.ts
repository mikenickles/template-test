import { describe, expect, it } from "vitest";
import { Cove } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import { quickModelFor } from "../core/providers/routing.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

describe("model routing", () => {
  it("pairs each main model with its smaller partner", () => {
    const claude = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001"];
    expect(quickModelFor({ provider: "anthropic", model: "claude-sonnet-5-5" }, claude)).toBe("claude-haiku-5-5");
    expect(quickModelFor({ provider: "anthropic", model: "claude-opus-5-5" }, claude)).toBe("claude-haiku-5-5");
    // no list (offline): Claude falls back to the known Haiku
    expect(quickModelFor({ provider: "anthropic", model: "claude-sonnet-5-5" }, null)).toBe("claude-haiku-5-5");
    // already small: itself
    expect(quickModelFor({ provider: "anthropic", model: "claude-haiku-5-5" }, claude)).toBe("claude-haiku-5-5");
    const openai = ["gpt-6-sol", "gpt-6-terra", "gpt-6-terra-preview", "gpt-6-astra"];
    expect(quickModelFor({ provider: "openai", model: "gpt-6-sol" }, openai)).toBe("gpt-6-terra");
    // Sol with no Terra on the key: stays on Sol
    expect(quickModelFor({ provider: "openai", model: "gpt-6-sol" }, ["gpt-6-sol"])).toBe("gpt-6-sol");
    expect(quickModelFor({ provider: "openai", model: "gpt-6-astra" }, openai)).toBe("gpt-6-astra");
    // "solid" isn't Sol
    expect(quickModelFor({ provider: "openai", model: "gpt-solid" }, openai)).toBe("gpt-solid");
    expect(quickModelFor({ provider: "gemini", model: "gemini-3.8-pro" }, ["gemini-3.8-pro", "gemini-3.8-flash"])).toBe("gemini-3.8-flash");
  });

  it("a quiet check stays on the background model", async () => {
    const main = new FakeProvider([]);
    const quick = new FakeProvider([call("nothing_new", { note: "Nothing new." })]);
    const lyra = await Cove.start(platform({ provider: main, quickProvider: quick }));
    const r = await lyra.createRoutine({ name: "Bills", instructions: "Any new bills?", times: "08:00", postMode: "news" });
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(quick.requests.length).toBe(1);
    expect(main.requests.length).toBe(0);
  });

  it("when the background model finds news, the main model writes it", async () => {
    const main = new FakeProvider([call("post", { message: "Your water bill is $84, due Friday." }, "c2")]);
    const quick = new FakeProvider([call("post", { message: "water bill 84 fri" })]);
    const lyra = await Cove.start(platform({ provider: main, quickProvider: quick }));
    const r = await lyra.createRoutine({ name: "Bills", instructions: "Any new bills?", times: "08:00", postMode: "news" });
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(lyra.messages(null).at(-1)!.content).toBe("Your water bill is $84, due Friday.");
    expect(quick.requests.length).toBe(1);
    expect(main.requests.length).toBe(1);
    // the main model sees what the background one did, and is told to write it
    const told = main.requests[0].messages.at(-1)!.parts[0];
    expect(told.type === "tool_result" && told.content).toMatch(/worth telling the user/);
  });

  it("a routine that always posts runs on the main model, and the setting can switch routing off", async () => {
    const main = new FakeProvider([call("post", { message: "Morning!" })]);
    const quick = new FakeProvider([]);
    const lyra = await Cove.start(platform({ provider: main, quickProvider: quick }));
    const r = await lyra.createRoutine({ name: "Brief", instructions: "Brief me.", times: "07:00", postMode: "always" });
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(quick.requests.length).toBe(0);
    expect((await lyra.saveSettings({ backgroundModel: "same" })).backgroundModel).toBe("same");
    await expect(lyra.saveSettings({ backgroundModel: "bad name!" })).rejects.toThrow(/looks wrong/);
  });
});
