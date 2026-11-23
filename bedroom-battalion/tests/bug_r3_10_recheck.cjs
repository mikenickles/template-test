// Round 3 re-check: R3-1 to R3-5 repros, determinism (R3-3) four ways, the forced health/damage tie (16.11), death camera,
// grenade fleeing, reacting to hits mid-climb and mid-ride, and the new east-lane nodes under the chair.
// Usage: node bug_r3_10_recheck.cjs [sections, default ABCDEFG; add R to make F pick riding bots only]. Every loop is tick-limited.
const { boot } = require('./bug_r3_lib.cjs');
const SECT = process.argv[2] || 'ABCDEFG';

(async () => {
  const { browser, page, errors } = await boot({ width: 960, height: 540 });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => {
    const G = __game, DT = 1 / 60;
    window.H = {
      m: () => G.state().match, bots: (team) => G.state().bots.filter((b) => !team || b.team === team),
      until: (f, max) => { for (let i = 0; i < Math.round(max * 60); i++) { if (f()) return true; G.step(DT); } return f(); },
      sig: (r) => `${r.winner} ${r.score.green}-${r.score.tan} r${r.rounds.length} [${r.rounds.map((q) => q.duration).join(',')}]`,
      play: (diff, seed) => { G.startMatch({ difficulty: diff, seed, autoplay: true }); G.setTimeScale(0); const t0 = { time: G.state().time, s: G.state().train.s }; H.until(() => G.state().match.phase === 'matchEnd', 2600); const m = G.state().match; const rep = G.matchReport(); return { start: t0, sig: `${m.winner} ${m.score.green}-${m.score.tan} r${rep.rounds.length} [${rep.rounds.map((q) => q.duration).join(',')}]` }; },
    };
  });
  const out = {};
  // ---- A. R3-1 and R3-2 repros ----
  if (SECT.includes('A')) out.A = await ev(() => {
    const G = __game, r = {};
    G.startMatch({ difficulty: 'recruit', seed: 201, autoplay: true }); G.setTimeScale(0);
    let live0 = null; H.until(() => { const s = G.state(); if (s.match.phase === 'live' && live0 === null) live0 = s.time; return live0 !== null && s.time - live0 >= 40; }, 200);
    const look = () => G.state().bots.filter((b) => b.weapon === 'sniper').map((b) => `${b.name} ${b.brainState}/${b.state} ${b.crouching ? 'c' : ''} ${b.pos.map((v) => v.toFixed(1)).join(',')} hp${b.hp | 0}`);
    r.snipersAt40s = look();
    let mk = G.shotLog[G.shotLog.length - 1]; const shots = {}; for (let i = 0; i < 1200; i++) { G.step(1 / 60); const L = G.shotLog, k = L.lastIndexOf(mk); for (const e of L.slice(k + 1)) shots[e.by] = (shots[e.by] || 0) + 1; if (L.length) mk = L[L.length - 1]; }
    r.sniperShotsNext20s = Object.fromEntries(G.state().bots.filter((b) => b.weapon === 'sniper').map((b) => [b.name, shots[b.id] || 0]));
    r.snipersAt60s = look();
    const rm = G.runMatch({ difficulty: 'regular', seed: 1 }); r.regularSeed1 = { sig: H.sig(rm), reasons: rm.rounds.map((q) => q.reason + (q.reason !== 'eliminated' ? `(${q.alive.green}v${q.alive.tan})` : '')).join(' '), idle: G.idleLog ? G.idleLog.length : 'n/a' };
    return r;
  });
  // ---- B. determinism four ways ----
  if (SECT.includes('B')) out.B = await ev(() => {
    const G = __game, r = {};
    r.runMatch = [1, 2, 3].map(() => H.sig(G.runMatch({ difficulty: 'regular', seed: 7 })));
    r.startMatch = [1, 2, 3].map(() => H.play('regular', 7));
    // rematch keeps the seed? and gives the same match as a fresh start with that seed
    G.startMatch({ difficulty: 'veteran', seed: 9, autoplay: true }); G.setTimeScale(0); H.until(() => G.state().match.phase === 'matchEnd', 2600);
    const first = `${H.m().winner} ${H.m().score.green}-${H.m().score.tan}`; const seedBefore = H.m().seed;
    G.rematch(); G.setTimeScale(0); const after = { phase: H.m().phase, seed: H.m().seed, time: G.state().time, trainS: G.state().train.s };
    H.until(() => G.state().match.phase === 'matchEnd', 2600); const second = `${H.m().winner} ${H.m().score.green}-${H.m().score.tan}`;
    r.rematch = { first, second, seedBefore, after };
    // quit to title mid-match, then a new match with the same seed
    G.startMatch({ difficulty: 'regular', seed: 7, autoplay: true }); G.setTimeScale(0); G.step(70); G.quitToTitle(); const q = { phase: H.m().phase, time: G.state().time };
    r.afterQuit = { quit: q, then: H.play('regular', 7) };
    return r;
  });
  // ---- C. forced ties (16.11) and the death camera ----
  if (SECT.includes('C')) out.C = await ev(() => {
    const G = __game, r = { ties: [] };
    G.startMatch({ difficulty: 'regular', seed: 3, autoplay: false }); G.setTimeScale(0); G.setGodMode(true);
    const tie = (setup) => { H.until(() => H.m().phase === 'live', 15); const g = H.bots('green'), t = H.bots('tan'); G.killBot(g[0].id); G.killBot(t[0].id); G.step(0.05); const pre = { replays: H.m().replays, round: H.m().round, score: H.m().score }; const x = setup ? setup() : null; G.setRoundTime(0.3); H.until(() => H.m().phase !== 'live', 5); const res = { pre, setup: x, alive: H.m().alive, last: H.m().lastRound, replays: H.m().replays, score: H.m().score }; H.until(() => H.m().phase === 'freeze' || H.m().phase === 'matchEnd', 8); res.nextReplays = H.m().replays; return res; };
    for (let k = 0; k < 3; k++) r.ties.push(tie());
    // 4th tie: equal health, equal damage -> neither, replay counter resets
    r.ties.push(tie());
    for (let k = 0; k < 3; k++) r.ties.push(tie());
    // 4th tie again: health equal, Green dealt damage (player shoots a Tan for 30, player takes 30 untraced)
    r.ties.push(tie(() => { const tb = H.bots('tan').find((b) => !b.dead); G.teleport(tb.pos[0], tb.pos[1], tb.pos[2] + 6, 0, 0); G.selectWeapon('pistol'); G.step(0.4); G.lookAt(tb.pos[0], tb.pos[1] + 0.9, tb.pos[2]); const e = G.fire(); G.setGodMode(false); G.damagePlayer(30); G.setGodMode(true); return { shot: e && e.hit + ' ' + e.damage, tanHp: H.bots('tan').find((b) => b.id === tb.id).hp, playerHp: G.state().player.health }; }));
    // death camera
    H.until(() => H.m().phase === 'live', 15); G.setGodMode(false); G.give('health'); G.damagePlayer(500); const t0 = G.state().time; H.until(() => !!H.m().spectating || H.m().phase !== 'live', 4); r.deathCamSeconds = +(G.state().time - t0).toFixed(3);
    G.setGodMode(true);
    return r;
  });
  // ---- D. east-lane box and the nodes under the chair ----
  if (SECT.includes('D')) out.D = await ev(() => {
    const G = __game, N = G.waypoints.nodes, r = {};
    G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots();
    r.nodes = ['m.e.cn', 'm.e.u', 'm.e.cs', 'm.e.w'].map((k) => k + ':' + JSON.stringify(N[k] || null));
    r.box = G.colliders.filter((c) => c.x0 <= 81.5 && c.x1 >= 84.9 && c.z0 <= 78.6 && c.z1 >= 81.4).map((c) => `${c.id} ${c.x0}..${c.x1} ${c.z0}..${c.z1} y${c.y0}..${c.y1}`);
    r.edges = G.waypoints.edges.filter((e) => /m\.e\.c|m\.e\.u|m\.e\.w/.test(e.a + e.b)).map((e) => `${e.a}>${e.b}:${e.kind}${e.oneWay ? '(1way)' : ''}`);
    r.validate = G.validateWaypoints();
    r.player = [];
    for (const path of [['n.e.6', 'm.e.cn', 'm.e.u', 'm.e.cs', 's.e.6'], ['s.e.6', 'm.e.cs', 'm.e.u', 'm.e.cn', 'n.e.6']]) for (const sprint of [false, true]) {
      if (!path.every((k) => N[k])) { r.player.push({ path: path.join('>'), error: 'missing node' }); continue; }
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(...N[path[0]]); G.step(0.2);
      const w = G.walkPath(path, { sprint, timeout: 40 }); const p = G.state().player; const e = N[path[path.length - 1]];
      r.player.push({ path: path.join('>'), sprint, ok: w.ok, t: w.time, end: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), near: Math.hypot(p.x - e[0], p.z - e[2]) < 0.8, dmg: G.damageLog.length, inSolid: T.inside().length });
    }
    // bots both ways and A* choices through the lane
    r.bots = [];
    for (const [a, b] of [['n.e.6', 's.e.6'], ['s.e.6', 'n.e.6'], ['n.e.5', 's.e.5'], ['m.e.u', 'n.e.6'], ['m.e.u', 's.e.6']]) {
      if (!N[a] || !N[b]) continue;
      G.removeBots(); const id = G.spawnBot('green', a); G.step(0.1); const path = G.botGoto(id, b);
      let done = false, t = 0, maxStill = 0, lastP = null, still = 0, solid = 0;
      for (let i = 0; i < 60 * 40 && !done; i++) { G.step(1 / 60); const q = G.state().bots.find((o) => o.id === id); const [x, y, z] = q.pos; if (T.solidAt(x, y, z, 1.8, { lift: 0.3, eps: 0.05 }).length) solid++; if (lastP && Math.hypot(x - lastP[0], z - lastP[2]) < 0.005) still++; else still = 0; maxStill = Math.max(maxStill, still); lastP = q.pos.slice(); if (Math.hypot(x - N[b][0], z - N[b][2]) < 0.6 && Math.abs(y - N[b][1]) < 0.8) { done = true; t = i / 60; } }
      r.bots.push({ from: a, to: b, path: path && path.join('>'), arrived: done, t: +t.toFixed(2), longestStillTicks: maxStill, solidTicks: solid, stuckLog: G.stuckLog.length });
    }
    G.removeBots();
    return r;
  });
  // ---- E. grenade fleeing: throw at a bot's feet when it is near the track, on a ledge, or against a wall ----
  if (SECT.includes('E')) out.E = await ev(() => {
    const G = __game, DT = 1 / 60, r = { throws: 0, rows: [] };
    for (const seed of [21, 22, 23, 24]) {
      G.startMatch({ difficulty: 'regular', seed, autoplay: false }); G.setTimeScale(0); G.setGodMode(true);
      for (let i = 0; i < 60 * 900 && G.state().match.phase !== 'matchEnd' && r.rows.length < 60; i++) {
        G.step(DT); const s = G.state(); if (s.match.phase !== 'live' || i % 20) continue;
        const cand = s.bots.filter((b) => b.team === 'tan' && !b.dead && !b.climbing && !b.riding && (R3.inEnv(b.pos[0], b.pos[2], 3) || b.pos[1] > 2));
        if (!cand.length) continue;
        const b = cand[0], kind = R3.inEnv(b.pos[0], b.pos[2], 3) ? 'near track' : 'raised (' + b.pos[1].toFixed(0) + ')';
        // stand 6 units away on the same level with a clear line, throw at its feet
        let spot = null; for (let a = 0; a < 16 && !spot; a++) { const x = b.pos[0] + Math.sin(a / 16 * 6.283) * 5, z = b.pos[2] + Math.cos(a / 16 * 6.283) * 5; if (x < 1 || x > 119 || z < 1 || z > 159) continue; if (T.solidAt(x, b.pos[1], z, 1.8, { lift: 0 }).length || R3.inEnv(x, z)) continue; if (b.pos[1] > 2 && !T.solidAt(x, b.pos[1] - 0.2, z, 0.2, { lift: 0, eps: 0.38 }).length) continue; if (R2.clearLine([x, b.pos[1] + 1.6, z], [b.pos[0], b.pos[1] + 0.3, b.pos[2]])) spot = [x, b.pos[1], z]; }
        if (!spot) continue;
        G.give('grenade'); G.teleport(spot[0], spot[1], spot[2]); G.lookAt(b.pos[0], b.pos[1] - 1.5, b.pos[2]);
        G.setInput({ grenade: true }); G.step(DT); G.setInput({ grenade: false }); G.step(DT); r.throws++;
        const o = G.grenades[G.grenades.length - 1]; if (!o) continue;
        const p0 = b.pos.slice(), hp0 = b.hp; let env = 0, minY = p0[1], solid = 0, path = [], burst = null, maxD = 0, reversals = 0, prevD = null, dir = 0;
        for (let k = 0; k < 150; k++) {
          const live = G.grenades.includes(o); const gpos = live ? [o.x, o.y, o.z] : burst; G.step(DT);
          const q = G.state().bots.find((x) => x.id === b.id); if (!q || q.dead) break;
          if (live && !G.grenades.includes(o)) burst = gpos;
          const [x, y, z] = q.pos; if (R3.inEnv(x, z) && !q.riding) env++; minY = Math.min(minY, y); if (T.solidAt(x, y, z, 1.8, { lift: 0.3, eps: 0.05 }).length) solid++;
          const d = gpos ? Math.hypot(x - gpos[0], z - gpos[2]) : null; if (d !== null) { maxD = Math.max(maxD, d); if (prevD !== null) { const nd = Math.sign(d - prevD); if (nd && dir && nd !== dir) reversals++; if (nd) dir = nd; } prevD = d; }
          if (k % 15 === 0) path.push(q.state + '/' + q.brainState);
        }
        const q = G.state().bots.find((x) => x.id === b.id);
        r.rows.push({ seed, kind, bot: b.name, from: p0.map((v) => +v.toFixed(1)), burstAt: burst && burst.map((v) => +v.toFixed(1)), distAtBurst: burst && q ? +Math.hypot(q.pos[0] - burst[0], q.pos[2] - burst[2]).toFixed(2) : null, dead: !q || q.dead, hp: q ? q.hp | 0 : 0, dmgTaken: +((hp0 - (q ? q.hp : 0))).toFixed(1), fell: minY < p0[1] - 1.5, envTicks: env, solidTicks: solid, reversals, states: [...new Set(path)].join(' ') });
        G.teleport(60, 0, 10); G.step(1);
      }
    }
    return r;
  });
  // ---- F. hits while climbing or riding ----
  if (SECT.includes('F')) out.F = await ev((ONLYRIDE) => {
    const G = __game, DT = 1 / 60, rows = [];
    for (const seed of (ONLYRIDE ? [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52] : [31, 32, 33, 34, 35, 36])) {
      G.startMatch({ difficulty: 'regular', seed, autoplay: false }); G.setTimeScale(0); G.setGodMode(true); G.selectWeapon('pistol');
      for (let i = 0; i < 60 * 900 && G.state().match.phase !== 'matchEnd' && rows.length < 30; i++) {
        G.step(DT); const s = G.state(); if (s.match.phase !== 'live') continue;
        const b = s.bots.find((q) => q.team === 'tan' && !q.dead && (ONLYRIDE ? q.riding : (q.climbing || q.riding)) && q.hp > 40); if (!b) continue;
        const mode = b.climbing ? 'climbing' : 'riding ' + b.riding;
        // shoot it in the body from 8 units on its side with a clear line (teleport, pistol)
        let spot = null; for (let a = 0; a < 16 && !spot; a++) { const x = b.pos[0] + Math.sin(a / 16 * 6.283) * 8, z = b.pos[2] + Math.cos(a / 16 * 6.283) * 8; if (x < 1 || x > 119 || z < 1 || z > 159 || R3.inEnv(x, z)) continue; if (T.solidAt(x, 0, z, 1.8, { lift: 0 }).length) continue; if (R2.clearLine([x, 1.6, z], [b.pos[0], b.pos[1] + 0.9, b.pos[2]])) spot = [x, 0, z]; }
        if (!spot) continue;
        G.teleport(spot[0], 0, spot[2]); G.lookAt(b.pos[0], b.pos[1] + 0.9, b.pos[2]); G.give('ammo'); const e = G.fire();
        if (!e || e.hit !== b.id) { G.teleport(60, 0, 10); G.step(0.5); continue; }
        const y0 = b.pos[1], seq = []; let fell = false, minY = y0, env = 0, firedBack = false; let mk = G.shotLog[G.shotLog.length - 1];
        for (let k = 0; k < 180; k++) { G.teleport(spot[0], 0, spot[2]); G.step(DT); const q = G.state().bots.find((o) => o.id === b.id); if (!q || q.dead) break; minY = Math.min(minY, q.pos[1]); if (k % 20 === 0) seq.push(`${q.state}/${q.brainState}${q.climbing ? '/climb' : ''}${q.riding ? '/ride' : ''}`); if (R3.inEnv(q.pos[0], q.pos[2]) && !q.riding && q.state !== 'board' && q.state !== 'alight' && q.state !== 'cross') env++; const L = G.shotLog, j = L.lastIndexOf(mk); if (L.slice(j + 1).some((x) => x.by === b.id)) firedBack = true; if (L.length) mk = L[L.length - 1]; }
        const q = G.state().bots.find((o) => o.id === b.id);
        rows.push({ seed, mode, bot: b.name, y0: +y0.toFixed(1), shot: e.damage, firedBackIn3s: firedBack, fallDrop: +(y0 - minY).toFixed(1), hpAfter: q ? q.hp | 0 : 'dead', envTicksNotRiding: env, states: [...new Set(seq)].join(' ') });
        G.teleport(60, 0, 10); G.step(2);
      }
    }
    return rows;
  }, SECT.includes('R'));
  // ---- G. callouts over one match ----
  if (SECT.includes('G')) out.G = await ev(() => {
    const G = __game, DT = 1 / 60, r = { n: 0, tooSoonSameBot: [], sameRegionWithin8: 0, imHitTwicePerLife: 0, texts: {} };
    G.startMatch({ difficulty: 'regular', seed: 12, autoplay: true }); G.setTimeScale(0);
    let seen = G.callouts.length; const last = {}, region = {}, hitLife = {};
    for (let i = 0; i < 60 * 2600 && G.state().match.phase !== 'matchEnd'; i++) {
      G.step(DT); const C = G.callouts; if (C.length < seen) seen = 0;
      for (const c of C.slice(seen)) { r.n++; r.texts[c.text] = (r.texts[c.text] || 0) + 1; if (last[c.who] !== undefined && c.time - last[c.who] < 4 - 1e-6 && r.tooSoonSameBot.length < 6) r.tooSoonSameBot.push({ who: c.who, gap: +(c.time - last[c.who]).toFixed(2), text: c.text }); last[c.who] = c.time; if (/^Enemy (on|under|at|west|centre|east)/.test(c.text)) { if (region[c.text] !== undefined && c.time - region[c.text] < 8 - 1e-6) r.sameRegionWithin8++; region[c.text] = c.time; } }
      seen = C.length;
    }
    return r;
  });
  for (const k in out) console.log(k, JSON.stringify(out[k], null, 0).slice(0, 60000));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
