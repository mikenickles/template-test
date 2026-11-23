// Round 3B: runMatch with autoplay on each difficulty for several seeds; summary per match.
const { launch } = require('./harness.cjs');
const diffs = (process.argv[2] || 'recruit,regular,veteran').split(','), seeds = (process.argv[3] || '1,2').split(',').map(Number);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const all = [];
  for (const d of diffs) for (const seed of seeds) {
    const r = await page.evaluate(([d, seed]) => { const g = __game; g.setTimeScale(0); return g.runMatch({ difficulty: d, seed, autoplay: true }); }, [d, seed]);
    all.push(r);
    const lu = (t) => Object.entries(r.laneUse[t]).map(([k, v]) => k + ' ' + Math.round(v)).join(', ');
    console.log(`== ${d} seed ${seed}: ${r.winner} ${r.score.green}-${r.score.tan} in ${r.rounds.length} rounds, sim ${r.simSeconds} s, wall ${r.wallSeconds} s, finished ${r.finished}`);
    console.log('  rounds', r.rounds.map((x) => `${x.round}:${x.winner || 'replay'}/${x.reason}/${x.duration}s/${x.kills}k`).join('  '));
    console.log(`  stuck ${r.stuckLog.length} rescues ${r.trainRescueLog.length} errors ${r.errors.length} envelope ${r.stats.envelopeSeconds}s`);
    console.log(`  kills ${r.stats.kills} head-kill share ${r.stats.headshotKillShare} hits ${r.stats.hits} head-hit share ${r.stats.headshotHitShare} shots G${r.stats.shots.green}/T${r.stats.shots.tan}`);
    console.log(`  grenades G${r.stats.grenades.green}/T${r.stats.grenades.tan} rides G${r.stats.rides.green}/T${r.stats.rides.tan} (tries ${r.stats.rideTries}) crossings G${r.stats.crossings.green}/T${r.stats.crossings.tan}`);
    console.log('  lane green: ' + lu('green')); console.log('  lane tan:   ' + lu('tan'));
    console.log('  high ground', JSON.stringify(r.highGroundTime), ' K/D', r.soldiers.map((s) => `${s.name}(${s.role}) ${s.kills}/${s.deaths}`).join(', '));
    if (r.stuckLog.length) console.log('  stuckLog', JSON.stringify(r.stuckLog.slice(0, 6)));
    if (r.errors.length) console.log('  errors', JSON.stringify(r.errors.slice(0, 3)));
  }
  const wins = { green: 0, tan: 0 }; all.forEach((r) => wins[r.winner]++);
  console.log('wins', JSON.stringify(wins), 'console errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
