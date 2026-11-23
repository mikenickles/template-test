// Check 8: the real controls, with real mouse and keyboard events (page.mouse / page.keyboard), real-time loop.
// Click to start, WASD, arrows, Shift, Space, C, Ctrl, backtick, Esc, click to resume, blur.
const { launch } = require('./harness.cjs');

(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const S = () => page.evaluate(() => { const s = __game.state(), p = s.player; return { phase: s.phase, t: s.time, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), speed: +Math.hypot(p.vx, p.vz).toFixed(2), vx: +p.vx.toFixed(2), vz: +p.vz.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), crouching: p.crouching, onGround: p.onGround }; });
  const ui = () => page.evaluate(() => ({ title: getComputedStyle(document.getElementById('title')).display, go: document.getElementById('titleGo').textContent, debug: getComputedStyle(document.getElementById('debug')).display, lock: !!document.pointerLockElement, focus: document.hasFocus() }));
  const wait = (ms) => page.waitForTimeout(ms);
  const out = {};

  // ---- before starting: keys must do nothing, title is up ----
  out.before = { state: await S(), ui: await ui() };
  await page.keyboard.down('KeyW'); await wait(500); await page.keyboard.up('KeyW');
  out.keysBeforeStart = await S();

  // ---- click to start (real click on the title overlay) ----
  await page.mouse.click(320, 180);
  await wait(300);
  out.afterClick = { state: await S(), ui: await ui(), errors: errors.slice() };

  // helper: hold keys for ms from a known spot, report displacement and peak speed
  const hold = async (keys, ms, opts = {}) => {
    await page.evaluate((o) => { __game.teleport(60, 0, 40, o.yaw === undefined ? 0 : o.yaw, 0); }, opts);
    await wait(120);
    const a = await S();
    for (const k of keys) await page.keyboard.down(k);
    let peak = 0, maxY = 0, crouched = false;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const s = await S(); peak = Math.max(peak, s.speed); maxY = Math.max(maxY, s.y); crouched = crouched || s.crouching; await wait(30); }
    const b = await S();
    for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    await wait(250);
    const c = await S();
    return { keys: keys.join('+'), simSecs: +(b.t - a.t).toFixed(2), dx: +(b.x - a.x).toFixed(2), dz: +(b.z - a.z).toFixed(2), peakSpeed: peak, maxY: +maxY.toFixed(2), crouchedWhileHeld: crouched, afterRelease: { speed: c.speed, crouching: c.crouching } };
  };
  out.keys = [];
  for (const keys of [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['ShiftLeft', 'KeyW'], ['ShiftRight', 'KeyW'], ['ShiftLeft', 'KeyS'], ['KeyW', 'KeyD'],
    ['KeyC'], ['KeyC', 'KeyW'], ['ControlLeft'], ['ControlLeft', 'KeyD'], ['ControlRight', 'KeyA'], ['Space'], ['Space', 'KeyW'], ['KeyW', 'KeyS'], ['KeyA', 'KeyD']]) out.keys.push(await hold(keys, 900));
  // Space held: one jump only, or repeated?
  out.spaceHeld = await (async () => { await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100); await page.keyboard.down('Space'); let jumps = 0, was = true; const t0 = Date.now(); while (Date.now() - t0 < 2500) { const s = await S(); if (was && !s.onGround) jumps++; was = s.onGround; await wait(15); } await page.keyboard.up('Space'); return { jumpsIn2500ms: jumps }; })();
  // keyboard auto-repeat style: many keydown events for the same key without keyup
  out.repeat = await (async () => { await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100); const a = await S(); for (let i = 0; i < 12; i++) { await page.keyboard.down('KeyW'); await wait(40); } await page.keyboard.up('KeyW'); await wait(200); const b = await S(); return { simSecs: +(b.t - a.t).toFixed(2), dz: +(b.z - a.z).toFixed(2), unitsPerSimSec: +((b.z - a.z) / (b.t - a.t - 0.2)).toFixed(2), speedAfterUp: b.speed }; })();

  // ---- backtick: debug overlay toggles (and auto-repeat does not flicker it) ----
  const d0 = await ui();
  await page.keyboard.press('Backquote'); await wait(350); const d1 = await ui(); const dbgText = await page.evaluate(() => document.getElementById('debug').textContent);
  await page.keyboard.press('Backquote'); await wait(150); const d2 = await ui();
  await page.keyboard.down('Backquote'); await page.keyboard.down('Backquote'); await page.keyboard.down('Backquote'); await page.keyboard.up('Backquote'); await wait(150); const d3 = await ui();   // down x3 = 1 press + 2 repeats
  await page.keyboard.press('Backquote'); await wait(100);
  out.backtick = { before: d0.debug, afterPress: d1.debug, text: dbgText, afterSecondPress: d2.debug, afterHeldWithRepeat: d3.debug, final: (await ui()).debug };

  // ---- Esc: pause. Keys held at the time must not stick. Keys do nothing while paused. Click resumes. ----
  await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100);
  await page.keyboard.down('KeyW'); await wait(400);
  await page.keyboard.press('Escape'); await wait(300);
  const p1 = await S(), u1 = await ui();
  await wait(600); const p2 = await S();
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD'); await wait(500); await page.keyboard.up('KeyD'); const p3 = await S();
  await page.keyboard.press('Escape'); await wait(200); const u2 = await ui(), p4 = await S();            // Esc while paused
  await page.keyboard.press('Backquote'); await wait(200); const u2b = await ui(); await page.keyboard.press('Backquote'); await wait(100);
  await page.mouse.click(320, 180); await wait(400);
  const p5 = await S(), u3 = await ui(); await wait(500); const p6 = await S();
  out.esc = { paused: { phase: p1.phase, title: u1.title, text: u1.go }, frozenWhilePaused: p1.t === p2.t && p1.z === p2.z, keysIgnoredWhilePaused: p3.x === p1.x, escWhilePaused: { phase: p4.phase, title: u2.title }, backtickWhilePaused: u2b.debug,
    afterClick: { phase: p5.phase, title: u3.title }, driftAfterResume: +(p6.z - p5.z).toFixed(3), speedAfterResume: p6.speed };
  // W held through pause and resume without releasing: does it need a re-press?
  await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100);
  await page.keyboard.down('KeyW'); await wait(300); await page.keyboard.press('Escape'); await wait(200); await page.mouse.click(320, 180); await wait(600);
  const h1 = await S(); await page.keyboard.up('KeyW'); await wait(100);
  out.heldThroughPause = { phase: h1.phase, speedWithWStillPhysicallyDown: h1.speed };

  // ---- window blur clears held keys ----
  await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100);
  await page.keyboard.down('KeyW'); await wait(300);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(400);
  const bl = await S(); await page.keyboard.up('KeyW');
  out.blur = { speedAfterBlur: bl.speed, phase: bl.phase };

  // ---- mouse look (only possible if headless Chromium granted pointer lock) ----
  const lockNow = await ui();
  await page.evaluate(() => __game.teleport(60, 0, 40, 0, 0)); await wait(100);
  const m0 = await S();
  await page.evaluate(() => { window.__mm = []; document.addEventListener('mousemove', (e) => window.__mm.push([e.movementX, e.movementY])); });
  await page.mouse.move(320, 180); await page.mouse.move(420, 140, { steps: 5 }); await wait(200);
  const m1 = await S();
  const mm = await page.evaluate(() => window.__mm);
  // synthetic mousemove with movementX/Y while locked (what a real mouse produces): +100 px right, -50 px (up)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: -50, bubbles: true })));
  const m2 = await S();
  // extreme mouse movement: pitch must clamp, yaw must wrap
  await page.evaluate(() => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: -100000, bubbles: true })); });
  const m3 = await S();
  await page.evaluate(() => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: 123456, movementY: 100000, bubbles: true })); });
  const m4 = await S();
  out.mouse = { pointerLocked: lockNow.lock, playwrightMoveEvents: mm, yawBefore: m0.yaw, yawAfterPlaywrightMove: m1.yaw, afterSynthetic100right50up: { yaw: m2.yaw, pitch: m2.pitch, expectYaw: +(-100 * 0.0022).toFixed(3), expectPitch: +(50 * 0.0022).toFixed(3) }, pitchAfterHugeUp: m3.pitch, afterHugeDownAndSpin: { yaw: m4.yaw, pitch: m4.pitch } };
  // mouse must not turn the view while paused
  await page.keyboard.press('Escape'); await wait(200);
  const q0 = await S();
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 300, movementY: 0, bubbles: true })));
  const q1 = await S();
  out.mouseWhilePaused = { phase: q1.phase, yawChanged: q0.yaw !== q1.yaw, lock: (await ui()).lock };
  await page.mouse.click(320, 180); await wait(300);
  // right click must not open a context menu on the canvas (default prevented)
  out.contextmenuPrevented = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('view').dispatchEvent(e); return e.defaultPrevented; });
  // default actions prevented for game keys (Space scroll, Ctrl combos where the page can)
  out.preventDefault = await page.evaluate(() => { const r = {}; for (const code of ['Space', 'KeyW', 'ArrowDown', 'ControlLeft', 'KeyC', 'Tab', 'F5']) { const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }); window.dispatchEvent(e); r[code] = e.defaultPrevented; window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); } return r; });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
