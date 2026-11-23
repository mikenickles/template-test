// R4A-1 / R4A-2 / R4A-3 check: per named view the software render cost (median of N frames), the share of the frame clipped to
// white (two or more of r, g, b >= 250; all three reported too), and optionally with art parts hidden (argv[3]: comma list of art mesh names) to cost them.
// argv[2]: build file ('' = current). Tan contrast: a Tan soldier standing (and crouched) on sunlit and shaded floor at 20 and
// 60 units; dE (CIE76) of every soldier pixel against the same pixel rendered without the soldier, median and 10th percentile.
const { launch } = require('./harness.cjs');
const file = process.argv[2] || undefined, hide = process.argv[3] ? process.argv[3].split(',') : [], frames = +(process.argv[4] || 8), doTan = process.argv[5] !== 'notan';
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
(async () => {
  const { browser, page, errors } = await launch(file ? { width: 1280, height: 720, file } : { width: 1280, height: 720 });
  const out = await page.evaluate(([VIEWS, hide, frames, doTan]) => {
    const g = __game, gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), one = new Uint8Array(4), r = { views: {} };
    g.start({ pointerLock: false }); g.setTimeScale(0);
    if (hide.length && g.artDebug) g.artDebug({ hide: hide.map((h) => 'art.' + h) });
    const read = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    for (const v of VIEWS) {
      g.setView(v); g.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
      const t = []; for (let i = 0; i < frames; i++) { const t0 = performance.now(); g.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); t.push(performance.now() - t0); }
      g.render(); const p = read(); let clip = 0, clip3 = 0; for (let i = 0; i < p.length; i += 4) { const n = (p[i] >= 250) + (p[i + 1] >= 250) + (p[i + 2] >= 250); if (n >= 2) clip++; if (n === 3) clip3++; }
      t.sort((a, b) => a - b); r.views[v] = { ms: +t[Math.floor(t.length / 2)].toFixed(1), clippedPct: +(100 * clip / (W * H)).toFixed(2), clippedAll3Pct: +(100 * clip3 / (W * H)).toFixed(2), calls: g.state().drawCalls };
    }
    g.clearView();
    if (doTan) {
      const lab = (R, G, B) => { const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; }; const rr = f(R), gg = f(G), bb = f(B);
        const X = (0.4124 * rr + 0.3576 * gg + 0.1805 * bb) / 0.95047, Y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb, Z = (0.0193 * rr + 0.1192 * gg + 0.9505 * bb) / 1.08883;
        const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
      const cases = [], spots = [[60, 0, 60, 'sun'], [50, 0, 88, 'sun'], [44, 0, 140, 'sun'], [100, 0, 75, 'shade under desk'], [20, 0, 70, 'shade under bed'], [88, 0, 125, 'east floor']];
      for (const [x, y, z, where] of spots) for (const crouch of [false, true]) for (const d of [20, 60]) {
        g.removeBots(); const id = g.spawnBot('tan'); const b = g.bots.find((o) => o.id === id);
        b.x = b.px = x; b.y = b.py = y; b.z = b.pz = z; b.yaw = b.ryaw = 0; b.vx = b.vz = 0; b.crouching = crouch;
        let cx = x, cz = z - d; if (cz < 2) cz = z + d; if (cz > 158) cz = z - d;     // camera along z, in the room
        g.teleport(cx, 0, cz); g.lookAt(x, y + (crouch ? 0.6 : 0.9), z); g.render();
        const A = new Uint8Array(read()); g.removeBots(); g.render(); const B = read();
        const dE = [], fa = [[], [], []], fb = [[], [], []]; for (let i = 0; i < A.length; i += 4) { if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) continue; const a = lab(A[i], A[i + 1], A[i + 2]), c = lab(B[i], B[i + 1], B[i + 2]); dE.push(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])); for (let k = 0; k < 3; k++) { fa[k].push(A[i + k]); fb[k].push(B[i + k]); } }
        dE.sort((p, q) => p - q);
        const med = (L) => { L.sort((p, q) => p - q); return L[Math.floor(L.length / 2)]; };
        let mc = null; if (dE.length) { const a = lab(med(fa[0]), med(fa[1]), med(fa[2])), c = lab(med(fb[0]), med(fb[1]), med(fb[2])); mc = +Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]).toFixed(1); }
        cases.push({ where, crouch, d, px: dE.length, median: dE.length ? +dE[Math.floor(dE.length / 2)].toFixed(1) : null, p10: dE.length ? +dE[Math.floor(dE.length * 0.1)].toFixed(1) : null, colourDE: mc });
      }
      const med = cases.map((c) => c.median).filter((v) => v !== null).sort((a, b) => a - b);
      const cd = cases.map((c) => c.colourDE).filter((v) => v !== null).sort((a, b) => a - b);
      r.tan = { cases, medianOfMedians: med[Math.floor(med.length / 2)], worstMedian: med[0], colourDEmedian: cd[Math.floor(cd.length / 2)], colourDEworst: cd[0] };
    }
    return r;
  }, [VIEWS, hide, frames, doTan]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
