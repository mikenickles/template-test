// Builder checks for round 2 (gunplay): DESIGN.md sections 12 and 15.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot, fileSizeBytes } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = { fileSizeBytes };
  const run = async (name, fn) => { try { out[name] = await page.evaluate(fn); } catch (e) { out[name] = 'THREW ' + e.message.slice(0, 300); } };

  await run('rates', () => {
    const g = __game, r = {}, S = () => g.state();
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
      g.clearInput(); g.teleport(60, 0, 20, Math.PI, 0); g.give('ammo'); g.selectWeapon(w); g.step(1);
      const W = g.CONFIG.weapons[w], t00 = S().time, auto = W.auto, secs = w === 'sniper' ? 4 : 1;
      // automatic: hold. semi: press on every other tick (fastest a finger could go)
      for (let i = 0; i < Math.round(secs * 60); i++) { g.setInput({ fire: auto ? true : i % 2 === 0 }); g.step(1 / 60); }
      g.clearInput();
      const shots = g.shotLog.filter((s) => s.time >= t00 - 0.002).map((s) => s.time), gaps = shots.slice(1).map((t, i) => +(t - shots[i]).toFixed(4));
      r[w] = { shotsIn: secs + 's', count: shots.length, minGap: Math.min(...gaps), maxGap: Math.max(...gaps), designInterval: +W.interval.toFixed(4) };
      // empty the magazine, then reload
      g.give('ammo'); g.step(2); let fired = 0, t = 0;
      while (S().weapon.mag > 0 && t < 30) { g.setInput({ fire: auto ? true : Math.round(t * 60) % 2 === 0 }); g.step(1 / 60); t += 1 / 60; }
      const heldEmpty = { reloading: S().weapon.reloading };
      const ta = S().time; g.setInput({ fire: false }); g.step(1 / 60); g.setInput({ fire: true }); g.step(1 / 60); g.clearInput();
      const afterDry = S().weapon, dryNames = g.audioLog.filter((a) => a.time >= ta - 0.002).map((a) => a.name);
      let rt = 0; while (S().weapon.reloading && rt < 6) { g.step(1 / 60); rt += 1 / 60; }
      const w2 = S().weapon;
      r[w].empty = { timeToEmpty: +t.toFixed(2), magAtEmpty: afterDry.mag, autoReloadStarted: afterDry.reloading, sounds: dryNames, reloadSeconds: +(rt + 1 / 60).toFixed(3), reloadingWhileStillHolding: heldEmpty.reloading, magAfter: w2.mag, reserveAfter: w2.reserve, designMag: W.mag, designReserve: W.reserve, designReload: W.reload };
      // reload cancels on switch
      g.give('ammo'); g.step(1.5); g.setInput({ fire: true }); g.step(0.3); g.clearInput(); g.step(1.5); const magPart = S().weapon.mag; g.reload(); g.step(0.3);
      const rel = S().weapon.reloading; g.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); g.step(0.1); g.selectWeapon(w); g.step(1);
      r[w].switchCancelsReload = { wasReloading: rel, magBefore: magPart, magAfterSwitchBack: S().weapon.mag, reloading: S().weapon.reloading };
      // draw time: cannot fire until drawn
      g.give('ammo'); g.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); g.step(1); g.selectWeapon(w); const tA = S().time; let dt = 0;
      while (!g.shotLog.some((s) => s.time >= tA - 0.002) && dt < 2) { g.setInput({ fire: dt * 60 % 2 < 1 }); g.step(1 / 60); dt += 1 / 60; } g.clearInput();
      r[w].drawSeconds = +dt.toFixed(3); r[w].designDraw = W.draw;
    }
    return r;
  });

  await run('damage', () => {
    const g = __game, r = {}, C = g.CONFIG.weapons, keep = {};
    for (const k in C) { keep[k] = [C[k].spread, C[k].bloom, C[k].scopedSpread]; C[k].spread = 0; C[k].bloom = 0; }      // perfect accuracy for the damage table only
    const T = g.state().targets.find((t) => t.id === 'target.17');      // tall shelf L3 dummy at (112, 60, 139); clear air around it at y 61
    const shootFrom = (w, x, z, zone) => {
      g.resetTargets(); g.clearInput(); g.selectWeapon(w); g.give('ammo'); g.teleport(60, 0, 20); g.step(1.5);
      g.teleport(x, 59.6, z); g.lookAt(T.pos[0], T.pos[1] + (zone === 'head' ? 1.575 : 0.7), T.pos[2]);
      const s = g.fire(); return s ? [s.hit, s.zone, s.damage, +s.distance.toFixed(1)] : null;
    };
    const table = { rifle: [[102, 139], [112 - 90, 139], [20, 60]], smg: [[102, 139], [112 - 47.5, 139], [112 - 80, 139]], pistol: [[102, 139], [112 - 65, 139], [112 - 100, 139]], sniper: [[102, 139], [20, 60]] };
    for (const w in table) r[w] = table[w].map(([x, z]) => ({ body: shootFrom(w, x, z, 'body'), head: shootFrom(w, x, z, 'head') }));
    for (const k in C) { C[k].spread = keep[k][0]; C[k].bloom = keep[k][1]; }
    g.teleport(60, 0, 20, Math.PI, 0); g.resetTargets();
    return r;
  });

  await run('sniper', () => {
    const g = __game, S = () => g.state().weapon, r = {};
    g.clearInput(); g.teleport(60, 0, 20, Math.PI, 0); g.selectWeapon('sniper'); g.give('ammo'); g.step(1.5);
    r.unscoped = { fov: S().fov, spread: S().spread, scoped: S().scoped };
    g.setInput({ scope: true }); g.step(0.1); g.render(); r.halfWayIn = { fov: +S().fov.toFixed(1), scoped: S().scoped };
    g.step(0.15); g.render(); r.scoped = { fov: S().fov, spread: S().spread, scoped: S().scoped };
    const yaw0 = g.state().player.pitch;
    const tS = g.state().time; const shotsS = () => g.shotLog.filter((s) => s.time >= tS - 0.002); g.setInput({ scope: true, fire: true }); g.step(1 / 60); g.setInput({ scope: true, fire: false });
    r.kickUpDeg = +((g.state().player.pitch - yaw0) * 180 / Math.PI).toFixed(2);
    g.step(0.2); g.render(); r.after0_2s = { scoped: S().scoped, scope: +S().scope.toFixed(2), fov: +S().fov.toFixed(1) };
    // try to fire again during the bolt cycle: every other tick is a fresh press
    let t = 0.2 + 1 / 60, second = null, rescoped = null;
    while (t < 2.5) { g.setInput({ scope: true, fire: Math.round(t * 60) % 2 === 0 }); g.step(1 / 60); t += 1 / 60; if (rescoped === null && S().scoped) rescoped = +t.toFixed(3); if (shotsS().length > 1 && second === null) { second = shotsS()[1].time - shotsS()[0].time; break; } }
    g.clearInput(); r.secondShotAfter = second === null ? null : +second.toFixed(3); r.rescopedAfter = rescoped;
    r.spreadOfShots = shotsS().map((s) => s.spread);
    r.boltSoundsAfterShot = g.audioLog.filter((a) => a.name === 'bolt' && a.time >= tS - 0.002).map((a) => +(a.time - tS).toFixed(2));
    g.step(1); g.render(); r.backToFov = g.state().weapon.fov;
    return r;
  });

  await run('spread', () => {
    const g = __game, S = () => g.state().weapon, r = {};
    for (const w of ['rifle', 'smg', 'pistol']) {
      g.clearInput(); g.teleport(48, 0, 30, Math.PI, 0); g.selectWeapon(w); g.give('ammo'); g.step(1.5);
      const base = S().spread, t0 = g.state().time, auto = g.CONFIG.weapons[w].auto;
      for (let i = 0; i < 90; i++) { g.setInput({ fire: auto ? true : i % 2 === 0 }); g.step(1 / 60); }
      g.clearInput(); const sp = g.shotLog.filter((s) => s.time >= t0 - 0.002).map((s) => s.spread), peak = S().spread;
      let t = 0; while (S().spread > base + 1e-6 && t < 3) { g.step(1 / 60); t += 1 / 60; }
      r[w] = { base, firstShots: sp.slice(0, 6), max: Math.max(...sp), afterBurst: +peak.toFixed(3), recoveredIn: +t.toFixed(2), backTo: S().spread };
    }
    g.clearInput(); g.teleport(48, 0, 30, Math.PI, 0); g.selectWeapon('rifle'); g.step(1.5);
    const m = { standing: S().spread };
    g.setInput({ crouch: true }); g.step(0.5); m.crouched = S().spread;
    g.setInput({ crouch: true, forward: true }); g.step(0.5); m.crouchedMoving = +S().spread.toFixed(3);
    g.clearInput(); g.setInput({ forward: true }); g.step(0.5); m.moving = S().spread;
    g.setInput({ forward: true, sprint: true }); g.step(0.5); m.sprinting = S().spread;
    const t1 = g.state().time; g.setInput({ forward: true, sprint: true, fire: true }); g.step(0.5); m.shotsWhileSprinting = g.shotLog.filter((s) => s.time >= t1 - 0.002).length;
    g.clearInput(); g.step(0.5); g.setInput({ jump: true }); g.step(0.2); m.airborne = S().spread; g.clearInput(); g.step(1);
    // cannot fire on a string
    g.teleport(107, 0, 52, Math.PI, 0); g.setInput({ forward: true }); g.step(2); const t2 = g.state().time; g.setInput({ forward: true, fire: true }); g.step(0.5);
    m.shotsOnString = g.shotLog.filter((s) => s.time >= t2 - 0.002).length; m.wasClimbing = g.state().player.climbing; g.clearInput();
    r.multipliers = m;
    // recoil: kick then 60 % comes back within 0.25 s
    g.teleport(48, 0, 30, Math.PI, 0); g.selectWeapon('pistol'); g.give('ammo'); g.step(1.5); const p0 = g.state().player.pitch; g.fire(); const p1 = g.state().player.pitch; g.step(0.25); const p2 = g.state().player.pitch; g.step(0.5);
    r.pistolRecoilDeg = { kick: +((p1 - p0) * 57.2958).toFixed(3), after0_25s: +((p2 - p0) * 57.2958).toFixed(3), later: +((g.state().player.pitch - p0) * 57.2958).toFixed(3) };
    return r;
  });

  await run('cover', () => {
    const g = __game, r = {}, C = g.CONFIG.weapons.sniper, keep = C.spread; C.spread = 0;
    const hp = () => g.state().targets.find((t) => t.id === 'target.21').hp;        // behind the Tan fort slit at (66, 0, 137)
    g.resetTargets(); g.clearInput(); g.selectWeapon('sniper'); g.give('ammo'); g.teleport(66, 0, 120, 0, 0); g.step(1.5);
    g.lookAt(66, 0.6, 137); const a = g.fire(); r.aimAtBodyThroughWall = { hit: a.hit, damage: a.damage, targetHp: hp() };
    g.step(1.4); g.lookAt(66, 1.575, 137); const b = g.fire(); r.aimAtHeadThroughSlit = { hit: b.hit, zone: b.zone, damage: b.damage, targetHp: hp() };
    // raycast hook
    r.raycastDown = g.raycast([60, 5, 60], [0, -1, 0]); r.raycastTarget = g.raycast([60, 1, 20], [0, 0, 1]); r.raycastRamp = g.raycast([26, 30, 35], [0, -1, 0]); r.raycastCyl = g.raycast([100, 30, 74], [1, 0, 0]);
    C.spread = keep; return r;
  });

  await run('grenade', () => {
    const g = __game, r = {}, K = g.CONFIG.grenade, S = () => g.state();
    // a real throw at the north wall from the spawn: bounces, bursts 2 s after release, one per life
    g.resetTargets(); g.clearInput(); g.teleport(48, 0, 40, 0, 0.2); g.give('grenade'); g.give('health'); g.step(0.5);
    const t0 = S().time; const ok = g.throwGrenade(0.5); const tRel = S().time;
    const live = g.grenades.length; let path = [], burstT = null;
    for (let i = 0; i < 200; i++) { g.step(1 / 60); if (g.grenades[0] && i % 12 === 0) path.push(g.grenades[0].x.toFixed(1) + ',' + g.grenades[0].y.toFixed(1) + ',' + g.grenades[0].z.toFixed(1)); if (!g.grenades.length && burstT === null) burstT = S().time - tRel; }
    const names = g.audioLog.filter((a) => a.time >= t0 - 0.002 && a.name.startsWith('grenade')).map((a) => a.name + '@' + (a.time - t0).toFixed(2));
    r.throw = { ok, liveAfterThrow: live, path, burstAfterEndOfReleaseTick: +burstT.toFixed(3), sounds: names, grenadesLeft: S().weapon.grenades, secondThrow: g.throwGrenade(0.1), playerHp: S().player.health };
    // blast damage by distance: put a resting grenade at set distances from the floor dummy target.5 at (60, 0, 110)
    const blast = (gx, gy, gz, id) => { g.resetTargets(); g.teleport(10, 0, 10); const tb = S().time; g.grenades.push({ x: gx, y: gy, z: gz, vx: 0, vy: 0, vz: 0, rest: true, fuse: 0.02 }); g.step(0.1);
      const e = g.shotLog.filter((s) => s.time >= tb - 0.002).find((s) => s.hit === id); const T = S().targets.find((t) => t.id === id); return { damage: e ? e.damage : 0, distance: e ? e.distance : null, hp: +T.hp.toFixed(1), down: T.down }; };
    r.byDistance = [0.5, 2, 4, 6, 6.9, 7.5].map((d) => Object.assign({ offset: d, expected: null }, blast(60 + d, 0.8, 110, 'target.5')));
    r.byDistance.forEach((e) => { e.expected = +Math.max(0, K.damage * (1 - e.offset / K.radius)).toFixed(2); });
    // blocked by cover: grenade just north of the Tan fort front wall, dummy target.21 just behind it
    r.behindWall = blast(66, 0.2, 133, 'target.21');
    r.sameDistanceOpen = blast(66, 0.2, 137 + 4, 'target.21');
    // self damage
    g.teleport(60, 0, 60); g.give('health'); g.grenades.push({ x: 62, y: 0.9, z: 60, vx: 0, vy: 0, vz: 0, rest: true, fuse: 0.02 }); g.step(0.1); r.selfDamageAt2 = { hp: +S().player.health.toFixed(1), log: g.damageLog.slice(-1)[0] };
    g.give('health'); g.teleport(60, 0, 20, Math.PI, 0);
    return r;
  });

  await run('dummies', () => {
    const g = __game, r = {}, C = g.CONFIG.weapons.sniper, keep = C.spread; C.spread = 0;
    g.resetTargets(); g.clearInput(); g.selectWeapon('sniper'); g.step(1.5);
    const list = g.state().targets, res = []; let kills = 0;
    for (const T of list) {
      g.give('ammo'); let done = null;
      for (const [dx, dz] of [[0, -4], [0, 4], [-4, 0], [4, 0], [3, 3], [-3, -3]]) {       // find a side with a clear line to the head
        const o = [T.pos[0] + dx, T.pos[1] + 1.575, T.pos[2] + dz], h = g.raycast(o, [-dx, 0, -dz]);
        if (!h || h.id !== T.id) continue;
        g.teleport(o[0], o[1] - 1.6, o[2]); g.lookAt(T.pos[0], T.pos[1] + 1.575, T.pos[2]); const ta = g.state().time; done = g.fire(); kills += g.audioLog.filter((a) => a.time >= ta - 0.002 && a.name === 'kill').length; break;
      }
      const now = g.state().targets.find((t) => t.id === T.id);
      res.push([T.id, T.team, done ? done.zone : 'no line', done ? done.damage : 0, now.hp, now.down]);
      g.teleport(60, 0, 20); g.step(1.4);
    }
    r.count = list.length; r.teams = { green: list.filter((t) => t.team === 'green').length, tan: list.filter((t) => t.team === 'tan').length };
    r.eliminated = res.filter((x) => x[5] || true).length; r.notDowned = res.filter((x) => x[4] !== 0);
    r.firstDownAgainAfter = null;
    g.step(3.2); const end = g.state().targets; r.standingAgain = end.filter((t) => !t.down && t.hp === 100).length;
    r.killSounds = kills;
    // stand-up timing on one dummy
    g.resetTargets(); g.give('ammo'); g.teleport(60, 0, 26, Math.PI, 0); g.step(1.4); g.teleport(60, -0.025, 30); g.lookAt(60, 1.575, 34); const s = g.fire(); let t = 0;
    while (g.state().targets[0].down && t < 5) { g.step(1 / 60); t += 1 / 60; } r.standUp = { shot: s && [s.hit, s.zone, s.damage], downFor: +t.toFixed(2) };
    C.spread = keep; g.teleport(60, 0, 20, Math.PI, 0); return r;
  });

  await run('audio', () => {
    const g = __game, r = {};
    const names = (fn) => { const a = g.state().time; fn(); return [...new Set(g.audioLog.filter((x) => x.time >= a - 0.002).map((x) => x.name))]; };
    g.clearInput(); g.resetTargets(); g.teleport(48, 0, 30, Math.PI, 0); g.step(1);
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
      r['select+fire ' + w] = names(() => { g.selectWeapon(w === 'rifle' ? 'pistol' : 'rifle'); g.step(1); g.selectWeapon(w); g.give('ammo'); g.step(1); g.setInput({ fire: true }); g.step(0.05); g.clearInput(); g.step(1); });
      r['reload ' + w] = names(() => { g.reload(); g.step(3.2); });
    }
    r.walkOnFloor = names(() => { g.setInput({ forward: true }); g.step(1.5); g.clearInput(); });
    r.jump = names(() => { g.setInput({ jump: true }); g.step(1); g.clearInput(); });
    r.walkOnBed = names(() => { g.teleport(26, 18, 70, 0, 0); g.setInput({ forward: true }); g.step(1.2); g.clearInput(); });
    r.walkOnStairs = names(() => { g.teleport(26, 0, 144, 0, 0); g.setInput({ forward: true }); g.step(1.5); g.clearInput(); });
    r.walkOnTunnel = names(() => { g.teleport(77, 8, 72, Math.PI, 0); g.setInput({ forward: true }); g.step(1.2); g.clearInput(); });
    r.walkOnFort = names(() => { g.teleport(70, 7, 9.5, Math.PI / 2, 0); g.setInput({ forward: true }); g.step(1); g.clearInput(); });
    r.walkOnPad = names(() => { g.teleport(36.3, 0, 80, -Math.PI / 2, 0); g.setInput({ forward: true }); g.step(0.5); g.clearInput(); g.step(3); });
    r.logLength = g.audioLog.length; r.logCappedAt200 = g.audioLog.length <= 200; r.shotLogCapped = g.shotLog.length <= 200;
    r.hitAndKill = names(() => { g.resetTargets(); g.selectWeapon('pistol'); g.give('ammo'); g.teleport(60, 0, 28, Math.PI, 0); g.step(1); for (let i = 0; i < 5; i++) { g.lookAt(60, 0.7, 34); g.fire(); g.step(0.25); } });
    g.teleport(60, 0, 20, Math.PI, 0);
    return r;
  });

  await run('carryOvers', () => {
    const g = __game, r = {}, col = (id) => { const c = g.colliders.find((k) => k.id === id); return c ? [c.x0, c.x1, c.z0, c.z1, c.y0, c.y1] : 'MISSING'; };
    r.c2_drawCallsIncludeShadowPass = (() => { g.render(); return g.state().drawCalls; })();
    r.c3_stepSmooth = g.CONFIG.player.stepSmooth;
    r.c4_views = { west_lane: g.views.west_lane[0], desk_top: g.views.desk_top[0] };
    r.c5_crayons = ['n.C-a.crayon1', 'n.C-a.crayon2', 's.C-a.crayon1', 's.C-a.crayon2'].map(col);
    r.c7_bearHead = col('bear.head');
    r.c8_apron = [col('desk.apron.n'), col('desk.apron.s')];
    // 8: on the north ruler half way up, walk east: must be held by the apron, not dropped under the desk
    g.clearInput(); g.teleport(94, 21.5, 69.5, -Math.PI / 2, 0); g.step(0.2); const n = g.damageLog.length; g.setInput({ forward: true }); g.step(2); g.clearInput();
    const p = g.state().player; r.c8_walkEastOffRuler = { pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], falls: g.damageLog.length - n };
    // 9: a string cannot be grabbed while falling faster than 12
    const fall = (y) => { g.clearInput(); g.teleport(107, y, 53.9, Math.PI, 0); g.setInput({ forward: true }); let grabbedAtVy = null; for (let i = 0; i < 400; i++) { const vy = g.state().player.vy; g.step(1 / 60); const q = g.state().player; if (q.climbing) { grabbedAtVy = +vy.toFixed(2); break; } if (q.onGround) break; } g.clearInput(); return { from: y, grabbedAtVy, endY: +g.state().player.y.toFixed(2) }; };
    r.c9_grabWhileFalling = [fall(28), fall(60)];
    g.give('health'); g.teleport(60, 0, 20, Math.PI, 0);
    // 10: one-way edges cannot be driven backward
    r.c10_backwardLaunch = (() => { const q = g.walkPath(['m.bed.e', 'm.pad']); return { ok: q.ok, error: q.error }; })();
    r.c10_backwardDrop = (() => { const q = g.walkPath(['m.tunnel.top', 'm.seat']); return { ok: q.ok, error: q.error }; })();
    r.c10_backwardPadApproach = (() => { const q = g.walkPath(['m.pad', 'n.w.5']); return { ok: q.ok, error: q.error }; })();
    r.c10_forwardStillWorks = g.walkPath(['n.w.5', 'm.pad']).ok;
    g.teleport(60, 0, 20, Math.PI, 0); g.step(3);
    return r;
  });

  await run('regress', () => {
    const g = __game, r = { blocked: g.validateWaypoints(), routes: {} };
    for (const id of Object.keys(g.routes)) { const row = [];
      for (const sprint of [false, true]) { g.clearInput(); g.teleport(60, 0, 20); g.give('health'); const h = g.state().player.health; const q = g.walkPath(g.routes[id], { sprint }); const p = g.state().player; row.push(q.ok, q.time, +p.y.toFixed(2), p.health - h); }
      r.routes[id] = row; }
    g.teleport(60, 0, 20, Math.PI, 0); return r;
  });

  // ---- screenshots and budget while firing (real-time loop on, so frames are rendered between shots) ----
  await page.evaluate(() => { __game.clearInput(); __game.resetTargets(); __game.give('ammo'); __game.teleport(60, 0, 27.5, Math.PI, 0); __game.selectWeapon('rifle'); __game.step(1); __game.lookAt(60, 1.2, 34); __game.setTimeScale(1); __game.setInput({ fire: true, forward: false }); });
  let maxCalls = 0, maxTris = 0;
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(120); const s = await page.evaluate(() => { __game.give('ammo'); const s = __game.state(); return [s.drawCalls, s.triangles]; }); maxCalls = Math.max(maxCalls, s[0]); maxTris = Math.max(maxTris, s[1]); if (i === 2) await shot('round2/builder_rifle_burst.png'); }
  // everything at once: grenade arc held, tracers, particles, casings, decals
  await page.evaluate(() => { __game.give('grenade'); __game.setInput({ fire: true, grenade: true }); });
  await page.waitForTimeout(300);
  const arc = await page.evaluate(() => { const s = __game.state(); return [s.drawCalls, s.triangles]; }); maxCalls = Math.max(maxCalls, arc[0]);
  await shot('round2/builder_grenade_arc.png');
  await page.evaluate(() => { __game.clearInput(); __game.setTimeScale(0); __game.step(3); });
  out.budgetWhileFiring = { maxDrawCalls: maxCalls, maxTriangles: maxTris, withGrenadeArc: arc };
  await page.evaluate(() => { __game.resetTargets(); __game.teleport(60, 0, 100, 0, 0); __game.selectWeapon('sniper'); __game.give('ammo'); __game.step(1); __game.lookAt(60, 1.3, 50); __game.setInput({ scope: true }); __game.step(0.4); __game.render(); });
  await page.waitForTimeout(300); await shot('round2/builder_sniper_scoped.png');
  out.scopedState = await page.evaluate(() => { const s = __game.state(); return { fov: s.weapon.fov, scoped: s.weapon.scoped, drawCalls: s.drawCalls }; });
  await page.evaluate(() => { __game.clearInput(); __game.step(0.5); __game.teleport(119.6, 0, 68, 0, -0.25); __game.selectWeapon('pistol'); __game.step(1); __game.render(); });
  await page.waitForTimeout(300); await shot('round2/builder_skirting_against_wall.png');
  await page.evaluate(() => { __game.setView('bed_top'); __game.render(); }); await page.waitForTimeout(300); await shot('round2/builder_bed_top.png');
  await page.evaluate(() => { __game.setView('desk_top'); __game.render(); }); await page.waitForTimeout(300); await shot('round2/builder_desk_top.png');
  await page.evaluate(() => { __game.setView('west_lane'); __game.render(); }); await page.waitForTimeout(300); await shot('round2/builder_west_lane.png');
  await page.evaluate(() => { __game.setView('spawn_tan'); __game.render(); }); await page.waitForTimeout(300); await shot('round2/builder_spawn_tan.png');
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
