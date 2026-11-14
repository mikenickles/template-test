// One icon set, one stroke weight. Drawn on a 24px grid.
const PATHS = {
  menu: '<path d="M4 8h16M4 16h16"/>',
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  memory: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M15.5 15h2"/>',
  activity: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.5"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  settings: '<path d="M4 8h8M18 8h2M4 16h2M12 16h8"/><circle cx="15" cy="8" r="2.5"/><circle cx="9" cy="16" r="2.5"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  alert: '<path d="M12 4.5 21 20H3z"/><path d="M12 10.5v4M12 17.25h.01"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 12a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.9-12M9.5 7V4.5h5V7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export function icon(name) {
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
