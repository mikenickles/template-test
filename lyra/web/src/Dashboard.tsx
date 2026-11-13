// A dashboard Lyra made: data drawn by these components (never code Lyra wrote), in the
// app's own look so it reads as part of Lyra: a headline number like Today's, section
// labels over cards like Tasks and Settings, the user's accent on pill tracks and lines,
// the Tasks check circles, an ink tooltip like the toasts. One series per chart; every
// value is written out (or one tap away), so nothing rests on color.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Block, Dashboard as Dash } from "../../core/dashboard";
import { CheckCircle } from "./icons";
import { DocMarkdown } from "./markdown";
import { compact, niceScale } from "./usageData";

const PREFIX = new Set(["$", "€", "£", "¥", "₹"]);
const plain = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** 1,234.5 with its unit: "$84.97", "12 kg", "3.2K steps". */
export function withUnit(v: number, unit?: string): string {
  const n = Math.abs(v) >= 10_000 ? compact(Math.abs(v)) : plain(Math.abs(v));
  const sign = v < 0 ? "−" : "";
  if (!unit) return `${sign}${n}`;
  return PREFIX.has(unit) ? `${sign}${unit}${n}` : unit === "%" ? `${sign}${n}%` : `${sign}${n} ${unit}`;
}

/** The first stat leads the page like Today's headline; the rest follow as tiles. */
export function DashboardView({ d }: { d: Dash }) {
  const first = d.blocks[0];
  const hero = first?.type === "stats" ? first.items[0] : null;
  const blocks = hero && first.type === "stats" ? [{ ...first, items: first.items.slice(1) }, ...d.blocks.slice(1)] : d.blocks;
  return (
    <div className="dash">
      {hero && (
        <div className="dash-hero">
          <span className="dash-hero-label">{hero.label}</span>
          <span className="dash-hero-value">{hero.value}</span>
          {hero.note && <span className="dash-hero-note">{hero.note}</span>}
        </div>
      )}
      {blocks.map((b, i) => (b.type === "stats" && !b.items.length ? null : <DashBlock key={i} b={b} />))}
    </div>
  );
}

/** A section label over a card, the way Tasks and Settings group things. */
function Section({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className="dash-section">
      {(title || aside) && (
        <div className="dash-section-head">
          <h3 className="section-label">{title}</h3>
          {aside}
        </div>
      )}
      <div className={`dash-card ${className}`}>{children}</div>
    </section>
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
    case "bar": {
      const max = Math.max(...b.items.map((i) => i.value), 0) || 1;
      return (
        <Section title={b.title}>
          {b.items.map((it, i) => (
            <Meter key={i} className="dash-bar" label={it.label} value={withUnit(it.value, b.unit)} pct={(Math.max(0, it.value) / max) * 100} />
          ))}
        </Section>
      );
    }
    case "progress":
      return (
        <Section title={b.title}>
          {b.items.map((p, i) => (
            <Meter
              key={i}
              className="dash-progress"
              label={p.label}
              value={`${plain(p.value)} of ${plain(p.max)}`}
              pct={(p.value / p.max) * 100}
              bar={{ role: "progressbar", "aria-label": p.label, "aria-valuenow": p.value, "aria-valuemin": 0, "aria-valuemax": p.max }}
            />
          ))}
        </Section>
      );
    case "line":
      return <Line b={b} />;
    case "table":
      return (
        <Section title={b.title} className="dash-card-flush">
          <Table columns={b.columns} rows={b.rows} />
        </Section>
      );
    case "list":
      return (
        <Section title={b.title} className="dash-card-flush">
          <ul className="dash-list">
            {b.items.map((it, i) => (
              <li key={i} className={it.done ? "done" : ""}>
                <span className="dash-check" role="img" aria-label={it.done ? "Done" : "Not done"}>
                  <CheckCircle done={it.done} size={22} />
                </span>
                <span className="dash-list-text">{it.text}</span>
                {it.note && <span className="dash-list-note">{it.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      );
    case "text":
      return (
        <div className="dash-note">
          <DocMarkdown text={b.markdown} />
        </div>
      );
  }
}

/** Label and value on one line, a pill track in the accent below: bars and progress alike. */
function Meter({ label, value, pct, className, bar }: { label: string; value: string; pct: number; className: string; bar?: Record<string, unknown> }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={`dash-meter ${className}`}>
      <div className="dash-meter-top">
        <span className="dash-meter-label">{label}</span>
        <span className="dash-num">{value}</span>
      </div>
      <div className="dash-track" {...bar}>
        {w > 0 && <div className="dash-fill" style={{ width: `max(${w}%, 10px)` }} />}
      </div>
    </div>
  );
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

const H = 180;
const TOP = 22;
const BOTTOM = 24;
const LEFT = 40;
const RIGHT = 14;

/** One series over time: the accent line with a soft fill, the latest value labelled, a tap tooltip, and a table on request. */
function Line({ b }: { b: Extract<Block, { type: "line" }> }) {
  const box = useRef<HTMLDivElement>(null);
  const fade = useId().replace(/:/g, "");
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
  const max = Math.max(...values);
  const min = Math.min(...values);
  // nothing above zero: the axis ends at zero (all negative), or at 1 (all zeros), not at a made-up 1,000
  const hi = max > 0 ? niceScale(max) : { top: min < 0 ? 0 : 1, ticks: [0, 1] };
  const lo = min < 0 ? -niceScale(-min).top : 0;
  const ticks = lo < 0 ? [lo, 0, hi.top] : hi.ticks;
  const plotW = w - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const step = plotW / Math.max(1, b.points.length - 1);
  const x = (i: number) => LEFT + step * i;
  const y = (v: number) => TOP + plotH - ((v - lo) / (hi.top - lo)) * plotH;
  // axis labels: the last one always, others evenly where there's room
  const every = Math.max(1, Math.ceil(46 / step));
  const showDots = b.points.length <= 24;
  const lastI = b.points.length - 1;
  const last = b.points[lastI];
  const line = b.points.map((pt, i) => `${x(i)},${y(pt.value)}`).join(" ");
  const p = hover === null ? null : b.points[hover];
  const unitTick = b.unit && PREFIX.has(b.unit) ? b.unit : undefined;

  return (
    <Section
      title={b.title}
      aside={
        <button className="link-btn dash-switch" onClick={() => setTable(!table)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      }
      className={table ? "dash-card-flush" : ""}
    >
      {table ? (
        <Table columns={["", b.title || "Value"]} rows={b.points.map((pt) => [pt.label, withUnit(pt.value, b.unit)])} />
      ) : (
        <div className="usage-plot dash-plot" ref={box} onPointerLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label={`${b.title || "Line chart"}: ${b.points.map((pt) => `${pt.label} ${withUnit(pt.value, b.unit)}`).join(", ")}`}>
            <defs>
              <linearGradient id={fade} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.32 }} />
                <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={w - 4} y1={y(t)} y2={y(t)} className={t === 0 ? "dash-axis" : "dash-grid"} />
                <text x={LEFT - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                  {withUnit(t, unitTick)}
                </text>
              </g>
            ))}
            <polygon className="dash-area" points={`${x(0)},${y(Math.max(lo, 0))} ${line} ${x(lastI)},${y(Math.max(lo, 0))}`} fill={`url(#${fade})`} />
            {hover !== null && <line className="dash-cross" x1={x(hover)} x2={x(hover)} y1={TOP - 6} y2={TOP + plotH} />}
            <polyline className="dash-line" points={line} />
            {b.points.map((pt, i) =>
              showDots || i === lastI || i === hover ? (
                <circle key={i} className={`dash-dot${i === lastI ? " last" : ""}${i === hover ? " on" : ""}`} cx={x(i)} cy={y(pt.value)} r={i === lastI || i === hover ? 5.5 : 4} />
              ) : null,
            )}
            {hover === null && (
              <text x={x(lastI)} y={Math.max(12, y(last.value) - 13)} className="dash-last" textAnchor="end">
                {withUnit(last.value, b.unit)}
              </text>
            )}
            {b.points.map((pt, i) =>
              i === lastI || (i % every === 0 && lastI - i >= every) ? (
                <text key={`l${i}`} x={x(i)} y={H - 6} className="tick" textAnchor={i === 0 ? "start" : i === lastI ? "end" : "middle"}>
                  {pt.label}
                </text>
              ) : null,
            )}
            {b.points.map((_, i) => (
              <rect
                key={`h${i}`}
                x={x(i) - step / 2}
                y={0}
                width={Math.max(step, 12)}
                height={H}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              />
            ))}
          </svg>
          {p && hover !== null && (
            <div className="dash-tip" role="status" style={{ left: Math.min(Math.max(x(hover), 60), w - 60) }}>
              <b>{withUnit(p.value, b.unit)}</b>
              <span>{p.label}</span>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
