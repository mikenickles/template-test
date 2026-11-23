// Round 3A smoke: load, train state, clearance, nav graph, a few bots for a short while, errors.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0);
    const out = {};
    out.train0 = g.state().train;
    out.clear = g.trainClearance(); out.band = g.trainClearance({ band: true });
    out.gaps = g.trainGaps(1.5);
    out.nav = g.nav();
    out.validate = g.validateWaypoints();
    const t0 = performance.now(); g.step(5); out.step5ms = performance.now() - t0;
    out.train1 = g.state().train.cars.map((c) => c.pos);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(errors), 'size', fileSizeBytes);
  await browser.close();
})();
