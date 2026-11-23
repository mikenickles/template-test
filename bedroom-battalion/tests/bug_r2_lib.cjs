// Round 2 shared page helpers (bug tester). installR2 adds window.R2: my own point-in-solid test and ray march,
// independent of the game's raycast.
function installR2() {
  const G = window.__game, R2 = (window.R2 = {});
  const cols = G.colliders.filter((c) => c.kind !== 'string');
  const CELL = 4, NX = 32, NZ = 42, grid = Array.from({ length: NX * NZ }, () => []);
  for (const c of cols) { const i0 = Math.max(0, Math.floor((c.x0 + 4) / CELL)), i1 = Math.min(NX - 1, Math.floor((c.x1 + 4) / CELL)), j0 = Math.max(0, Math.floor((c.z0 + 4) / CELL)), j1 = Math.min(NZ - 1, Math.floor((c.z1 + 4) / CELL)); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[j * NX + i].push(c); }
  // m: margin. Positive m shrinks the solids (point must be deeper than m inside to count).
  R2.inSolid = (x, y, z, m = 0) => {
    const i = Math.floor((x + 4) / CELL), j = Math.floor((z + 4) / CELL); if (i < 0 || j < 0 || i >= NX || j >= NZ) return 'outside';
    for (const c of grid[j * NX + i]) {
      if (c.kind === 'cyl') { if (y > c.y0 + m && y < c.y1 - m && Math.hypot(x - c.x, z - c.z) < c.r - m) return c.id; continue; }
      if (x <= c.x0 + m || x >= c.x1 - m || z <= c.z0 + m || z >= c.z1 - m) continue;
      if (c.kind === 'ramp') { const a0 = c.axis === 'x' ? c.x0 : c.z0, a1 = c.axis === 'x' ? c.x1 : c.z1, t = c.axis === 'x' ? x : z, top = c.h0 + (c.h1 - c.h0) * (t - a0) / (a1 - a0), bot = Number.isFinite(c.thickness) ? top - c.thickness : (c.base || 0); if (y < top - m && y > bot + m) return c.id; continue; }
      if (y > c.y0 + m && y < c.y1 - m) return c.id;
    }
    return null;
  };
  R2.march = (o, d, max, step = 0.02) => { for (let t = 0; t <= max; t += step) { const id = R2.inSolid(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t); if (id) return { t, id }; } return null; };
  R2.clearLine = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]); if (l < 0.05) return true; return !R2.march(a, [d[0] / l, d[1] / l, d[2] / l], l - 0.02, 0.01); };
  R2.rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
}
module.exports = { installR2 };
