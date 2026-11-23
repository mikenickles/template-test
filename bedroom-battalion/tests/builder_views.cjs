// Builder helper: screenshot named views (args: view names, default all) into screenshots/round1/builder_<view>.png
const { launch } = require('./harness.cjs');

(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const debug = process.argv.includes('--debug');
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const all = names.length ? names : await page.evaluate(() => Object.keys(__game.views));
  if (debug) await page.evaluate(() => __game.setDebug(true));
  for (const n of all) {
    await page.evaluate((v) => { __game.setView(v); __game.render(); }, n);
    await page.waitForTimeout(350);
    await shot('round1/builder_' + n + (debug ? '_debug' : '') + '.png');
  }
  console.log(JSON.stringify({ state: await page.evaluate(() => __game.state()), errors }));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
