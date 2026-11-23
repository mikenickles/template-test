// Shared helpers for the visual and performance tester. Uses the team harness; never touches index.html.
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');

const SHOTS = path.resolve(__dirname, '..', 'screenshots');
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];

// Counts every WebGL draw call per framebuffer (so the shadow pass is visible), triangles, and texture uploads.
// Installed with addInitScript and a reload, so it sees context creation and every texture upload.
function glProbe() {
  const P = WebGL2RenderingContext.prototype;
  const S = (window.__gl = { fb: null, passes: {}, tex: [], rbo: [], viewports: [], reset() { this.passes = {}; this.viewports = []; } });
  const fbIds = new Map();
  const pass = () => {
    const k = S.fb === null ? 'screen' : 'fbo' + S.fb;
    return S.passes[k] || (S.passes[k] = { calls: 0, tris: 0, lines: 0, verts: 0, instanced: 0 });
  };
  const count = (mode, n, inst) => {
    const p = pass(); p.calls++; p.verts += n * inst;
    if (inst > 1) p.instanced++;
    if (mode === 4) p.tris += (n / 3) * inst; else if (mode === 1) p.lines += (n / 2) * inst; else if (mode === 5 || mode === 6) p.tris += (n - 2) * inst;
  };
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { fn.apply(this, a); return o.apply(this, a); }; };
  wrap('bindFramebuffer', function (t, fb) { if (fb && !fbIds.has(fb)) fbIds.set(fb, fbIds.size + 1); if (t !== 0x8CA8) S.fb = fb ? fbIds.get(fb) : null; });
  wrap('drawArrays', (m, f, n) => count(m, n, 1));
  wrap('drawElements', (m, n) => count(m, n, 1));
  wrap('drawRangeElements', (m, s, e, n) => count(m, n, 1));
  wrap('drawArraysInstanced', (m, f, n, i) => count(m, n, i));
  wrap('drawElementsInstanced', (m, n, t, o, i) => count(m, n, i));
  wrap('viewport', function (x, y, w, h) { S.viewports.push([S.fb === null ? 'screen' : 'fbo' + S.fb, w, h]); });
  wrap('texImage2D', function (...a) {
    let w, h; const src = a[a.length - 1];
    if (a.length >= 9) { w = a[3]; h = a[4]; } else if (src) { w = src.width || src.videoWidth; h = src.height || src.videoHeight; }
    S.tex.push({ fn: 'texImage2D', target: a[0], level: a[1], ifmt: a[2], w, h });
  });
  wrap('texStorage2D', (t, levels, ifmt, w, h) => S.tex.push({ fn: 'texStorage2D', target: t, levels, ifmt, w, h }));
  wrap('texStorage3D', (t, levels, ifmt, w, h, d) => S.tex.push({ fn: 'texStorage3D', target: t, levels, ifmt, w, h, d }));
  wrap('renderbufferStorage', (t, ifmt, w, h) => S.rbo.push({ ifmt, w, h, samples: 0 }));
  wrap('renderbufferStorageMultisample', (t, s, ifmt, w, h) => S.rbo.push({ ifmt, w, h, samples: s }));
}

async function open({ width = 1280, height = 720, probe = false, start = true } = {}) {
  const h = await launch({ width, height });
  if (probe) {
    await h.page.addInitScript(glProbe);
    await h.page.reload();
    await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  }
  if (start) await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  return h;
}

// Camera to a named view, optional debug, one synchronous render; then a page screenshot.
async function shotView(h, view, file, { debug = false } = {}) {
  await h.page.evaluate(([v, d]) => { __game.setDebug(d); __game.setView(v); __game.render(); }, [view, debug]);
  await h.page.waitForTimeout(120);
  await h.page.evaluate(() => __game.render());
  return h.shot(file);
}

// Free camera through the player: eye at (x, y, z) looking at a target. Time scale must be 0 so the player hangs.
async function freeCam(h, eye, target) {
  await h.page.evaluate(([e, t]) => {
    __game.clearView(); __game.setTimeScale(0);
    __game.teleport(e[0], e[1] - __game.CONFIG.player.eye, e[2]);
    __game.lookAt(t[0], t[1], t[2]);
    __game.render();
  }, [eye, target]);
}

// The WebGL canvas only (no DOM overlay), grabbed in the same task as the render so the buffer is valid.
async function grabCanvas(h, file) {
  const url = await h.page.evaluate(() => { __game.render(); return document.getElementById('view').toDataURL('image/png'); });
  const out = path.resolve(SHOTS, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  return out;
}

module.exports = { open, shotView, freeCam, grabCanvas, VIEWS, SHOTS, glProbe };
