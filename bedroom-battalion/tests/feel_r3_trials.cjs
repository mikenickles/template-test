// Round 3: live trials of pacing and map changes on regular, same seeds as the baseline. Nothing is written to index.html.
// Variants: base; pace (ai.holdUntil 20, ai.huntLast 60); eastblock (test collider x 81.4..85, z 78.5..81.5, h 2.5 via addTestBlock, closing the corridor beside the tunnel; node m.e.w moved to x 88.5 under the chair);
// both. Usage: node feel_r3_trials.cjs [matches] [variant,...]
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 12), VARS = (process.argv[3] || 'base,pace,eastblock,both').split(',');
const OUT = (process.env.FEEL_OUT || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad') + '/feel_r3_trials.json';
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r3_lib.js', 'utf8') });
  const res = {};
  for (const v of VARS) {
    const info = await h.page.evaluate((v) => { const G = __game, A = G.CONFIG.ai; A.holdUntil = 40; A.huntLast = 30; G.removeTestBlocks();
      if (v === 'pace' || v === 'both') { A.holdUntil = 20; A.huntLast = 60; }
      G.waypoints.nodes['m.e.w'][0] = 83.2;
      if (v === 'eastblock' || v === 'both') { G.addTestBlock(81.4, 85.0, 78.5, 81.5, 2.5); G.waypoints.nodes['m.e.w'][0] = 88.5; }
      const vb = G.validateWaypoints() || []; return { clearance: (G.trainClearance() || []).length, blockedEdges: vb.length, ex: JSON.stringify(vb.slice(0, 4)).slice(0, 300) }; }, v);
    const ms = [];
    for (let i = 0; i < N; i++) { ms.push(await h.page.evaluate((s) => R3.play({ difficulty: 'regular', seed: s, sample: 2 }), 100 + i)); process.stdout.write('.'); }
    res[v] = { info, ms };
    console.log(' ', v, JSON.stringify(info));
  }
  fs.writeFileSync(OUT, JSON.stringify(res));
  for (const v in res) { const M = res[v].ms, R = M.flatMap((m) => m.rounds.filter((r) => r.end)), K = R.flatMap((r) => r.kills);
    const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? +a[Math.floor(a.length / 2)].toFixed(1) : null; };
    const eastEarly = K.filter((k) => k.t < 20 && k.kPos && k.vPos && k.kPos[0] > 78 && k.vPos[0] > 78 && k.dist > 50).length;
    const w = M.reduce((o, m) => (o[m.rep.winner] = (o[m.rep.winner] || 0) + 1, o), {});
    const st = M.reduce((o, m) => { o.s += m.rep.stats.shots.green + m.rep.stats.shots.tan; o.h += m.rep.stats.hits; o.stuck += m.rep.stuckLog.length; o.resc += m.rep.trainRescueLog.length; return o; }, { s: 0, h: 0, stuck: 0, resc: 0 });
    console.log(`${v.padEnd(10)} rounds ${R.length}, median length ${med(R.map((r) => r.end.duration))} s, to time ${Math.round(100 * R.filter((r) => r.end.reason !== 'eliminated').length / R.length)}%, replays ${R.filter((r) => r.end.reason === 'replay').length}, first kill ${med(R.map((r) => r.firstKill))} s, 40 s+ silences ${R.filter((r) => r.maxGap >= 40).length}, early long east kills ${eastEarly} (${(eastEarly / R.length).toFixed(2)}/round), hit ${Math.round(100 * st.h / st.s)}%, matches G/T ${w.green || 0}/${w.tan || 0}, stuck ${st.stuck}, rescues ${st.resc}`); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
