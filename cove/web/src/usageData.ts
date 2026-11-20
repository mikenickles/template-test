/** Turns usage rows into what the Usage page draws: buckets over time, and a stable set of series. */
import type { UsageRow } from "../../core/usage";

export type UsageRange = "daily" | "weekly" | "monthly";

export interface Series {
  /** provider/model, or "other" */
  key: string;
  label: string;
  provider: string;
  input: number;
  output: number;
  requests: number;
  total: number;
}

export interface Bucket {
  /** first local day of the bucket, YYYY-MM-DD */
  start: string;
  /** short axis label: "12", "Nov 3", "Nov" */
  label: string;
  /** full name for the tooltip: "Thu, Nov 12", "Week of Nov 3", "November 2026" */
  title: string;
  /** tokens per series key */
  values: Record<string, number>;
  total: number;
}

const MAX_SERIES = 5;
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Monday of the week a day falls in. */
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** The buckets a range shows, oldest first, ending with the one that holds today. */
export function bucketStarts(range: UsageRange, today: Date): Date[] {
  if (range === "daily") return Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  if (range === "weekly") return Array.from({ length: 12 }, (_, i) => addDays(weekStart(today), (i - 11) * 7));
  return Array.from({ length: 12 }, (_, i) => new Date(today.getFullYear(), today.getMonth() - 11 + i, 1));
}

/** The days to load for a range: [from, to], inclusive. */
export function rangeDays(range: UsageRange, today: Date): [string, string] {
  return [dayKey(bucketStarts(range, today)[0]), dayKey(today)];
}

function bucketOf(range: UsageRange, day: string): string {
  const d = fromKey(day);
  if (range === "daily") return day;
  if (range === "weekly") return dayKey(weekStart(d));
  return dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export const seriesKey = (r: { provider: string; model: string }) => `${r.provider}/${r.model}`;

/**
 * The models to show, biggest first. Beyond five, the rest fold into "Other".
 * `order` is the order from a wider view (all three ranges), so a model keeps
 * its color when the range changes.
 */
export function buildSeries(rows: UsageRow[], order: string[] = []): Series[] {
  const by = new Map<string, Series>();
  for (const r of rows) {
    const key = seriesKey(r);
    const s = by.get(key) ?? { key, label: r.provider === "fake" ? "Practice (estimate)" : r.model, provider: r.provider, input: 0, output: 0, requests: 0, total: 0 };
    s.input += r.input;
    s.output += r.output;
    s.requests += r.requests;
    s.total = s.input + s.output;
    by.set(key, s);
  }
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const all = [...by.values()].sort((a, b) => rank(a.key) - rank(b.key) || b.total - a.total);
  if (all.length <= MAX_SERIES) return all;
  const other: Series = { key: "other", label: "Other models", provider: "", input: 0, output: 0, requests: 0, total: 0 };
  for (const s of all.slice(MAX_SERIES - 1)) {
    other.input += s.input;
    other.output += s.output;
    other.requests += s.requests;
    other.total += s.total;
  }
  return [...all.slice(0, MAX_SERIES - 1), other];
}

export function buildBuckets(range: UsageRange, rows: UsageRow[], series: Series[], today: Date): Bucket[] {
  const keys = new Set(series.map((s) => s.key));
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o);
  const buckets = bucketStarts(range, today).map((d): Bucket => ({
    start: dayKey(d),
    label: range === "daily" ? String(d.getDate()) : range === "weekly" ? fmt(d, { month: "short", day: "numeric" }) : fmt(d, { month: "short" }),
    title:
      range === "daily"
        ? fmt(d, { weekday: "short", month: "short", day: "numeric" })
        : range === "weekly"
          ? `Week of ${fmt(d, { month: "short", day: "numeric" })}`
          : fmt(d, { month: "long", year: "numeric" }),
    values: {},
    total: 0,
  }));
  const at = new Map(buckets.map((b) => [b.start, b]));
  for (const r of rows) {
    const b = at.get(bucketOf(range, r.day));
    if (!b) continue;
    const key = keys.has(seriesKey(r)) ? seriesKey(r) : "other";
    const n = r.input + r.output;
    b.values[key] = (b.values[key] ?? 0) + n;
    b.total += n;
  }
  return buckets;
}

/** 1,234 · 12.3K · 4.56M: short enough for an axis or a tile. */
export function compact(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

/** A round number at or above the biggest bar, and the gridlines under it. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1000, ticks: [0, 500, 1000] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}
