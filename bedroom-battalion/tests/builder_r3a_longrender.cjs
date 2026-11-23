// Round 3A: 5 simulated minutes of the 10-bot nav test with a render every 0.5 s from the player's view; errors must stay empty.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 960, height: 540 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.teleport(60, 0, 58); g.lookAt(60, 1, 80);
    g.startNavTest({ bots: 10, seed: 11 });
    let maxDc = 0;
    for (let i = 0; i < 600; i++) { g.step(0.5); if (i % 2 === 0) g.lookAt(60 + 30 * Math.sin(i / 20), 1, 80 + 30 * Math.cos(i / 20)); g.render(); maxDc = Math.max(maxDc, g.state().drawCalls); }
    const s = g.navStats();
    return { maxDrawCalls: maxDc, stuck: s.stuck, rescues: s.rescues, envelope: s.envelopeSeconds, rides: s.rides, dead: s.dead };
  });
  console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
