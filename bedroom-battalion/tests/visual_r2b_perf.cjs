// Round 2 re-check budget: WebGL-level draw calls and triangles per pass (shadow pass included) idle, in full-auto
// fire and through a grenade burst; whether the burst light casts shadows or adds a pass; the first-burst frame-time
// spike against later bursts (shader compile); the idle cost of the always-present point light; pooling across
// 500 shots and 20 grenades. Software renderer (SwiftShader): milliseconds are relative cost only.
const fs = require('fs'); const path = require('path');
const { open } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720, probe: true });
  const p = h.page, out = {};
  await p.evaluate(() => {
    window.__cnt = () => { let c = 0, t = 0; const per = {}; for (const k in window.__gl.passes) { const P = window.__gl.passes[k]; c += P.calls; t += P.tris; per[k] = P.calls + 'c/' + Math.round(P.tris) + 't'; } return { calls: c, tris: Math.round(t), per }; };
    window.__timed = () => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - a; };
    window.__snap = () => { const { renderer, scenes } = window.__three; let objs = 0, lights = 0, shadowLights = 0; scenes.forEach((s) => s.traverse((o) => { objs++; if (o.isLight) { lights++; if (o.castShadow) shadowLights++; } }));
      return { sceneObjects: objs, lights, shadowLights, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length,
        domNodes: document.getElementsByTagName('*').length, grenadesLive: __game.grenades.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }; };
  });
  out.lights = await p.evaluate(() => { const L = []; window.__three.scenes.forEach((s, si) => s.traverse((o) => { if (o.isLight) L.push([si, o.type, +o.intensity.toFixed(2), !!o.castShadow, o.castShadow ? o.shadow.mapSize.x : 0]); })); return L; });
  out.start = await p.evaluate(() => window.__snap());
  const count = (label, setup) => p.evaluate(([label, setup]) => { if (setup) (0, eval)(setup); __game.render(); window.__gl.reset(); __game.render(); const c = window.__cnt(), s = __game.state();
    const t = []; for (let i = 0; i < 9; i++) t.push(window.__timed()); t.sort((a, b) => a - b); return Object.assign({ label, reported: s.drawCalls, ms: +t[4].toFixed(1) }, c); }, [label, setup || '']);
  const S = [];
  S.push(await count('idle, rifle, Green spawn', '__game.clearView(); __game.selectWeapon("rifle"); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1);'));
  S.push(await count('idle, sniper scoped', '__game.selectWeapon("sniper"); __game.step(1); __game.setInput({scope:true}); __game.step(0.4);'));
  await p.evaluate(() => { __game.clearInput(); __game.step(0.5); });
  for (const v of ['spawn_green', 'bed_top', 'desk_top', 'west_lane', 'shelf_top']) S.push(await count('named view ' + v, `__game.setView("${v}")`));
  await p.evaluate(() => __game.clearView());

  // full-auto rifle and SMG at the fort wall, 4 s each, counted every 4th tick
  for (const w of ['rifle', 'smg']) {
    out['auto_' + w] = await p.evaluate((w) => {
      __game.give('ammo'); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); __game.lookAt(52, 1, 24.5); __game.setInput({ fire: true });
      let maxC = 0, maxT = 0, ms = [], per = null;
      for (let i = 0; i < 240; i++) { if (i % 60 === 59) __game.give('ammo'); __game.step(1 / 60);
        if (i % 4 === 0) { window.__gl.reset(); ms.push(window.__timed()); const c = window.__cnt(); if (c.calls > maxC) { maxC = c.calls; per = c.per; } maxT = Math.max(maxT, c.tris); } }
      __game.clearInput(); __game.step(2); ms.sort((a, b) => a - b);
      return { maxCalls: maxC, maxTris: maxT, per, msMedian: +ms[ms.length >> 1].toFixed(1), msMax: +ms[ms.length - 1].toFixed(1) };
    }, w);
  }
  // grenade: aim (arc), then bursts #1..#4 at the same spot from 14 units; render every tick from release to burst+0.4 s
  out.programsBeforeAim = await p.evaluate(() => window.__snap().programs);
  out.bursts = [];
  for (let b = 0; b < 4; b++) {
    out.bursts.push(await p.evaluate((b) => {
      __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 30, 0, 0); __game.step(0.5); __game.lookAt(60, 1, 44);
      __game.setInput({ grenade: true }); __game.step(0.2); window.__gl.reset(); const aimMs = window.__timed(); const aim = window.__cnt(); const progAim = window.__snap().programs;
      __game.clearInput(); const rows = []; let lightMax = 0, maxC = 0, maxT = 0, per = null, burstAt = -1;
      const L = window.__three.scenes[0].children.find((o) => o.isPointLight);
      for (let i = 0; i < 160 && (burstAt < 0 || i < burstAt + 25); i++) {
        __game.step(1 / 60);
        if (__game.grenades.length) { const g = __game.grenades[0]; __game.lookAt(g.x, g.y + 0.3, g.z); }
        if (burstAt < 0 && __game.grenades.length === 0 && i > 2) burstAt = i;
        window.__gl.reset(); const ms = window.__timed(); const c = window.__cnt();
        if (burstAt >= 0) { rows.push([i - burstAt, +ms.toFixed(1), c.calls, L.intensity > 0 ? 1 : 0]); if (c.calls > maxC) { maxC = c.calls; per = c.per; } maxT = Math.max(maxT, c.tris); lightMax = Math.max(lightMax, L.intensity); }
      }
      const pre = rows.length ? null : null;
      return { burst: b + 1, aimCalls: aim.calls, aimPer: aim.per, aimMs: +aimMs.toFixed(1), programsAtAim: progAim, programsAfter: window.__snap().programs, burstMaxCalls: maxC, burstPer: per, burstMaxTris: maxT,
        lightCast: !!L.castShadow, lightMax, firstFrames: rows.slice(0, 6), msLater: rows.slice(15).map((r) => r[1]), lightPos: [L.position.x, L.position.y, L.position.z] };
    }, b));
    await p.evaluate(() => __game.step(1));
  }
  // idle cost of the point light (always in the scene at intensity 0, so every lit shader computes it): remove it, time, put it back
  out.pointLightCost = await p.evaluate(() => {
    __game.teleport(60, 0, 20, Math.PI, 0); __game.step(0.5); const S0 = window.__three.scenes[0], L = S0.children.find((o) => o.isPointLight);
    const med = () => { const t = []; for (let i = 0; i < 11; i++) t.push(window.__timed()); t.sort((a, b) => a - b); return +t[5].toFixed(1); };
    for (let i = 0; i < 3; i++) window.__timed(); const withL = med();
    S0.remove(L); const firstNo = window.__timed(); for (let i = 0; i < 3; i++) window.__timed(); const without = med();
    S0.add(L); const firstBack = window.__timed(); for (let i = 0; i < 3; i++) window.__timed(); const back = med();
    return { withLight: withL, withoutLight: without, recompileFrameRemove: +firstNo.toFixed(1), recompileFrameAdd: +firstBack.toFixed(1), backAgain: back };
  });
  out.states = S;
  // pooling: 500 shots over all four guns plus 20 grenades
  out.pool = await p.evaluate(() => {
    __game.resetTargets(); __game.teleport(60, 0, 40, 0, 0); __game.step(1); for (const w of ['rifle', 'smg', 'pistol', 'sniper']) { __game.selectWeapon(w); __game.step(1); }
    __game.render(); const before = window.__snap(); let fired = 0, gren = 0, i = 0; const guns = ['rifle', 'smg', 'pistol', 'sniper'];
    while ((fired < 500 || gren < 20) && i < 6000) { i++;
      if (i % 40 === 1) { __game.selectWeapon(guns[(i / 40 | 0) % 4]); __game.give('ammo'); __game.step(0.8); }
      __game.look((i % 9) * 0.7, ((i % 5) - 2) * 0.25);
      if (i % 25 === 0 && gren < 20) { __game.give('grenade'); if (__game.throwGrenade(0.1)) gren++; }
      if (fired < 500 && __game.fire()) fired++;
      __game.step(1 / 60); if (i % 10 === 0) __game.render();
    }
    __game.step(4); __game.render();
    return { fired, grenades: gren, loopTicks: i, before, after: window.__snap(), shotLog: __game.shotLog.length, audioLog: __game.audioLog.length };
  });
  out.fileSizeBytes = h.fileSizeBytes; out.errors = h.errors; out.blocked = h.blocked;
  await h.browser.close();
  fs.writeFileSync(path.resolve(__dirname, 'visual_r2b_perf_result.json'), JSON.stringify(out, null, 1));
  console.log('lights', JSON.stringify(out.lights)); console.log('start', JSON.stringify(out.start));
  for (const s of out.states) console.log(s.label.padEnd(30), 'GL', s.calls, 'calls', s.tris, 'tris', JSON.stringify(s.per), '| reported', s.reported, '|', s.ms, 'ms');
  console.log('auto rifle', JSON.stringify(out.auto_rifle)); console.log('auto smg', JSON.stringify(out.auto_smg));
  console.log('programs before aim', out.programsBeforeAim); for (const b of out.bursts) console.log('burst', JSON.stringify(b));
  console.log('point light', JSON.stringify(out.pointLightCost)); console.log('pool', JSON.stringify(out.pool)); console.log('file', out.fileSizeBytes, 'errors', JSON.stringify(out.errors), 'blocked', JSON.stringify(out.blocked));
})().catch((e) => { console.error(e); process.exit(1); });
