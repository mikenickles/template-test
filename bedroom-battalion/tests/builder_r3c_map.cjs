// Round 3 pass 2: the east-lane toy box and the new nodes: validateWaypoints, the new edges driven alone, train clearance.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0);
    const out = { validate: g.validateWaypoints(), clearance: g.trainClearance(), band: g.trainClearance({ band: true }).map((c) => c.id), nav: g.nav() };
    out.walks = [];
    for (const [a, b] of [['n.e.6', 'm.e.cn'], ['m.e.cn', 'm.e.u'], ['m.e.u', 'm.e.cs'], ['m.e.cs', 's.e.6'], ['s.e.6', 'm.e.cs'], ['m.e.cs', 'm.e.u'], ['m.e.u', 'm.e.cn'], ['m.e.cn', 'n.e.6'], ['m.tunnel.top', 'm.e.u']]) {
      g.teleport(...g.waypoints.nodes[a]); g.step(0.05); const d0 = g.damageLog.length; const res = g.walkPath([a, b]); out.walks.push([a + '>' + b, res.ok, res.time, g.damageLog.length - d0]);
    }
    out.box = g.colliders.find((c) => c.id === 'm.E-d.toybox').bounds;
    out.losAcross = g.raycast([83.2, 1.6, 60], [0, 0, 1]);      // the old corridor line: now stopped by the box?
    return out;
  });
  console.log(JSON.stringify(r, null, 0)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
