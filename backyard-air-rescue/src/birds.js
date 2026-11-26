import * as THREE from 'three';
import { tg, merge, rnd, rr, clamp } from './util.js';
import { L } from './world.js';

const PALETTES = [
  { body: 0x7d6a5c, belly: 0xf47b3a, wing: 0x5e4e44, head: 0x4a3c36 },   // robin
  { body: 0x3d84de, belly: 0xf6b98e, wing: 0x2f68b8, head: 0x3d84de },   // bluebird
  { body: 0xffd23f, belly: 0xfff0a0, wing: 0x2e2e34, head: 0xffd23f },   // goldfinch
  { body: 0xd9282e, belly: 0xe84a4a, wing: 0xb81e26, head: 0xd9282e },   // cardinal
];

// Each bird is four meshes (body, head, two wings): parts are merged with per-vertex colours so a yard full of birds stays cheap to draw.
const birdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.5 });
const _c = new THREE.Color();
function cg(geo, color, p, r, sc) {
  const g = tg(geo, p, r, sc), n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color); // Color.set already converts to the linear working space
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const mesh = (parent, geos, shadow = true) => { const m = new THREE.Mesh(merge(geos), birdMat); m.castShadow = shadow; parent.add(m); return m; };
function makeBird(pal) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  mesh(body, [
    cg(new THREE.SphereGeometry(0.26, 14, 10), pal.body, [0, 0.32, 0], [0, 0, 0], [1, 0.92, 1.3]),
    cg(new THREE.SphereGeometry(0.22, 12, 8), pal.belly, [0, 0.27, 0.1], [0, 0, 0], [0.92, 0.85, 1.05]),
    cg(new THREE.ConeGeometry(0.11, 0.36, 4), pal.wing, [0, 0.38, -0.36], [-Math.PI / 2 - 0.5, 0, 0], [1.4, 1, 0.35]),
    cg(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 4), 0xffa21f, [-0.07, 0.07, 0.02]),
    cg(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 4), 0xffa21f, [0.07, 0.07, 0.02]),
  ]);
  const head = new THREE.Group(); head.position.set(0, 0.52, 0.24); body.add(head);
  const hg = [cg(new THREE.SphereGeometry(0.17, 12, 10), pal.head), cg(new THREE.ConeGeometry(0.05, 0.16, 6), 0xffa21f, [0, -0.02, 0.2], [Math.PI / 2, 0, 0])];
  for (const sx of [-1, 1]) hg.push(cg(new THREE.SphereGeometry(0.035, 6, 6), 0x141418, [sx * 0.1, 0.04, 0.12]), cg(new THREE.SphereGeometry(0.013, 4, 4), 0xffffff, [sx * 0.1 + 0.012, 0.056, 0.148]));
  if (pal.body === 0xd9282e) hg.push(cg(new THREE.ConeGeometry(0.08, 0.2, 6), pal.head, [0, 0.17, -0.04], [-0.4, 0, 0])); // crest
  mesh(head, hg);
  const wings = [];
  for (const sx of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(sx * 0.18, 0.4, 0.02); body.add(pv);
    mesh(pv, [cg(new THREE.SphereGeometry(0.2, 10, 6), pal.wing, [sx * 0.17, 0, -0.04], [0, 0, 0], [1.3, 0.2, 0.75])]);
    wings.push(pv);
  }
  return { g, body, head, wings };
}

// places a bird can land: lawn spots (where it hops and pecks) and perches
function perchSpots() {
  const s = [];
  for (const [x, z] of [[-12, 4], [-2, -4], [6, 14], [-20, -2], [18, 6], [-6, 16], [28, -14], [30, 10], [48, 2], [38, -18], [58, -6], [66, 14], [-26, 18], [12, -20]]) s.push({ x, y: 0, z, ground: true });
  for (let x = -28; x < 70; x += 9) s.push({ x: x + rr(-2, 2), y: 5.25, z: -33.55, ground: false });                 // back fence rail
  s.push({ x: L.shed.x - 1.8, y: 7.15, z: L.shed.z + 0.3, ground: false }, { x: L.shed.x + 1.2, y: 7.15, z: L.shed.z - 0.6, ground: false }); // shed ridge
  s.push({ x: L.tower.x - 2.5, y: 9.08, z: L.tower.z + 2.5, ground: false }, { x: L.tower.x + 2.5, y: 9.08, z: L.tower.z + 2.5, ground: false }); // tower posts
  s.push({ x: L.planter.x - 4, y: 1.12, z: L.planter.z + L.planter.d / 2, ground: false }, { x: L.planter.x + 3, y: 1.12, z: L.planter.z - L.planter.d / 2, ground: false });
  s.push({ x: L.hammock.x - L.hammock.half, y: L.hammock.pivotY + 0.62, z: L.hammock.z, ground: false });
  return s;
}

export function buildBirds(scene, audio) {
  const spots = perchSpots();
  const NB = 7, birds = [];
  for (let i = 0; i < NB; i++) {
    const b = makeBird(PALETTES[i % PALETTES.length]); b.g.scale.setScalar(1.45); scene.add(b.g);
    const sp = spots[(i * 5) % spots.length];
    b.g.position.set(sp.x, sp.y, sp.z); b.g.rotation.y = rnd() * 6.28;
    birds.push(Object.assign(b, { spot: sp, state: 'perch', timer: rr(0.5, 2), act: 'look', actT: 0, flight: null, flap: rnd() * 6, active: true, idleT: rr(15, 40) }));
  }
  // a little flock that crosses the yard now and then
  const flock = [];
  for (let i = 0; i < 5; i++) { const b = makeBird(PALETTES[(i + 1) % PALETTES.length]); b.g.scale.setScalar(1.3); b.g.visible = false; scene.add(b.g); flock.push(Object.assign(b, { off: new THREE.Vector3(rr(-2, 2), rr(-0.8, 0.8), (i - 2) * 1.6), flap: rnd() * 6 })); }
  const pass = { on: false, wait: 6, x: 0, z: 0, y: 10, dir: 1 };
  let birdK = 1;
  const tmp = new THREE.Vector3();

  function flyTo(b, sp) {
    const from = b.g.position.clone(), to = new THREE.Vector3(sp.x, sp.y, sp.z), d = from.distanceTo(to);
    b.flight = { from, to, t: 0, dur: clamp(d / 7, 0.8, 5), arc: 2 + d * 0.12 }; b.spot = sp; b.state = 'fly';
  }
  function freeSpot(heli, near) {
    for (let k = 0; k < 30; k++) {
      const sp = spots[Math.floor(rnd() * spots.length)];
      if (birds.some((o) => o.spot === sp)) continue;
      if (Math.hypot(sp.x - heli.x, sp.z - heli.z) < 14) continue;
      if (near && Math.hypot(sp.x - near.x, sp.z - near.z) > 34) continue;
      return sp;
    }
    return spots[Math.floor(rnd() * spots.length)];
  }

  function update(dt, t, heli, flying) {
    birds.forEach((b, i) => {
      const want = i < Math.round(birdK * NB);
      if (!want && b.active && b.state !== 'leave') { b.state = 'leave'; b.flight = { from: b.g.position.clone(), to: new THREE.Vector3(b.g.position.x + rr(-15, 15), 18, -60), t: 0, dur: 4, arc: 2 }; }
      if (want && !b.active) { b.active = true; b.g.visible = true; b.g.position.set(b.spot.x, 18, -60); flyTo(b, freeSpot(heli)); }
      if (!b.active) return;
      const p = b.g.position;
      if (b.state === 'perch') {
        // startle when the helicopter comes close
        if (flying && Math.hypot(p.x - heli.x, p.z - heli.z) < 8) { flyTo(b, freeSpot(heli, p)); audio.sfx.flutter(); if (rnd() < 0.6) audio.sfx.alarm(); return; }
        b.idleT -= dt; if (b.idleT < 0) { b.idleT = rr(20, 45); flyTo(b, freeSpot(heli, p)); return; }
        b.timer -= dt;
        if (b.timer <= 0) {
          b.act = b.spot.ground ? (rnd() < 0.45 ? 'peck' : rnd() < 0.6 ? 'hop' : 'look') : (rnd() < 0.5 ? 'look' : 'preen');
          b.actT = 0; b.timer = rr(0.7, 1.8);
          if (b.act === 'hop') { b.hopFrom = p.clone(); const a = rnd() * 6.28; b.hopTo = new THREE.Vector3(clamp(p.x + Math.cos(a) * 0.6, b.spot.x - 2.5, b.spot.x + 2.5), 0, clamp(p.z + Math.sin(a) * 0.6, b.spot.z - 2.5, b.spot.z + 2.5)); b.g.rotation.y = Math.atan2(b.hopTo.x - p.x, b.hopTo.z - p.z); }
          if (b.act === 'look') b.lookTo = b.g.rotation.y + rr(-1.2, 1.2);
        }
        b.actT += dt;
        b.head.rotation.set(0, 0, 0); b.body.rotation.x = 0;
        if (b.act === 'peck') { const k = Math.max(0, Math.sin(b.actT * 11)); b.body.rotation.x = k * 0.55; }
        else if (b.act === 'hop' && b.hopTo) { const u = Math.min(1, b.actT / 0.28); p.lerpVectors(b.hopFrom, b.hopTo, u); p.y = Math.sin(u * Math.PI) * 0.25; }
        else if (b.act === 'look') { b.g.rotation.y += (b.lookTo - b.g.rotation.y) * Math.min(1, dt * 8); b.head.rotation.y = Math.sin(b.actT * 3) * 0.5; }
        else if (b.act === 'preen') { b.head.rotation.set(0.4, Math.sin(b.actT * 9) * 0.6, 0); }
        const fold = 0.05 + (b.act === 'preen' ? Math.sin(b.actT * 15) * 0.15 : 0);
        b.wings[0].rotation.z = -fold; b.wings[1].rotation.z = fold;
      } else {
        const f = b.flight; f.t += dt;
        const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        p.lerpVectors(f.from, f.to, e); p.y += Math.sin(u * Math.PI) * f.arc;
        tmp.subVectors(f.to, f.from); b.g.rotation.y = Math.atan2(tmp.x, tmp.z);
        b.body.rotation.x = u < 0.2 ? -0.3 : u > 0.85 ? 0.35 : 0;
        b.flap += dt * (u > 0.4 && u < 0.75 ? 9 : 22);
        const a = u > 0.45 && u < 0.7 ? 0.5 : Math.sin(b.flap) * 1.1;
        b.wings[0].rotation.z = a; b.wings[1].rotation.z = -a;
        if (u >= 1) {
          if (b.state === 'leave') { b.active = false; b.g.visible = false; }
          else { b.state = 'perch'; p.copy(f.to); b.timer = rr(0.3, 1); b.act = 'look'; b.lookTo = rnd() * 6.28; }
        }
      }
    });

    // the flock
    if (!pass.on) {
      pass.wait -= dt;
      if (pass.wait <= 0 && birdK > 0.3) { pass.on = true; pass.dir = rnd() < 0.5 ? 1 : -1; pass.x = pass.dir > 0 ? heli.x - 40 : heli.x + 40; pass.z = heli.z - rr(4, 16); pass.y = rr(9, 12); flock.forEach((b) => (b.g.visible = true)); if (rnd() < 0.7) audio.sfx.flockSong(); }
    } else {
      pass.x += pass.dir * 7.5 * dt;
      flock.forEach((b, i) => {
        b.g.position.set(pass.x + b.off.x * pass.dir, pass.y + b.off.y + Math.sin(t * 2 + i) * 0.4, pass.z + b.off.z + Math.sin(t * 0.8 + i) * 0.6);
        b.g.rotation.y = pass.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        b.flap += dt * 16; const glide = Math.sin(t * 0.9 + i) > 0.4, a = glide ? 0.35 : Math.sin(b.flap) * 1.1;
        b.wings[0].rotation.z = a; b.wings[1].rotation.z = -a;
      });
      if (Math.abs(pass.x - heli.x) > 46) { pass.on = false; pass.wait = rr(14, 32) / Math.max(0.3, birdK); flock.forEach((b) => (b.g.visible = false)); }
    }
  }
  return {
    update,
    setTime(tod) { birdK = tod <= 1 ? 1 - tod * 0.3 : Math.max(0, 0.7 * (2 - tod) * 1.4 - 0.25); },
    count: () => birds.filter((b) => b.active && b.state !== 'leave').length,
    debug: () => birds.map((b) => ({ st: b.state, act: b.act, p: b.g.position.toArray().map((v) => +v.toFixed(1)), vis: b.g.visible })),
    flockVisible: () => pass.on,
  };
}
