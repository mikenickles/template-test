// Treehouse's picture of the crew at home, the same illustration as on the phone. It's the one
// picture in the app besides the avatars.
import { h } from '/vendor/preact.mjs';
import htm from '/vendor/htm.mjs';

const html = htm.bind(h);

/** The treehouse illustration, [height] pixels tall. It floats gently unless motion is reduced. */
export function Treehouse({ height = 200 }) {
  return html`<img class="treehouse" src="/images/treehouse.webp" alt="" draggable="false" style=${`height:${height}px`} />`;
}
