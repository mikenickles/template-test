// Round 3B smoke: load, one autoplay match on regular, errors.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 960, height: 540 });
  const r = await page.evaluate(() => { const g = __game; g.setTimeScale(0); const res = g.runMatch({ difficulty: 'regular', seed: 1, maxSimSeconds: +(window._max || 1800) }); delete res.laneUse; return res; });
  console.log(JSON.stringify(r, null, 0).slice(0, 4000));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
