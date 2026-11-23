// Builder helper: after adding W-c, search positions for n.ub.e and n.w.5 (each within 2 units of DESIGN) that keep every edge clear.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 320, height: 200 });
  const out = await page.evaluate(() => {
    const g = __game, N = g.waypoints.nodes, res = { initial: g.validateWaypoints() };
    const A0 = [33, 0, 67], B0 = [38, 0, 75], sols = [];
    for (let ax = -2; ax <= 2.001; ax += 0.1) for (let az = -2; az <= 2.001; az += 0.1) {
      if (Math.hypot(ax, az) > 2) continue;
      N['n.ub.e'] = [A0[0] + ax, 0, A0[2] + az];
      for (let bx = -2; bx <= 2.001; bx += 0.1) for (let bz = -2; bz <= 2.001; bz += 0.1) {
        if (Math.hypot(bx, bz) > 2) continue;
        N['n.w.5'] = [B0[0] + bx, 0, B0[2] + bz];
        if (g.validateWaypoints().filter((e) => e.a.startsWith('n.') || e.b.startsWith('n.')).length === 0) sols.push([+(A0[0] + ax).toFixed(1), +(A0[2] + az).toFixed(1), +(B0[0] + bx).toFixed(1), +(B0[2] + bz).toFixed(1), +(Math.hypot(ax, az) + Math.hypot(bx, bz)).toFixed(2)]);
      }
    }
    N['n.ub.e'] = A0; N['n.w.5'] = B0;
    res.count = sols.length; res.best = sols.sort((p, q) => p[4] - q[4]).slice(0, 8);
    return res;
  });
  console.log(JSON.stringify(out), JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
