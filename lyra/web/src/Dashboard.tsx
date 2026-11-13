// A dashboard Lyra made: data drawn by these components (never code Lyra wrote).
// One series per chart in --series-1, value labels or a table so nothing rests on color,
// thin marks with rounded data ends, a tap/hover tooltip on the line chart.
import { useLayoutEffect, useRef, useState } from "react";
import type { Block, Dashboard as Dash } from "../../core/dashboard";
import { Check } from "./icons";
import { DocMarkdown } from "./markdown";
import { compact, niceScale } from "./usageData";

const PREFIX = new Set(["$", "€", "£", "¥", "₹"]);

/** 1,234.5 with its unit: "$84.97", "12 kg", "3.2K steps". */
export function withUnit(v: number, unit?: string): string {
  const n = Math.abs(v) >= 10_000 ? compact(Math.abs(v)) : Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sign = v < 0 ? "−" : "";
  if (!unit) return `${sign}${n}`;
  return PREFIX.has(unit) ? `${sign}${unit}${n}` : unit === "%" ? `${sign}${n}%` : `${sign}${n} ${unit}`;
}

export function DashboardView({ d }: { d: Dash }) {
  return (
    <div className="dash">
      {d.blocks.map((b, i) => (
        <DashBlock key={i} b={b} />
      ))}
    </div>
  );
}

function DashBlock({ b }: { b: Block }) {
  switch (b.type) {
    case "stats":
      return (
        <div className={`dash-stats n-${b.items.length}`}>
          {b.items.map((s, i) => (
            <div className="dash-stat" key={i}>
              <span className="dash-stat-label">{s.label}</span>
              <span className="dash-stat-value">{s.value}</span>
              {s.note && <span className="dash-stat-note">{s.note}</span>}
            </div>
          ))}
        </div>
      );
    case "bar":
      return <Bars b={b} />;
    case "line":
      return <Line b={b} />;
    case "table":
      return (
        <section className="dash-card">
          {b.title && <h3 className="dash-title">{b.title}</h3>}
          <Table columns={b.columns} rows={b.rows} />
        </section>
      );
    case "list":
      return (
        <section className="dash-card">
          {b.title && <h3 className="dash-title">{b.title}</h3>}
          <ul className="dash-list">
            {b.items.map((it, i) => (
              <li key={i} className={it.done ? "done" : ""}>
                <span className="dash-box" aria-label={it.done ? "Done" : undefined}>
                  {it.done && <Check size={12} />}
                </span>
                <span className="dash-list-text">{it.text}</span>
                {it.note && <span className="dash-list-note">{it.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      );
    case "progress":
      return (
        <section className="dash-card">
          {b.title && <h3 className="dash-title">{b.title}</h3>}
          {b.items.map((p, i) => {
            const pct = Math.max(0, Math.min(100, (p.value / p.max) * 100));
            return (
              <div className="dash-progress" key={i}>
                <div className="dash-progress-row">
                  <span>{p.label}</span>
                  <span className="dash-num">
                    {p.value.toLocaleString("en-US", { maximumFractionDigits: 2 })} of {p.max.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="dash-track" role="progressbar" aria-label={p.label} aria-valuenow={p.value} aria-valuemin={0} aria-valuemax={p.max}>
                  <div className="dash-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </section>
      );
    case "text":
      return (
        <section className="dash-card dash-text">
          <DocMarkdown text={b.markdown} />
        </section>
      );
  }
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars, biggest first as given, each with its value: readable without color. */
function Bars({ b }: { b: Extract<Block, { type: "bar" }> }) {
  const max = Math.max(...b.items.map((i) => i.value), 0) || 1;
  return (
    <section className="dash-card">
      {b.title && <h3 className="dash-title">{b.title}</h3>}
      <div className="dash-bars">
        {b.items.map((it, i) => (
          <div className="dash-bar" key={i}>
            <span className="dash-bar-label">{it.label}</span>
            <span className="dash-bar-track">
              <span className="dash-bar-fill" style={{ width: `${Math.max(it.value > 0 ? 1.5 : 0, (Math.max(0, it.value) / max) * 100)}%` }} />
            </span>
            <span className="dash-num">{withUnit(it.value, b.unit)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const H = 180;
const TOP = 12;
const BOTTOM = 24;
const LEFT = 44;

/** One series over time: a 2px line, 8px markers, a tap/hover tooltip, and the numbers as a table on request. */
function Line({ b }: { b: Extract<Block, { type: "line" }> }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(el.clientWidth);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el);
    return () => watch.disconnect();
  }, [table]);

  const values = b.points.map((p) => p.value);
  const hi = niceScale(Math.max(...values, 0));
  const lo = Math.min(...values) < 0 ? -niceScale(-Math.min(...values)).top : 0;
  const ticks = lo < 0 ? [lo, 0, hi.top] : hi.ticks;
  const plotW = w - LEFT - 12;
  const plotH = H - TOP - BOTTOM;
  const step = plotW / Math.max(1, b.points.length - 1);
  const x = (i: number) => LEFT + step * i;
  const y = (v: number) => TOP + plotH - ((v - lo) / (hi.top - lo)) * plotH;
  // labels: first, last, and evenly between when there's room
  const every = Math.max(1, Math.ceil(46 / step));
  const showMarkers = b.points.length <= 24;
  const p = hover === null ? null : b.points[hover];

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        {b.title && <h3 className="dash-title">{b.title}</h3>}
        <button className="link-btn dash-switch" onClick={() => setTable(!table)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <Table columns={["", b.title || "Value"]} rows={b.points.map((pt) => [pt.label, withUnit(pt.value, b.unit)])} />
      ) : (
        <div className="usage-plot dash-plot" ref={box} onPointerLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label={`${b.title || "Line chart"}: ${b.points.map((pt) => `${pt.label} ${withUnit(pt.value, b.unit)}`).join(", ")}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={w - 4} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
                <text x={LEFT - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                  {withUnit(t, b.unit && PREFIX.has(b.unit) ? b.unit : undefined)}
                </text>
              </g>
            ))}
            {hover !== null && <line className="dash-cross" x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + plotH} />}
            <polyline className="dash-line" points={b.points.map((pt, i) => `${x(i)},${y(pt.value)}`).join(" ")} />
            {b.points.map((pt, i) => (
              <g key={i}>
                {(showMarkers || hover === i) && <circle className={`dash-dot${hover === i ? " on" : ""}`} cx={x(i)} cy={y(pt.value)} r={hover === i ? 5 : 4} />}
                {(i === b.points.length - 1 || (i % every === 0 && b.points.length - 1 - i >= every)) && (
                  <text x={x(i)} y={H - 6} className="tick" textAnchor={i === 0 ? "start" : i === b.points.length - 1 ? "end" : "middle"}>
                    {pt.label}
                  </text>
                )}
                <rect x={x(i) - step / 2} y={TOP} width={Math.max(step, 12)} height={plotH + BOTTOM} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            ))}
          </svg>
          {p && hover !== null && (
            <div className="usage-tip dash-tip" role="status" style={{ left: Math.min(Math.max(x(hover), 70), w - 70) }}>
              <div className="tip-title">{p.label}</div>
              <div className="tip-row">
                <span className="tip-name">{b.title || "Value"}</span>
                <span className="tip-val">{withUnit(p.value, b.unit)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
