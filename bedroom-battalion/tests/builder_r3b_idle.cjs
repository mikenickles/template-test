// Round 3B: runMatch without autoplay (the player stands idle at spawn: it is shot, then spectates); two seeds.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  for (const seed of [31, 32]) {
    const r = await page.evaluate((s) => { __game.setTimeScale(0); return __game.runMatch({ difficulty: 'regular', seed: s, autoplay: false }); }, seed);
    const you = r.soldiers.find((x) => x.name === 'You');
    console.log(`seed ${seed}: ${r.winner} ${r.score.green}-${r.score.tan}, rounds ${r.rounds.length}, You ${you.kills}/${you.deaths}, stuck ${r.stuckLog.length}, rescues ${r.trainRescueLog.length}, errors ${r.errors.length}, wall ${r.wallSeconds}s`);
  }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
