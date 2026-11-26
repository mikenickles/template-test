import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge, rnd, rr, clamp, lerp, canvasTex } from './util.js';
import { L } from './world.js';

export const APPLES = 8;

/** Wicker picnic basket: carried on the winch, scoops up fallen apples. */
export function makeBasket() {
  const g = new THREE.Group(), H = 1.75;
  const wicker = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#d9a35c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { c.fillStyle = (x + y) % 2 ? '#c48a45' : '#e8b872'; c.fillRect(x * 16, y * 16 + 2, 16, 12); }
  });
  const mat = new THREE.MeshStandardMaterial({ map: wicker, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  put(g, new THREE.CylinderGeometry(0.78, 0.6, 0.75, 22, 1, true), mat, [0, 0.4, 0]);
  put(g, new THREE.CylinderGeometry(0.6, 0.6, 0.06, 22), M(0xb57a38, { r: 0.9 }), [0, 0.05, 0]);
  put(g, new THREE.TorusGeometry(0.78, 0.07, 8, 26), M(0xb57a38, { r: 0.8 }), [0, 0.77, 0], [Math.PI / 2, 0, 0]);
  put(g, new THREE.TorusGeometry(0.74, 0.06, 8, 22, Math.PI), M(0xb57a38, { r: 0.8 }), [0, 0.77, 0]);
  // checked napkin peeking over the rim
  const check = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#e23b2e'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c.fillRect(i * 16, j * 16, 16, 16); });
  put(g, new THREE.ConeGeometry(0.34, 0.5, 4), new THREE.MeshStandardMaterial({ map: check, roughness: 0.9 }), [0.48, 0.82, -0.2], [0.3, 0.6, -0.5], [1, 1, 0.25]);
  put(g, new THREE.TorusGeometry(0.13, 0.035, 6, 14), M(0xffcf3a, { r: 0.3 }), [0, H - 0.1, 0]);
  const slots = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; slots.push(new THREE.Vector3(Math.cos(a) * 0.36, 0.34, Math.sin(a) * 0.36)); }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283 + 0.6; slots.push(new THREE.Vector3(Math.cos(a) * 0.2, 0.66, Math.sin(a) * 0.2)); }
  const b = {
    name: 'basket', isBasket: true, group: g, height: H, slots, held: [], dunk: null,
    carry: { len: 1.6, damp: 1.3, mass: 0.07, spring: 0, g: 24 },
    anim() { b.carry.mass = 0.07 + b.held.length * 0.018; },
  };
  return b;
}

/** Apples: on the tree, shaken loose by the rotor wash, on the ground, in the basket. */
export function buildApples(scene) {
  const T = L.apple, geo = new THREE.SphereGeometry(0.3, 14, 10), mat = M(0xe23b2e, { r: 0.3, env: 0.8 });
  const leafG = new THREE.SphereGeometry(0.12, 6, 4), stemG = new THREE.CylinderGeometry(0.025, 0.025, 0.14, 4);
  const apples = [];
  const treeSpots = [[2.6, 9.2, 1.9], [-2.4, 8.6, 2.1], [0.6, 10.1, 2.6], [3.2, 8.0, -0.6], [-1.4, 7.6, 3.0], [1.8, 7.5, 2.9]];
  for (let i = 0; i < APPLES; i++) {
    const m = new THREE.Group(); scene.add(m);
    put(m, geo, mat);
    put(m, stemG, M(0x6b4630), [0, 0.3, 0], null, null, false);
    put(m, leafG, M(0x4fa23a, { r: 0.7 }), [0.1, 0.32, 0], [0, 0, -0.6], [1, 0.3, 0.6], false);
    const a = { mesh: m, state: 'tree', pos: new THREE.Vector3(), anim: null, wob: 0 };
    if (i < treeSpots.length) a.pos.set(T.x + treeSpots[i][0], treeSpots[i][1], T.z + treeSpots[i][2]);
    else { a.state = 'ground'; a.pos.set(T.x + (i === 6 ? 3.4 : -2.9), 0.3, T.z + (i === 6 ? 2.4 : 3.3)); }
    m.position.copy(a.pos); m.rotation.y = rnd() * 6;
    apples.push(a);
  }
  const groundSpot = () => {
    const a = rr(-0.2, Math.PI + 0.2), r = rr(4.0, 5.6); // the south (camera) side of the trunk
    return new THREE.Vector3(T.x + Math.cos(a) * r, 0.3, T.z + Math.sin(a) * r);
  };
  const fly = (a, to, dur, arc, next) => { a.anim = { from: a.mesh.position.clone(), to, dur, t: 0, arc, next }; };
  return { apples, groundSpot, fly };
}

/** Hammock strung between two posts, swinging gently; the rag doll sits in it. */
export function buildHammock(scene) {
  const Hm = L.hammock, root = new THREE.Group(); root.position.set(Hm.x, 0, Hm.z); scene.add(root);
  const wood = M(0xc98d55, { r: 0.7 });
  for (const sx of [-1, 1]) {
    put(root, new THREE.CylinderGeometry(0.16, 0.2, Hm.pivotY + 0.3, 10), wood, [sx * Hm.half, (Hm.pivotY + 0.3) / 2, 0]);
    put(root, new THREE.SphereGeometry(0.22, 10, 8), M(sx < 0 ? 0xff7fb0 : 0x6ec6ff, { r: 0.4 }), [sx * Hm.half, Hm.pivotY + 0.42, 0]);
  }
  const swing = new THREE.Group(); swing.position.y = Hm.pivotY; root.add(swing);
  const stripes = canvasTex(256, 64, (c, w, h) => { ['#ff7fb0', '#ffd23f', '#7bd66a', '#6ec6ff', '#b86bff', '#ff8a3c'].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i * h) / 6, w, h / 6 + 1); }); });
  const bed = new THREE.PlaneGeometry(5.2, 1.7, 20, 6), pa = bed.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setXYZ(i, x, -Hm.drop + 0.9 * (x / 2.6) ** 2 + 0.28 * (y / 0.85) ** 2, y); }
  bed.computeVertexNormals();
  put(swing, bed, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.3 }));
  const rope = M(0xe6d2a0, { r: 1 }), rg = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = new THREE.Vector3(sx * Hm.half, 0, 0), b = new THREE.Vector3(sx * 2.6, -Hm.drop + 1.18, sz * 0.85), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    const gg = tg(new THREE.CylinderGeometry(0.03, 0.03, len, 4));
    gg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); gg.translate(mid.x, mid.y, mid.z); rg.push(gg);
  }
  put(swing, merge(rg), rope, [0, 0, 0], null, null, false);
  for (const sx of [-1, 1]) put(swing, new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), wood, [sx * 2.6, -Hm.drop + 1.18, 0], [Math.PI / 2, 0, 0]);
  const st = { swing, a: 0, push: 0, pv: 0 };
  return {
    st,
    update(dt, t, heli, wash) {
      // a steady swing from the breeze, plus a push from the rotor wash
      const dz = Hm.z - heli.z, d = Math.hypot(Hm.x - heli.x, dz) + 0.01, k = Math.max(0, 1 - d / 9) * wash;
      st.pv += (-st.push * 5 - st.pv * 1.5 + (dz / d) * k * 1.5) * dt; st.push += st.pv * dt;
      st.a = clamp(0.38 * Math.sin(t * 2.2) + st.push, -0.7, 0.7);
      swing.rotation.x = st.a;
    },
    /** Where the doll sits, in world space, for the current swing angle. */
    seat(out) { const a = st.a, r = Hm.drop - 0.05; return out.set(Hm.x, Hm.pivotY - r * Math.cos(a), Hm.z - r * Math.sin(a)); },
  };
}
