import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { localDay, type UsageRow } from "../core/usage.ts";
import { bucketStarts, buildBuckets, buildSeries, compact, dayKey, niceScale, rangeDays } from "../web/src/usageData.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string, input: number, output: number): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end", usage: { input, output } });

describe("recording token usage", () => {
  it("adds up what each reply used, per day and model", async () => {
    const lyra = await Lyra.start(platform({ provider: new FakeProvider([say("One", 1200, 80), say("Two", 1500, 40)]) }));
    await lyra.chat("first", noop);
    await lyra.chat("second", noop);
    const today = localDay(new Date(), "America/Los_Angeles");
    expect(lyra.usage(today, today)).toEqual([{ day: today, provider: "fake", model: "fake", source: "chat", requests: 2, input: 2700, output: 120 }]);
    expect(lyra.usage("2000-01-01", "2000-01-02")).toEqual([]);
  });

  it("uses the user's local day, not UTC", () => {
    const lateEvening = new Date("2026-11-13T05:30:00Z"); // 9:30 PM on the 12th in Los Angeles
    expect(localDay(lateEvening, "America/Los_Angeles")).toBe("2026-11-12");
    expect(localDay(lateEvening, "UTC")).toBe("2026-11-13");
  });
});

describe("usage page data", () => {
  const row = (day: string, model: string, input: number, output = 0, provider = "anthropic"): UsageRow => ({ day, provider, model, source: "chat", requests: 1, input, output });
  const today = new Date(2026, 10, 12); // Thu Nov 12 2026

  it("makes 14 days, 12 weeks (Monday start) and 12 months, ending today", () => {
    expect(bucketStarts("daily", today).map(dayKey).slice(-2)).toEqual(["2026-11-11", "2026-11-12"]);
    expect(bucketStarts("daily", today)).toHaveLength(14);
    expect(dayKey(bucketStarts("weekly", today)[11])).toBe("2026-11-09");
    expect(dayKey(bucketStarts("monthly", today)[0])).toBe("2025-12-01");
    expect(rangeDays("monthly", today)).toEqual(["2025-12-01", "2026-11-12"]);
  });

  it("puts each day's tokens in the right bucket", () => {
    const rows = [row("2026-11-12", "sonnet", 1000, 200), row("2026-11-10", "sonnet", 500), row("2026-11-03", "haiku", 300), row("2026-10-20", "haiku", 50)];
    const series = buildSeries(rows);
    expect(series.map((s) => [s.label, s.total])).toEqual([["sonnet", 1700], ["haiku", 350]]);
    const daily = buildBuckets("daily", rows, series, today);
    expect(daily[13].values).toEqual({ "anthropic/sonnet": 1200 });
    expect(daily.reduce((n, b) => n + b.total, 0)).toBe(2000); // Oct 20 is outside 14 days
    const weekly = buildBuckets("weekly", rows, series, today);
    expect(weekly[11].total).toBe(1700); // week of Nov 9
    expect(weekly[10].total).toBe(300); // week of Nov 2
    const monthly = buildBuckets("monthly", rows, series, today);
    expect([monthly[10].total, monthly[11].total]).toEqual([50, 2000]);
  });

  it("keeps five series at most, folding the smallest into Other, and keeps a model's place across ranges", () => {
    const rows = ["a", "b", "c", "d", "e", "f", "g"].map((m, i) => row("2026-11-12", m, 1000 - i * 100));
    const series = buildSeries(rows);
    expect(series.map((s) => s.label)).toEqual(["a", "b", "c", "d", "Other models"]);
    expect(series[4].total).toBe(600 + 500 + 400);
    expect(buildBuckets("daily", rows, series, today)[13].values.other).toBe(1500);
    // "b" is biggest this week, but keeps slot 2 because of the wider order
    const order = series.map((s) => s.key);
    expect(buildSeries([row("2026-11-12", "b", 9000), row("2026-11-12", "a", 10)], order).map((s) => s.label)).toEqual(["a", "b"]);
  });

  it("formats big numbers and picks round axis steps", () => {
    expect([compact(980), compact(12_340), compact(456_000), compact(4_560_000)]).toEqual(["980", "12.3K", "456K", "4.56M"]);
    expect(niceScale(8400)).toEqual({ top: 10000, ticks: [0, 2500, 5000, 7500, 10000] });
    expect(niceScale(0).top).toBe(1000);
  });
});
