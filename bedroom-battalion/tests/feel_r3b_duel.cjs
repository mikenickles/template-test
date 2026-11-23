// Round 3 re-check (copy of feel_r3_duel.cjs, plus a grenade landing at the bot): one Tan bot against the player at a set distance, per difficulty. Everyone else is removed (killBot).
// The bot is held at its spot (position reset every tick; aim, perception, reaction and firing are its own); the player's
// health is refilled every tick so damage can be totalled. Measures: time until the bot first targets the player, time to
// first hit, damage per second over the window, and the bot's hit rate. Also reactions: shot in the back, gunfire behind, grenade.
// Usage: node feel_r3_duel.cjs [trials] [weapon] [JSON overrides for CONFIG.difficulty, e.g. {"recruit":{"reaction":0.9}}] [difficulties] [noreact]
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 16), WPN = process.argv[3] || 'rifle', OVR = JSON.parse(process.argv[4] || '{}'), DIFFS = (process.argv[5] || 'recruit,regular,veteran').split(','), NOREACT = process.argv[6] === 'noreact';
(async () => {
  const h = await boot();
  const out = await h.page.evaluate(([N, WPN, OVR, DIFFS, NOREACT]) => {
    for (const d in OVR) Object.assign(__game.CONFIG.difficulty[d], OVR[d]);
    const G = __game, T = 1 / 60, st = () => G.state();
    const res = {};
    // find a bot spot and player spots at each distance with a clear line (eye to head and body), open floor
    const clear = (a, b) => { for (const hy of [0.7, 1.6]) { const d = [b[0] - a[0], b[1] + hy - (a[1] + 1.6), b[2] - a[2]]; const L = Math.hypot(...d); const r = G.raycast([a[0], a[1] + 1.6, a[2]], d); if (r && r.distance < L - 0.6) return false; } return true; };
    const lines = {};
    const botSpots = [[60, 0, 128], [40, 0, 120], [80, 0, 125], [60, 0, 100], [38, 0, 100], [85, 0, 110], [40, 0, 135], [88, 0, 140], [30, 0, 140], [96, 0, 120], [40, 0, 40], [85, 0, 40], [60, 0, 34]];
    for (const d of [10, 30, 60, 100]) { outer: for (const bs of botSpots) for (let a = 0; a < 360; a += 2) { const x = bs[0] + d * Math.sin(a * Math.PI / 180), z = bs[2] - d * Math.cos(a * Math.PI / 180); if (x < 3 || x > 117 || z < 3 || z > 157) continue;
        if (G.inEnvelope(x, z) || G.inEnvelope(bs[0], bs[2])) continue;
        const px = Math.cos(a * Math.PI / 180), pz = Math.sin(a * Math.PI / 180); let ok = clear(bs, [x, 0, z]) && clear([x, 0, z], bs) && clear(bs, [x + px * 2, 0, z + pz * 2]) && clear(bs, [x - px * 2, 0, z - pz * 2]);
        if (!ok) continue; const r1 = G.raycast([x, 0.9, z], [px, 0, pz]), r2 = G.raycast([x, 0.9, z], [-px, 0, -pz]); if ((r1 && r1.distance < 3) || (r2 && r2.distance < 3)) continue;
        lines[d] = { bot: bs, p: [x, 0, z] }; break outer; } }
    res.lines = lines;
    let tan = null;
    const setup = (diff, seed) => {
      G.startMatch({ difficulty: diff, seed, autoplay: false }); G.step(5.2);
      const bs = st().bots; tan = null;
      for (const b of bs) { if (b.team === 'tan' && !tan) tan = b.id; else G.killBot(b.id); }
      return G.bots.find((b) => b.id === tan);
    };
    const pin = (B, at, yaw) => { B.x = at[0]; B.y = at[1]; B.z = at[2]; B.vx = 0; B.vz = 0; if (yaw !== undefined) B.yaw = yaw; };
    const hurt = () => G.damageLog.filter((e) => e.cause === 'shot' || e.cause === 'grenade');
    for (const diff of DIFFS) for (const d of [10, 30, 60, 100]) for (const stance of ['stand', 'strafe', 'crouch']) {
      const L = lines[d]; if (!L) continue; let seeT = [], hitT = [], dmg = 0, win = 0, hitsN = 0, shotsN = 0, kills = 0, states = {};
      for (let i = 0; i < N; i++) {
        const B = setup(diff, 1000 + i); B.arsenal.primary = WPN; for (const k in B.arsenal.guns) { B.arsenal.guns[k].mag = G.CONFIG.weapons[k].mag; B.arsenal.guns[k].reserve = 999; }
        const yaw = Math.atan2(-(L.p[0] - L.bot[0]), -(L.p[2] - L.bot[2]));
        G.teleport(L.p[0], 0, L.p[2]); G.lookAt(L.bot[0], 1.6, L.bot[2]); G.clearInput(); if (stance === 'crouch') G.setInput({ crouch: true });
        pin(B, L.bot, yaw); B.brain.target = null; B.brain.mem = null; B.brain.heard = null; G.step(T); pin(B, L.bot, yaw);
        G.give('health'); const d0 = G.damageLog.length, s0 = G.matchReport().stats.shots.tan, t0 = st().time; let seen = null, first = null, tick = 0; const W = 8;
        while (tick < W * 60) { if (stance === 'strafe') { const ph = Math.floor(tick / 30) % 2; G.setInput({ left: ph === 0, right: ph === 1 }); }
          G.setRoundTime(140); G.step(T); tick++; pin(B, L.bot); G.give('health');
          const s = B.botState; states[s] = (states[s] || 0) + 1;
          if (seen === null && B.brain.target && B.brain.target.id === undefined ? false : (seen === null && B.brain.target && B.brain.target.name === 'You')) seen = st().time - t0;
          if (first === null && G.damageLog.length > d0) first = G.damageLog[d0].time - t0;
          if (st().match.playerDead) { kills++; break; } }
        const dl = G.damageLog.slice(d0); dmg += dl.reduce((a, e) => a + e.amount, 0); hitsN += dl.length; shotsN += G.matchReport().stats.shots.tan - s0; win += tick / 60;
        if (seen !== null) seeT.push(seen); if (first !== null) hitT.push(first);
      }
      const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(2); };
      res[diff + ' ' + d + 'u ' + stance] = { seesAfter: med(seeT), firstHitAfter: med(hitT), hitIn8s: hitT.length + '/' + N, dps: +(dmg / win).toFixed(1), botHitPct: Math.round(100 * hitsN / Math.max(1, shotsN)), oneShotDeaths: kills, states: Object.keys(states).sort((a, b) => states[b] - states[a]).slice(0, 3).join(',') };
    }
    // reactions, bot at 15 u (Lr) with the player behind it and out of its view cone; only trials where it had not seen the player count
    let Lr = null; outer2: for (const bs of botSpots) for (let a = 0; a < 360; a += 4) { const x = bs[0] + 15 * Math.sin(a * Math.PI / 180), z = bs[2] - 15 * Math.cos(a * Math.PI / 180); if (x < 3 || x > 117 || z < 3 || z > 157 || G.inEnvelope(x, z) || G.inEnvelope(bs[0], bs[2])) continue; if (clear(bs, [x, 0, z]) && clear([x, 0, z], bs)) { Lr = { bot: bs, p: [x, 0, z] }; break outer2; } }
    res.reactLine = Lr;
    if (!NOREACT) for (const diff of DIFFS) for (const ev of ['shotInBack', 'gunfireBehind', 'grenadeBehind', 'grenadeAtBot']) { const tt = [], ret = [], gd = []; let moved = 0, valid = 0, hurtBy = 0;
      for (let i = 0; i < 10; i++) { const B = setup(diff, 2000 + i); B.arsenal.primary = 'rifle';
        const away = Math.atan2((Lr.p[0] - Lr.bot[0]), (Lr.p[2] - Lr.bot[2]));
        G.teleport(Lr.p[0], 0, Lr.p[2]); G.lookAt(Lr.bot[0], 0.9, Lr.bot[2]); G.selectWeapon('rifle'); G.give('ammo'); G.give('grenade'); G.clearInput(); B.brain.target = null; B.brain.mem = null; B.brain.heard = null;
        for (let k = 0; k < 60; k++) { pin(B, Lr.bot, away); G.step(T); G.give('health'); }
        if (B.brain.target) continue; valid++;
        pin(B, Lr.bot, away); G.step(T); const t0 = st().time, start = [B.x, B.z], d0 = G.damageLog.length, hp0 = B.hp;
        if (ev === 'shotInBack') { G.lookAt(B.x, B.y + 0.9, B.z); G.fire(); }
        else if (ev === 'gunfireBehind') { G.lookAt(B.x + 5, B.y + 5, B.z); G.fire(); }
        else if (ev === 'grenadeBehind') { G.lookAt(B.x, 0, B.z); const p = G.state().player; G.look(p.yaw, 0); G.throwGrenade(0.05); }
        else { G.teleport(B.x + 9 * Math.sin(away), 0, B.z + 9 * Math.cos(away)); G.lookAt(B.x, 0, B.z); const p = G.state().player; G.look(p.yaw, -6 * Math.PI / 180); G.throwGrenade(0.05); }
        let t = null, r = null, gmin = 99, gAtBurst = null; for (let k = 0; k < 300; k++) { const gl = G.grenades[0]; if (gl) { const dd = Math.hypot(gl.x - B.x, gl.z - B.z); gmin = Math.min(gmin, dd); if (gl.fuse <= 1 / 60 + 1e-6) gAtBurst = dd; } G.step(T); G.give('health'); if (t === null && B.brain.target && B.brain.target.name === 'You') t = st().time - t0; if (r === null && G.damageLog.length > d0) r = st().time - t0; if (B.dead) break; }
        if (B.hp < hp0) hurtBy++; if (gAtBurst !== null) gd.push(gAtBurst);
        if (Math.hypot(B.x - start[0], B.z - start[1]) > 2) moved++;
        if (t !== null) tt.push(t); if (r !== null) ret.push(r); }
      const md = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length / 2)].toFixed(2) : null; };
      res['react ' + diff + ' ' + ev] = { validTrials: valid, turnedOnPlayer: tt.length, medianTurn: md(tt), returnedHit: ret.length, medianFirstHitBack: md(ret), botDamaged: hurtBy, movedOver2u: moved, grenadeDistAtBurst: gd.length ? gd.map((x) => +x.toFixed(1)).join(',') : null }; }
    return res;
  }, [N, WPN, OVR, DIFFS, NOREACT]);
  console.log(JSON.stringify(out.lines), JSON.stringify(out.reactLine));
  delete out.lines; delete out.reactLine;
  for (const k in out) console.log(k.padEnd(34), JSON.stringify(out[k]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
