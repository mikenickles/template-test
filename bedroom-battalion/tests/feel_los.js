// Injected: line of sight against the live collider list (boxes exact, cylinders and ramps sampled).
window.LOS = (() => {
  const C = __game.colliders.filter((c) => c.kind === 'box' || c.kind === 'cyl' || c.kind === 'ramp');
  function inside(c, x, y, z) {
    if (c.kind === 'cyl') return y >= c.y0 && y <= c.y1 && Math.hypot(x - c.x, z - c.z) <= c.r;
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return false;
    const f = c.axis === 'x' ? (x - c.x0) / (c.x1 - c.x0) : (z - c.z0) / (c.z1 - c.z0);
    const hgt = c.h0 + (c.h1 - c.h0) * f;
    return y <= hgt && y >= (c.thickness === null ? c.base : hgt - c.thickness);
  }
  function blocked(a, b) {      // a, b = [x, y, z]; returns id of the first blocker found or null
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
    for (const c of C) {
      let t0 = 0, t1 = 1;
      const lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1]; let miss = false;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (a[i] < lo[i] || a[i] > hi[i]) { miss = true; break; } }
        else { let u = (lo[i] - a[i]) / d[i], v = (hi[i] - a[i]) / d[i]; if (u > v) { const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { miss = true; break; } }
      }
      if (miss) continue;
      if (c.kind === 'box') return c.id;
      const n = Math.max(2, Math.ceil((t1 - t0) * len / 0.1));
      for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; if (inside(c, a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t)) return c.id; }
    }
    return null;
  }
  // floor sample points (standing room, not inside anything), 3-unit grid
  const floor = [];
  for (let x = 1.5; x < 120; x += 3) for (let z = 1.5; z < 160; z += 3) {
    let free = true; for (const c of C) { if (/^room\./.test(c.id)) continue; if (inside(c, x, 0.9, z) || (c.kind === 'box' && x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && c.y0 < 1.8 && c.y1 > 0.05)) { free = false; break; } }
    if (free) floor.push([x, z]);
  }
  // fraction of floor points whose soldier (head at 1.6 or chest at 1.0) is visible from eye point e
  function view(e) {
    let head = 0, chest = 0; const lanes = { west: [0, 0], centre: [0, 0], east: [0, 0] }; const halves = { north: [0, 0], south: [0, 0] };
    for (const [x, z] of floor) {
      const h = !blocked(e, [x, 1.6, z]), c = !blocked(e, [x, 1.0, z]);
      if (h) head++; if (c) chest++;
      const L = x < 45 ? 'west' : x < 76 ? 'centre' : 'east'; lanes[L][1]++; if (c) lanes[L][0]++;
      const H = z < 80 ? 'north' : 'south'; halves[H][1]++; if (c) halves[H][0]++;
    }
    const pc = (a) => Math.round(100 * a[0] / a[1]);
    return { floorPts: floor.length, headVisiblePct: Math.round(100 * head / floor.length), chestVisiblePct: Math.round(100 * chest / floor.length),
      west: pc(lanes.west), centre: pc(lanes.centre), east: pc(lanes.east), northHalf: pc(halves.north), southHalf: pc(halves.south) };
  }
  return { blocked, view, floor };
})();
