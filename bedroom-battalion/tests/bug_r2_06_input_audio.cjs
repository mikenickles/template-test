// Round 2 checks 1 (console during heavy firing, with real audio start and with audio unavailable) and
// 7 (real input through page.mouse and page.keyboard: left and right mouse, wheel, R, G, 1 to 5).
const path = require('path');
const { launch } = require('./harness.cjs');

const S = (page) => page.evaluate(() => { const s = __game.state(); return { phase: s.phase, t: s.time, w: s.weapon, shots: __game.shotLog.length, lastShot: __game.shotLog[__game.shotLog.length - 1] || null, live: __game.grenades.length, lock: !!document.pointerLockElement, sounds: __game.audioLog.length }; });
const wait = (page, ms) => page.waitForTimeout(ms);

async function realInput() {
  const { browser, page, errors } = await launch({ width: 800, height: 450 });
  const out = {};
  // nothing fires from the title screen, and the click that starts the game does not fire a shot
  await page.mouse.down(); await wait(page, 100); await page.mouse.up(); await wait(page, 400);
  out.afterStartClick = await S(page);
  await page.evaluate(() => { __game.teleport(60, 0, 100, 0, 0); __game.shotLog.length = 0; __game.audioLog.length = 0; });
  // left mouse held: rifle automatic fire
  await page.mouse.down(); await wait(page, 1200); await page.mouse.up(); await wait(page, 200);
  let s = await S(page); out.leftHeldRifle = { shots: s.shots, mag: s.w.mag, weapon: s.lastShot && s.lastShot.weapon };
  const n0 = s.shots; await wait(page, 400); out.stopsOnRelease = (await S(page)).shots === n0;
  // R reloads
  await page.keyboard.press('KeyR'); await wait(page, 300); s = await S(page); out.R = { reloading: s.w.reloading }; await wait(page, 2600); s = await S(page); out.R.after = { mag: s.w.mag, reserve: s.w.reserve };
  // digits
  out.digits = {};
  for (const [key, want] of [['Digit2', 'pistol'], ['Digit1', 'rifle'], ['Digit4', 'smg'], ['Digit2', 'pistol'], ['Digit1', 'smg'], ['Digit5', 'sniper'], ['Digit3', 'rifle'], ['Digit6', 'rifle'], ['Digit0', 'rifle']]) { await page.keyboard.press(key); await wait(page, 120); const w = (await S(page)).w.name; out.digits[key + '>' + want] = w === want ? 'ok' : 'GOT ' + w; }
  // wheel: each notch toggles primary / pistol; spam must not break anything
  const seq = []; for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, i % 2 ? -100 : 100); await wait(page, 120); seq.push((await S(page)).w.name); }
  out.wheel = seq.join(' > ');
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 100);
  await wait(page, 700); s = await S(page); out.wheelSpam60 = { weapon: s.w.name, drawing: s.w.drawing };
  // left click single shots with the pistol
  await page.keyboard.press('Digit2'); await wait(page, 500); const p0 = (await S(page)).shots;
  for (let i = 0; i < 3; i++) { await page.mouse.down(); await wait(page, 60); await page.mouse.up(); await wait(page, 300); }
  s = await S(page); out.pistolThreeClicks = { shots: s.shots - p0, weapon: s.lastShot.weapon };
  await page.mouse.down(); await wait(page, 800); await page.mouse.up(); out.pistolHeldIsOneShot = (await S(page)).shots - s.shots;
  // right mouse: scope with the sniper only
  await page.mouse.down({ button: 'right' }); await wait(page, 500); out.rightMousePistol = { scoped: (await S(page)).w.scoped }; await page.mouse.up({ button: 'right' });
  await page.keyboard.press('Digit5'); await wait(page, 900);
  await page.mouse.down({ button: 'right' }); await wait(page, 500); s = await S(page); out.rightMouseSniper = { scoped: s.w.scoped, fov: s.w.fov, scopeOverlay: await page.evaluate(() => getComputedStyle(document.getElementById('scope')).display), crosshair: await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).display) };
  // scoped mouse sensitivity scales with fov: same synthetic mouse move scoped and unscoped
  const yawOf = () => page.evaluate(() => __game.state().player.yaw);
  let y0 = await yawOf(); await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0 }))); let y1 = await yawOf(); out.scopedYawPer100px = +(y0 - y1).toFixed(4);
  const before = (await S(page)).shots; await page.mouse.down(); await wait(page, 80); await page.mouse.up(); await wait(page, 300); s = await S(page); out.sniperShotScoped = { fired: s.shots - before, scopedRightAfter: s.w.scoped };
  await wait(page, 700); out.scopeBackAfterBolt = (await S(page)).w.scoped;
  await page.mouse.up({ button: 'right' }); await wait(page, 400); s = await S(page); out.rightMouseReleased = { scoped: s.w.scoped, fov: s.w.fov };
  y0 = await yawOf(); await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0 }))); y1 = await yawOf(); out.unscopedYawPer100px = +(y0 - y1).toFixed(4);
  // middle mouse does nothing
  const mb = (await S(page)).shots; await page.mouse.down({ button: 'middle' }); await wait(page, 200); await page.mouse.up({ button: 'middle' }); out.middleMouseShots = (await S(page)).shots - mb;
  // G: hold shows the arc (not checked here), release throws; second G does nothing
  await page.keyboard.down('KeyG'); await wait(page, 500); s = await S(page); out.G_held = { grenades: s.w.grenades, live: s.live, crosshair: await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).display) };
  await page.keyboard.up('KeyG'); await wait(page, 200); s = await S(page); out.G_released = { grenades: s.w.grenades, live: s.live };
  await page.keyboard.down('KeyG'); await wait(page, 200); await page.keyboard.up('KeyG'); await wait(page, 200); out.G_again = { live: (await S(page)).live };
  await wait(page, 2300); out.G_afterFuse = { live: (await S(page)).live, sounds: await page.evaluate(() => __game.audioLog.map((a) => a.name).filter((n) => /grenade/.test(n))) };
  // G key auto-repeat while held (keydown repeats) must not throw early
  await page.evaluate(() => __game.give('grenade')); for (let i = 0; i < 8; i++) { await page.keyboard.down('KeyG'); await wait(page, 50); } out.G_repeatWhileHeld = { live: (await S(page)).live }; await page.keyboard.up('KeyG'); await wait(page, 2400);
  // Esc while firing: pause, fire key cleared; resume click does not fire
  await page.keyboard.press('Digit3'); await wait(page, 700); await page.evaluate(() => __game.give('ammo'));
  await page.mouse.down(); await wait(page, 400); await page.keyboard.press('Escape'); await wait(page, 500); s = await S(page); const ps = s.shots; await wait(page, 400);
  out.escWhileFiring = { phase: s.phase, shotsWhilePaused: (await S(page)).shots - ps }; await page.mouse.up();
  await page.mouse.click(400, 225); await wait(page, 600); s = await S(page); out.resumeClick = { phase: s.phase, shotsFromResumeClick: s.shots - ps, lock: s.lock };
  // heavy firing in real time with rendering: every weapon, 6 s, plus grenades
  for (const k of ['Digit3', 'Digit4', 'Digit2', 'Digit5']) { await page.evaluate(() => { __game.give('ammo'); __game.give('grenade'); }); await page.keyboard.press(k); await wait(page, 800); await page.mouse.down(); await wait(page, 1500); await page.keyboard.press('KeyG'); await page.mouse.up(); for (let i = 0; i < 8; i++) { await page.mouse.down(); await wait(page, 40); await page.mouse.up(); await wait(page, 60); } await page.keyboard.press('KeyR'); await wait(page, 300); }
  await wait(page, 2500);
  out.heavy = { shots: (await S(page)).shots, sounds: await page.evaluate(() => [...new Set(__game.audioLog.map((a) => a.name))].sort().join(',')) };
  out.hud = await page.evaluate(() => ({ name: document.getElementById('wname').textContent, mag: document.getElementById('mag').textContent, res: document.getElementById('res').textContent, ammoBox: document.getElementById('ammo').textContent }));
  // a look at the bed for carry-over 6
  await page.keyboard.press('Escape'); await wait(page, 200);
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.clearInput(); __game.teleport(52, 0, 96, Math.PI / 2 + 0.2, 0.35); __game.step(0.1); __game.render(); });
  const f = path.resolve(__dirname, '..', 'screenshots', 'round2', 'bug_r2_bed_from_floor.png'); require('fs').mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f });
  out.errors = errors.slice();
  await browser.close();
  return out;
}

// audio variants: what window.AudioContext looks like to the page
const VARIANTS = {
  'AudioContext missing': () => { delete window.AudioContext; delete window.webkitAudioContext; Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true }); Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true }); },
  'AudioContext constructor throws': () => { window.AudioContext = function () { throw new Error('no audio device'); }; window.webkitAudioContext = undefined; },
  'context stays suspended, resume rejects': () => { const AC = window.AudioContext; window.AudioContext = function () { const c = new AC(); Object.defineProperty(c, 'state', { get: () => 'suspended' }); c.resume = () => Promise.reject(new Error('NotAllowedError')); return c; }; },
  'createGain throws once running': () => { const AC = window.AudioContext; window.AudioContext = function () { const c = new AC(); let n = 0; const g = c.createGain.bind(c); c.createGain = () => { if (n++ > 0) throw new Error('boom'); return g(); }; return c; }; },
  'createBuffer throws': () => { const AC = window.AudioContext; window.AudioContext = function () { const c = new AC(); c.createBuffer = () => { throw new Error('boom'); }; return c; }; },
  'normal audio': () => {}
};
async function audioVariant(name, init) {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.addInitScript(init);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.mouse.click(320, 180); await wait(page, 300);                    // real gesture: this is where audio starts
  await page.mouse.down(); await wait(page, 700); await page.mouse.up();
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyG'); await page.keyboard.press('Digit2'); await wait(page, 400);
  for (let i = 0; i < 4; i++) { await page.mouse.down(); await wait(page, 50); await page.mouse.up(); await wait(page, 200); }
  // then a lot of firing through the hook with rendering in between
  const r = await page.evaluate(async () => {
    const G = __game; G.setTimeScale(0); let shots = 0;
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) for (let k = 0; k < 3; k++) { G.give('ammo'); G.give('grenade'); G.selectWeapon(w); G.step(1); G.setInput({ fire: true, forward: true }); for (let i = 0; i < 120; i++) { G.setInput({ fire: i % 3 !== 0, jump: i % 40 === 0 }); G.step(1 / 60); } G.clearInput(); G.throwGrenade(0.1); G.reload(); G.step(0.3); G.render(); await new Promise((r) => setTimeout(r, 30)); }
    G.step(3);
    return { shotLog: G.shotLog.length, audioLog: G.audioLog.length, kinds: [...new Set(G.audioLog.map((a) => a.name))].length, phase: G.state().phase };
  });
  await wait(page, 500);
  const res = { name, ...r, errors: errors.slice() };
  await browser.close();
  return res;
}

(async () => {
  const out = await realInput();
  for (const k in out) console.log(k + ': ' + JSON.stringify(out[k]));
  console.log('--- audio variants (real click to start, real mouse fire, then heavy hook firing) ---');
  for (const name in VARIANTS) console.log(JSON.stringify(await audioVariant(name, VARIANTS[name])));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
