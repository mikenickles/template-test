// Round 4A look, on the 4A snapshot and the round 3 baseline:
//  - the nine named views, saved as round 3 | 4A pairs, plus clipped (over-bright) pixel share per view;
//  - sun on the floor: open floor points every 2 units seen from above, lit if switching the sun off changes the pixel;
//  - darkness under the bed and under the desk against open floor in shade (luminance);
//  - the sunbeam volume and dust motes: pixels they change in a view toward the window;
//  - route close-ups (4A only).
// Usage: BB_TMP=<scratch dir holding bb_index_r3_c90ee3c.html, written by visual_r4a_budget.cjs> node visual_r4a_look.cjs
const fs = require('fs'); const path = require('path'); const os = require('os');
const { open, dE, hex } = require('./visual_r3_lib.cjs');
const SHOTS = path.resolve(__dirname, '..', 'screenshots', 'round4');
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
const R3 = path.join(process.env.BB_TMP || os.tmpdir(), 'bb_index_r3_c90ee3c.html'), R4 = path.resolve(__dirname, '..', 'snapshots', process.env.R4FILE || 'index_r4a.html')      /* R4FILE=index_r4b.html for the full round 4 pass */;
const save = (file, url) => { if (process.env.R4FILE) file = file.replace('visual_4a_', 'visual_4_'); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64')); };
const ROUTES = [   // [name, eye, target]
  ['book stairs (south, bed)', [36, 1.6, 150], [26, 8, 140]], ['ruler from the chair seat', [88, 18.6, 77], [94, 24, 66]],
  ['skateboard / chair stairs', [76, 2.5, 62], [88, 6, 72]], ['yo-yo string', [99, 2, 50], [107, 14, 53.3]],
  ['tall shelf string', [100, 2, 150], [110, 22, 140]], ['shoelace', [100, 14, 46], [108, 18, 56]],
  ['spring pad', [46, 3, 74], [38, 0, 80]], ['P2 ribbon from the bed top', [26, 19.6, 88], [24, 19.5, 104]],
];
async function survey(file, tag) {
  const h = await open({ width: 1280, height: 720, file }); const p = h.page; const out = { tag };
  await p.evaluate(() => {
    const R = window.__r3;
    R.proj = (e, t, pt) => { const f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]], fl = Math.hypot(...f); f.forEach((v, i) => f[i] = v / fl);
      let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);      // right = f x up
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const v = [pt[0] - e[0], pt[1] - e[1], pt[2] - e[2]], z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; if (z < 0.1) return null;
      const ty = Math.tan(__game.CONFIG.camera.fovVertical * Math.PI / 360), tx = ty * 1280 / 720;
      const sx = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / z / tx, sy = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / z / ty;
      return [Math.round((sx + 1) / 2 * 1280), Math.round((1 - sy) / 2 * 720)]; };
    R.at = (buf, x, y) => { const i = ((719 - y) * 1280 + x) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };
  });
  out.views = await p.evaluate((V) => { const R = window.__r3, o = {}; for (const v of V) { __game.setView(v); __game.render(); const b = R.full(); let clip = 0;
      for (let i = 0; i < b.length; i += 4) if ((b[i] >= 253) + (b[i + 1] >= 253) + (b[i + 2] >= 253) >= 2) clip++;
      const c = document.getElementById('view'), s = document.createElement('canvas'); s.width = 640; s.height = 360; s.getContext('2d').drawImage(c, 0, 0, 640, 360);
      o[v] = { clipPct: +(100 * clip / (b.length / 4)).toFixed(2), url: s.toDataURL('image/png') }; } __game.clearView(); return o; }, VIEWS);
  out.sun = await p.evaluate(() => { const R = window.__r3, I = R.sun.intensity; let pts = 0, lit = 0, under = 0; const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const shadeL = [], underBedL = [], underDeskL = [];
    for (const zc of [30, 80, 130]) { const e = [60, 86, zc - 22], t = [60, 0, zc]; R.cam(e, t); __game.render(); const A = R.full(); R.sun.intensity = 0; __game.render(); const B = R.full(); R.sun.intensity = I;
      for (let x = 1; x < 120; x += 2) for (let z = zc - 25; z < zc + 25; z += 2) { const pt = [x, 0.01, z], s = R.proj(e, t, pt); if (!s || s[0] < 0 || s[0] > 1279 || s[1] < 0 || s[1] > 719) continue;
        const rc = __game.raycast(e, [x - e[0], 0.01 - e[1], z - e[2]]), L = Math.hypot(x - e[0], 0.01 - e[1], z - e[2]); if (!rc || rc.id !== 'room.floor' || Math.abs(rc.distance - L) > 0.5) continue;
        pts++; const a = R.at(A, s[0], s[1]), b = R.at(B, s[0], s[1]); if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 15) lit++; else shadeL.push(lum(a)); } }
    // under the bed / desk: points seen from the floor beside them
    const look = (e, list, store) => { for (const pt of list) { const t = pt; R.cam(e, t); __game.render(); store.push(lum(R.rd(0, 0, 5))); } };
    const bedPts = []; for (let z = 60; z <= 100; z += 8) bedPts.push([14, 0.01, z]); look([40, 1.2, 80], bedPts, underBedL);
    const deskPts = []; for (let z = 70; z <= 90; z += 5) deskPts.push([108, 0.01, z]); look([84, 1.2, 80], deskPts, underDeskL);
    const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(1) : null; };
    __game.clearView(); return { floorPoints: pts, sunlit: lit, pct: +(100 * lit / pts).toFixed(1), openShadeLum: med(shadeL), underBedLum: med(underBedL), underDeskLum: med(underDeskL) }; });
  // sunbeam and dust: hide transparent ShaderMaterial meshes and Points; pixels changed in a view across the beam
  out.beam = await p.evaluate(() => { const R = window.__r3, S = window.__three.scenes[0], fx = []; S.traverse((o) => { if ((o.isPoints) || (o.isMesh && o.material.type === 'ShaderMaterial' && o.material.transparent)) fx.push(o); });
    if (!fx.length) return { parts: 0 }; const res = { parts: fx.map((o) => o.type) }; const shots = [];
    for (const [e, t] of [[[100, 4, 100], [20, 20, 80]], [[60, 1.6, 120], [40, 6, 80]]]) { R.cam(e, t); __game.render(); const A = R.full(); shots.push(R.copy()); fx.forEach((o) => (o.visible = false)); __game.render(); const B = R.full(); fx.forEach((o) => (o.visible = true));
      let n = 0, s = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); if (d > 12) { n++; s += d; } } (res.views = res.views || []).push({ pctChanged: +(100 * n / (A.length / 4)).toFixed(1), meanDelta: n ? +(s / n / 3).toFixed(1) : 0 }); }
    __game.clearView(); res.url = R.sheet(shots, [0, 0, 1280, 720], 0.45, 2); return res; });
  if (tag === 'r4a') {
    out.routes = await p.evaluate((ROUTES) => { const R = window.__r3, F = []; for (const [, e, t] of ROUTES) { R.cam(e, t); __game.render(); F.push(R.copy()); } __game.clearView(); return R.sheet(F, [160, 90, 960, 540], 0.42, 4); }, ROUTES);
    out.fog = await p.evaluate(() => ({ fog: __game.CONFIG.fog, haze: __game.CONFIG.color.haze }));
  }
  out.errors = h.errors; await h.browser.close(); return out;
}
(async () => {
  const a = await survey(R3, 'r3'), b = await survey(R4, 'r4a');
  for (const v of VIEWS) console.log(v.padEnd(13), 'clipped px r3', a.views[v].clipPct + '%', '4A', b.views[v].clipPct + '%');
  console.log('sun on open floor', 'r3', JSON.stringify(a.sun), '| 4A', JSON.stringify(b.sun));
  console.log('beam/dust r3', JSON.stringify({ parts: a.beam.parts, views: a.beam.views }), '| 4A', JSON.stringify({ parts: b.beam.parts, views: b.beam.views }));
  console.log('fog', JSON.stringify(b.fog), 'errors', JSON.stringify(a.errors), JSON.stringify(b.errors));
  if (b.beam.url) save('visual_4a_beam.png', b.beam.url);
  save('visual_4a_routes.png', b.routes);
  console.log('routes sheet order:', ROUTES.map((r) => r[0]).join(', '));
  // pairs: r3 left, 4A right, three views per sheet, built in a throwaway page
  const { chromium } = require('playwright'); const br = await chromium.launch(); const pg = await br.newPage();
  for (let s = 0; s < 3; s++) { const vs = VIEWS.slice(s * 3, s * 3 + 3);
    const url = await pg.evaluate(async ([pairs]) => { const c = document.createElement('canvas'); c.width = 1284; c.height = 364 * pairs.length; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < pairs.length; i++) for (let j = 0; j < 2; j++) { const im = new Image(); im.src = pairs[i][j]; await im.decode(); g.drawImage(im, j * 644, i * 364); } return c.toDataURL('image/png'); }, [vs.map((v) => [a.views[v].url, b.views[v].url])]);
    save(`visual_4a_views_${s + 1}.png`, url); console.log('views sheet', s + 1, vs.join(', '), '(round 3 left, 4A right)'); }
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
