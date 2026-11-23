// Round 3A: a bot climbing a shelf string (pose flat against the string, gun slung).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0);
    const id = g.spawnBot('tan', 's.ts1.b'); g.botGoto(id, 's.ts2.b', { ride: false });
    let n = 0; while (!(g.state().bots[0].climbing && g.state().bots[0].pos[1] > 27) && n < 1200) { g.step(1 / 60); n++; }
    const b = g.state().bots[0];
    g.teleport(101, 20, 128); g.lookAt(107.6, b.pos[1] + 0.9, 130); g.render();
    return { climbing: b.climbing, pos: b.pos, state: b.state };
  });
  await shot('round3/builder_r3a_bot_climbing.png');
  console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
