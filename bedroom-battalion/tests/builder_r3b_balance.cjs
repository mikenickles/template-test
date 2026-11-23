// Round 3B balance: autoplay matches (the player is a Green bot), many seeds per difficulty; wins, rounds and per-team totals.
const { launch } = require('./harness.cjs');
const diffs = (process.argv[2] || 'recruit,regular,veteran').split(','), n = +(process.argv[3] || 6), base = +(process.argv[4] || 100);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  for (const d of diffs) {
    const sum = { wins: { green: 0, tan: 0 }, rounds: { green: 0, tan: 0, replay: 0 }, kills: { green: 0, tan: 0 }, shots: { green: 0, tan: 0 }, hg: { green: 0, tan: 0 }, stuck: 0, rescues: 0, errors: 0, wall: 0, unfinished: 0, scores: [] };
    for (let i = 0; i < n; i++) {
      const r = await page.evaluate(([d, s]) => { __game.setTimeScale(0); const r = __game.runMatch({ difficulty: d, seed: s, autoplay: true }); return r; }, [d, base + i]);
      sum.wins[r.winner]++; sum.scores.push(r.score.green + '-' + r.score.tan);
      r.rounds.forEach((x) => sum.rounds[x.winner || 'replay']++);
      r.soldiers.forEach((s) => { sum.kills[s.team] += s.kills; });
      sum.shots.green += r.stats.shots.green; sum.shots.tan += r.stats.shots.tan; sum.hg.green += r.highGroundTime.green; sum.hg.tan += r.highGroundTime.tan;
      sum.stuck += r.stuckLog.length; sum.rescues += r.trainRescueLog.length; sum.errors += r.errors.length; sum.wall += r.wallSeconds; if (!r.finished) sum.unfinished++;
    }
    sum.hg.green = Math.round(sum.hg.green); sum.hg.tan = Math.round(sum.hg.tan); sum.wall = +sum.wall.toFixed(1);
    console.log(d, JSON.stringify(sum));
  }
  console.log('console errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
