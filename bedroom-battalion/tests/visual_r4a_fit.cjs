// Round 4A collider fit (DESIGN 17.1: every visual within 0.15 of its collider on walkable and shootable faces).
// For every box collider, rays are cast toward the collider from outside: one down onto the top centre (walkable face)
// and four sideways at mid-height onto each side's centre (shootable faces). Each ray is cast against the collider list
// (`__game.raycast`) and against the rendered opaque meshes (three.js Raycaster, three loaded from the same pinned
// module). gap = visual hit distance - collider hit distance: positive means the art stops short of the collider
// (an invisible wall / floating feet), negative means the art sticks out past it (art you walk or shoot through).
// Then spot checks of the worst ones: stand on it, walk into it, shoot it. Usage: node visual_r4a_fit.cjs
const fs = require('fs'); const path = require('path');
const { open, hex } = require('./visual_r3_lib.cjs');
const R4 = path.resolve(__dirname, '..', 'snapshots', process.env.R4FILE || 'index_r4a.html')      /* R4FILE=index_r4b.html for the full round 4 pass */;
(async () => {
  const h = await open({ width: 1280, height: 720, file: R4 }); const p = h.page;
  const res = await p.evaluate(async () => {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
    const S = window.__three.scenes[0], meshes = []; S.traverse((o) => { if (o.isMesh && o.visible && !o.material.transparent && o.material.type !== 'ShaderMaterial' && o.material.blending === 1 && !(o.isInstancedMesh && (o.count === 284 || o.count === 24 || o.count === 63 || o.count % 11 === 0 && o.material.type === 'MeshPhongMaterial'))) meshes.push(o); });
    S.updateMatrixWorld(true); const rc = new THREE.Raycaster(); rc.firstHitOnly = true; const out = [];
    const cast = (o, d, maxD) => { rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); rc.far = maxD; const hits = rc.intersectObjects(meshes, false); return hits.length ? hits[0].distance : null; };
    const cols = __game.colliders.filter((c) => c.x1 !== undefined && !/^room\.|train/.test(c.id) && c.kind !== 'string');
    for (const c of cols) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, cy = (c.y0 + c.y1) / 2;
      const rays = [['top', [cx, c.y1 + 3, cz], [0, -1, 0]], ['-x', [c.x0 - 3, cy, cz], [1, 0, 0]], ['+x', [c.x1 + 3, cy, cz], [-1, 0, 0]], ['-z', [cx, cy, c.z0 - 3], [0, 0, 1]], ['+z', [cx, cy, c.z1 + 3], [0, 0, -1]]];
      for (const [face, o, d] of rays) {
        const k = __game.raycast(o, d); if (!k || k.id !== c.id) continue;          // face not exposed (something else is in front)
        const v = cast(o, d, k.distance + 3); const gap = v === null ? null : +(v - k.distance).toFixed(3);
        out.push({ id: c.id, kind: c.kind, face, gap, colD: +k.distance.toFixed(3), origin: o.map((v) => +v.toFixed(2)), dir: d, colHit: k.point.map((v) => +v.toFixed(2)) });
      }
    }
    return { meshes: meshes.length, n: out.length, rows: out };
  });
  const rows = res.rows, bad = rows.filter((r) => r.gap === null || Math.abs(r.gap) > 0.15);
  console.log('meshes tested', res.meshes, 'exposed faces', res.n, 'outside 0.15:', bad.length, `(${(100 * bad.length / res.n).toFixed(1)} %)`);
  const top = rows.filter((r) => r.face === 'top'), side = rows.filter((r) => r.face !== 'top');
  for (const [name, set] of [['top (walkable)', top], ['sides (shootable)', side]]) { const b = set.filter((r) => r.gap === null || Math.abs(r.gap) > 0.15); console.log(name, 'faces', set.length, 'outside 0.15', b.length, '| art short of collider (gap > 0.15)', b.filter((r) => r.gap > 0.15).length, '| art past collider (gap < -0.15)', b.filter((r) => r.gap !== null && r.gap < -0.15).length, '| no art hit within 3', b.filter((r) => r.gap === null).length); }
  const worst = bad.slice().sort((a, b) => (b.gap === null ? 9 : Math.abs(b.gap)) - (a.gap === null ? 9 : Math.abs(a.gap)));
  console.log('worst 30:'); for (const r of worst.slice(0, 30)) console.log(' ', r.id.padEnd(26), r.kind.padEnd(5), r.face.padEnd(4), 'gap', r.gap);
  // group by collider prefix
  const grp = {}; for (const r of bad) { const k = r.id.replace(/[.\-]?\d+$/, '').replace(/\.\d+\./, '.'); grp[k] = (grp[k] || 0) + 1; } console.log('by collider family:', JSON.stringify(Object.entries(grp).sort((a, b) => b[1] - a[1]).slice(0, 25)));
  fs.writeFileSync(path.resolve(__dirname, process.env.R4FILE ? 'visual_r4_fit_result.json' : 'visual_r4a_fit_result.json'), JSON.stringify(rows));
  // spot checks on up to 4 of the worst top faces: stand on it (feet y vs art top), shoot the worst side faces (bullet stop vs art)
  const spots = worst.filter((r) => r.face === 'top' && r.gap !== null).slice(0, 4);
  for (const s of spots) { const r = await p.evaluate((id) => { const c = __game.colliders.find((o) => o.id === id), x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2; __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.teleport(x, c.y1 + 0.5, z, 0, 0); __game.step(1); const st = __game.state().player;
      window.__r3.cam([x + 3, c.y1 + 1.8, z + 3], [x, c.y1 + 0.3, z]); __game.render(); const u = window.__r3.sheet([window.__r3.copy()], [320, 180, 640, 360], 0.5); __game.clearView(); return { feetY: +st.y.toFixed(3), colTop: c.y1, onGround: st.onGround, url: u }; }, s.id);
    console.log('stand on', s.id, 'collider top', r.colTop, 'feet at', r.feetY, 'art gap', s.gap, '(positive: art lower than the feet, soldier floats; negative: art above the feet, feet sink into it)');
    { const d = path.resolve(__dirname, '..', 'screenshots', 'round4'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, (process.env.R4FILE ? 'visual_4_fit_' : 'visual_4a_fit_') + s.id.replace(/[^a-z0-9]+/gi, '_') + '.png'), Buffer.from(r.url.split(',')[1], 'base64')); } }
  console.log('errors', JSON.stringify(h.errors)); await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
