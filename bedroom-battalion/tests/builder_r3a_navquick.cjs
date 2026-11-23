// Quick nav test: N bots for a few simulated minutes, prints navStats summary.
const { launch } = require('./harness.cjs');
const minutes = +(process.argv[2] || 2), seed = +(process.argv[3] || 1), nb = +(process.argv[4] || 10);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.teleport(60, 0, 16); });
  await page.evaluate(([n, s]) => __game.startNavTest({ bots: n, seed: s }), [nb, seed]);
  const t0 = Date.now();
  for (let m = 0; m < minutes; m++) {
    await page.evaluate(() => { for (let i = 0; i < 60; i++) __game.step(1); });
  }
  const r = await page.evaluate(() => { const s = __game.navStats(); delete s.edgeUse; return s; });
  r.wallSeconds = (Date.now() - t0) / 1000;
  console.log(JSON.stringify(r, null, 0));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
