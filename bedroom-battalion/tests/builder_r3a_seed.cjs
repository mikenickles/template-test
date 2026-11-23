// Round 3A: the same nav-test seed on two fresh page loads gives identical bot positions and stats.
const { launch } = require('./harness.cjs');
(async () => {
  const runs = [];
  for (let k = 0; k < 2; k++) {
    const { browser, page, errors } = await launch({ width: 640, height: 360 });
    runs.push(await page.evaluate(() => { const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.startNavTest({ bots: 10, seed: 3 }); g.step(300);
      const s = g.navStats(); return { pos: g.state().bots.map((b) => b.pos.join(',')).join(';'), rides: s.rides, cross: s.crossTotal, kinds: s.kindUse }; }));
    runs[k].errors = errors; await browser.close();
  }
  console.log(JSON.stringify({ identicalPositions: runs[0].pos === runs[1].pos, rides: [runs[0].rides, runs[1].rides], cross: [runs[0].cross, runs[1].cross], errors: runs.map((r) => r.errors) }));
})();
