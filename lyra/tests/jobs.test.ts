// 0.64: who does what — a model per job, auto by kind of job, changeable by the user or Tomo.
import { describe, expect, it } from "vitest";
import { jobIdFor, parsePick, tinyModelFor } from "../core/jobs.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

describe("job routing pieces", () => {
  it("pairs watching jobs with the smallest model", () => {
    expect(tinyModelFor({ provider: "openai", model: "sol-2" }, ["sol-2", "terra-2", "luna-2"], "terra-2")).toBe("luna-2");
    expect(tinyModelFor({ provider: "openai", model: "sol-2" }, ["sol-2", "terra-2"], "terra-2")).toBe("terra-2");
    expect(tinyModelFor({ provider: "gemini", model: "gemini-3-pro" }, ["gemini-3-flash", "gemini-3-flash-lite"], "gemini-3-flash")).toBe("gemini-3-flash-lite");
  });
  it("reads picks and maps the Usage page's job names", () => {
    expect(parsePick("openai:luna-2")).toEqual({ provider: "openai", model: "luna-2" });
    expect(parsePick("auto")).toBeNull();
    expect(jobIdFor("proactive", "quick", "Mail watch")).toBe("mailwatch");
    expect(jobIdFor("proactive", "main", "Mail watch")).toBeNull(); // the writer is the main model
    expect(jobIdFor("routine", "quick", "Routine: Morning brief")).toBe("routine_news");
    expect(jobIdFor("routine", "main", "Routine: Morning brief")).toBe("routine");
  });
});

describe("who does what in Tomo", () => {
  it("defaults by kind of job, and Tomo can change one when asked", async () => {
    const provider = new FakeProvider([call("more_tools", { names: ["set_job_model"] }), call("set_job_model", { job: "tidy", model: "gpt-mini" }, "c2"), say("Done.")]);
    const p = platform({ provider });
    const lyra = await Lyra.start(p);
    // a real choice so jobs resolve (the fake provider still answers)
    await p.secrets.set("key.openai", "sk-test");
    (lyra as unknown as { keys: Record<string, string> }).keys.openai = "sk-test";
    (lyra as unknown as { db: { run(s: string, a: unknown[]): void } }).db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider', ?)", [JSON.stringify({ provider: "openai", model: "sol-2" })]);
    (lyra as unknown as { fetch: unknown }).fetch;
    const rows = await lyra.jobModels();
    expect(rows[0]).toMatchObject({ id: "chat", model: "sol-2" });
    expect(rows.find((r) => r.id === "task")?.model).toBe("sol-2");
    await lyra.chat("Use gpt-mini for the memory tidy-up", noop);
    expect((await lyra.jobModels()).find((r) => r.id === "tidy")).toMatchObject({ pick: "openai:gpt-mini", model: "gpt-mini" });
    await lyra.setJobModel("tidy", "auto");
    expect((await lyra.jobModels()).find((r) => r.id === "tidy")?.pick).toBe("auto");
    await expect(lyra.setJobModel("tidy", "anthropic:claude-haiku-5-5")).rejects.toThrow(/no anthropic key/);
  });
});
