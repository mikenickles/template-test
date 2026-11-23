// Round 2 pass 2, FIXLIST item 4: recoil drift, sniper scope, held-through-empty, R during a draw.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const out = await page.evaluate(() => {
    const g = __game, C = g.CONFIG, D = 180 / Math.PI, r = {};
    g.start({ pointerLock: false }); g.setTimeScale(0);
    const S = () => g.state();
    // ---- recoil drift: pitch change 1 s after the last shot, with recoilReturn now (0.8) and the old 0.6 for comparison ----
    const drift = (ret) => {
      const keep = C.gun.recoilReturn; C.gun.recoilReturn = ret; const o = {};
      g.clearInput(); g.give('ammo'); g.teleport(60, 0, 20, Math.PI, 0); g.selectWeapon('rifle'); g.step(1);
      g.look(Math.PI, 0); g.fire(); g.step(1); o.tap = +(S().player.pitch * D).toFixed(3);
      g.look(Math.PI, 0); for (let i = 0; i < 3; i++) { g.fire(); g.step(0.3); } g.step(1); o.threeTaps = +(S().player.pitch * D).toFixed(3);
      g.give('ammo'); g.step(0.1); g.look(Math.PI, 0); g.setInput({ fire: true }); let k = 0; while (S().weapon.mag > 0 && k < 400) { g.step(1 / 60); k++; }
      o.atLastShot = +(S().player.pitch * D).toFixed(3); g.clearInput(); g.step(1); o.fullMag = +(S().player.pitch * D).toFixed(3);
      C.gun.recoilReturn = keep; return o;
    };
    r.driftDeg = { now_0_8: drift(0.8), old_0_6: drift(0.6) };
    // ---- sniper scope ----
    g.clearInput(); g.give('ammo'); g.teleport(60, 0, 20, Math.PI, 0); g.selectWeapon('sniper'); g.step(1);
    g.setInput({ scope: true }); g.step(0.4); g.render();
    const still = S().weapon; r.sniper = { scopedFov: +still.fov.toFixed(2), still: still.spread };
    g.setInput({ scope: true, crouch: true }); g.step(0.5); r.sniper.crouchedStill = S().weapon.spread;
    g.setInput({ scope: true, forward: true }); g.step(0.5); r.sniper.moving = S().weapon.spread; r.sniper.movingScoped = S().weapon.scoped;
    g.setInput({ scope: true, forward: false }); g.step(0.5); g.setInput({ scope: true, jump: true }); g.step(0.15); r.sniper.airborne = S().weapon.spread; r.sniper.airScoped = S().weapon.scoped; r.sniper.onGround = S().player.onGround;
    g.clearInput(); g.step(1);
    // 200 shots scoped and moving: measured cone
    g.selectWeapon('sniper'); g.step(1); g.setInput({ scope: true }); g.step(0.4);
    // ---- holding fire through an empty magazine ----
    r.holdThroughEmpty = {};
    for (const w of ['rifle', 'smg']) {
      g.clearInput(); g.give('ammo'); g.selectWeapon(w); g.step(1); const a0 = g.audioLog.length ? g.audioLog[g.audioLog.length - 1] : null;
      const t0 = S().time; g.setInput({ fire: true });
      let k = 0, emptyAt = null, reloadAt = null;
      while (k < 8 * 60) { g.step(1 / 60); k++; const W = S().weapon; if (emptyAt === null && W.mag === 0) emptyAt = S().time; if (reloadAt === null && W.reloading) reloadAt = S().time; if (reloadAt !== null && W.mag > 0 && !W.reloading) break; }
      const held = S().weapon; let more = 0; const n0 = g.shotLog.length ? g.shotLog[g.shotLog.length - 1] : null;
      g.step(0.5); const resumed = g.shotLog[g.shotLog.length - 1] !== n0;
      g.clearInput();
      const sounds = g.audioLog.filter((a) => a.time >= t0 - 1e-6).map((a) => a.name), dry = sounds.filter((n) => n === 'dry').length;
      r.holdThroughEmpty[w] = { dryClicks: dry, reloadStartedWhileHeld: reloadAt !== null, secondsEmptyToReload: reloadAt !== null ? +(reloadAt - emptyAt).toFixed(3) : null,
        magAfterReload: held.mag, firingResumedWhileHeld: resumed, reloadSound: sounds.includes('reload_' + w) };
    }
    // no reserve: hold through every magazine until nothing is left, then one click per hold, not one per tick
    g.give('ammo'); g.selectWeapon('rifle'); g.step(1);
    { g.setInput({ fire: true }); let k = 0; while ((S().weapon.mag > 0 || S().weapon.reserve > 0 || S().weapon.reloading) && k < 40 * 60) { g.step(1 / 60); k++; }
      const t0 = S().time; g.step(2); g.clearInput(); g.step(0.2); g.setInput({ fire: true }); g.step(2); g.clearInput();
      r.noReserveHold = { secondsToDrainAll: +(k / 60).toFixed(2), dryClicksInTwoHoldsAfterDrained: g.audioLog.filter((a) => a.time >= t0 - 1e-6 && a.name === 'dry').length };
    }
    // ---- R during a draw ----
    r.reloadDuringDraw = {};
    for (const w of ['rifle', 'pistol', 'sniper']) {
      g.clearInput(); g.give('ammo'); g.selectWeapon(w); g.step(1); for (let i = 0; i < 3; i++) { g.fire(); g.step(1.5); }
      const mag = S().weapon.mag; g.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); g.step(0.6); g.selectWeapon(w); g.step(0.1);
      const drawing = S().weapon.drawing; g.setInput({ reload: true }); g.step(0.1); g.clearInput();
      let k = 0; while (S().weapon.drawing && k < 120) { g.step(1 / 60); k++; }
      g.step(1 / 60); const st = S().weapon;
      r.reloadDuringDraw[w] = { magBefore: mag, wasDrawing: drawing, reloadingAfterDraw: st.reloading };
      g.step(4); r.reloadDuringDraw[w].magAfter = S().weapon.mag;
    }
    // hook reload() during a draw is buffered too
    g.give('ammo'); g.selectWeapon('rifle'); g.step(1); g.fire(); g.step(0.5); g.selectWeapon('pistol'); g.step(0.5); g.selectWeapon('rifle'); const hk = g.reload(); g.step(0.5);
    r.hookReloadDuringDraw = { returned: hk, reloadingAfterDraw: S().weapon.reloading };
    // switching during a buffered draw drops it
    g.give('ammo'); g.selectWeapon('rifle'); g.step(1); g.fire(); g.step(0.5); g.selectWeapon('pistol'); g.step(0.5); g.selectWeapon('rifle'); g.setInput({ reload: true }); g.step(0.05); g.clearInput(); g.selectWeapon('pistol'); g.step(1);
    r.bufferDroppedOnSwitch = { pistolReloading: S().weapon.reloading };
    r.config = { recoilReturn: C.gun.recoilReturn, pistol: [C.weapons.pistol.spread, C.weapons.pistol.bloom, C.weapons.pistol.recoverDelay, C.weapons.pistol.falloff],
      sniper: [C.weapons.sniper.scopeFov, C.weapons.sniper.scopedSpread, C.weapons.sniper.scopedMove, C.weapons.sniper.scopedAir],
      gains: { smg: C.audio.sounds.shot_smg.map((l) => l.g), sniper: C.audio.sounds.shot_sniper.map((l) => l.g), fabric: C.audio.sounds.step_fabric[0].g, book: C.audio.sounds.step_book[0].g, card: C.audio.sounds.step_card[0].g } };
    return r;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
