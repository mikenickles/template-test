// Round 2 pass 2: load, fire every gun, throw a grenade, render; report errors and draw calls.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0);
    const out = { dc: {} };
    g.teleport(60, 0, 20, Math.PI, 0); g.step(0.5); g.render(); out.dc.idle = g.state().drawCalls;
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { g.selectWeapon(w); g.step(1); g.setInput({ fire: true }); let mx = 0; for (let i = 0; i < 20; i++) { g.step(1 / 60); g.render(); mx = Math.max(mx, g.state().drawCalls); } g.clearInput(); out.dc[w] = mx; }
    g.give('grenade'); g.setInput({ grenade: true }); g.step(0.3); g.render(); out.dc.aim = g.state().drawCalls; g.setInput({ grenade: false }); g.step(1 / 60);
    let mx = 0; for (let i = 0; i < 140; i++) { g.step(1 / 60); g.render(); mx = Math.max(mx, g.state().drawCalls); } out.dc.burstMax = mx;
    return out;
  });
  console.log(JSON.stringify(r), 'size', fileSizeBytes, 'errors', JSON.stringify(errors));
  await browser.close();
})();
