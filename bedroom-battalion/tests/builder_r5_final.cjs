// Round 5 final (the only checks allowed): one load with zero console errors, one runMatch seed with 0 stuck and 0 idle,
// validateWaypoints() returns [].
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 120000 });
  const out = await page.evaluate(() => {
    const g = window.__game;
    g.start({ pointerLock: false }); g.setTimeScale(0);
    const wp = g.validateWaypoints();
    const m = g.runMatch({ difficulty: 'regular', seed: 1, autoplay: true }); const rep = m;
    return { validateWaypoints: wp, colliderHash: g.colliderHash && g.colliderHash(), winner: m.winner, score: m.score, rounds: m.rounds.length, finished: m.finished,
      stuck: rep.stuckLog.length, idle: rep.idleLog.length, idleLog: rep.idleLog.slice(0, 5), stuckLog: rep.stuckLog.slice(0, 5), matchErrors: m.errors, simSeconds: m.simSeconds, wall: m.wallSeconds, stats: m.stats };
  });
  out.consoleErrors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
