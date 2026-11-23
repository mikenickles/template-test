// Round 2 pass 2 regression: 18 routes walking and sprinting, validateWaypoints, draw calls while firing, file size, errors.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game, out = { routes: {}, bad: [] };
    g.start({ pointerLock: false }); g.setTimeScale(0);
    for (const sprint of [false, true]) for (const id in g.routes) {
      g.clearInput(); g.give('health'); const dl = g.damageLog.length;
      const res = g.walkPath(g.routes[id], { sprint });
      const dmg = g.damageLog.slice(dl).reduce((a, d) => a + d.amount, 0);
      out.routes[id + (sprint ? ' sprint' : ' walk')] = [res.ok, res.time, +res.pos[1].toFixed(2), dmg];
      if (!res.ok || dmg > 0) out.bad.push({ id, sprint, res, dmg });
    }
    out.routeCount = Object.keys(g.routes).length;
    out.validate = g.validateWaypoints();
    // draw calls: idle, holding fire on each gun, grenade aim and burst
    const dc = {}; g.clearInput(); g.teleport(60, 0, 20, Math.PI, 0); g.step(0.5); g.render(); dc.idle = g.state().drawCalls;
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { g.give('ammo'); g.selectWeapon(w); g.step(1); g.setInput({ fire: true }); let mx = 0; for (let i = 0; i < 30; i++) { g.step(1 / 60); g.render(); mx = Math.max(mx, g.state().drawCalls); } g.clearInput(); dc[w] = mx; }
    g.give('grenade'); g.setInput({ grenade: true }); g.step(0.3); g.render(); dc.grenadeAim = g.state().drawCalls; g.setInput({ grenade: false }); g.step(1 / 60);
    let mx = 0; for (let i = 0; i < 140; i++) { g.step(1 / 60); g.render(); mx = Math.max(mx, g.state().drawCalls); } dc.grenadeFlightAndBurst = mx;
    out.drawCalls = dc; out.triangles = g.state().triangles; out.rescues = g.rescueLog.length;
    return out;
  });
  console.log(JSON.stringify(r.routes));
  console.log(JSON.stringify({ routeCount: r.routeCount, bad: r.bad, validate: r.validate, drawCalls: r.drawCalls, triangles: r.triangles, rescues: r.rescues, fileSizeBytes, errors }, null, 1));
  await browser.close();
})();
