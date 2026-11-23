// Round 4B viewmodels: each weapon at the hip, mid-recoil with the flash, mid-reload; the sniper half scoped and scoped; the grenade
// hand. Only the sniper aims (DESIGN 12: right mouse scopes the sniper), so there is no ADS pose for the other guns.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.teleport(60, 0, 44); g.lookAt(60, 1.4, 80); g.step(0.1); });
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    await page.evaluate((w) => { const g = __game; g.selectWeapon(w); g.step(1.2); g.render(); }, w);
    await shot('round4/builder_r4b_vm_' + w + '_hip.png');
    await page.evaluate(() => { const g = __game; g.fire(); g.step(1 / 60); g.render(); });
    await shot('round4/builder_r4b_vm_' + w + '_fire.png');
    await page.evaluate(() => { const g = __game; g.step(2); g.reload(); g.step(0.6); g.render(); });
    await shot('round4/builder_r4b_vm_' + w + '_reload.png');
    await page.evaluate(() => { const g = __game; g.step(3.5); });
  }
  await page.evaluate(() => { const g = __game; g.selectWeapon('sniper'); g.step(1.2); g.setInput({ scope: true }); g.step(0.1); g.render(); });
  await shot('round4/builder_r4b_vm_sniper_scope_half.png');
  await page.evaluate(() => { const g = __game; g.step(0.5); g.render(); });
  await shot('round4/builder_r4b_vm_sniper_scoped.png');
  await page.evaluate(() => { const g = __game; g.setInput({ scope: false }); g.step(0.5); g.selectWeapon('rifle'); g.step(1); g.setInput({ grenade: true }); g.step(0.4); g.render(); });
  await shot('round4/builder_r4b_vm_grenade.png');
  await page.evaluate(() => { const g = __game; g.setInput({ grenade: false }); g.clearInput(); g.step(3); });
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
