// Round 2 pass 2, FIXLIST item 1: grenade start and room exit, launch pitch, sniper bolt across switches, ruler lanes.
// Usage: node builder_r2b_item1.cjs [randomThrows=10000]
const { launch } = require('./harness.cjs');
const THROWS = +(process.argv[2] || 10000);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = {};
  // helpers installed once in the page
  await page.evaluate(() => {
    const g = __game;
    window.B1 = {
      inSolid(x, y, z) {          // strictly inside any solid collider (own test, independent of the game's raycast)
        for (const c of g.colliders) {
          if (c.kind === 'string') continue;
          if (c.kind === 'cyl') { if (y > c.y0 + 1e-4 && y < c.y1 - 1e-4 && Math.hypot(x - c.x, z - c.z) < c.r - 1e-4) return c.id; continue; }
          if (!c._planes) continue;
          let ins = true;
          for (const p of c._planes) if (p[0] * x + p[1] * y + p[2] * z - p[3] > -1e-4) { ins = false; break; }
          if (ins) return c.id;
        }
        return null;
      },
      inRoom: (x, y, z) => x > 0 && x < 120 && y > 0 && y < 90 && z > 0 && z < 160,
      // release the grenade and follow it to its end; returns start, end, whether it was removed early, solids entered
      follow() {
        const o = g.grenades[g.grenades.length - 1];
        if (!o) return null;
        const r = { start: [o.x, o.y, o.z], startSolid: B1.inSolid(o.x, o.y, o.z), startOut: !B1.inRoom(o.x, o.y, o.z), solid: null, out: false, removedEarly: false, end: null };
        for (let i = 0; i < 200; i++) {
          if (!g.grenades.includes(o)) { r.removedEarly = o.fuse > 1e-6; r.end = [o.x, o.y, o.z]; break; }
          if (!B1.inRoom(o.x, o.y, o.z)) r.out = true;
          if (!r.solid) { const s = B1.inSolid(o.x, o.y, o.z); if (s) r.solid = s; }
          g.step(1 / 60);
        }
        return r;
      },
      throwNow(hold, crouch) {
        g.setInput({ grenade: true, crouch: !!crouch }); g.step(hold || 0.1); g.setInput({ grenade: false, crouch: !!crouch }); g.step(1 / 60);
      }
    };
  });

  // ---- BUGS R2-1 repros ----
  out.repro_eastWall = await page.evaluate(() => {
    const g = __game; g.clearInput(); g.give('grenade'); g.give('health'); g.teleport(119.6, 0, 80.5, -Math.PI / 2, 0); g.step(0.3);
    B1.throwNow(0.1); const o = g.grenades[0]; const first = o ? [o.x, o.y, o.z] : null; const f = B1.follow(); g.clearInput();
    return { firstTick: first && first.map((v) => +v.toFixed(3)), ...f, burstAt: f && f.end && f.end.map((v) => +v.toFixed(2)) };
  });
  out.repro_tanFort = await page.evaluate(() => {
    const g = __game; g.clearInput(); g.resetTargets(); g.give('grenade'); g.give('health');
    g.teleport(66, 0, 133.6, 0, 0); g.setInput({ crouch: true }); g.step(0.5); g.look(Math.PI, -0.2);
    B1.throwNow(0.1, true); const o = g.grenades[0]; const first = o ? [o.x, o.y, o.z] : null; const f = B1.follow(); g.clearInput(); g.step(0.5);
    const t21 = g.state().targets.find((t) => t.id === 'target.21');
    return { firstTick: first && first.map((v) => +v.toFixed(3)), startSolid: f.startSolid, solid: f.solid, out: f.out, burstAt: f.end && f.end.map((v) => +v.toFixed(2)), target21hp: t21.hp };
  });
  // ---- launch pitch (BUGS R2-3) ----
  out.launchPitch = await page.evaluate(() => {
    const g = __game, G = g.CONFIG.move.gravity, res = [];
    for (const deg of [-60, -22.9, 0, 22.9, 45, 70]) {
      g.clearInput(); g.give('grenade'); g.teleport(60, 0, 100, 0, deg * Math.PI / 180); g.step(0.1);
      g.look(0, deg * Math.PI / 180); B1.throwNow(0.05);
      const o = g.grenades[g.grenades.length - 1];
      const vy0 = o.vy + G / 60, ang = Math.atan2(vy0, Math.hypot(o.vx, o.vz)) * 180 / Math.PI;
      res.push({ viewPitch: deg, launch: +ang.toFixed(2), diff: +(ang - deg).toFixed(2), speed: +Math.hypot(o.vx, vy0, o.vz).toFixed(2) });
      g.step(2.2);
    }
    return res;
  });
  // ---- BUGS R2-2: sniper bolt across switches ----
  out.sniperSwitch = await page.evaluate(() => {
    const g = __game, res = {};
    for (const seq of [['pistol', 'sniper'], ['rifle', 'sniper'], ['smg', 'pistol', 'sniper']]) {
      g.clearInput(); g.give('ammo'); g.teleport(60, 0, 20, Math.PI, 0); g.selectWeapon('sniper'); g.step(1.5);
      const s1 = g.fire(), t1 = g.state().time;
      for (const w of seq) g.selectWeapon(w);
      let t = 0, shots = [];
      for (let i = 0; i < 6 * 60 && shots.length < 3; i++) { g.setInput({ fire: i % 2 === 0 }); g.step(1 / 60); const L = g.shotLog[g.shotLog.length - 1]; if (L.time > (shots.length ? shots[shots.length - 1] : t1) + 1e-6 && L.weapon === 'sniper') shots.push(L.time); }
      g.clearInput();
      res[seq.join('>')] = { first: +t1.toFixed(3), gaps: [shots[0] - t1, shots[1] - shots[0], shots[2] - shots[1]].map((v) => +v.toFixed(3)) };
    }
    // switch away for longer than the bolt: the draw alone gates the shot
    g.clearInput(); g.give('ammo'); g.selectWeapon('sniper'); g.step(1.5); g.fire(); const ta = g.state().time; g.selectWeapon('pistol'); g.step(2);
    g.selectWeapon('sniper'); let k = 0; while (k < 300) { g.setInput({ fire: k % 2 === 0 }); g.step(1 / 60); k++; const L = g.shotLog[g.shotLog.length - 1]; if (L.weapon === 'sniper' && L.time > ta + 0.01) break; }
    g.clearInput();
    res.awayTwoSeconds = { secondsAfterSwitchBack: +((g.shotLog[g.shotLog.length - 1].time - ta - 2)).toFixed(3), drawDesign: g.CONFIG.weapons.sniper.draw };
    // rifle and pistol quick switch: never faster than their own interval
    for (const w of ['rifle', 'pistol']) {
      g.give('ammo'); g.selectWeapon(w); g.step(1.5); g.fire(); const t0 = g.state().time; g.selectWeapon(w === 'rifle' ? 'pistol' : 'rifle'); g.selectWeapon(w);
      let i = 0; while (i < 120) { g.setInput({ fire: i % 2 === 0 }); g.step(1 / 60); i++; const L = g.shotLog[g.shotLog.length - 1]; if (L.weapon === w && L.time > t0 + 0.01) break; }
      g.clearInput(); res[w + 'QuickSwitch'] = +(g.shotLog[g.shotLog.length - 1].time - t0).toFixed(3);
    }
    return res;
  });
  // ---- BUGS R2-4: ruler lanes, walking and sprinting, both rulers ----
  out.rulers = await page.evaluate(() => {
    const g = __game, res = { ok: 0, fail: [] , total: 0, maxDamage: 0 };
    for (const ruler of ['n', 's']) for (const sprint of [false, true]) for (let x = 92.6; x <= 95.4001; x += 0.1) {
      res.total++;
      g.clearInput(); g.give('health'); const dl = g.damageLog.length;
      const z0 = ruler === 'n' ? 78 : 82, yaw = ruler === 'n' ? 0 : Math.PI;
      g.teleport(x, 17, z0, yaw, 0); g.step(0.1);
      g.setInput({ forward: true, sprint });
      let phase = 'up', t = 0;
      for (; t < 10; t += 1 / 60) {
        const p = g.state().player;
        if (phase === 'up' && p.y > 25.9 && p.onGround) { phase = 'east'; g.look(-Math.PI / 2, 0); }
        if (phase === 'east' && p.onGround && p.y > 25.9 && p.x > 96.2) { phase = 'done'; break; }
        if (phase === 'up') g.look(yaw, 0);
        g.step(1 / 60);
      }
      const p = g.state().player, dmg = g.damageLog.slice(dl).reduce((a, d) => a + d.amount, 0);
      res.maxDamage = Math.max(res.maxDamage, dmg);
      if (phase === 'done' && dmg === 0) res.ok++; else res.fail.push({ ruler, sprint, x: +x.toFixed(2), phase, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), dmg });
      g.clearInput();
    }
    // the bug tester's two lanes
    g.teleport(95.3, 17, 78, 0, 0); g.setInput({ forward: true }); g.step(4); const a = g.state().player; g.clearInput();
    const dl = g.damageLog.length; g.teleport(95.8, 17, 78, 0, 0); g.setInput({ forward: true }); g.step(4); const b = g.state().player; g.clearInput();
    res.bug95_3 = [a.x, a.y, a.z].map((v) => +v.toFixed(2)); res.bug95_8 = { pos: [b.x, b.y, b.z].map((v) => +v.toFixed(2)), damage: g.damageLog.slice(dl).reduce((s, d) => s + d.amount, 0) };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  // ---- random throws ----
  const agg = { throws: 0, startSolid: 0, startOut: 0, enteredSolid: 0, leftRoom: 0, removedEarly: 0, examples: [], pressed: 0 };
  const CHUNK = 250;
  for (let done = 0; done < THROWS; done += CHUNK) {
    const r = await page.evaluate(([n, seed]) => {   // 'pressed' = throws whose old release point was inside or within the body radius of a solid
      const g = __game, ids = Object.keys(g.waypoints.nodes);
      let s = seed >>> 0; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const a = { throws: 0, startSolid: 0, startOut: 0, enteredSolid: 0, leftRoom: 0, removedEarly: 0, examples: [], pressed: 0 };
      for (let i = 0; i < n; i++) {
        g.clearInput(); g.give('health'); g.give('grenade');
        const id = ids[Math.floor(R() * ids.length)], P = g.waypoints.nodes[id];
        const walkYaw = R() * Math.PI * 2, pressMode = i % 2 === 0;     // half the throws: walk 4 s into whatever is ahead, then throw at it
        g.teleport(P[0], P[1], P[2], walkYaw, 0);
        // walk into whatever is near: random heading, sometimes long enough to press against a wall or cover
        const crouch = R() < 0.3, walk = pressMode ? 4 : R() < 0.6 ? 0.2 + R() * 2.8 : 0;
        g.setInput({ forward: walk > 0, crouch, sprint: !pressMode && R() < 0.3, left: !pressMode && R() < 0.15, right: !pressMode && R() < 0.15 }); g.step(walk);
        g.setInput({ crouch }); g.step(0.05);
        const st = g.state().player;
        const yaw = pressMode ? walkYaw + (R() - 0.5) : R() * Math.PI * 2, pitch = pressMode ? (R() * 2 - 1) * 0.6 : (R() * 2 - 1) * 1.5;
        g.look(yaw, pitch);
        // would the old release point (0.5 ahead, 0.2 right, 0.15 down of the eye) have been blocked? (pressed against something)
        const cp = Math.cos(pitch), fx = -Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(yaw) * cp, rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const ey = st.y + (crouch ? 1.0 : 1.6), d = [rx * 0.2 + fx * 0.5, -0.15 + fy * 0.5, rz * 0.2 + fz * 0.5], dl = Math.hypot(...d);
        const hit = g.raycast([st.x, ey, st.z], d), blockedStart = hit && hit.kind !== 'target' && hit.distance < dl + 0.16;
        const before = g.grenades.length;
        g.setInput({ grenade: true, crouch }); g.step(1 / 60 * (1 + Math.floor(R() * 6))); g.setInput({ grenade: false, crouch }); g.step(1 / 60);
        if (g.grenades.length <= before) continue;
        a.throws++;
        if (blockedStart) a.pressed++;
        const f = B1.follow();
        if (f.startSolid) a.startSolid++;
        if (f.startOut) a.startOut++;
        if (f.solid) a.enteredSolid++;
        if (f.out) a.leftRoom++;
        if (f.removedEarly) a.removedEarly++;
        if ((f.startSolid || f.solid || f.out || f.removedEarly) && a.examples.length < 5) a.examples.push({ node: id, player: [st.x, st.y, st.z].map((v) => +v.toFixed(2)), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), crouch, f });
        while (g.grenades.length) g.step(1 / 60);
      }
      g.clearInput();
      return a;
    }, [Math.min(CHUNK, THROWS - done), 12345 + done * 7919]);
    for (const k of ['throws', 'startSolid', 'startOut', 'enteredSolid', 'leftRoom', 'removedEarly', 'pressed']) agg[k] += r[k];
    agg.examples.push(...r.examples.slice(0, Math.max(0, 5 - agg.examples.length)));
  }
  const ps = await page.evaluate(() => ({ rescues: __game.rescueLog.length }));
  console.log('randomThrows', JSON.stringify(agg), JSON.stringify(ps));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
