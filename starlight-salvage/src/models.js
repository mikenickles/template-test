import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge } from './util.js';

const sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const BLACK = () => M(0x1c1c24, { r: 0.15, env: 1 });

// ---------------------------------------------------------------- salvage tug
// Local forward is +Z. Origin is the body centre. Same proportions and face as the rescue helicopter.
export function makeShip() {
  const root = new THREE.Group();      // world position
  const body = new THREE.Group();      // yaw + lean
  root.add(body);
  const red = new THREE.MeshStandardMaterial({ color: 0xdc1f2e, roughness: 0.22, envMapIntensity: 1.0 }), white = M(0xfff8ee, { r: 0.3, env: 0.8 }), yellow = M(0xffcf3a, { r: 0.3 }), dark = M(0x3a3f4a, { r: 0.4 });

  // bubbly cabin, white belly
  put(body, sph(0.82, 28, 20), red, [0, 0, 0], null, [1, 0.9, 1.3]);
  put(body, new THREE.SphereGeometry(0.835, 28, 10, 0, 6.283, Math.PI * 0.64, Math.PI * 0.36), white, [0, 0, 0], null, [1, 0.9, 1.3]);
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, envMapIntensity: 1.6 });
  put(body, sph(0.64, 24, 16), glass, [0, 0.16, 0.55], null, [1.05, 0.82, 0.86]);
  put(body, sph(0.2, 10, 8), M(0xffffff, { r: 0.1, t: true, o: 0.75, e: 0xffffff, ei: 0.3 }), [-0.26, 0.45, 0.9], [0.2, 0, 0.5], [1, 0.32, 0.3], false);
  // headlamp eyes + smile: it's a character, not a machine
  for (const sx of [-1, 1]) {
    put(body, sph(0.17, 14, 10), white, [sx * 0.36, -0.3, 0.9]);
    put(body, sph(0.085, 10, 8), BLACK(), [sx * 0.37, -0.29, 1.04], null, null, false);
    put(body, sph(0.03, 6, 6), M(0xffffff, { e: 0xffffff, ei: 1 }), [sx * 0.35, -0.26, 1.115], null, null, false);
  }
  put(body, new THREE.TorusGeometry(0.2, 0.03, 6, 14, Math.PI * 0.8), BLACK(), [0, -0.38, 0.96], [0.5, 0, Math.PI + 0.31], null, false);
  // stubby wings carrying two engine pods
  put(body, new RoundedBoxGeometry(2.5, 0.12, 0.6, 2, 0.05), white, [0, -0.05, -0.45]);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x59d8ff, emissiveIntensity: 1.5 });
  const flames = [];
  for (const sx of [-1, 1]) {
    put(body, new THREE.CapsuleGeometry(0.27, 0.6, 6, 14), red, [sx * 1.22, -0.05, -0.5], [Math.PI / 2, 0, 0]);
    put(body, new THREE.TorusGeometry(0.275, 0.05, 6, 18), yellow, [sx * 1.22, -0.05, -0.3]);
    put(body, new THREE.CylinderGeometry(0.2, 0.26, 0.22, 14), dark, [sx * 1.22, -0.05, -1.08], [Math.PI / 2, 0, 0]);
    put(body, new THREE.CircleGeometry(0.17, 14), glowMat, [sx * 1.22, -0.05, -1.2], [0, Math.PI, 0], null, false);
    const f = put(body, new THREE.ConeGeometry(0.16, 0.9, 12, 1, true), flameMat, [sx * 1.22, -0.05, -1.65], [-Math.PI / 2, 0, 0], null, false);
    flames.push(f);
  }
  // tail fin + beacon
  put(body, new RoundedBoxGeometry(0.12, 0.7, 0.6, 2, 0.06), red, [0, 0.62, -0.95], [-0.45, 0, 0]);
  const beacon = put(body, sph(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3020, emissiveIntensity: 2 }), [0, 1.0, -1.18], null, null, false);
  // airlock hatch on the port side
  put(body, new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18), yellow, [-0.8, -0.08, 0.05], [0, 0, Math.PI / 2]);
  put(body, new THREE.CylinderGeometry(0.21, 0.21, 0.1, 18), dark, [-0.81, -0.08, 0.05], [0, 0, Math.PI / 2]);
  // winch drum under the belly
  put(body, new THREE.CylinderGeometry(0.16, 0.16, 0.34, 12), dark, [0, -0.74, 0], [0, 0, Math.PI / 2]);
  // scanner dish on the roof: flopped over and dark until it is repaired
  const dish = new THREE.Group(); dish.position.set(0, 0.7, -0.25); body.add(dish);
  put(dish, new THREE.CylinderGeometry(0.04, 0.05, 0.36, 8), dark, [0, 0.18, 0]);
  const bowl = new THREE.Group(); bowl.position.y = 0.36; dish.add(bowl);
  put(bowl, new THREE.SphereGeometry(0.36, 18, 8, 0, 6.283, Math.PI * 0.62, Math.PI * 0.38), M(0xfff8ee, { r: 0.3, side: THREE.DoubleSide }), [0, 0.34, 0]);
  const dishLight = put(bowl, sph(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x35d07f, emissiveIntensity: 0 }), [0, 0.2, 0], null, null, false);
  put(bowl, new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), dark, [0, 0.1, 0]);
  body.scale.setScalar(0.92);
  return {
    root, body, beacon, flames, glowMat, dish, bowl, dishLight, paint: red,
    hookLocal: new THREE.Vector3(0, -0.82, 0), airlockLocal: new THREE.Vector3(-0.95, -0.08, 0.05),
    setThrust(k, t) {
      const s = 0.25 + k * 1.1 + Math.sin(t * 40) * 0.05;
      for (const f of flames) { f.scale.set(1, s, 1); f.position.z = -1.2 - 0.45 * s; }
      flameMat.opacity = 0.35 + k * 0.5; glowMat.emissiveIntensity = 1 + k * 2.5;
    },
    setDish(fixed, t = 0) {
      dish.rotation.z = fixed ? 0 : 1.15; dish.rotation.x = fixed ? 0 : 0.3;
      bowl.rotation.y = fixed ? t * 1.2 : 0; bowl.rotation.x = fixed ? 0.5 : 0;
      dishLight.material.emissiveIntensity = fixed ? (Math.sin(t * 5) > 0 ? 3 : 0.4) : 0;
    },
  };
}

// ---------------------------------------------------------------- astronaut
// Local forward is +Z, origin at the chest.
export function makeAstronaut() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const white = M(0xfff8ee, { r: 0.45 }), orange = M(0xff8a2a, { r: 0.4 }), grey = M(0x8a90a0, { r: 0.5 });
  put(body, new THREE.CapsuleGeometry(0.24, 0.22, 6, 14), white, [0, 0, 0]);
  put(body, new THREE.TorusGeometry(0.245, 0.04, 6, 16), orange, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
  put(body, sph(0.29, 20, 14), white, [0, 0.46, 0]);
  put(body, sph(0.23, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.7, roughness: 0.12, envMapIntensity: 1.6 }), [0, 0.46, 0.11], null, [1, 0.82, 0.9]);
  put(body, new RoundedBoxGeometry(0.4, 0.5, 0.2, 2, 0.07), grey, [0, 0.08, -0.26]);
  const limbs = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.27, 0.12, 0); body.add(arm);
    put(arm, new THREE.CapsuleGeometry(0.085, 0.2, 4, 10), white, [sx * 0.08, -0.14, 0.04], [0, 0, sx * 0.5]);
    put(arm, sph(0.1, 10, 8), orange, [sx * 0.17, -0.3, 0.06]);
    const leg = new THREE.Group(); leg.position.set(sx * 0.12, -0.28, 0); body.add(leg);
    put(leg, new THREE.CapsuleGeometry(0.1, 0.18, 4, 10), white, [0, -0.16, 0]);
    put(leg, new RoundedBoxGeometry(0.2, 0.12, 0.27, 2, 0.05), grey, [0, -0.34, 0.03]);
    limbs.push(arm, leg);
  }
  const lamp = put(body, sph(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x59d8ff, emissiveIntensity: 2 }), [0.2, 0.34, -0.3], null, null, false);
  body.scale.setScalar(1.25);
  return {
    root, body, lamp, packLocal: new THREE.Vector3(0, 0.1, -0.4),
    anim(t, speed01) {
      const k = 0.25 + speed01 * 0.5;
      limbs[0].rotation.x = Math.sin(t * 1.7) * k; limbs[2].rotation.x = -Math.sin(t * 1.7) * k;
      limbs[1].rotation.x = Math.sin(t * 1.3 + 1) * k * 0.8; limbs[3].rotation.x = -Math.sin(t * 1.3 + 1) * k * 0.8;
    },
  };
}

// ---------------------------------------------------------------- salvage
// Origin at the base, hang point at (0, height, 0). Each has anim(t).
function loop(parent, y) {
  // little carry-loop so the hook has something believable to grab
  put(parent, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), M(0x3a3f4a, { r: 0.4 }), [0, y - 0.26, 0]);
  put(parent, new THREE.TorusGeometry(0.13, 0.035, 6, 14), M(0xffcf3a, { r: 0.3 }), [0, y - 0.1, 0]);
}
const MAKERS = {
  panel() {
    const g = new THREE.Group(), p = new THREE.Group(); p.position.y = 0.3; p.rotation.set(0.25, 0, 0.12); g.add(p);
    put(p, new RoundedBoxGeometry(1.7, 0.12, 1.1, 2, 0.05), M(0x4fb6c4, { r: 0.35, m: 0.2 }));
    put(p, new RoundedBoxGeometry(1.72, 0.13, 0.22, 2, 0.05), M(0xffcf3a, { r: 0.35 }), [0, 0, 0.25]);
    put(p, new RoundedBoxGeometry(0.5, 0.14, 0.4, 2, 0.05), M(0xfff8ee, { r: 0.4 }), [-0.4, 0.01, -0.22]);
    const riv = []; for (const x of [-0.75, 0.75]) for (const z of [-0.45, 0.45]) riv.push(tg(sph(0.05, 6, 5), [x, 0.07, z]));
    put(p, merge(riv), M(0x3a3f4a, { r: 0.4 }));
    loop(g, 0.85);
    return { group: g, height: 0.85, anim() {} };
  },
  tank() {
    const g = new THREE.Group(), p = new THREE.Group(); p.position.y = 0.45; g.add(p);
    put(p, new THREE.CapsuleGeometry(0.42, 0.9, 8, 18), M(0xff8a2a, { r: 0.3 }), [0, 0, 0], [0, 0, Math.PI / 2]);
    for (const x of [-0.35, 0.35]) put(p, new THREE.TorusGeometry(0.43, 0.05, 6, 20), M(0xfff8ee, { r: 0.35 }), [x, 0, 0], [0, Math.PI / 2, 0]);
    put(p, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), M(0x3a3f4a, { r: 0.4 }), [0.92, 0, 0], [0, 0, Math.PI / 2]);
    loop(g, 1.12);
    return { group: g, height: 1.12, anim() {} };
  },
  gear() {
    const g = new THREE.Group(), p = new THREE.Group(); p.position.y = 0.5; g.add(p);
    const brass = M(0xe0a53a, { r: 0.3, m: 0.6, env: 1 });
    const parts = [tg(new THREE.TorusGeometry(0.33, 0.12, 8, 20))];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; parts.push(tg(new THREE.BoxGeometry(0.17, 0.2, 0.2), [Math.cos(a) * 0.47, Math.sin(a) * 0.47, 0], [0, 0, a - Math.PI / 2])); }
    put(p, merge(parts), brass);
    put(p, new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10), M(0x3a3f4a, { r: 0.4 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
    loop(g, 1.2);
    return { group: g, height: 1.2, anim(t) { p.rotation.z = t * 0.5; } };
  },
  coil() {
    const g = new THREE.Group(), copper = M(0xe07a3a, { r: 0.3, m: 0.5, env: 1 }), blue = M(0x2f9bff, { r: 0.35 });
    const rings = []; for (let i = 0; i < 4; i++) rings.push(tg(new THREE.TorusGeometry(0.3, 0.075, 6, 18), [0, 0.2 + i * 0.13, 0], [Math.PI / 2, 0, 0]));
    put(g, merge(rings), copper);
    for (const y of [0.08, 0.72]) put(g, new THREE.CylinderGeometry(0.4, 0.4, 0.07, 18), blue, [0, y, 0]);
    put(g, new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10), blue, [0, 0.4, 0]);
    loop(g, 1.0);
    return { group: g, height: 1.0, anim() {} };
  },
  cell() {
    const g = new THREE.Group();
    const glow = new THREE.MeshStandardMaterial({ color: 0xbfffd8, emissive: 0x35d07f, emissiveIntensity: 1.5, roughness: 0.3 });
    put(g, new THREE.CylinderGeometry(0.26, 0.26, 0.62, 16), M(0x3a3f4a, { r: 0.35 }), [0, 0.42, 0]);
    put(g, new THREE.CylinderGeometry(0.275, 0.275, 0.26, 16), glow, [0, 0.42, 0], null, null, false);
    for (const y of [0.1, 0.74]) put(g, new THREE.CylinderGeometry(0.29, 0.29, 0.1, 16), M(0xffcf3a, { r: 0.3 }), [0, y, 0]);
    loop(g, 1.02);
    return { group: g, height: 1.02, anim(t) { glow.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.8; } };
  },
};
export function makeItem(kind) { return MAKERS[kind](); }

export function makeHook() {
  const g = new THREE.Group(), y = M(0xffcf3a, { r: 0.3 });
  put(g, new THREE.SphereGeometry(0.11, 10, 8), M(0xe23b2e, { r: 0.3 }), [0, 0.06, 0]);
  put(g, new THREE.TorusGeometry(0.13, 0.04, 6, 14, Math.PI * 1.45), y, [0, -0.14, 0], [0, 0, -Math.PI * 0.2]);
  return g;
}

/** Bouncing "come here" arrow with a ring. */
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
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; g.add(ring);
  a.renderOrder = b.renderOrder = 4;
  return { g, arrow, ring };
}
