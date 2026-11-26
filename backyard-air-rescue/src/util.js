import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Deterministic random so the yard looks the same every launch.
let seed = 1337;
export function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + (b - a) * rnd();
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

const matCache = new Map();
/** Painted-toy material: soft sheen, no metal. */
export function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.r ?? 0.5,
    metalness: o.m ?? 0,
    emissive: o.e ?? 0x000000,
    emissiveIntensity: o.ei ?? 1,
    transparent: o.t ?? false,
    opacity: o.o ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: o.flat ?? false,
    envMapIntensity: o.env ?? 0.55,
  });
  matCache.set(key, m);
  return m;
}

/** Create a mesh, place it, add to parent. */
export function put(parent, geo, mat, p = [0, 0, 0], r = null, s = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** Transformed, non-indexed copy of a geometry (for merging). */
export function tg(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (typeof s === 'number') s = [s, s, s];
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  _m.compose(new THREE.Vector3(...p), _q, new THREE.Vector3(...s));
  g.applyMatrix4(_m);
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  }
  return g;
}
export function merge(geos) {
  return mergeGeometries(geos, false);
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return t;
}

/** Soft round blob used for contact shadows. */
let blobTex = null;
export function blobShadow(radius, opacity = 0.45) {
  if (!blobTex) {
    blobTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(20,40,30,1)');
      gr.addColorStop(0.55, 'rgba(20,40,30,0.55)');
      gr.addColorStop(1, 'rgba(20,40,30,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
