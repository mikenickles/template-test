// Lyra's face (0.58): a round face in your accent color that blinks, looks around and shows how
// it feels. Shapes are drawn on a 100-unit square; the expressions are CSS (`.face.mood-*` in
// styles.css), so a change of mood glides from one face to the next.
import { useId, type CSSProperties } from "react";
import { poke, useFace, type Mood } from "./mood";

export function Face({ mood: fixed, tap = true }: { mood?: Mood; tap?: boolean }) {
  const face = useFace();
  const mood = fixed ?? face.mood;
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const cls = `avatar face mood-${mood}${face.blink && !fixed ? " blink" : ""}`;
  const gaze = fixed ? { x: 0, y: 0 } : face;
  return (
    <svg
      className={cls}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ "--gx": gaze.x, "--gy": gaze.y } as CSSProperties}
      onPointerDown={tap && !fixed ? () => poke() : undefined}
    >
      <defs>
        <radialGradient id={id} cx="0.34" cy="0.26" r="0.86">
          <stop offset="0" className="face-hi" />
          <stop offset="0.55" className="face-mid" />
          <stop offset="1" className="face-lo" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      <ellipse className="face-shine" cx="33" cy="22" rx="15" ry="8" transform="rotate(-24 33 22)" />
      <g className="face-head">
        <g className="face-lower">
          <ellipse className="face-cheek" cx="25" cy="60" rx="7" ry="4.2" />
          <ellipse className="face-cheek" cx="75" cy="60" rx="7" ry="4.2" />
          <path className="face-mouth" d="M42 64 Q50 70 58 64" />
          <ellipse className="face-o" cx="50" cy="66.5" rx="4.2" ry="5.2" />
        </g>
        <g className="face-eyes">
          <g className="eye">
            <g className="eye-lid">
              <rect x="31.5" y="37.5" width="11" height="17" rx="5.5" />
              <circle className="eye-glint" cx="39.6" cy="41.8" r="2.2" />
            </g>
            <path className="eye-arc" d="M31 48 Q37 40 43 48" />
            <path className="eye-shut" d="M31 47 Q37 51.5 43 47" />
            <path className="brow brow-l" d="M31 32 Q37 30 43 32" />
          </g>
          <g className="eye">
            <g className="eye-lid">
              <rect x="57.5" y="37.5" width="11" height="17" rx="5.5" />
              <circle className="eye-glint" cx="65.6" cy="41.8" r="2.2" />
            </g>
            <path className="eye-arc" d="M57 48 Q63 40 69 48" />
            <path className="eye-shut" d="M57 47 Q63 51.5 69 47" />
            <path className="brow brow-r" d="M57 32 Q63 30 69 32" />
          </g>
        </g>
      </g>
      <path className="face-heart" d="M78 27c-2.6-2.4-6-4.6-6-7.8 0-1.9 1.5-3.2 3.1-3.2 1.2 0 2.3.7 2.9 1.7.6-1 1.7-1.7 2.9-1.7 1.6 0 3.1 1.3 3.1 3.2 0 3.2-3.4 5.4-6 7.8z" />
      <text className="face-z" x="72" y="30">z</text>
      <text className="face-z z2" x="80" y="20">z</text>
    </svg>
  );
}

/** Mixes two #rrggbb colors; t is the share of b. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** A still, calm face as an SVG file, for places outside the page (the home-screen widget). */
export function faceSvg(accent: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#f2705e";
  const ink = mix(hex, "#17171a", 0.86);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="160" height="160">
<defs><radialGradient id="g" cx="0.34" cy="0.26" r="0.86"><stop offset="0" stop-color="${mix(hex, "#ffffff", 0.5)}"/><stop offset="0.55" stop-color="${hex}"/><stop offset="1" stop-color="${mix(hex, "#000000", 0.22)}"/></radialGradient></defs>
<circle cx="50" cy="50" r="50" fill="url(#g)"/>
<ellipse cx="33" cy="22" rx="15" ry="8" transform="rotate(-24 33 22)" fill="#fff" opacity="0.26"/>
<g fill="${ink}"><rect x="31.5" y="37.5" width="11" height="17" rx="5.5"/><rect x="57.5" y="37.5" width="11" height="17" rx="5.5"/></g>
<g fill="#fff"><circle cx="39.6" cy="41.8" r="2.2"/><circle cx="65.6" cy="41.8" r="2.2"/></g>
<path d="M42 64 Q50 70 58 64" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}
