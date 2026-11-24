import * as THREE from 'three';
import { CFG, makeRng, lerp } from './config.js';
import { shared } from './assets.js';

const rnd = makeRng(4242);
const R = (a, b) => a + (b - a) * rnd();
const NOISE_GLSL = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(11.3, 7.1); a *= 0.5; } return s; }
`;

// ------------------------------------------------------------------ ambient pollen / dust motes
export function createPollen(scene) {
  const n = CFG.POLLEN_COUNT;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = R(0, 1); pos[i * 3 + 1] = R(0, 1); pos[i * 3 + 2] = R(0, 1);
    seed[i * 3] = R(0, 1); seed[i * 3 + 1] = R(0, 1); seed[i * 3 + 2] = R(0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSunDirView: shared.uSunDirView, uScale: { value: 600 }, uBox: { value: new THREE.Vector3(56, 15, 56) }, uGround: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aSeed;
      uniform float uTime; uniform float uScale; uniform vec3 uBox; uniform float uGround;
      varying float vAlpha; varying float vSun;
      uniform vec3 uSunDirView;
      void main() {
        vec3 drift = vec3(uTime * (0.28 + aSeed.x * 0.3), sin(uTime * (0.3 + aSeed.y * 0.5) + aSeed.z * 6.28) * 0.6 + uTime * 0.04, uTime * (0.16 + aSeed.z * 0.2));
        drift.xz += vec2(sin(uTime * 0.7 + aSeed.y * 20.0), cos(uTime * 0.6 + aSeed.x * 20.0)) * 0.5;
        // wrap a box of motes around the camera so the air is always alive
        vec3 p = position * uBox + drift;
        p = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;
        p.y = mod(position.y * uBox.y + drift.y, uBox.y) + uGround - 1.0;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.035, 0.085, aSeed.x);
        gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 14.0);
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed.z * 2.0) + aSeed.x * 40.0);
        vAlpha = tw * (1.0 - smoothstep(30.0, 60.0, -mv.z)) * smoothstep(0.6, 2.5, -mv.z);
        vSun = pow(max(dot(normalize(mv.xyz), uSunDirView), 0.0), 3.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha; varying float vSun;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        vec3 col = mix(vec3(1.0, 0.9, 0.62), vec3(1.4, 1.1, 0.7), vSun);
        gl_FragColor = vec4(col * a * a * vAlpha * (0.4 + 1.6 * vSun), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'Pollen';
  pts.renderOrder = 5;
  scene.add(pts);
  return pts;
}

// ------------------------------------------------------------------ textured point sprites (smoke, dust, sparks)
class SpriteSystem {
  constructor(scene, texture, max, additive) {
    this.max = max;
    this.p = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.uniforms = { tMap: { value: texture }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
        void main() {
          vec4 mv = viewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / -mv.z, 420.0);
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; varying vec4 vColor;
        void main() {
          vec4 t = texture2D(tMap, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb * t.rgb ${additive ? '* t.a * vColor.a, 1.0' : ', t.a * vColor.a'});
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 7 : 6;
    scene.add(this.points);
  }

  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: 0, max: o.life || 1, s0: o.s0 || 0.3, s1: o.s1 || 1,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, grav: o.grav || 0, drag: o.drag || 0, fadeIn: o.fadeIn ?? 0.15 });
  }

  update(dt) {
    const P = this.p;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.vy -= q.grav * dt;
      const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const t = q.life / q.max;
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      const fade = Math.min(1, t / q.fadeIn) * (1 - t) ** 1.3;
      this.col[n * 4] = q.r; this.col[n * 4 + 1] = q.g; this.col[n * 4 + 2] = q.b; this.col[n * 4 + 3] = q.a * fade;
      this.size[n] = lerp(q.s0, q.s1, t);
      P[n++] = q;
    }
    P.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ lit debris (wood chips, rock shards, leaves)
class Debris {
  constructor(scene, terrain, max = 260) {
    this.terrain = terrain;
    this.max = max;
    this.items = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  emit(o) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ ...o, life: 0, rx: R(0, 6), ry: R(0, 6), rz: R(0, 6), wx: R(-9, 9), wy: R(-9, 9), wz: R(-9, 9), rest: false });
  }

  update(dt) {
    const I = this.items;
    let n = 0;
    for (let i = 0; i < I.length; i++) {
      const d = I[i];
      d.life += dt;
      if (d.life >= d.max) continue;
      if (!d.rest) {
        d.vy -= d.grav * dt;
        if (d.drag) { const k = Math.max(0, 1 - d.drag * dt); d.vx *= k; d.vz *= k; d.vy = Math.max(d.vy * k, -1.6); d.vx += Math.sin(d.life * 7 + d.rx) * dt * 2; }
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const gy = this.terrain.heightAt(d.x, d.z) + d.sy * 0.5;
        if (d.y < gy) {
          d.y = gy;
          if (Math.abs(d.vy) > 1.6 && !d.drag) { d.vy = -d.vy * 0.3; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.4; d.wz *= 0.4; }
          else { d.rest = true; d.rx = 0; d.rz = 0; }
        }
      }
      const k = Math.min(1, (d.max - d.life) / 0.4);
      this._e.set(d.rx, d.ry, d.rz);
      this._m.compose(this._p.set(d.x, d.y, d.z), this._q.setFromEuler(this._e), this._s.set(d.sx * k, d.sy * k, d.sz * k));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c.setRGB(d.r, d.g, d.b));
      I[n++] = d;
    }
    I.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ flames
const FLAME_FRAG = /* glsl */`
uniform float uTime; uniform float uSeed; uniform float uPower;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv;
  float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.4 - uTime * 2.1));
  float n2 = fbm(vec2(uv.x * 6.5 - uSeed, uv.y * 4.6 - uTime * 3.4));
  float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.75 * uv.y;
  float w = mix(0.78, 0.04, pow(uv.y, 0.75));
  float shape = 1.0 - smoothstep(w * 0.2, w, abs(x));
  float fade = (1.0 - smoothstep(0.2, 1.0, uv.y + (n2 - 0.5) * 0.6)) * smoothstep(0.0, 0.07, uv.y);
  float I = shape * fade * (0.55 + 0.9 * n2);
  vec3 col = mix(vec3(1.0, 0.16, 0.01), vec3(1.0, 0.62, 0.12), smoothstep(0.15, 0.7, I));
  col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.7, 1.15, I));
  gl_FragColor = vec4(col * I * uPower, 1.0);
}`;

export function createFlame(width, height, power = 2.6) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, height, 1, 1);
  geo.translate(0, height / 2, 0);
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uSeed: { value: i * 3.7 + rnd() * 10 }, uPower: { value: power } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = (i / 3) * Math.PI;
    m.renderOrder = 8;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ floating world-space text
function makeLabelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 112;
  const x = c.getContext('2d');
  x.font = '800 68px "Segoe UI", system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 12; x.strokeStyle = 'rgba(18,12,6,0.92)';
  x.strokeText(text, 192, 58);
  x.fillStyle = color;
  x.fillText(text, 192, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class FX {
  constructor(scene, terrain, T, camera) {
    this.scene = scene;
    this.terrain = terrain;
    this.camera = camera;
    this.pollen = createPollen(scene);
    this.smoke = new SpriteSystem(scene, T.smoke, 420, false);
    this.sparks = new SpriteSystem(scene, T.dot, 320, true);
    this.debris = new Debris(scene, terrain);
    this.labels = [];
    this.labelTex = { wood: makeLabelTexture('+1 Wood', '#ffd98a'), stone: makeLabelTexture('+1 Stone', '#d7e6f2') };
    this.fires = [];
    // fixed light pool => the lit-material shader permutations never change (no hitch when building)
    this.shadowLight = new THREE.PointLight(0xff9a50, 0, 17, 2);
    this.shadowLight.castShadow = true;
    this.shadowLight.shadow.mapSize.set(512, 512);
    this.shadowLight.shadow.camera.near = 0.12;
    this.shadowLight.shadow.camera.far = 17;
    this.shadowLight.shadow.bias = -0.006;
    this.shadowLight.shadow.normalBias = 0.03;
    this.shadowLight.shadow.autoUpdate = false;
    this.shadowLight.position.set(0, -200, 0);
    scene.add(this.shadowLight);
    this.plainLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff9a50, 0, 30, 2);
      l.position.set(0, -200, 0);
      scene.add(l);
      this.plainLights.push(l);
    }
  }

  setViewport(h, fovDeg) {
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.smoke.uniforms.uScale.value = s;
    this.sparks.uniforms.uScale.value = s;
    this.pollen.material.uniforms.uScale.value = s;
  }

  floatText(kind, x, y, z) {
    const mat = new THREE.SpriteMaterial({ map: this.labelTex[kind], transparent: true, depthTest: false, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.renderOrder = 20;
    this.scene.add(s);
    this.labels.push({ s, t: 0, y0: y });
  }

  woodChips(x, y, z, dirX, dirZ, n = 12, leaves = 5, big = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirZ, dirX) + R(-1.2, 1.2), sp = R(1.5, big ? 6 : 4.2);
      const bark = rnd() < 0.3;
      const v = R(0.8, 1.15);
      this.debris.emit({ x, y: y + R(-0.2, 0.3), z, vx: Math.cos(a) * sp, vy: R(1.5, 5), vz: Math.sin(a) * sp, grav: 13, max: R(1.6, 2.6),
        sx: R(0.06, 0.16), sy: R(0.012, 0.03), sz: R(0.03, 0.07), r: (bark ? 0.2 : 0.62) * v, g: (bark ? 0.13 : 0.44) * v, b: (bark ? 0.08 : 0.24) * v });
    }
    for (let i = 0; i < leaves; i++) {
      const v = R(0.6, 1.1);
      this.debris.emit({ x: x + R(-1.2, 1.2), y: y + R(2.5, 6), z: z + R(-1.2, 1.2), vx: R(-0.8, 0.8), vy: R(-0.5, 0.5), vz: R(-0.8, 0.8), grav: 2.2, drag: 1.6, max: R(2.5, 4.2),
        sx: R(0.07, 0.12), sy: 0.005, sz: R(0.04, 0.07), r: 0.16 * v, g: 0.3 * v, b: 0.06 * v });
    }
    for (let i = 0; i < 3; i++) this.smoke.emit({ x, y: y + R(0, 0.3), z, vx: R(-0.6, 0.6), vy: R(0.2, 0.9), vz: R(-0.6, 0.6), life: R(0.6, 1.1), s0: 0.3, s1: 1.2, r: 0.78, g: 0.66, b: 0.5, a: 0.3, drag: 1.5 });
  }

  rockSparks(x, y, z, dirX, dirZ, n = 9, big = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirZ, dirX) + R(-1.3, 1.3), sp = R(1.2, big ? 5.5 : 3.6);
      const v = R(0.75, 1.1);
      this.debris.emit({ x, y: y + R(-0.15, 0.2), z, vx: Math.cos(a) * sp, vy: R(1.2, 4.5), vz: Math.sin(a) * sp, grav: 15, max: R(1.5, 2.6),
        sx: R(0.05, big ? 0.24 : 0.13), sy: R(0.04, big ? 0.16 : 0.09), sz: R(0.05, big ? 0.2 : 0.11), r: 0.34 * v, g: 0.33 * v, b: 0.31 * v });
    }
    for (let i = 0; i < (big ? 26 : 16); i++) {
      const a = R(0, 6.283), sp = R(1.5, 7);
      this.sparks.emit({ x, y, z, vx: Math.cos(a) * sp + dirX * 2, vy: R(0.5, 6), vz: Math.sin(a) * sp + dirZ * 2, life: R(0.18, 0.5), s0: R(0.05, 0.11), s1: 0.01,
        r: 3.2, g: R(1.4, 2.4), b: 0.5, a: 1, grav: 12, drag: 1.5, fadeIn: 0.01 });
    }
    for (let i = 0; i < (big ? 9 : 3); i++) this.smoke.emit({ x: x + R(-0.3, 0.3), y: y + R(-0.2, 0.3), z: z + R(-0.3, 0.3), vx: R(-0.8, 0.8), vy: R(0.3, 1.2), vz: R(-0.8, 0.8), life: R(0.7, 1.4), s0: 0.4, s1: big ? 2.6 : 1.4, r: 0.62, g: 0.6, b: 0.56, a: 0.36, drag: 1.4 });
  }

  dust(x, y, z, radius = 1, n = 10, a = 0.3) {
    for (let i = 0; i < n; i++) {
      const t = R(0, 6.283), r = radius * R(0.5, 1);
      this.smoke.emit({ x: x + Math.cos(t) * r, y: y + R(0.05, 0.3), z: z + Math.sin(t) * r, vx: Math.cos(t) * R(0.3, 1.6), vy: R(0.2, 0.9), vz: Math.sin(t) * R(0.3, 1.6),
        life: R(0.7, 1.5), s0: 0.35, s1: R(1.2, 2.2), r: 0.62, g: 0.53, b: 0.4, a, drag: 1.8 });
    }
  }

  addFire(kind, x, y, z) {
    const beacon = kind === 'beacon';
    const flame = beacon ? createFlame(1.1, 1.5, 3.0) : createFlame(0.85, 1.25, 2.6);
    flame.position.set(x, y, z);
    this.scene.add(flame);
    const f = { kind, x, y, z, flame, seed: rnd() * 100, smokeT: 0, sparkT: 0, light: null };
    this.fires.push(f);
    return f;
  }

  update(dt, time, playerPos) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.debris.update(dt);
    this.pollen.material.uniforms.uGround.value = this.terrain.heightAt(this.camera.position.x, this.camera.position.z) * 0.5;
    // labels
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const L = this.labels[i];
      L.t += dt / 1.25;
      const t = L.t;
      const d = this.camera.position.distanceTo(L.s.position);
      const sc = d * 0.085 * (t < 0.12 ? 0.6 + 3.4 * t : 1.0);
      L.s.scale.set(sc * 3.43, sc, 1);
      L.s.position.y = L.y0 + 1.5 * (1 - (1 - t) * (1 - t));
      L.s.material.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      if (t >= 1) { this.scene.remove(L.s); L.s.material.dispose(); this.labels.splice(i, 1); }
    }
    // fires: flicker, smoke, embers, and hand the pooled lights to the fires nearest the player
    const fires = this.fires;
    for (const f of fires) {
      f.d = Math.hypot(f.x - playerPos.x, f.z - playerPos.z);
      f.light = null;
      const fl = 0.8 + 0.2 * Math.sin(time * 11 + f.seed) * Math.sin(time * 7.3 + f.seed * 2) + 0.12 * Math.sin(time * 23 + f.seed);
      f.flicker = fl;
      f.flame.scale.set(1 + 0.08 * Math.sin(time * 9 + f.seed), 0.92 + 0.16 * fl, 1 + 0.08 * Math.cos(time * 8 + f.seed));
      f.smokeT -= dt;
      if (f.smokeT <= 0) {
        f.smokeT = f.kind === 'beacon' ? 0.16 : 0.11;
        const g = R(0.3, 0.5);
        this.smoke.emit({ x: f.x + R(-0.12, 0.12), y: f.y + R(0.7, 1.0), z: f.z + R(-0.12, 0.12), vx: R(-0.15, 0.15) + shared.uWindDir.value.x * 0.5, vy: R(0.9, 1.5),
          vz: R(-0.15, 0.15) + shared.uWindDir.value.z * 0.5, life: R(2.8, 4.4), s0: 0.35, s1: R(2.0, 3.2), r: g, g: g * 0.97, b: g * 0.93, a: 0.34, drag: 0.12, fadeIn: 0.2 });
      }
      f.sparkT -= dt;
      if (f.sparkT <= 0) {
        f.sparkT = R(0.05, 0.28);
        this.sparks.emit({ x: f.x + R(-0.2, 0.2), y: f.y + R(0.2, 0.6), z: f.z + R(-0.2, 0.2), vx: R(-0.5, 0.5), vy: R(1.2, 3.0), vz: R(-0.5, 0.5), life: R(0.6, 1.5),
          s0: R(0.04, 0.08), s1: 0.01, r: 3.0, g: 1.2, b: 0.25, a: 1, grav: -0.6, drag: 0.6, fadeIn: 0.02 });
      }
    }
    const sorted = fires.slice().sort((a, b) => a.d - b.d);
    const camp = sorted.find((f) => f.kind === 'campfire');
    const sl = this.shadowLight;
    if (camp) {
      camp.light = sl;
      sl.position.set(camp.x + Math.sin(time * 13 + camp.seed) * 0.035, camp.y + 0.62 + Math.sin(time * 17) * 0.03, camp.z + Math.cos(time * 11 + camp.seed) * 0.035);
      sl.intensity = 20 * camp.flicker;
      sl.shadow.autoUpdate = true;
    } else if (sl.intensity !== 0) {
      sl.intensity = 0; sl.position.set(0, -200, 0); sl.shadow.autoUpdate = false;
    }
    let k = 0;
    for (const f of sorted) {
      if (f.light || k >= this.plainLights.length) continue;
      const l = this.plainLights[k++];
      f.light = l;
      l.position.set(f.x, f.y + (f.kind === 'beacon' ? 0.45 : 0.6), f.z);
      l.intensity = (f.kind === 'beacon' ? 120 : 18) * f.flicker;
      l.distance = f.kind === 'beacon' ? 36 : 16;
    }
    for (; k < this.plainLights.length; k++) { this.plainLights[k].intensity = 0; this.plainLights[k].position.set(0, -200, 0); }
  }
}
