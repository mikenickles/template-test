// Early (first 20 s of a live round) floor-to-floor east-side kills over 50 units, per round, on any build (positions are read at
// the tick of each kill from the soldiers themselves). Usage: node builder_r3c_east.cjs <seeds per difficulty> <seed0> [build file]
const { launch } = require('./harness.cjs');
const n = +(process.argv[2] || 6), base = +(process.argv[3] || 700), file = process.argv[4];
(async () => {
  const { browser, page, errors } = await launch(file ? { width: 640, height: 360, file } : { width: 640, height: 360 });
  const r = await page.evaluate(([n, base]) => {
    const g = __game, out = {};
    for (const d of ['recruit', 'regular', 'veteran']) {
      let rounds = 0, early = 0, earlyAll = 0, kills = 0;
      for (let s = base; s < base + n; s++) {
        g.setTimeScale(0); g.startMatch({ difficulty: d, seed: s, autoplay: true });
        let seen = g.killFeed.length, phase = null, guard = 0;
        while (g.state().match.phase !== 'matchEnd' && guard++ < 60 * 2600) {
          g.step(1 / 60);
          const m = g.state().match;
          if (m.phase === 'live' && phase !== 'live') rounds++;
          phase = m.phase;
          while (seen < g.killFeed.length) {
            const k = g.killFeed[seen++]; kills++;
            const live = 150 - m.timeLeft;
            if (live > 20 || !k.killer) continue;
            const pos = (name) => { if (name === 'You') { const p = g.state().player; return [p.x, p.y, p.z]; } const b = g.bots.find((o) => o.name === name); return b ? [b.x, b.y, b.z] : null; };
            const a = pos(k.killer), v = pos(k.victim); if (!a || !v) continue;
            earlyAll++;
            if (Math.hypot(a[0] - v[0], a[1] - v[1], a[2] - v[2]) > 50 && a[1] < 1 && v[1] < 1 && a[0] >= 79 && v[0] >= 79) early++;
          }
        }
      }
      out[d] = { matches: n, rounds, kills, earlyKills20s: earlyAll, earlyEastLong: early, perRound: +(early / rounds).toFixed(3) };
    }
    return out;
  }, [n, base]);
  console.log(file ? 'build ' + file.split('/').pop() : 'build index.html', JSON.stringify(r)); console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
