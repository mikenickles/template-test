import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge } from './util.js';

const sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const BLACK = () => M(0x1c1c24, { r: 0.15, env: 1 });

// ---------------------------------------------------------------- helicopter
// Local forward is +Z. Origin is the body centre.
export function makeHeli() {
  const root = new THREE.Group();      // world position
  const body = new THREE.Group();      // yaw + lean
  root.add(body);
  // its own material (not the shared cache) so the bodywork can be repainted
  const red = new THREE.MeshStandardMaterial({ color: 0xdc1f2e, roughness: 0.22, envMapIntensity: 1.0 }), white = M(0xfff8ee, { r: 0.3, env: 0.8 }), yellow = M(0xffcf3a, { r: 0.3 }), dark = M(0x3a3f4a, { r: 0.4 });

  // bubbly cabin, white belly
  put(body, sph(0.82, 28, 20), red, [0, 0, 0], null, [1, 0.9, 1.22]);
  put(body, new THREE.SphereGeometry(0.835, 28, 10, 0, 6.283, Math.PI * 0.64, Math.PI * 0.36), white, [0, 0, 0], null, [1, 0.9, 1.22]);
  // big friendly windshield
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, envMapIntensity: 1.6 });
  put(body, sph(0.64, 24, 16), glass, [0, 0.16, 0.5], null, [1.05, 0.82, 0.86]);
  put(body, sph(0.2, 10, 8), M(0xffffff, { r: 0.1, t: true, o: 0.75, e: 0xffffff, ei: 0.3 }), [-0.26, 0.45, 0.86], [0.2, 0, 0.5], [1, 0.32, 0.3], false);
  // headlamp eyes + smile: it's a character, not a machine
  for (const sx of [-1, 1]) {
    put(body, sph(0.17, 14, 10), white, [sx * 0.36, -0.3, 0.84]);
    put(body, sph(0.085, 10, 8), BLACK(), [sx * 0.37, -0.29, 0.98], null, null, false);
    put(body, sph(0.03, 6, 6), M(0xffffff, { e: 0xffffff, ei: 1 }), [sx * 0.35, -0.26, 1.055], null, null, false);
  }
  put(body, new THREE.TorusGeometry(0.2, 0.03, 6, 14, Math.PI * 0.8), BLACK(), [0, -0.38, 0.9], [0.5, 0, Math.PI + 0.31], null, false);
  // tail
  put(body, new THREE.CylinderGeometry(0.11, 0.3, 1.7, 12), red, [0, 0.2, -1.5], [Math.PI / 2 + 0.12, 0, 0]);
  put(body, new RoundedBoxGeometry(0.12, 0.85, 0.5, 2, 0.06), red, [0, 0.62, -2.25], [-0.35, 0, 0]);
  put(body, new RoundedBoxGeometry(0.9, 0.08, 0.34, 2, 0.04), white, [0, 0.34, -2.1]);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.12, 0.42, -2.28); body.add(tailRotor);
  put(tailRotor, merge([tg(new RoundedBoxGeometry(0.04, 0.72, 0.12, 1, 0.02)), tg(new RoundedBoxGeometry(0.04, 0.12, 0.72, 1, 0.02))]), white);
  put(tailRotor, sph(0.08, 8, 6), yellow);
  const beacon = put(body, sph(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3020, emissiveIntensity: 2 }), [0, 1.02, -2.38], null, null, false);
  // side emblem: gold star on a white roundel
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 - Math.PI / 2, r = i % 2 ? 0.09 : 0.2; i ? star.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.795, -0.02, -0.25); e.rotation.y = sx * (Math.PI / 2 - 0.1); body.add(e);
    put(e, new THREE.CircleGeometry(0.3, 20), white, [0, 0, 0], null, null, false);
    put(e, new THREE.ShapeGeometry(star), yellow, [0, 0, 0.012], null, null, false);
  }
  // skids
  const sk = [];
  for (const sx of [-1, 1]) {
    sk.push(tg(new THREE.CapsuleGeometry(0.07, 1.7, 4, 8), [sx * 0.6, -0.98, 0.05], [Math.PI / 2, 0, 0]));
    sk.push(tg(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6), [sx * 0.52, -0.78, 0.5], [0, 0, sx * 0.35]));
    sk.push(tg(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6), [sx * 0.52, -0.78, -0.4], [0, 0, sx * 0.35]));
  }
  put(body, merge(sk), white);
  // winch drum under the belly
  put(body, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), yellow, [0, -0.74, 0], [0, 0, Math.PI / 2]);
  // rotor
  put(body, new THREE.CylinderGeometry(0.08, 0.1, 0.38, 8), dark, [0, 0.88, -0.05]);
  const rotor = new THREE.Group(); rotor.position.set(0, 1.08, -0.05); body.add(rotor);
  const bl = [];
  for (let i = 0; i < 3; i++) bl.push(tg(new RoundedBoxGeometry(1.75, 0.035, 0.2, 1, 0.015), [Math.cos(i * 2.094) * 0.92, 0, -Math.sin(i * 2.094) * 0.92], [0, i * 2.094, 0]));
  const blades = put(rotor, merge(bl), dark);
  const tips = [];
  for (let i = 0; i < 3; i++) tips.push(tg(new RoundedBoxGeometry(0.3, 0.04, 0.21, 1, 0.015), [Math.cos(i * 2.094) * 1.68, 0, -Math.sin(i * 2.094) * 1.68], [0, i * 2.094, 0]));
  put(rotor, merge(tips), yellow);
  put(rotor, sph(0.16, 12, 8), yellow, [0, 0.02, 0], null, [1, 0.7, 1]);
  // motion-blur disc (fades in as the rotor spins up)
  const disc = put(rotor, new THREE.RingGeometry(0.2, 1.84, 40), new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), [0, 0, 0], [-Math.PI / 2, 0, 0], null, false);
  const discTip = put(rotor, new THREE.RingGeometry(1.55, 1.84, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), [0, 0.005, 0], [-Math.PI / 2, 0, 0], null, false);
  body.scale.setScalar(0.92);
  return { root, body, rotor, tailRotor, blades, disc, discTip, beacon, paint: red, hookLocal: new THREE.Vector3(0, -0.82, 0), skidY: 0.98 };
}

// ---------------------------------------------------------------- toys
// Origin at the base, hang point at (0, height, 0). Each has anim(t, mood, dt).
function eye(parent, x, y, z, s = 1) {
  put(parent, sph(0.075 * s, 10, 8), BLACK(), [x, y, z], null, null, false);
  put(parent, sph(0.025 * s, 6, 6), M(0xffffff, { e: 0xffffff, ei: 1 }), [x + 0.02 * s, y + 0.03 * s, z + 0.06 * s], null, null, false);
}
function loop(parent, y) {
  // little carry-loop so the hook has something believable to grab
  put(parent, new THREE.TorusGeometry(0.13, 0.035, 6, 14), M(0xffcf3a, { r: 0.3 }), [0, y - 0.1, 0]);
}

export function makeTeddy() {
  const g = new THREE.Group(), fur = M(0xd08e4a, { r: 0.85, env: 0.3 }), light = M(0xf3cf9a, { r: 0.85, env: 0.3 }), pink = M(0xf7a6a0, { r: 0.8 });
  put(g, sph(0.58), fur, [0, 0.68, 0], null, [1, 1.08, 0.92]);
  put(g, sph(0.36), light, [0, 0.66, 0.3], null, [1, 1.05, 0.6]);
  const head = new THREE.Group(); head.position.set(0, 1.42, 0.02); g.add(head);
  put(head, sph(0.47), fur, [0, 0, 0], null, [1.05, 0.95, 0.95]);
  for (const sx of [-1, 1]) { put(head, sph(0.18), fur, [sx * 0.36, 0.36, 0]); put(head, sph(0.1), pink, [sx * 0.36, 0.36, 0.11], null, [1, 1, 0.5], false); }
  put(head, sph(0.2), light, [0, -0.1, 0.38], null, [1.1, 0.85, 0.8]);
  put(head, sph(0.07), BLACK(), [0, -0.03, 0.55], null, [1.2, 0.8, 0.8], false);
  eye(head, -0.17, 0.1, 0.4); eye(head, 0.17, 0.1, 0.4);
  put(head, new THREE.TorusGeometry(0.08, 0.018, 5, 10, Math.PI), BLACK(), [0, -0.13, 0.53], [0.2, 0, Math.PI], null, false);
  // scarf
  put(g, new THREE.TorusGeometry(0.36, 0.11, 8, 20), M(0x3d8fe0, { r: 0.7 }), [0, 1.1, 0.02], [Math.PI / 2, 0, 0], [1, 1, 0.9]);
  put(g, new RoundedBoxGeometry(0.2, 0.5, 0.08, 2, 0.03), M(0x3d8fe0, { r: 0.7 }), [0.22, 0.86, 0.42], [0.1, 0, -0.25]);
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.48, 1.0, 0.05); g.add(a);
    put(a, new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), fur, [sx * 0.18, -0.2, 0.05], [0, 0, sx * 0.7]);
    put(a, sph(0.1), light, [sx * 0.36, -0.37, 0.14], null, [1, 1, 0.6], false);
    arms.push(a);
    put(g, new THREE.CapsuleGeometry(0.19, 0.3, 4, 10), fur, [sx * 0.34, 0.24, 0.42], [Math.PI / 2 - 0.2, 0, sx * -0.25]);
    put(g, sph(0.13), light, [sx * 0.42, 0.3, 0.76], null, [1, 1, 0.5], false);
  }
  loop(g, 1.98);
  const anim = (t, mood) => {
    if (mood === 'hang') { arms[0].rotation.z = -2.2 + Math.sin(t * 5) * 0.1; arms[1].rotation.z = 2.2 - Math.sin(t * 5) * 0.1; head.rotation.z = Math.sin(t * 2) * 0.08; }
    else if (mood === 'happy') { arms[0].rotation.z = -1.9 + Math.sin(t * 9) * 0.5; arms[1].rotation.z = 1.9 - Math.sin(t * 9 + 1) * 0.5; head.rotation.z = Math.sin(t * 4) * 0.15; }
    else { arms[1].rotation.z = 1.9 + Math.sin(t * 7) * 0.45; arms[0].rotation.z = Math.sin(t * 1.5) * 0.1; head.rotation.z = Math.sin(t * 1.2) * 0.1; head.rotation.x = -0.25; }
    if (mood !== 'help') head.rotation.x = 0;
  };
  return { name: 'teddy', group: g, height: 1.98, anim, carry: { len: 2.3, damp: 2.6, mass: 0.07, spring: 0, g: 38 } };
}

export function makeDuck() {
  const g = new THREE.Group(), yel = M(0xffd21f, { r: 0.25, env: 0.9 }), org = M(0xff8a1f, { r: 0.3 });
  put(g, sph(0.62, 24, 16), yel, [0, 0.5, -0.05], null, [1, 0.8, 1.2]);
  put(g, new THREE.ConeGeometry(0.28, 0.5, 12), yel, [0, 0.72, -0.72], [-0.9, 0, 0]);
  for (const sx of [-1, 1]) put(g, sph(0.3), yel, [sx * 0.55, 0.52, -0.1], [0, 0, sx * 0.2], [0.35, 0.7, 1.1]);
  const head = new THREE.Group(); head.position.set(0, 1.08, 0.32); g.add(head);
  put(head, sph(0.42, 22, 16), yel);
  put(head, sph(0.2), org, [0, -0.07, 0.42], null, [1.25, 0.42, 1.1]);
  put(head, sph(0.16), org, [0, -0.14, 0.38], null, [1.1, 0.35, 1.0]);
  eye(head, -0.2, 0.1, 0.33, 1.15); eye(head, 0.2, 0.1, 0.33, 1.15);
  for (const sx of [-1, 1]) put(head, sph(0.06), M(0xffa1a1, { r: 0.6 }), [sx * 0.3, -0.06, 0.27], null, [1, 0.7, 0.5], false);
  put(head, new THREE.ConeGeometry(0.07, 0.24, 6), yel, [0, 0.44, -0.04], [-0.5, 0, 0]);
  loop(g, 1.66);
  const anim = (t, mood) => {
    head.rotation.y = Math.sin(t * (mood === 'help' ? 2.4 : 1.2)) * (mood === 'help' ? 0.6 : 0.25);
    head.rotation.z = mood === 'happy' ? Math.sin(t * 8) * 0.2 : 0;
    head.position.y = 1.08 + (mood === 'help' ? Math.abs(Math.sin(t * 5)) * 0.06 : 0);
  };
  return { name: 'duck', group: g, height: 1.66, anim, carry: { len: 2.2, damp: 1.0, mass: 0.06, spring: 120, g: 22 } };
}

export function makeRobot() {
  const g = new THREE.Group(), teal = M(0x2fb7b0, { r: 0.3, env: 0.9 }), cream = M(0xfff1d6, { r: 0.35, env: 0.8 }), grey = M(0x8a94a6, { r: 0.35, m: 0.3 }), red = M(0xe23b2e, { r: 0.3 }), yel = M(0xffcf3a, { r: 0.3 });
  for (const sx of [-1, 1]) {
    put(g, new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), grey, [sx * 0.27, 0.42, 0]);
    put(g, new RoundedBoxGeometry(0.42, 0.24, 0.6, 3, 0.1), red, [sx * 0.27, 0.12, 0.06]);
  }
  put(g, new RoundedBoxGeometry(1.1, 0.95, 0.78, 4, 0.2), teal, [0, 1.08, 0]);
  put(g, new RoundedBoxGeometry(0.72, 0.5, 0.1, 3, 0.08), cream, [0, 1.1, 0.37]);
  const lamps = [];
  [[-0.2, red], [0, yel], [0.2, M(0x58c95a, { r: 0.3 })]].forEach(([x, m]) => lamps.push(put(g, sph(0.07, 10, 8), m.clone(), [x, 1.2, 0.43], null, null, false)));
  put(g, new RoundedBoxGeometry(0.5, 0.08, 0.04, 1, 0.02), grey, [0, 0.98, 0.43], null, null, false);
  const head = new THREE.Group(); head.position.set(0, 1.88, 0); g.add(head);
  put(head, new RoundedBoxGeometry(0.9, 0.62, 0.66, 4, 0.18), cream);
  put(g, new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), grey, [0, 1.58, 0]);
  const eyes = [];
  for (const sx of [-1, 1]) {
    put(head, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16), grey, [sx * 0.21, 0.05, 0.33], [Math.PI / 2, 0, 0]);
    eyes.push(put(head, sph(0.125, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffc21a, emissiveIntensity: 0.9, roughness: 0.2 }), [sx * 0.21, 0.05, 0.36], null, [1, 1, 0.5], false));
    put(head, sph(0.05, 8, 6), BLACK(), [sx * 0.21, 0.05, 0.42], null, null, false);
    put(head, new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), red, [sx * 0.5, 0, 0], [0, 0, Math.PI / 2]);
  }
  put(head, new RoundedBoxGeometry(0.3, 0.07, 0.04, 1, 0.02), BLACK(), [0, -0.17, 0.33], null, null, false);
  put(head, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 5), grey, [0.25, 0.44, 0]);
  const bulb = put(head, sph(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff6050, emissive: 0xff2a1a, emissiveIntensity: 1 }), [0.25, 0.62, 0], null, null, false);
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.62, 1.32, 0); g.add(a);
    put(a, sph(0.14, 10, 8), grey);
    put(a, new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), cream, [sx * 0.08, -0.34, 0]);
    put(a, new THREE.TorusGeometry(0.12, 0.05, 6, 12, Math.PI * 1.3), red, [sx * 0.08, -0.72, 0], [0, 0, -Math.PI * 0.15 + Math.PI]);
    arms.push(a);
  }
  // wind-up key
  const key = new THREE.Group(); key.position.set(0, 1.1, -0.42); g.add(key);
  put(key, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), yel, [0, 0, -0.12], [Math.PI / 2, 0, 0]);
  put(key, new THREE.TorusGeometry(0.15, 0.045, 6, 12), yel, [-0.16, 0, -0.3]);
  put(key, new THREE.TorusGeometry(0.15, 0.045, 6, 12), yel, [0.16, 0, -0.3]);
  loop(g, 2.3);
  const anim = (t, mood) => {
    key.rotation.z = t * (mood === 'help' ? 1.5 : 3);
    bulb.material.emissiveIntensity = 0.3 + 2 * Math.max(0, Math.sin(t * (mood === 'help' ? 8 : 3)));
    lamps.forEach((l, i) => { l.material.emissive = l.material.color; l.material.emissiveIntensity = Math.sin(t * 5 + i * 2) > 0.3 ? 0.9 : 0.05; });
    const blink = Math.sin(t * 0.9) > 0.985 ? 0.1 : 1;
    eyes.forEach((e) => (e.scale.y = blink));
    if (mood === 'hang') { arms[0].rotation.z = -2.6; arms[1].rotation.z = 2.6; arms[0].rotation.x = arms[1].rotation.x = 0; head.rotation.y = Math.sin(t * 1.5) * 0.3; }
    else if (mood === 'happy') { arms[0].rotation.z = arms[1].rotation.z = 0; arms[0].rotation.x = Math.sin(t * 9) * 1.2 - 1.2; arms[1].rotation.x = -Math.sin(t * 9) * 1.2 - 1.2; head.rotation.y = Math.sin(t * 4) * 0.4; }
    else { arms[0].rotation.x = arms[1].rotation.x = 0; arms[0].rotation.z = -1.4 + Math.sin(t * 6) * 0.9; arms[1].rotation.z = 1.4 + Math.sin(t * 6) * 0.9; head.rotation.y = Math.sin(t * 1.3) * 0.5; }
  };
  return { name: 'robot', group: g, height: 2.3, anim, carry: { len: 2.6, damp: 0.6, mass: 0.42, spring: 0, g: 22 } };
}

export function makeKite() {
  // diamond kite with a face and a bow-tie tail; origin at the bottom corner, loop at the top corner
  const g = new THREE.Group(), H = 1.9;
  const face = new THREE.Group(); face.position.y = 0.95; g.add(face);
  const tri = (a, b, c, col) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); geo.computeVertexNormals();
    put(face, geo, M(col, { r: 0.45, side: THREE.DoubleSide }));
  };
  const T = [0, 0.85, 0], B = [0, -0.95, 0], Lp = [-0.72, 0.18, 0], R = [0.72, 0.18, 0], C = [0, 0.18, 0.06];
  tri(T, Lp, C, 0xff4f6d); tri(T, C, R, 0xffd23f); tri(Lp, B, C, 0xffd23f); tri(C, B, R, 0xff4f6d);
  const stick = M(0xc98d55, { r: 0.7 });
  put(face, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), stick, [0, -0.05, 0.07]);
  put(face, new THREE.CylinderGeometry(0.03, 0.03, 1.44, 5), stick, [0, 0.18, 0.07], [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) { put(face, new THREE.SphereGeometry(0.09, 10, 8), BLACK(), [sx * 0.2, 0.32, 0.1], null, [1, 1, 0.5], false); put(face, new THREE.SphereGeometry(0.03, 6, 6), M(0xffffff, { e: 0xffffff }), [sx * 0.2 + 0.02, 0.35, 0.14], null, null, false); }
  put(face, new THREE.TorusGeometry(0.11, 0.022, 5, 10, Math.PI), BLACK(), [0, 0.06, 0.1], [0, 0, Math.PI], null, false);
  const tail = [];
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Group(); (i ? tail[i - 1] : face).add(k); k.position.y = i ? -0.42 : -0.95;
    put(k, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), M(0xffffff, { r: 0.8 }), [0, -0.21, 0], null, null, false);
    put(k, new THREE.ConeGeometry(0.12, 0.2, 4), M([0x3d8fe0, 0x7bd66a, 0xff8a3c, 0xb86bff][i], { r: 0.5 }), [0.09, -0.34, 0], [0, 0, Math.PI / 2], [1, 1, 0.3], false);
    put(k, new THREE.ConeGeometry(0.12, 0.2, 4), M([0x3d8fe0, 0x7bd66a, 0xff8a3c, 0xb86bff][i], { r: 0.5 }), [-0.09, -0.34, 0], [0, 0, -Math.PI / 2], [1, 1, 0.3], false);
    tail.push(k);
  }
  loop(g, H);
  const anim = (t, mood) => {
    tail.forEach((k, i) => { k.rotation.z = Math.sin(t * (mood === 'hang' ? 6 : 2.5) - i * 0.8) * (mood === 'hang' ? 0.45 : 0.25); k.rotation.x = Math.sin(t * 1.7 - i) * 0.15; });
    face.rotation.y = mood === 'happy' ? Math.sin(t * 5) * 0.3 : Math.sin(t * 1.4) * 0.08;
  };
  return { name: 'kite', group: g, height: H, anim, carry: { len: 2.4, damp: 2.4, mass: 0.03, spring: 0, g: 18 } };
}

export function makeBall() {
  // striped bouncy ball; rides on a stretchy cable so it boings
  const g = new THREE.Group(), r = 0.5, H = 1.18;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'); ['#ff4f6d', '#ffd23f', '#3d9be9', '#7bd66a', '#ffffff', '#b86bff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(0, i * 128 / 6, 256, 128 / 6 + 1); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Group(); body.position.y = r; g.add(body);
  put(body, new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, envMapIntensity: 0.9 }), [0, 0, 0], [0, 0, 0.3]);
  for (const sx of [-1, 1]) { put(body, new THREE.SphereGeometry(0.08, 10, 8), BLACK(), [sx * 0.16, 0.1, r - 0.04], null, [1, 1, 0.5], false); put(body, new THREE.SphereGeometry(0.026, 6, 6), M(0xffffff, { e: 0xffffff }), [sx * 0.16 + 0.02, 0.13, r + 0.01], null, null, false); }
  put(body, new THREE.TorusGeometry(0.1, 0.02, 5, 10, Math.PI), BLACK(), [0, -0.05, r - 0.02], [0.2, 0, Math.PI], null, false);
  loop(g, H);
  const anim = (t, mood) => {
    const b = mood === 'happy' ? Math.abs(Math.sin(t * 6)) * 0.12 : 0;
    body.position.y = r + b; body.scale.set(1 + (mood === 'help' ? Math.sin(t * 3) * 0.03 : 0), 1 - (mood === 'help' ? Math.sin(t * 3) * 0.03 : 0), 1);
  };
  return { name: 'ball', group: g, height: H, anim, carry: { len: 2.0, damp: 0.8, mass: 0.05, spring: 150, g: 24 } };
}

export function makeBoat() {
  // toy sailboat; origin at the waterline, loop at the top of the mast
  const g = new THREE.Group(), H = 2.05;
  const hull = new THREE.Group(); g.add(hull);
  put(hull, new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0xff6b4a, { r: 0.35 }), [0, 0.18, 0], null, [1.0, 0.7, 1.9]);
  put(hull, new RoundedBoxGeometry(0.98, 0.1, 1.8, 2, 0.05), M(0xfff1d6, { r: 0.6 }), [0, 0.2, 0], null, [1, 1, 1]);
  put(hull, new THREE.TorusGeometry(0.5, 0.05, 6, 24), M(0xffffff, { r: 0.4 }), [0, 0.2, 0], [Math.PI / 2, 0, 0], [1, 1.85, 1]);
  for (const sx of [-1, 1]) { put(hull, new THREE.SphereGeometry(0.075, 10, 8), BLACK(), [sx * 0.16, 0.1, 0.9], null, [1, 1, 0.5], false); put(hull, new THREE.SphereGeometry(0.024, 6, 6), M(0xffffff, { e: 0xffffff }), [sx * 0.16 + 0.02, 0.13, 0.94], null, null, false); }
  put(hull, new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), M(0xc98d55, { r: 0.7 }), [0, 1.05, 0.05]);
  const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.lineTo(0, 1.3); sail.quadraticCurveTo(0.5, 0.5, 0.75, 0); sail.closePath();
  const sailG = new THREE.Group(); sailG.position.set(0, 0.35, 0.08); hull.add(sailG);
  put(sailG, new THREE.ShapeGeometry(sail, 6), M(0xffffff, { r: 0.7, side: THREE.DoubleSide }), [0, 0, 0], [0, -Math.PI / 2, 0]);
  const flag = put(hull, new THREE.ConeGeometry(0.12, 0.34, 3), M(0x3d8fe0, { r: 0.5 }), [0, 1.82, -0.17], [Math.PI / 2, 0, 0], [1, 1, 0.25]);
  loop(g, H);
  const anim = (t, mood) => {
    sailG.rotation.y = Math.sin(t * 1.3) * 0.18; flag.rotation.z = Math.sin(t * 7) * 0.4;
    hull.rotation.z = mood === 'happy' ? Math.sin(t * 6) * 0.15 : 0;
  };
  return { name: 'boat', group: g, height: H, anim, carry: { len: 2.2, damp: 1.4, mass: 0.06, spring: 0, g: 24 } };
}

export function makeDoll() {
  // rag doll with yarn hair; sits upright, loop on top of her head
  const g = new THREE.Group(), H = 1.7;
  const cloth = M(0x7bc8f6, { r: 0.8, env: 0.3 }), skin = M(0xf7c9a0, { r: 0.7, env: 0.3 }), hair = M(0xff7a2a, { r: 0.9, env: 0.2 });
  put(g, new THREE.ConeGeometry(0.5, 0.85, 14), cloth, [0, 0.55, 0]);
  put(g, new THREE.SphereGeometry(0.06, 6, 6), M(0xffd23f), [0, 0.7, 0.3], null, null, false);
  put(g, new THREE.SphereGeometry(0.06, 6, 6), M(0xffd23f), [0, 0.5, 0.36], null, null, false);
  const head = new THREE.Group(); head.position.set(0, 1.25, 0); g.add(head);
  put(head, new THREE.SphereGeometry(0.34, 18, 14), skin);
  const hg = [];
  for (let i = 0; i < 9; i++) { const a = -1.4 + i * 0.35; hg.push(tg(new THREE.SphereGeometry(0.11, 8, 6), [Math.sin(a) * 0.32, 0.18 + Math.cos(a) * 0.08, Math.cos(a) * -0.12 - 0.04])); }
  for (const sx of [-1, 1]) hg.push(tg(new THREE.CapsuleGeometry(0.08, 0.32, 3, 8), [sx * 0.33, -0.1, -0.06], [0, 0, sx * 0.25]));
  put(head, merge(hg), hair);
  for (const sx of [-1, 1]) { put(head, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), BLACK(), [sx * 0.12, 0.03, 0.31], [Math.PI / 2, 0, 0], null, false); put(head, new THREE.SphereGeometry(0.05, 8, 6), M(0xff9aa8, { r: 0.7 }), [sx * 0.2, -0.08, 0.27], null, [1, 0.7, 0.5], false); }
  put(head, new THREE.TorusGeometry(0.08, 0.018, 5, 10, Math.PI), M(0xd23b5a, { r: 0.6 }), [0, -0.1, 0.31], [0.1, 0, Math.PI], null, false);
  const arms = [], legs = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.2, 0.88, 0); g.add(a);
    put(a, new THREE.CapsuleGeometry(0.07, 0.38, 3, 8), skin, [sx * 0.08, -0.22, 0], [0, 0, sx * 0.35]); arms.push(a);
    const l = new THREE.Group(); l.position.set(sx * 0.16, 0.2, 0.1); g.add(l);
    put(l, new THREE.CapsuleGeometry(0.08, 0.36, 3, 8), skin, [0, -0.05, 0.25], [Math.PI / 2 - 0.3, 0, 0]);
    put(l, new THREE.SphereGeometry(0.1, 8, 6), M(0xe23b2e, { r: 0.5 }), [0, -0.1, 0.48], null, [1, 0.8, 1.3]); legs.push(l);
  }
  loop(g, H);
  const anim = (t, mood) => {
    if (mood === 'hang') { arms[0].rotation.z = -2.4; arms[1].rotation.z = 2.4; legs.forEach((l, i) => (l.rotation.x = 1.1 + Math.sin(t * 5 + i * 3) * 0.35)); }
    else if (mood === 'happy') { arms[0].rotation.z = -2 + Math.sin(t * 8) * 0.4; arms[1].rotation.z = 2 - Math.sin(t * 8 + 1) * 0.4; legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 8 + i * 3) * 0.3)); }
    else { arms[0].rotation.z = -1.6 + Math.sin(t * 6) * 0.6; arms[1].rotation.z = Math.sin(t * 1.4) * 0.1; legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 2.2 + i * 3) * 0.2)); }
    head.rotation.z = Math.sin(t * 1.6) * 0.12;
  };
  return { name: 'doll', group: g, height: H, anim, carry: { len: 2.3, damp: 1.8, mass: 0.05, spring: 0, g: 28 } };
}

export function makeBunny() {
  // plush bunny who rides the seesaw; hops back to it after every flight
  const g = new THREE.Group(), H = 1.95, fur = M(0xfff4f8, { r: 0.85, env: 0.3 }), pink = M(0xffa6c8, { r: 0.7 });
  put(g, sph(0.5), fur, [0, 0.52, 0], null, [1, 1.05, 0.95]);
  put(g, sph(0.3), M(0xffe0ec, { r: 0.85 }), [0, 0.48, 0.3], null, [1, 1.1, 0.5]);
  put(g, sph(0.2), fur, [0, 0.25, -0.45]);
  const head = new THREE.Group(); head.position.set(0, 1.18, 0.05); g.add(head);
  put(head, sph(0.4), fur, [0, 0, 0], null, [1.05, 0.95, 0.95]);
  eye(head, -0.14, 0.06, 0.33); eye(head, 0.14, 0.06, 0.33);
  put(head, sph(0.06), pink, [0, -0.06, 0.38], null, [1.2, 0.8, 0.8], false);
  for (const sx of [-1, 1]) put(head, sph(0.07), M(0xffb0c8, { r: 0.7 }), [sx * 0.24, -0.1, 0.3], null, [1, 0.6, 0.5], false);
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.15, 0.3, -0.02); head.add(e);
    put(e, new THREE.CapsuleGeometry(0.1, 0.42, 4, 10), fur, [0, 0.3, 0], null, [1, 1, 0.6]);
    put(e, new THREE.CapsuleGeometry(0.05, 0.34, 4, 8), pink, [0, 0.3, 0.05], null, [1, 1, 0.4], false);
    ears.push(e);
  }
  for (const sx of [-1, 1]) { put(g, sph(0.15), fur, [sx * 0.42, 0.62, 0.12]); put(g, sph(0.17), fur, [sx * 0.24, 0.12, 0.3], null, [1, 0.6, 1.4]); }
  loop(g, H);
  const anim = (t, mood) => {
    const k = mood === 'hang' ? 1 : mood === 'happy' ? 0.7 : 0.25;
    ears[0].rotation.z = 0.2 + Math.sin(t * 6) * 0.25 * k; ears[1].rotation.z = -0.2 - Math.sin(t * 6 + 1) * 0.25 * k;
    ears.forEach((e) => (e.rotation.x = mood === 'hang' ? -0.5 : Math.sin(t * 1.3) * 0.1));
    head.rotation.z = Math.sin(t * 1.1) * 0.08;
  };
  return { name: 'bunny', group: g, height: H, anim, carry: { len: 2.2, damp: 1.6, mass: 0.05, spring: 0, g: 26 } };
}

/** Golden acorn hidden around the yard. */
export function makeAcorn() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.55, roughness: 0.25, emissive: 0xffa400, emissiveIntensity: 0.35 });
  put(g, new THREE.SphereGeometry(0.34, 16, 12), gold, [0, 0.36, 0], null, [1, 1.25, 1]);
  put(g, new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xa66a2a, { r: 0.8 }), [0, 0.6, 0], null, [1, 0.6, 1]);
  put(g, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6), M(0x7a4a22, { r: 0.8 }), [0, 0.88, 0], [0, 0, 0.3]);
  return { group: g, gold };
}

export function makeHook() {
  const g = new THREE.Group(), y = M(0xffcf3a, { r: 0.3 });
  put(g, new THREE.SphereGeometry(0.11, 10, 8), M(0xe23b2e, { r: 0.3 }), [0, 0.06, 0]);
  put(g, new THREE.TorusGeometry(0.13, 0.04, 6, 14, Math.PI * 1.45), y, [0, -0.14, 0], [0, 0, -Math.PI * 0.2]);
  return g;
}

/** Bouncing "come here" arrow. */
export function makeMarker(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  const cone = new THREE.ConeGeometry(0.62, 0.9, 20), stem = new THREE.CylinderGeometry(0.26, 0.26, 0.7, 14);
  const arrow = new THREE.Group(); g.add(arrow);
  const a = put(arrow, cone, mat, [0, 0.45, 0], [Math.PI, 0, 0], null, false);
  const b = put(arrow, stem, mat, [0, 1.2, 0], null, null, false);
  // chunky white outline so it reads against any background
  put(arrow, cone, white, [0, 0.43, 0], [Math.PI, 0, 0], 1.22, false);
  put(arrow, stem, white, [0, 1.2, 0], null, [1.32, 1.1, 1.32], false);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; g.add(ring);
  a.renderOrder = b.renderOrder = 4;
  return { g, arrow, ring };
}
