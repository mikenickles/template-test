// Round 3 budget: WebGL-level draw calls and triangles per pass during real autoplay matches (all ten soldiers and the
// train), from an overview camera that holds the whole room and from the soldier's own eye; shader programs at load
// and after the first train view, first death, first grenade burst and first round-end screen, with the frame time of
// each first; pooling across three matches in a row with rematch. Software renderer on a shared machine: milliseconds
// are relative only. Usage: node visual_r3_perf.cjs
const fs = require('fs'); const path = require('path');
const { open } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page, out = {};
  await p.evaluate(() => {
    window.__cnt = () => { let c = 0, t = 0; const per = {}; for (const k in window.__gl.passes) { const P = window.__gl.passes[k]; c += P.calls; t += P.tris; per[k] = P.calls; } return { calls: c, tris: Math.round(t), per }; };
    window.__timed = () => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); window.__gl.reset(); const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return +(performance.now() - a).toFixed(1); };
    window.__snapM = () => { const { renderer, scenes } = window.__three; let objs = 0; scenes.forEach((s) => s.traverse(() => objs++));
      return { sceneObjects: objs, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length, domNodes: document.getElementsByTagName('*').length,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, killFeed: document.querySelectorAll('#feed div').length, shotLog: __game.shotLog.length, botLog: __game.botLog.length }; };
  });
  out.load = await p.evaluate(() => window.__snapM());
  out.inventory = await p.evaluate(() => { const L = []; window.__three.scenes.forEach((s, si) => s.traverse((o) => { if (o.isMesh || o.isLine) { const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    L.push([si, o.type, o.isInstancedMesh ? o.count : 1, Math.round(n / 3), o.material.type.replace('Mesh', '').replace('Material', ''), o.castShadow ? 'cast' : '', o.visible ? '' : 'hidden']); } if (o.isLight) L.push([si, o.type, o.castShadow ? 'cast ' + o.shadow.mapSize.x : ''])})); return L; });
  // ---- match 1: firsts and firefight counts ----
  out.firsts = await p.evaluate(() => {
    const prog = () => window.__three.renderer.info.programs.length, F = {};
    __game.startMatch({ difficulty: 'veteran', seed: 3, autoplay: true }); __game.setTimeScale(0);
    __game.views.probe = [[60, 70, 4], [60, 0, 92]]; __game.setView('probe'); window.__timed(); F.firstMatchFrame = { ms: window.__timed(), programs: prog() };
    let dead0 = 0, burstSeen = false, roundEndSeen = false; const base = [];
    for (let i = 0; i < 6; i++) base.push(window.__timed()); F.baselineMs = base.sort((a, b) => a - b)[3];
    for (let i = 0; i < 4000 && !(F.firstDeath && F.firstRoundEnd && F.firstBurst); i++) {
      const g0 = __game.grenades.length; __game.step(1 / 30); const s = __game.state();
      const dead = s.bots.filter((b) => b.dead).length + (s.player.dead ? 1 : 0);
      const tag = !F.firstDeath && dead > 0 ? 'firstDeath' : !F.firstBurst && g0 > 0 && __game.grenades.length < g0 ? 'firstBurst' : !F.firstRoundEnd && s.match.phase === 'roundEnd' ? 'firstRoundEnd' : null;
      if (tag) { const p0 = prog(); const ms = window.__timed(); const next = [window.__timed(), window.__timed(), window.__timed()]; F[tag] = { atSim: +(i / 30).toFixed(1), ms, next, programsBefore: p0, programsAfter: prog() }; }
    }
    __game.clearView(); return F;
  });
  // ---- counts during live play: overview camera and the soldier's eye, every 6th tick of 60 s of live play, plus grenade frames ----
  out.firefight = await p.evaluate(() => {
    const R = { overview: { max: 0, per: null, tris: 0, ms: [] }, eye: { max: 0, per: null, tris: 0, ms: [] }, aliveAtMax: null, grenadeFrames: 0 };
    let k = 0; while (__game.state().match.phase !== 'live' && k++ < 200) __game.step(0.5);
    for (let i = 0; i < 1800; i++) {
      __game.step(1 / 30); if (i % 6) continue; const s = __game.state(); if (s.match.phase !== 'live') { __game.step(1); continue; }
      const gren = __game.grenades.length > 0; if (gren) R.grenadeFrames++;
      for (const [key, view] of [['overview', true], ['eye', false]]) {
        if (view) { __game.views.probe = [[60, 70, 4], [60, 0, 92]]; __game.setView('probe'); } else __game.clearView();
        const ms = window.__timed(), c = window.__cnt(); R[key].ms.push(ms);
        if (c.calls > R[key].max) { R[key].max = c.calls; R[key].per = c.per; if (view) R.aliveAtMax = s.match.alive; }
        R[key].tris = Math.max(R[key].tris, c.tris);
      }
    }
    __game.clearView(); for (const key of ['overview', 'eye']) { const a = R[key].ms.sort((x, y) => x - y); R[key].ms = { median: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)] }; }
    return R;
  });
  out.afterMatch1Start = await p.evaluate(() => window.__snapM());
  // ---- pooling: finish match 1, then two rematches; render every 2 s of sim ----
  out.matches = [];
  for (let m = 0; m < 3; m++) {
    const r = await p.evaluate((m) => {
      if (m > 0) __game.rematch(); __game.setTimeScale(0); const t0 = performance.now(); let i = 0;
      while (__game.state().match.phase !== 'matchEnd' && i++ < 1200) { __game.step(1); if (i % 2 === 0) __game.render(); }
      __game.render(); const s = __game.state().match; return { match: m + 1, simSeconds: i, score: s.score, winner: s.winner, wallS: Math.round((performance.now() - t0) / 1000), after: window.__snapM() };
    }, m);
    out.matches.push(r); console.log('match', JSON.stringify(r));
  }
  out.fileSizeBytes = h.fileSizeBytes; out.errors = h.errors;
  fs.writeFileSync(path.resolve(__dirname, process.env.RESULT || 'visual_r3_perf_result.json'), JSON.stringify(out, null, 1));
  console.log('load', JSON.stringify(out.load)); console.log('inventory', JSON.stringify(out.inventory));
  console.log('firsts', JSON.stringify(out.firsts)); console.log('firefight', JSON.stringify(out.firefight));
  console.log('after match 1 start', JSON.stringify(out.afterMatch1Start)); console.log('file', out.fileSizeBytes, 'errors', JSON.stringify(out.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
