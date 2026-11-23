const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const d = await h.page.evaluate(() => {
    const kinds = {};
    for (const c of __game.colliders) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    const sample = {};
    for (const c of __game.colliders) if (!sample[c.kind]) sample[c.kind] = JSON.parse(JSON.stringify(c));
    return { kinds, sample, routes: __game.routes, moved: __game.movedNodes,
      strings: __game.colliders.filter(c => c.kind === 'string'), pads: __game.colliders.filter(c => c.kind === 'pad'),
      ramps: __game.colliders.filter(c => c.kind === 'ramp').map(c => JSON.parse(JSON.stringify(c))),
      ids: __game.colliders.map(c => c.id).filter((v, i, a) => a.indexOf(v) === i).length, n: __game.colliders.length,
      blocked: __game.validateWaypoints(), nodeCount: Object.keys(__game.waypoints.nodes).length };
  });
  console.log(JSON.stringify(d, null, 1));
  await h.browser.close();
})();
