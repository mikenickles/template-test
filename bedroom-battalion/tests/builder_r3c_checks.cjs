// Round 3 pass 2: R3-1 repro (recruit seed 201: Tan 2 and Green 3 at 40 s now firing), R3-3 same seed three times in one page,
// R3-5 death camera timing, R3-4 tie sequence, callout rate limit.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game, out = {}; g.setTimeScale(0);
    // R3-1: the repro, then 20 s of watching Tan 2 and Green 3
    g.startMatch({ difficulty: 'recruit', seed: 201, autoplay: true });
    while (g.state().match.phase !== 'live') g.step(1 / 60);
    g.step(40);
    const who = ['Tan 2', 'Green 3'], before = {}, shots0 = {};
    for (const n of who) { const b = g.bots.find((x) => x.name === n); before[n] = { pos: [b.x, b.y, b.z].map((v) => +v.toFixed(1)), state: b.brain.state, dead: b.dead, weapon: b.arsenal.current }; shots0[n] = 0; }
    const ids = {}; for (const n of who) ids[g.bots.find((x) => x.name === n).id] = n;
    let seen = g.shotLog.length ? g.shotLog[g.shotLog.length - 1] : null;
    const fired = { 'Tan 2': 0, 'Green 3': 0 }, moved = { 'Tan 2': 0, 'Green 3': 0 };
    const p0 = {}; for (const n of who) { const b = g.bots.find((x) => x.name === n); p0[n] = [b.x, b.y, b.z]; }
    for (let i = 0; i < 60 * 20; i++) {
      g.step(1 / 60);
      const L = g.shotLog; for (let k = L.length - 1; k >= 0 && L[k] !== seen; k--) if (ids[L[k].by]) fired[ids[L[k].by]]++;
      seen = L[L.length - 1];
      for (const n of who) { const b = g.bots.find((x) => x.name === n); moved[n] = Math.max(moved[n], Math.hypot(b.x - p0[n][0], b.y - p0[n][1], b.z - p0[n][2])); }
    }
    out.r31 = { at40s: before, shotsNext20s: fired, maxMoveNext20s: Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, +v.toFixed(1)])),
      after: Object.fromEntries(who.map((n) => { const b = g.bots.find((x) => x.name === n); return [n, { state: b.brain.state, dead: b.dead, hp: b.hp }]; })) };
    // R3-3: same seed three times in one page
    out.r33 = [];
    for (let k = 0; k < 3; k++) { const m = g.runMatch({ difficulty: 'regular', seed: 1 }); out.r33.push({ winner: m.winner, score: m.score, rounds: m.rounds.length, sim: m.simSeconds, kills: m.stats.kills, idle: m.idleLog.length }); }
    out.r33same = out.r33.every((x) => JSON.stringify(x) === JSON.stringify(out.r33[0]));
    // R3-5: death camera hands over to spectating 1.5 s after death
    g.startMatch({ difficulty: 'regular', seed: 3 }); g.setGodMode(false);
    while (g.state().match.phase !== 'live') g.step(1 / 60);
    g.damagePlayer(500); const t0 = g.state().time; let ts = null;
    for (let i = 0; i < 300 && ts === null; i++) { g.step(1 / 60); if (g.state().match.spectating) ts = g.state().time; }
    out.r35 = { spectateAfter: ts === null ? null : +(ts - t0).toFixed(3) };
    // R3-4: four ties in a row with equal health and equal damage: replay x3, then a draw (no point), then a normal round
    g.startMatch({ difficulty: 'regular', seed: 4 }); g.setGodMode(true);
    const R = [];
    const live = () => { let k = 0; while (g.state().match.phase !== 'live' && k++ < 2000) g.step(0.25); };
    const finish = () => { let k = 0; while (g.state().match.phase === 'roundEnd' && k++ < 2000) g.step(0.25); };
    for (let i = 0; i < 5; i++) { live(); g.skipRound(); const m = g.state().match; R.push({ reason: m.lastRound.reason, winner: m.lastRound.winner, replays: m.replays, score: Object.assign({}, m.score) }); finish(); }
    out.r34 = R;
    // R3-6: callout spacing per bot over a regular match
    g.runMatch({ difficulty: 'regular', seed: 6 });
    const last = {}; let viol = 0, total = 0, perMin = 0;
    for (const c of g.callouts) { total++; if (last[c.who] !== undefined && c.time - last[c.who] < 4 - 1e-6) viol++; last[c.who] = c.time; }
    out.r36 = { callouts: total, under4s: viol, imHit: g.callouts.filter((c) => c.text === "I'm hit").length, samples: g.callouts.slice(0, 6).map((c) => c.text) };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
