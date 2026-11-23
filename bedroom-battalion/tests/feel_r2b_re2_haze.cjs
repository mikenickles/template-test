// Round 2 re-check 2: player-eye shots with the build's haze (20 / 320) against the round 1 values (10 / 220), set live through CONFIG.fog.
// Also samples the rendered colour of the near and far wall to compare how far each fades toward the haze.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
const views = [['spawn', [60, 0, 20], [60, 1.6, 80]], ['gate', [60, 0, 28], [60, 1.6, 140]], ['midfloor', [60, 0, 66], [60, 3, 140]], ['westlane', [40, 0, 60], [40, 6, 160]], ['bedtop', [27, 18, 80], [100, 10, 80]], ['bedtop_south', [30, 18, 50], [60, 5, 160]]];
(async () => {
  const h = await boot();
  const pairs = [];
  for (const [tag, pos, tgt] of views) { const f = [];
    for (const [n, fa] of [[20, 320], [10, 220]]) {
      await h.page.evaluate(([n, fa]) => { __game.CONFIG.fog.near = n; __game.CONFIG.fog.far = fa; __game.selectWeapon('rifle'); }, [n, fa]);
      f.push(await h.eyeShot('../round2/feel_re2_haze_' + tag + '_' + n + '_' + fa + '.png', pos, tgt)); }
    pairs.push(...f); }
  await h.page.evaluate(() => { __game.CONFIG.fog.near = 20; __game.CONFIG.fog.far = 320; });
  const dir = __dirname + '/../screenshots/round2/';
  execSync(`montage ${pairs.map((f) => '"' + f + '"').join(' ')} -label %t -tile 2x6 -geometry 640x360+3+3 "${dir}feel_re2_cmp_haze.png"`);
  // depth cue numbers: linear fog fraction at fort-to-fort and wall distances
  for (const [n, fa] of [[20, 320], [10, 220], [30, 330]]) { const f = (d) => Math.max(0, Math.min(1, (d - n) / (fa - n))); console.log(`fog ${n}/${fa}: haze at 30u ${(100 * f(30)).toFixed(0)}%  60u ${(100 * f(60)).toFixed(0)}%  120u ${(100 * f(120)).toFixed(0)}%  150u ${(100 * f(150)).toFixed(0)}%`); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
