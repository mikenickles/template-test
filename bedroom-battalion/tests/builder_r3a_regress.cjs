// Round 3A regression: 18 routes walking and sprinting, validateWaypoints, every non-ride edge driven alone in each allowed direction.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game, out = { routes: {}, bad: [], edgeFails: [] };
    g.start({ pointerLock: false }); g.setTimeScale(0);
    // wait until the crossing is clear of the train now and for the next 30 units of travel (train spans about 66 of track)
    const far = (sx) => { const L = 216.814; for (let k = 0; k < 4000; k++) { const head = g.state().train.cars[0].sFront, tail = head - 66; if (((sx - (tail - 6)) % L + L) % L > 66 + 6 + 30) return; g.step(1 / 60); } };
    for (const sprint of [false, true]) for (const id in g.routes) {
      g.clearInput(); g.give('health'); const dl = g.damageLog.length;
      const res = g.walkPath(g.routes[id], { sprint });
      const dmg = g.damageLog.slice(dl).reduce((a, d) => a + d.amount, 0);
      out.routes[id + (sprint ? ' sprint' : ' walk')] = [res.ok, res.time, +res.pos[1].toFixed(2), dmg];
      if (!res.ok || dmg > 0) out.bad.push({ id, sprint, res, dmg });
    }
    out.validate = g.validateWaypoints();
    let walks = 0;
    for (const e of g.waypoints.edges) {
      if (e.kind === 'ride') continue;
      for (const [a, b] of e.oneWay ? [[e.a, e.b]] : [[e.a, e.b], [e.b, e.a]]) {
        if (e.kind === 'cross') { const A = g.waypoints.nodes[a], B = g.waypoints.nodes[b]; far(g.trackS((A[0] + B[0]) / 2, (A[2] + B[2]) / 2)); }
        g.clearInput(); g.give('health'); g.teleport(...g.waypoints.nodes[a]); g.step(0.05);
        const dl = g.damageLog.length, res = g.walkPath([a, b], { timeout: 30 });
        const dmg = g.damageLog.slice(dl).reduce((s, d) => s + d.amount, 0);
        walks++;
        if (!res.ok || dmg > 0) out.edgeFails.push({ edge: a + '>' + b, kind: e.kind, res, dmg });
      }
    }
    out.edgeWalks = walks;
    out.rideRefused = g.walkPath(['w.ride.w', 'n.c.x']).error;
    out.rescues = g.rescueLog.length; out.trainRescues = g.trainRescueLog.length;
    return out;
  });
  console.log(JSON.stringify(r.routes));
  console.log(JSON.stringify({ bad: r.bad, validate: r.validate, edgeWalks: r.edgeWalks, edgeFails: r.edgeFails, rideRefused: r.rideRefused, rescues: r.rescues, trainRescues: r.trainRescues, fileSizeBytes, errors }, null, 1));
  await browser.close();
})();
