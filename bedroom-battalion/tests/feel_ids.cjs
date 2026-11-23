const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const d = await h.page.evaluate(() => {
    const g = {};
    for (const c of __game.colliders) { const k = c.id.replace(/\.\d+$/, '.#'); const e = g[k] = g[k] || { n: 0, kind: c.kind, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
      e.n++; for (const a of ['x', 'y', 'z']) { e[a + '0'] = Math.min(e[a + '0'], c[a + '0']); e[a + '1'] = Math.max(e[a + '1'], c[a + '1']); } }
    return g;
  });
  for (const k in d) { const e = d[k]; console.log(k.padEnd(28), e.kind.padEnd(6), String(e.n).padStart(3), 'x', e.x0, e.x1, 'z', e.z0, e.z1, 'y', +e.y0.toFixed(2), +e.y1.toFixed(2)); }
  await h.browser.close();
})();
