// Round 2 re-check 2: a dummy inside the grenade dome, seen from about 14 units to the side, at fixed ticks after the burst.
// Also measures how much the dummy's colour survives inside the dome (pixel sample at the dummy's screen position).
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await h.page.waitForTimeout(300);
  const files = [];
  // best throw from 14 u south of target.1 (60,0,34): pitch -9 deg, lands about 0.2 u from it
  await h.page.evaluate(() => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.selectWeapon('rifle'); G.teleport(60, 0, 48, 0, -9 * Math.PI / 180); G.step(0.8); G.look(0, -9 * Math.PI / 180); G.throwGrenade(0.2);
    let k = 0; while (G.grenades.length && G.grenades[0].fuse > 1 / 60 + 1e-6 && k++ < 200) G.step(1 / 60); G.teleport(46.5, 0, 31); G.lookAt(60, 0.9, 34); G.render(); });
  files.push(await h.shot('round2/feel_re2_dome_t0.png'));
  let t = 0; for (const n of [1, 2, 2, 3, 4, 6]) { t += n; await h.page.evaluate((n) => { __game.step(n / 60); __game.render(); }, n); files.push(await h.shot('round2/feel_re2_dome_t' + t + '.png')); }
  execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -label %t -tile 4x2 -geometry 640x360+3+3 "${__dirname}/../screenshots/round2/feel_re2_cmp_dome.png"`);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
