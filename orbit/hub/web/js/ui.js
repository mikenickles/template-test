// Shared pieces: Treehouse's icon set (one stroke weight, round caps), and small controls.
import { h } from '/vendor/preact.mjs';
import { useEffect } from '/vendor/hooks.mjs';
import htm from '/vendor/htm.mjs';

export const html = htm.bind(h);

// Drawn on a 24-unit grid, the same shapes as the phone's icons.
const ICONS = {
  back: 'M19.7 12H4.8M11 5.5 4.6 12l6.4 6.5',
  up: 'M12 19.7V4.8M5.5 11 12 4.6l6.5 6.4',
  plus: 'M12 4.8v14.4M4.8 12h14.4',
  check: 'M4.8 12.7l5 5 9.4-11',
  chevron: 'M9.4 6.2l5.8 5.8-5.8 5.8',
  more: 'M12 5.3h.01M12 12h.01M12 18.7h.01',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  search: 'M16.6 10.6a6.1 6.1 0 1 1-12.2 0 6.1 6.1 0 0 1 12.2 0ZM15.1 15.1l4.3 4.3',
  globe: 'M19.7 12a7.7 7.7 0 1 1-15.4 0 7.7 7.7 0 0 1 15.4 0ZM12 4.3c-2 2.2-3.5 4.9-3.5 7.7s1.5 5.5 3.5 7.7c2-2.2 3.5-4.9 3.5-7.7S14 6.5 12 4.3ZM4.6 12h14.8',
  code: 'M8.9 7 3.8 12l5.1 5M15.1 7l5.1 5-5.1 5',
  folder: 'M3.6 6.5h6l1.9 2.1h8.9v9.6H3.6Z',
  file: 'M6.2 3.8h7.5l4.3 4.3v12.1H6.2ZM13.7 4.1v4.1h4.1',
  copy: 'M8.9 8.9h10.8v10.8H8.9ZM5 14.9V7.2Q5 5 7.2 5h7.7',
  retry: 'M19.3 9.9A7 7 0 1 1 15.5 6M15.6 2.9l.1 3.6-3.6.6',
  trash: 'M4.8 6.7h14.4M9.6 6.5V4.3h4.8v2.2M6.5 7l1 12.7h9l1-12.7',
  photo: 'M3.8 4.8h16.4v14.4H3.8ZM4.8 17.3l5.3-5.3 3.8 3.4 2.4-2.2 3.4 3.1M15.4 8.6h.01',
  memory: 'M7.2 4.1h9.6v15.8L12 16.1l-4.8 3.8Z',
  reply: 'M10.1 5.3 4.4 10.8l5.7 5.5M4.8 10.8h8.6q6 0 6 6v1.9',
  hire: 'M12.7 7.9a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0ZM4.4 19.2a5.6 5.6 0 0 1 10.4 0M18.7 9.1v5.8M15.8 12h5.8',
  clock: 'M19.7 12a7.7 7.7 0 1 1-15.4 0 7.7 7.7 0 0 1 15.4 0ZM12 7.4V12l3.1 2.4',
  mail: 'M5.4 6.2h13.2q1.6 0 1.6 1.6v8.4q0 1.6-1.6 1.6H5.4q-1.6 0-1.6-1.6V7.8q0-1.6 1.6-1.6ZM4.6 7.2 12 12.7l7.4-5.5',
  calendar: 'M6.2 5.8h11.6q1.9 0 1.9 1.9v10.2q0 1.9-1.9 1.9H6.2q-1.9 0-1.9-1.9V7.7q0-1.9 1.9-1.9ZM4.6 9.8h14.8M8.6 3.8v3.4M15.4 3.8v3.4',
  person: 'M15.2 8.4a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0ZM5.3 19.7c.6-4.6 12.8-4.6 13.4 0',
  spark: 'M12 3.8q1 7.2 8.2 8.2-7.2 1-8.2 8.2-1-7.2-8.2-8.2 7.2-1 8.2-8.2Z',
  chart: 'M6.5 19.2v-5.6M12 19.2V5.8M17.5 19.2v-8.6',
  bell: 'M6.2 16.3l1.2-5a4.7 4.7 0 0 1 9.2 0l1.2 5ZM10.3 19.2h3.4',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.2 13.6l1.5 1.2-1.6 2.8-1.9-.6a7 7 0 0 1-1.7 1l-.4 2h-3.2l-.4-2a7 7 0 0 1-1.7-1l-1.9.6-1.6-2.8 1.5-1.2a7 7 0 0 1 0-2l-1.5-1.3L6.2 7.6l1.9.6a7 7 0 0 1 1.7-1l.4-2h3.2l.4 2a7 7 0 0 1 1.7 1l1.9-.6 1.6 2.8-1.5 1.3a7 7 0 0 1 0 2Z',
  dice: 'M5.4 3.8h13.2q1.6 0 1.6 1.6v13.2q0 1.6-1.6 1.6H5.4q-1.6 0-1.6-1.6V5.4q0-1.6 1.6-1.6ZM8.6 8.6h.01M12 12h.01M15.4 15.4h.01',
};

export function Icon({ name, size = 20, label = null }) {
  return html`<svg class="icon" viewBox="0 0 24 24" width=${size} height=${size} role=${label ? 'img' : null} aria-label=${label} aria-hidden=${label ? null : 'true'}>
    <path d=${ICONS[name]} />
  </svg>`;
}

/** Treehouse's mark: the Forest Tree character, the same as its app icon. */
export function Mark({ size = 24 }) {
  return html`<img class="mark" src="/avatars/11.webp" width=${size} height=${size} alt="" aria-hidden="true" />`;
}

export function Switch({ on, disabled = false }) {
  return html`<span class=${`switch${on ? ' on' : ''}${disabled ? ' off-limits' : ''}`} aria-hidden="true"></span>`;
}

export function Pill({ label, selected = false, dimmed = false, onClick, small = false, children }) {
  return html`<button type="button" class=${`pill${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}${small ? ' small' : ''}`} aria-pressed=${selected} onClick=${onClick}>
    ${children}${label}
  </button>`;
}

/** A dialog over the app. Escape or a click outside closes it. */
export function Modal({ title, onClose, actions = null, children, wide = false }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  return html`<div class="scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label=${title} style=${wide ? `width:min(${wide === true ? 720 : wide}px,100%)` : ''}>
      <div class="dialog-head">
        <h2>${title}</h2>
        ${actions}
        <button class="icon-button" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button>
      </div>
      <div class="dialog-body">${children}</div>
    </div>
  </div>`;
}

/** "now", "5m", "3h", "Mon", "12 Nov". */
export function ago(then, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  const date = new Date(then);
  if (minutes < 7 * 24 * 60) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const formatCost = (d) => (d <= 0 ? '$0.00' : d < 0.01 ? '<$0.01' : d < 1000 ? `$${d.toFixed(2)}` : `$${Math.round(d).toLocaleString('en-US')}`);
export function formatTokens(n) {
  const compact = (v, unit) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.floor(v)) + unit;
  return n < 1000 ? String(n) : n < 1e6 ? compact(n / 1e3, 'K') : compact(n / 1e6, 'M');
}
export const fileSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
