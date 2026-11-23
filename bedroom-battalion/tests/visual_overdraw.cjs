// Overdraw per named view, measured directly: every mesh is drawn with an additive flat material (test only),
// once with the depth test on (= fragments that really get shaded, in the game's own draw order) and once with it
// off (= total depth complexity). Explains which view is the most expensive and why.
const { launch } = require('./harness.cjs');
const { VIEWS } = require('./visual_lib.cjs');
function captureThree() {
  const t = new EventTarget();
  window.__three = { renderer: null, scene: null };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) window.__three.scene = o; else if (o && o.shadowMap) window.__three.renderer = o; });
  window.__THREE_DEVTOOLS__ = t;
}
(async () => {
  const h = await launch({ width: 1280, height: 720 });
  await h.page.addInitScript(captureThree);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  const res = await h.page.evaluate((views) => {
    __game.start({ pointerLock: false }); __game.setTimeScale(0);
    __game.setDebug(true); __game.setDebug(false);                     // builds the debug line material we borrow
    const { scene, renderer } = window.__three;
    let lineMat = null; const meshes = [];
    scene.traverse((o) => { if (o.isLineSegments && !lineMat) lineMat = o.material; if (o.isMesh) meshes.push(o); });
    const mat = lineMat.clone();
    mat.vertexColors = false; mat.color.set(0x101010); mat.blending = 2; mat.transparent = true; mat.fog = false; mat.opacity = 1; mat.depthWrite = true; mat.depthTest = true;
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4);
    const bg = scene.background, out = {};
    const measure = () => {
      __game.render();
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0, max = 0; for (let i = 0; i < buf.length; i += 4) { sum += buf[i]; if (buf[i] > max) max = buf[i]; }
      return { mean: +(sum / (W * H) / 16).toFixed(2), max: Math.round(max / 16) };
    };
    for (const v of views) {
      __game.setView(v);
      scene.background = null; scene.overrideMaterial = mat;
      mat.depthTest = true; mat.depthWrite = true; mat.needsUpdate = true; const shaded = measure();
      mat.depthTest = false; mat.depthWrite = false; mat.needsUpdate = true; const total = measure();
      scene.overrideMaterial = null; scene.background = bg;
      out[v] = { shadedLayers: shaded.mean, shadedMax: shaded.max, depthComplexity: total.mean, depthMax: total.max };
    }
    __game.render();
    return out;
  }, VIEWS);
  for (const v in res) console.log(v.padEnd(14), JSON.stringify(res[v]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
