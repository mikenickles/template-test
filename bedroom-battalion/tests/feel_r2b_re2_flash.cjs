// Round 2 re-check 2 (feel_re2_ pictures; copy of feel_r2b_flash.cjs). Round 2 re-check (copy of feel_r2_flash.cjs): muzzle flash. The page's own animation loop keeps drawing between hook calls and uses up the 2 flash frames,
// so here the loop is stopped (test side only: requestAnimationFrame replaced by a no-op) and every frame is drawn by hand.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await h.page.waitForTimeout(300);
  const files = [];
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    await h.page.evaluate((w) => { const G = __game; G.clearInput(); G.resetTargets(); G.give('ammo'); G.teleport(60, 0, 42); G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(0.8); G.selectWeapon(w); G.step(1.2); G.lookAt(60, 0.8, 34); G.setInput({ fire: true }); G.step(1 / 60); G.setInput({ fire: false }); G.render(); }, w);
    files.push(await h.shot('round2/feel_re2_flash_' + w + '_f1.png'));
    await h.page.evaluate(() => { __game.step(1 / 60); __game.render(); }); files.push(await h.shot('round2/feel_re2_flash_' + w + '_f2.png'));
    await h.page.evaluate(() => { __game.step(1 / 60); __game.render(); }); files.push(await h.shot('round2/feel_re2_flash_' + w + '_f3.png'));
  }
  // grenade burst, frame by frame from 9 units to the side
  await h.page.evaluate(() => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.teleport(8, 0, 12, -Math.PI / 2, 0); G.step(0.3); G.throwGrenade(0.2); let k = 0; while (G.grenades.length && G.grenades[0].fuse > 0.02 && k++ < 200) G.step(1 / 60); const g = G.grenades[0]; G.teleport(g.x, 0, g.z + 9); G.lookAt(g.x, 1.0, g.z); G.render(); });
  const gf = [await h.shot('round2/feel_re2_burst_f0.png')];
  for (const n of [2, 2, 4, 8, 16]) { await h.page.evaluate((n) => { __game.step(n / 60); __game.render(); }, n); gf.push(await h.shot('round2/feel_re2_burst_f' + gf.length + '.png')); }
  const d = __dirname + '/../screenshots/round2/';
  execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile 3x4 -geometry 640x360+3+3 "${d}feel_re2_cmp_flash.png"`);
  execSync(`montage ${gf.map((f) => '"' + f + '"').join(' ')} -tile 3x2 -geometry 640x360+3+3 "${d}feel_re2_cmp_burst.png"`);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
