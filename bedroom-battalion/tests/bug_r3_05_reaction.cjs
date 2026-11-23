// Round 3 check 1/4: do bots react to a visible enemy? The player (god mode) is placed in plain view in front of each
// holding or advancing Tan bot, 8 to 30 units away, inside its 110 degree cone, with my own clear line of sight; then the
// time to that bot's first shot at anything is measured (5 s limit). Expected: about the difficulty's reaction time.
// Usage: node bug_r3_05_reaction.cjs <difficulty> [seeds]. Every loop is tick-limited.
const { boot } = require('./bug_r3_lib.cjs');
const DIFF = process.argv[2] || 'regular', SEEDS = +(process.argv[3] || 6);
(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ DIFF, SEEDS }) => {
    const G = __game, DT = 1 / 60, rows = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      G.startMatch({ difficulty: DIFF, seed: 300 + seed, autoplay: false }); G.setTimeScale(0); G.setGodMode(true);
      G.teleport(60, 0, 8, Math.PI, 0);
      for (let i = 0; i < 60 * 30 && !(G.state().match.phase === 'live' && G.state().match.timeLeft < 132); i++) { G.teleport(60, 0, 8, Math.PI, 0); G.step(DT); }
      for (let pass = 0; pass < 3; pass++) {
        const tans = G.state().bots.filter((b) => b.team === 'tan' && !b.dead && ['hold', 'advance', 'hunt'].includes(b.brainState) && !b.climbing && !b.riding);
        for (const b0 of tans) {
          const b = G.state().bots.find((q) => q.id === b0.id); if (!b || b.dead) continue;
          const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), eye = [b.pos[0], b.pos[1] + 1.6, b.pos[2]];
          let spot = null;
          for (const d of [12, 9, 16, 20, 26]) for (const a of [0, 0.3, -0.3, 0.6, -0.6]) {
            const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
            const x = b.pos[0] + dx * d, z = b.pos[2] + dz * d, y = b.pos[1];
            if (x < 1 || x > 119 || z < 1 || z > 159) continue;
            if (T.solidAt(x, y, z, 1.8, { lift: 0 }).length || R3.inEnv(x, z)) continue;
            // floor under the spot: same height as the bot (ground or the same surface)
            if (!T.solidAt(x, y - 0.3, z, 0.3, { lift: 0, eps: 0.38 }).length && y > 0.01) continue;
            if (R2.clearLine(eye, [x, y + 1.55, z]) && R2.clearLine(eye, [x, y + 0.9, z])) { spot = [x, y, z, d]; break; }
          }
          if (!spot) continue;
          const n0 = G.shotLog[G.shotLog.length - 1];
          G.teleport(spot[0], spot[1], spot[2], 0, 0); G.lookAt(b.pos[0], b.pos[1] + 1.6, b.pos[2]);
          let t = null, states = new Set(), firstBy = null; const trace = [];
          for (let i = 0; i < 300; i++) {
            G.teleport(spot[0], spot[1], spot[2]); G.step(DT);
            const q = G.state().bots.find((o) => o.id === b.id); if (!q || q.dead) break; states.add(q.brainState);
            if (i % 30 === 0) { const dx = spot[0] - q.pos[0], dz = spot[2] - q.pos[2], ang = Math.acos(Math.max(-1, Math.min(1, (dx * -Math.sin(q.yaw) + dz * -Math.cos(q.yaw)) / Math.hypot(dx, dz)))) * 180 / Math.PI; trace.push([+(i / 60).toFixed(1), q.brainState, q.state, +ang.toFixed(0), R2.clearLine([q.pos[0], q.pos[1] + (q.crouching ? 1 : 1.6), q.pos[2]], [spot[0], spot[1] + 1.55, spot[2]]), q.pos.map((v) => +v.toFixed(1)).join(','), q.crouching ? 'c' : '']); }
            const log = G.shotLog, k = log.lastIndexOf(n0);
            const fresh = log.slice(k + 1);
            if (!firstBy && fresh.length) firstBy = fresh[0].by;
            if (fresh.some((e) => e.by === b.id)) { t = (i + 1) / 60; break; }
            if (G.state().match.phase !== 'live') break;
          }
          rows.push({ seed: 300 + seed, bot: b.name, state0: b.brainState, weapon: b.weapon, dist: spot[3], firstShotAfter: t, states: [...states].join(','), someoneElseFiredFirst: firstBy && firstBy !== b.id ? firstBy : null, spot: spot.map((v) => +v.toFixed(1)), trace: t === null || t > 2 ? trace : undefined });
          G.teleport(60, 0, 8, Math.PI, 0); G.step(0.5);
          if (G.state().match.phase !== 'live') break;
        }
        if (G.state().match.phase !== 'live') break;
        G.step(3);
      }
    }
    return rows;
  }, { DIFF, SEEDS });

  const got = out.filter((r) => r.firstShotAfter !== null).map((r) => r.firstShotAfter).sort((a, b) => a - b);
  const never = out.filter((r) => r.firstShotAfter === null);
  console.log(`${DIFF}: ${out.length} placements | fired within 5 s ${got.length} | median ${got[Math.floor(got.length / 2)]} s | min ${got[0]} | max ${got[got.length - 1]} | never fired ${never.length}`);
  for (const r of never) console.log('   NEVER', JSON.stringify(r));
  for (const r of out.filter((q) => q.firstShotAfter > 2)) console.log('   SLOW', JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
