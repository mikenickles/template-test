// Round 4A budget (DESIGN 17.9) on any build: collider / waypoint / hit-volume hashes, load time to __game.ready (median of reloads),
// per named view: draw calls, triangles and software render cost (gl.finish after each frame); a full live firefight; programs,
// textures and texture memory when the build exposes renderInfo(). Args: [file] [reloads] [frames per view]
const { launch } = require('./harness.cjs');
const file = process.argv[2] || undefined, reloads = +(process.argv[3] || 5), frames = +(process.argv[4] || 12);
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
(async () => {
  const { browser, page, errors, fileSizeBytes } = await launch(file ? { width: 1280, height: 720, file } : { width: 1280, height: 720 });
  const out = { fileSizeBytes };
  out.hashes = await page.evaluate(() => {
    const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); };
    const n = (v) => (v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(6) : String(v)) : Array.isArray(v) ? v.map(n).join(',') : String(v));
    const cs = __game.colliders.filter((c) => !c.test).map((c) => [c.id, c.kind, c.surface, c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, c.axis, c.h0, c.h1, c.thickness, c.base, c.x, c.z, c.r, c.ex, c.ez, c.launch].map(n).join('|')).join('\n');
    const W = __game.waypoints, ws = Object.keys(W.nodes).sort().map((k) => k + ':' + n(W.nodes[k])).join(';') + '#' + W.edges.map((e) => [e.a, e.b, e.kind, e.oneWay].map(n).join('|')).join(';');
    const S = __game.CONFIG.soldier, T = __game.CONFIG.target, P = __game.CONFIG.player;
    const hv = n([S.body, S.crouchBody, S.head, S.base, T.body, T.head, P.height, P.crouchHeight, P.radius]);
    return { colliders: fnv(cs), count: __game.colliders.filter((c) => !c.test).length, waypoints: fnv(ws), hitVolumes: fnv(hv), inGame: __game.colliderHash ? __game.colliderHash() : null };
  });
  // load time: ms from navigation start to the moment the game sets __game.ready (recorded in-page by a setter, so a busy frame loop
  // cannot delay the reading), median of several reloads
  await page.addInitScript(() => {
    let g; Object.defineProperty(window, '__game', { configurable: true, get() { return g; }, set(v) { g = v; let r = v.ready;
      Object.defineProperty(v, 'ready', { configurable: true, enumerable: true, get() { return r; }, set(x) { r = x; if (x && !window.__readyAt) window.__readyAt = performance.now(); } }); } });
  });
  const loads = [];
  for (let i = 0; i < reloads; i++) {
    await page.reload(); await page.waitForFunction(() => window.__readyAt, null, { polling: 20, timeout: 60000 });
    loads.push(Math.round(await page.evaluate(() => window.__readyAt)));
  }
  loads.sort((a, b) => a - b); out.loadMs = { median: loads[Math.floor(loads.length / 2)], all: loads };
  out.views = await page.evaluate(([VIEWS, frames]) => {
    const g = __game, gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4), r = {}; gl.finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    g.start({ pointerLock: false }); g.setTimeScale(0);
    for (const v of VIEWS) {
      g.setView(v); g.render(); gl.finish(); g.render(); gl.finish();
      const t = []; for (let i = 0; i < frames; i++) { const t0 = performance.now(); g.render(); gl.finish(); t.push(performance.now() - t0); }
      t.sort((a, b) => a - b); const s = g.state();
      r[v] = { calls: s.drawCalls, tris: s.triangles, ms: +t[Math.floor(t.length / 2)].toFixed(1) };
    }
    g.clearView(); return r;
  }, [VIEWS, frames]);
  out.firefight = await page.evaluate(() => {
    const g = __game, gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); gl.finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 21, autoplay: true });
    let mx = 0, sum = 0, n = 0, tri = 0, ms = [];
    while (g.state().match.phase !== 'live') g.step(0.25);
    for (let i = 0; i < 600 && g.state().match.phase === 'live'; i++) { g.step(0.25); const t0 = performance.now(); g.render(); gl.finish(); ms.push(performance.now() - t0); const s = g.state(); mx = Math.max(mx, s.drawCalls); tri = Math.max(tri, s.triangles); sum += s.drawCalls; n++; }
    ms.sort((a, b) => a - b);
    return { maxCalls: mx, meanCalls: +(sum / n).toFixed(1), maxTris: tri, frames: n, medianMs: +ms[Math.floor(ms.length / 2)].toFixed(1), p90Ms: +ms[Math.floor(ms.length * 0.9)].toFixed(1) };
  });
  // growth over three matches: GPU object counts and JS heap after each
  out.growth = await page.evaluate(() => {
    const g = __game, snap = () => ({ heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, ...(g.renderInfo ? (({ programs, textures, geometries }) => ({ programs, textures, geometries }))(g.renderInfo()) : {}) });
    const r = [snap()];
    for (let k = 0; k < 3; k++) { g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 30 + k, autoplay: true }); let n = 0;
      while (g.state().match.phase !== 'matchEnd' && n++ < 4000) { g.step(0.5); if (n % 20 === 0) g.render(); } g.render(); r.push(snap()); }
    return r;
  });
  out.afterMatch = await page.evaluate(() => { const g = __game; g.runMatch({ difficulty: 'regular', seed: 22, autoplay: true }); g.render(); return g.renderInfo ? g.renderInfo() : null; });
  // main pass alone (shadow map off for the count only), per named view and over the same firefight
  out.mainPass = await page.evaluate((VIEWS) => {
    const g = __game; if (!g.artDebug) return null; g.artDebug({ shadow: false }); const r = {};
    g.startMatch({ difficulty: 'regular', seed: 21, autoplay: true }); g.setTimeScale(0);
    for (const v of VIEWS) { g.setView(v); g.render(); r[v] = g.state().triangles; }
    g.clearView(); let mx = 0; while (g.state().match.phase !== 'live') g.step(0.25);
    for (let i = 0; i < 600 && g.state().match.phase === 'live'; i++) { g.step(0.25); g.render(); mx = Math.max(mx, g.state().triangles); }
    r.firefightMax = mx; g.artDebug({ shadow: true }); return r;
  }, VIEWS);
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
