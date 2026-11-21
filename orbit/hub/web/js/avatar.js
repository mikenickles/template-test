// Agent avatars, the same characters as on the phone. Each has a signature color for the agent's
// name and @mentions: the fill on dark pages, a deeper shade on light ones.
import { h } from '/vendor/preact.mjs';
import htm from '/vendor/htm.mjs';

const html = htm.bind(h);

export const CHARACTERS = [
  ['Explorer Bot', '#F7843A', '#C2410C'], ['Leaf Sprout', '#A3CB4A', '#4D7C0F'], ['Red Yeti', '#F4643A', '#C0341A'],
  ['Teal Fox', '#4FB3BC', '#0F6E77'], ['Mushroom Friend', '#F27450', '#B83A1B'], ['Wise Owl', '#C58AE0', '#8B3FB8'],
  ['Mechanic Bot', '#FFC93C', '#A16207'], ['Smiling Cloud', '#F7B79A', '#B4532E'], ['White Astronaut', '#5AA8E6', '#1D63A8'],
  ['Teal Hiker', '#4FCBAA', '#0F7F68'], ['Forest Tree', '#D08A50', '#8A4B16'], ['Water Drop', '#52BDEB', '#0E7490'],
  ['Mushroom Explorer', '#E8A452', '#9A5B0B'], ['Pink Axolotl', '#FF8FAB', '#C2335A'], ['Penguin Pilot', '#94A8DC', '#3A5191'],
  ['Purple Wizard', '#A684F2', '#6D28D9'], ['Retro Computer', '#5FCB72', '#2E7D32'], ['Leafy Bush', '#86BE47', '#4B7A12'],
  ['Music Monster', '#8FB0C8', '#3F5F7A'], ['Happy Sun', '#FFB52E', '#B45309'], ['Ice Crystal', '#8FD6F0', '#1F7290'],
  ['Raccoon Explorer', '#D2A27A', '#8A5A2E'], ['Purple Alien', '#C79BF0', '#8240C0'], ['Sprout Bot', '#72CC55', '#3F7F1F'],
  ['Blue Yeti', '#74BCEB', '#1E6FA8'],
].map(([name, fill, onLight], i) => ({ number: i + 1, name, fill, onLight, image: `/avatars/${String(i + 1).padStart(2, '0')}.webp` }));

/** Stand-in for a deleted agent: a plain grey placeholder, not a character. */
const FORMER = { fill: '#A3A8B4', onLight: '#52525B' };

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const mod = (n, m) => ((n % m) + m) % m;

/** The agent's character; numbers out of range wrap. No avatar at all means a deleted agent. */
export const characterOf = (spec) => (spec ? CHARACTERS[mod((spec.character ?? 1) - 1, CHARACTERS.length)] : null);

/** The agent's color as text on the current page. */
export const inkColor = (spec) => { const c = characterOf(spec) ?? FORMER; return dark() ? c.fill : c.onLight; };
export const tint = (spec) => (characterOf(spec) ?? FORMER).fill;

export const randomAvatar = () => ({ character: 1 + Math.floor(Math.random() * CHARACTERS.length) });

/** An agent's character. [thinking] adds a small typing bubble in its color at its shoulder, and a gentle bob. */
export function Avatar({ spec, size = 40, thinking = false, style = '' }) {
  const character = characterOf(spec);
  const color = tint(spec);
  const bubble = thinking ? html`<span class="thinking-bubble" style=${`--ink:${color}`}><i></i><i></i><i></i></span>` : null;
  return html`<span class=${`avatar${thinking ? ' thinking' : ''}`} style=${`width:${size}px;height:${size}px;${style}`} aria-hidden="true">
    ${character
      ? html`<img src=${character.image} alt="" width=${size} height=${size} draggable="false" />`
      : html`<span class="former"></span>`}
    ${bubble}
  </span>`;
}

/** A room's badge: up to three members standing together inside one rounded tile. Later ones stand in front. */
export function CrewTile({ specs, size = 48, tint: hint = null }) {
  const layout = [[], [[0.12, 0.12, 0.76]], [[0.02, 0.06, 0.62], [0.36, 0.34, 0.62]], [[0.24, 0.02, 0.52], [0, 0.44, 0.52], [0.48, 0.44, 0.52]]][Math.min(specs.length, 3)];
  // Characters sit on a neutral tile: they're the only color. (hint is kept for older callers and ignored.)
  const wash = '';
  return html`<div class="crew-tile" style=${`width:${size}px;height:${size}px${wash}`}>
    ${layout.map(([x, y, d], i) => html`<${Avatar} spec=${specs[i]} size=${size * d} style=${`left:${size * x}px;top:${size * y}px`} />`)}
  </div>`;
}
