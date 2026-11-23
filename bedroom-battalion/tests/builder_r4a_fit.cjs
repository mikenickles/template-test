// Round 4A, DESIGN 17.1: visuals must sit within 0.15 of their colliders on walkable and shootable faces.
// Forward: every art vertex farther than 0.15 from every collider, grouped into clusters (what sticks out, and where).
// Reverse: points sampled on every exposed collider face; a short ray along the face normal must meet art geometry within 0.15.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 320, height: 200 });
  const out = await page.evaluate(() => {
    const TOL = 0.15, EPS = 0.005, C = __game.colliders.filter((c) => !c.test);
    const rampH = (c, x, z) => { const t = c.axis === 'x' ? (x - c.x0) / (c.x1 - c.x0) : (z - c.z0) / (c.z1 - c.z0); return c.h0 + (c.h1 - c.h0) * Math.min(1, Math.max(0, t)); };
    const dist = (c, x, y, z) => {
      if (c.kind === 'cyl') { const dr = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r), dy = Math.max(0, c.y0 - y, y - c.y1); return Math.hypot(dr, dy); }
      const dx = Math.max(0, c.x0 - x, x - c.x1), dz = Math.max(0, c.z0 - z, z - c.z1);
      if (c.kind === 'ramp') {
        const cx = Math.min(c.x1, Math.max(c.x0, x)), cz = Math.min(c.z1, Math.max(c.z0, z)), h = rampH(c, cx, cz), lo = Number.isFinite(c.thickness) ? h - c.thickness : c.base;
        const cosS = Math.cos(c.slopeDeg * Math.PI / 180);
        const dy = y > h ? (y - h) * cosS : y < lo ? lo - y : 0;
        return Math.hypot(dx, dz, dy);
      }
      const dy = Math.max(0, c.y0 - y, y - c.y1); return Math.hypot(dx, dy, dz);
    };
    const near = (x, y, z) => { let best = 1e9, id = null; for (const c of C) { const d = dist(c, x, y, z); if (d < best) { best = d; id = c.id; } } return [best, id]; };
    const geos = __game.artGeometry(), forward = {}, seen = new Set();
    let verts = 0, flagged = 0;
    for (const g of geos) {
      if (g.name === 'art.floor') continue;
      for (let i = 0; i < g.pos.length; i += 3) {
        const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2], k = Math.round(x * 50) + ',' + Math.round(y * 50) + ',' + Math.round(z * 50);
        if (seen.has(k)) continue; seen.add(k); verts++;
        const [d, id] = near(x, y, z);
        if (d <= TOL + EPS) continue;
        flagged++;
        const key = g.name + '|' + id + '|' + Math.floor(x / 6) + ',' + Math.floor(y / 6) + ',' + Math.floor(z / 6);
        const f = forward[key] || (forward[key] = { mesh: g.name, nearest: id, n: 0, max: 0, box: [1e9, -1e9, 1e9, -1e9, 1e9, -1e9] });
        f.n++; f.max = Math.max(f.max, d); f.box = [Math.min(f.box[0], x), Math.max(f.box[1], x), Math.min(f.box[2], y), Math.max(f.box[3], y), Math.min(f.box[4], z), Math.max(f.box[5], z)];
      }
    }
    // merge clusters by nearest collider and mesh
    const merged = {};
    for (const f of Object.values(forward)) { const k = f.mesh + '|' + f.nearest; const m = merged[k] || (merged[k] = { mesh: f.mesh, nearest: f.nearest, verts: 0, max: 0, box: [1e9, -1e9, 1e9, -1e9, 1e9, -1e9] });
      m.verts += f.n; m.max = Math.max(m.max, f.max); for (let j = 0; j < 6; j++) m.box[j] = j % 2 ? Math.max(m.box[j], f.box[j]) : Math.min(m.box[j], f.box[j]); }
    const fwd = Object.values(merged).map((m) => ({ mesh: m.mesh, nearest: m.nearest, verts: m.verts, max: +m.max.toFixed(2), box: m.box.map((v) => +v.toFixed(1)) })).sort((a, b) => b.max - a.max);
    // reverse: triangles into a 2-unit xz grid
    const G = 2, cells = new Map(), T = [];
    for (const g of geos) {
      const P = g.pos, I = g.index, n = I ? I.length / 3 : P.length / 9;
      for (let t = 0; t < n; t++) {
        const ia = I ? I[t * 3] : t * 3, ib = I ? I[t * 3 + 1] : t * 3 + 1, ic = I ? I[t * 3 + 2] : t * 3 + 2;
        const tri = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2], P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2], P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]], ti = T.length; T.push(tri);
        const x0 = Math.floor(Math.min(tri[0], tri[3], tri[6]) / G), x1 = Math.floor(Math.max(tri[0], tri[3], tri[6]) / G), z0 = Math.floor(Math.min(tri[2], tri[5], tri[8]) / G), z1 = Math.floor(Math.max(tri[2], tri[5], tri[8]) / G);
        for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const k = a * 1000 + b; let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(ti); }
      }
    }
    const hitT = (o, d, L) => {                     // nearest |t| hit of the segment o + d t, t in [-L, L]
      const ks = new Set(); for (const s of [-L, 0, L]) ks.add(Math.floor((o[0] + d[0] * s) / G) * 1000 + Math.floor((o[2] + d[2] * s) / G));
      let best = Infinity;
      for (const k of ks) for (const ti of cells.get(k) || []) {
        const t = T[ti], e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-10) continue; const inv = 1 / det, s = [o[0] - t[0], o[1] - t[1], o[2] - t[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) continue;
        const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; if (Math.abs(tt) <= L && Math.abs(tt) < Math.abs(best)) best = tt;
      }
      return best;
    };
    const inside = (x, y, z, self) => C.some((c) => c !== self && c.kind !== 'string' && dist(c, x, y, z) < 1e-3) || x < 0 || x > 120 || z < 0 || z > 160 || y < 0 || y > 90;
    const rev = {}; let samples = 0, misses = 0;
    const test = (c, p, n) => {
      if (inside(p[0] + n[0] * 0.2, p[1] + n[1] * 0.2, p[2] + n[2] * 0.2, c)) return;       // face hidden by a neighbour, the floor or a wall
      samples++;
      const t = hitT(p, n, 0.6);
      const ok = Math.abs(t) <= TOL + EPS;
      if (!ok) { misses++; const r = rev[c.id] || (rev[c.id] = { samples: 0, misses: 0, worst: 0, ex: [] }); r.misses++; r.worst = Math.max(r.worst, Number.isFinite(t) ? Math.abs(t) : 99); if (r.ex.length < 4) r.ex.push([...p.map((v) => +v.toFixed(2)), ...n]); }
      const r = rev[c.id] || (rev[c.id] = { samples: 0, misses: 0, worst: 0, ex: [] }); r.samples++;
    };
    const fr = [0.12, 0.31, 0.5, 0.69, 0.88];
    for (const c of C) {
      if (c.kind === 'string' || c.kind === 'pad' || /^room\./.test(c.id)) continue;
      if (c.kind === 'cyl') {
        for (let a = 0; a < 8; a++) for (const f of fr) { const an = a * Math.PI / 4, n = [Math.cos(an), 0, Math.sin(an)]; test(c, [c.x + n[0] * c.r, c.y0 + (c.y1 - c.y0) * f, c.z + n[2] * c.r], n); }
        for (const f of fr) for (const g of fr) { const x = c.x + (f - 0.5) * c.r, z = c.z + (g - 0.5) * c.r; test(c, [x, c.y1, z], [0, 1, 0]); }
        continue;
      }
      if (c.kind === 'ramp') {
        const len = c.axis === 'x' ? c.x1 - c.x0 : c.z1 - c.z0, dh = c.h1 - c.h0, l = Math.hypot(len, dh), n = c.axis === 'x' ? [-dh / l, len / l, 0] : [0, len / l, -dh / l];
        for (const f of fr) for (const g of fr) { const x = c.x0 + (c.x1 - c.x0) * f, z = c.z0 + (c.z1 - c.z0) * g; test(c, [x, rampH(c, x, z), z], n); }
        for (const f of fr) for (const g of [0.2, 0.5, 0.8]) {   // the two vertical sides along the slope
          if (c.axis === 'z') { const z = c.z0 + (c.z1 - c.z0) * f, h = rampH(c, c.x0, z), lo = Number.isFinite(c.thickness) ? h - c.thickness : c.base, y = lo + (h - lo) * g; test(c, [c.x0, y, z], [-1, 0, 0]); test(c, [c.x1, y, z], [1, 0, 0]); }
          else { const x = c.x0 + (c.x1 - c.x0) * f, h = rampH(c, x, c.z0), lo = Number.isFinite(c.thickness) ? h - c.thickness : c.base, y = lo + (h - lo) * g; test(c, [x, y, c.z0], [0, 0, -1]); test(c, [x, y, c.z1], [0, 0, 1]); }
        }
        continue;
      }
      for (const f of fr) for (const g of fr) {
        const x = c.x0 + (c.x1 - c.x0) * f, y = c.y0 + (c.y1 - c.y0) * g, z = c.z0 + (c.z1 - c.z0) * g, zz = c.z0 + (c.z1 - c.z0) * f;
        test(c, [c.x0, y, zz], [-1, 0, 0]); test(c, [c.x1, y, zz], [1, 0, 0]); test(c, [x, y, c.z0], [0, 0, -1]); test(c, [x, y, c.z1], [0, 0, 1]);
        test(c, [x, c.y1, z], [0, 1, 0]); test(c, [x, c.y0, z], [0, -1, 0]);
      }
    }
    const revList = Object.entries(rev).filter(([k, r]) => r.misses).map(([k, r]) => ({ id: k, misses: r.misses, of: r.samples, worst: +r.worst.toFixed(2), ex: r.ex })).sort((a, b) => b.misses / b.of - a.misses / a.of);
    return { forward: { verts, flagged, clusters: fwd }, reverse: { samples, misses, colliders: revList } };
  });
  console.log(JSON.stringify(out, null, 0));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
