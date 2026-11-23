// Round 3: the player stands (or crouches) at a typical spot from the start of the live round and never shoots; health is refilled
// every tick so nothing ends early. Measures time from live start to first hit, damage taken in the first 60 s, how many different
// Tan bots hit the player, and from how far. Usage: node feel_r3_exposure.cjs [seedsPerCell]
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 4);
const spots = { 'fort gate': [60, 0, 28], 'west lane': [40, 0, 60], 'ruin top': [60, 1.2, 78], 'east lane': [83, 0, 60], 'bed top N': [27, 18, 60], 'desk N': [100, 26, 66], 'small shelf L2': [109, 40, 22] };
(async () => {
  const h = await boot();
  const out = await h.page.evaluate(([N, spots]) => {
    const G = __game, T = 1 / 60, res = {};
    for (const diff of ['recruit', 'regular', 'veteran']) for (const sp in spots) for (const stance of ['stand', 'crouch']) {
      const first = [], dmg = [], shooters = [], dist = [];
      for (let i = 0; i < N; i++) {
        G.startMatch({ difficulty: diff, seed: 300 + i, autoplay: false }); G.setGodMode(false);
        const P = spots[sp]; G.step(1);
        let k = 0; while (G.state().match.phase === 'freeze' && k++ < 600) { G.teleport(P[0], P[1], P[2]); G.lookAt(60, 1.5, 120); G.step(T); }
        G.clearInput(); if (stance === 'crouch') G.setInput({ crouch: true });
        const d0 = G.damageLog.length, t0 = G.state().time; let f = null; const who = new Set();
        for (let t = 0; t < 60 * 60; t++) { if (t % 30 === 0) { G.teleport(P[0], P[1], P[2]); G.lookAt(60, 1.5, 120); } G.step(T); G.give('health'); G.setRoundTime(140);
          if (G.state().match.phase !== 'live') break; }
        const dl = G.damageLog.slice(d0).filter((e) => e.cause === 'shot' || e.cause === 'grenade');
        if (dl.length) f = dl[0].time - t0;
        const bots = G.state().bots; dl.forEach((e) => { who.add(e.attacker); });
        first.push(f); dmg.push(dl.reduce((a, e) => a + e.amount, 0)); shooters.push(who.size);
      }
      const s = first.filter((x) => x !== null).sort((a, b) => a - b);
      res[diff + ' | ' + sp + ' | ' + stance] = { firstHitMedian: s.length ? +s[Math.floor(s.length / 2)].toFixed(1) : null, hitIn60s: s.length + '/' + N, dmgPer60s: Math.round(dmg.reduce((a, b) => a + b, 0) / N), shooters: +(shooters.reduce((a, b) => a + b, 0) / N).toFixed(1) };
    }
    return res;
  }, [N, spots]);
  for (const k in out) console.log(k.padEnd(40), JSON.stringify(out[k]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
