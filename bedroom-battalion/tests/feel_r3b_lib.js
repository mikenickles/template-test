// Round 3 re-check helpers (copy of feel_r3_lib.js; callout check understands "our side / their side"; idleLog counted), injected into the page. Plays matches tick by tick through the hook and samples at 2 Hz.
window.R3B = (() => {
  const G = __game, T = 1 / 60, st = () => G.state();
  const C = G.CONFIG;
  const regionOf = (x, y, z) => { const L = C.regions; for (const r of L.list) { const B = r[1]; if (x >= B[0] && x <= B[1] && y >= B[2] && y <= B[3] && z >= B[4] && z <= B[5]) return r[2]; } return x < L.westX ? 'west lane' : x > L.eastX ? 'east lane' : 'centre'; };
  const lane = (x, y, z) => { const r = regionOf(x, y, z); if (/bed/.test(r) && !/under/.test(r)) return 'bed'; if (/desk|chair/.test(r)) return 'desk'; if (/shelf/.test(r)) return 'shelf'; if (/west|under/.test(r)) return 'west'; if (/east/.test(r)) return 'east'; return 'centre'; };
  // play one match; opts: difficulty, seed, sample (Hz), maxT
  function play(o) {
    G.startMatch({ difficulty: o.difficulty, seed: o.seed, autoplay: true });
    const rounds = []; let cur = null, tick = 0, lastPhase = null; const maxTicks = (o.maxT || 2400) * 60, every = Math.round(60 / (o.sample || 2));
    const kf0 = G.killFeed.length; let kfSeen = 0, coSeen = G.callouts.length, blSeen = G.botLog.length;
    const sight = { clear: 0, train: 0, stat: 0 }, beh = { samples: 0, crouch: 0, still: 0, stillOpen: 0, high: 0, states: {}, riding: 0 };
    const co = { n: 0, enemyRegion: 0, ok: 0, wrong: 0, byText: {}, wrongEx: [] };
    let shotsPrev = 0;
    while (tick < maxTicks) {
      const s = st(), m = s.match;
      if (m.phase === 'live' && lastPhase !== 'live') { cur = { round: m.round, t0: s.time, firstEngage: null, firstHit: null, firstKill: null, kills: [], lastShotT: s.time, maxGap: 0, shotsAt: [] }; }
      if (m.phase !== 'live' && lastPhase === 'live' && cur) { cur.end = m.lastRound; rounds.push(cur); cur = null; }
      if (m.phase === 'matchEnd') break;
      lastPhase = m.phase;
      G.step(T); tick++;
      if (!cur) continue;
      const now = G.state().time;
      // first engage from botLog
      for (; blSeen < G.botLog.length; blSeen++) { const e = G.botLog[blSeen]; if (e.to === 'engage' && cur.firstEngage === null && e.time >= cur.t0) cur.firstEngage = e.time - cur.t0; }
      // kills
      const KF = G.killFeed; if (KF.length > kfSeen + kf0 || KF.length < kf0 + kfSeen) {}
      while (G.killFeed.length > kfSeen && kfSeen < G.killFeed.length) { const k = G.killFeed[kfSeen++]; if (k.round !== cur.round) continue;
        const S = G.state(); const all = S.bots.concat([{ name: 'You', pos: [S.player.x, S.player.y, S.player.z], team: 'green' }]);
        const v = all.find((b) => b.name === k.victim), ki = all.find((b) => b.name === k.killer);
        const cars = S.train.cars || [];
        const nearTrain = (p) => p && cars.some((c) => Math.hypot(c.pos[0] - p[0], c.pos[2] - p[2]) < 9);
        cur.kills.push({ t: +(now - cur.t0).toFixed(2), killerTeam: k.killerTeam, weapon: k.weapon, head: k.head, vPos: v && v.pos.map((q) => +q.toFixed(1)), kPos: ki && ki.pos.map((q) => +q.toFixed(1)), vLane: v && lane(...v.pos), kLane: ki && lane(...ki.pos), killerRole: ki && ki.role, nearTrain: nearTrain(v && v.pos) || nearTrain(ki && ki.pos), dist: v && ki ? +Math.hypot(v.pos[0] - ki.pos[0], v.pos[1] - ki.pos[1], v.pos[2] - ki.pos[2]).toFixed(1) : null });
        if (cur.firstKill === null) cur.firstKill = now - cur.t0; }
      // callouts: compare region text with real Tan positions at that moment
      for (; coSeen < G.callouts.length; coSeen++) { const c = G.callouts[coSeen]; co.n++; co.byText[c.text.replace(/, (our|their) side$/, ', <side>')] = (co.byText[c.text.replace(/, (our|their) side$/, ', <side>')] || 0) + 1;
        const mm = /^Enemy (.*)$/.exec(c.text); if (!mm || c.text === 'Enemy down') continue; co.enemyRegion++;
        let want = mm[1], side = null; const sm = /^(.*), (our side|their side)$/.exec(want); if (sm) { want = sm[1]; side = sm[2]; }
        const S = G.state(); const tans = S.bots.filter((b) => b.team === 'tan' && !b.dead);
        const sideOk = (b) => !side || (side === 'our side' ? b.pos[2] < 80 : b.pos[2] > 80);
        const ok = want === 'on the train' ? tans.some((b) => b.riding) : tans.some((b) => regionOf(...b.pos) === want && sideOk(b));
        if (ok) co.ok++; else { co.wrong++; if (co.wrongEx.length < 6) co.wrongEx.push(want + ' | tans at ' + tans.map((b) => regionOf(...b.pos)).join('/')); } }
      // shots: longest gap
      const sh = G.matchReport().stats.shots; const tot = sh.green + sh.tan; if (tot !== shotsPrev) { cur.maxGap = Math.max(cur.maxGap, now - cur.lastShotT); cur.lastShotT = now; if (cur.firstShot === undefined) cur.firstShot = now - cur.t0; shotsPrev = tot; }
      if (tick % every) continue;
      // samples: sightlines between living enemies within 120 u (eye to body), behaviour of every bot
      const S = G.state(); const sol = S.bots.filter((b) => !b.dead).map((b) => ({ id: b.id, team: b.team, p: b.pos, crouch: b.crouching, state: b.state, riding: b.riding, v: 0, name: b.name }));
      if (!S.match.playerDead) sol.push({ id: 'player', team: 'green', p: [S.player.x, S.player.y, S.player.z], crouch: S.player.crouching });
      for (const a of sol) if (a.team === 'green') for (const b of sol) if (b.team === 'tan') {
        const ey = a.crouch ? 1.0 : 1.6, by = b.crouch ? 0.6 : 0.9; const d = [b.p[0] - a.p[0], b.p[1] + by - a.p[1] - ey, b.p[2] - a.p[2]]; const L = Math.hypot(...d); if (L > 120 || L < 1) continue;
        const r = G.raycast([a.p[0] + d[0] / L * 0.6, a.p[1] + ey + d[1] / L * 0.6, a.p[2] + d[2] / L * 0.6], d);
        if (!r || r.distance >= L - 1.2 || r.kind === 'soldier') sight.clear++; else if (r.kind === 'train') sight.train++; else sight.stat++; }
      for (const b of S.bots) { if (b.dead) continue; beh.samples++; if (b.crouching) beh.crouch++; beh.states[b.state] = (beh.states[b.state] || 0) + 1; if (b.riding) beh.riding++;
        const L = lane(...b.pos); if (L === 'bed' || L === 'desk' || L === 'shelf') beh.high++; }
    }
    const rep = G.matchReport(); rep.idle = (G.idleLog || []).length;
    return { rounds, rep, sight, beh, co };
  }
  return { play, regionOf, lane };
})();
