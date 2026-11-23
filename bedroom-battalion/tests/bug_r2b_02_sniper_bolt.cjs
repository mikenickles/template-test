// Round 2 re-check: BUGS R2-2 (switching skips the sniper bolt) and DESIGN 15.6 "the bolt timer belongs to the weapon".
// Fire the sniper, switch away and back by every route at several delays, then press fire every other tick and record
// when the next shot comes. Expected next shot = max(first + 1.3 s, back + 0.7 s draw) (one tick of slack).
// Routes: hook selectWeapon, keys 2/1, keys 3/5, wheel (real, pointer locked), grenade throw, mid-reload switch.
// Also: scope state after switching mid-bolt. The sim is stepped with setTimeScale(0); real key and wheel events are
// delivered between steps. All loops tick-limited.
const { launch } = require('./harness.cjs');

(async () => {
  const { browser, page, errors } = await launch({ width: 800, height: 450 });
  // real click to start, so pointer lock exists and the wheel works
  await page.mouse.click(400, 225); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const G = __game; G.setTimeScale(0);
    window.B = {
      DT: 1 / 60,
      prep() { G.clearInput(); G.give('ammo'); G.give('health'); G.give('grenade'); G.teleport(60, 0, 100, 0, 0); G.selectWeapon('pistol'); G.step(0.5); G.selectWeapon('sniper'); G.step(1.5); G.shotLog.length = 0; },
      t() { return G.state().time; },
      // press fire every other tick until a sniper shot or max ticks; returns the shot time or null
      untilShot(max = 400) { const n = G.shotLog.length; for (let i = 0; i < max; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(this.DT); if (G.shotLog.length > n) { G.setInput({ fire: false }); const e = G.shotLog[G.shotLog.length - 1]; return { time: e.time, weapon: e.weapon, now: G.state().time }; } } G.setInput({ fire: false }); return null; },
      fireNow() { const e = G.fire(); return e ? G.state().time : null; },
    };
  });
  const ev = (f, a) => page.evaluate(f, a);
  const step = (s) => ev((s) => __game.step(s), s);
  const W = () => ev(() => __game.state().weapon);
  const rows = [];
  const DRAW = 0.7, BOLT = 1.3, TICK = 2 / 60 + 1e-6;   // two ticks of slack: the first shot's time is read after fire(), the next from shotLog

  async function trial(route, delay, away = 0.05) {
    await ev(() => B.prep());
    const t0 = await ev(() => { const e = __game.fire(); return e ? __game.state().time : null; });
    if (t0 === null) { rows.push({ route, delay, error: 'first shot refused' }); return; }
    await step(delay);
    let tBack;
    if (route === 'hook selectWeapon pistol > sniper') { await ev(() => __game.selectWeapon('pistol')); await step(away); await ev(() => __game.selectWeapon('sniper')); }
    else if (route === 'keys 2 > 1 (primary sniper)') { await page.keyboard.press('Digit2'); await step(away); await page.keyboard.press('Digit1'); }
    else if (route === 'keys 3 > 5 (rifle > sniper)') { await page.keyboard.press('Digit3'); await step(away); await page.keyboard.press('Digit5'); }
    else if (route === 'keys 5 again (same weapon)') { await page.keyboard.press('Digit5'); }
    else if (route === 'control: no switch') { /* nothing */ }
    else if (route === 'wheel two notches') { await page.mouse.wheel(0, 100); await step(away); await page.mouse.wheel(0, 100); }
    else if (route === 'grenade hold+throw') { await ev((a) => { __game.setInput({ grenade: true }); __game.step(Math.max(a, 0.05)); __game.setInput({ grenade: false }); }, away); }
    else if (route === 'G key real hold+throw') { await page.keyboard.down('KeyG'); await step(Math.max(away, 0.05)); await page.keyboard.up('KeyG'); }
    tBack = await ev(() => __game.state().time);
    const name = (await W()).name;
    const s = await ev(() => B.untilShot());
    const expect = Math.max(t0 + BOLT, tBack + (route.startsWith('grenade') || route.startsWith('G key') || route.includes('same weapon') || route.startsWith('control') ? 0 : DRAW));
    const gap = s ? +(s.time - t0).toFixed(3) : null;
    rows.push({ route, delay, away, weaponAfter: name, gapSeconds: gap, expectAtLeast: +(expect - t0).toFixed(3), ok: s ? s.time + TICK >= expect && s.weapon === 'sniper' : false });
    await ev(() => __game.step(2.5));
  }
  await page.keyboard.press('Digit5');           // primary = sniper for the 2 > 1 route
  for (const route of ['control: no switch', 'hook selectWeapon pistol > sniper', 'keys 2 > 1 (primary sniper)', 'keys 3 > 5 (rifle > sniper)', 'keys 5 again (same weapon)', 'wheel two notches', 'grenade hold+throw', 'G key real hold+throw']) {
    for (const delay of [0, 1 / 60, 0.1, 0.3, 0.55, 0.9, 1.25, 1.6]) {
      if (route === 'keys 3 > 5 (rifle > sniper)') await page.keyboard.press('Digit5');
      await trial(route, delay);
      if (route === 'keys 3 > 5 (rifle > sniper)') await page.keyboard.press('Digit5');
    }
    if (!route.includes('same') && !route.startsWith('control')) for (const away of [0.5, 1.0, 2.0]) await trial(route, 0.1, away);
  }
  // rapid back-and-forth: 20 switches in 0.4 s after the shot
  await ev(() => B.prep());
  const rapid = await ev(() => { const G = __game, t0 = (G.fire(), G.state().time); for (let i = 0; i < 20; i++) { G.selectWeapon(i % 2 ? 'sniper' : 'pistol'); G.step(1 / 60); } if (G.state().weapon.name !== 'sniper') G.selectWeapon('sniper'); const s = B.untilShot(); return { gap: s ? +(s.time - t0).toFixed(3) : null }; });
  rows.push({ route: '20 switches in 0.33 s', gapSeconds: rapid.gap, expectAtLeast: 1.3, ok: rapid.gap !== null && rapid.gap + TICK >= 1.3 });
  await step(2.5);

  // mid-reload: 4 in the magazine, fire (3 left), R during the bolt, switch away mid-reload, back, next shot
  const midReload = await ev(() => {
    const G = __game, out = [];
    for (const [rAt, swAt, away] of [[0.2, 0.8, 0.1], [0.2, 2.0, 0.1], [1.5, 2.5, 0.5], [0.1, 0.3, 2.0]]) {
      B.prep(); G.fire(); G.step(0.2); const t0 = G.shotLog[G.shotLog.length - 1].time;
      G.step(rAt - 0.2 > 0 ? rAt - 0.2 : 0); G.reload(); G.step(1 / 60); const reloading = G.state().weapon.reloading;
      G.step(swAt - rAt); const magBefore = G.state().weapon.mag; G.selectWeapon('pistol'); G.step(away); G.selectWeapon('sniper'); const tBack = G.state().time;
      const w = G.state().weapon; const s = B.untilShot();
      out.push({ reloadAt: rAt, switchAt: swAt, away, reloadStarted: reloading, magAtSwitch: magBefore, afterBack: { mag: w.mag, reloading: w.reloading }, gap: s ? +(s.time - t0).toFixed(3) : null, expectAtLeast: +Math.max(1.3, tBack - t0 + 0.7).toFixed(3) });
      G.step(3.5);
    }
    return out;
  });
  // scope state after switching mid-bolt: scope held through the whole thing
  const scope = await ev(() => {
    const G = __game, out = {};
    B.prep(); G.setInput({ scope: true }); G.step(0.4); out.scopedBefore = G.state().weapon.scoped; G.fire(); G.step(0.2); out.afterShot = G.state().weapon.scoped;
    G.selectWeapon('pistol'); G.step(1 / 60); out.pistolOut = { name: G.state().weapon.name, scoped: G.state().weapon.scoped, scope: G.state().weapon.scope };
    G.step(0.3); G.selectWeapon('sniper'); G.step(1 / 60); out.backTick1 = { scoped: G.state().weapon.scoped, drawing: G.state().weapon.drawing };
    const tr = []; for (let i = 0; i < 120; i++) { G.step(1 / 60); const w = G.state().weapon; if (i % 10 === 0) tr.push([i, w.scoped ? 1 : 0, +w.scope.toFixed(2), w.drawing ? 'd' : '']); }
    out.trace = tr; G.render(); out.fovAfterRender = G.state().weapon.fov;
    G.clearInput(); G.step(0.3); G.render(); out.released = { scoped: G.state().weapon.scoped, fov: G.state().weapon.fov };
    // scope held while pistol out: never scoped
    G.selectWeapon('pistol'); G.setInput({ scope: true }); G.step(1); G.render(); out.pistolScopeHeld = { scoped: G.state().weapon.scoped, fov: G.state().weapon.fov };
    G.clearInput();
    return out;
  });
  for (const r of rows) console.log((r.ok ? 'ok ' : '!! ') + JSON.stringify(r));
  console.log('MID-RELOAD'); for (const r of midReload) console.log('   ', (r.gap !== null && r.gap + 2 / 60 >= r.expectAtLeast ? 'ok ' : '!! ') + JSON.stringify(r));
  console.log('SCOPE after mid-bolt switch', JSON.stringify(scope));
  console.log(`summary: ${rows.filter((r) => r.ok).length}/${rows.length} switch trials respect the bolt`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
