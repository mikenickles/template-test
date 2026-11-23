// Round 3: bots that sit in 'engage' without firing. Autoplay matches stepped tick by tick; whenever a living bot has been
// in engage for 20 s straight, has not moved 1 unit and has fired no shot, record it once with its weapon, crouch state,
// and what G.raycast hits from its eye (1.0 and 1.6) to every living enemy's head. Usage: node bug_r3_08_engage_freeze.cjs <diff> <seed0> <n>
const { boot } = require('./bug_r3_lib.cjs');
const DIFF = process.argv[2] || 'recruit', S0 = +(process.argv[3] || 201), NM = +(process.argv[4] || 3);
(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ DIFF, S0, NM }) => {
    const G = __game, DT = 1 / 60, rows = []; let total = 0, engageBotSeconds = 0;
    for (let k = 0; k < NM; k++) {
      G.startMatch({ difficulty: DIFF, seed: S0 + k, autoplay: true }); G.setTimeScale(0);
      const since = {}, pos0 = {}, flagged = {}; let mark = G.shotLog[G.shotLog.length - 1];
      for (let i = 0; i < 60 * 2600 && G.state().match.phase !== 'matchEnd'; i++) {
        G.step(DT); const s = G.state(); const L = G.shotLog, j = L.lastIndexOf(mark); const fired = new Set(L.slice(j + 1).map((e) => e.by)); if (L.length) mark = L[L.length - 1];
        if (s.match.phase !== 'live') { for (const k2 in since) delete since[k2]; continue; }
        for (const b of s.bots) {
          if (b.dead || b.brainState !== 'engage') { delete since[b.id]; continue; }
          engageBotSeconds += DT;
          if (!since[b.id] || fired.has(b.id) || Math.hypot(b.pos[0] - pos0[b.id][0], b.pos[2] - pos0[b.id][2]) > 1) { since[b.id] = s.time; pos0[b.id] = b.pos.slice(); continue; }
          const key = s.match.round + b.id;
          if (s.time - since[b.id] > 20 && !flagged[key]) {
            flagged[key] = true; total++;
            const enemies = s.bots.filter((e) => e.team !== b.team && !e.dead).map((e) => ({ x: e.pos })); if (b.team === 'tan' && !s.player.dead) enemies.push({ x: [s.player.x, s.player.y, s.player.z], you: true });
            const rays = enemies.map((e) => { const o = [b.pos[0], b.pos[1] + 1.6, b.pos[2]], t = [e.x[0], e.x[1] + 1.55, e.x[2]], d = [t[0] - o[0], t[1] - o[1], t[2] - o[2]]; let h = null; try { h = G.raycast(o, d); } catch (err) { h = { id: 'THROW' }; } return { dist: +Math.hypot(...d).toFixed(1), hit: h && h.kind === 'soldier' ? 'SOLDIER' : h && h.id }; });
            if (rows.length < 40) rows.push({ seed: S0 + k, round: s.match.round, t: +(150 - s.match.timeLeft).toFixed(1), bot: b.name, weapon: b.weapon, mag: b.mag, crouch: b.crouching, pos: b.pos.map((v) => +v.toFixed(2)), edge: b.edge, clearShots: rays.filter((r) => r.hit === 'SOLDIER').map((r) => r.dist) });
          }
        }
      }
    }
    return { total, engageBotSeconds: +engageBotSeconds.toFixed(0), rows };
  }, { DIFF, S0, NM });
  console.log(`${DIFF}: ${NM} matches | bots frozen in engage (20 s, no shot, no move) ${out.total} | bot-seconds in engage ${out.engageBotSeconds}`);
  const byW = {}; for (const r of out.rows) byW[r.weapon] = (byW[r.weapon] || 0) + 1; console.log('   by weapon (first 40):', JSON.stringify(byW), '| with a clear shot at some enemy:', out.rows.filter((r) => r.clearShots.length).length);
  for (const r of out.rows.slice(0, 14)) console.log('   ', JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
