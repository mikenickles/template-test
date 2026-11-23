// Tries the fixes suggested in VISUAL.md IN THE TEST ONLY (lights and shadow filter changed on the live scene,
// index.html untouched) so every suggestion has a measurement or a screenshot behind it.
const { launch } = require('./harness.cjs');
const { grabCanvas } = require('./visual_lib.cjs');
function captureThree() {
  const t = new EventTarget();
  window.__three = { renderer: null, scene: null };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) window.__three.scene = o; else if (o && o.shadowMap) window.__three.renderer = o; });
  window.__THREE_DEVTOOLS__ = t;
}
const PROBES = [
  ['wall', [80, 30, 8], [80, 30, 0]], ['ceiling', [30, 82, 30], [30, 90, 30.01]], ['skirting', [80, 2, 5], [80, 2, 0.6]],
  ['bed top shade', [8, 24, 75], [8, 18, 75.01]], ['bed top sun', [27, 24, 75], [27, 18, 75.01]], ['bed side', [41, 12, 60], [35, 12, 60]],
  ['floor shade', [91.2, 6, 20], [91.2, 0, 20.01]], ['floor sun', [65.6, 6, 102], [65.6, 0, 102.01]],
  ['cover top', [54, 8, 61], [54, 2.5, 61.01]], ['cover side', [54, 1.25, 50.5], [54, 1.25, 56]], ['desk leg', [89, 12, 56.25], [95, 12, 56.25]],
  ['pillow sun', [26, 25, 104], [26, 19.8, 104.01]], ['shelf top', [114, 25, 10], [114, 20, 10.01]], ['shelf underside', [114, 14, 10], [114, 19, 10.01]],
  ['route side', [97.5, 4, 140], [103.5, 4, 140]], ['string', [105.5, 10, 54.5], [106.89, 10, 54.5]], ['green fort side', [48.5, 0.6, 31], [48.5, 0.6, 26]],
];
const VARIANTS = {
  'current (sky #FFF1D6, ground #B08D6A, hemi 3.4, sun 2.4)': null,
  'A: sky #FFF8EC, ground #D8CFC4, hemi 3.0, sun 3.0': { sky: '#FFF8EC', ground: '#D8CFC4', hemi: 3.0, sun: 3.0 },
  'B: sky #FFF8EC, ground #D8CFC4, hemi 2.4, sun 4.0': { sky: '#FFF8EC', ground: '#D8CFC4', hemi: 2.4, sun: 4.0 },
  'C: palette colours kept, hemi 2.4, sun 4.0': { sky: '#FFF1D6', ground: '#B08D6A', hemi: 2.4, sun: 4.0 },
};
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lab = (rgb) => { const [r, g, b] = rgb.map(s2l); const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
const dE = (a, b) => { const A = lab(a), B = lab(b); return +Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]).toFixed(1); };
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const hexrgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const l2s = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.min(1, v), 1 / 2.4) - 0.055));

(async () => {
  const h = await launch({ width: 1280, height: 720 });
  await h.page.addInitScript(captureThree);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  let k = 0;
  for (const [label, v] of Object.entries(VARIANTS)) {
    await h.page.evaluate((v) => {
      if (!v) return;
      window.__three.scene.traverse((o) => {
        if (o.isHemisphereLight) { o.color.set(v.sky); o.groundColor.set(v.ground); o.intensity = v.hemi; }
        if (o.isDirectionalLight) o.intensity = v.sun;
      });
    }, v);
    const px = {};
    for (const [name, e, t] of PROBES) {
      px[name] = await h.page.evaluate(([e, t]) => {
        __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(t[0], t[1], t[2]); __game.render();
        const gl = document.getElementById('view').getContext('webgl2'), b = new Uint8Array(4);
        gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]];
      }, [e, t]);
    }
    // Tan soldier under the same light, from the cover grey factors
    const f = (probe) => px[probe].map((c, i) => s2l(c) / s2l(hexrgb('#9AA3AD')[i]));
    const tan = (hx, probe) => hexrgb(hx).map((c, i) => l2s(s2l(c) * f(probe)[i]));
    const tanTop = tan('#E0C080', 'cover top'), tanSide = tan('#E0C080', 'cover side'), tanShSide = tan('#B8975A', 'cover side'), tanShTop = tan('#B8975A', 'cover top');
    console.log('\n' + label);
    console.log('  ' + Object.entries(px).map(([n, c]) => n + ' ' + hex(c)).join(' | '));
    console.log('  wall vs palette #BFD3E0 dE', dE(px.wall, hexrgb('#BFD3E0')), '| ceiling vs palette #F5F2EA dE', dE(px.ceiling, hexrgb('#F5F2EA')),
      '| floor sun vs shade dE', dE(px['floor sun'], px['floor shade']), '| bed sun vs shade dE', dE(px['bed top sun'], px['bed top shade']),
      '| cover side vs desk leg dE', dE(px['cover side'], px['desk leg']), '| cover side vs wall dE', dE(px['cover side'], px.wall));
    console.log('  Tan soldier would render top', hex(tanTop), 'side', hex(tanSide), '; shadow-side colour top', hex(tanShTop), 'side', hex(tanShSide),
      '| bed top shade vs Tan top dE', dE(px['bed top shade'], tanTop), 'vs Tan-shadow top dE', dE(px['bed top shade'], tanShTop),
      '| bed side vs Tan side dE', dE(px['bed side'], tanSide), 'vs Tan-shadow side dE', dE(px['bed side'], tanShSide), '| ceiling vs Tan side dE', dE(px.ceiling, tanSide), 'vs Tan-shadow side dE', dE(px.ceiling, tanShSide));
    if (v) {
      const tag = 'ABC'[k - 1];
      await h.page.evaluate(() => { __game.setView('spawn_green'); }); await grabCanvas(h, `round1/visual_suggest_${tag}_spawn_green.png`);
      await h.page.evaluate(() => { __game.setView('shelf_top'); }); await grabCanvas(h, `round1/visual_suggest_${tag}_shelf_top.png`);
      await h.page.evaluate(() => { __game.setView('floor_centre'); }); await grabCanvas(h, `round1/visual_suggest_${tag}_floor_centre.png`);
    }
    k++;
  }
  // restore the current lights, then compare shadow filters (relative cost, software renderer)
  await h.page.evaluate(() => window.__three.scene.traverse((o) => {
    if (o.isHemisphereLight) { o.color.set('#FFF1D6'); o.groundColor.set('#B08D6A'); o.intensity = 3.4; } if (o.isDirectionalLight) o.intensity = 2.4; }));
  const time = (view) => h.page.evaluate((v) => {
    const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4);
    __game.setView(v); const sync = () => { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let i = 0; i < 3; i++) { __game.render(); sync(); }
    const t = []; for (let i = 0; i < 9; i++) { const a = performance.now(); __game.render(); sync(); t.push(performance.now() - a); } t.sort((a, b) => a - b); return +t[4].toFixed(1);
  }, view);
  console.log('\nshadow filter cost (median ms per render, SwiftShader, 1280x720):');
  for (const [name, type] of [['PCFSoftShadowMap (current)', 2], ['PCFShadowMap', 1], ['BasicShadowMap', 0]]) {
    await h.page.evaluate((type) => { const { renderer, scene } = window.__three; renderer.shadowMap.type = type; renderer.shadowMap.needsUpdate = true; scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; }); }, type);
    const a = await time('west_lane'), b = await time('bed_top'), c = await time('floor_centre');
    console.log('  ' + name.padEnd(28), 'west_lane', a, ' bed_top', b, ' floor_centre', c);
    if (type === 1) { await h.page.evaluate(() => { __game.clearView(); __game.teleport(62, 13 - 1.6, 92, 0, -1.54); }); await grabCanvas(h, 'round1/visual_suggest_pcf_strip_topdown.png'); }
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
