import * as THREE from 'three';
import { CFG, makeRng, clamp, smoothstep } from './config.js';

// ---------------------------------------------------------------- simplex noise (seeded)
function makeSimplex(seed) {
  const rng = makeRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const g = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function noise(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) { const q = g[perm[ii + perm[jj]] & 7]; a *= a; n += a * a * (q[0] * x0 + q[1] * y0); }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) { const q = g[perm[ii + i1 + perm[jj + j1]] & 7]; a *= a; n += a * a * (q[0] * x1 + q[1] * y1); }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) { const q = g[perm[ii + 1 + perm[jj + 1]] & 7]; a *= a; n += a * a * (q[0] * x2 + q[1] * y2); }
    return 70 * n; // ~[-1, 1]
  };
}

/**
 * Heightfield terrain, exactly 150 x 150 m.
 *  - playable area (|x|,|z| <= 60): smooth hills normalised to exactly [0, 8] m
 *  - spawn clearing (r < 20): gentle basin, elevation < 1.5 m
 *  - border band (60..75): steep rocky ridge that keeps rising to the map edge
 * heightAt() interpolates the very same triangles the mesh renders, so anything
 * placed with it sits exactly flush.
 */
export class Terrain {
  constructor() {
    this.noise = makeSimplex(CFG.SEED);
    this.noiseB = makeSimplex(CFG.SEED + 77);
    const step = CFG.TERRAIN_STEP;
    this.step = step;
    this.n = Math.round(CFG.MAP_SIZE / step);      // cells per side (300)
    this.n1 = this.n + 1;
    this.h = new Float32Array(this.n1 * this.n1);
    this._normalise();
    for (let iz = 0; iz < this.n1; iz++) {
      for (let ix = 0; ix < this.n1; ix++) {
        this.h[iz * this.n1 + ix] = this._analytic(-CFG.HALF + ix * step, -CFG.HALF + iz * step);
      }
    }
    this.patches = [];
  }

  _raw(x, z) {
    const n = this.noise, m = this.noiseB;
    return 0.56 * n(x * 0.0105, z * 0.0105) + 0.27 * m(x * 0.023 + 31.7, z * 0.023 - 17.3)
      + 0.12 * n(x * 0.052 - 9.1, z * 0.052 + 4.4) + 0.05 * m(x * 0.11, z * 0.11);
  }

  _normalise() {
    let mn = Infinity, mx = -Infinity;
    const P = CFG.PLAY_HALF;
    for (let z = -P; z <= P; z += 1) {
      for (let x = -P; x <= P; x += 1) {
        if (x * x + z * z < 38 * 38) continue;      // outside the clearing blend zone
        const r = this._raw(x, z);
        if (r < mn) mn = r;
        if (r > mx) mx = r;
      }
    }
    this.rawMin = mn; this.rawMax = mx;
  }

  _analytic(x, z) {
    const n01 = clamp((this._raw(x, z) - this.rawMin) / (this.rawMax - this.rawMin), 0, 1);
    let h = CFG.ELEV_MIN + (CFG.ELEV_MAX - CFG.ELEV_MIN) * n01;
    // gentle spawn clearing
    const r = Math.hypot(x, z);
    const clearH = 0.45 + 0.4 * (0.5 + 0.5 * this.noiseB(x * 0.05 + 3.3, z * 0.05 - 8.8));
    h = clearH + (h - clearH) * smoothstep(CFG.CLEAR_RADIUS + 1, 38, r);
    // boundary ridge: square distance metric, starts exactly at the playable limit
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d > CFG.PLAY_HALF) {
      const t = d - CFG.PLAY_HALF;
      const big = 0.5 + 0.5 * this.noise(x * 0.03 + 50, z * 0.03 - 50);
      const crag = 1 - Math.abs(this.noiseB(x * 0.09, z * 0.09));
      const fine = this.noise(x * 0.31, z * 0.31);
      const rise = smoothstep(0, 8.5, t);
      h += rise * (8.0 + 3.5 * big) + smoothstep(1, 5, t) * (crag * 2.6 + fine * 0.5) + Math.max(0, t - 7) * (0.5 + 0.3 * big);
    }
    return h;
  }

  /** Height of the rendered surface at (x, z) (triangle-exact). */
  heightAt(x, z) {
    const s = this.step, n = this.n, n1 = this.n1;
    let gx = (x + CFG.HALF) / s, gz = (z + CFG.HALF) / s;
    gx = clamp(gx, 0, n - 1e-4); gz = clamp(gz, 0, n - 1e-4);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i = iz * n1 + ix;
    const ha = this.h[i], hd = this.h[i + 1], hb = this.h[i + n1], hc = this.h[i + n1 + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3(), e = 0.75) {
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }

  /** Rise over run of the steepest direction. */
  slopeAt(x, z, e = 0.75) {
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  /** March a ray against the heightfield. Returns the exact surface point or null. */
  raycast(origin, dir, maxDist = 400, out = new THREE.Vector3()) {
    const H = CFG.HALF;
    let t = 0, prevT = 0;
    let prevAbove = true;
    const p = out;
    const stepLen = 0.5;
    for (let i = 0; i < maxDist / stepLen; i++) {
      t = i * stepLen;
      p.copy(dir).multiplyScalar(t).add(origin);
      const inside = Math.abs(p.x) <= H && Math.abs(p.z) <= H;
      const above = !inside || p.y > this.heightAt(p.x, p.z);
      if (!above && prevAbove && i > 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          p.copy(dir).multiplyScalar(m).add(origin);
          if (p.y > this.heightAt(p.x, p.z)) a = m; else b = m;
        }
        p.copy(dir).multiplyScalar((a + b) / 2).add(origin);
        p.y = this.heightAt(p.x, p.z);
        return p;
      }
      if (!above && i === 0) return null;
      prevAbove = above; prevT = t;
    }
    return null;
  }

  /** Build the render mesh as a grid of patches (per-patch culling for main + point-light shadow passes). */
  buildMeshes(material, patchCells = 50) {
    const group = new THREE.Group();
    group.name = 'Terrain';
    const s = this.step, n1 = this.n1, H = CFG.HALF;
    const nrm = new THREE.Vector3();
    for (let pz = 0; pz < this.n; pz += patchCells) {
      for (let px = 0; px < this.n; px += patchCells) {
        const w = patchCells + 1;
        const pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3);
        for (let j = 0; j < w; j++) {
          for (let i = 0; i < w; i++) {
            const gx = px + i, gz = pz + j, k = (j * w + i) * 3;
            const x = -H + gx * s, z = -H + gz * s;
            pos[k] = x; pos[k + 1] = this.h[gz * n1 + gx]; pos[k + 2] = z;
            const hl = this.h[gz * n1 + Math.max(gx - 1, 0)], hr = this.h[gz * n1 + Math.min(gx + 1, this.n)];
            const hd = this.h[Math.max(gz - 1, 0) * n1 + gx], hu = this.h[Math.min(gz + 1, this.n) * n1 + gx];
            nrm.set(hl - hr, 2 * s, hd - hu).normalize();
            nor[k] = nrm.x; nor[k + 1] = nrm.y; nor[k + 2] = nrm.z;
          }
        }
        const idx = new Uint32Array(patchCells * patchCells * 6);
        let q = 0;
        for (let j = 0; j < patchCells; j++) {
          for (let i = 0; i < patchCells; i++) {
            const a = j * w + i, b = (j + 1) * w + i, c = (j + 1) * w + i + 1, d = j * w + i + 1;
            idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = c; idx[q++] = d;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        this.patches.push(mesh);
      }
    }
    this.group = group;
    return group;
  }

  /** Measured facts used by the QA overlay. */
  measure() {
    const P = CFG.PLAY_HALF, s = this.step;
    let mn = Infinity, mx = -Infinity, clearMax = -Infinity, ridgeMin = Infinity;
    for (let z = -CFG.HALF; z <= CFG.HALF; z += s) {
      for (let x = -CFG.HALF; x <= CFG.HALF; x += s) {
        const h = this.heightAt(x, z);
        const d = Math.max(Math.abs(x), Math.abs(z));
        if (d <= P) { if (h < mn) mn = h; if (h > mx) mx = h; }
        if (x * x + z * z <= CFG.CLEAR_RADIUS * CFG.CLEAR_RADIUS && h > clearMax) clearMax = h;
        if (d >= 70 && h < ridgeMin) ridgeMin = h;
      }
    }
    const box = new THREE.Box3();
    for (const p of this.patches) box.union(p.geometry.boundingBox);
    return { playMin: mn, playMax: mx, clearMax, ridgeMin, sizeX: box.max.x - box.min.x, sizeZ: box.max.z - box.min.z, box };
  }
}
