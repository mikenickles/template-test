import * as THREE from 'three';
import { CFG, OPTS, makeRng, clamp, lerp, smoothstep } from './config.js';
import { extractParts, shared } from './assets.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Spatially chunked InstancedMeshes: per-chunk frustum culling for the camera and point-light shadow passes. */
export class InstanceSet {
  constructor(parent, parts, items, { chunk = 38, castShadow = true, receiveShadow = true } = {}) {
    this.meshes = [];
    const cells = new Map();
    for (const it of items) {
      const key = Math.floor((it.x + 100) / chunk) + ':' + Math.floor((it.z + 100) / chunk);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    for (const list of cells.values()) {
      const ims = parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.castShadow = castShadow;
        im.receiveShadow = receiveShadow;
        const sh = part.material.userData.shadow;
        if (sh) { im.customDepthMaterial = sh.depth; im.customDistanceMaterial = sh.dist; }
        im.matrixAutoUpdate = false;
        parent.add(im);
        this.meshes.push(im);
        return im;
      });
      list.forEach((it, i) => {
        it.inst = { meshes: ims, index: i };
        for (const im of ims) {
          im.setMatrixAt(i, it.matrix);
          if (it.color) im.setColorAt(i, it.color);
        }
      });
      for (const im of ims) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.computeBoundingBox();
      }
    }
  }

  static setMatrix(item, matrix) {
    for (const im of item.inst.meshes) {
      im.setMatrixAt(item.inst.index, matrix);
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

const TREE_KINDS = [
  { name: 'pine_a', w: 0.20, h: [9, 14], conifer: true },
  { name: 'pine_b', w: 0.16, h: [10, 14], conifer: true },
  { name: 'pine_c', w: 0.19, h: [8.5, 13], conifer: true },
  { name: 'oak_a', w: 0.17, h: [6.2, 9.8] },
  { name: 'oak_b', w: 0.14, h: [6.5, 10] },
  { name: 'birch_a', w: 0.14, h: [7.5, 11.5] },
];

export class World {
  constructor({ scene, terrain, assets, mats, splat }) {
    this.scene = scene;
    this.terrain = terrain;
    this.assets = assets;
    this.mats = mats;
    this.splat = splat;
    this.rng = makeRng(CFG.SEED + 5);
    this.group = new THREE.Group();
    this.group.name = 'World';
    scene.add(this.group);
    this.trees = [];          // harvestable, playable area
    this.boulders = [];       // harvestable, playable area
    this.logs = [];
    this.border = [];         // impassable ridge trees + rocks
    this.colliders = [];
    this.animating = new Set();
    this.parts = {};
    for (const k of ['pine_a', 'pine_b', 'pine_c', 'oak_a', 'oak_b', 'birch_a', 'bush_a', 'fern_a', 'log_a', 'boulder_a', 'boulder_b', 'boulder_c']) {
      this.parts[k] = extractParts(assets.M[k], mats);
    }
  }

  build() {
    this._placeTrees();
    this._placeBoulders();
    this._placeLogs();
    this._placeBorder();
    this._placeUndergrowth();
    this.splat.build(this);
    this._buildGrass();
    this._buildFlowers();
    this._instantiate();
    return this;
  }

  // ---------------------------------------------------------------- scatter
  _treeMatrix(o, scaleMul = 1, tiltX = 0, tiltZ = 0, yawAdd = 0) {
    _e.set(o.tiltX + tiltX, o.rot + yawAdd, o.tiltZ + tiltZ, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(o.x, o.y, o.z);
    _s.setScalar(o.scale * scaleMul);
    return _m.compose(_p, _q, _s);
  }

  _pickKind(r, coniferBias = 0) {
    let acc = 0;
    for (const k of TREE_KINDS) {
      const w = k.conifer ? k.w * (1 + coniferBias) : k.w * (1 - coniferBias);
      acc += w;
      if (r * (1 + 0) < acc) return k;
    }
    return TREE_KINDS[0];
  }

  _makeTree(x, z, border) {
    const rng = this.rng, info = this.assets.vegInfo;
    const kind = this._pickKind(rng(), border ? 0.35 : 0);
    let h = lerp(kind.h[0], kind.h[1], rng());
    if (border) h = clamp(h * lerp(0.85, 1.05, rng()), 6.5, 14);
    const meta = info[kind.name];
    const scale = h / meta.height;
    const t = {
      type: 'tree', kind: kind.name, x, z, y: this.terrain.heightAt(x, z), height: h, scale,
      rot: rng() * Math.PI * 2, tiltX: (rng() - 0.5) * 0.07, tiltZ: (rng() - 0.5) * 0.07,
      radius: Math.max(0.3, meta.trunkRadius * scale + 0.14), crown: meta.crownRadius * scale,
      hp: CFG.HITS_TO_DEPLETE, hits: 0, alive: true, border, resource: 'wood', shake: 0,
    };
    const c = new THREE.Color().setHSL(0, 0, 1);
    const v = lerp(0.82, 1.1, rng());
    c.setRGB(v * lerp(0.94, 1.08, rng()), v, v * lerp(0.88, 1.04, rng()));
    t.color = c;
    t.matrix = this._treeMatrix(t).clone();
    return t;
  }

  _placeTrees() {
    const rng = this.rng, P = CFG.PLAY_HALF - 2.0, minR = CFG.CLEAR_RADIUS + 2.5;
    let tries = 0;
    while (this.trees.length < CFG.TREE_COUNT && tries++ < 60000) {
      const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
      if (Math.hypot(x, z) < minR) continue;
      const grove = smoothstep(-0.45, 0.3, this.terrain.noiseB(x * 0.03 + 200, z * 0.03 - 200));
      if (rng() > 0.12 + 0.88 * grove) continue;
      if (this.terrain.slopeAt(x, z) > 0.6) continue;
      let ok = true;
      for (const t of this.trees) { if ((t.x - x) ** 2 + (t.z - z) ** 2 < 3.5 * 3.5) { ok = false; break; } }
      if (!ok) continue;
      this.trees.push(this._makeTree(x, z, false));
    }
  }

  _placeBoulders() {
    const rng = this.rng, P = CFG.PLAY_HALF - 2.5;
    let tries = 0;
    while (this.boulders.length < CFG.BOULDER_COUNT && tries++ < 60000) {
      const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
      const width = lerp(CFG.BOULDER_WIDTH[0] + 0.02, CFG.BOULDER_WIDTH[1] - 0.02, Math.pow(rng(), 1.35));
      if (Math.hypot(x, z) < CFG.CLEAR_RADIUS + width * 0.5 + 0.8) continue;
      let ok = true;
      for (const t of this.trees) { if (Math.hypot(t.x - x, t.z - z) < t.radius + width * 0.5 + 0.7) { ok = false; break; } }
      for (const b of this.boulders) { if (Math.hypot(b.x - x, b.z - z) < (b.width + width) * 0.5 + 0.9) { ok = false; break; } }
      if (!ok) continue;
      this.boulders.push(this._makeBoulder(x, z, width, false));
    }
  }

  _makeBoulder(x, z, width, border) {
    const rng = this.rng, T = this.terrain;
    const kind = ['boulder_a', 'boulder_b', 'boulder_c'][Math.floor(rng() * 3)];
    const e = width * 0.33;
    const y = Math.min(T.heightAt(x, z), T.heightAt(x + e, z), T.heightAt(x - e, z), T.heightAt(x, z + e), T.heightAt(x, z - e));
    const b = {
      type: 'boulder', kind, x, z, y, yCenter: T.heightAt(x, z), width, vScale: lerp(0.85, 1.15, rng()), scale: width,
      rot: rng() * Math.PI * 2, tiltX: 0, tiltZ: 0, radius: width * 0.44,
      hp: CFG.HITS_TO_DEPLETE, hits: 0, alive: true, border, resource: 'stone', shake: 0,
    };
    const v = lerp(0.85, 1.08, rng());
    b.color = new THREE.Color(v, v, v * lerp(0.94, 1.02, rng()));
    b.matrix = this._boulderMatrix(b).clone();
    return b;
  }

  _boulderMatrix(o, scaleMul = 1, jx = 0, jz = 0) {
    _e.set(0, o.rot, 0);
    _q.setFromEuler(_e);
    _p.set(o.x + jx, o.y, o.z + jz);
    _s.set(o.scale * scaleMul, o.scale * o.vScale * scaleMul, o.scale * scaleMul);
    return _m.compose(_p, _q, _s);
  }

  _placeLogs() {
    const rng = this.rng, P = CFG.PLAY_HALF - 5, T = this.terrain;
    let tries = 0;
    const half = 2.1;
    while (this.logs.length < CFG.LOG_COUNT && tries++ < 20000) {
      const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
      if (Math.hypot(x, z) < CFG.CLEAR_RADIUS + 4) continue;
      const rot = rng() * Math.PI;
      const dx = Math.cos(rot), dz = -Math.sin(rot);          // local +X after a Y rotation
      const h1 = T.heightAt(x - dx * half, z - dz * half), h2 = T.heightAt(x + dx * half, z + dz * half);
      if (Math.abs(h2 - h1) > 0.9) continue;
      let ok = true;
      for (const t of this.trees) {
        const along = (t.x - x) * dx + (t.z - z) * dz, perp = Math.abs(-(t.x - x) * dz + (t.z - z) * dx);
        if (Math.abs(along) < half + 0.9 && perp < 1.0 + t.radius) { ok = false; break; }
      }
      for (const b of this.boulders) { if (Math.hypot(b.x - x, b.z - z) < half + b.radius + 0.4) { ok = false; break; } }
      for (const l of this.logs) { if (Math.hypot(l.x - x, l.z - z) < 5) { ok = false; break; } }
      if (!ok) continue;
      const log = { type: 'log', x, z, y: (h1 + h2) / 2, rot, pitch: Math.atan2(h2 - h1, 2 * half), half, alive: true };
      _e.set(0, rot, log.pitch, 'YZX');
      _q.setFromEuler(_e);
      log.matrix = new THREE.Matrix4().compose(_p.set(x, log.y, z), _q, _s.set(1, 1, 1));
      log.color = new THREE.Color(0.95, 0.95, 0.95);
      this.logs.push(log);
    }
  }

  _placeBorder() {
    const rng = this.rng, H = CFG.HALF, T = this.terrain;
    const trees = [], rocks = [], bushes = [];
    let tries = 0;
    while (trees.length < 340 && tries++ < 80000) {
      const x = (rng() * 2 - 1) * (H - 0.6), z = (rng() * 2 - 1) * (H - 0.6);
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < CFG.PLAY_HALF + 0.9) continue;
      if (rng() > lerp(1.0, 0.45, (d - 60) / 15)) continue;       // densest right at the foot of the ridge
      const minD = d < 66 ? 2.3 : 3.0;
      let ok = true;
      for (const t of trees) { if ((t.x - x) ** 2 + (t.z - z) ** 2 < minD * minD) { ok = false; break; } }
      if (!ok) continue;
      trees.push(this._makeTree(x, z, true));
    }
    tries = 0;
    while (rocks.length < 90 && tries++ < 40000) {
      const x = (rng() * 2 - 1) * (H - 2), z = (rng() * 2 - 1) * (H - 2);
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < CFG.PLAY_HALF + 1.4) continue;
      const width = lerp(2.0, 5.2, rng());
      if (d - width * 0.5 < CFG.PLAY_HALF + 0.4) continue;
      let ok = true;
      for (const r of rocks) { if (Math.hypot(r.x - x, r.z - z) < (r.width + width) * 0.45) { ok = false; break; } }
      if (!ok) continue;
      const b = this._makeBoulder(x, z, width, true);
      b.y -= width * 0.12;
      b.matrix = this._boulderMatrix(b).clone();
      rocks.push(b);
    }
    tries = 0;
    while (bushes.length < 240 && tries++ < 20000) {
      const x = (rng() * 2 - 1) * 70, z = (rng() * 2 - 1) * 70;
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < CFG.PLAY_HALF - 0.6 || d > 69) continue;
      bushes.push(this._makeBush(x, z, lerp(1.2, 2.3, rng())));
    }
    this.border = trees.concat(rocks);
    this.borderTrees = trees;
    this.borderRocks = rocks;
    this.borderBushes = bushes;
  }

  _makeBush(x, z, scale) {
    const rng = this.rng;
    const y = this.terrain.heightAt(x, z) - 0.22 * scale;
    _e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(scale, scale * lerp(0.8, 1.1, rng()), scale));
    const v = lerp(0.75, 1.05, rng());
    return { x, z, y, matrix: m, color: new THREE.Color(v, v, v * 0.92) };
  }

  _placeUndergrowth() {
    const rng = this.rng, T = this.terrain, P = CFG.PLAY_HALF - 1;
    this.ferns = [];
    this.bushes = [];
    const blocked = (x, z, pad) => {
      for (const b of this.boulders) if (Math.hypot(b.x - x, b.z - z) < b.radius + pad) return true;
      for (const t of this.trees) if (Math.hypot(t.x - x, t.z - z) < t.radius + pad * 0.6) return true;
      return false;
    };
    let tries = 0;
    while (this.ferns.length < CFG.FERN_COUNT && tries++ < 40000) {
      let x, z;
      if (rng() < 0.62) {                                    // ferns gather in the shade of trunks
        const t = this.trees[Math.floor(rng() * this.trees.length)];
        const a = rng() * Math.PI * 2, r = t.radius + 0.5 + rng() * 3.2;
        x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
      } else { x = (rng() * 2 - 1) * (P + 4); z = (rng() * 2 - 1) * (P + 4); }
      if (Math.max(Math.abs(x), Math.abs(z)) > 64 || Math.hypot(x, z) < 15) continue;
      if (blocked(x, z, 0.5)) continue;
      const sc = lerp(0.7, 1.5, rng());
      T.normalAt(x, z, _n);
      _q.setFromUnitVectors(UP, _n);
      _q2.setFromAxisAngle(UP, rng() * Math.PI * 2);
      _q.multiply(_q2);
      const v = lerp(0.8, 1.1, rng());
      this.ferns.push({ x, z, matrix: new THREE.Matrix4().compose(_p.set(x, T.heightAt(x, z) - 0.02, z), _q, _s.setScalar(sc)), color: new THREE.Color(v, v, v * 0.9) });
    }
    tries = 0;
    while (this.bushes.length < CFG.BUSH_COUNT && tries++ < 20000) {
      const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
      if (Math.hypot(x, z) < CFG.CLEAR_RADIUS + 3 || blocked(x, z, 0.9)) continue;
      this.bushes.push(this._makeBush(x, z, lerp(0.8, 1.5, rng())));
    }
  }

  _instantiate() {
    const g = this.group;
    const all = this.trees.concat(this.borderTrees);
    for (const kind of TREE_KINDS) {
      const items = all.filter((t) => t.kind === kind.name);
      if (items.length) new InstanceSet(g, this.parts[kind.name], items);
    }
    const rocks = this.boulders.concat(this.borderRocks);
    for (const k of ['boulder_a', 'boulder_b', 'boulder_c']) {
      const items = rocks.filter((b) => b.kind === k);
      if (items.length) new InstanceSet(g, this.parts[k], items);
    }
    new InstanceSet(g, this.parts.log_a, this.logs);
    new InstanceSet(g, this.parts.fern_a, this.ferns, { castShadow: false });
    new InstanceSet(g, this.parts.bush_a, this.bushes.concat(this.borderBushes));
    // colliders
    for (const t of all) this.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: t.radius, ref: t });
    for (const b of rocks) this.colliders.push({ kind: 'circle', x: b.x, z: b.z, r: b.radius, ref: b });
    for (const l of this.logs) this.colliders.push({ kind: 'box', x: l.x, z: l.z, hx: l.half, hz: 0.3, ax: Math.cos(l.rot), az: -Math.sin(l.rot), ref: l });
  }

  // ------------------------------------------------------------------ grass
  _buildGrass() {
    const rng = makeRng(CFG.SEED + 99);
    // one tuft = a handful of bent, tapered blades
    const pos = [], nor = [], uv = [], idx = [];
    const blades = 9;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + rng() * 1.2;
      const lean = 0.1 + rng() * 0.34, hgt = 0.2 + rng() * 0.24, wid = 0.011 + rng() * 0.009;
      const rad = 0.03 + 0.13 * Math.sqrt(rng());
      const ox = Math.cos(a * 1.7 + b) * rad, oz = Math.sin(a * 1.7 + b) * rad;
      const dx = Math.cos(a), dz = Math.sin(a);              // lean direction
      const sx = -dz, sz = dx;                               // blade width direction
      const base = pos.length / 3;
      for (let r = 0; r < 3; r++) {
        const t = r / 2;
        const cx = ox + dx * lean * t * t * hgt * 1.5, cz = oz + dz * lean * t * t * hgt * 1.5, cy = hgt * t * (1 - 0.15 * t * lean);
        const w = wid * (1 - t * 0.7);
        if (r < 2) {
          pos.push(cx - sx * w, cy, cz - sz * w, cx + sx * w, cy, cz + sz * w);
          nor.push(dx * 0.2 - sx * 0.15, 1, dz * 0.2 - sz * 0.15, dx * 0.2 + sx * 0.15, 1, dz * 0.2 + sz * 0.15);
          uv.push(0, t, 1, t);
        } else {
          pos.push(cx, cy, cz); nor.push(dx * 0.2, 1, dz * 0.2); uv.push(0.5, 1);
        }
      }
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.normalizeNormals();

    this.grassUniforms = { uFade: { value: 40 }, uPlayer: { value: new THREE.Vector3() } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.uniforms.uWindDir = shared.uWindDir;
      sh.uniforms.uWindStrength = shared.uWindStrength;
      sh.uniforms.uFade = this.grassUniforms.uFade;
      sh.uniforms.uPlayer = this.grassUniforms.uPlayer;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform vec3 uWindDir; uniform float uWindStrength; uniform float uFade; uniform vec3 uPlayer;
          varying float vH;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = uv.y;
          vec3 gp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float gd = distance(gp, cameraPosition);
          transformed *= 1.0 - smoothstep(uFade * 0.7, uFade, gd);
          mat3 gi = mat3(instanceMatrix);
          float gph = dot(gp.xz, vec2(0.35, 0.27));
          float gust = sin(uTime * 1.3 + gph) * 0.6 + sin(uTime * 2.9 + gph * 2.3) * 0.3 + 0.25;
          vec3 woff = uWindDir * (gust * 0.11 * uWindStrength);
          vec2 pd = gp.xz - uPlayer.xz;
          float pl = length(pd);
          float push = (1.0 - smoothstep(0.35, 1.25, pl)) * step(abs(gp.y - uPlayer.y), 1.5);
          woff.xz += (pd / max(pl, 0.05)) * push * 0.42;
          woff.y -= push * 0.2;
          transformed += (woff * gi) * (vH * vH) / dot(gi[0], gi[0]);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(vec3(0.05, 0.095, 0.022), vec3(0.25, 0.37, 0.085), vH * 0.6 + vH * vH * 0.4);`)
        // blades are lit like the ground they grow from: never flip the (upward) normal on back faces
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'tbgrass';
    this.grassMaterial = mat;

    const T = this.terrain, S = this.splat;
    const cell = 15, ext = 66;
    this.grassChunks = [];
    const dummy = new THREE.Matrix4(), col = new THREE.Color();
    let total = 0;
    for (let cz = -ext; cz < ext; cz += cell) {
      for (let cx = -ext; cx < ext; cx += cell) {
        const mats = [], cols = [];
        const n = Math.round(cell * cell * 8.0 * OPTS.grassDensity);
        for (let i = 0; i < n; i++) {
          const x = cx + rng() * cell, z = cz + rng() * cell;
          const d = Math.max(Math.abs(x), Math.abs(z));
          if (d > 64.5) continue;
          const sp = S.sample(x, z);
          if (sp.ao < 0.8) continue;                           // nothing under trunks / boulders
          if (rng() < sp.forest * 0.86) continue;              // sparse on the forest floor
          if (d > 60 && rng() < (d - 60) / 4.5) continue;
          if (T.slopeAt(x, z, 0.5) > 0.65) continue;
          const inClear = Math.hypot(x, z) < CFG.CLEAR_RADIUS;
          const sc = lerp(0.75, 1.4, rng()) * (1 - 0.35 * sp.forest) * (inClear ? 0.85 : 1);
          _e.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
          dummy.compose(_p.set(x, T.heightAt(x, z) - 0.015, z), _q.setFromEuler(_e), _s.set(sc, sc * lerp(0.8, 1.25, rng()), sc));
          mats.push(dummy.clone());
          const v = lerp(0.72, 1.12, rng());
          col.setRGB(v * (1 + sp.bleach * 0.3 + rng() * 0.1), v * (1 + sp.bleach * 0.12), v * (0.85 - sp.bleach * 0.15));
          cols.push(col.clone());
        }
        if (!mats.length) continue;
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
        im.castShadow = false;
        im.receiveShadow = true;
        im.matrixAutoUpdate = false;
        im.computeBoundingSphere();
        im.userData.center = new THREE.Vector3(cx + cell / 2, T.heightAt(cx + cell / 2, cz + cell / 2), cz + cell / 2);
        this.group.add(im);
        this.grassChunks.push(im);
        total += mats.length;
      }
    }
    this.grassCount = total;
  }

  // ---------------------------------------------------------------- wildflowers
  _buildFlowers() {
    const rng = makeRng(CFG.SEED + 123);
    const pos = [], nor = [], uv = [], idx = [];
    // stem (two crossed slivers) + an upward-facing 6-petal head; uv.y tags stem (0) / petal (1) / centre (2)
    const H = 0.24;
    for (const [sx, sz] of [[1, 0], [0, 1]]) {
      const b = pos.length / 3, w = 0.006;
      pos.push(-sx * w, 0, -sz * w, sx * w, 0, sz * w, sx * w, H, sz * w, -sx * w, H, -sz * w);
      for (let i = 0; i < 4; i++) { nor.push(0, 1, 0); uv.push(0, 0); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const c = pos.length / 3;
    pos.push(0, H + 0.012, 0); nor.push(0, 1, 0); uv.push(0.5, 2);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      pos.push(Math.cos(a) * 0.042, H, Math.sin(a) * 0.042); nor.push(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3); uv.push(0.5, 1);
    }
    for (let i = 0; i < 6; i++) idx.push(c, c + 1 + (i + 1) % 6, c + 1 + i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.normalizeNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.uniforms.uWindDir = shared.uWindDir;
      sh.uniforms.uFade = this.grassUniforms.uFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uWindDir; uniform float uFade; varying float vPart;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vPart = uv.y;
          vec3 fp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          transformed *= 1.0 - smoothstep(uFade * 0.95, uFade * 1.35, distance(fp, cameraPosition));
          float fph = dot(fp.xz, vec2(0.35, 0.27));
          float sway = (sin(uTime * 1.3 + fph) * 0.6 + sin(uTime * 2.9 + fph * 2.3) * 0.3 + 0.25) * 0.1;
          transformed += (uWindDir * mat3(instanceMatrix)) * sway * min(uv.y, 1.0) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPart;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = vPart > 1.5 ? vec3(0.85, 0.55, 0.06) : (vPart > 0.5 ? diffuseColor.rgb : vec3(0.09, 0.17, 0.04));`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'tbflower';
    const palette = [[0.92, 0.9, 0.82], [0.92, 0.9, 0.82], [0.95, 0.7, 0.08], [0.55, 0.36, 0.86], [0.93, 0.5, 0.62]];
    const T = this.terrain, S = this.splat, cell = 30;
    const cells = new Map();
    const dummy = new THREE.Matrix4();
    let total = 0;
    for (let k = 0; k < 170; k++) {
      const cx = (rng() * 2 - 1) * 58, cz = (rng() * 2 - 1) * 58;
      if (S.sample(cx, cz).forest > 0.35) continue;
      const colr = palette[Math.floor(rng() * palette.length)];
      const n = 8 + Math.floor(rng() * 22), spread = 1.2 + rng() * 2.6;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, r = spread * Math.sqrt(rng());
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (Math.max(Math.abs(x), Math.abs(z)) > 59) continue;
        const sp = S.sample(x, z);
        if (sp.ao < 0.85 || sp.forest > 0.5) continue;
        const sc = lerp(0.8, 1.5, rng());
        _e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
        dummy.compose(_p.set(x, T.heightAt(x, z), z), _q.setFromEuler(_e), _s.set(sc, sc * lerp(0.9, 1.5, rng()), sc));
        const key = Math.floor((x + 90) / cell) + ':' + Math.floor((z + 90) / cell);
        if (!cells.has(key)) cells.set(key, []);
        const v = lerp(0.85, 1.1, rng());
        cells.get(key).push({ m: dummy.clone(), c: new THREE.Color(colr[0] * v, colr[1] * v, colr[2] * v) });
        total++;
      }
    }
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((f, i) => { im.setMatrixAt(i, f.m); im.setColorAt(i, f.c); });
      im.castShadow = false; im.receiveShadow = true; im.matrixAutoUpdate = false;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.flowerCount = total;
  }

  // ----------------------------------------------------------------- queries
  harvestables() { return this.trees.concat(this.boulders); }

  /** Apply one harvesting hit. Returns { depleted }. */
  hit(obj, fromX, fromZ) {
    obj.hits++;
    obj.hp--;
    obj.shake = 1;
    obj.shakeDirX = obj.x - fromX; obj.shakeDirZ = obj.z - fromZ;
    const l = Math.hypot(obj.shakeDirX, obj.shakeDirZ) || 1;
    obj.shakeDirX /= l; obj.shakeDirZ /= l;
    const depleted = obj.hp <= 0;
    if (depleted) { obj.alive = false; obj.dying = 0; this.splat.rebuildAO(this); }
    this.animating.add(obj);
    return { depleted };
  }

  update(dt, camera) {
    // harvest reactions: shake, shrink per hit, topple / crumble on the final hit
    for (const o of this.animating) {
      const shrink = 1 - 0.14 * Math.min(o.hits, 2);
      if (o.dying !== undefined) {
        o.dying += dt / (o.type === 'tree' ? 0.75 : 0.32);
        const t = Math.min(1, o.dying);
        if (o.type === 'tree') {
          const fall = t * t * 1.35;
          const k = shrink * (1 - smoothstep(0.55, 1, t));
          // rotate about the base, away from the robot
          _e.set(o.tiltX + fall * o.shakeDirZ * Math.cos(0) , 0, o.tiltZ - fall * o.shakeDirX, 'XZY');
          _q.setFromEuler(_e);
          _q2.setFromAxisAngle(UP, o.rot);
          _q.multiply(_q2);
          _m.compose(_p.set(o.x, o.y, o.z), _q, _s.setScalar(Math.max(o.scale * k, 1e-5)));
          InstanceSet.setMatrix(o, _m);
        } else {
          InstanceSet.setMatrix(o, this._boulderMatrix(o, Math.max(shrink * (1 - t), 1e-5)));
        }
        if (t >= 1) {
          _m.makeScale(0, 0, 0); _m.setPosition(o.x, o.y - 50, o.z);
          InstanceSet.setMatrix(o, _m);
          this.animating.delete(o);
        }
        continue;
      }
      o.shake = Math.max(0, o.shake - dt * 2.6);
      const w = Math.sin(o.shake * 28) * o.shake;
      if (o.type === 'tree') {
        InstanceSet.setMatrix(o, this._treeMatrix(o, shrink, w * 0.05 * o.shakeDirZ, -w * 0.05 * o.shakeDirX));
      } else {
        InstanceSet.setMatrix(o, this._boulderMatrix(o, shrink * (1 + w * 0.025), w * 0.035 * o.shakeDirX, w * 0.035 * o.shakeDirZ));
      }
      if (o.shake <= 0) this.animating.delete(o);
    }
    // grass chunk distance culling (blades themselves fade out in the vertex shader)
    const fade = this.grassUniforms.uFade.value;
    for (const c of this.grassChunks) {
      const dx = c.userData.center.x - camera.position.x, dz = c.userData.center.z - camera.position.z;
      c.visible = dx * dx + dz * dz < (fade + 11) * (fade + 11);
    }
  }
}

/** World-space splat map: R = forest-floor weight, G = baked contact AO, B = sun-bleached grass. */
export class SplatMap {
  constructor(terrain, size = 512) {
    this.terrain = terrain;
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
    this.forest = new Float32Array(size * size);
    this.texture = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.data.fill(255);
    this.texture.needsUpdate = true;
    this.extra = [];           // structures: { x, z, r, strength }
  }

  _stamp(arr, x, z, radius, strength) {
    const S = this.size, k = S / CFG.MAP_SIZE;
    const cx = (x + CFG.HALF) * k, cz = (z + CFG.HALF) * k, rr = radius * k;
    const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(S - 1, Math.ceil(cx + rr));
    const z0 = Math.max(0, Math.floor(cz - rr)), z1 = Math.min(S - 1, Math.ceil(cz + rr));
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / rr;
        if (d >= 1) continue;
        const f = 1 - d * d;
        arr[j * S + i] += strength * f * f;
      }
    }
  }

  build(world) {
    const S = this.size, T = this.terrain;
    const forest = this.forest;
    const bleach = new Float32Array(S * S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = (i + 0.5) / S * CFG.MAP_SIZE - CFG.HALF, z = (j + 0.5) / S * CFG.MAP_SIZE - CFG.HALF;
        const n = 0.5 + 0.5 * T.noise(x * 0.027 + 400, z * 0.027 - 400) + 0.2 * T.noiseB(x * 0.09, z * 0.09);
        forest[j * S + i] = smoothstep(0.48, 0.74, n) * 0.5;
        bleach[j * S + i] = smoothstep(0.5, 0.82, 0.5 + 0.5 * T.noiseB(x * 0.021 - 300, z * 0.021 + 300));
      }
    }
    for (const t of world.trees.concat(world.borderTrees)) this._stamp(forest, t.x, t.z, 2.4 + t.crown * 0.75, t.kind.startsWith('pine') ? 0.85 : 0.6);
    for (const l of world.logs) this._stamp(forest, l.x, l.z, 3.0, 0.5);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = (i + 0.5) / S * CFG.MAP_SIZE - CFG.HALF, z = (j + 0.5) / S * CFG.MAP_SIZE - CFG.HALF;
        const k = j * S + i;
        let f = forest[k] * smoothstep(13, 25, Math.hypot(x, z));       // the clearing stays a meadow
        const d = Math.max(Math.abs(x), Math.abs(z));
        f = Math.max(f, smoothstep(60.5, 64, d) * 0.7);
        forest[k] = clamp(f, 0, 1);
        this.data[k * 4] = forest[k] * 255;
        this.data[k * 4 + 2] = bleach[k] * (1 - forest[k]) * 255;
        this.data[k * 4 + 3] = 255;
      }
    }
    this.rebuildAO(world);
  }

  rebuildAO(world) {
    const S = this.size;
    const occ = new Float32Array(S * S);
    for (const t of world.trees.concat(world.borderTrees)) {
      if (!t.alive) continue;
      this._stamp(occ, t.x, t.z, t.radius * 2.4 + 0.7, 0.5);
      this._stamp(occ, t.x, t.z, t.crown * 0.9 + 1.0, 0.12);
    }
    for (const b of world.boulders.concat(world.borderRocks)) if (b.alive) this._stamp(occ, b.x, b.z, b.width * 0.8 + 0.25, 0.62);
    for (const l of world.logs) {
      const dx = Math.cos(l.rot), dz = -Math.sin(l.rot);
      for (let s = -1; s <= 1; s += 0.5) this._stamp(occ, l.x + dx * l.half * s, l.z + dz * l.half * s, 0.95, 0.3);
    }
    for (const e of this.extra) this._stamp(occ, e.x, e.z, e.r, e.strength);
    for (let k = 0; k < S * S; k++) this.data[k * 4 + 1] = (1 - Math.min(0.68, occ[k])) * 255;
    this.texture.needsUpdate = true;
  }

  sample(x, z) {
    const S = this.size;
    const i = clamp(Math.floor((x + CFG.HALF) / CFG.MAP_SIZE * S), 0, S - 1);
    const j = clamp(Math.floor((z + CFG.HALF) / CFG.MAP_SIZE * S), 0, S - 1);
    const k = (j * S + i) * 4;
    return { forest: this.data[k] / 255, ao: this.data[k + 1] / 255, bleach: this.data[k + 2] / 255 };
  }
}
