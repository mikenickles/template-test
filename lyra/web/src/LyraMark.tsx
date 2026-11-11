/** Lyra's mark: the Lyra constellation, with Vega as the bright star. */
const STARS: [number, number][] = [
  [21, 19],
  [35, 21.5],
  [31, 39],
  [16.5, 35.5],
];

export function LyraMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M14 7.5L21 19L35 21.5L31 39L16.5 35.5L21 19"
        stroke="var(--text)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
        fill="none"
      />
      <circle cx="14" cy="7.5" r="6.5" fill="var(--accent)" opacity="0.18" />
      <circle cx="14" cy="7.5" r="4" fill="var(--accent)" />
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="var(--text)" />
      ))}
    </svg>
  );
}
