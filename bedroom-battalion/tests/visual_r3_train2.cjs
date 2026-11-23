// Round 3 train, second pass: render determinism baseline, z-fighting as a difference image (engine rear trim, gondola
// door posts, couplings) saved for inspection, the flatbed's cargo block, wheels on the rails, the consist from the
// floor at 15 to 60 units, and a bot forced over the east ride edge (`botGoto(id, node, {via: 'ride.e'})`) with its
// feet height against the deck while it rides.
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  const toS = (s) => p.evaluate((s) => { let k = 0; while (k++ < 4000) { const T = __game.state().train; const d = ((s - T.s) % T.length + T.length) % T.length; if (d < 0.05) break; __game.step(Math.min(10, Math.max(1 / 60, d / 4))); } return __game.state().train.cars; }, s);
  const cars = await toS(27.5 + 30);       // consist on the west straight, engine at the north end
  const by = (t) => cars.find((c) => c.type === t);
  // ---- z-fighting: two renders with the eye moved 0.004; diff image = |A-B| x4; blobs counted ----
  const zf = await p.evaluate((cars) => { const R = window.__r3, by = (t) => cars.find((c) => c.type === t), out = [];
    const e0 = by('engine'), g = by('gondola'), dz = by('boxcar').pos[2] > e0.pos[2] ? 1 : -1;
    const spots = [['baseline (no move)', [e0.pos[0] + 4, 4.4, e0.pos[2] + 7 * dz], [e0.pos[0], 3.9, e0.pos[2] + 6 * dz], 0],
      ['engine rear, square-on', [e0.pos[0] + 2.2, 4.4, e0.pos[2] + 9 * dz], [e0.pos[0], 3.9, e0.pos[2] + 6 * dz], 1],
      ['engine rear, oblique', [e0.pos[0] + 4, 4.4, e0.pos[2] + 7 * dz], [e0.pos[0], 3.9, e0.pos[2] + 6 * dz], 1],
      ['gondola door posts', [g.pos[0] + 4.5, 2.2, g.pos[2] + 1], [g.pos[0] + 2, 1.8, g.pos[2]], 1],
      ['gondola door posts, oblique', [g.pos[0] + 4, 2.4, g.pos[2] + 3.5], [g.pos[0] + 2, 1.8, g.pos[2] + 1.6], 1]];
    const frames = [];
    for (const [name, e, t, mv] of spots) {
      R.cam(e, t); __game.render(); const A = R.full(), fa = R.copy(); R.cam([e[0] + 0.004 * mv, e[1] + 0.003 * mv, e[2] + 0.004 * mv], t); __game.render(); const B = R.full();
      const gl = R.gl(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, d = document.createElement('canvas'); d.width = W; d.height = H; const dc = d.getContext('2d'), im = dc.createImageData(W, H); let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 4, v = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])); if (v > 48) n++; im.data[o] = im.data[o + 1] = im.data[o + 2] = Math.min(255, v * 4); im.data[o + 3] = 255; }
      dc.putImageData(im, 0, 0); frames.push(fa, d); out.push([name, n]);
    }
    return { out, url: R.sheet(frames, [0, 0, 1280, 720], 0.35, 2) }; }, cars);
  h.save('visual_train_zfight.png', zf.url); console.log('z-fight px changed >48 (frame | diff x4 in the sheet):', JSON.stringify(zf.out));
  // ---- close views: cargo block, wheels on rails, consist from the floor ----
  const fr = await p.evaluate((cars) => { const R = window.__r3, by = (t) => cars.find((c) => c.type === t), f = by('flatbed'), b = by('boxcar'), F = [];
    const v = (e, t) => { R.cam(e, t); __game.render(); F.push(R.copy()); };
    v([f.pos[0] + 7, 6, f.pos[2] - 6], [f.pos[0], 2, f.pos[2]]);
    v([b.pos[0] + 2.6, 0.35, b.pos[2] - 3.4], [b.pos[0] + 1.6, 0.3, b.pos[2] - 4.7]);
    v([b.pos[0] - 2.4, 0.9, b.pos[2] - 7.5], [b.pos[0] - 1.6, 0.35, b.pos[2] - 4.7]);
    v([20, 1.6, 64], [43, 2.5, 82]);
    v([100, 1.6, 46], [43, 2.5, 82]);
    return R.sheet(F, [0, 0, 1280, 720], 0.4, 3); }, cars);
  h.save('visual_train_close.png', fr);
  // ---- rider: a Green bot over ride.e ----
  const ride = await p.evaluate(() => {
    const id = __game.spawnBot('green', 'n.c.y'); const path = __game.botGoto(id, 's.c.y', { via: 'ride.e' }); const out = { id, path, samples: 0, types: {}, dev: [], worst: 0 }; let shot = null;
    const top = { flatbed: [1.2, 4.2], gondola: [1.2], engine: [5, 6], boxcar: [5], caboose: [5] };
    for (let i = 0; i < 60 * 150; i++) { __game.step(1 / 60); const b = __game.state().bots.find((o) => o.id === id); if (!b) break;
      if (b.riding) { out.samples++; out.types[b.riding] = (out.types[b.riding] || 0) + 1; const dy = Math.min(...top[b.riding].map((t) => Math.abs(b.pos[1] - t))); out.worst = Math.max(out.worst, +dy.toFixed(3));
        const k = window.__r3.slotOf(b.pos), base = k >= 0 ? window.__r3.part(k, 0) : null; if (base) out.dev.push(+(base.y - 0.025 - b.pos[1]).toFixed(3));
        if (!shot && out.samples === 120) { window.__r3.cam([b.pos[0] - 6, b.pos[1] + 2.2, b.pos[2] - 4], [b.pos[0], b.pos[1] + 0.8, b.pos[2]]); __game.render(); shot = window.__r3.copy(); out.at = b.pos.map((v) => +v.toFixed(2)); } }
      else if (out.samples > 30) { out.off = b.pos.map((v) => +v.toFixed(2)); break; } }
    out.devRange = out.dev.length ? [Math.min(...out.dev), Math.max(...out.dev)] : null; delete out.dev;
    out.url = shot ? window.__r3.sheet([shot], [240, 60, 800, 600], 1) : null; __game.removeBots(); return out; });
  if (ride.url) h.save('visual_train_rider.png', ride.url); delete ride.url;
  console.log('rider', JSON.stringify(ride));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
