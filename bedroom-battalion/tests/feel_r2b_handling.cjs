// Round 2 re-check (copy of feel_r2_handling.cjs, extras at the end): recoil, spread, crosshair, and movement interplay timings, all from the hook with fixed stepping.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state(), out = {}, DEG = 180 / Math.PI;
    const ready = (w, o = {}) => { G.clearInput(); G.give('ammo'); G.teleport(20, 0, 10, Math.PI, 0); G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(1); G.selectWeapon(w); G.step(1.2); G.look(Math.PI, 0); if (o.crouch) { G.setInput({ crouch: true }); G.step(0.4); } };
    const nShots = () => G.shotLog.length ? G.shotLog[G.shotLog.length - 1].time : -1;
    const gap = () => { const t = document.getElementById('crosshair').children; return parseFloat(t[1].style.top); };
    // ---- recoil and bloom over a magazine, no correction
    out.recoil = {};
    for (const w of ['rifle', 'smg', 'pistol', 'sniper']) {
      const W = G.CONFIG.weapons[w]; ready(w);
      const p0 = st().player.pitch, y0 = st().player.yaw; let last = nShots(), n = 0, tick = 0, peak = 0; const per = [], spr = [], gaps = [];
      const limit = Math.round((W.mag * W.interval + 1) * 60);
      while (n < W.mag && tick < limit) { G.setInput({ fire: W.auto ? true : tick % 2 === 0 }); G.step(T); tick++; const s = st(); const e = G.shotLog[G.shotLog.length - 1];
        if (e && e.time !== last) { last = e.time; n++; per.push(+((s.player.pitch - p0) * DEG).toFixed(2)); spr.push(e.spread); }
        peak = Math.max(peak, (s.player.pitch - p0) * DEG); if (n === 1 && gaps.length === 0) { G.render(); gaps.push(gap()); } }
      G.clearInput(); const endP = (st().player.pitch - p0) * DEG, endY = (st().player.yaw - y0) * DEG; const dur = tick * T;
      let rec = 0, tr = 0; while (tr < 300 && st().weapon.spread > W.spread + 0.01) { G.step(T); tr++; } rec = tr * T; G.step(0.5);
      out.recoil[w] = { shots: n, magDumpSeconds: +dur.toFixed(2), aimClimbAfterShots_1_3_5_10_last: [per[0], per[2], per[4], per[9], per[per.length - 1]], aimAtEndOfMag: +endP.toFixed(1), sideDrift: +endY.toFixed(2),
        aimAfterRest: +((st().player.pitch - p0) * DEG).toFixed(1), spreadAtShots_1_3_5_10_last: [spr[0], spr[2], spr[4], spr[9], spr[spr.length - 1]], spreadBackToBaseAfter: +rec.toFixed(2) };
      // single tap: kick, then where the aim settles
      ready(w); const q0 = st().player.pitch; G.setInput({ fire: true }); G.step(T); G.setInput({ fire: false }); const k1 = (st().player.pitch - q0) * DEG; G.step(0.5);
      out.recoil[w].singleTap = { kick: +k1.toFixed(2), settlesAt: +((st().player.pitch - q0) * DEG).toFixed(2) };
      // 3-round burst then settle
      if (W.auto) { ready(w); const b0 = st().player.pitch; let l2 = nShots(), c = 0, tk = 0; while (c < 3 && tk < 60) { G.setInput({ fire: true }); G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.time !== l2) { l2 = e.time; c++; } } G.clearInput(); const pk = (st().player.pitch - b0) * DEG; G.step(0.5); out.recoil[w].burst3 = { peak: +pk.toFixed(2), settlesAt: +((st().player.pitch - b0) * DEG).toFixed(2) }; }
    }
    // ---- crosshair gap (px at 720p) against the real spread radius in px, per stance, at rest
    out.crosshair = {};
    for (const w of ['rifle', 'smg', 'pistol', 'sniper']) { ready(w); G.render(); const s = st().weapon; const px = Math.tan(s.spread / DEG) / Math.tan(s.fov / 2 / DEG) * innerHeight / 2;
      const row = { standGapPx: gap(), standSpreadPx: +px.toFixed(1) };
      G.setInput({ crouch: true }); G.step(0.4); G.render(); row.crouchGapPx = gap(); G.clearInput(); G.setInput({ left: true }); G.step(0.4); G.render(); row.moveGapPx = gap(); G.clearInput();
      G.setInput({ jump: true }); G.step(0.2); G.render(); row.airGapPx = gap(); G.clearInput(); G.step(1);
      // bloom at full: dump 10 shots and read
      let tk = 0; while (tk < 110) { G.setInput({ fire: G.CONFIG.weapons[w].auto ? true : tk % 2 === 0 }); G.step(T); tk++; } G.render(); row.after1_8sFiringGapPx = gap(); G.clearInput(); out.crosshair[w] = row; }
    // do shots really land inside the gap? 300 rifle shots at rest (tapped, fully recovered), angle off the aim direction from the hit point on the north wall
    { ready('rifle'); G.teleport(60, 0, 3, 0, 0); G.step(0.3); let maxA = 0, sum = 0, n = 0;       // no: wall too close for accuracy; use ray distance instead
      G.teleport(100, 0, 150, 0, 0); G.step(0.3);
      for (let i = 0; i < 300; i++) { G.give('ammo'); G.look(0.9, 0.2); G.step(0.5); const p = st().player; const e = G.fire(); if (!e || e.distance === null) continue;
        const cp = Math.cos(p.pitch), f = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
        // recover direction from the log: not exposed, so compare distance along the aim ray with the wall plane instead -> skip angle, count spread field
        sum += e.spread; n++; maxA = Math.max(maxA, e.spread); }
      out.restSpreadLogged = { n, mean: +(sum / n).toFixed(3), max: maxA }; }
    // ---- interplay timings
    const I = out.interplay = {};
    // sprint to fire: sprinting, then release shift and click on the same tick
    for (const w of ['rifle', 'smg', 'pistol', 'sniper']) { ready(w); G.setInput({ forward: true, sprint: true }); G.step(0.6); const l = nShots(); G.setInput({ fire: true }); G.step(0.3); const blocked = nShots() === l;
      G.setInput({ sprint: false, fire: false }); G.step(T); let tk = 0; G.setInput({ fire: true }); while (tk < 60 && nShots() === l) { G.step(T); tk++; } const e = G.shotLog[G.shotLog.length - 1];
      I['sprintToFire ' + w] = { blockedWhileSprinting: blocked, delayAfterReleasingSprint: +(tk * T).toFixed(3), firstShotSpread: e.spread }; G.clearInput(); }
    // holding fire while still holding sprint: does letting go of forward fire?
    // switch times: press, then hold fire, time to first shot
    for (const [a, b] of [['rifle', 'pistol'], ['pistol', 'rifle'], ['pistol', 'smg'], ['pistol', 'sniper'], ['sniper', 'pistol']]) { ready(a); const l = nShots(); G.selectWeapon(b); let tk = 0; while (tk < 120 && nShots() === l) { G.setInput({ fire: tk % 2 === 0 }); G.step(T); tk++; } I['switch ' + a + '->' + b + ' time to first shot'] = +(tk * T).toFixed(2); G.clearInput(); }
    // reload: time from R to ammo in the magazine, and to next shot; switch cancels
    for (const w of ['rifle', 'smg', 'pistol', 'sniper']) { ready(w); G.fire(); G.step(1.5); G.reload(); let tk = 0; while (tk < 300 && st().weapon.reloading) { G.step(T); tk++; } I['reload ' + w] = +(tk * T).toFixed(2); }
    { ready('rifle'); G.fire(); G.step(0.3); G.reload(); G.step(1.0); G.selectWeapon('pistol'); G.step(0.5); G.selectWeapon('rifle'); G.step(0.6); I.reloadCancelledBySwitch = { mag: st().weapon.mag, reloading: st().weapon.reloading }; }
    { ready('rifle'); const l = nShots(); G.reload(); G.step(0.1); G.reload(); G.fire(); I.fullMagReloadIgnored = !st().weapon.reloading; }
    // empty magazine: hold fire through empty -> auto reload? time from last shot to next shot
    for (const w of ['rifle', 'pistol']) { ready(w); const W = G.CONFIG.weapons[w]; let tk = 0, lastShotTick = 0, l = nShots(), n = 0, resumed = null; const lim = Math.round((W.mag * W.interval + W.reload + 2) * 60);
      while (tk < lim) { G.setInput({ fire: W.auto ? true : tk % 2 === 0 }); G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.time !== l) { l = e.time; n++; if (n === W.mag + 1) { resumed = (tk - lastShotTick) * T; break; } lastShotTick = tk; } }
      I['holdThroughEmpty ' + w + ' gap before firing again'] = resumed === null ? 'never resumed (needs a new press?)' : +resumed.toFixed(2); G.clearInput(); }
    // firing on a string
    { ready('rifle'); G.teleport(107, 0, 52); G.step(T); G.lookAt(107, 1.6, 60); G.setInput({ forward: true }); G.step(1.5); const l = nShots(); G.setInput({ forward: false, fire: true }); G.step(0.5); I.fireOnString = { climbing: st().player.climbing, fired: nShots() !== l }; G.clearInput();
      G.setInput({ jump: true }); G.step(T); G.setInput({ jump: false, fire: true }); G.step(0.2); I.fireRightAfterLettingGo = nShots() !== l; G.clearInput(); G.step(2); }
    // sniper: scope in/out timing, fov, bolt rhythm
    { ready('sniper'); G.setInput({ scope: true }); let tk = 0; while (tk < 60 && !st().weapon.scoped) { G.step(T); tk++; } const S = I.sniper = { scopeIn: +(tk * T).toFixed(2), scopedFov: +st().weapon.fov.toFixed(1), scopedSpread: st().weapon.spread };
      G.render(); S.scopedFovRendered = +st().weapon.fov.toFixed(1);
      const l = nShots(); G.setInput({ fire: true }); G.step(T); G.setInput({ fire: false }); let out1 = 0, back = 0; tk = 0; let wasOut = false, tOut = null, tBack = null;
      while (tk < 120) { G.step(T); tk++; const sc = st().weapon.scope; if (!wasOut && sc < 0.5) { wasOut = true; tOut = tk * T; } if (wasOut && tBack === null && st().weapon.scoped) { tBack = tk * T; } }
      S.afterShot_scopeHalfDroppedAt = tOut; S.afterShot_fullyScopedAgainAt = tBack;
      // next shot possible at: hold fire presses
      let l2 = nShots(); tk = 0; G.give('ammo'); G.step(2); l2 = nShots(); G.setInput({ fire: true }); G.step(T); G.setInput({ fire: false }); const tA = st().time; let next = null; while (tk < 150) { G.setInput({ fire: tk % 2 === 0 }); G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.time > tA + 0.05) { next = e.time - tA; break; } }
      S.boltCycleToNextShot = next && +next.toFixed(2); S.nextShotWasScoped = G.shotLog[G.shotLog.length - 1].spread < 0.1;
      const names = G.audioLog.slice(-6).map((a) => a.name + '@' + (a.time - tA).toFixed(2)); S.audioAroundCycle = names;
      G.clearInput(); G.step(1); G.setInput({ scope: true }); G.step(0.5); G.setInput({ scope: false }); tk = 0; while (tk < 60 && st().weapon.scope > 0.01) { G.step(T); tk++; } S.scopeOut = +(tk * T).toFixed(2);
      S.sensitivityScale = +(25 / 75).toFixed(2); G.clearInput(); }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
