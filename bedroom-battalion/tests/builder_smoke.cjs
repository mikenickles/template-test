// Builder smoke test: load, waypoint validation, every route, fort-to-fort sprint, one screenshot.
const { launch } = require('./harness.cjs');

(async () => {
  const { browser, page, errors, blocked, shot, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  const out = { fileSizeBytes };
  out.ready = await page.evaluate(() => window.__game.ready);
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  out.colliders = await page.evaluate(() => __game.colliders.length);
  out.nodes = await page.evaluate(() => Object.keys(__game.waypoints.nodes).length);
  out.edges = await page.evaluate(() => __game.waypoints.edges.length);
  out.blockedEdges = await page.evaluate(() => __game.validateWaypoints());
  out.routes = await page.evaluate(() => {
    const r = {};
    for (const id of Object.keys(__game.routes)) {
      const res = __game.walkPath(__game.routes[id]);
      const s = __game.state().player;
      r[id] = { ok: res.ok, time: res.time, stuckAt: res.stuckAt, y: +s.y.toFixed(2), pos: res.pos, health: s.health };
    }
    return r;
  });
  out.damageLog = await page.evaluate(() => __game.damageLog.slice());
  // straight sprint from just outside the Green gate to the Tan gate line, along x = 48 (clear of the ruin)
  out.sprint = await page.evaluate(() => {
    __game.clearInput();
    __game.teleport(48, 0, 28, Math.PI, 0);
    __game.setInput({ forward: true, sprint: true });
    let t = 0;
    while (__game.state().player.z < 132 && t < 60) { __game.step(1 / 60); t += 1 / 60; }
    __game.clearInput();
    const s = __game.state().player;
    return { seconds: +t.toFixed(2), endZ: +s.z.toFixed(2), endX: +s.x.toFixed(2) };
  });
  out.sprintCentreLane = await page.evaluate(() => {
    const path = ['n.f.gate', 'n.c.2', 'n.c.3', 'n.c.4', 'n.c.5', 'n.r.ne', 'n.r.n', 'm.r.e', 's.r.se', 's.r.s', 's.r.sw', 's.c.5', 's.c.4', 's.c.3', 's.c.2', 's.f.gate'];
    const r = __game.walkPath(path, { sprint: true });
    return { ok: r.ok, time: r.time, stuckAt: r.stuckAt };
  });
  await page.evaluate(() => { __game.teleport(60, 0, 20, Math.PI, 0); __game.setView('spawn_green'); __game.render(); });
  await page.waitForTimeout(400);
  out.shot = await shot('round1/builder_spawn_green.png');
  out.state = await page.evaluate(() => __game.state());
  out.errors = errors; out.blocked = blocked;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
