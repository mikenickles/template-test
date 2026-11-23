// Round 4 fix pass, R4-1: Green and Tan against what is behind them, as rendered (sun and shade). For each place and distance the
// camera is put on a circle round the soldier where nothing blocks the view (and, for the cover places, where the ray carried past
// the soldier lands on that cover). dE (CIE76) between the soldier's median colour and the median colour of the same pixels
// rendered without it; also the median of per-pixel dE. Standing and kneeling. Also: share of each named view (no soldiers)
// within dE 25 of Tan. Args: [file]
const { launch } = require('./harness.cjs');
const file = process.argv[2] || undefined;
(async () => {
  const { browser, page, errors } = await launch(file ? { width: 1280, height: 720, file } : { width: 1280, height: 720 });
  const out = await page.evaluate(() => {
    const g = __game, gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
    g.start({ pointerLock: false }); g.setTimeScale(0);
    const lab = (R, G, B) => { const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; }; const rr = f(R), gg = f(G), bb = f(B);
      const X = (0.4124 * rr + 0.3576 * gg + 0.1805 * bb) / 0.95047, Y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb, Z = (0.0193 * rr + 0.1192 * gg + 0.9505 * bb) / 1.08883, h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
      return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
    const read = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const places = [['west lane', [38.5, 0, 62], null], ['centre lane', [60, 0, 48], null], ['east lane', [92, 0, 40], null], ['sunbeam', [47.5, 0, 72], null], ['under the bed', [22, 0, 76], null],
      ['yellow car N (old)', [37.3, 0, 59], /n\.W-b\.car/], ['yellow car S (old)', [37.3, 0, 101], /s\.W-b\.car/], ['ruin (old orange)', [60, 0, 69.5], /^ruin\./], ['truck cab (old)', [60, 0, 52.5], /C-c\.truck/], ['s.W-c block', [37.3, 0, 89.5], /s\.W-c/]];
    const findCam = (p, d, target) => {
      for (let k = 0; k < 72; k++) {
        const a = k * Math.PI / 36, cx = p[0] + Math.cos(a) * d, cz = p[2] + Math.sin(a) * d;
        if (cx < 1 || cx > 119 || cz < 1 || cz > 159) continue;
        const o = [cx, 1.6, cz], dir = [p[0] - cx, 0.9 - 1.6, p[2] - cz], L = Math.hypot(...dir);
        const h = g.raycast(o, dir); if (h && h.distance < L - 0.6) continue;
        if (target) { const o2 = [p[0] + dir[0] / L * 0.8, 0.9 + dir[1] / L * 0.8, p[2] + dir[2] / L * 0.8], h2 = g.raycast(o2, dir); if (!h2 || !target.test(h2.id) || h2.distance > 12) continue; }
        return o;
      }
      return null;
    };
    const rows = [];
    for (const [name, p, target] of places) for (const team of ['green', 'tan']) for (const crouch of [false, true]) for (const d of [20, 40, 60]) {
      if (d === 20 && !target) continue;
      const cam = findCam(p, d, target); if (!cam) { rows.push({ name, team, crouch, d, cam: null }); continue; }
      g.removeBots(); const id = g.spawnBot(team); const b = g.bots.find((o) => o.id === id);
      b.x = b.px = p[0]; b.y = b.py = 0; b.z = b.pz = p[2]; b.yaw = b.ryaw = Math.atan2(-(cam[0] - p[0]), -(cam[2] - p[2])) + Math.PI; b.vx = b.vz = 0; b.crouching = crouch; b.onGround = true;
      g.teleport(cam[0], 0, cam[2]); g.lookAt(p[0], crouch ? 0.6 : 0.9, p[2]); g.render();
      const A = new Uint8Array(read()); g.removeBots(); g.render(); const B = read();
      const dE = [], fa = [[], [], []], fb = [[], [], []];
      for (let i = 0; i < A.length; i += 4) { if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) continue; const a = lab(A[i], A[i + 1], A[i + 2]), c = lab(B[i], B[i + 1], B[i + 2]); dE.push(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])); for (let k = 0; k < 3; k++) { fa[k].push(A[i + k]); fb[k].push(B[i + k]); } }
      const med = (Lx) => { Lx.sort((x, y) => x - y); return Lx[Math.floor(Lx.length / 2)]; };
      let cd = null; if (dE.length) { const a = lab(med(fa[0]), med(fa[1]), med(fa[2])), c = lab(med(fb[0]), med(fb[1]), med(fb[2])); cd = +Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]).toFixed(1); }
      dE.sort((x, y) => x - y);
      rows.push({ name, team, crouch, d, px: dE.length, colourDE: cd, pixelMedian: dE.length ? +dE[Math.floor(dE.length / 2)].toFixed(1) : null, cam: cam.map((v) => +v.toFixed(1)) });
    }
    // rendered cover colour: share of each named view within dE 25 of Tan (no soldiers in the views)
    const tan = lab(0xD9, 0xA7, 0x5A), views = {};
    for (const v of ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane']) {
      g.setView(v); g.render(); const P = read(); let n = 0;
      for (let i = 0; i < P.length; i += 16) { const a = lab(P[i], P[i + 1], P[i + 2]); if (Math.hypot(a[0] - tan[0], a[1] - tan[1], a[2] - tan[2]) < 25) n++; }
      views[v] = +(100 * n / (P.length / 16)).toFixed(2);
    }
    g.clearView();
    return { rows, tanLikePctByView: views };
  });
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
