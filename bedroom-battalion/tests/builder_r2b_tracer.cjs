// Round 2 pass 3, item 3: tracer screenshots (rifle, sniper, scoped sniper) and tracer start against the muzzle; also reports
// the fog and gain values in CONFIG.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const info = {};
  for (const [w, scope] of [['rifle', false], ['sniper', false], ['sniper', true]]) {
    info[w + (scope ? '_scoped' : '')] = await page.evaluate(([w, scope]) => {
      const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.clearInput(); g.give('ammo');
      g.teleport(60, 0, 60, 0, 0); g.selectWeapon(w); g.step(1.5); g.look(0, 0.02);
      if (scope) { g.setInput({ scope: true }); g.step(0.4); }
      g.fire(); g.step(1 / 60); g.render(); g.clearInput();
      return { scoped: g.state().weapon.scoped };
    }, [w, scope]);
    await shot(`round2/builder_r2b_tracer_${w}${scope ? '_scoped' : ''}.png`);
    await page.evaluate(() => { __game.setInput({ scope: false }); __game.step(2); });
  }
  info.config = await page.evaluate(() => { const C = __game.CONFIG; return { fog: C.fog, smgDamage: C.weapons.smg.damage, smgGains: C.audio.sounds.shot_smg.map((l) => l.g), sniperGains: C.audio.sounds.shot_sniper.map((l) => l.g).slice(0, 2), sniperTracer: [C.weapons.sniper.tracerWidth, C.weapons.sniper.tracerLife], hideNear: C.grenade.hideNear, flashOpacity: C.grenade.flashOpacity }; });
  console.log(JSON.stringify(info), 'errors', JSON.stringify(errors)); await browser.close();
})();
