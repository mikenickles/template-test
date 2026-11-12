import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UsageRow } from "../../../core/usage";
import { LIVE_PRICE_PER_MINUTE } from "../../../core/live";
import { api } from "../api";
import { buildBuckets, buildSeries, compact, niceScale, rangeDays, type Bucket, type Series, type UsageRange } from "../usageData";

const RANGES: { id: UsageRange; label: string; span: string }[] = [
  { id: "daily", label: "Daily", span: "Last 14 days" },
  { id: "weekly", label: "Weekly", span: "Last 12 weeks" },
  { id: "monthly", label: "Monthly", span: "Last 12 months" },
];
const full = (n: number) => Math.round(n).toLocaleString("en-US");
const colorOf = (i: number, key: string) => (key === "other" ? "var(--series-other)" : `var(--series-${i + 1})`);

/** Settings → Usage: tokens per model over time, as the providers counted them. */
export function Usage() {
  const [range, setRange] = useState<UsageRange>("daily");
  const [all, setAll] = useState<UsageRow[] | null>(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    // the widest range holds the other two
    const [from, to] = rangeDays("monthly", today);
    api.usage(from, to).then(setAll, () => setAll([]));
  }, [today]);

  const view = useMemo(() => {
    if (!all) return null;
    const [from] = rangeDays(range, today);
    // live voice is billed by the minute, not in tokens: it gets its own line, outside the graph
    const voiceSeconds = all.filter((r) => r.day >= from && r.source === "voice").reduce((n, r) => n + r.input, 0);
    const tokens = all.filter((r) => r.source !== "voice");
    const rows = tokens.filter((r) => r.day >= from);
    // a model keeps its color whichever range is showing
    const order = buildSeries(tokens).map((s) => s.key);
    const series = buildSeries(rows, order);
    const slot = (s: Series) => (s.key === "other" ? -1 : order.indexOf(s.key));
    const sources = { chat: 0, worker: 0, routine: 0 };
    for (const r of rows) if (r.source !== "voice") sources[r.source] += r.input + r.output;
    return { rows, series, slot, buckets: buildBuckets(range, rows, series, today), sources, voiceSeconds };
  }, [all, range, today]);

  if (!view) return <p className="hint">Loading…</p>;
  const total = view.series.reduce((n, s) => n + s.total, 0);
  const sum = (k: "input" | "output" | "requests") => view.series.reduce((n, s) => n + s[k], 0);
  const span = RANGES.find((r) => r.id === range)!.span;
  const parts = ([["Chat", view.sources.chat], ["Workers", view.sources.worker], ["Routines", view.sources.routine]] as const).filter(([, n]) => n > 0);

  return (
    <div className="usage">
      <div className="seg" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? "on" : ""} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="usage-tiles">
        <div className="usage-tile hero">
          <span className="usage-num" title={`${full(total)} tokens`}>
            {compact(total)}
          </span>
          <span className="usage-cap">tokens · {span.toLowerCase()}</span>
        </div>
        <div className="usage-tile">
          <span className="usage-num sm">{compact(sum("input"))}</span>
          <span className="usage-cap">sent</span>
        </div>
        <div className="usage-tile">
          <span className="usage-num sm">{compact(sum("output"))}</span>
          <span className="usage-cap">written</span>
        </div>
        <div className="usage-tile">
          <span className="usage-num sm">{full(sum("requests"))}</span>
          <span className="usage-cap">requests</span>
        </div>
      </div>

      {view.voiceSeconds > 0 && (
        <div className="group" style={{ marginBottom: 20 }}>
          <div className="item">
            <span className="body">
              <div className="title">Live voice</div>
              <div className="sub">
                {Math.max(1, Math.round(view.voiceSeconds / 60))} min with GPT-Live · about ${((view.voiceSeconds / 60) * LIVE_PRICE_PER_MINUTE).toFixed(2)} at ${LIVE_PRICE_PER_MINUTE.toFixed(2)} a minute
              </div>
            </span>
          </div>
        </div>
      )}
      {total === 0 ? (
        <p className="mem-empty">No usage in this period yet. Lyra counts tokens from every reply, worker and routine, starting with this version.</p>
      ) : (
        <>
          <figure className="usage-chart">
            <figcaption className="usage-title">Tokens per {range === "daily" ? "day" : range === "weekly" ? "week" : "month"}, by model</figcaption>
            {view.series.length > 1 && (
              <ul className="usage-legend" aria-label="Models">
                {view.series.map((s) => (
                  <li key={s.key}>
                    <span className="swatch-key" style={{ background: colorOf(view.slot(s), s.key) }} />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            <Chart buckets={view.buckets} series={view.series} slot={view.slot} dense={range === "weekly"} />
          </figure>

          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Requests</th>
                  <th scope="col" className="col-wide">Sent</th>
                  <th scope="col" className="col-wide">Written</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {view.series.map((s) => (
                  <tr key={s.key}>
                    <th scope="row">
                      <span className="swatch-key" style={{ background: colorOf(view.slot(s), s.key) }} />
                      <span>
                        {s.label}
                        <span className="usage-sub">
                          {full(s.input)} sent · {full(s.output)} written
                        </span>
                      </span>
                    </th>
                    <td>{full(s.requests)}</td>
                    <td className="col-wide">{full(s.input)}</td>
                    <td className="col-wide">{full(s.output)}</td>
                    <td className="strong">{full(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parts.length > 1 && <p className="hint">{parts.map(([name, n]) => `${name} ${Math.round((n / total) * 100)}%`).join(" · ")}</p>}
        </>
      )}
      <p className="hint">Counts are what each provider reported for Lyra's requests on your synced devices. "Sent" is everything the model read (your message, memory, history); "written" is its reply. Your provider's bill is the final word on cost.</p>
    </div>
  );
}

const H = 220;
const TOP = 12;
const BOTTOM = 26;
const LEFT = 44;

function Chart({ buckets, series, slot, dense }: { buckets: Bucket[]; series: Series[]; slot: (s: Series) => number; dense: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(el.clientWidth);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const { top, ticks } = niceScale(Math.max(...buckets.map((b) => b.total)));
  const plotW = w - LEFT - 4;
  const plotH = H - TOP - BOTTOM;
  const step = plotW / buckets.length;
  const barW = Math.max(6, Math.min(26, step * 0.62));
  const y = (v: number) => TOP + plotH - (v / top) * plotH;
  // every label when there's room, otherwise every other one (always the latest)
  const every = dense && step < 46 ? 2 : 1;
  const b = hover === null ? null : buckets[hover];

  return (
    <div className="usage-plot" ref={box} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Stacked bars of tokens over time, by model. The table below has the numbers.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={w - 4} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={LEFT - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {compact(t)}
            </text>
          </g>
        ))}
        {buckets.map((bk, i) => {
          const cx = LEFT + step * i + step / 2;
          let acc = 0;
          const segs = series.filter((s) => bk.values[s.key]).map((s) => {
            const from = acc;
            acc += bk.values[s.key];
            return { s, y0: y(from), y1: y(acc) };
          });
          return (
            <g key={bk.start} className={hover !== null && hover !== i ? "dim" : ""}>
              {segs.map(({ s, y0, y1 }, j) => {
                const last = j === segs.length - 1;
                // a 2px surface gap between segments; the top end is rounded
                const hgt = Math.max(1, y0 - y1 - (last ? 0 : 2));
                const yy = y0 - hgt;
                const r = last ? Math.min(4, hgt, barW / 2) : 0;
                const x = cx - barW / 2;
                return (
                  <path
                    key={s.key}
                    d={`M${x},${yy + hgt}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + barW - r}Q${x + barW},${yy} ${x + barW},${yy + r}V${yy + hgt}Z`}
                    fill={s.key === "other" ? "var(--series-other)" : `var(--series-${slot(s) + 1})`}
                  />
                );
              })}
              {(buckets.length - 1 - i) % every === 0 && (
                <text x={cx} y={H - 8} className="tick" textAnchor="middle">
                  {bk.label}
                </text>
              )}
              <rect x={LEFT + step * i} y={TOP} width={step} height={plotH + BOTTOM} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {b && hover !== null && (
        <div className="usage-tip" role="status" style={{ left: Math.min(Math.max(LEFT + step * hover + step / 2, 96), w - 96) }}>
          <div className="tip-title">{b.title}</div>
          {b.total === 0 ? (
            <div className="tip-row muted">No usage</div>
          ) : (
            <>
              {series
                .filter((s) => b.values[s.key])
                .map((s) => (
                  <div className="tip-row" key={s.key}>
                    <span className="swatch-key" style={{ background: s.key === "other" ? "var(--series-other)" : `var(--series-${slot(s) + 1})` }} />
                    <span className="tip-name">{s.label}</span>
                    <span className="tip-val">{full(b.values[s.key])}</span>
                  </div>
                ))}
              {series.filter((s) => b.values[s.key]).length > 1 && (
                <div className="tip-row total">
                  <span className="tip-name">Total</span>
                  <span className="tip-val">{full(b.total)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
