// Round 2 re-check: things the first pass flagged or the fix list added. Hook only, fixed stepping.
// held through empty (rifle, smg), R during a draw, sniper bolt across switches, scoped spread by stance, scope fov.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state(), out = {};
    const lastT = () => (G.shotLog.length ? G.shotLog[G.shotLog.length - 1].time : -1);
    const ready = (w) => { G.clearInput(); G.give('ammo'); G.teleport(20, 0, 10, Math.PI, 0); G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(1); G.selectWeapon(w); G.step(1.2); G.look(Math.PI, 0); };
    // 1. hold fire through an empty magazine on the automatics: sound sequence and when firing resumes
    for (const w of ['rifle', 'smg']) { ready(w); const W = G.CONFIG.weapons[w]; const t0 = st().time; let tk = 0, n = 0, l = lastT(), lastShot = null, resumed = null;
      const lim = Math.round((W.mag * W.interval + W.reload + 2) * 60);
      G.setInput({ fire: true });
      while (tk < lim) { G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.time !== l) { l = e.time; n++; if (n === W.mag + 1) { resumed = +(e.time - lastShot).toFixed(3); break; } lastShot = e.time; } }
      G.clearInput();
      const ev = G.audioLog.filter((a) => a.time > lastShot - 0.01 && a.time <= lastShot + W.reload + 0.5).map((a) => a.name + '@' + (a.time - lastShot).toFixed(3));
      out['heldThroughEmpty ' + w] = { lastShotToNextShot: resumed, reload: W.reload, soundsAfterLastShot: ev.join(' '), dryClicks: ev.filter((s) => s.startsWith('dry')).length };
    }
    // and with the pistol: holding fire after empty (semi) - a new press is needed (expected)
    // 2. R during a draw: empty-ish rifle, switch, press R mid-draw
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { ready(w); for (let i = 0; i < 3; i++) { G.fire(); G.step(1.4); }
      G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(1); const t0 = st().time; G.selectWeapon(w); G.step(0.1); G.reload(); const drawing = st().weapon.drawing;
      let tk = 0; while (tk < 120 && !st().weapon.reloading) { G.step(T); tk++; } const startAt = +(st().time - t0).toFixed(3);
      let tk2 = 0; while (tk2 < 400 && st().weapon.reloading) { G.step(T); tk2++; }
      out['R during draw ' + w] = { drawTime: G.CONFIG.weapons[w].draw, pressedAt: 0.1, stillDrawingWhenPressed: drawing, reloadStartedAt: tk < 120 ? startAt : 'never', magAfter: st().weapon.mag };
    }
    // also via setInput({reload}) if the key exists
    // 3. sniper bolt across switches: shoot, switch to pistol at once, back, try to fire as early as possible
    for (const sw of [0.05, 0.3, 0.6, 0.9]) { ready('sniper'); G.fire(); const tA = lastT(); G.step(T); G.selectWeapon('pistol'); G.step(sw); G.selectWeapon('sniper');
      let tk = 0, next = null; while (tk < 240) { G.setInput({ fire: tk % 2 === 0 }); G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.weapon === 'sniper' && e.time > tA + 0.01) { next = +(e.time - tA).toFixed(3); break; } }
      G.clearInput(); out['sniper shot -> pistol for ' + sw + ' s -> sniper: next sniper shot after'] = next; }
    { ready('sniper'); G.fire(); const tA = lastT(); let tk = 0, next = null; while (tk < 240) { G.setInput({ fire: tk % 2 === 0 }); G.step(T); tk++; const e = G.shotLog[G.shotLog.length - 1]; if (e.time > tA + 0.01) { next = +(e.time - tA).toFixed(3); break; } } G.clearInput(); out['sniper shot, no switch: next shot after'] = next; }
    // 4. scoped spread: still, crouched, walking, strafing, airborne; read from state while scoped
    { const S = out.scopedSpread = {}; ready('sniper'); G.setInput({ scope: true }); G.step(0.4); S.still = st().weapon.spread; S.fovScoped = +st().weapon.fov.toFixed(2);
      G.setInput({ scope: true, crouch: true }); G.step(0.4); S.crouched = st().weapon.spread; G.setInput({ scope: true, crouch: true, left: true }); G.step(0.3); S.crouchMoving = st().weapon.spread;
      G.setInput({ scope: true }); G.step(0.4); G.setInput({ scope: true, forward: true }); G.step(0.3); S.walking = st().weapon.spread; S.scopedWhileWalking = st().weapon.scoped;
      G.setInput({ scope: true, forward: false }); let k = 0; while (k++ < 30 && Math.hypot(st().player.vx, st().player.vz) > 0.5) G.step(T); S.ticksToStillAfterRelease = k; S.afterStop = st().weapon.spread;
      G.setInput({ scope: true, jump: true }); G.step(0.15); S.airborne = st().weapon.spread; S.scopedInAir = st().weapon.scoped; G.clearInput(); G.step(1);
      // real shots: 40 scoped shots each at a wall-sized target to sample logged spread
      const samp = (inp) => { const v = []; for (let i = 0; i < 6; i++) { G.give('ammo'); G.setInput(Object.assign({ scope: true }, inp)); G.step(1.4); G.fire(); const e = G.shotLog[G.shotLog.length - 1]; v.push(e.spread); } G.clearInput(); G.step(0.5); return v; };
      S.loggedStill = samp({}); S.loggedStrafe = samp({ left: true });
    }
    // 5. scope sensitivity is not exposed; fov ratio reported
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
