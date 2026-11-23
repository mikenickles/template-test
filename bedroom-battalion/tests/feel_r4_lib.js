// Round 4 feel helpers, injected into the page (works on the round 3 build and the round 4B snapshot).
window.R4 = (() => {
  const G = __game;
  // decode a PNG (base64) to RGBA pixels
  async function pixels(b64) { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data }; }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  function lab(r, g, b) { r = lin(r); g = lin(g); b = lin(b); const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; }
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // compare a frame with the soldier (a) and without (b): soldier mask, its area, local contrast against what it covers, and
  // silhouette contrast against the ring of background just outside its bounding box. Only pixels inside the soldier's projected box count.
  async function soldierContrast(a64, b64, dist) {
    const A = await pixels(a64), B = await pixels(b64), w = A.w, h = A.h; let n = 0, sumLocal = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, sl = [0, 0, 0], sumL = 0;
    const mask = new Uint8Array(w * h);
    // the camera looks at the soldier's chest, so it sits at the screen centre: only count changes inside its projected box (drops its shadow and anything else that moved)
    const Hpx = 1.9 / (2 * dist * Math.tan(37.5 * Math.PI / 180)) * h, bx0 = w / 2 - 0.45 * Hpx - 3, bx1 = w / 2 + 0.45 * Hpx + 3, by0 = h / 2 - 0.6 * Hpx - 3, by1 = h / 2 + 0.55 * Hpx + 3;
    for (let y = Math.max(0, Math.floor(by0)); y < Math.min(h, Math.ceil(by1)); y++) for (let x = Math.max(0, Math.floor(bx0)); x < Math.min(w, Math.ceil(bx1)); x++) { const i = (y * w + x) * 4;
      const d = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]); if (d < 24) continue;
      mask[y * w + x] = 1; n++; const la = lab(A.d[i], A.d[i + 1], A.d[i + 2]), lb = lab(B.d[i], B.d[i + 1], B.d[i + 2]); sumLocal += dE(la, lb); sl[0] += la[0]; sl[1] += la[1]; sl[2] += la[2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!n) return { px: 0 };
    sl = sl.map((v) => v / n);
    // ring: pixels within 6 px outside the bounding box, from the frame without the soldier
    const pad = Math.max(4, Math.round((x1 - x0 + y1 - y0) / 4)); let rn = 0; const rl = [0, 0, 0], ringLab = [];
    for (let y = Math.max(0, y0 - pad); y <= Math.min(h - 1, y1 + pad); y++) for (let x = Math.max(0, x0 - pad); x <= Math.min(w - 1, x1 + pad); x++) { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      const i = (y * w + x) * 4, l = lab(B.d[i], B.d[i + 1], B.d[i + 2]); rl[0] += l[0]; rl[1] += l[1]; rl[2] += l[2]; rn++; ringLab.push(l); }
    const rm = rl.map((v) => v / rn); let rv = 0; for (const l of ringLab) rv += dE(l, rm); rv /= rn;    // background busyness: mean dE of the ring from its own mean
    return { px: n, box: [x1 - x0 + 1, y1 - y0 + 1], local: +(sumLocal / n).toFixed(1), silhouette: +dE(sl, rm).toFixed(1), busy: +rv.toFixed(1), soldierL: +sl[0].toFixed(0), bgL: +rm[0].toFixed(0) };
  }
  // put one bot at a spot (feet), every other soldier out of sight below the floor; freeze-time so nobody moves
  function stage(id, pos, yaw) { for (const b of G.bots) { if (b.id === id) { b.x = pos[0]; b.y = pos[1]; b.z = pos[2]; b.vx = b.vz = 0; if (yaw !== undefined) b.yaw = yaw; } else { b.x = 5; b.y = -60; b.z = 5; } }
    for (const b of G.bots) { b.px = b.x; b.py = b.y; b.pz = b.z; b.prevX = b.x; b.prevY = b.y; b.prevZ = b.z; } }
  return { pixels, lab, dE, soldierContrast, stage };
})();
