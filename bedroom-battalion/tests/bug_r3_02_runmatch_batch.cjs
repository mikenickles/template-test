// Round 3 gate check 1b: many runMatch calls per difficulty (fresh page per difficulty), summarising winners, scores,
// round reasons, time-outs, replays, tiebreaks, stuckLog, trainRescueLog and errors, and timing per match.
// Usage: node bug_r3_02_runmatch_batch.cjs <difficulty> <seed0> <count>
const { boot } = require('./bug_r3_lib.cjs');
const DIFF = process.argv[2] || 'regular', SEED0 = +(process.argv[3] || 1), COUNT = +(process.argv[4] || 20);
(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ DIFF, SEED0, COUNT }) => {
    const G = __game, rows = [];
    for (let k = 0; k < COUNT; k++) {
      const t0 = performance.now(); const r = G.runMatch({ difficulty: DIFF, seed: SEED0 + k, maxSimSeconds: 2600 });
      rows.push({ seed: SEED0 + k, winner: r.winner, score: r.score, finished: r.finished, rounds: r.rounds.map((q) => q.reason), durations: r.rounds.map((q) => q.duration), alive: r.rounds.map((q) => q.alive), stuck: r.stuckLog.length, stuckEx: r.stuckLog.slice(0, 2), trainRescues: r.trainRescueLog.length, errors: r.errors.length, errEx: r.errors.slice(0, 2), sim: r.simSeconds, wall: +((performance.now() - t0) / 1000).toFixed(2), kills: r.stats && r.stats.kills, headShare: r.stats && r.stats.headshotKillShare, hits: r.stats && r.stats.hits, shots: r.stats && r.stats.shots, grenades: r.stats && r.stats.grenades, rides: r.stats && r.stats.rides, env: r.stats && r.stats.envelopeSeconds });
    }
    return rows;
  }, { DIFF, SEED0, COUNT });
  const reasons = {}; let timeouts = 0, rounds = 0, unfinished = 0, noWinner = 0, stuck = 0, tr = 0, errs = 0, maxWall = 0, gw = 0;
  for (const r of out) { for (const q of r.rounds) { reasons[q] = (reasons[q] || 0) + 1; rounds++; } if (!r.finished) unfinished++; if (!r.winner || Math.max(r.score.green, r.score.tan) !== 5) noWinner++; stuck += r.stuck; tr += r.trainRescues; errs += r.errors; maxWall = Math.max(maxWall, r.wall); if (r.winner === 'green') gw++; }
  console.log(`${DIFF}: ${out.length} matches | green wins ${gw} | unfinished ${unfinished} | no 5-point winner ${noWinner} | rounds ${rounds} reasons ${JSON.stringify(reasons)} | stuckLog ${stuck} | trainRescues ${tr} | match errors ${errs} | max wall ${maxWall}s`);
  for (const r of out) console.log('  ', JSON.stringify({ seed: r.seed, w: r.winner, s: `${r.score.green}-${r.score.tan}`, reasons: r.rounds.map((q) => q[0]).join(''), timeoutAlive: r.rounds.map((q, i) => q === 'time' || q === 'replay' || q === 'tiebreak' ? `${r.alive[i].green}v${r.alive[i].tan}` : '').filter(Boolean).join(' '), stuck: r.stuck, tr: r.trainRescues, err: r.errors, kills: r.kills, head: r.headShare, grenades: r.grenades, rides: r.rides, env: r.env, wall: r.wall, ex: r.stuckEx.concat(r.errEx) }));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
