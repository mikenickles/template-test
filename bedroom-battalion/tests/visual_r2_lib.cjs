// Round 2 helpers for the visual tester. Never touches index.html.
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');
const { glProbe } = require('./visual_lib.cjs');
const SHOTS = path.resolve(__dirname, '..', 'screenshots', 'round2');
function captureThree() {      // three.js announces renderer and scenes to devtools; we only listen
  const t = new EventTarget();
  window.__three = { renderer: null, scenes: [] };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) window.__three.scenes.push(o); else if (o && o.shadowMap) window.__three.renderer = o; });
  window.__THREE_DEVTOOLS__ = t;
}
async function open({ width = 1280, height = 720, probe = false, file } = {}) {
  const h = await launch(file ? { width, height, file } : { width, height });      // file: another build (round 4A snapshot, round 3 baseline)
  if (probe) { await h.page.addInitScript(glProbe); await h.page.addInitScript(captureThree); await h.page.reload();
    await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 }); }
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.step(1); });   // let the draw animation finish
  h.grab = async (file, crop) => {          // WebGL canvas only, same task as the render
    const url = await h.page.evaluate((crop) => { __game.render(); const c = document.getElementById('view');
      if (!crop) return c.toDataURL('image/png');
      const o = document.createElement('canvas'); o.width = crop[2]; o.height = crop[3]; o.getContext('2d').drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]); return o.toDataURL('image/png'); }, crop || null);
    const out = path.resolve(SHOTS, file); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); return out;
  };
  h.snap = async (file) => { await h.page.evaluate(() => __game.render()); await h.page.waitForTimeout(150); return h.shot('round2/' + file); };   // page with DOM HUD
  h.cam = (eye, target) => h.page.evaluate(([e, t]) => { __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(t[0], t[1], t[2]); __game.render(); }, [eye, target]);
  h.px = (fx = 0.5, fy = 0.5, n = 5) => h.page.evaluate(([fx, fy, n]) => { __game.render();
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(n * n * 4);
    gl.readPixels(Math.round(W * fx) - (n >> 1), Math.round(H * (1 - fy)) - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, b);
    const ch = [[], [], []]; for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) ch[k].push(b[i * 4 + k]);
    return ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }); }, [fx, fy, n]);
  return h;
}
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lab = (rgb) => { const [r, g, b] = rgb.map(s2l); const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
const dE = (a, b) => { const A = lab(a), B = lab(b); return +Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]).toFixed(1); };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const hexrgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
module.exports = { open, dE, hex, hexrgb, SHOTS, captureThree };
