import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge, rnd, rr, clamp, lerp, damp, canvasTex } from './util.js';
import { L, inPond } from './world.js';

// The east garden: thirsty plants, a paddling pool to fill the bucket, and things to fly around.
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const DULL = new THREE.Color(0xa39a72), DULL_STEM = new THREE.Color(0x9a9550);

/** A plant that droops until it is watered, then perks up and blooms. */
function thirstyFlower(type, vivid, h) {
  const root = new THREE.Group(), bend = new THREE.Group(); root.add(bend);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d9c3c, roughness: 0.7 });
  const petalMat = new THREE.MeshStandardMaterial({ color: vivid, roughness: 0.5 });
  const sg = [tg(new THREE.CylinderGeometry(0.08, 0.12, h, 6), [0, h / 2, 0])];
  for (let i = 0; i < 2; i++) { const a = rnd() * 6.28, y = h * rr(0.25, 0.5); sg.push(tg(sph(0.5, 8, 6), [Math.cos(a) * 0.45, y + 0.15, Math.sin(a) * 0.45], [0, -a, 0.6], [1, 0.12, 0.42])); }
  put(bend, merge(sg), stemMat);
  const head = new THREE.Group(); head.position.y = h; bend.add(head);
  const pg = [];
  if (type === 'tulip') {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; pg.push(tg(sph(0.5, 8, 6), [Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3], [0, -a, -0.2], [0.46, 1.15, 0.64])); }
    put(head, merge(pg), petalMat);
  } else {
    const sun = type === 'sun', n = sun ? 16 : 11, R = sun ? 1.0 : 0.66;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; pg.push(tg(sph(0.5, 8, 6), [Math.cos(a) * R, 0, Math.sin(a) * R], [0, -a, 0.12], [sun ? 0.85 : 0.76, 0.14, 0.38])); }
    put(head, merge(pg), petalMat);
    put(head, sph(sun ? 0.76 : 0.38, 12, 8), M(sun ? 0x7a4a22 : 0xffc21a, { r: 0.8 }), [0, 0.08, 0], null, [1, 0.45, 1]);
  }
  const vividC = new THREE.Color(vivid), green = new THREE.Color(0x4d9c3c);
  const apply = (b, t) => {
    bend.rotation.z = (1 - b) * 1.05 + Math.sin(t * 1.3 + h) * 0.04 * b;
    head.rotation.x = 0.5 * b; head.rotation.z = (1 - b) * 0.9;
    root.scale.setScalar(0.72 + 0.28 * b);
    petalMat.color.copy(DULL).lerp(vividC, b); stemMat.color.copy(DULL_STEM).lerp(green, b);
  };
  return { group: root, apply, top: h };
}

function thirstyPumpkin() {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.45 });
  const body = new THREE.Group(); root.add(body);
  const seg = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; seg.push(tg(sph(0.62, 12, 10), [Math.cos(a) * 0.42, 0.62, Math.sin(a) * 0.42], [0, -a, 0], [0.9, 1, 0.62])); }
  put(body, merge(seg), mat);
  put(body, new THREE.CylinderGeometry(0.08, 0.13, 0.45, 6), M(0x5c8a34, { r: 0.8 }), [0, 1.3, 0], [0.2, 0, 0.15]);
  const lg = [];
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4, r = rr(1.3, 2.0); lg.push(tg(sph(0.6, 8, 6), [Math.cos(a) * r, 0.22, Math.sin(a) * r], [0, rnd() * 3, 0.15], [1, 0.14, 0.8])); }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d9c3c, roughness: 0.7 });
  put(root, merge(lg), leafMat);
  const small = new THREE.Color(0x9aa85a), big = new THREE.Color(0xff8a1f), green = new THREE.Color(0x4d9c3c);
  const apply = (b, t) => {
    const s = 0.4 + 1.25 * b; body.scale.set(s, s * (0.86 + Math.sin(t * 2 + s) * 0.01), s);
    mat.color.copy(small).lerp(big, b); leafMat.color.copy(DULL_STEM).lerp(green, b);
  };
  return { group: root, apply, top: 1.2 };
}

export function buildGarden(scene) {
  const plants = [];
  const add = (p, x, y, z) => { p.group.position.set(x, y, z); p.group.rotation.y = rnd() * 6.28; scene.add(p.group); plants.push(Object.assign(p, { x, z, y, bloom: 0, target: 0, progress: 0, pop: 0 })); p.apply(0, 0); };

  // --- two potted plants in the old yard so the job is discovered early
  const pot = (x, z) => {
    put(scene, new THREE.CylinderGeometry(1.0, 0.72, 1.3, 16), M(0xd9713a, { r: 0.6 }), [x, 0.65, z]);
    put(scene, new THREE.TorusGeometry(1.0, 0.14, 8, 20), M(0xe58a55, { r: 0.6 }), [x, 1.3, z], [Math.PI / 2, 0, 0]);
    put(scene, new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16), M(0x6b4630, { r: 1 }), [x, 1.26, z], null, null, false);
  };
  for (const pp of L.pots) pot(pp.x, pp.z);
  add(thirstyFlower('daisy', 0xffffff, 2.6), L.pots[0].x, 1.3, L.pots[0].z);
  add(thirstyFlower('tulip', 0xff5a8a, 2.4), L.pots[1].x, 1.3, L.pots[1].z);

  // --- raised planter with four flowers
  const A = L.planter;
  const wood = M(0xc98d55, { r: 0.7 }), fr = [];
  for (const [x, z, w, d] of [[0, -A.d / 2, A.w + 0.5, 0.5], [0, A.d / 2, A.w + 0.5, 0.5], [-A.w / 2, 0, 0.5, A.d], [A.w / 2, 0, 0.5, A.d]]) fr.push(tg(new RoundedBoxGeometry(w, 1.1, d, 2, 0.12), [A.x + x, 0.55, A.z + z]));
  put(scene, merge(fr), wood);
  put(scene, new THREE.BoxGeometry(A.w, 0.2, A.d), M(0x6b4630, { r: 1, env: 0.1 }), [A.x, 0.85, A.z], null, null, false);
  [['sun', 0xffc928, 4.2], ['tulip', 0xb86bff, 2.9], ['daisy', 0xffd3ec, 3.2], ['tulip', 0xff8a3c, 2.8]].forEach(([type, c, h], i) => add(thirstyFlower(type, c, h), A.x - A.w / 2 + 1.9 + i * 3.4, 0.9, A.z + rr(-0.4, 0.4)));
  // little name stakes
  for (let i = 0; i < 4; i++) put(scene, new RoundedBoxGeometry(0.5, 0.36, 0.06, 1, 0.03), M([0xffffff, 0xffe07a, 0xbfe9ff, 0xffd3ec][i], { r: 0.6 }), [A.x - A.w / 2 + 0.8 + i * 3.4, 1.35, A.z + A.d / 2 - 0.6], [-0.3, 0, 0]);

  // --- pumpkin patch
  const P = L.patch;
  put(scene, new THREE.SphereGeometry(P.r, 28, 8, 0, 6.283, 0, Math.PI / 2), M(0x6b4630, { r: 1, env: 0.1 }), [P.x, -0.05, P.z], null, [1, 0.05, 1], false);
  add(thirstyPumpkin(), P.x - 2.0, 0.15, P.z - 0.8);
  add(thirstyPumpkin(), P.x + 2.2, 0.15, P.z + 1.2);
  const vine = [];
  for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 1 + i * 0.42; vine.push(tg(new THREE.CapsuleGeometry(0.07, 1.1, 3, 6), [P.x + Math.cos(a) * r, 0.2, P.z + Math.sin(a) * r], [Math.PI / 2, 0, -a + 1.2])); }
  put(scene, merge(vine), M(0x5c8a34, { r: 0.8 }));

  // --- inflatable paddling pool: a second place to fill the bucket
  const W = L.pool;
  const ringTex = canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff7fb0'; c.fillRect((i * w) / 12, 0, w / 12 + 1, h); } });
  put(scene, new THREE.TorusGeometry(W.r, 0.75, 14, 40), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.3, envMapIntensity: 0.8 }), [W.x, 0.7, W.z], [Math.PI / 2, 0, 0]);
  put(scene, new THREE.CylinderGeometry(W.r, W.r, 0.15, 32), M(0x8fd8ff, { r: 0.5 }), [W.x, 0.1, W.z], null, null, false);
  const poolWater = put(scene, new THREE.CircleGeometry(W.r - 0.3, 32), new THREE.MeshStandardMaterial({ color: 0x35c3e8, roughness: 0.08, transparent: true, opacity: 0.85, envMapIntensity: 1.4 }), [W.x, W.y, W.z], [-Math.PI / 2, 0, 0], null, false);
  const floatie = put(scene, new THREE.TorusGeometry(0.6, 0.24, 10, 20), M(0xffd23f, { r: 0.3 }), [W.x - 2.1, W.y + 0.1, W.z + 1.3], [Math.PI / 2, 0, 0]);

  // --- apple tree
  const T = L.apple, tree = new THREE.Group(); tree.position.set(T.x, 0, T.z); scene.add(tree);
  put(tree, new THREE.CylinderGeometry(0.55, 0.9, 5.4, 10), M(0x8b5a3a, { r: 0.9 }), [0, 2.7, 0]);
  const blob = new THREE.IcosahedronGeometry(1, 2), lm = [M(0x5fae3e, { r: 0.8, env: 0.25 }), M(0x4a9438, { r: 0.8, env: 0.25 })];
  [[0, 7.6, 0, 3.6], [-2.2, 6.6, 1, 2.4], [2.3, 6.9, -0.6, 2.6], [0.4, 6.4, 2.3, 2.2], [-0.6, 9.4, -0.8, 2.3]].forEach(([x, y, z, r], i) => put(tree, blob, lm[i % 2], [x, y, z], [rnd(), rnd(), 0], [r, r * 0.82, r]));
  const ap = [];
  for (let i = 0; i < 7; i++) { const a = i * 2.4 + 2.0, e = 0.5 + (i % 4) * 0.35, r = 3.5; ap.push(tg(sph(0.3, 8, 6), [Math.cos(a) * Math.sin(e) * r, 7.4 + Math.cos(e) * 2.6, Math.sin(a) * Math.sin(e) * r])); }
  put(tree, merge(ap), M(0xe23b2e, { r: 0.3 }));

  // --- clothesline that flaps in the rotor wash
  const C = L.line, cloths = [];
  for (const sx of [-1, 1]) { put(scene, new THREE.CylinderGeometry(0.12, 0.15, 4.8, 8), M(0xf4f4f4, { r: 0.5 }), [C.x + sx * C.half, 2.4, C.z]); put(scene, sph(0.18, 8, 6), M(0xffcf3a), [C.x + sx * C.half, 4.85, C.z]); }
  put(scene, new THREE.CylinderGeometry(0.03, 0.03, C.half * 2, 4), M(0xe6d2a0, { r: 1 }), [C.x, 4.6, C.z], [0, 0, Math.PI / 2], null, false);
  [[0xff7fb0, 1.5, 1.9], [0xffffff, 2.0, 1.4], [0x6ec6ff, 1.3, 2.1], [0xffd23f, 1.7, 1.6], [0x7bd66a, 1.2, 1.2]].forEach(([c, w, h], i) => {
    const g = new THREE.Group(); g.position.set(C.x - C.half + 1.6 + i * 2.05, 4.58, C.z); scene.add(g);
    put(g, new RoundedBoxGeometry(w, h, 0.05, 1, 0.02), M(c, { r: 0.8, side: THREE.DoubleSide }), [0, -h / 2, 0]);
    cloths.push({ g, a: 0, v: 0, ph: rnd() * 6 });
  });

  // --- wheelbarrow + gnome
  const wb = new THREE.Group(); wb.position.set(45, 0, -7.5); wb.rotation.y = 0.6; scene.add(wb);
  put(wb, new RoundedBoxGeometry(2.6, 1.0, 1.8, 3, 0.3), M(0x3fae5a, { r: 0.4 }), [0, 1.35, 0], [0, 0, 0.08]);
  put(wb, new THREE.SphereGeometry(1.0, 14, 8, 0, 6.283, 0, Math.PI / 2), M(0x6b4630, { r: 1 }), [0, 1.7, 0], null, [1.1, 0.4, 0.75], false);
  put(wb, new THREE.TorusGeometry(0.5, 0.2, 8, 16), M(0x34373d, { r: 0.7 }), [1.5, 0.7, 0]);
  for (const sz of [-0.7, 0.7]) { put(wb, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), M(0xc98d55, { r: 0.7 }), [-1.7, 1.25, sz], [0, 0, Math.PI / 2 - 0.25]); put(wb, new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), M(0xc98d55, { r: 0.7 }), [-0.9, 0.5, sz]); }
  const gn = new THREE.Group(); gn.position.set(61.5, 0, -10.5); gn.rotation.y = -0.7; scene.add(gn);
  put(gn, sph(0.6), M(0x3d8fe0, { r: 0.5 }), [0, 0.6, 0], null, [1, 1.05, 0.9]);
  put(gn, sph(0.42), M(0xf7c9a0, { r: 0.6 }), [0, 1.35, 0]);
  put(gn, sph(0.36), M(0xffffff, { r: 0.8 }), [0, 1.12, 0.22], null, [1, 1.1, 0.7]);
  put(gn, new THREE.ConeGeometry(0.46, 1.2, 14), M(0xe23b2e, { r: 0.4 }), [0, 2.15, 0], [0, 0, 0.12]);
  put(gn, sph(0.09), M(0xf2a58a), [0, 1.36, 0.42]);
  for (const sx of [-0.15, 0.15]) put(gn, sph(0.045, 6, 6), M(0x1c1c24, { r: 0.2 }), [sx, 1.46, 0.38], null, null, false);

  // --- water droplets (pouring, dripping, splashing)
  const ND = 110, drops = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), hide = new THREE.Vector3(0, -60, 0);
  const dropMesh = new THREE.InstancedMesh(sph(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0x8fdcff }), ND);
  dropMesh.frustumCulled = false; scene.add(dropMesh);
  for (let i = 0; i < ND; i++) drops.push({ p: new THREE.Vector3(0, -60, 0), v: new THREE.Vector3(), life: 0 });
  let di = 0;
  function drop(x, y, z, vx, vy, vz, life = 1.2) { const d = drops[di++ % ND]; d.p.set(x, y, z); d.v.set(vx, vy, vz); d.life = life; }
  function splash(x, y, z, n = 14, power = 1) { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, u = rr(0.6, 2.2) * power; drop(x, y, z, Math.cos(a) * u, rr(2.5, 5) * power, Math.sin(a) * u, 0.9); } }

  function waterAt(x, z) {
    if (inPond(x, z, -0.7)) return 0.07;
    if (Math.hypot(x - W.x, z - W.z) < W.r - 0.9) return W.y;
    return null;
  }
  const thirsty = () => plants.filter((p) => p.target === 0);

  function update(dt, t, heli, wash) {
    for (const p of plants) {
      if (p.bloom !== p.target) { p.bloom = p.target > p.bloom ? Math.min(1, p.bloom + dt * 0.9) : Math.max(0, p.bloom - dt * 0.25); }
      p.pop = Math.max(0, p.pop - dt * 1.6);
      // shows progress while being watered, then a happy overshoot when it blooms
      p.apply(clamp(Math.max(p.bloom, p.progress * 0.45) + Math.sin(p.pop * 9) * p.pop * 0.12, 0, 1.15), t);
    }
    for (const c of cloths) {
      const dx = c.g.position.x - heli.x, dz = c.g.position.z - heli.z, d = Math.hypot(dx, dz) + 0.01, k = Math.max(0, 1 - d / 9) * wash;
      c.v += (-c.a * 9 - c.v * 1.2 + (dz / d) * k * 22 + Math.sin(t * 1.7 + c.ph) * 0.8 + Math.sin(t * 13 + c.ph) * k * 8) * dt; c.a += c.v * dt;
      c.g.rotation.x = clamp(c.a, -1.3, 1.3);
    }
    floatie.position.y = W.y + 0.1 + Math.sin(t * 2) * 0.03; floatie.rotation.z = t * 0.2;
    poolWater.material.opacity = 0.82 + Math.sin(t * 2.3) * 0.05;
    for (let i = 0; i < ND; i++) {
      const d = drops[i];
      if (d.life > 0) {
        d.life -= dt; d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.05) d.life = 0;
        const s = clamp(d.life * 4, 0.3, 1);
        m4.compose(d.p, q, sc.set(s, s * 1.4, s));
      } else m4.compose(hide, q, sc.set(0.001, 0.001, 0.001));
      dropMesh.setMatrixAt(i, m4);
    }
    dropMesh.instanceMatrix.needsUpdate = true;
  }
  return { plants, thirsty, waterAt, drop, splash, update, appleTree: tree };
}

/** The bucket: carried on the winch like a toy, holds three pours of water. */
export function makeBucket() {
  const g = new THREE.Group(), tilt = new THREE.Group();
  const H = 1.75;
  tilt.position.y = H; g.add(tilt);            // tips around the handle, not the base
  const body = new THREE.Group(); body.position.y = -H; tilt.add(body);
  const blue = M(0x3d9be9, { r: 0.3, env: 0.9, side: THREE.DoubleSide });
  put(body, new THREE.CylinderGeometry(0.62, 0.45, 1.05, 20, 1, true), blue, [0, 0.55, 0]);
  put(body, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), blue, [0, 0.05, 0]);
  put(body, new THREE.TorusGeometry(0.62, 0.06, 8, 24), M(0xffffff, { r: 0.3 }), [0, 1.08, 0], [Math.PI / 2, 0, 0]);
  put(body, new THREE.TorusGeometry(0.62, 0.04, 6, 20, Math.PI), M(0xdfe5ee, { r: 0.3, m: 0.4 }), [0, 1.08, 0]);
  put(body, new THREE.TorusGeometry(0.13, 0.035, 6, 14), M(0xffcf3a, { r: 0.3 }), [0, 1.66, 0]);
  for (const sx of [-1, 1]) { put(body, sph(0.085, 10, 8), M(0x1c1c24, { r: 0.15 }), [sx * 0.2, 0.68, 0.55], null, null, false); put(body, sph(0.028, 6, 6), M(0xffffff, { e: 0xffffff }), [sx * 0.2 + 0.02, 0.71, 0.62], null, null, false); }
  put(body, new THREE.TorusGeometry(0.13, 0.025, 5, 10, Math.PI), M(0x1c1c24, { r: 0.2 }), [0, 0.5, 0.52], [0.15, 0, Math.PI], null, false);
  const water = put(body, new THREE.CircleGeometry(0.58, 20), new THREE.MeshStandardMaterial({ color: 0x35c3e8, roughness: 0.05, envMapIntensity: 1.5 }), [0, 0.2, 0], [-Math.PI / 2, 0, 0], null, false);
  const b = { name: 'bucket', isBucket: true, group: g, height: H, water: 0, dunk: null, tiltNow: 0, tiltTo: 0, filling: false,
    carry: { len: 1.5, damp: 1.1, mass: 0.08, spring: 0, g: 26 },
    anim(t) {
      const lv = clamp(b.water / 3, 0, 1);
      water.visible = lv > 0.02; water.position.y = 0.2 + lv * 0.8; water.scale.setScalar(0.8 + lv * 0.2);
      tilt.rotation.x = b.tiltNow;
      b.carry.mass = 0.08 + lv * 0.14;
    } };
  return b;
}
