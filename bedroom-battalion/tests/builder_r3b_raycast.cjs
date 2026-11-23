// BUGS R3A-1: __game.raycast returns a soldier hit (was a TypeError).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => { const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.spawnBot('green', 'n.c.3'); g.step(0.5);
    const a = g.raycast([59, 1.6, 60], [0, 0, -1]); g.teleport(59, 0, 60, 0, 0); g.step(0.1); const bp = g.state().bots[0].pos, pl = g.state().player; const f = g.fire(); return { raycast: a, botPos: bp, player: [pl.x, pl.y, pl.z, pl.yaw, pl.pitch], fire: f && { hit: f.hit, zone: f.zone, d: f.distance } }; });
  console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
