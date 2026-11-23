// Cover spacing along the three lanes, measured against the live collider list.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, N = G.waypoints.nodes;
    const solid = G.colliders.filter((c) => !/^room\./.test(c.id) && (c.kind === 'box' || c.kind === 'cyl' || c.kind === 'ramp'));
    // cover = stands on the floor and is tall enough to hide a crouching (1.2) or standing (1.8) soldier
    const cov = (minH) => solid.filter((c) => c.y0 <= 0.6 && c.y1 >= minH && !(c.kind === 'ramp' && c.thickness !== null));
    const dist = (c, x, z) => {
      if (c.kind === 'cyl') return Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
      const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1); return Math.hypot(dx, dz);
    };
    const lanes = {
      west:   ['n.f.wdoor', 'n.w.1', 'n.w.2', 'n.w.3', 'n.w.x', 'n.w.4', 'n.w.5', 's.w.5', 's.w.4', 's.w.x', 's.w.3', 's.w.2', 's.w.1', 's.f.wdoor'],
      west_underbed: ['n.f.wdoor', 'n.w.1', 'n.w.ramp', 'n.w.rampw', 'n.ub.n', 'n.ub.1', 'n.ub.2', 'm.ub', 's.ub.2', 's.ub.1', 's.ub.n', 's.ub.app', 's.bs.wfoot', 's.bs.foot', 's.bs.app', 's.w.1', 's.f.wdoor'],
      centre: ['n.f.gate', 'n.c.2', 'n.c.3', 'n.c.4', 'n.c.5', 'n.r.ne', 'n.r.n', 'm.r.e', 's.r.se', 's.r.s', 's.r.sw', 's.c.5', 's.c.4', 's.c.3', 's.c.2', 's.f.gate'],
      centre_west_of_ruin: ['n.f.gate', 'n.c.2', 'n.c.3', 'n.c.x', 'n.c.w', 'm.c.w', 's.c.w', 's.c.x', 's.c.3', 's.c.2', 's.f.gate'],
      centre_east_of_ruin: ['n.f.gate', 'n.c.2', 'n.c.3', 'n.c.4', 'n.c.y', 'n.c.e', 'm.c.e', 's.c.e', 's.c.y', 's.c.4', 's.c.3', 's.c.2', 's.f.gate'],
      east:   ['n.f.edoor', 'n.e.1', 'n.e.2', 'n.e.3w', 'n.e.x', 'n.e.6', 'm.e.w', 's.e.6', 's.e.x', 's.e.3w', 's.e.2', 's.e.1', 's.f.edoor'],
      east_under_desk: ['n.f.edoor', 'n.e.1', 'n.e.2', 'n.e.4', 'n.e.5', 'm.e', 's.e.5', 's.e.4', 's.e.2', 's.e.1', 's.f.edoor'],
    };
    const out = {};
    for (const ln in lanes) {
      const ids = lanes[ln]; const missing = ids.filter((i) => !N[i]); if (missing.length) { out[ln] = 'missing ' + missing; continue; }
      const pts = []; let L = 0;
      for (let i = 1; i < ids.length; i++) { const A = N[ids[i - 1]], B = N[ids[i]], d = Math.hypot(B[0] - A[0], B[2] - A[2]); const n = Math.max(1, Math.round(d / 0.25));
        for (let k = 0; k < n; k++) pts.push({ s: L + d * k / n, x: A[0] + (B[0] - A[0]) * k / n, z: A[2] + (B[2] - A[2]) * k / n }); L += d; }
      const res = { length: +L.toFixed(1) };
      for (const [label, minH] of [['crouchCover_1.2', 1.2], ['standCover_1.8', 1.8]]) {
        const C = cov(minH); const REACH = 4;       // 4 units = about 0.6 s at sprint
        const gaps = []; let start = null, worst = 0, sum = 0, startPt = null, far = 0, farId = null;
        for (const p of pts) {
          let best = 1e9, bid = null; for (const c of C) { const d = dist(c, p.x, p.z); if (d < best) { best = d; bid = c.id; } }
          sum += best; if (best > worst) worst = best;
          if (best > REACH) { if (start === null) { start = p.s; startPt = p; far = 0; } if (best > far) far = best; }
          else if (start !== null) { gaps.push({ from: [+startPt.x.toFixed(0), +startPt.z.toFixed(0)], to: [+p.x.toFixed(0), +p.z.toFixed(0)], len: +(p.s - start).toFixed(1), farthestFromCover: +far.toFixed(1) }); start = null; }
        }
        if (start !== null) gaps.push({ from: [+startPt.x.toFixed(0), +startPt.z.toFixed(0)], to: 'end', len: +(L - start).toFixed(1), farthestFromCover: +far.toFixed(1) });
        res[label] = { meanDistToCover: +(sum / pts.length).toFixed(1), worstDistToCover: +worst.toFixed(1), exposedStretches_gt4u: gaps.filter((g) => g.len >= 6) };
      }
      out[ln] = res;
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await h.browser.close();
})();
