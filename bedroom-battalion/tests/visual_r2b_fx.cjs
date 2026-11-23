// Round 2 re-check effects: grenade burst seen from 14 and 40 units (changed-pixel extent per tick vs the projected
// 7 unit radius), arc preview on pale and dark backgrounds, the throw tick; impacts on their own surfaces (dE of the
// particles from the pixels they cover, with kick, shake, flash and tracer switched off in the test only); muzzle
// flash per gun by sim tick; SMG vs pistol viewmodel. Canvas only (no DOM HUD).
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720, probe: true });
  const p = h.page;
  await p.evaluate(() => {
    window.__read = (crop) => { const gl = document.getElementById('view').getContext('webgl2'), H = gl.drawingBufferHeight, b = new Uint8Array(crop[2] * crop[3] * 4); gl.readPixels(crop[0], H - crop[1] - crop[3], crop[2], crop[3], gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    window.__diff = (A, B, w, hh, thr) => { let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const sp = [0, 0, 0], sb = [0, 0, 0];
      for (let i = 0; i < w * hh; i++) { const k = i * 4; if (Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2])) > thr) { n++; const x = i % w, y = hh - 1 - ((i / w) | 0); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); for (let c = 0; c < 3; c++) { sp[c] += B[k + c]; sb[c] += A[k + c]; } } }
      return { n, box: n ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null, fx: n ? sp.map((v) => Math.round(v / n)) : null, bg: n ? sb.map((v) => Math.round(v / n)) : null }; };
    window.__strip = (frames, crop, scale) => { const o = document.createElement('canvas'), w = crop[2] * scale, hh = crop[3] * scale; o.width = (w + 4) * frames.length; o.height = hh; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      frames.forEach((f, i) => g.drawImage(f, crop[0], crop[1], crop[2], crop[3], i * (w + 4), 0, w, hh)); return o.toDataURL('image/png'); };
    window.__copy = () => { const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; };
  });
  const save = (file, url) => fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));

  // ---------- grenade burst from 14 and 40 units ----------
  for (const D of [14, 40]) {
    const r = await p.evaluate((D) => {
      __game.clearInput(); __game.resetTargets(); __game.give('grenade'); __game.give('health'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 56, 0, 0); __game.step(0.6); __game.look(0, -0.15);
      __game.throwGrenade(0.2); let k = 0; while (__game.grenades.length && __game.grenades[0].fuse > 0.35 && k++ < 200) __game.step(1 / 60);
      const g = __game.grenades[0]; if (!g) return { err: 'no grenade' }; const gp = [g.x, g.y, g.z];
      let eye = null; for (let a = 0; a < 24 && !eye; a++) { const az = a * Math.PI / 12, e = [gp[0] + Math.sin(az) * D, 1.6, gp[2] + Math.cos(az) * D]; if (e[0] < 2 || e[0] > 118 || e[2] < 2 || e[2] > 158) continue;
        const dv = [gp[0] - e[0], gp[1] + 0.5 - e[1], gp[2] - e[2]], L = Math.hypot(...dv), rc = __game.raycast(e, dv), up = __game.raycast([e[0], 0.5, e[2]], [0, 1, 0]); if ((!rc || rc.distance > L - 0.5) && (!up || up.distance > 1.5)) eye = e; }
      if (!eye) return { err: 'no clear eye' }; __game.teleport(eye[0], 0, eye[2], 0, 0); __game.lookAt(gp[0], gp[1] + 1.2, gp[2]); __game.step(0); __game.render();
      const crop = [0, 0, 1280, 720], pre = window.__read(crop), frames = [], rows = [], labels = [];
      const s = __game.state().player, dist = Math.hypot(gp[0] - s.x, gp[1] - s.y - 1.6, gp[2] - s.z), f = 360 / Math.tan(__game.CONFIG.camera.fovVertical * Math.PI / 360), rPx = Math.round(7 * f / dist);
      let burst = -1;
      for (let i = 0; i < 60 && (burst < 0 || i <= burst + 20); i++) { __game.step(1 / 60); if (burst < 0 && !__game.grenades.length) burst = i; if (burst < 0) continue;
        __game.lookAt(gp[0], gp[1] + 1.2, gp[2]); __game.render(); const t = i - burst; const d = window.__diff(pre, window.__read(crop), 1280, 720, 20);
        rows.push([t, d.n, d.box]); if ([0, 1, 3, 5, 8, 12, 18].includes(t)) { frames.push(window.__copy()); labels.push(t); } }
      const half = Math.min(360, Math.round(rPx * 1.5)), cw = Math.min(1280, half * 2 * 1.33 | 0);
      return { D, dist: +dist.toFixed(1), rPx, gp, rows, labels, url: window.__strip(frames, [640 - cw / 2 | 0, 340 - half, cw, half * 2], D >= 40 ? 1 : 0.5), shake: null };
    }, D);
    if (r.err) { console.log('burst', D, r.err); continue; }
    save(`visual_re_burst_${D}u.png`, r.url);
    console.log(`burst from ${r.dist} u at ${JSON.stringify(r.gp.map((v) => +v.toFixed(1)))}: 7u radius projects to ${r.rPx} px; ticks [t, changed px, box x,y,w,h]:`, JSON.stringify(r.rows.slice(0, 22)), 'strip ticks', r.labels);
  }
  // ---------- throw tick, full frame ----------
  const th = await p.evaluate(() => {
    __game.clearInput(); __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 30, 0, 0); __game.step(0.6); __game.lookAt(60, 2.2, 50);
    __game.setInput({ grenade: true }); __game.step(0.3); __game.render(); const crop = [0, 0, 1280, 720]; const aim = window.__read(crop), frames = [window.__copy()], rows = [];
    __game.clearInput();
    for (let i = 1; i <= 6; i++) { __game.step(1 / 60); __game.render(); const b = window.__read(crop); let red = 0; for (let k = 0; k < b.length; k += 4) if (b[k] > 150 && b[k + 1] < 90 && b[k + 2] < 90) red++; rows.push([i, red, __game.grenades.length ? +Math.hypot(__game.grenades[0].x - 60, __game.grenades[0].y - 1.6, __game.grenades[0].z - 30).toFixed(2) : null]); if (i <= 3 || i === 6) frames.push(window.__copy()); }
    __game.step(3); return { rows, url: window.__strip(frames, [0, 0, 1280, 720], 0.25) };
  });
  save('visual_re_throw_ticks.png', th.url); console.log('throw ticks [tick, red px (grenade colour), grenade distance from eye]:', JSON.stringify(th.rows));
  // ---------- arc preview: pale wall, dark floor under the bed, and the blue blanket ----------
  for (const [name, eye, aim] of [['pale', [60, 0, 100], [60, 9, 159]], ['dark', [24, 0, 75], [24, 0.2, 60]], ['bedwall', [30, 18, 60], [0, 20, 60]]]) {
    const r = await p.evaluate(([eye, aim]) => {
      __game.clearInput(); __game.give('grenade'); __game.teleport(eye[0], eye[1], eye[2], 0, 0); __game.step(0.4); __game.lookAt(aim[0], aim[1], aim[2]);
      __game.render(); const crop = [0, 0, 1280, 720], pre = window.__read(crop); __game.setInput({ grenade: true }); __game.step(0.3); __game.lookAt(aim[0], aim[1], aim[2]); __game.render();
      const b = window.__read(crop), f = window.__copy(); let n = 0; const sa = [0, 0, 0], sb = [0, 0, 0]; const isArc = (a, k) => a[k] > 200 && a[k + 1] > 160 && a[k + 2] < 110;
      for (let k = 0; k < b.length; k += 4) if (isArc(b, k) && !isArc(pre, k)) { n++; for (let c = 0; c < 3; c++) { sa[c] += b[k + c]; sb[c] += pre[k + c]; } }
      const d = { n, box: null, fx: n ? sa.map((v) => Math.round(v / n)) : null, bg: n ? sb.map((v) => Math.round(v / n)) : null }; __game.clearInput(); __game.step(3);
      return { d, url: window.__strip([f], [240, 60, 800, 600], 1) };
    }, [eye, aim]);
    save(`visual_re_arc_${name}.png`, r.url);
    console.log('arc', name, 'changed px', r.d.n, 'box', JSON.stringify(r.d.box), 'mean arc', r.d.fx && hex(r.d.fx), 'on', r.d.bg && hex(r.d.bg), 'dE', r.d.fx && dE(r.d.fx, r.d.bg));
  }

  // ---------- impacts on their own surfaces ----------
  const SURF = {
    wood_floor:   [[90, 0, 20], [90, 0, 23.6]],
    fabric_side:  [[39.5, 0, 90], [35, 7, 90]],
    fabric_blanket: [[22, 18, 66], [22, 18, 70]],
    plastic_fort: [[55, 0, 20.5], [55, 0.6, 24.5]],
    book_stairs:  [[34, 0, 130], [30, 2, 130]],
    card_tunnel:  [[69.6, 0, 90.5], [72.6, 1.6, 90.5]],
    metal_mug:    [[110, 26.4, 74], [112.2, 28, 74]],
  };
  const CROP = [490, 260, 300, 200];
  const frames = [];
  for (const [name, [eye, aim]] of Object.entries(SURF)) {
    const r = await p.evaluate(([e, a, crop]) => {
      __game.clearView(); __game.clearInput(); __game.give('ammo'); __game.selectWeapon('pistol'); __game.teleport(e[0], e[1], e[2], 0, 0); __game.step(1.2); __game.teleport(e[0], e[1], e[2], 0, 0); __game.lookAt(a[0], a[1], a[2]);
      const s = __game.state().player, rc = __game.raycast([s.x, s.y + 1.6, s.z], [a[0] - s.x, a[1] - s.y - 1.6, a[2] - s.z]);
      const C = __game.CONFIG, W = C.weapons.pistol, keep = { kickUp: W.kickUp, kickSide: W.kickSide, shake: W.shake, vmKick: W.vmKick, ft: C.gun.flashTime, tl: C.fx.tracerLife, ds: C.fx.decalSize };
      W.kickUp = W.kickSide = W.shake = W.vmKick = 0; C.gun.flashTime = 0; C.fx.tracerLife = 1e-6; C.fx.decalSize = 1e-4;     // test only: leave just the particles
      __game.render(); const pre = window.__read(crop); __game.fire(); const out = []; let at = 0, best = null;
      for (const t of [2, 4, 8, 14, 24]) { __game.step((t - at) / 60); at = t; __game.render(); const d = window.__diff(pre, window.__read(crop), crop[2], crop[3], 10); out.push([t, d.n, d.fx, d.bg]); if (t === 4) best = window.__copy(); }
      Object.assign(W, { kickUp: keep.kickUp, kickSide: keep.kickSide, shake: keep.shake, vmKick: keep.vmKick }); C.gun.flashTime = keep.ft; C.fx.tracerLife = keep.tl; C.fx.decalSize = keep.ds;
      window.__imp = (window.__imp || []).concat([best]);
      return { hit: rc && rc.id, surface: rc && rc.surface, dist: rc && +rc.distance.toFixed(1), out };
    }, [eye, aim, CROP]);
    console.log(name.padEnd(15), 'hit', r.hit, r.surface, r.dist + 'u', '|', r.out.map((x) => 't' + x[0] + ' ' + x[1] + 'px' + (x[1] ? ' ' + hex(x[2]) + ' on ' + hex(x[3]) + ' dE ' + dE(x[2], x[3]) : '')).join(' | '));
  }
  save('visual_re_impacts.png', await p.evaluate((crop) => window.__strip(window.__imp, crop, 1), CROP));
  console.log('impact strip order:', Object.keys(SURF).join(', '), '(tick 4, decal and flash off)');

  // ---------- muzzle flash by sim tick, per gun ----------
  const fl = [];
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    const r = await p.evaluate((w) => {
      __game.clearInput(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.5); __game.look(Math.PI, 0);
      const vs = window.__three.scenes.slice().sort((a, b) => a.children.length - b.children.length)[0];      // the viewmodel scene
      let flash = null; vs.traverse((o) => { if (o.isMesh && o.material.blending === 2) flash = o; });
      __game.fire(); const vis = [], frames = []; const renders = []; for (let i = 0; i < 3; i++) { __game.render(); renders.push(flash.visible); }
      for (let t = 0; t <= 5; t++) { if (t) __game.step(1 / 60); __game.render(); vis.push(flash.visible); if (t <= 1) frames.push(window.__copy()); }
      __game.step(2);
      return { w, vis, renders, parent: flash.parent && flash.parent.type, url: window.__strip(frames, [640, 300, 640, 420], 0.5) };
    }, w);
    fl.push(r); console.log('flash', w, 'visible on sim ticks 0..5:', JSON.stringify(r.vis), '| 3 renders with no tick:', JSON.stringify(r.renders), '| parent', r.parent);
  }
  // rebuild a 4-gun flash strip at tick 0
  const url = await p.evaluate(() => { const frames = [];
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { __game.clearInput(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.5); __game.look(Math.PI, 0); __game.fire(); __game.render(); frames.push(window.__copy()); __game.step(2); }
    return window.__strip(frames, [640, 300, 640, 420], 0.6); });
  save('visual_re_flash.png', url);
  // ---------- SMG vs pistol vs rifle viewmodel, idle ----------
  const vmUrl = await p.evaluate(() => { const frames = [];
    for (const w of ['smg', 'pistol', 'rifle', 'sniper']) { __game.clearInput(); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.5); __game.look(Math.PI, 0); __game.render(); frames.push(window.__copy()); }
    return window.__strip(frames, [640, 300, 640, 420], 0.6); });
  save('visual_re_viewmodels.png', vmUrl);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
