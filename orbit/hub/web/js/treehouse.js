// Treehouse's picture of the crew at home, the same scene as the phone's: a little house in a tree,
// with the agents in the window, on the porch, out on the branches and down by the ladder. Its colors
// are washes of three characters' own tints, so the agents stay the brightest thing in it.
import { h } from '/vendor/preact.mjs';
import htm from '/vendor/htm.mjs';
import { Avatar, tint } from './avatar.js';

const html = htm.bind(h);

/** The scene is 1.5 units wide and 1 tall. */
const WIDTH = 1.5;

/** Where each agent sits: x from the trunk, the y their feet rest on, and their size. The first gets the window. */
const SLOTS = [
  [0, 0.665, 0.2], [-0.275, 0.668, 0.17], [0.6, 0.965, 0.2], [-0.45, 0.452, 0.15],
  [0.265, 0.668, 0.17], [-0.6, 0.965, 0.18], [0.45, 0.285, 0.14],
];
const WINDOW = { x: -0.1, y: 0.45, w: 0.2, h: 0.15 };

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const mix = (color, amount) => `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, var(--bg))`;

function palette() {
  const d = dark();
  const wood = tint({ character: 11 });
  const leaf = tint({ character: 18 });
  const sun = tint({ character: 20 });
  return {
    shadow: `color-mix(in srgb, var(--text) ${d ? 6 : 7}%, transparent)`,
    leafBack: mix(leaf, d ? 0.2 : 0.26),
    leafFront: mix(leaf, d ? 0.3 : 0.4),
    wood: mix(wood, d ? 0.5 : 0.62),
    walls: mix(wood, d ? 0.34 : 0.32),
    beams: mix(wood, d ? 0.68 : 0.82),
    lamp: mix(sun, d ? 0.5 : 0.34),
  };
}

// Scene units to SVG units.
const k = (n) => Math.round(n * 1000);
const circles = (list, fill, cls) => html`<g class=${cls} fill=${fill}>${list.map(([x, y, r]) => html`<circle cx=${k(x)} cy=${k(y)} r=${k(r)} />`)}</g>`;
const line = (x1, y1, x2, y2, stroke, width) =>
  html`<line x1=${k(x1)} y1=${k(y1)} x2=${k(x2)} y2=${k(y2)} stroke=${stroke} stroke-width=${k(width)} stroke-linecap="round" />`;

function Scene() {
  const p = palette();
  const rungs = [];
  for (let y = 0.74; y < 0.95; y += 0.055) {
    const shift = ((y - 0.69) / 0.27) * 0.07;
    rungs.push(line(0.34 + shift, y, 0.43 + shift, y, p.beams, 0.014));
  }
  return html`<svg class="scene" viewBox=${`${k(-WIDTH / 2)} 0 ${k(WIDTH)} 1000`} aria-hidden="true">
    <ellipse cx="0" cy="965" rx="780" ry="30" fill=${p.shadow} />
    ${circles([[0, 0.3, 0.3], [-0.31, 0.36, 0.19], [0.31, 0.37, 0.19], [-0.18, 0.15, 0.17], [0.19, 0.14, 0.17], [0, 0.07, 0.13]], p.leafBack, 'leaves')}
    ${circles([[-0.13, 0.2, 0.13], [0.15, 0.22, 0.14], [0.01, 0.13, 0.11]], p.leafFront, 'leaves late')}
    <path fill=${p.wood} d="M-100 960 C-55 920 -50 800 -45 620 L-40 320 L40 320 L45 620 C50 800 55 920 100 960 Z" />
    ${line(-0.03, 0.54, -0.53, 0.44, p.wood, 0.032)}
    ${line(0.03, 0.37, 0.51, 0.28, p.wood, 0.027)}
    ${circles([[-0.57, 0.41, 0.06], [-0.62, 0.45, 0.04]], p.leafFront, 'leaves')}
    ${circles([[0.55, 0.25, 0.055], [0.6, 0.29, 0.038]], p.leafFront, 'leaves late')}
    ${line(-0.3, 0.69, -0.04, 0.8, p.beams, 0.02)}
    ${line(0.3, 0.69, 0.04, 0.8, p.beams, 0.02)}
    <rect x="-220" y="400" width="440" height="270" rx="30" fill=${p.walls} />
    <path d="M-270 420 L0 235 L270 420 Z" fill=${p.beams} stroke=${p.beams} stroke-width="40" stroke-linejoin="round" />
    <circle cx="0" cy="345" r="32" fill=${p.lamp} />
    <rect x=${k(WINDOW.x)} y=${k(WINDOW.y)} width=${k(WINDOW.w)} height=${k(WINDOW.h)} rx="45" fill=${p.lamp} />
    <rect x="-360" y="655" width="720" height="38" rx="19" fill=${p.beams} />
    ${[-1, 1].map((side) => html`${line(side * 0.345, 0.66, side * 0.345, 0.585, p.beams, 0.014)}${line(side * 0.345, 0.59, side * 0.225, 0.59, p.beams, 0.014)}`)}
    ${line(0.34, 0.69, 0.41, 0.96, p.beams, 0.014)}
    ${line(0.43, 0.69, 0.5, 0.96, p.beams, 0.014)}
    ${rungs}
  </svg>`;
}

/** The crew in the treehouse, [height] pixels tall (and half again as wide). */
export function Treehouse({ specs, height = 200 }) {
  const u = height;
  const px = (n) => `${Math.round(n * u)}px`;
  return html`<div class="treehouse" style=${`width:${px(WIDTH)};height:${px(1)}`}>
    <${Scene} />
    ${specs.slice(0, SLOTS.length).map((spec, i) => {
      const [x, bottom, size] = SLOTS[i];
      const left = WIDTH / 2 + x - size / 2;
      const top = bottom - size;
      const avatar = (l, t) => html`<${Avatar} spec=${spec} size=${Math.round(size * u)} style=${`position:absolute;left:${px(l)};top:${px(t)};animation-delay:${-i * 0.7}s`} />`;
      if (i > 0) return avatar(left, top);
      // In the window, so only the top of them shows, as if leaning on the sill.
      const wl = WIDTH / 2 + WINDOW.x;
      return html`<div class="window" style=${`left:${px(wl)};top:${px(WINDOW.y)};width:${px(WINDOW.w)};height:${px(WINDOW.h)};border-radius:${px(0.045)}`}>
        ${avatar(left - wl, top - WINDOW.y)}
      </div>`;
    })}
  </div>`;
}
