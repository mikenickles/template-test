// Round 3 re-check helper: trace one bot through one round of an autoplay match (seeds reproduce since the fix):
// position, brain and movement state, weapon, mag, path, every 5 s, plus its shots. Usage:
// node bug_r3_11_trace.cjs <difficulty> <seed> <round> "<bot name>"
const { boot } = require('./bug_r3_lib.cjs');
const [DIFF, SEED, ROUND, NAME] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
(async () => {
  const { browser, page } = await boot();
  const rows = await page.evaluate(({ DIFF, SEED, ROUND, NAME }) => {
    const G = __game, DT = 1 / 60, out = [];
    G.startMatch({ difficulty: DIFF, seed: SEED, autoplay: true }); G.setTimeScale(0);
    let mk = G.shotLog[G.shotLog.length - 1], shots = 0;
    for (let i = 0; i < 60 * 2600; i++) {
      G.step(DT); const s = G.state(), m = s.match; if (m.phase === 'matchEnd' || m.round > ROUND) break;
      const L = G.shotLog, k = L.lastIndexOf(mk); const b = s.bots.find((q) => q.name === NAME);
      for (const e of L.slice(k + 1)) if (b && e.by === b.id) shots++; if (L.length) mk = L[L.length - 1];
      if (m.round !== ROUND || m.phase !== 'live' || !b) continue;
      if (Math.round((150 - m.timeLeft) * 60) % 300 === 0) out.push(`${(150 - m.timeLeft).toFixed(0).padStart(3)}s ${b.dead ? 'DEAD' : ''} ${b.pos.map((v) => v.toFixed(1)).join(',')} ${b.brainState}/${b.state} ${b.weapon} mag${b.mag} node ${b.node} next ${b.nextNode} path ${(b.path || []).slice(0, 4).join('>')} shots ${shots} task ${JSON.stringify(b.task)}`);
    }
    out.push('idleLog ' + JSON.stringify(G.idleLog.slice(0, 3)) + ' stuckLog ' + G.stuckLog.length);
    return out;
  }, { DIFF, SEED, ROUND, NAME });
  for (const r of rows) console.log(r.slice(0, 260));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
