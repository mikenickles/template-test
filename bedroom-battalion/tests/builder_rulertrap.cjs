// Builder: the feel tester's corner-cut cases (same driving as feel_ruler_trap.cjs) against a chosen build file (argv[2], default index.html).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch(process.argv[2] ? { width: 320, height: 200, file: process.argv[2] } : { width: 320, height: 200 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const r = await page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state().player, out = {};
    out.stopperN = G.colliders.find((c) => c.id === 'chair.stopper.n').x;
    for (const x of [87, 89, 91]) for (const aimZ of [75.5, 74.5, 73.5, 71, 68]) {
      G.clearInput(); G.teleport(60, 0, 20); G.step(T); const before = G.damageLog.length;
      G.teleport(x, 0, 49); G.step(T);
      let t = 0, phase = 0, res = 'timeout';
      while (t < 12) { const p = st();
        if (phase === 0) { G.lookAt(x, p.y + 1.6, 80); if (p.y > 16.95 && p.z > 73.05) phase = 1; }
        if (phase === 1) { G.lookAt(94, p.y + 1.6, aimZ); if (Math.abs(p.x - 94) < 1.2 && Math.abs(p.z - aimZ) < 1.0) phase = 2; }
        if (phase === 2) G.lookAt(94, p.y + 1.6, 60);
        G.setInput({ forward: true, sprint: true }); G.step(T); t += T;
        const q = st(); if (q.onGround && q.y > 25.9) { res = 'desk ' + t.toFixed(1); break; } if (q.onGround && q.y < 1 && phase > 0) { res = 'FELL'; break; } }
      const q = st(); out[x + '/' + aimZ] = res + (res === 'timeout' ? ' at (' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ',' + q.z.toFixed(2) + ')' : '') + ' dmg ' + JSON.stringify(G.damageLog.slice(before).map((d) => Math.round(d.amount)));
    }
    G.clearInput(); return out;
  });
  console.log(JSON.stringify(r), JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
