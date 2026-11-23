// Performance against the budget: GL-level draw calls (shadow pass included), triangles, lights, shadow map,
// textures, relative frame cost per view, cost breakdown by toggling things in THIS TEST ONLY, and sim step cost.
// Rendering is SwiftShader (software): absolute ms and fps are not real-hardware numbers.
const fs = require('fs');
const path = require('path');
const { launch } = require('./harness.cjs');
const { glProbe, VIEWS } = require('./visual_lib.cjs');

function captureThree() {      // three.js announces its renderer and scene to devtools; we just listen
  const t = new EventTarget();
  window.__three = { renderer: null, scene: null };
  t.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o && o.isScene) window.__three.scene = o; else if (o && o.shadowMap) window.__three.renderer = o;
  });
  window.__THREE_DEVTOOLS__ = t;
}

async function openProbed(width, height) {
  const h = await launch({ width, height });
  await h.page.addInitScript(glProbe);
  await h.page.addInitScript(captureThree);
  const requests = [];
  h.page.on('request', (r) => requests.push(r.url()));
  await h.page.reload();
  await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  h.requests = requests;
  return h;
}

const timeView = (page, view, n = 10) => page.evaluate(([v, n]) => {
  const gl = document.getElementById('view').getContext('webgl2');
  const px = new Uint8Array(4);
  if (v) __game.setView(v);
  const sync = () => { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  __game.render(); sync(); __game.render(); sync();        // warm up (shader compiles, shadow map)
  const t = [];
  for (let i = 0; i < n; i++) { const a = performance.now(); __game.render(); sync(); t.push(performance.now() - a); }
  t.sort((a, b) => a - b);
  return { median: +t[n >> 1].toFixed(1), min: +t[0].toFixed(1), max: +t[n - 1].toFixed(1) };
}, [view, n]);

(async () => {
  const out = {};
  const h = await openProbed(1280, 720);
  const page = h.page;

  // ---- A. inventory ----
  out.inventory = await page.evaluate(() => {
    const { renderer, scene } = window.__three;
    const gl = document.getElementById('view').getContext('webgl2');
    const meshes = [], lights = [];
    scene.traverse((o) => {
      if (o.isMesh || o.isLineSegments || o.isLine || o.isPoints) {
        const g = o.geometry, pos = g.attributes.position;
        meshes.push({ type: o.type, instanced: !!o.isInstancedMesh, count: o.isInstancedMesh ? o.count : 1, verts: pos.count,
          tris: o.isMesh ? ((g.index ? g.index.count : pos.count) / 3) * (o.isInstancedMesh ? o.count : 1) : 0,
          castShadow: o.castShadow, receiveShadow: o.receiveShadow, frustumCulled: o.frustumCulled, visible: o.visible,
          material: o.material.type, flatShading: !!o.material.flatShading, map: o.material.map ? [o.material.map.image.width, o.material.map.image.height] : null,
          mapInfo: o.material.map ? { aniso: o.material.map.anisotropy, mip: o.material.map.generateMipmaps, min: o.material.map.minFilter } : null });
      }
      if (o.isLight) {
        const L = { type: o.type, intensity: o.intensity, color: '#' + o.color.getHexString(), castShadow: !!o.castShadow };
        if (o.groundColor) L.ground = '#' + o.groundColor.getHexString();
        if (o.shadow && o.castShadow) {
          const c = o.shadow.camera;
          L.shadow = { mapSize: [o.shadow.mapSize.x, o.shadow.mapSize.y], actual: o.shadow.map ? [o.shadow.map.width, o.shadow.map.height] : null,
            bias: o.shadow.bias, normalBias: o.shadow.normalBias, radius: o.shadow.radius,
            ortho: { w: c.right - c.left, h: c.top - c.bottom, near: c.near, far: c.far },
            texelWorld: [(c.right - c.left) / o.shadow.mapSize.x, (c.top - c.bottom) / o.shadow.mapSize.y], depthRange: c.far - c.near };
        }
        lights.push(L);
      }
    });
    return { meshes, lights,
      renderer: { shadowEnabled: renderer.shadowMap.enabled, shadowType: renderer.shadowMap.type, shadowAutoUpdate: renderer.shadowMap.autoUpdate,
        toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace, pixelRatio: renderer.getPixelRatio(),
        memory: renderer.info.memory, programs: renderer.info.programs.length,
        antialias: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES), maxAniso: renderer.capabilities.getMaxAnisotropy(),
        glRenderer: gl.getParameter(gl.RENDERER), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] },
      fog: scene.fog ? { near: scene.fog.near, far: scene.fog.far, color: '#' + scene.fog.color.getHexString() } : null,
      background: scene.background && scene.background.isColor ? '#' + scene.background.getHexString() : String(scene.background),
      texUploads: window.__gl.tex, rbo: window.__gl.rbo, colliders: __game.colliders.length };
  });

  // ---- B. draw calls per view, per pass (GL level) vs what state() reports ----
  out.views = {};
  for (const debug of [false, true]) {
    for (const v of VIEWS) {
      const r = await page.evaluate(([v, d]) => {
        __game.setDebug(d); __game.setView(v); __game.render();
        window.__gl.reset(); __game.render();
        const passes = JSON.parse(JSON.stringify(window.__gl.passes)), vp = window.__gl.viewports.slice();
        const s = __game.state();
        return { passes, vp, reported: { drawCalls: s.drawCalls, triangles: s.triangles } };
      }, [v, debug]);
      let calls = 0, tris = 0, lines = 0;
      for (const k in r.passes) { calls += r.passes[k].calls; tris += r.passes[k].tris; lines += r.passes[k].lines; }
      (out.views[v] = out.views[v] || {})[debug ? 'debug' : 'plain'] = { glCalls: calls, glTris: tris, glLines: lines, passes: r.passes, reported: r.reported, viewports: r.vp };
    }
  }
  await page.evaluate(() => __game.setDebug(false));

  // ---- C. relative frame cost per view (software renderer: relative only) ----
  out.timing = {};
  for (const v of VIEWS) out.timing[v] = await timeView(page, v);
  const worst = Object.keys(out.timing).sort((a, b) => out.timing[b].median - out.timing[a].median)[0];
  const cheapest = Object.keys(out.timing).sort((a, b) => out.timing[a].median - out.timing[b].median)[0];
  out.worstView = worst; out.cheapestView = cheapest;

  // ---- D. breakdown at the worst and the cheapest view: toggle things in the test only ----
  out.breakdown = {};
  for (const v of [worst, cheapest]) {
    const b = (out.breakdown[v] = {});
    b.baseline = await timeView(page, v);
    await page.evaluate(() => { window.__three.renderer.shadowMap.autoUpdate = false; });
    b.shadowMapFrozen = await timeView(page, v);           // shadow depth pass skipped, shadow sampling still on
    await page.evaluate(() => { const { renderer, scene } = window.__three; renderer.shadowMap.autoUpdate = true;
      scene.traverse((o) => { if (o.isMesh) { o.userData.rs = o.receiveShadow; o.receiveShadow = false; o.material.needsUpdate = true; } }); });
    b.noShadowSampling = await timeView(page, v);          // depth pass on, PCF soft sampling off
    await page.evaluate(() => { const { renderer, scene } = window.__three; renderer.shadowMap.autoUpdate = false; });
    b.noShadowsAtAll = await timeView(page, v);
    await page.evaluate(() => { const { renderer, scene } = window.__three; renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true;
      scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = o.userData.rs; o.material.needsUpdate = true; } }); });
    b.baselineAgain = await timeView(page, v);
    await page.evaluate(() => { window.__three.scene.fog.far = 1e9; window.__three.scene.fog.near = 1e9 - 1; });
    b.noFog = await timeView(page, v);
    await page.evaluate(() => { const C = __game.CONFIG.fog; window.__three.scene.fog.near = C.near; window.__three.scene.fog.far = C.far; });
    const meshNames = await page.evaluate(() => { const n = []; window.__three.scene.traverse((o) => { if (o.isMesh) n.push(o.isInstancedMesh ? 'instanced' : o.material.map ? 'floor' : 'static'); }); return n; });
    for (let i = 0; i < meshNames.length; i++) {
      await page.evaluate((i) => { let k = 0; window.__three.scene.traverse((o) => { if (o.isMesh) { if (k === i) o.visible = false; k++; } }); }, i);
      b['hide_' + meshNames[i]] = await timeView(page, v);
      await page.evaluate(() => window.__three.scene.traverse((o) => { if (o.isMesh) o.visible = true; }));
    }
    await page.evaluate(() => __game.setDebug(true));
    b.debugOn = await timeView(page, v);
    await page.evaluate(() => __game.setDebug(false));
  }

  // ---- E. simulation cost ----
  out.sim = await page.evaluate(() => {
    const res = {};
    const run = (label, x, y, z, yaw, input) => {
      __game.clearView(); __game.clearInput(); __game.teleport(x, y, z, yaw, 0); __game.setInput(input);
      const a = performance.now(); __game.step(20); const ms = performance.now() - a;       // 1200 ticks
      __game.clearInput();
      res[label] = { ticks: 1200, msPerTick: +(ms / 1200).toFixed(4) };
    };
    run('idle at spawn', 60, 0, 20, Math.PI, {});
    run('sprint into fort wall', 60, 0, 20, Math.PI / 2, { forward: true, sprint: true });
    run('walk in ruin bricks', 56, 0, 78, 0.6, { forward: true, left: true });
    run('walk up tall-shelf stairs', 105.7, 0, 152.5, 0, { forward: true });
    return res;
  });
  await page.evaluate(() => { __game.teleport(60, 0, 20, Math.PI, 0); });

  out.errors = h.errors; out.blocked = h.blocked; out.requests = h.requests; out.fileSizeBytes = h.fileSizeBytes;
  await h.browser.close();

  // ---- F. resolution scaling (fill-rate share) ----
  const h2 = await openProbed(1920, 1080);
  out.timing1080 = {};
  for (const v of [worst, cheapest]) out.timing1080[v] = await timeView(h2.page, v);
  const h3 = await openProbed(640, 360);
  out.timing360 = {};
  for (const v of [worst, cheapest]) out.timing360[v] = await timeView(h3.page, v);
  await h2.browser.close(); await h3.browser.close();

  const file = path.resolve(__dirname, 'visual_perf_result.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
