// Round 4 check 4 (culling): sweep the camera through every waypoint node, 8 headings and 3 pitches. After render() (which
// runs the chunk culling for that camera), cast 9 rays across the view. Where the collider ray (__game.raycast) meets a
// static surface within 80 units, a visible three.js mesh must be met by sceneRaycast no further than 0.6 beyond it.
// A miss on a collider that is drawn from other poses points at culling; a collider never drawn points at missing art.
// Train cars are checked the same way. Usage: node bug_r4_03_cull_sweep.cjs [build] [nodeStep, default 1]
const path = require('path');
const { launch } = require('./harness.cjs');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const STEP = +(process.argv[3] || 1);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
  const out = await page.evaluate((STEP) => {
    const G = __game; G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots();
    const IGN = /beam|mote|dust|sky|glow$/i;
    const N = Object.entries(G.waypoints.nodes).filter((_, i) => i % STEP === 0);
    const seen = {}, missed = {}, ex = {}, trainSeen = { ok: 0, miss: 0, ex: [] }; let rays = 0, poses = 0;
    for (const [nid, n] of N) for (let k = 0; k < 8; k++) for (const pitch of [0, -0.35, 0.35]) {
      const yaw = k * Math.PI / 4; G.teleport(n[0], n[1], n[2], yaw, pitch); G.step(1 / 60); G.render(); poses++;
      const p = G.state().player, o = [p.x, p.y + 1.6, p.z];
      for (const dy of [-0.26, 0, 0.26]) for (const dx of [-0.44, 0, 0.44]) {
        const yw = yaw + dx, pt = pitch + dy, d = [-Math.sin(yw) * Math.cos(pt), Math.sin(pt), -Math.cos(yw) * Math.cos(pt)];
        const c = G.raycast(o, d); if (!c || c.distance > 80 || c.kind === 'soldier' || c.kind === 'target') continue; rays++;
        const s = (G.sceneRaycast(o, d, c.distance + 1.0) || []).filter((h) => !IGN.test(h.name));
        const ok = s.length && s[0].distance <= c.distance + 0.6;
        if (c.kind === 'train') { if (ok) trainSeen.ok++; else { trainSeen.miss++; if (trainSeen.ex.length < 5) trainSeen.ex.push({ nid, yaw: +yaw.toFixed(2), pitch, hit: c.id, d: +c.distance.toFixed(2), scene: s }); } continue; }
        if (ok) seen[c.id] = (seen[c.id] || 0) + 1;
        else { missed[c.id] = (missed[c.id] || 0) + 1; if (!ex[c.id]) ex[c.id] = { nid, eye: o.map((v) => +v.toFixed(2)), yaw: +yw.toFixed(3), pitch: +pt.toFixed(3), d: +c.distance.toFixed(2), scene: s.slice(0, 2) }; }
      }
    }
    return { poses, rays, seen, missed, ex, trainSeen };
  }, STEP);
  const ids = Object.keys(out.missed).sort((a, b) => out.missed[b] - out.missed[a]);
  const culled = ids.filter((id) => out.seen[id]), never = ids.filter((id) => !out.seen[id]);
  console.log(`poses ${out.poses}, static rays ${out.rays}, colliders seen drawn ${Object.keys(out.seen).length}, colliders with a missed ray ${ids.length}`);
  console.log(`missed on colliders that ARE drawn from other poses (culling suspects): ${culled.length}`);
  for (const id of culled.slice(0, 25)) console.log(`   ${id}: missed ${out.missed[id]} of ${out.missed[id] + out.seen[id]}  e.g. ${JSON.stringify(out.ex[id])}`);
  console.log(`colliders never drawn on any ray (no art, or always hidden): ${never.length}`);
  for (const id of never.slice(0, 25)) console.log(`   ${id}: missed ${out.missed[id]}  e.g. ${JSON.stringify(out.ex[id])}`);
  console.log(`train: rays on cars drawn ${out.trainSeen.ok}, missed ${out.trainSeen.miss}`, JSON.stringify(out.trainSeen.ex));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
