// Round 3 helpers for the visual tester. Never touches index.html.
// - open(): harness + WebGL probe + three.js scene capture (as round 2).
// - in-page helpers installed by install(): a free camera through a custom named view (`__game.views.probe`, so the match
//   and the player are never moved), pixel reads, soldier instance lookup, and hiding one soldier's instances for a
//   silhouette diff (setMatrixAt is wrapped on the live mesh; the game re-sends every matrix each render).
const path = require('path'); const fs = require('fs');
const { open: open2, dE, hex } = require('./visual_r2_lib.cjs');
const SHOTS = path.resolve(__dirname, '..', 'screenshots', process.env.SHOTDIR || 'round3');      // SHOTDIR=round4 for round 4 runs
async function open(opts = {}) {
  const h = await open2(Object.assign({ probe: true }, process.env.VIS_FILE ? { file: path.resolve(process.env.VIS_FILE) } : {}, opts));      // VIS_FILE picks another build
  await install(h.page);
  h.save = (file, url) => { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64')); };
  h.snap = async (file) => { for (let k = 0; k < 3; k++) { try { await h.page.evaluate(() => __game.render()); await h.page.waitForTimeout(150); return await h.shot('round3/' + file); } catch (e) { if (k === 2) throw e; } } };   // retried: the shared machine is slow
  return h;
}
async function install(page) {
  await page.evaluate(() => {
    const S = window.__three.scenes[0];
    const R = window.__r3 = {};
    R.sold = S.children.find((c) => c.isInstancedMesh && c.material.type === 'MeshPhongMaterial' && c.count % 11 === 0 && c.count !== 63); R.np = R.sold ? R.sold.count / 11 : 0;      // parts per soldier: 4 (round 3) or 5 (arms added in the fix pass)
    R.chev = S.children.find((c) => c.isInstancedMesh && c.count === 10);
    R.trainBoxes = S.children.find((c) => c.isInstancedMesh && c.count === 62);
    R.wheels = S.children.find((c) => c.isInstancedMesh && c.count === 40);
    R.sun = S.children.find((c) => c.isDirectionalLight);
    R.hide = new Set(); if (R.sold) { const zero = R.sold.matrix.clone().makeScale(0, 0, 0), orig = R.sold.setMatrixAt.bind(R.sold); R.sold.setMatrixAt = (i, m) => orig(i, R.hide.has(i) ? zero : m); }
    R.cam = (eye, at) => { __game.views.probe = [eye, at]; __game.setView('probe'); };
    R.gl = () => document.getElementById('view').getContext('webgl2');
    R.rd = (dx, dy, n) => { const gl = R.gl(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(n * n * 4);
      gl.readPixels((W >> 1) + dx - (n >> 1), (H >> 1) + dy - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const ch = [[], [], []]; for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) ch[k].push(b[i * 4 + k]); return ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }); };
    R.full = () => { const gl = R.gl(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    // world centre of each soldier part from the live instance matrices: slot k, part p (0 base, 1 body, 2 head, 3 gun)
    const m4 = R.sun.matrix.clone(), v = new (Object.getPrototypeOf(R.sun.position).constructor)();
    R.part = (k, p) => { R.sold.getMatrixAt(k * R.np + p, m4); v.setFromMatrixPosition(m4); const e = m4.elements; return { x: v.x, y: v.y, z: v.z, sy: Math.hypot(e[4], e[5], e[6]), upY: e[5] / (Math.hypot(e[4], e[5], e[6]) || 1) }; };
    R.slotOf = (pos) => { let best = -1, bd = 1e9; for (let k = 0; k < 11; k++) { const b = R.part(k, 0); const d = Math.hypot(b.x - pos[0], b.z - pos[2]) + Math.abs(b.y - pos[1]) * 0.3; if (d < bd) { bd = d; best = k; } } return bd < 2 ? best : -1; };
    // silhouette of slot k from the current probe view: pixels that change when its four instances are hidden
    R.silhouette = (k) => { __game.render(); const A = R.full(); for (let p = 0; p < R.np; p++) R.hide.add(k * R.np + p); __game.render(); const B = R.full(); R.hide.clear(); __game.render();
      const gl = R.gl(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let i = 0; i < W * H; i++) { const j = i * 4; if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 24) { n++; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      return { px: n, w: n ? x1 - x0 + 1 : 0, h: n ? y1 - y0 + 1 : 0 }; };
    R.copy = () => { const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; };
    R.sheet = (frames, crop, scale, cols) => { cols = cols || frames.length; const rows = Math.ceil(frames.length / cols), o = document.createElement('canvas'), w = crop[2] * scale, hh = crop[3] * scale;
      o.width = (w + 4) * cols; o.height = (hh + 4) * rows; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      frames.forEach((f, i) => g.drawImage(f, crop[0], crop[1], crop[2], crop[3], (i % cols) * (w + 4), ((i / cols) | 0) * (hh + 4), w, hh)); return o.toDataURL('image/png'); };
  });
}
module.exports = { open, install, dE, hex, SHOTS };
