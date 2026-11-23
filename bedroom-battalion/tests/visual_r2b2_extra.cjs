// Round 2 re-check 2: first rendered frame (nothing stray from the load-time shader compile), shader programs at load
// vs after the first shot / aim / burst, first-burst frame time vs later ones, tracers per gun (start at the muzzle),
// the scoped sniper tracer seen end-on, the new desk skirt panel, and a contact sheet of the nine named views.
// Software renderer: milliseconds are relative only.
const fs = require('fs'); const path = require('path');
const { launch } = require('./harness.cjs');
const { glProbe } = require('./visual_lib.cjs');
const { captureThree, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');
const save = (file, url) => fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));
(async () => {
  const h = await launch({ width: 1280, height: 720 });
  const p = h.page;
  await p.addInitScript(glProbe); await p.addInitScript(captureThree); await p.reload();
  await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await p.evaluate(() => {
    window.__progs = () => window.__three.renderer.info.programs.length;
    window.__timed = () => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return +(performance.now() - a).toFixed(1); };
    window.__copy = () => { const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; };
    window.__strip = (frames, crop, scale) => { const o = document.createElement('canvas'), w = crop[2] * scale, hh = crop[3] * scale; o.width = (w + 4) * frames.length; o.height = hh; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      frames.forEach((f, i) => g.drawImage(f, crop[0], crop[1], crop[2], crop[3], i * (w + 4), 0, w, hh)); return o.toDataURL('image/png'); };
    window.__read = (crop) => { const gl = document.getElementById('view').getContext('webgl2'), H = gl.drawingBufferHeight, b = new Uint8Array(crop[2] * crop[3] * 4); gl.readPixels(crop[0], H - crop[1] - crop[3], crop[2], crop[3], gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  });
  // ---- first frame: the title screen as the page drew it, before start (canvas only), and what is visible ----
  const first = await p.evaluate(() => { const vis = []; window.__three.scenes.forEach((s, si) => s.traverse((o) => { if ((o.isMesh || o.isLine) && o.visible) vis.push(si + ':' + o.type + (o.isInstancedMesh ? '(' + o.count + ')' : '') + ':' + o.material.type + (o.material.blending === 2 ? ':additive' : '')); }));
    const c = document.getElementById('view'); return { progsAtLoad: window.__progs(), visible: vis, url: (__game.render(), c.toDataURL('image/png')) }; });
  save('visual_re2_first_frame.png', first.url);
  console.log('programs at load', first.progsAtLoad, '| visible meshes:', JSON.stringify(first.visible));
  // ---- programs timeline ----
  const tl = await p.evaluate(() => {
    const out = { load: window.__progs() }; __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.step(1); __game.render(); out.started = window.__progs();
    __game.selectWeapon('rifle'); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); __game.lookAt(52, 1, 24.5); __game.render(); const pre = window.__timed();
    __game.fire(); const shotMs = window.__timed(); out.firstShot = window.__progs(); out.firstShotMs = shotMs; out.preShotMs = pre;
    for (const w of ['smg', 'sniper', 'pistol']) { __game.selectWeapon(w); __game.step(1); __game.fire(); __game.render(); } out.allGuns = window.__progs();
    __game.step(1); __game.selectWeapon('rifle'); __game.step(1); __game.give('grenade'); __game.teleport(60, 0, 30, 0, 0); __game.lookAt(60, 1, 44); __game.step(0.5); window.__timed(); const preAim = window.__timed();
    __game.setInput({ grenade: true }); __game.step(0.2); out.firstAimMs = window.__timed(); out.preAimMs = preAim; out.firstAim = window.__progs(); __game.clearInput();
    const bursts = [];
    for (let b = 0; b < 4; b++) {
      if (b) { __game.give('grenade'); __game.teleport(60, 0, 30, 0, 0); __game.lookAt(60, 1, 44); __game.step(0.5); __game.setInput({ grenade: true }); __game.step(0.2); __game.clearInput(); }
      let at = -1, rows = [];
      for (let i = 0; i < 200 && (at < 0 || i < at + 8); i++) { __game.step(1 / 60); if (__game.grenades.length) { const g = __game.grenades[0]; __game.lookAt(g.x, g.y + 0.3, g.z); }
        const ms = window.__timed(); if (at < 0 && !__game.grenades.length && i > 2) at = i; if (at >= 0) rows.push(ms); else if (i % 10 === 0) rows.length = 0; }
      bursts.push({ burst: b + 1, burstTickMs: rows[0], next: rows.slice(1, 6), programs: window.__progs() });
      __game.step(1);
    }
    out.bursts = bursts; return out;
  });
  console.log('programs', JSON.stringify({ load: tl.load, started: tl.started, firstShot: tl.firstShot, allGuns: tl.allGuns, firstAim: tl.firstAim }), '| ms pre-shot / first shot', tl.preShotMs, tl.firstShotMs, '| pre-aim / first aim', tl.preAimMs, tl.firstAimMs);
  for (const b of tl.bursts) console.log(' burst', JSON.stringify(b));
  // ---- tracers per gun: frame on the shot tick, lower-right quadrant; tracer start vs projected muzzle ----
  const tr = await p.evaluate(() => { const frames = [], rows = [];
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
      __game.clearInput(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.5); __game.look(Math.PI, 0.02);
      __game.fire(); __game.render(); frames.push(window.__copy());
      const add = window.__three.scenes[0].children.find((c) => c.isInstancedMesh && c.material.blending === 2), m = add.matrix.clone(), pos = m.elements.slice(0, 3);
      let live = 0, life = 0; for (let t = 0; t < 30; t++) { __game.step(1 / 60); let any = false; for (let i = 0; i < add.count; i++) { add.getMatrixAt(i, m); if (m.elements[13] > -40 && Math.hypot(m.elements[0], m.elements[1], m.elements[2]) > 1e-6) any = true; } if (any) life = t + 1; }
      rows.push([w, 'visible ticks after the shot tick', life]); __game.step(1);
    }
    return { rows, url: window.__strip(frames, [640, 300, 640, 420], 0.6) }; });
  save('visual_re2_tracers.png', tr.url); console.log('tracers', JSON.stringify(tr.rows));
  // ---- scoped sniper: tracer end-on. Shots at the wall 40 and 120 units away; changed pixels at the centre per tick ----
  for (const D of [8, 40, 120]) {
    const r = await p.evaluate((D) => {
      __game.clearInput(); __game.resetTargets(); __game.give('ammo'); __game.selectWeapon('sniper'); __game.teleport(20, 0, 159 - D - 0.4, 0, 0); __game.step(1); __game.look(Math.PI, 0.03); __game.setInput({ scope: true }); __game.step(0.4); __game.look(Math.PI, 0.03);
      const s = __game.state().player, rc = __game.raycast([s.x, s.y + 1.6, s.z], [0, Math.tan(0.03), 1]);
      const crop = [540, 260, 200, 200]; __game.render(); const pre = window.__read(crop); const frames = [window.__copy()], rows = [];
      const W = __game.CONFIG.weapons.sniper, keep = [W.kickUp, W.kickSide, W.shake]; W.kickUp = W.kickSide = W.shake = 0;      // test only: keep the view still so only the tracer changes
      __game.fire();
      for (let t = 0; t <= 14; t++) { if (t) __game.step(1 / 60); __game.render(); const b = window.__read(crop); let n = 0, x0 = 999, x1 = -1, y0 = 999, y1 = -1, bright = 0;
        for (let i = 0; i < 200 * 200; i++) { const k = i * 4; if (Math.max(Math.abs(b[k] - pre[k]), Math.abs(b[k + 1] - pre[k + 1]), Math.abs(b[k + 2] - pre[k + 2])) > 25) { n++; const x = i % 200, y = 199 - (i / 200 | 0); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (b[k] + b[k + 1] + b[k + 2] > 690) bright++; } }
        rows.push([t, n, n ? [x0 + crop[0] - 640, y0 + crop[1] - 360, x1 - x0 + 1, y1 - y0 + 1] : null, bright]); if (t === 0 || t === 3 || t === 8) frames.push(window.__copy()); }
      [W.kickUp, W.kickSide, W.shake] = keep; __game.clearInput(); __game.step(2);
      return { D, hit: rc && rc.id, dist: rc && +rc.distance.toFixed(1), rows, url: window.__strip(frames, [440, 160, 400, 400], 1) };
    }, D);
    if (D === 40) save('visual_re2_scope_tracer.png', r.url);
    console.log(`scoped sniper tracer, wall at ${r.dist} u (${r.hit}): [tick, changed px near centre, box relative to centre x,y,w,h, near-white px]`, JSON.stringify(r.rows.filter((x, i) => i < 4 || i % 3 === 0)));
  }
  // ---- desk skirt panel ----
  const sk = await p.evaluate(() => { __game.setInput({}); __game.clearInput(); const c = __game.colliders.filter((c) => /desk\.(skirt|apron)/.test(c.id)).map((c) => [c.id, c.x0, c.x1, c.z0, c.z1, c.y0, c.y1, c.surface]);
    const frames = []; const px = (fx, fy) => { const gl = document.getElementById('view').getContext('webgl2'), b = new Uint8Array(4); gl.readPixels(Math.round(1280 * fx), Math.round(720 * (1 - fy)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]]; };
    const shots = [[[88, 20.5, 80], [96, 20.5, 80]], [[91, 18.6, 72], [96.2, 20, 82]], [[84, 22, 62], [95, 20, 72]]]; const cols = [];
    for (const [e, t] of shots) { __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(t[0], t[1], t[2]); __game.render(); frames.push(window.__copy()); cols.push(px(0.5, 0.5)); }
    __game.clearView(); __game.teleport(91, 17, 80); __game.lookAt(97, 26.1, 80); __game.render(); const deskUnder = px(0.5, 0.5);
    return { c, cols, deskUnder, url: window.__strip(frames, [0, 0, 1280, 720], 0.4) }; });
  save('visual_re2_desk_skirt.png', sk.url);
  console.log('skirt colliders', JSON.stringify(sk.c), '| centre colour per view', sk.cols.map(hex).join(' '), '| desk underside', hex(sk.deskUnder), '| desk palette #8FA3B5');
  // ---- named views contact sheet ----
  const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
  const sheet = await p.evaluate((V) => { const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = 3 * 426 + 8; o.height = 3 * 240 + 8; const g = o.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
    V.forEach((v, i) => { __game.setView(v); __game.render(); g.drawImage(c, 0, 0, 1280, 720, (i % 3) * 430, (i / 3 | 0) * 244, 426, 240); }); __game.clearView(); return o.toDataURL('image/png'); }, VIEWS);
  save('visual_re2_views.png', sheet);
  console.log('errors', JSON.stringify(h.errors), 'file', h.fileSizeBytes);
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
