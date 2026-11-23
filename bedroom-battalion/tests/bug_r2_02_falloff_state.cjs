// Round 2 checks 2 (falloff at range, measured spread cone) and 3 (state-machine abuse). Tick-limited loops only.
const { boot } = require('./bug_lib.cjs');
const SEED = +(process.argv[2] || 7);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((SEED) => {
    const G = __game, DT = 1 / 60, out = {};
    const W = () => G.state().weapon;
    const settle = (name) => { G.clearInput(); G.give('ammo'); G.give('health'); G.resetTargets(); G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(0.8); G.selectWeapon(name); G.step(1.5); };

    // ---- falloff: find long clear lines from waypoint nodes to dummies with the game's own raycast, then shoot along them ----
    const nodes = Object.entries(G.waypoints.nodes), targets = G.state().targets, lines = [];
    for (const [id, n] of nodes) for (const t of targets) {
      const o = [n[0], n[1] + 1.0, n[2]], d = [t.pos[0] - o[0], t.pos[1] + 0.7 - o[1], t.pos[2] - o[2]];     // crouched eye to body centre
      const r = G.raycast(o, d); if (r && r.id === t.id && r.zone === 'body') lines.push({ node: id, n, t, dist: r.distance });
    }
    lines.sort((a, b) => a.dist - b.dist);
    out.longestLine = lines.length ? { node: lines[lines.length - 1].node, target: lines[lines.length - 1].t.id, dist: +lines[lines.length - 1].dist.toFixed(1) } : null;
    const want = [5, 20, 25, 30, 40, 47, 55, 60, 70, 80, 90, 100, 110, 120, 135], picks = [];
    for (const w of want) { const best = lines.reduce((a, b) => (Math.abs(b.dist - w) < Math.abs(a.dist - w) ? b : a), lines[0]); if (best && Math.abs(best.dist - w) < 4 && !picks.includes(best)) picks.push(best); }
    out.falloff = [];
    for (const name of ['rifle', 'smg', 'pistol', 'sniper']) {
      const C = G.CONFIG.weapons[name], f = C.falloff, rows = [];
      for (const L of picks) {
        settle(name); G.teleport(L.n[0], L.n[1], L.n[2]); G.setInput({ crouch: true, scope: true }); G.step(0.6);
        const seen = {}; let bad = 0, hits = 0;
        for (let i = 0; i < 60 && hits < 6; i++) {
          G.resetTargets(); G.give('ammo'); G.lookAt(L.t.pos[0], L.t.pos[1] + 0.7, L.t.pos[2]); G.step(DT); G.lookAt(L.t.pos[0], L.t.pos[1] + 0.7, L.t.pos[2]);
          const e = G.fire(); G.step(1.4);
          if (!e || e.kind !== 'target') continue;
          hits++;
          const fac = !f || e.distance <= f[0] ? 1 : e.distance >= f[1] ? f[2] : 1 + (f[2] - 1) * (e.distance - f[0]) / (f[1] - f[0]);
          const exp = C.damage * fac * (e.zone === 'head' ? 2 : 1);
          if (Math.abs(exp - e.damage) > 0.011) bad++;
          seen[e.zone + ' ' + e.damage + ' (expect ' + exp.toFixed(2) + ')'] = 1;
        }
        G.clearInput();
        rows.push(`${L.dist.toFixed(1)}u: ${hits ? Object.keys(seen).join(' | ') : 'no hits in 60 shots'}${bad ? '  <-- MISMATCH x' + bad : ''}`);
      }
      out.falloff.push({ name, rows });
    }

    // ---- measured cone: from the top shelf at the far west wall, angle of every shot against the view direction ----
    out.cone = {};
    for (const [name, mode] of [['rifle', 'still'], ['smg', 'still'], ['pistol', 'still'], ['sniper', 'still'], ['sniper', 'scoped'], ['rifle', 'crouch'], ['rifle', 'air']]) {
      settle(name); let maxA = 0, sum = 0, cnt = 0, other = {};
      for (let i = 0; i < 200; i++) {
        G.give('ammo'); G.teleport(110.5, 60, 150, Math.PI / 2, 0); G.clearInput();
        if (mode === 'crouch') G.setInput({ crouch: true }); if (mode === 'scoped') G.setInput({ scope: true });
        G.step(1.45); G.look(Math.PI / 2, 0);
        if (mode === 'air') { G.setInput({ jump: true }); G.step(0.2); G.look(Math.PI / 2, 0); }
        const p = G.state().player, sp = W().spread, e = G.fire();
        if (!e) continue;
        if (e.hit !== 'room.wall.w') { other[e.hit] = (other[e.hit] || 0) + 1; continue; }
        const a = Math.acos(Math.min(1, p.x / e.distance)) * 180 / Math.PI; maxA = Math.max(maxA, a); sum += a; cnt++;
        out.cone[name + ' ' + mode] = { reportedSpread: +sp.toFixed(3) };
      }
      Object.assign(out.cone[name + ' ' + mode] || (out.cone[name + ' ' + mode] = {}), { shots: cnt, maxDeg: +maxA.toFixed(3), meanDeg: +(sum / Math.max(1, cnt)).toFixed(3), other });
    }

    // ---- quick-switch: does switching away and back beat the fire interval / the bolt? ----
    out.quickSwitch = {};
    for (const name of ['sniper', 'pistol', 'rifle']) {
      const other = name === 'pistol' ? 'rifle' : 'pistol';
      settle(name); G.teleport(60, 0, 100, 0, 0); G.shotLog.length = 0;
      const t = []; let last = 0;
      for (let i = 0; i < 600 && t.length < 4; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); if (G.shotLog.length > last) { last = G.shotLog.length; t.push(i); G.selectWeapon(other); G.selectWeapon(name); } }
      G.clearInput();
      const gaps = t.slice(1).map((v, k) => +((v - t[k]) / 60).toFixed(3));
      out.quickSwitch[name] = { secondsBetweenShotsWithSwitch: gaps, designInterval: G.CONFIG.weapons[name].interval, drawTime: G.CONFIG.weapons[name].draw };
    }
    // ---- same-tick combinations through real ticks ----
    out.sameTick = {};
    const snap = () => { const w = W(); return { name: w.name, mag: w.mag, reserve: w.reserve, reloading: w.reloading, scoped: w.scoped, grenades: w.grenades, live: G.grenades.length }; };
    settle('rifle'); G.give('grenade'); G.teleport(60, 0, 100, 0, 0); G.fire(); G.step(0.2);
    G.setInput({ fire: true, reload: true, scope: true, grenade: true }); G.step(DT); out.sameTick.fireReloadScopeGrenadePressedTogether = snap(); G.step(0.5); out.sameTick.heldHalfSecond = snap(); G.clearInput(); G.step(DT); out.sameTick.afterRelease = snap(); G.step(3); out.sameTick.threeSecondsLater = snap();
    settle('sniper'); G.teleport(60, 0, 100, 0, 0); G.setInput({ scope: true }); G.step(0.5); G.fire(); G.step(0.3); G.selectWeapon('pistol'); G.selectWeapon('sniper'); G.step(0.75); out.sameTick.sniperSwitchMidBolt = { scoped: W().scoped, canFire: !!G.fire() }; G.clearInput();
    settle('sniper'); G.fire(); G.step(0.1); G.reload(); G.setInput({ scope: true }); G.step(0.5); out.sameTick.scopeWhileReloading = { reloading: W().reloading, scoped: W().scoped, scope: W().scope }; G.step(3); out.sameTick.scopeAfterReloadStillHeld = { scoped: W().scoped }; G.clearInput();
    settle('sniper'); G.setInput({ scope: true, jump: true }); G.step(0.4); out.sameTick.scopeWhileJumping = { scoped: W().scoped, spread: +W().spread.toFixed(3), onGround: G.state().player.onGround }; G.clearInput(); G.step(1);
    settle('sniper'); G.teleport(107, 0, 52.5, Math.PI, 0); G.setInput({ forward: true, scope: true }); G.step(1.5); out.sameTick.scopeWhileClimbing = { climbing: G.state().player.climbing, scoped: W().scoped, scope: W().scope }; G.clearInput();
    settle('sniper'); G.teleport(60, 50, 100, 0, 0); G.setInput({ scope: true }); G.step(1); out.sameTick.scopeWhileFalling = { scoped: W().scoped, y: +G.state().player.y.toFixed(1) };
    for (let i = 0; i < 300 && G.state().player.y > 0.01; i++) G.step(DT); G.step(DT);
    out.sameTick.scopeHeldThroughDeath = { pos: [G.state().player.x, G.state().player.z], hp: G.state().player.health, scope: W().scope }; G.step(0.3); out.sameTick.scopeHeldAfterRespawn = { scoped: W().scoped, mag: W().mag }; G.clearInput();
    // holding fire through a switch
    settle('rifle'); G.teleport(60, 0, 100, 0, 0); G.shotLog.length = 0; G.setInput({ fire: true }); G.step(0.5); const nR = G.shotLog.length; G.selectWeapon('smg'); G.step(1); const nS = G.shotLog.filter((s) => s.weapon === 'smg').length; G.selectWeapon('pistol'); G.step(1); const nP = G.shotLog.filter((s) => s.weapon === 'pistol').length; G.selectWeapon('sniper'); G.step(1.2); const nN = G.shotLog.filter((s) => s.weapon === 'sniper').length; G.clearInput();
    out.sameTick.holdFireThroughSwitches = { rifleShotsIn0_5s: nR, smgShotsIn1sAfterSwitch: nS, pistolShotsHeld1s: nP, sniperShotsHeld1_2s: nN };
    // grenade held through death, and throw + die on the same tick
    settle('rifle'); G.give('grenade'); G.teleport(60, 45, 100, 0, 0); G.setInput({ grenade: true }); for (let i = 0; i < 300 && G.state().player.y > 0.01; i++) G.step(DT); G.step(0.2);
    out.sameTick.grenadeHeldThroughDeath = { ...snap(), pos: [G.state().player.x, G.state().player.z] }; G.step(1); out.sameTick.grenadeStillHeld1sAfterRespawn = snap(); G.clearInput(); G.step(DT); out.sameTick.grenadeReleasedAfterRespawn = snap(); G.step(2.5);
    // grenade blocks fire while aiming; fire resumes after
    settle('rifle'); G.give('grenade'); G.teleport(60, 0, 100, 0, 0); G.shotLog.length = 0; G.setInput({ grenade: true, fire: true }); G.step(0.5); const during = G.shotLog.length; G.setInput({ grenade: false }); G.step(0.5); out.sameTick.fireWhileAimingGrenade = { shotsWhileAiming: during, shotsAfterThrow: G.shotLog.length - during }; G.clearInput(); G.step(2.5);
    // reload while aiming a grenade, then throw
    settle('rifle'); G.give('grenade'); G.fire(); G.step(0.2); G.setInput({ grenade: true, reload: true }); G.step(2.5); out.sameTick.reloadWhileAimingGrenade = snap(); G.clearInput(); G.step(2.5);

    // ---- random abuse with invariants ----
    let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const names = ['rifle', 'smg', 'sniper', 'pistol'], bad = [], seen = { shots: 0, reloads: 0, throws: 0, deaths: 0 };
    settle('rifle'); G.teleport(60, 0, 100, 0, 0);
    let inp = {}, prevTotal = null, prevName = null, prevG = W().grenades, prevLive = G.grenades.length, prevShots = G.shotLog.length, lastShotTick = {}, prevHp = 100;
    for (let i = 0; i < 120000; i++) {
      if (rnd() < 0.08) { inp = { fire: rnd() < 0.5, scope: rnd() < 0.3, reload: rnd() < 0.15, grenade: rnd() < 0.2, forward: rnd() < 0.3, sprint: rnd() < 0.2, jump: rnd() < 0.1, crouch: rnd() < 0.15, left: rnd() < 0.15 }; G.clearInput(); G.setInput(inp); G.look(rnd() * 6.28, (rnd() - 0.5) * 3); }
      let switched = false;
      if (rnd() < 0.03) { G.selectWeapon(names[Math.floor(rnd() * 4)]); switched = true; }
      if (rnd() < 0.01) { G.fire(); }
      if (rnd() < 0.01) { G.reload(); }
      if (rnd() < 0.002) G.give('grenade');
      if (rnd() < 0.0005) G.give('ammo');
      if (rnd() < 0.0003) { G.teleport(60, 40, 100); }           // a lethal fall now and then
      if (rnd() < 0.001) G.teleport(20 + rnd() * 80, 0, 100 + rnd() * 20);
      const gaveAmmo = false;
      G.step(DT);
      const w = W(), C = G.CONFIG.weapons[w.name], hp = G.state().player.health;
      if (w.mag < 0 || w.mag > C.mag || w.reserve < 0 || w.reserve > C.reserve || !Number.isInteger(w.mag) || !Number.isInteger(w.reserve)) bad.push({ i, why: 'ammo out of range', w });
      if (w.grenades < 0 || w.grenades > 1) bad.push({ i, why: 'grenade count', w });
      if (!(w.spread >= 0) || !Number.isFinite(w.spread)) bad.push({ i, why: 'spread', w });
      if (w.scoped && w.name !== 'sniper') bad.push({ i, why: 'scoped with ' + w.name });
      if (w.scoped && w.reloading) bad.push({ i, why: 'scoped while reloading' });
      const pl = G.state().player; if (!Number.isFinite(pl.yaw + pl.pitch) || Math.abs(pl.pitch) > 1.5401) bad.push({ i, why: 'view angles', yaw: pl.yaw, pitch: pl.pitch });
      if (G.shotLog.length !== prevShots || (G.shotLog.length === 200 && G.shotLog[199].time !== (lastShotTick._t || 0))) {
        const e = G.shotLog[G.shotLog.length - 1];
        if (e.weapon !== 'grenade') { seen.shots++; if (pl.climbing) bad.push({ i, why: 'shot while on a string', e }); }
        lastShotTick._t = e.time;
      }
      prevShots = G.shotLog.length;
      if (hp === 100 && prevHp < 100 && G.damageLog.length && pl.x === 60 && pl.z === 20) seen.deaths++;
      prevHp = hp;
      if (bad.length > 12) break;
    }
    G.clearInput();
    out.fuzz = { ticks: 120000, seen, bad: bad.slice(0, 12), final: snap() };
    return out;
  }, SEED);
  console.log('longest clear line found:', JSON.stringify(out.longestLine));
  for (const f of out.falloff) { console.log('FALLOFF ' + f.name); for (const r of f.rows) console.log('   ', r); }
  for (const k in out.cone) console.log('CONE ' + k, JSON.stringify(out.cone[k]));
  for (const k in out.quickSwitch) console.log('QUICK-SWITCH ' + k, JSON.stringify(out.quickSwitch[k]));
  for (const k in out.sameTick) console.log('  ' + k + ': ' + JSON.stringify(out.sameTick[k]));
  console.log('FUZZ', JSON.stringify(out.fuzz));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
