// Round 3 pass 2: liveness detector (same rule as the bug tester: a living bot moving under 0.5 units for 37 s in a live round),
// stepped in-page tick by tick; plus idleLog / stuckLog / trainRescueLog, rounds to time, median round length, rides, early east kills.
const { launch } = require('./harness.cjs');
const diffs = (process.argv[2] || 'recruit,regular,veteran').split(','), n = +(process.argv[3] || 4), base = +(process.argv[4] || 1), file = process.argv[5];
(async () => {
  const { browser, page, errors } = await launch(file ? { width: 640, height: 360, file } : { width: 640, height: 360 });
  for (const d of diffs) {
    const r = await page.evaluate(([d, n, base]) => {
      const g = __game, out = { matches: 0, frozen: 0, frozenEx: [], idle: 0, idleEx: [], stuck: 0, rescues: 0, rounds: 0, toTime: 0, lens: [], rides: 0, earlyEast: 0, wins: { green: 0, tan: 0 }, errors: 0, wall: 0 };
      for (let s = base; s < base + n; s++) {
        const w0 = performance.now();
        g.setTimeScale(0); g.startMatch({ difficulty: d, seed: s, autoplay: true });
        const anchor = {};                       // id -> {x, z, t}
        let guard = 0;
        while (g.state().match.phase !== 'matchEnd' && guard++ < 60 * 3000) {
          g.step(1 / 60);
          const m = g.state().match;
          const live = m.phase === 'live', t = g.state().time;
          for (const b of g.bots.concat([g.state().player ? null : null]).filter(Boolean)) {
            if (!live || b.dead) { delete anchor[b.id]; continue; }
            const A = anchor[b.id];
            if (!A || Math.hypot(b.x - A.x, b.y - A.y, b.z - A.z) >= 0.5) { anchor[b.id] = { x: b.x, y: b.y, z: b.z, t, flagged: false }; continue; }
            if (!A.flagged && t - A.t >= 37) { A.flagged = true; out.frozen++; if (out.frozenEx.length < 8) out.frozenEx.push({ seed: s, round: m.round, name: b.name, pos: [b.x, b.y, b.z].map((v) => +v.toFixed(1)), state: b.brain && b.brain.state, move: b.botState, weapon: b.arsenal.current }); }
          }
        }
        const rep = g.matchReport();
        out.matches++; out.wins[rep.winner]++; out.wall += (performance.now() - w0) / 1000;
        out.idle += rep.idleLog.length; for (const e of rep.idleLog) if (out.idleEx.length < 8) out.idleEx.push(Object.assign({ seed: s }, e));
        out.stuck += rep.stuckLog.length; out.rescues += rep.trainRescueLog.length; out.errors += rep.errors.length;
        out.rides += rep.stats.rides.green + rep.stats.rides.tan; out.rideTries = (out.rideTries || 0) + rep.stats.rideTries;
        for (const r of rep.rounds) { out.rounds++; if (r.reason === 'time' || r.reason === 'replay' || r.reason === 'health' || r.reason === 'damage' || r.reason === 'draw') out.toTime++; out.lens.push(r.duration); }
        for (const k of rep.kills) if (k.live <= 20 && k.kpos && k.dist > 50 && k.kpos[1] < 1 && k.vpos[1] < 1 && k.kpos[0] >= 79 && k.vpos[0] >= 79) out.earlyEast++;
      }
      out.lens.sort((a, b) => a - b); out.median = out.lens[Math.floor(out.lens.length / 2)]; delete out.lens;
      out.toTimeShare = +(out.toTime / out.rounds).toFixed(3); out.earlyEastPerRound = +(out.earlyEast / out.rounds).toFixed(3); out.ridesPerMatch = +(out.rides / out.matches).toFixed(2); out.wall = +out.wall.toFixed(1);
      return out;
    }, [d, n, base]);
    console.log(d, JSON.stringify(r));
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
