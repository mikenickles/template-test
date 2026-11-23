// Round 4A regression: two autoplay runMatch seeds per difficulty with stuck / idle / rescue counts, and the collider hash before and after.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game, out = { hashBefore: g.colliderHash(), matches: [] };
    for (const [d, seed] of [['recruit', 1], ['regular', 1], ['regular', 2], ['veteran', 2]]) {
      g.setTimeScale(0); const m = g.runMatch({ difficulty: d, seed, autoplay: true }); const rep = g.matchReport();
      out.matches.push({ d, seed, winner: m.winner, score: m.score, rounds: m.rounds.length, finished: m.finished, stuck: rep.stuckLog.length, idle: rep.idleLog.length, rescues: rep.trainRescueLog.length, errors: rep.errors.length });
    }
    out.hashAfter = g.colliderHash(); out.info = (({ programs, textures, geometries }) => ({ programs, textures, geometries }))(g.renderInfo());
    return out;
  });
  console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
