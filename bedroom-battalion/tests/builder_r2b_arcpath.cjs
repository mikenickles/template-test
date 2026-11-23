// Diagnostic: the real grenade path for the floor arc screenshot throw (same physics as the preview).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0);
    g.give('grenade'); g.teleport(60, 0, 60, 0, -0.25); g.step(0.2); g.look(0, -0.25);
    g.setInput({ grenade: true }); g.step(0.3); g.setInput({ grenade: false }); g.step(1 / 60);
    const o = g.grenades[0], pts = [];
    for (let i = 0; i < 125 && g.grenades.includes(o); i++) { if (i % 6 === 0) pts.push([o.x, o.y, o.z].map((v) => +v.toFixed(2))); g.step(1 / 60); }
    return pts;
  });
  console.log(JSON.stringify(r), JSON.stringify(errors)); await browser.close();
})();
