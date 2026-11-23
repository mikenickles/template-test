// Round 2 effects from frame sequences: impacts per surface, tracer, casings, muzzle flash, decals (cap, z-fighting),
// kill chips, grenade arc and burst. Strips are composed in the page from the WebGL canvas (no DOM HUD).
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');

(async () => {
  const h = await open({ width: 1280, height: 720, probe: true });
  const p = h.page;
  // strip(ticks, crop): steps the sim to each tick count (cumulative) and pastes the cropped frame side by side
  const strip = async (file, setup, ticks, crop) => {
    const url = await p.evaluate(([setup, ticks, crop]) => {
      const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = (crop[2] + 4) * ticks.length; o.height = crop[3];
      const g = o.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      (0, eval)(setup);
      let at = 0;
      ticks.forEach((t, i) => { if (t > at) { __game.step((t - at) / 60); at = t; } __game.render(); g.drawImage(c, crop[0], crop[1], crop[2], crop[3], i * (crop[2] + 4), 0, crop[2], crop[3]); });
      return o.toDataURL('image/png');
    }, [setup, ticks, crop]);
    fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));
  };
  const place = (eye, aim, weapon = 'pistol') => p.evaluate(([e, a, w]) => { __game.clearView(); __game.clearInput(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(e[0], e[1], e[2], 0, 0); __game.step(1.2); __game.teleport(e[0], e[1], e[2], 0, 0); __game.lookAt(a[0], a[1], a[2]);
    const s = __game.state().player, f = [a[0] - s.x, a[1] - (s.y + 1.6), a[2] - s.z]; return __game.raycast([s.x, s.y + 1.6, s.z], f); }, [eye, aim, weapon]);

  const SURF = {
    wood:    [[90, 0, 20], [90, 0, 23.6]],
    fabric:  [[39.5, 0, 90], [35, 7, 90]],
    plastic: [[55, 0, 20.5], [55, 0.6, 24.5]],
    book:    [[34, 0, 130], [30, 2, 130]],
    card:    [[69.6, 0, 90.5], [72.6, 1.6, 90.5]],
    metal:   [[110, 26.4, 74], [112.2, 28, 74]],
  };
  const CROP = [440, 230, 400, 260];
  const saved = await p.evaluate(() => JSON.stringify({ w: __game.CONFIG.weapons.pistol, g: __game.CONFIG.gun.flashFrames, t: __game.CONFIG.fx.tracerLife }));
  for (const [name, [eye, aim]] of Object.entries(SURF)) {
    const rc = await place(eye, aim);
    await strip(`visual_fx_impact_${name}.png`, '__game.fire()', [0, 1, 3, 6, 12, 24, 48], CROP);
    // measurement: same shot with kick, shake, flash and tracer switched off IN THE TEST so only particles and the decal change the frame
    await place(eye, [aim[0] + (eye[0] === aim[0] ? 0.6 : 0), aim[1] + 0.0, aim[2] + (eye[2] === aim[2] ? 0.6 : 0)]);
    const m = await p.evaluate((crop) => {
      const C = __game.CONFIG, W = C.weapons.pistol, keep = { kickUp: W.kickUp, kickSide: W.kickSide, shake: W.shake, vmKick: W.vmKick, ff: C.gun.flashFrames, tl: C.fx.tracerLife };
      W.kickUp = W.kickSide = W.shake = W.vmKick = 0; C.gun.flashFrames = 0; C.fx.tracerLife = 1e-6;
      const gl = document.getElementById('view').getContext('webgl2'), H = gl.drawingBufferHeight, n = crop[2] * crop[3];
      const read = () => { __game.render(); const b = new Uint8Array(n * 4); gl.readPixels(crop[0], H - crop[1] - crop[3], crop[2], crop[3], gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      const pre = read(); __game.fire(); const out = [];
      let at = 0;
      for (const t of [2, 5, 10, 20, 90]) {
        __game.step((t - at) / 60); at = t; const b = read(); let cnt = 0; const sp = [0, 0, 0], sb = [0, 0, 0];
        for (let i = 0; i < n; i++) { const k = i * 4; if (Math.max(Math.abs(b[k] - pre[k]), Math.abs(b[k + 1] - pre[k + 1]), Math.abs(b[k + 2] - pre[k + 2])) > 10) { cnt++; for (let c = 0; c < 3; c++) { sp[c] += b[k + c]; sb[c] += pre[k + c]; } } }
        out.push({ t, px: cnt, fx: cnt ? sp.map((v) => Math.round(v / cnt)) : null, bg: cnt ? sb.map((v) => Math.round(v / cnt)) : null });
      }
      W.kickUp = keep.kickUp; W.kickSide = keep.kickSide; W.shake = keep.shake; W.vmKick = keep.vmKick; C.gun.flashFrames = keep.ff; C.fx.tracerLife = keep.tl;
      return out;
    }, CROP);
    console.log(name.padEnd(8), 'hit', rc && rc.id, rc && rc.surface, rc && +rc.distance.toFixed(1) + 'u', '|', m.map((r) => 't' + r.t + ': ' + r.px + 'px' + (r.px ? ' ' + hex(r.fx) + ' on ' + hex(r.bg) + ' dE ' + dE(r.fx, r.bg) : '')).join(' | '));
  }
  console.log('config restored', (await p.evaluate(() => JSON.stringify({ w: __game.CONFIG.weapons.pistol, g: __game.CONFIG.gun.flashFrames, t: __game.CONFIG.fx.tracerLife }))) === saved);

  // ---- muzzle flash, tracer, casings: full-auto rifle, full frame lower right, tick by tick ----
  await place([60, 0, 20], [60, 1.6, 80], 'rifle');
  await strip('visual_fx_rifle_auto.png', '__game.setInput({fire:true})', [1, 2, 3, 4, 5, 6, 7], [560, 300, 720, 420]);
  await p.evaluate(() => { __game.clearInput(); __game.step(2); });
  // flash persistence: the flash counter is decremented per rendered frame, not per sim tick
  const fl = await p.evaluate(() => { __game.give('ammo'); __game.fire(); const vs = window.__three.scenes.find((s) => s.children.some((c) => c.material && c.material.blending === 2 && !c.isInstancedMesh));
    const flash = vs.children.find((c) => c.material && c.material.blending === 2); const seq = []; for (let i = 0; i < 4; i++) { __game.render(); seq.push(flash.visible); } return seq; });
  console.log('flash visible on successive renders after one shot (no sim ticks in between):', JSON.stringify(fl));
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    await place([60, 0, 20], [60, 1.6, 80], w);
    await p.evaluate(() => { __game.fire(); });
    await h.grab(`visual_fx_flash_${w}.png`, [640, 300, 640, 420]);
    await p.evaluate(() => __game.step(2));
  }
  // tracer seen from the side: fire along +z from (60,0,40), camera cannot move, so look at a long shot and at a 3 unit shot
  await place([20, 0, 150], [20, 1.6, 20], 'rifle');
  await strip('visual_fx_tracer_long.png', '__game.fire()', [0, 1, 2, 3, 4, 5, 6], [440, 200, 400, 320]);
  // casings on the floor: after 30 rounds, look down to the right
  await place([90, 0, 20], [90, 1.6, 60], 'rifle');
  const cas = await p.evaluate(() => { __game.setInput({ fire: true }); __game.step(1); const inst = window.__three.scenes[0].children.find((c) => c.isInstancedMesh && c.count === 192 + 24 + 64 + 4);
    const live = (from, n) => { let k = 0; for (let i = from; i < from + n; i++) { const a = inst.instanceMatrix.array, o = i * 16; if (Math.hypot(a[o], a[o + 1], a[o + 2]) > 1e-6) k++; } return k; };
    const during = { casings: live(192, 24), particles: live(0, 192), decals: live(216, 64) };
    __game.clearInput(); __game.step(0.5); const half = live(192, 24); __game.step(1.5); const after = live(192, 24); return { during, casingsAfter0_5s: half, casingsAfter2s: after }; });
  console.log('rifle 1 s full auto at the floor line:', JSON.stringify(cas));
  await p.evaluate(() => { __game.give('ammo'); __game.setInput({ fire: true }); __game.step(0.6); __game.clearInput(); __game.step(0.5); __game.look(Math.PI + 0.6, -1.0); });
  await h.grab('visual_fx_casings_floor.png');

  // ---- decals: 100 pistol shots over a wall patch; count live decals; jitter test near and far ----
  const dec = await p.evaluate(() => {
    __game.clearInput(); __game.selectWeapon('pistol'); __game.teleport(80, 0, 6, 0, 0); __game.step(1);
    const inst = window.__three.scenes[0].children.find((c) => c.isInstancedMesh && c.count === 284);
    const live = () => { let k = 0; for (let i = 216; i < 280; i++) { const a = inst.instanceMatrix.array, o = i * 16; if (Math.hypot(a[o], a[o + 1], a[o + 2]) > 1e-6) k++; } return k; };
    const counts = [];
    for (let i = 0; i < 100; i++) { __game.give('ammo'); __game.lookAt(74 + (i % 10) * 1.2, 0.8 + Math.floor(i / 10) * 0.5, 0); __game.fire(); __game.step(0.3); if (i === 9 || i === 63 || i === 64 || i === 99) counts.push([i + 1, live()]); }
    __game.step(1);
    return { counts, shotsLogged: __game.shotLog.length, lastHit: __game.shotLog[__game.shotLog.length - 1].hit };
  });
  console.log('decals live after N wall shots [N, live]:', JSON.stringify(dec));
  const jit = async (eye, tg) => p.evaluate(([e, t]) => {
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const grab = (ex) => { __game.teleport(ex[0], ex[1] - 1.6, ex[2]); __game.lookAt(t[0], t[1], t[2]); __game.CONFIG.viewmodel.pos[1] -= 0; __game.render(); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const A = grab(e), B = grab([e[0] + 0.004, e[1] + 0.003, e[2] + 0.004]); let strong = 0, dark = 0;
    for (let i = 0; i < W * H; i++) { const k = i * 4; if (Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2])) > 48) strong++; if (A[k] < 70 && A[k + 1] < 65 && A[k + 2] < 60) dark++; }
    return { strongChanged: strong, decalDarkPx: dark };
  }, [eye, tg]);
  for (const d of [4, 12, 30, 60]) console.log('decal jitter from', d, 'units:', JSON.stringify(await jit([80, 3, d], [80, 3, 0])));
  await h.cam([80, 3, 7], [80, 3, 0]); await h.grab('visual_fx_decals_wall_7u.png', [240, 110, 800, 500]);
  await h.cam([80, 1.6, 1.2], [86, 1.6, 0]); await h.grab('visual_fx_decals_grazing.png', [240, 110, 800, 500]);

  // ---- kill chips and tip-over: sniper head shot on the Green dummy at (60,0,50) from 9 units ----
  await p.evaluate(() => __game.resetTargets());
  await place([60, 0, 41], [60, 1.6, 50], 'sniper');
  await strip('visual_fx_kill.png', '__game.fire()', [0, 2, 5, 9, 15, 30, 60], [440, 180, 400, 320]);
  const up = await p.evaluate(() => { const t = () => __game.state().targets[1]; const a = t().down; __game.step(2.2); const b = t().down; __game.step(1); return [a, b, t().down, t().hp]; });
  console.log('dummy down after kill / at 3.2 s / at 4.2 s, hp:', JSON.stringify(up));

  // ---- grenade: arc preview, flight, burst ----
  await place([60, 0, 30], [60, 2.2, 50], 'rifle');
  await p.evaluate(() => { __game.give('grenade'); __game.resetTargets(); });
  await strip('visual_fx_grenade.png', '__game.setInput({grenade:true})', [20, 21, 50, 90, 139, 141, 142, 146, 155, 175], [340, 160, 600, 400]);
  // the strip holds the key for 20 ticks then needs a release: do it as a second pass with exact control
  await p.evaluate(() => { __game.clearInput(); __game.step(4); __game.give('grenade'); __game.resetTargets(); __game.teleport(60, 0, 30, 0, 0); __game.lookAt(60, 2.2, 50); __game.step(0.2); });
  await strip('visual_fx_grenade_aim.png', '__game.setInput({grenade:true})', [20], [240, 110, 800, 500]);
  await strip('visual_fx_grenade_flight_burst.png', '__game.clearInput()', [1, 30, 60, 100, 119, 121, 122, 126, 135, 155], [440, 200, 400, 300]);
  const gl = await p.evaluate(() => ({ live: __game.grenades.length, last: __game.shotLog.slice(-3).map((e) => [e.weapon, e.hit, e.damage]), health: __game.state().player.health }));
  console.log('after burst:', JSON.stringify(gl));
  // arc against pale background and behind cover
  await p.evaluate(() => { __game.give('grenade'); __game.teleport(60, 0, 100, 0, 0); __game.look(0, 0.5); __game.setInput({ grenade: true }); __game.step(0.2); });
  await h.grab('visual_fx_arc_pale.png', [240, 60, 800, 500]);
  const arcPx = await p.evaluate(() => { __game.render(); const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
    let n = 0; for (let i = 0; i < W * H; i++) { const k = i * 4; if (b[k] > 225 && b[k + 1] > 180 && b[k + 1] < 235 && b[k + 2] < 120) n++; } return n; });
  console.log('arc preview yellow pixels in frame:', arcPx);
  await p.evaluate(() => { __game.clearInput(); __game.step(3); });
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
