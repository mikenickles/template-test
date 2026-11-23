// Round 2 checks 1 and 2: the new hook members (DESIGN 15.4) and every weapon number in sections 12 and 15.1.
// All loops are tick-limited.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const W = () => G.state().weapon;
    // a clean firing lane: stand at (20, 0, 150) looking east along z 150 (open floor to the tall shelf stairs side)
    const fresh = (name) => { G.clearInput(); G.give('ammo'); G.give('health'); G.give('grenade'); G.resetTargets(); G.teleport(60, 0, 40, -Math.PI / 2, 0); G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(1); G.selectWeapon(name); G.step(1.5); G.shotLog.length = 0; G.audioLog.length = 0; };

    // ---- hook members ----
    out.members = {}; for (const k of ['fire', 'selectWeapon', 'reload', 'throwGrenade', 'give', 'raycast', 'shotLog', 'audioLog', 'resetTargets']) out.members[k] = typeof G[k];
    out.stateWeaponKeys = Object.keys(G.state().weapon); out.target0 = G.state().targets[0]; out.targetCount = G.state().targets.length;
    fresh('rifle');
    out.fireReturn = G.fire(); out.shotLog0 = G.shotLog[0]; out.audioAfterFire = G.audioLog.map((a) => a.name);
    out.selectBogus = G.selectWeapon('bazooka'); out.giveBogus = G.give('cake');
    out.raycastDown = G.raycast([60, 5, 40], [0, -1, 0]); out.raycastZeroDir = G.raycast([60, 5, 40], [0, 0, 0]);
    out.raycastUnnormalised = G.raycast([60, 5, 40], [0, -7, 0]);
    out.raycastTarget = G.raycast([60, 1.0, 40], [0, 0, -1]);     // dummy at (60, 0, 34)
    // logs cap at 200
    fresh('smg'); for (let i = 0; i < 260; i++) { G.give('ammo'); G.fire(); G.step(0.1); } out.logCaps = { shotLog: G.shotLog.length, audioLog: G.audioLog.length };

    // ---- per weapon ----
    out.weapons = {};
    for (const name of ['rifle', 'smg', 'sniper', 'pistol']) {
      const C = G.CONFIG.weapons[name], r = {};
      fresh(name);
      r.start = { mag: W().mag, reserve: W().reserve, spread: +W().spread.toFixed(3) };
      // fire rate: hold fire for 3 s (auto) or press every tick (semi), count shots and intervals
      G.setInput({ fire: true });
      const times = [];
      let last = G.shotLog.length;
      for (let i = 0; i < 600 && W().mag > 0; i++) {
        if (!C.auto) G.setInput({ fire: i % 2 === 0 });
        G.step(DT); if (G.shotLog.length > last) { times.push(i); last = G.shotLog.length; }
      }
      G.clearInput();
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      r.shotsToEmpty = times.length; r.ticksBetweenShots = [...new Set(gaps)].join(','); r.rpm = +(60 / ((times[times.length - 1] - times[0]) / (times.length - 1) / 60)).toFixed(1);
      // auto weapons with fire HELD (no re-press) on an empty magazine: nothing
      G.setInput({ fire: true }); G.step(0.5); r.heldOnEmpty = { reloading: W().reloading, mag: W().mag }; G.clearInput(); G.step(0.1);
      // empty + fire press -> dry click and auto reload; time the reload
      G.audioLog.length = 0;
      G.setInput({ fire: true }); G.step(DT); G.setInput({ fire: false });
      r.pressOnEmpty = { reloading: W().reloading, sounds: G.audioLog.map((a) => a.name) };
      let n = 0; for (; n < 600 && W().reloading; n++) G.step(DT);
      r.reloadSecs = +((n + 1) / 60).toFixed(3); r.afterReload = { mag: W().mag, reserve: W().reserve };
      // R with a full magazine does nothing; R after one shot reloads one round
      r.reloadFull = G.reload(); G.fire(); G.step(C.interval + 0.05); r.reloadAfterOne = G.reload(); for (let i = 0; i < 600 && W().reloading; i++) G.step(DT); r.afterTopUp = { mag: W().mag, reserve: W().reserve };
      // run the reserve dry
      let guard = 0; for (; guard < 40 && (W().reserve > 0 || W().mag > 0); guard++) { for (let i = 0; i < 3000 && W().mag > 0; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); } G.clearInput(); G.reload(); for (let i = 0; i < 600 && W().reloading; i++) G.step(DT); }
      r.dry = { mag: W().mag, reserve: W().reserve };
      G.audioLog.length = 0; G.setInput({ fire: true }); G.step(DT); G.setInput({ fire: false }); G.step(0.2);
      r.fireWithNothingLeft = { reloading: W().reloading, sounds: G.audioLog.map((a) => a.name), reloadCall: G.reload(), fireCall: G.fire() };
      // draw time: select, press fire every other tick, time to the first shot
      fresh(name); G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(1.5); G.selectWeapon(name); G.shotLog.length = 0;
      let d = 0; for (; d < 300 && !G.shotLog.length; d++) { G.setInput({ fire: d % 2 === 0 }); G.step(DT); } G.clearInput();
      r.drawSecsToFirstShot = +(d / 60).toFixed(3);
      // reload cancels on switch; magazine untouched; reload does not resume
      fresh(name); G.fire(); G.step(C.interval + 0.05); const m0 = W().mag, r0 = W().reserve; G.reload(); G.step(C.reload * 0.5); const mid = W().reloading;
      G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(0.05); G.selectWeapon(name); G.step(C.reload + 1);
      r.reloadCancel = { wasReloading: mid, magBefore: m0, magAfter: W().mag, reserveBefore: r0, reserveAfter: W().reserve, reloading: W().reloading };
      // sprint and string block firing
      fresh(name); G.setInput({ forward: true, sprint: true }); G.step(0.5); r.fireWhileSprinting = G.fire(); G.setInput({ fire: true }); G.step(0.5); r.shotsWhileSprintHeld = G.shotLog.length; G.clearInput(); G.step(0.3);
      G.setInput({ sprint: true }); G.step(0.3); r.fireShiftHeldStandingStill = !!G.fire(); G.clearInput();
      fresh(name); G.teleport(107, 0, 52.5, Math.PI, 0); G.setInput({ forward: true }); G.step(1.5); const onString = G.state().player.climbing; G.clearInput(); r.fireOnString = { onString, fired: !!G.fire() }; G.setInput({ fire: true }); G.step(0.5); r.fireOnString.heldShots = G.shotLog.length; G.clearInput();
      out.weapons[name] = r;
    }

    // ---- damage, falloff, headshots: shoot a dummy-like point with fire() and read shotLog. Use the dummy at (60,0,110)
    // from the south along z so nothing is in between, at chosen distances, zero spread by measuring many shots.
    out.damage = {};
    const T5 = G.state().targets.find((t) => t.pos[0] === 60 && t.pos[2] === 126);     // dummy at (60, 0, 126), open floor to the south
    for (const name of ['rifle', 'smg', 'sniper', 'pistol']) {
      const rows = [];
      for (const dist of [3, 10, 20, 24.9, 30, 33]) for (const zone of ['body', 'head']) {
        fresh(name);
        const z = 126 + 0.25 + dist, aimY = zone === 'head' ? 1.55 : 0.8;      // front face of the body is at z 126.25
        G.teleport(60, 0, z, 0, 0);
        if (!G.state().player.onGround) continue;
        const got = new Set(); let tries = 0, zones = {};
        for (; tries < 40; tries++) { G.resetTargets(); G.give('ammo'); G.lookAt(60, aimY, 126); G.setInput({ crouch: true, scope: true }); G.step(0.6); G.lookAt(60, aimY, 126); const e = G.fire(); G.step(1.4); if (e && e.hit === T5.id) { got.add(e.damage + '@' + e.distance); zones[e.zone] = (zones[e.zone] || 0) + 1; } }
        G.clearInput();
        const C = G.CONFIG.weapons[name], f = C.falloff, fac = !f || dist <= f[0] ? 1 : dist >= f[1] ? f[2] : 1 + (f[2] - 1) * (dist - f[0]) / (f[1] - f[0]);
        rows.push({ dist, zone, expect: +(C.damage * fac * (zone === 'head' ? 2 : 1)).toFixed(2), zonesHit: zones, sample: [...got].slice(0, 3) });
      }
      out.damage[name] = rows;
    }
    // long range falloff with raycast-free maths: the longest clear lane to a dummy. (60,0,34) seen from the south gate? measure what exists.
    out.longRange = [];
    for (const [name, from] of [['rifle', [60, 0, 139]], ['smg', [60, 0, 139]], ['pistol', [60, 0, 139]], ['sniper', [60, 0, 139]]]) {
      fresh(name); G.teleport(from[0], from[1], from[2], 0, 0);
      const seen = {};
      for (let i = 0; i < 60; i++) { G.resetTargets(); G.give('ammo'); G.setInput({ crouch: true, scope: true }); G.step(0.5); G.lookAt(60, 0.8, 126); const e = G.fire(); G.step(1.4); if (e && e.kind === 'target') seen[e.hit + ' ' + e.zone + ' d=' + e.distance] = e.damage; }
      G.clearInput(); out.longRange.push({ name, seen });
    }

    // ---- spread: base values and multipliers from state().weapon.spread, and the real cone from shotLog directions ----
    out.spread = {};
    for (const name of ['rifle', 'smg', 'sniper', 'pistol']) {
      const r = {}; fresh(name); G.teleport(60, 0, 100, 0, 0); G.step(0.5);
      r.still = +W().spread.toFixed(3);
      G.setInput({ crouch: true }); G.step(0.5); r.crouch = +W().spread.toFixed(3); G.clearInput(); G.step(0.5);
      G.setInput({ right: true }); G.step(0.5); r.moving = +W().spread.toFixed(3);
      G.setInput({ right: true, crouch: true }); G.step(0.5); r.crouchMoving = +W().spread.toFixed(3); G.clearInput(); G.step(0.5);
      G.setInput({ forward: true, sprint: true }); G.step(0.5); r.sprinting = +W().spread.toFixed(3); G.clearInput(); G.step(0.5);
      G.setInput({ jump: true }); G.step(0.2); r.airborne = +W().spread.toFixed(3); G.clearInput(); G.step(1);
      if (name === 'sniper') { G.setInput({ scope: true }); G.step(0.1); r.scopeAt0_1s = { spread: +W().spread.toFixed(3), scoped: W().scoped }; G.step(0.15); r.scopeAt0_25s = { spread: +W().spread.toFixed(3), scoped: W().scoped, fov: W().fov }; G.render(); r.scopedFovAfterRender = G.state().weapon.fov; G.clearInput(); G.step(0.5); }
      // bloom: fire as fast as allowed, record spread reported with each shot
      fresh(name); G.teleport(60, 0, 100, 0, 0); G.step(0.3); const sp = [];
      for (let i = 0; i < 240 && sp.length < 14; i++) { G.setInput({ fire: i % 2 === 0 || G.CONFIG.weapons[name].auto }); const b = G.shotLog.length; G.step(DT); if (G.shotLog.length > b) sp.push(G.shotLog[G.shotLog.length - 1].spread); }
      G.clearInput(); r.spreadPerShot = sp.join(' ');
      const after = +W().spread.toFixed(3); let k = 0; for (; k < 600 && W().spread > r.still + 1e-6; k++) G.step(DT);
      r.bloomAfterBurst = after; r.secsToRecover = +(k / 60).toFixed(2);
      // measured cone: fire 150 single shots standing still at the south wall from far away, angle between view dir and hit point
      fresh(name); let maxA = 0, sumA = 0, cnt = 0;
      for (let i = 0; i < 150; i++) {
        G.give('ammo'); G.teleport(20, 0, 100, 0, 0); G.look(Math.PI, 0); G.step(1.5);
        const p = G.state().player, e = G.fire(); if (!e || !e.distance) continue;
        // hit point is on the south wall plane z = 160 when it hit the wall
        if (e.hit !== 'room.wall.s') continue;
        const a = Math.acos(Math.min(1, (160 - p.z) / e.distance)) * 180 / Math.PI; maxA = Math.max(maxA, a); sumA += a; cnt++;
      }
      r.measuredCone = { shots: cnt, maxDeg: +maxA.toFixed(3), meanDeg: +(sumA / cnt).toFixed(3) };
      out.spread[name] = r;
    }

    // ---- recoil: kick per shot and recovery ----
    out.recoil = {};
    for (const name of ['rifle', 'smg', 'sniper', 'pistol']) {
      fresh(name); G.teleport(60, 0, 100, 0, 0); G.look(0, 0); G.step(1);
      const p0 = G.state().player; G.fire(); const p1 = G.state().player;
      const trace = []; for (let i = 0; i < 30; i++) { G.step(DT); if (i === 5 || i === 14 || i === 29) trace.push(+((G.state().player.pitch - p0.pitch) * 180 / Math.PI).toFixed(3)); }
      const p2 = G.state().player;
      out.recoil[name] = { kickUpDeg: +((p1.pitch - p0.pitch) * 180 / Math.PI).toFixed(3), kickSideDeg: +((p1.yaw - p0.yaw) * 180 / Math.PI).toFixed(3), pitchAt0_1s_0_25s_0_5s: trace, remainingFraction: +((p2.pitch - p0.pitch) / (p1.pitch - p0.pitch)).toFixed(3) };
      // side kick range over 60 shots
      let mn = 9, mx = -9; for (let i = 0; i < 60; i++) { G.give('ammo'); G.look(0, 0); G.step(1.5); const a = G.state().player.yaw; G.fire(); const d = (G.state().player.yaw - a) * 180 / Math.PI; mn = Math.min(mn, d); mx = Math.max(mx, d); }
      out.recoil[name].sideRangeDeg = [+mn.toFixed(3), +mx.toFixed(3)];
    }
    // recoil at the pitch limit: look straight up and empty a rifle magazine
    fresh('rifle'); G.teleport(60, 0, 100, 0, 0); G.look(0, 1.54); G.step(0.5); G.setInput({ fire: true }); G.step(3.2); G.clearInput(); G.step(1);
    out.recoilAtPitchLimit = { startPitchDeg: +(1.54 * 180 / Math.PI).toFixed(2), endPitchDeg: +(G.state().player.pitch * 180 / Math.PI).toFixed(2), shots: G.shotLog.length };
    // sniper bolt: scope drops after a shot for 0.5 s, next shot after 1.3 s
    fresh('sniper'); G.teleport(60, 0, 100, 0, 0); G.setInput({ scope: true }); G.step(0.5); const s0 = W().scoped; G.fire();
    const tl = []; let prev = null; for (let i = 0; i < 120; i++) { G.step(DT); const s = W().scoped; if (s !== prev) { tl.push(((i + 1) / 60).toFixed(2) + 's ' + (s ? 'scoped' : 'unscoped')); prev = s; } }
    G.clearInput();
    out.sniperScopeAfterShot = { scopedBefore: s0, timeline: tl, audio: G.audioLog.map((a) => a.name + '@' + a.time).slice(-4) };
    return out;
  });
  const P = (k, v) => console.log(k + ': ' + JSON.stringify(v));
  for (const k of ['members', 'stateWeaponKeys', 'targetCount', 'target0', 'fireReturn', 'shotLog0', 'audioAfterFire', 'selectBogus', 'giveBogus', 'raycastDown', 'raycastZeroDir', 'raycastUnnormalised', 'raycastTarget', 'logCaps']) P(k, out[k]);
  for (const n in out.weapons) P('WEAPON ' + n, out.weapons[n]);
  for (const n in out.damage) { console.log('DAMAGE ' + n); for (const r of out.damage[n]) console.log('   ', JSON.stringify(r)); }
  for (const r of out.longRange) P('LONG ' + r.name, r.seen);
  for (const n in out.spread) P('SPREAD ' + n, out.spread[n]);
  for (const n in out.recoil) P('RECOIL ' + n, out.recoil[n]);
  P('recoilAtPitchLimit', out.recoilAtPitchLimit); P('sniperScopeAfterShot', out.sniperScopeAfterShot);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
