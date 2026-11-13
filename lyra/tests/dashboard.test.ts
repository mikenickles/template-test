import { describe, expect, it } from "vitest";
import { checkDashboard, describeDashboard } from "../core/dashboard.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string, searched = false): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end", ...(searched ? { searched } : {}) });
const call = (name: string, input: Record<string, unknown>, id = "c1", searched = false): GenerateResult => ({
  parts: [{ type: "tool_call", id, name, input }],
  stop: "tool_use",
  ...(searched ? { searched } : {}),
});

const SUBS = {
  title: "Subscriptions",
  subtitle: "As of Nov 13",
  blocks: [
    { type: "stats", items: [{ label: "Per month", value: "$84.97" }] },
    { type: "bar", title: "Each month", unit: "$", items: [{ label: "Netflix", value: 15.49 }, { label: "Spotify", value: "$11.99" }] },
  ],
  refresh: "Read life admin and list every subscription with its monthly cost.",
};

describe("dashboards", () => {
  it("keeps only blocks with data, within limits, and reads back as text", () => {
    const d = checkDashboard({
      subtitle: "Line one\nline two",
      blocks: [
        { type: "bar", title: "Spend", unit: "$", items: [{ label: "Food", value: "$1,200.50" }, { label: "", value: 3 }, { label: "Bad", value: "n/a" }] },
        { type: "line", title: "One point", points: [{ label: "Mon", value: 1 }] },
        { type: "table", title: "T", columns: ["A", "B"], rows: [["1"], ["2", "3", "extra"]] },
        { type: "progress", title: "Goals", items: [{ label: "Read", value: 3, max: 0 }, { label: "Run", value: 2, max: 4 }] },
        { type: "script", code: "alert(1)" },
        ...Array.from({ length: 20 }, () => ({ type: "text", markdown: "note" })),
      ],
    });
    expect(d.subtitle).toBe("Line one line two");
    expect(d.blocks).toHaveLength(12);
    expect(d.blocks[0]).toEqual({ type: "bar", title: "Spend", unit: "$", items: [{ label: "Food", value: 1200.5 }] });
    // a one-point line and an unknown kind are dropped; rows are cut or padded to the columns
    expect(d.blocks[1]).toEqual({ type: "table", title: "T", columns: ["A", "B"], rows: [["1", ""], ["2", "3"]] });
    expect(d.blocks[2]).toEqual({ type: "progress", title: "Goals", items: [{ label: "Run", value: 2, max: 4 }] });
    expect(describeDashboard(d)).toContain("Spend: Food 1200.5 $");
    expect(() => checkDashboard({ blocks: [{ type: "stats", items: [] }] })).toThrow(/nothing to show/);
  });

  it("Lyra makes a dashboard that remembers how to refresh, and Refresh rebuilds it", async () => {
    const provider = new FakeProvider([
      call("make_dashboard", SUBS),
      say("Here's your subscriptions dashboard."),
      // Refresh
      call("save_dashboard", { subtitle: "As of Nov 14", blocks: [{ type: "stats", items: [{ label: "Per month", value: "$69.48" }] }] }),
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    const { message } = await lyra.chat("make me a dashboard of my subscriptions", noop);
    expect(message.meta.docs).toEqual([{ id: 1, title: "Subscriptions", created: true, kind: "dashboard" }]);
    const d = lyra.doc(1)!;
    expect(d).toMatchObject({ kind: "dashboard", tainted: false, instructions: SUBS.refresh, refreshed_at: null });
    expect(JSON.parse(d.body).blocks[1].items[1]).toEqual({ label: "Spotify", value: 11.99 });

    const after = await lyra.refreshDashboard(1);
    expect(JSON.parse(after.body)).toEqual({ subtitle: "As of Nov 14", blocks: [{ type: "stats", items: [{ label: "Per month", value: "$69.48" }] }] });
    expect(after.refreshed_at).toBeTruthy();
    expect(after.tainted).toBe(false);
    // the refresh run saw how it's made and what it shows now
    const sys = provider.requests[2].system as string;
    expect(sys).toContain(SUBS.refresh);
    expect(sys).toContain("Per month: $84.97");
    expect(provider.requests[2].tools.map((t) => t.name)).toContain("save_dashboard");
    // dashboards stay in Lyra
    await expect(lyra.saveDocToGoogle(1)).rejects.toThrow(/stay in Lyra/);
  });

  it("a refresh that searched the web marks the dashboard as outside content", async () => {
    const provider = new FakeProvider([call("make_dashboard", SUBS), say("Done."), call("save_dashboard", { blocks: SUBS.blocks }, "c2", true)]);
    const lyra = await Lyra.start(platform({ provider }));
    await lyra.chat("dashboard of my subscriptions", noop);
    expect((await lyra.refreshDashboard(1)).tainted).toBe(true);
  });

  it("after reading the web, a dashboard is marked, its refresh isn't kept, and a clean one can't be replaced", async () => {
    const provider = new FakeProvider([
      call("make_dashboard", { ...SUBS, title: "Mine" }),
      say("Made it."),
      // a turn that searched the web
      call("make_dashboard", { ...SUBS, title: "Prices" }, "c2", true),
      call("update_dashboard", { id: 1, blocks: [{ type: "text", markdown: "replaced" }] }, "c3"),
      say("Done."),
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    await lyra.chat("make my subscriptions dashboard", noop);
    const { message } = await lyra.chat("make a dashboard of today's prices", noop);
    expect(lyra.doc(2)).toMatchObject({ kind: "dashboard", tainted: true, instructions: "" });
    expect(message.meta.tools).toContainEqual({ name: "update_dashboard", ok: false });
    expect(JSON.parse(lyra.doc(1)!.body).blocks).toHaveLength(2);
    await expect(lyra.refreshDashboard(2)).rejects.toThrow(/doesn't say how to refresh/);
  });

  it("docs and dashboards each change only with their own tool, and read_doc describes a dashboard", async () => {
    const provider = new FakeProvider([
      call("make_dashboard", SUBS),
      call("update_doc", { id: 1, append: "more" }, "c2"),
      call("read_doc", { id: 1 }, "c3"),
      say("ok"),
      say("hi"),
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    const { message } = await lyra.chat("subscriptions dashboard", noop);
    expect(message.meta.tools).toContainEqual({ name: "update_doc", ok: false });
    const read = provider.requests[3].messages.at(-1)!.parts[0] as { content: string };
    expect(read.content).toContain("# Subscriptions (dashboard)");
    expect(read.content).toContain("Each month: Netflix 15.49 $, Spotify 11.99 $");
    expect(read.content).toContain(`How it's refreshed: ${SUBS.refresh}`);
    await lyra.chat("thanks", noop);
    expect(provider.requests[4].system).toMatch(/- #1 Subscriptions \(dashboard, updated/);
  });

  it("the practice model makes a dashboard and refreshes it with made-up numbers it labels", async () => {
    const lyra = await Lyra.start(platform({ provider: new FakeProvider() }));
    const { message } = await lyra.chat("make a dashboard called Spending", noop);
    expect(message.content).toMatch(/practice numbers/i);
    expect(lyra.doc(1)).toMatchObject({ title: "Spending", kind: "dashboard" });
    const before = JSON.parse(lyra.doc(1)!.body);
    const after = await lyra.refreshDashboard(1);
    expect(JSON.parse(after.body).subtitle).toBe("New practice numbers");
    // new numbers every time, so Refresh visibly does something
    expect(JSON.parse(after.body).blocks[0]).not.toEqual(before.blocks[0]);
  });
});
