// Round 3A nav test: 10 bots, N simulated minutes per seed, every edge kind / route / ride / crossing, stuck, rescues, envelope time.
const { launch } = require('./harness.cjs');
const minutes = +(process.argv[2] || 30), seeds = (process.argv[3] || '1,2').split(',').map(Number);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  for (const seed of seeds) {
    await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.removeBots(); __game.teleport(60, 0, 16); });
    const p0 = await page.evaluate(() => ({ byState: Object.assign({}, __game.trainStats.byState), rescues: __game.trainRescueLog.length }));
    await page.evaluate((s) => __game.startNavTest({ bots: 10, seed: s }), seed);
    const t0 = Date.now(); let maxInsideNotRiding = 0;
    for (let m = 0; m < minutes; m++) {
      await page.evaluate(() => { for (let i = 0; i < 60; i++) __game.step(1); });
    }
    const r = await page.evaluate((p0) => {
      const s = __game.navStats(), bs = {};
      for (const k in __game.trainStats.byState) bs[k] = __game.trainStats.byState[k] - (p0.byState[k] || 0);
      const edgeUse = s.edgeUse, counts = Object.values(edgeUse);
      delete s.edgeUse;
      s.edgeUseMin = Math.min(...counts); s.edgeDirectionsUsed = counts.length;
      s.pushesByBotState = bs;
      s.botsAtEnd = __game.state().bots.map((b) => [b.name, b.state, b.pos.map((v) => +v.toFixed(1)).join(','), b.edge]);
      return s;
    }, p0);
    r.wallSeconds = (Date.now() - t0) / 1000;
    console.log('=== seed ' + seed + ' ===');
    for (const k of ['simSeconds', 'tasks', 'kindUse', 'unusedKinds', 'routeUse', 'unusedRoutes', 'rides', 'rideStarts', 'rideBoards', 'rideAborts', 'rideGiveUps',
      'crossUse', 'crossTotal', 'crossWaits', 'crossWaitSeconds', 'unusedCross', 'edgesTotal', 'edgeDirectionsUsed', 'edgeUseMin', 'unusedEdges', 'unusedDirections',
      'stuck', 'stuckLog', 'rescues', 'rescueLog', 'envelopeSeconds', 'envelopeByBot', 'evades', 'repaths', 'stuckJumps', 'stuckStrafes', 'stuckRepaths',
      'trainPushes', 'pushesByBotState', 'hitWhileWaiting', 'noPath', 'dead', 'botsAtEnd', 'wallSeconds']) console.log(k, JSON.stringify(r[k]));
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
