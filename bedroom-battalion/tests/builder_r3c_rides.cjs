const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => { const o = []; for (let s = 1; s <= 8; s++) { __game.setTimeScale(0); const m = __game.runMatch({ difficulty: 'regular', seed: s }); o.push([m.stats.rideTries, m.stats.rideAtWait, m.stats.rideGiveUps, m.stats.rides.green + m.stats.rides.tan]); } return o; });
  console.log('tries, reached wait node, gave up, rides', JSON.stringify(r)); await browser.close();
})();
