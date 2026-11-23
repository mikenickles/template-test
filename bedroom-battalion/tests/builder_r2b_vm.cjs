// SMG and pistol viewmodels side by side (FIXLIST item 2: they must differ at a glance).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  for (const w of ['smg', 'pistol', 'rifle']) {
    await page.evaluate((w) => { const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.teleport(60, 0, 60, 0, 0); g.selectWeapon(w); g.step(1); g.render(); }, w);
    await shot(`round2/builder_r2b_vm_${w}.png`);
  }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
