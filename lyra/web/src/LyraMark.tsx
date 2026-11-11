/**
 * Lyra's identity is the Lyra constellation: Vega, the bright star,
 * and the small parallelogram below it. Three uses:
 *  - LyraMark: the mark inside the night-sky orb (top bar, pages)
 *  - StarChart: a larger, labelled drawing for the welcome screen
 *  - Thinking: the stars light up one by one while Lyra works
 */

const VEGA: [number, number] = [14, 7.5];
const STARS: [number, number][] = [
  [21, 19],
  [35, 21.5],
  [31, 39],
  [16.5, 35.5],
];
const PATH = "M14 7.5L21 19L35 21.5L31 39L16.5 35.5L21 19";

export function LyraMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 -1 48 48" aria-hidden="true">
      <path d={PATH} stroke="var(--orb-line)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle className="vega vega-halo" cx={VEGA[0]} cy={VEGA[1]} r="6.5" fill="var(--accent)" opacity="0.3" />
      <circle cx={VEGA[0]} cy={VEGA[1]} r="4.2" fill="var(--accent)" />
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="var(--orb-star)" />
      ))}
    </svg>
  );
}

export function Orb({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span className={`orb orb-${size}`}>
      <LyraMark size={size === "lg" ? 52 : 30} />
    </span>
  );
}

/** A small star chart of Lyra, the way an old atlas would label it. */
export function StarChart() {
  // chart coordinates: the mark's geometry scaled up, plus a few faint field stars
  const s = 4.4;
  const ox = 30;
  const oy = 14;
  const p = (x: number, y: number) => [ox + x * s, oy + y * s] as const;
  const [vx, vy] = p(...VEGA);
  const pts = STARS.map(([x, y]) => p(x, y));
  const field: [number, number, number][] = [
    [212, 30, 1.2],
    [250, 120, 1],
    [190, 196, 1.4],
    [40, 150, 1],
    [118, 18, 0.9],
    [262, 64, 1.6],
    [70, 210, 1.1],
  ];
  return (
    <svg className="chart" viewBox="0 0 300 230" role="img" aria-label="The Lyra constellation">
      <circle cx={vx} cy={vy} r="26" fill="none" stroke="var(--chart-line)" strokeWidth="1" strokeDasharray="2 4" />
      <path
        d={`M${vx} ${vy}L${pts[0].join(" ")}L${pts[1].join(" ")}L${pts[2].join(" ")}L${pts[3].join(" ")}L${pts[0].join(" ")}`}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {field.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="var(--text-muted)" opacity="0.5" />
      ))}
      <circle cx={vx} cy={vy} r="11" fill="var(--accent)" opacity="0.3" />
      <circle cx={vx} cy={vy} r="7" fill="var(--accent)" />
      {pts.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="var(--text)" />
      ))}
      <text x={vx + 34} y={vy + 4}>VEGA</text>
      <text x={pts[1][0] + 10} y={pts[1][1] + 4}>ζ LYR</text>
      <text x={pts[3][0] - 8} y={pts[3][1] + 20}>β</text>
      <text x={pts[2][0] + 10} y={pts[2][1] + 4}>γ</text>
    </svg>
  );
}

export function Thinking({ label }: { label?: string }) {
  return (
    <div className="thinking" role="status">
      <svg width="30" height="30" viewBox="0 -1 48 48" aria-hidden="true">
        <path d={PATH} stroke="var(--border)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle className="star" cx={VEGA[0]} cy={VEGA[1]} r="4.5" fill="var(--accent-text)" />
        {STARS.map(([x, y]) => (
          <circle className="star" key={`${x}-${y}`} cx={x} cy={y} r="3" fill="var(--text)" />
        ))}
      </svg>
      <span>{label ? `${label}…` : "Thinking…"}</span>
    </div>
  );
}
