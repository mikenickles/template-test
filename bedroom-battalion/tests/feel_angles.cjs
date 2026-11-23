// Angular size of the big furniture from player eye positions (pure geometry from DESIGN.md boxes; fov from CONFIG).
const fov = 75, eyeH = 1.6;
const deg = (r) => r * 180 / Math.PI;
const F = {
  bed:        { x0: 0, x1: 35, z0: 45, z1: 115, top: 18 },
  desk:       { x0: 95, x1: 120, z0: 55, z1: 105, top: 26 },
  chair_back: { x0: 85, x1: 86.2, z0: 73, z1: 87, top: 33 },
  small_shelf:{ x0: 108, x1: 120, z0: 4, z1: 44, top: 40 },
  tall_shelf: { x0: 108, x1: 120, z0: 116, z1: 156, top: 60 },
  door:       { x0: 14, x1: 44, z0: 0, z1: 0, top: 72 },
  fort_wall_own: { x0: 46, x1: 74, z0: 24.5, z1: 26, top: 3.3 },
};
const eyes = { 'green spawn (60,20)': [60, 20], 'fort gate (60,28)': [60, 28], 'centre lane (60,50)': [60, 50], 'mid floor (60,66)': [60, 66], 'west lane (40,60)': [40, 60], 'east lane (83,60)': [83, 60] };
for (const en in eyes) {
  const [ex, ez] = eyes[en];
  console.log('\n' + en);
  for (const fn in F) {
    const f = F[fn];
    const nx = Math.max(f.x0, Math.min(ex, f.x1)), nz = Math.max(f.z0, Math.min(ez, f.z1));
    const d = Math.hypot(nx - ex, nz - ez);
    if (d < 0.01) { console.log('  ' + fn.padEnd(14) + 'overhead'); continue; }
    const up = deg(Math.atan2(f.top - eyeH, d)), down = deg(Math.atan2(-eyeH, d));
    // horizontal extent: angle between extreme corners
    const cs = [[f.x0, f.z0], [f.x0, f.z1], [f.x1, f.z0], [f.x1, f.z1]].map(([x, z]) => Math.atan2(x - ex, z - ez));
    let span = 0; for (const a of cs) for (const b of cs) { let s = Math.abs(a - b); if (s > Math.PI) s = 2 * Math.PI - s; span = Math.max(span, s); }
    console.log('  ' + fn.padEnd(14) + 'nearest ' + d.toFixed(1).padStart(6) + ' u  top edge elevation ' + up.toFixed(1).padStart(5) + ' deg  subtends ' + (up - down).toFixed(1).padStart(5) +
      ' deg vertical = ' + ((up - down) / fov * 100).toFixed(0).padStart(3) + '% of a ' + fov + ' deg frame, ' + deg(span).toFixed(0).padStart(4) + ' deg wide' + (up > fov / 2 ? '  (top is ABOVE the frame when looking level)' : ''));
  }
  console.log('  ceiling: straight up 88.4 u; far wall/ceiling corner elevation ' + deg(Math.atan2(88.4, 160 - ez)).toFixed(1) + ' deg');
}
