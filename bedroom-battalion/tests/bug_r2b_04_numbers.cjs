// Round 2 re-check: the changed numbers (DESIGN 12 and 15.6). Damage and falloff at range on real shots, spread by
// stance per weapon (reported and a measured cone), bloom, recoil return, scope fov, scoped spread still / crouched /
// moving / airborne. Tick-limited loops only.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {}, CW = G.CONFIG.weapons;
    const W = () => G.state().weapon;
    const settle = (name) => { G.shotLog.length = 0; G.clearInput(); G.give('ammo'); G.give('health'); G.resetTargets(); G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(0.6); G.selectWeapon(name); G.step(1.2); };
    // expected by DESIGN 12 / 15.1 / 15.6
    const D = {
      rifle: { dmg: 26, fall: [60, 120, 0.7], base: 0.5, bloom: 0.35, max: 3.0, move: 1.5, kick: 0.9 },
      smg: { dmg: 25, fall: [25, 70, 0.45], base: 1.0, bloom: 0.2, max: 3.5, move: 1.15, kick: 0.55 },
      sniper: { dmg: 90, fall: null, base: 3.0, bloom: 0, max: 3.0, move: 1.5, kick: 3.5 },
      pistol: { dmg: 30, fall: [30, 70, 0.5], base: 0.6, bloom: 0.6, max: 3.0, move: 1.5, kick: 1.4 },
    };
    const fac = (f, d) => !f || d <= f[0] ? 1 : d >= f[1] ? f[2] : 1 + (f[2] - 1) * (d - f[0]) / (f[1] - f[0]);
    out.config = Object.fromEntries(Object.entries(CW).map(([k, c]) => [k, { damage: c.damage, falloff: c.falloff, spread: c.spread, bloom: c.bloom, spreadMax: c.spreadMax, moveMult: c.moveMult, recoverDelay: c.recoverDelay, scopeFov: c.scopeFov, scopedSpread: c.scopedSpread, scopedMove: c.scopedMove, scopedAir: c.scopedAir }]));
    out.config.recoilReturn = G.CONFIG.gun.recoilReturn; out.config.grenadeDamage = G.CONFIG.grenade.damage;

    // ---- damage and falloff on real shots: clear lines from nodes to dummies found with the game's raycast ----
    const nodes = Object.entries(G.waypoints.nodes), targets = G.state().targets, lines = [];
    for (const [id, n] of nodes) for (const t of targets) {
      const o = [n[0], n[1] + 1.0, n[2]], d = [t.pos[0] - o[0], t.pos[1] + 0.7 - o[1], t.pos[2] - o[2]];
      const r = G.raycast(o, d); if (r && r.id === t.id && r.zone === 'body') lines.push({ node: id, n, t, dist: r.distance });
    }
    const want = [5, 15, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 135], picks = [];
    for (const w of want) { const best = lines.reduce((a, b) => (Math.abs(b.dist - w) < Math.abs(a.dist - w) ? b : a), lines[0]); if (best && Math.abs(best.dist - w) < 4 && !picks.includes(best)) picks.push(best); }
    out.falloff = {};
    for (const name of ['rifle', 'smg', 'pistol', 'sniper']) {
      const rows = [];
      for (const L of picks) {
        settle(name); G.teleport(L.n[0], L.n[1], L.n[2]); G.setInput({ crouch: true, scope: true }); G.step(0.6);
        let hits = 0, bad = 0; const seen = {};
        for (let i = 0; i < 60 && hits < 6; i++) {
          G.resetTargets(); G.give('ammo'); G.lookAt(L.t.pos[0], L.t.pos[1] + 0.7, L.t.pos[2]); G.step(DT); G.lookAt(L.t.pos[0], L.t.pos[1] + 0.7, L.t.pos[2]);
          const e = G.fire(); G.step(1.4);
          if (!e || e.kind !== 'target') continue;
          hits++;
          const exp = D[name].dmg * fac(D[name].fall, e.distance) * (e.zone === 'head' ? 2 : 1);
          if (Math.abs(exp - e.damage) > 0.011) bad++;
          seen[`${e.zone} ${e.damage} (expect ${exp.toFixed(2)}) @${e.distance.toFixed(1)}`] = 1;
        }
        G.clearInput();
        rows.push(`${L.dist.toFixed(1)}u: ${hits ? Object.keys(seen).join(' | ') : 'no hits'}${bad ? '  <-- MISMATCH x' + bad : ''}`);
      }
      out.falloff[name] = rows;
    }

    // ---- reported spread by stance (no shots fired, settled) ----
    out.stance = {};
    const stanceSpread = (name, mode) => {
      settle(name);
      if (mode === 'still') { G.teleport(60, 0, 100, 0, 0); G.step(0.5); }
      if (mode === 'crouch') { G.teleport(60, 0, 100, 0, 0); G.setInput({ crouch: true }); G.step(0.8); }
      if (mode === 'walk') { G.teleport(60, 0, 95, 0, 0); G.setInput({ forward: true }); G.step(0.6); }
      if (mode === 'strafe') { G.teleport(60, 0, 95, 0, 0); G.setInput({ left: true }); G.step(0.6); }
      if (mode === 'crouchwalk') { G.teleport(30, 0, 100, -Math.PI / 2, 0); G.setInput({ forward: true, crouch: true }); G.step(0.8); }
      if (mode === 'sprint') { G.teleport(60, 0, 95, 0, 0); G.setInput({ forward: true, sprint: true }); G.step(0.6); }
      if (mode === 'air') { G.teleport(60, 0, 100, 0, 0); G.step(0.3); G.setInput({ jump: true }); G.step(0.25); }
      const s = W().spread, p = G.state().player; G.clearInput(); G.step(1);
      return { spread: +s.toFixed(4), speed: +Math.hypot(p.vx, p.vz).toFixed(2), onGround: p.onGround };
    };
    const mult = { still: 1, crouch: 0.6, walk: null, strafe: null, crouchwalk: null, sprint: 2.5, air: 3.0 };
    for (const name of ['rifle', 'smg', 'pistol', 'sniper']) {
      out.stance[name] = {};
      for (const mode of Object.keys(mult)) {
        const r = stanceSpread(name, mode);
        const m = mode === 'walk' || mode === 'strafe' ? D[name].move : mode === 'crouchwalk' ? null : mult[mode];
        r.expect = m === null ? '(crouch x move, not specified)' : +(D[name].base * m).toFixed(4);
        r.ok = m === null ? '' : Math.abs(r.spread - D[name].base * m) < 0.002 ? 'ok' : 'MISMATCH';
        out.stance[name][mode] = r;
      }
    }
    // ---- scoped sniper spread by stance ----
    out.scoped = {};
    for (const mode of ['still', 'crouch', 'walk', 'strafe', 'crouchwalk', 'air', 'slowCreep']) {
      settle('sniper'); G.setInput({ scope: true });
      if (mode === 'still') { G.teleport(60, 0, 100, 0, 0); G.setInput({ scope: true }); G.step(0.5); }
      if (mode === 'crouch') { G.teleport(60, 0, 100, 0, 0); G.setInput({ scope: true, crouch: true }); G.step(0.8); }
      if (mode === 'walk') { G.teleport(60, 0, 95, 0, 0); G.setInput({ scope: true, forward: true }); G.step(0.6); }
      if (mode === 'strafe') { G.teleport(60, 0, 95, 0, 0); G.setInput({ scope: true, left: true }); G.step(0.6); }
      if (mode === 'crouchwalk') { G.teleport(30, 0, 100, -Math.PI / 2, 0); G.setInput({ scope: true, forward: true, crouch: true }); G.step(0.8); }
      if (mode === 'air') { G.teleport(60, 0, 100, 0, 0); G.setInput({ scope: true }); G.step(0.4); G.setInput({ scope: true, jump: true }); G.step(0.25); }
      if (mode === 'slowCreep') { G.teleport(30, 0, 100, -Math.PI / 2, 0); G.setInput({ scope: true, forward: true }); G.step(0.4); G.setInput({ scope: true }); G.step(0.04); }
      const w = W(), p = G.state().player; G.render();
      out.scoped[mode] = { scoped: w.scoped, spread: +w.spread.toFixed(4), speed: +Math.hypot(p.vx, p.vz).toFixed(2), onGround: p.onGround, fov: G.state().weapon.fov };
      G.clearInput(); G.step(1);
    }
    out.scoped.expect = { still: 0.05, crouch: 0.05, walk: 1.5, strafe: 1.5, air: 4.0 };

    // ---- measured cone from L3 of the tall shelf at the west wall (clear line at y 61.6) ----
    out.cone = {};
    const cone = (name, mode, n = 150) => {
      settle(name); let maxA = 0, sum = 0, cnt = 0, maxRep = 0; const other = {};
      for (let i = 0; i < n; i++) {
        G.give('ammo'); G.clearInput(); G.teleport(110.5, 60, 150, Math.PI / 2, 0);
        const sc = mode.startsWith('scoped');
        if (mode.includes('crouch')) G.setInput({ crouch: true, scope: sc }); else G.setInput({ scope: sc });
        G.step(1.45); G.look(Math.PI / 2, 0);
        if (mode.includes('strafe')) { G.setInput({ scope: sc, left: i % 2 === 0, right: i % 2 === 1 }); G.step(0.3); G.look(Math.PI / 2, 0); }
        if (mode.includes('air')) { G.setInput({ scope: sc, jump: true }); G.step(0.2); G.look(Math.PI / 2, 0); }
        const p = G.state().player, sp = W().spread, e = G.fire();
        if (!e) continue;
        maxRep = Math.max(maxRep, sp);
        if (e.hit !== 'room.wall.w') { other[e.hit] = (other[e.hit] || 0) + 1; continue; }
        const a = Math.acos(Math.min(1, p.x / e.distance)) * 180 / Math.PI; maxA = Math.max(maxA, a); sum += a; cnt++;
      }
      G.clearInput();
      return { reportedSpread: +maxRep.toFixed(3), shots: cnt, maxDeg: +maxA.toFixed(3), meanDeg: +(sum / Math.max(1, cnt)).toFixed(3), withinReported: maxA <= maxRep + 1e-3, other };
    };
    for (const [n, m] of [['rifle', 'still'], ['smg', 'still'], ['smg', 'strafe'], ['rifle', 'strafe'], ['pistol', 'still'], ['pistol', 'strafe'], ['sniper', 'still'], ['sniper', 'scoped'], ['sniper', 'scoped crouch'], ['sniper', 'scoped strafe'], ['sniper', 'scoped air'], ['sniper', 'air']]) out.cone[n + ' ' + m] = cone(n, m);

    // ---- bloom: spread after each shot of a held burst, and recovery ----
    out.bloom = {};
    for (const name of ['rifle', 'smg', 'pistol']) {
      settle(name); G.teleport(60, 0, 100, 0, 0.3); G.step(0.3); const seq = [];
      if (CW[name].auto) { G.setInput({ fire: true }); let last = G.shotLog.length; for (let i = 0; i < 120 && seq.length < 16; i++) { G.step(DT); if (G.shotLog.length !== last) { last = G.shotLog.length; seq.push(+W().spread.toFixed(3)); } } G.clearInput(); }
      else { for (let k = 0; k < 8; k++) { G.fire(); seq.push(+W().spread.toFixed(3)); G.step(0.19); } }
      // recovery after the last shot: spread at +0.10, +0.13, +0.2, +0.4 s
      const rec = []; let t = 0; for (const at of [0.1, 0.13, 0.2, 0.4, 1.0]) { G.step(at - t); t = at; rec.push([at, +W().spread.toFixed(3)]); }
      out.bloom[name] = { afterEachShot: seq, expectStep: D[name].bloom, cap: D[name].max, recovery: rec, recoverDelayCfg: CW[name].recoverDelay };
    }
    // pistol: fast clicking at the minimum interval
    settle('pistol'); G.teleport(60, 0, 100, 0, 0.3); G.step(0.3); { const seq = []; let last = G.shotLog.length; for (let i = 0; i < 240 && seq.length < 10; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); if (G.shotLog.length !== last) { last = G.shotLog.length; seq.push(+W().spread.toFixed(3)); } } G.clearInput(); out.bloom.pistolFastClick = seq; }

    // ---- recoil return: one shot, pitch per tick ----
    out.recoil = {};
    for (const name of ['rifle', 'smg', 'pistol', 'sniper']) {
      settle(name); G.teleport(60, 0, 100, 0, 0); G.step(0.2); G.look(0, 0); const p0 = G.state().player.pitch;
      G.fire(); const tr = []; let peak = 0;
      for (let i = 0; i < 40; i++) { G.step(DT); const d = (G.state().player.pitch - p0) * 180 / Math.PI; peak = Math.max(peak, d); if (i === 0 || i === 14 || i === 15 || i === 30 || i === 39) tr.push([i + 1, +d.toFixed(4)]); }
      const end = (G.state().player.pitch - p0) * 180 / Math.PI;
      out.recoil[name] = { kickCfg: CW[name].kickUp, peakDeg: +peak.toFixed(4), residualDeg: +end.toFixed(4), returnedFraction: +(1 - end / peak).toFixed(3), samples: tr };
    }
    // rifle: 10 paced taps at 0.4 s, total drift
    settle('rifle'); G.teleport(60, 0, 100, 0, 0); G.step(0.2); G.look(0, 0); { const p0 = G.state().player.pitch; for (let k = 0; k < 10; k++) { G.fire(); G.step(0.4); } out.recoil.rifle10PacedTapsDriftDeg = +((G.state().player.pitch - p0) * 180 / Math.PI).toFixed(3); }
    // scope fov
    settle('sniper'); G.setInput({ scope: true }); G.step(0.1); G.render(); const mid = G.state().weapon.fov; G.step(0.15); G.render(); out.scopeFov = { at0_1s: +mid.toFixed(2), at0_25s: G.state().weapon.fov, scoped: W().scoped }; G.clearInput(); G.step(0.3); G.render(); out.scopeFov.released = G.state().weapon.fov;
    return out;
  });
  console.log('CONFIG', JSON.stringify(out.config));
  for (const k in out.falloff) { console.log('FALLOFF ' + k); for (const r of out.falloff[k]) console.log('   ', r); }
  for (const k in out.stance) { console.log('STANCE ' + k); for (const m in out.stance[k]) console.log('   ', m.padEnd(10), JSON.stringify(out.stance[k][m])); }
  console.log('SCOPED'); for (const m in out.scoped) console.log('   ', m.padEnd(10), JSON.stringify(out.scoped[m]));
  for (const k in out.cone) console.log('CONE ' + k.padEnd(22), JSON.stringify(out.cone[k]));
  for (const k in out.bloom) console.log('BLOOM ' + k, JSON.stringify(out.bloom[k]));
  for (const k in out.recoil) console.log('RECOIL ' + k, JSON.stringify(out.recoil[k]));
  console.log('SCOPE FOV', JSON.stringify(out.scopeFov));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
