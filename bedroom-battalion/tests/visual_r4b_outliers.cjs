// Round 4 (full): the R4A-4 fit outliers on the 4B snapshot, with exact positions. For each, the ray from 3 units
// outside the collider face: the first rendered mesh it hits (name, point, which object owns that triangle region)
// against the collider face, and a screenshot from beside the ray with the art hit point in the centre.
process.env.VIS_FILE = process.env.VIS_FILE || require('path').resolve(__dirname, '..', 'snapshots', 'index_r4b.html');
const fs = require('fs'); const path = require('path');
const { open } = require('./visual_r3_lib.cjs');
const CASES = [['n.fort.wall.e1', [73.25, 1.65, 10], [0, 0, 1]], ['s.fort.wall.e1', [73.25, 1.65, 150], [0, 0, -1]], ['desk.yoyo.body', [111, 0.7, 46.8], [0, 0, 1]],
  ['ruin.w.sill', [51.75, 0.6, 75.5], [0, 0, 1]], ['ruin.e.sill', [68.25, 0.6, 75.5], [0, 0, 1]], ['s.tall.L3', [105, 59.5, 136], [1, 0, 0]], ['s.C-c.marble.tower', [65.5, 11, 114.5], [0, -1, 0]]];
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const r = await h.page.evaluate(async (CASES) => { const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'); const R = window.__r3, S = window.__three.scenes[0]; S.updateMatrixWorld(true);
    const meshes = []; S.traverse((o) => { if (o.isMesh && o.visible && !o.material.transparent && o.material.type !== 'ShaderMaterial' && !/^soldier|^fx|^train/.test(o.name || '')) { if (o.isInstancedMesh) { o.boundingSphere = null; o.computeBoundingSphere(); } meshes.push(o); } });
    const rc = new THREE.Raycaster(), out = [], F = [];
    for (const [id, o, d] of CASES) { const k = __game.raycast(o, d); rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d)); rc.far = 6; const hh = rc.intersectObjects(meshes, false);
      const hit = hh[0]; const pt = hit ? [hit.point.x, hit.point.y, hit.point.z].map((v) => +v.toFixed(2)) : null;
      // which colliders contain or touch the art hit point (within 0.05)?
      const owners = pt ? __game.colliders.filter((c) => c.x1 !== undefined && pt[0] > c.x0 - 0.05 && pt[0] < c.x1 + 0.05 && pt[1] > c.y0 - 0.05 && pt[1] < c.y1 + 0.05 && pt[2] > c.z0 - 0.05 && pt[2] < c.z1 + 0.05).map((c) => c.id) : [];
      out.push({ id, rayFrom: o, dir: d, colliderHit: k && k.id, colliderPoint: k && k.point.map((v) => +v.toFixed(2)), artPoint: pt, artMesh: hit && (hit.object.name || hit.object.type), artInstance: hit && hit.instanceId, gap: hit && k ? +(hit.distance - k.distance).toFixed(2) : null, collidersAtArtPoint: owners });
      if (pt) { const side = d[1] !== 0 ? [2.5, 2, 2.5] : [d[2] * 2.2, 1.2, -d[0] * 2.2 + (d[0] ? 0 : 0)]; R.cam([pt[0] - d[0] * 2 + side[0], pt[1] - d[1] * 2 + side[1], pt[2] - d[2] * 2 + (d[1] !== 0 ? side[2] : -1.5)], pt); __game.render();
        const c = R.copy(), g = c.getContext('2d'); g.strokeStyle = '#ff00ff'; g.lineWidth = 3; g.beginPath(); g.arc(640, 360, 14, 0, 7); g.stroke(); F.push(c); } }
    __game.clearView(); return { out, url: R.sheet(F, [240, 110, 800, 500], 0.45, 4) }; }, CASES);
  const d = path.resolve(__dirname, '..', 'screenshots', 'round4'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'visual_4_fit_outliers.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  for (const o of r.out) console.log(JSON.stringify(o));
  console.log('sheet order (magenta ring = first art the ray meets):', r.out.filter((o) => o.artPoint).map((o) => o.id).join(', '), '| errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
