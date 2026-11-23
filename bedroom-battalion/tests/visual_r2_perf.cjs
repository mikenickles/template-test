// Round 2 budget while firing: WebGL-level draw calls and triangles per pass (idle, full-auto, grenade burst, all
// dummies down), the game's own counters, pooling across 500 shots, and relative frame cost. Software renderer:
// milliseconds are relative only.
const fs = require('fs'); const path = require('path');
const { open } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720, probe: true });
  const p = h.page, out = {};
  out.inventory = await p.evaluate(() => {
    const { renderer, scenes } = window.__three, list = [];
    scenes.forEach((s, si) => s.traverse((o) => { if (o.isMesh || o.isLine || o.isLineSegments) { const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
      list.push({ scene: si, type: o.type, inst: o.isInstancedMesh ? o.count : 0, tris: o.isMesh ? n / 3 * (o.isInstancedMesh ? o.count : 1) : 0, mat: o.material.type, cast: o.castShadow, recv: o.receiveShadow, visible: o.visible, blend: o.material.blending, transparent: o.material.transparent }); }
      if (o.isLight) list.push({ scene: si, light: o.type, intensity: o.intensity, cast: !!o.castShadow, map: o.shadow && o.castShadow ? o.shadow.mapSize.x : 0 }); }));
    return { list, memory: Object.assign({}, renderer.info.memory), programs: renderer.info.programs.length, autoReset: renderer.info.autoReset, tex: window.__gl.tex.filter((t) => t.w > 1).map((t) => [t.fn, t.w, t.h]), colliders: __game.colliders.length, targets: __game.state().targets.length };
  });
  const count = (label) => p.evaluate((label) => { __game.render(); window.__gl.reset(); __game.render(); const P = JSON.parse(JSON.stringify(window.__gl.passes)); const s = __game.state();
    let calls = 0, tris = 0, lines = 0; const per = {}; for (const k in P) { calls += P[k].calls; tris += P[k].tris; lines += P[k].lines; per[k] = P[k].calls + ' calls / ' + P[k].tris + ' tris'; }
    return { label, glCalls: calls, glTris: tris, glLines: lines, per, reportedCalls: s.drawCalls, reportedTris: s.triangles }; }, label);
  const time = (n = 12) => p.evaluate((n) => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); const t = [];
    for (let i = 0; i < n + 2; i++) { const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i > 1) t.push(performance.now() - a); } t.sort((a, b) => a - b); return +t[n >> 1].toFixed(1); }, n);
  const S = [];
  // idle at the Green spawn with the rifle up
  await p.evaluate(() => { __game.clearView(); __game.selectWeapon('rifle'); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); });
  S.push(Object.assign(await count('idle, rifle, Green spawn'), { ms: await time() }));
  for (const v of ['spawn_green', 'bed_top', 'west_lane', 'shelf_top']) { await p.evaluate((v) => __game.setView(v), v); S.push(Object.assign(await count('named view ' + v + ' (no viewmodel)'), { ms: await time() })); }
  await p.evaluate(() => __game.clearView());
  // full-auto SMG into the fort wall from 5 units until casings and decals are at their caps; measure mid-burst
  const fire = await p.evaluate(() => {
    const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4);
    __game.selectWeapon('smg'); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); __game.lookAt(52, 1, 24.5);
    const inst = window.__three.scenes[0].children.find((c) => c.isInstancedMesh && c.count === 284);
    const live = (from, n) => { let k = 0; for (let i = from; i < from + n; i++) { const a = inst.instanceMatrix.array, o = i * 16; if (Math.hypot(a[o], a[o + 1], a[o + 2]) > 1e-6) k++; } return k; };
    __game.setInput({ fire: true });
    let maxCalls = 0, maxTris = 0, tStep = 0, tRender = 0, n = 0, peak = { particles: 0, casings: 0, decals: 0 }, shots0 = __game.shotLog.length;
    for (let i = 0; i < 240; i++) {
      if (i % 60 === 59) { __game.give('ammo'); __game.lookAt(52 + (i % 7) * 0.3, 1 + (i % 5) * 0.2, 24.5); }
      let a = performance.now(); __game.step(1 / 60); tStep += performance.now() - a;
      if (i % 4 === 0) { window.__gl.reset(); a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tRender += performance.now() - a; n++;
        let c = 0, t = 0; for (const k in window.__gl.passes) { c += window.__gl.passes[k].calls; t += window.__gl.passes[k].tris; } maxCalls = Math.max(maxCalls, c); maxTris = Math.max(maxTris, t); }
      peak.particles = Math.max(peak.particles, live(0, 192)); peak.casings = Math.max(peak.casings, live(192, 24)); peak.decals = Math.max(peak.decals, live(216, 64));
    }
    const s = __game.state(); __game.clearInput();
    return { glCallsMax: maxCalls, glTrisMax: maxTris, reportedCalls: s.drawCalls, reportedTris: s.triangles, msRender: +(tRender / n).toFixed(1), msStepPerTick: +(tStep / 240).toFixed(4), peak, caps: { particles: 192, casings: 24, decals: 64 } };
  });
  out.fullAuto = fire;
  await p.evaluate(() => __game.step(3));
  S.push(Object.assign(await count('after the burst, decals at 64, same spot'), { ms: await time() }));
  // grenade burst
  out.grenade = await p.evaluate(() => {
    __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 30, 0, 0); __game.lookAt(60, 1, 40); __game.step(1);
    __game.setInput({ grenade: true }); __game.step(0.2); window.__gl.reset(); __game.render(); let aim = 0, aimLines = 0; for (const k in window.__gl.passes) { aim += window.__gl.passes[k].calls; aimLines += window.__gl.passes[k].lines; }
    __game.clearInput(); __game.step(1 / 60); let maxCalls = 0, maxTris = 0;
    for (let i = 0; i < 150; i++) { __game.step(1 / 60); if (i > 110) { window.__gl.reset(); __game.render(); let c = 0, t = 0; for (const k in window.__gl.passes) { c += window.__gl.passes[k].calls; t += window.__gl.passes[k].tris; } maxCalls = Math.max(maxCalls, c); maxTris = Math.max(maxTris, t); } }
    return { aimingCalls: aim, aimingLineSegs: aimLines, burstCallsMax: maxCalls, burstTrisMax: maxTris };
  });
  // all dummies down: shoot each from 3 units at its own height
  out.allDown = await p.evaluate(() => {
    __game.resetTargets(); __game.selectWeapon('rifle'); __game.step(1); const C = __game.CONFIG; const keepStand = C.target.standTime; C.target.standTime = 600;      // test only: keep them down long enough to count
    for (const T of __game.state().targets) {
      for (const [dx, dz] of [[0, 3], [0, -3], [3, 0], [-3, 0], [2, 2], [-2, -2]]) {
        __game.teleport(T.pos[0] + dx, T.pos[1], T.pos[2] + dz, 0, 0);
        for (let i = 0; i < 6 && !__game.state().targets.find((t) => t.id === T.id).down; i++) { __game.give('ammo'); __game.lookAt(T.pos[0], T.pos[1] + 0.8, T.pos[2]); __game.fire(); __game.step(0.4); }
        if (__game.state().targets.find((t) => t.id === T.id).down) break;
      }
    }
    __game.step(1); const down = __game.state().targets.filter((t) => t.down).length;
    __game.teleport(60, 0, 20, Math.PI, 0); __game.step(0.5); C.target.standTime = keepStand; return { down, of: __game.state().targets.length };
  });
  S.push(Object.assign(await count('all dummies down (' + out.allDown.down + ' of ' + out.allDown.of + '), Green spawn'), { ms: await time() }));
  await p.evaluate(() => { __game.resetTargets(); __game.step(1); });
  out.states = S;
  // cost split at the spawn: viewmodel pass, dummies, fx meshes (toggled in the test only)
  out.split = {};
  out.split.baseline = await time();
  await p.evaluate(() => { window.__vis = []; window.__three.scenes[1].traverse((o) => { if (o.isMesh) { window.__vis.push([o, o.visible]); o.visible = false; } }); __game.CONFIG.viewmodel.__off = 1; });
  for (const [name, pick] of [['dummies hidden', 'c.isInstancedMesh && c.count === 63'], ['fx meshes hidden', 'c.isInstancedMesh && (c.count === 284 || c.count === 24)']]) {
    await p.evaluate((pick) => { const f = new Function('c', 'return ' + pick); window.__hid = window.__three.scenes[0].children.filter(f); window.__hid.forEach((c) => (c.visible = false)); }, pick);
    out.split[name] = await time();
    await p.evaluate(() => window.__hid.forEach((c) => (c.visible = true)));
  }
  // ---- pooling: 500 shots (all four guns, walls, floor and dummies), count everything before and after ----
  out.pool = await p.evaluate(() => {
    const snap = () => { const { renderer, scenes } = window.__three; let objs = 0; scenes.forEach((s) => s.traverse(() => objs++));
      return { sceneObjects: objs, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length, domNodes: document.getElementsByTagName('*').length,
        shotLog: __game.shotLog.length, audioLog: __game.audioLog.length, grenadesLive: __game.grenades.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }; };
    __game.resetTargets(); __game.teleport(60, 0, 40, 0, 0); __game.step(1);
    const before = snap(); let fired = 0, i = 0; const guns = ['rifle', 'smg', 'pistol', 'sniper'];
    const t0 = performance.now();
    while (fired < 500 && i < 4000) { i++;
      if (i % 40 === 1) { __game.selectWeapon(guns[(i / 40 | 0) % 4]); __game.give('ammo'); __game.step(0.8); }
      __game.look((i % 9) * 0.7, ((i % 5) - 2) * 0.25);
      if (i % 25 === 0) { __game.give('grenade'); __game.throwGrenade(0.1); }
      if (__game.fire()) fired++;
      __game.step(1 / 60); if (i % 10 === 0) __game.render();
    }
    const ms = performance.now() - t0; __game.step(4); __game.render();
    return { fired, loopTicks: i, before, after: snap(), wallMs: Math.round(ms) };
  });
  out.fileSizeBytes = h.fileSizeBytes; out.errors = h.errors; out.blocked = h.blocked;
  await h.browser.close();
  fs.writeFileSync(path.resolve(__dirname, 'visual_r2_perf_result.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.inventory.list.map((m) => m.light ? [m.light, m.intensity, m.cast, m.map] : [m.scene, m.type, m.inst, m.tris, m.mat.replace('Mesh', '').replace('Material', ''), m.cast ? 'cast' : '', m.visible ? '' : 'hidden'])));
  console.log(JSON.stringify(out.inventory.memory), 'programs', out.inventory.programs, 'autoReset', out.inventory.autoReset, 'tex', JSON.stringify(out.inventory.tex), 'colliders', out.inventory.colliders);
  for (const s of out.states) console.log(s.label.padEnd(48), 'GL', s.glCalls, 'calls', s.glTris, 'tris', JSON.stringify(s.per), '| reported', s.reportedCalls, s.reportedTris, '|', s.ms, 'ms');
  console.log('full auto', JSON.stringify(out.fullAuto)); console.log('grenade', JSON.stringify(out.grenade)); console.log('all down', JSON.stringify(out.allDown));
  console.log('split', JSON.stringify(out.split)); console.log('pool', JSON.stringify(out.pool)); console.log('file', out.fileSizeBytes, 'errors', JSON.stringify(out.errors));
})().catch((e) => { console.error(e); process.exit(1); });
