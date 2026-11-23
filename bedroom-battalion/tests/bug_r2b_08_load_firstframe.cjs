// Round 2 re-check 2: the load-time shader compile (DESIGN 15.7). Fresh page: console must stay clean through load,
// title and start; the very first rendered frames (every named view, and the player's own view at spawn) must match
// the same views rendered 3 s later with nothing fired, so no flash, burst sphere, arc or tracer is left visible.
// Pixel comparison is done by tests/bug_r2b_08_diff.py on the saved PNGs (scratch folder given as argv[2]).
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');
const OUT = process.argv[2] || path.resolve(__dirname, '..', 'screenshots', 'round2', 'bug_r2b_firstframe');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await launch({ width: 960, height: 540 });
  const loadErrors = errors.slice();
  await page.screenshot({ path: path.join(OUT, 'title.png') });
  const views = await page.evaluate(() => { const G = __game; G.start({ pointerLock: false }); G.setTimeScale(0); return Object.keys(G.views || {}); });
  const shots = async (tag) => {
    for (const v of views) { await page.evaluate((v) => { __game.setView(v); __game.render(); }, v); await page.screenshot({ path: path.join(OUT, `${tag}_${v}.png`) }); }
    await page.evaluate(() => { __game.clearView(); __game.teleport(60, 0, 20, Math.PI, 0); __game.render(); });
    await page.screenshot({ path: path.join(OUT, `${tag}_player_spawn.png`) });
    await page.evaluate(() => { __game.teleport(60, 0, 100, 0, -0.3); __game.render(); });
    await page.screenshot({ path: path.join(OUT, `${tag}_player_centre_down.png`) });
  };
  await shots('first');
  const state1 = await page.evaluate(() => ({ grenades: __game.grenades.length, shots: __game.shotLog.length, sounds: __game.audioLog.map((a) => a.name), w: __game.state().weapon }));
  await page.evaluate(() => __game.step(3));
  await shots('later');
  // and after real effects have run once and settled, the same frames again (nothing left behind)
  await page.evaluate(() => { const G = __game; G.teleport(60, 0, 100, 0, 0.2); G.give('grenade'); for (let i = 0; i < 10; i++) { G.fire(); G.step(0.12); } G.setInput({ grenade: true }); G.step(0.5); G.setInput({ grenade: false }); G.step(3); G.render(); G.clearInput(); G.give('ammo'); G.resetTargets(); G.step(3.5); });
  await shots('aftereffects');
  console.log('views', JSON.stringify(views));
  console.log('state at first frame', JSON.stringify(state1));
  console.log('LOAD ERRORS', JSON.stringify(loadErrors));
  console.log('ERRORS', JSON.stringify(errors));
  console.log('OUT', OUT);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
