// Round 3 pass 2 balance: autoplay matches (player = Green bot) over many seeds; wins, rounds and kills per lane per side, round end reasons.
const { launch } = require('./harness.cjs');
const diffs = (process.argv[2] || 'recruit,regular,veteran').split(','), n = +(process.argv[3] || 40), base = +(process.argv[4] || 2000), file = process.argv[5];
(async () => {
  const { browser, page, errors } = await launch(file ? { width: 640, height: 360, file } : { width: 640, height: 360 });
  for (const d of diffs) {
    const sum = { matches: 0, wins: { green: 0, tan: 0 }, rounds: { green: 0, tan: 0, none: 0 }, reasons: {}, kills: { green: {}, tan: {} }, killTotal: { green: 0, tan: 0 }, idle: 0, stuck: 0, rescues: 0, errors: 0, unfinished: 0, wall: 0 };
    for (let i = 0; i < n; i++) {
      const r = await page.evaluate(([d, s]) => { __game.setTimeScale(0); __game.runMatch({ difficulty: d, seed: s, autoplay: true }); return __game.matchReport(); }, [d, base + i]);
      sum.matches++; sum.wins[r.winner]++;
      for (const x of r.rounds) { sum.rounds[x.winner || 'none']++; sum.reasons[x.reason] = (sum.reasons[x.reason] || 0) + 1; }
      for (const k of (r.kills || [])) { if (!k.killerTeam || k.killerTeam === k.victimTeam) continue; const L = sum.kills[k.killerTeam]; L[k.lane] = (L[k.lane] || 0) + 1; sum.killTotal[k.killerTeam]++; }
      sum.idle += (r.idleLog || []).length; sum.stuck += r.stuckLog.length; sum.rescues += r.trainRescueLog.length; sum.errors += r.errors.length; sum.wall += r.wallSeconds || 0; if (r.finished === false) sum.unfinished++;
    }
    sum.wall = +sum.wall.toFixed(1);
    console.log(d, JSON.stringify(sum));
  }
  console.log('console errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
