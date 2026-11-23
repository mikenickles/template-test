// Round 3: brain state changes per match from botLog (runMatch, autoplay), per difficulty: how often bots go to cover, flank,
// retreat, hunt; also how long a bot stays in one state, and how often a cover visit ends in a peek-kill.
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 6);
(async () => {
  const h = await boot();
  const out = await h.page.evaluate((N) => {
    const G = __game, res = {};
    for (const diff of ['recruit', 'regular', 'veteran']) { const to = {}, dur = {}; let rounds = 0, overflow = 0;
      for (let i = 0; i < N; i++) { G.botLog.length = 0; const r = G.runMatch({ difficulty: diff, seed: 500 + i }); rounds += r.rounds.length; if (G.botLog.length >= G.CONFIG.match.botLogMax) overflow++;
        const last = {}; for (const e of G.botLog) { to[e.to] = (to[e.to] || 0) + 1; if (last[e.bot]) { const d = e.time - last[e.bot].time; (dur[last[e.bot].to] = dur[last[e.bot].to] || []).push(d); } last[e.bot] = e; } }
      const md = (a) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };
      res[diff] = { rounds, perRound: Object.fromEntries(Object.entries(to).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / rounds).toFixed(2)])), medianSecondsInState: Object.fromEntries(Object.entries(dur).map(([k, v]) => [k, md(v)])), logOverflowMatches: overflow }; }
    return res;
  }, N);
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
