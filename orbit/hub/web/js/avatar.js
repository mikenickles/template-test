// Agent avatars, drawn the same way as on the phone: one flat shape, one color, two eyes.
// Every shape is its distance from the center at each angle, sampled once.
import { h } from '/vendor/preact.mjs';
import htm from '/vendor/htm.mjs';

const html = htm.bind(h);

export const PALETTE = [
  ['#FF6B57', '#C2410C'], ['#FF9F2E', '#B45309'], ['#FFD233', '#A16207'], ['#93E04B', '#4D7C0F'], ['#2FD9A0', '#047857'],
  ['#38C6F4', '#0E7490'], ['#5E8BFF', '#1D4ED8'], ['#9B7CFF', '#6D28D9'], ['#D07CFF', '#A21CAF'], ['#FF6FB5', '#BE185D'],
];
const GRAPHITE = ['#A3A8B4', '#52525B'];
export const SHAPES = 5;
export const EYES = 8;
export const FORMER = { shape: 0, color: -1, eyes: 7 };
const INK = '#0B0B0F';
const SAMPLES = 160;
const EXTENT = [1, 0.9, 1.04, 0.95, 1];

const mod = (n, m) => ((n % m) + m) % m;
const swatch = (spec) => (spec.color === -1 ? GRAPHITE : PALETTE[mod(spec.color ?? 0, PALETTE.length)]);
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** The agent's color as text: the fill on dark pages, a deeper shade on light ones. */
export const inkColor = (spec) => swatch(spec ?? FORMER)[dark() ? 0 : 1];
export const tint = (spec) => swatch(spec ?? FORMER)[0];

export function randomAvatar() {
  const r = (n) => Math.floor(Math.random() * n);
  return { shape: r(SHAPES), color: r(PALETTE.length), eyes: r(EYES) };
}

const superellipse = (a, n) => (Math.abs(Math.cos(a)) ** n + Math.abs(Math.sin(a)) ** n) ** (-1 / n);

function bubble(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (c >= 0 || s <= 0) return 1;
  const k = 0.22;
  const ux = Math.abs(c);
  const uy = Math.abs(s);
  let t = 1 / Math.max(ux, uy);
  if (t * ux > 1 - k && t * uy > 1 - k) {
    const d = (ux + uy) * (1 - k);
    t = d + Math.sqrt(d * d - 2 * (1 - k) * (1 - k) + k * k);
  }
  return t;
}

function outline(shape, a) {
  switch (shape) {
    case 0: return 1;
    case 1: return superellipse(a, 3.8);
    case 2: return superellipse(a - Math.PI / 4, 2.7) / Math.SQRT2 ** (1 - 2 / 2.7);
    case 3: return bubble(a);
    default: return 0.93 + 0.07 * Math.cos(8 * a);
  }
}

const PATHS = Array.from({ length: SHAPES }, (_, shape) => {
  let d = '';
  for (let i = 0; i < SAMPLES; i++) {
    const a = (2 * Math.PI * i) / SAMPLES;
    const r = outline(shape, a) * EXTENT[shape] * 50;
    d += `${i ? 'L' : 'M'}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
});

function mix(hex, toward, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = toward === 'white' ? 0xffffff : 0;
  const ch = (v, s) => (v >> s) & 255;
  const c = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

function eyes(style, size, base) {
  const k = size < 28 ? 1.28 : 1;
  const kind = size < 24 && (style === 4 || style === 5) ? 0 : style;
  const u = 100 * k;
  const cx = 50;
  const y = 48.5;
  const pair = (half) => [cx - 100 * half * (1 + (k - 1) * 0.5), cx + 100 * half * (1 + (k - 1) * 0.5)];
  const capsule = (x, w, hh) => html`<rect x=${x - w / 2} y=${y - hh / 2} width=${w} height=${hh} rx=${Math.min(w, hh) / 2} fill=${INK} />`;
  const arc = (x) => {
    const w = u * 0.13;
    const r = w / 2;
    const ccy = y - w * 0.28 + r;
    const at = (deg) => [x + r * Math.cos((deg * Math.PI) / 180), ccy + r * Math.sin((deg * Math.PI) / 180)];
    const [x1, y1] = at(200);
    const [x2, y2] = at(340);
    return html`<path d=${`M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`} stroke=${INK} stroke-width=${u * 0.075} stroke-linecap="round" fill="none" />`;
  };
  const dot = (x) => html`<circle cx=${x} cy=${y} r=${u * 0.07} fill=${INK} />`;
  switch (kind) {
    case 0: return pair(0.135).map(dot);
    case 1: return pair(0.135).map((x) => capsule(x, u * 0.105, u * 0.215));
    case 2: return pair(0.145).map(arc);
    case 3: { const [l, r] = pair(0.145); return [arc(l), dot(r)]; }
    case 4: return pair(0.155).map((x) => {
      const L = u * 0.115;
      const S = u * 0.03;
      return html`<path d=${`M${x} ${y - L}Q${x + S} ${y - S} ${x + L} ${y}Q${x + S} ${y + S} ${x} ${y + L}Q${x - S} ${y + S} ${x - L} ${y}Q${x - S} ${y - S} ${x} ${y - L}Z`} fill=${INK} />`;
    });
    case 5: return pair(0.16).flatMap((x) => [
      html`<circle cx=${x} cy=${y} r=${u * 0.092} fill=${INK} />`,
      size >= 32 ? html`<circle cx=${x + u * 0.03} cy=${y - u * 0.032} r=${u * 0.03} fill="#fff" />` : null,
    ]);
    case 6: return [
      capsule(cx, 58, u * 0.2),
      ...[cx - 14, cx + 14].map((x) => html`<circle cx=${x} cy=${y} r=${u * 0.042} fill=${mix(base, 'white', 0.25)} />`),
    ];
    default: return pair(0.145).map((x) => capsule(x, u * 0.15, u * 0.075));
  }
}

let ids = 0;

/** An agent's face. [thinking] adds a small moon on an orbit; [ring] outlines it in a color. */
export function Avatar({ spec, size = 40, thinking = false, ring = null, style = '' }) {
  const s = spec ?? FORMER;
  const base = swatch(s)[0];
  const id = `g${++ids}`;
  const isDark = dark();
  const [from, to] = isDark ? [mix(base, 'white', 0.2), base] : [base, mix(base, 'black', 0.1)];
  const path = PATHS[mod(s.shape ?? 0, SHAPES)];
  return html`<svg class="avatar" width=${size} height=${size} viewBox="0 0 100 100" style=${style} aria-hidden="true">
    <defs><linearGradient id=${id} gradientUnits="userSpaceOnUse" x1="15" y1="0" x2="70" y2="100">
      <stop offset="0" stop-color=${from} /><stop offset="1" stop-color=${to} />
    </linearGradient></defs>
    ${ring ? html`<path d=${path} fill="none" style=${`stroke: ${ring}`} stroke-width="14" />` : null}
    <path d=${path} fill=${`url(#${id})`} />
    ${eyes(mod(s.eyes ?? 0, EYES), size, base)}
    ${thinking ? html`<g class="satellite">
      <circle cx="50" cy="50" r="66" fill="none" stroke=${base} stroke-opacity="0.18" stroke-width=${100 / size} />
      <circle cx=${50 + 66 * Math.cos(-Math.PI / 4)} cy=${50 + 66 * Math.sin(-Math.PI / 4)} r="7.5" fill=${base} />
    </g>` : null}
  </svg>`;
}

/** A room's badge: up to three members inside one rounded tile. */
export function CrewTile({ specs, size = 48 }) {
  const layout = [[], [[0.2, 0.2, 0.6]], [[0.1, 0.1, 0.5], [0.4, 0.4, 0.5]], [[0.285, 0.075, 0.43], [0.06, 0.495, 0.43], [0.51, 0.495, 0.43]]][Math.min(specs.length, 3)];
  return html`<div class="crew-tile" style=${`width:${size}px;height:${size}px`}>
    ${layout.map(([x, y, d], i) => html`<${Avatar} spec=${specs[i]} size=${size * d} ring=${i > 0 ? 'var(--raised)' : null} style=${`left:${size * x}px;top:${size * y}px`} />`)}
  </div>`;
}
