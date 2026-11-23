// Re-check: after cutting the corner toward a ruler, where do you stop, and how long does recovering cost?
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state().player, out = {};
    const cases = { north_from_skate: { s: [89, 0, 49], up: 80, edge: (p) => p.y > 16.95 && p.z > 73.05, aims: [73.5, 71, 68], foot: 75.6, top: 60 },
                    south_from_stairs: { s: [89, 0, 111.5], up: 80, edge: (p) => p.y > 16.95 && p.z < 86.95, aims: [86.5, 89, 92], foot: 84.4, top: 100 } };
    for (const cn in cases) { const c = cases[cn]; for (const aimZ of c.aims) {
      G.clearInput(); G.teleport(60, 0, 20); G.step(T); const before = G.damageLog.length; G.teleport(c.s[0], 0, c.s[2]); G.step(T);
      let t = 0, phase = 0, stopT = null, stopPos = null, still = 0, res = null, minY = 99;
      while (t < 14) { const p = st(); minY = Math.min(minY, phase ? p.y : 99);
        if (phase === 0) { G.lookAt(c.s[0], p.y + 1.6, c.up); if (c.edge(p)) phase = 1; }
        else if (phase === 1) { G.lookAt(94, p.y + 1.6, aimZ); if (Math.hypot(p.vx, p.vz) < 0.5) still += T; else still = 0; if (still > 0.4) { phase = 2; stopT = t; stopPos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; } }
        else if (phase === 2) { G.lookAt(94, p.y + 1.6, c.foot); if (Math.abs(p.x - 94) < 0.8 && Math.abs(p.z - c.foot) < 0.8) phase = 3; }
        else G.lookAt(94, p.y + 1.6, c.top);
        G.setInput({ forward: true, sprint: true }); G.step(T); t += T;
        const q = st(); if (q.onGround && q.y > 25.9) { res = 'desk at ' + t.toFixed(2); break; } }
      out[cn + ' aim z=' + aimZ] = { stoppedAt: stopPos, stoppedAfter: stopT && +stopT.toFixed(2), result: res || 'never reached', lowestY: +minY.toFixed(1), dmg: G.damageLog.slice(before).map((d) => Math.round(d.amount)) }; } }
    // pressing into the ruler side from the seat middle, and walking round the props on the floor
    G.clearInput();
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log(JSON.stringify(h.errors));
  await h.browser.close();
})();
