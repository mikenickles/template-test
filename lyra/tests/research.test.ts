import { describe, expect, it } from "vitest";
import { reportFor } from "../core/docs.ts";
import { Lyra } from "../core/lyra.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

function models() {
  const chat: GenerateResult[] = [];
  const work: GenerateResult[] = [];
  const workerRequests: GenerateRequest[] = [];
  const provider: ModelProvider = {
    id: "fake",
    model: "fake",
    async generate(req) {
      const isWorker = req.system.startsWith("You are one of Lyra's background workers");
      if (isWorker) workerRequests.push(req);
      return (isWorker ? work.shift() : chat.shift()) ?? say("ok");
    },
  };
  return { provider, chat, work, workerRequests };
}

describe("research tasks", () => {
  it("need web search", async () => {
    const m = models();
    m.chat.push(call("create_task", { title: "Best stroller", research: true }), say("Web search is off."));
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    await lyra.saveSettings({ webSearch: false });
    const { message } = await lyra.chat("research the best stroller", noop);
    expect(message.meta.tools).toEqual([{ name: "create_task", ok: false }]);
    expect(lyra.tasks({})).toEqual([]);
  });

  it("read sources, write a report with the sources actually used, and post it in chat", async () => {
    const m = models();
    m.chat.push(call("create_task", { title: "Compare 3 strollers under $400", details: "City use, folds small.", research: true }), say("I'll dig into it."));
    m.work.push(
      { ...call("log_progress", { note: "Read three reviews" }, "w1"), sources: [{ url: "https://reviews.example/strollers", title: "Best strollers 2026" }, { url: "https://maker.example/pact", title: "Pact Lite specs" }] },
      call("write_report", { title: "Strollers under $400", body: "**Pick the Pact Lite.** Lightest fold (Pact Lite specs).\n\n| Model | Weight |\n| --- | --- |\n| Pact Lite | 6 kg |" }, "w2"),
      call("finish", { result: "The Pact Lite is the pick: lightest and folds smallest. The full report is in Docs." }, "w3"),
    );
    const lyra = await Lyra.start(platform({ provider: m.provider }));
    await lyra.chat("Research the best compact stroller under $400 for me", noop);
    await lyra.workers.settle();
    const [task] = lyra.tasks({});
    expect(task.kind).toBe("research");
    expect(m.workerRequests[0].system).toMatch(/This is a research task/);
    expect(m.workerRequests[0].webSearch).toBe(true);
    const doc = reportFor((lyra as unknown as { db: never }).db, task.id)!;
    expect(doc).toMatchObject({ title: "Strollers under $400", task_id: task.id, tainted: true });
    expect(doc.body).toContain("## Sources\n1. [Best strollers 2026](https://reviews.example/strollers)\n2. [Pact Lite specs](https://maker.example/pact)");
    const posted = lyra.messages(null).at(-1)!;
    expect(posted.content).toMatch(/^The Pact Lite is the pick/);
    expect(posted.meta.docs).toEqual([{ id: doc.id, title: "Strollers under $400", created: true }]);
    expect(posted.meta.sources).toHaveLength(2);
  });
});
