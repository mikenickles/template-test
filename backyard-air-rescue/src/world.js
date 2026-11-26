import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge, rnd, rr, pick, clamp, lerp, smoothstep, canvasTex, blobShadow } from './util.js';

// ---------------------------------------------------------------- layout
export const L = {
  tree: { x: -24, z: -26, r: 3.4 },
  swing: { x: -17.5, z: -20.5 },
  pad: { x: 2, z: 3, r: 3.4, y: 0.3 },
  shed: { x: 9.5, z: -8.5, w: 6.4, d: 5, h: 4.0 },
  home: { x: 10.8, z: 1.6 },
  tower: { x: 20, z: -18, s: 5, platY: 5.5 },
  pond: { x: 15, z: 14, rx: 8.5, rz: 5.8 },
  bed: { x: -17, z: 11, r: 6 },
  sandbox: { x: -8, z: -8, s: 6 },
  bounds: { x0: -30, x1: 69, z0: -27, z1: 24 },
  east: 74.4,                                   // east fence (the yard grew a garden)
  bucket: { x: 1.2, z: -5.6 },
  pots: [{ x: 14.8, z: -4.4 }, { x: -13.5, z: 1.5 }],
  planter: { x: 52, z: -16, w: 14, d: 4.2 },
  patch: { x: 56, z: 8, r: 5 },
  pool: { x: 41, z: 17, r: 3.6, y: 0.8 },
  apple: { x: 64, z: -23 },
  hammock: { x: 42, z: 3, half: 3.6, pivotY: 4.2, drop: 2.75 },
  blanket: { w: 8.0, d: 5.0 },
  line: { x: 43, z: -26, half: 5.2 },
  sunDir: new THREE.Vector3(-0.5, 0.66, -0.45).normalize(),
  baseAlt: 6,
};

// Things the helicopter gently floats over (never crashes into).
const OBSTACLES = [
  { x: L.tower.x, z: L.tower.z, r: 4.2, top: 8.9 },
  { x: L.tower.x, z: -12.6, r: 2.2, top: 4.4 },
  { x: L.shed.x, z: L.shed.z, r: 4.4, top: 8.0 },
  { x: L.apple.x, z: L.apple.z, r: 3.6, top: 11.2 },
];
// Things it slides around.
export const PUSHERS = [
  { x: L.tree.x, z: L.tree.z, r: 5.2 },
  { x: L.swing.x, z: L.swing.z, r: 1.7 },
];

export function cruiseAlt(x, z, hang) {
  let h = L.baseAlt;
  for (const o of OBSTACLES) {
    const d = Math.hypot(x - o.x, z - o.z);
    const w = 1 - smoothstep(o.r, o.r + 5.5, d);
    if (w > 0) h = Math.max(h, lerp(L.baseAlt, Math.max(L.baseAlt, o.top + 1.2 + hang), w));
  }
  return h;
}
export function inPond(x, z, grow = 0) {
  const dx = (x - L.pond.x) / (L.pond.rx + grow), dz = (z - L.pond.z) / (L.pond.rz + grow);
  return dx * dx + dz * dz < 1;
}
/** Height a toy rests at if set down here, or null if it can't be set down. */
export function restHeight(x, z) {
  const t = L.tower, s = L.shed;
  if (Math.abs(x - t.x) < 3.6 && z > t.z - 3.6 && z < -5.2) return null;
  if (Math.abs(x - s.x) < s.w / 2 + 1 && Math.abs(z - s.z) < s.d / 2 + 1.2) return null;
  if (Math.hypot(x - L.tree.x, z - L.tree.z) < 4.6) return null;
  if (Math.hypot(x - L.apple.x, z - L.apple.z) < 1.6) return null;
  if (Math.abs(x - L.hammock.x) < L.hammock.half + 0.5 && Math.abs(z - L.hammock.z) < 1.4) return null;
  if (Math.abs(x - L.home.x) < L.blanket.w / 2 && Math.abs(z - L.home.z) < L.blanket.d / 2) return 0.1;
  for (const p of L.pots) if (Math.hypot(x - p.x, z - p.z) < 1.5) return null;
  if (Math.abs(x - L.planter.x) < L.planter.w / 2 + 0.3 && Math.abs(z - L.planter.z) < L.planter.d / 2 + 0.3) return 0.95;
  if (Math.hypot(x - L.pool.x, z - L.pool.z) < L.pool.r + 0.8) return Math.hypot(x - L.pool.x, z - L.pool.z) < L.pool.r - 0.8 ? 0.5 : null;
  if (Math.hypot(x - L.pad.x, z - L.pad.z) < L.pad.r) return L.pad.y;
  if (inPond(x, z, -0.3)) return 0.02;
  if (Math.abs(x - L.sandbox.x) < 3 && Math.abs(z - L.sandbox.z) < 3) return 0.38;
  if (Math.hypot(x - L.bed.x, z - L.bed.z) < L.bed.r - 0.5) return 0.3;
  return 0;
}

function noGrass(x, z) {
  if (inPond(x, z, 0.9)) return true;
  if (Math.hypot(x - L.pad.x, z - L.pad.z) < L.pad.r + 0.5) return true;
  if (Math.hypot(x - L.bed.x, z - L.bed.z) < L.bed.r + 0.2) return true;
  if (Math.abs(x - L.shed.x) < L.shed.w / 2 + 0.3 && Math.abs(z - L.shed.z) < L.shed.d / 2 + 0.3) return true;
  if (Math.abs(x - L.sandbox.x) < 3.4 && Math.abs(z - L.sandbox.z) < 3.4) return true;
  if (Math.abs(x - L.tower.x) < 3 && Math.abs(z - L.tower.z) < 3) return true;
  if (Math.abs(x - L.tower.x) < 1.6 && z > -9 && z < -4.6) return true;
  if (Math.hypot(x - L.tree.x, z - L.tree.z) < 4.2) return true;
  if (Math.abs(x - L.home.x) < L.blanket.w / 2 + 0.2 && Math.abs(z - L.home.z) < L.blanket.d / 2 + 0.2) return true;
  for (const sx of [-1, 1]) if (Math.hypot(x - L.hammock.x - sx * L.hammock.half, z - L.hammock.z) < 0.5) return true;
  for (const [sx, sz] of [[8.0, -4.9], [6.9, -3.2], [6.2, -1.4], [5.9, 0.4]]) if (Math.hypot(x - sx, z - sz) < 1.0) return true;
  if (Math.abs(x - L.planter.x) < L.planter.w / 2 + 0.5 && Math.abs(z - L.planter.z) < L.planter.d / 2 + 0.5) return true;
  if (Math.hypot(x - L.patch.x, z - L.patch.z) < L.patch.r) return true;
  if (Math.hypot(x - L.pool.x, z - L.pool.z) < L.pool.r + 0.9) return true;
  if (Math.hypot(x - L.apple.x, z - L.apple.z) < 1.1) return true;
  for (const p of L.pots) if (Math.hypot(x - p.x, z - p.z) < 1.2) return true;
  if (x < -34.2 || x > L.east - 1.2 || z < -32.2) return true;
  return false;
}

// Palette
const C = {
  wood: 0xc98d55, woodDark: 0x9a6638, cream: 0xfff0d2, red: 0xe23b2e, cherry: 0xd9202b,
  yellow: 0xffd65c, teal: 0x2fb7b0, blue: 0x3d8fe0, stone: 0xb9b3a6, stoneD: 0x9a9589,
  leaf: 0x4fa23a, leafD: 0x3a8433, leafL: 0x7cc447, soil: 0x6b4630, sand: 0xf0d79a,
};

// ---------------------------------------------------------------- sky + light
function buildSky(scene, renderer) {
  const top = new THREE.Color(0x6fb6ee), mid = new THREE.Color(0xffe2b8), low = new THREE.Color(0xffc98f);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: top }, mid: { value: mid }, low: { value: low }, sun: { value: L.sunDir }, glow: { value: new THREE.Color(0xffd18c) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; uniform vec3 glow; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(mid, top, smoothstep(0.0, 0.55, h)); c = mix(low, c, smoothstep(-0.25, 0.08, h));
        float s = max(dot(d, sun), 0.0); c += glow * (pow(s, 6.0)*0.25 + pow(s, 24.0)*0.9 + pow(s, 400.0)*6.0);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
  scene.add(sky);
  // Soft image-based light from the same sky so paint gets a gentle sheen.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat));
  const groundDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: 0x5a8f3a }));
  groundDisc.rotation.x = -Math.PI / 2; groundDisc.position.y = -4; envScene.add(groundDisc);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.04).texture;
  pm.dispose();

  scene.fog = new THREE.Fog(0xf7dcae, 55, 170);
  const hemi = new THREE.HemisphereLight(0xa9ccff, 0x7c9a48, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd296, 3.9);
  sun.position.copy(L.sunDir).multiplyScalar(110).add(new THREE.Vector3(18, 0, -4));
  sun.target.position.set(18, 0, -4);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -74; sc.right = 74; sc.top = 66; sc.bottom = -52; sc.near = 10; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  // ---- time of day: warm morning, afternoon, evening (blended continuously, 0..2)
  const C = (h) => new THREE.Color(h), V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const P = [
    { top: C(0x8fcaf4), mid: C(0xffedd2), low: C(0xffd6ae), glow: C(0xffe0a8), dir: V(0.74, 0.4, 0.32), sun: C(0xffdca6), sunI: 3.7,
      hemiSky: C(0xd6e8ff), hemiGround: C(0x93b354), hemiI: 1.32, fog: C(0xfdecd6), near: 32, far: 165, exp: 1.06, tree: 0.5, beam: 1, mist: 1 },
    { top: C(0x6fb6ee), mid: C(0xffe2b8), low: C(0xffc98f), glow: C(0xffd18c), dir: V(-0.5, 0.66, -0.45), sun: C(0xffd296), sunI: 3.9,
      hemiSky: C(0xa9ccff), hemiGround: C(0x7c9a48), hemiI: 1.15, fog: C(0xf7dcae), near: 55, far: 170, exp: 1.02, tree: 1, beam: 0.12, mist: 0 },
    { top: C(0x5a63b8), mid: C(0xffa98a), low: C(0xff8d6a), glow: C(0xff9a5a), dir: V(-0.8, 0.34, 0.14), sun: C(0xffac72), sunI: 2.5,
      hemiSky: C(0xdcd6ff), hemiGround: C(0x86a05c), hemiI: 1.22, fog: C(0xe6a088), near: 42, far: 160, exp: 1.0, tree: 0.25, beam: 0.4, mist: 0.3 },
  ];
  const cur = { tree: 1, beam: 0, mist: 0, tint: new THREE.Color() };
  const target = new THREE.Vector3(18, 0, -4);
  function setTime(tod) {
    const i = Math.min(1, Math.floor(clamp(tod, 0, 2))), k = smoothstep(0, 1, clamp(tod - i, 0, 1)), a = P[i], b = P[i + 1];
    top.copy(a.top).lerp(b.top, k); mid.copy(a.mid).lerp(b.mid, k); low.copy(a.low).lerp(b.low, k);
    skyMat.uniforms.glow.value.copy(a.glow).lerp(b.glow, k);
    L.sunDir.copy(a.dir).lerp(b.dir, k).normalize();
    sun.position.copy(L.sunDir).multiplyScalar(110).add(target);
    sun.color.copy(a.sun).lerp(b.sun, k); sun.intensity = lerp(a.sunI, b.sunI, k);
    hemi.color.copy(a.hemiSky).lerp(b.hemiSky, k); hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, k); hemi.intensity = lerp(a.hemiI, b.hemiI, k);
    scene.fog.color.copy(a.fog).lerp(b.fog, k); scene.fog.near = lerp(a.near, b.near, k); scene.fog.far = lerp(a.far, b.far, k);
    renderer.toneMappingExposure = lerp(a.exp, b.exp, k);
    cur.tree = lerp(a.tree, b.tree, k); cur.beam = lerp(a.beam, b.beam, k); cur.mist = lerp(a.mist, b.mist, k);
    cur.tint.copy(sun.color);
  }
  return { sun, hemi, setTime, cur };
}

// ---------------------------------------------------------------- ground
function buildGround(scene) {
  const S = 160, W = 2048, k = W / S;
  const tex = canvasTex(W, W, (g) => {
    const px = (x) => (x + S / 2) * k, pz = (z) => (z + S / 2) * k;
    g.fillStyle = '#6fb23c'; g.fillRect(0, 0, W, W);
    // mowing stripes
    g.save(); g.translate(W / 2, W / 2); g.rotate(-0.42);
    for (let i = -30; i < 30; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,170,0.10)' : 'rgba(20,90,30,0.10)'; g.fillRect(i * 5.2 * k, -W, 5.2 * k, W * 2); }
    g.restore();
    // painterly blotches
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * W, y = rnd() * W, r = rr(12, 70);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = pick(['120,200,70', '60,140,45', '160,210,80', '75,160,60', '200,215,100']);
      gr.addColorStop(0, `rgba(${c},${rr(0.05, 0.16)})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const patch = (x, z, rx, rz, col, soft = 0.35) => {
      g.save(); g.translate(px(x), pz(z)); g.scale(rx * k, rz * k);
      const gr = g.createRadialGradient(0, 0, 1 - soft, 0, 0, 1);
      gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    };
    patch(L.pond.x, L.pond.z, L.pond.rx + 2.2, L.pond.rz + 2.2, 'rgba(226,200,140,1)', 0.25);
    patch(L.bed.x, L.bed.z, L.bed.r + 1, L.bed.r + 1, 'rgba(96,62,40,1)', 0.12);
    patch(L.tower.x, L.tower.z, 5, 5, 'rgba(205,170,115,0.95)');
    patch(L.tower.x, -6.2, 2.6, 2.6, 'rgba(205,170,115,0.95)');
    patch(L.tree.x, L.tree.z, 7.5, 7.5, 'rgba(120,96,60,0.9)', 0.5);
    patch(L.pad.x, L.pad.z, L.pad.r + 1.6, L.pad.r + 1.6, 'rgba(150,190,90,0.9)');
    patch(L.shed.x, L.shed.z + 1, 5.2, 4.6, 'rgba(190,165,115,0.9)');
    patch(L.swing.x, L.swing.z, 2.4, 2.4, 'rgba(170,140,95,0.85)', 0.5);
    patch(L.sandbox.x, L.sandbox.z, 4.6, 4.6, 'rgba(215,190,130,0.8)');
    patch(L.planter.x, L.planter.z, L.planter.w / 2 + 2.5, L.planter.d / 2 + 2.5, 'rgba(190,165,115,0.85)', 0.5);
    patch(L.patch.x, L.patch.z, L.patch.r + 1.2, L.patch.r + 1.2, 'rgba(96,62,40,1)', 0.15);
    patch(L.pool.x, L.pool.z, L.pool.r + 2.4, L.pool.r + 2.4, 'rgba(150,200,110,0.9)');
    patch(L.apple.x, L.apple.z, 4, 4, 'rgba(120,96,60,0.7)', 0.6);
    // worn garden path from the rescue shed out to the east garden
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [lw, col] of [[4.4, 'rgba(214,190,140,0.55)'], [3.0, 'rgba(226,204,156,0.9)']]) {
      g.strokeStyle = col; g.lineWidth = lw * k; g.beginPath(); g.moveTo(px(14), pz(-1.5));
      g.bezierCurveTo(px(24), pz(4), px(30), pz(-9), px(40), pz(-5)); g.bezierCurveTo(px(48), pz(-2), px(50), pz(-9), px(57), pz(-9)); g.stroke();
    }
  }, { aniso: 8 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, envMapIntensity: 0.15 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6fb23c, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.05; scene.add(far);
}

// ---------------------------------------------------------------- grass
function buildGrass(scene, uniforms, count) {
  // One tuft = three tapered blades fanned out.
  const pos = [], nor = [], idx = [];
  for (let b = 0; b < 3; b++) {
    const a = b * 2.1 + 0.3, ca = Math.cos(a), sa = Math.sin(a), lean = 0.2, w = 0.1, o = pos.length / 3;
    const pts = [[-w, 0, 0], [w, 0, 0], [-w * 0.75, 0.5, lean * 0.45], [w * 0.75, 0.5, lean * 0.45], [0, 1, lean]];
    for (const p of pts) { pos.push(p[0] * ca + (p[2] + 0.08) * sa, p[1], -p[0] * sa + (p[2] + 0.08) * ca); nor.push(0, 1, 0); }
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uHeli = uniforms.uHeli; sh.uniforms.uWash = uniforms.uWash;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uHeli; uniform float uWash;\n' + sh.vertexShader
      .replace('#include <color_vertex>', '#include <color_vertex>\n vColor *= mix(0.8, 1.14, position.y);')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec3 ip = instanceMatrix[3].xyz;
        float h2 = position.y * position.y;
        float w = sin(uTime*1.6 + ip.x*0.33 + ip.z*0.27)*0.6 + sin(uTime*2.7 + ip.x*0.9 - ip.z*0.6)*0.25;
        mvPosition.x += w * 0.15 * h2; mvPosition.z += w * 0.08 * h2;
        vec2 d = ip.xz - uHeli.xz; float dist = length(d) + 0.001;
        float ring = smoothstep(8.5, 1.5, dist) * uWash;
        float fl = 0.72 + 0.28 * sin(uTime*21.0 + ip.x*3.1 + ip.z*2.3);
        mvPosition.xz += d / dist * ring * fl * 0.85 * h2;
        mvPosition.y -= ring * 0.42 * h2 * fl;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    // blades are lit like the lawn they stand on, whichever way they face
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const cA = new THREE.Color(0x62b136), cB = new THREE.Color(0x9fd94e), cC = new THREE.Color(0xc2d95a);
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 4) {
    const x = rr(-34.5, L.east - 1), z = rr(-32.5, 40);
    if (noGrass(x, z)) continue;
    const patchy = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.23) * 2) * Math.cos(z * 0.27);
    const s = rr(0.8, 1.3), h = rr(0.34, 0.66) * (0.8 + patchy * 0.35);
    q.setFromAxisAngle(up, rnd() * 6.283);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, h, s));
    mesh.setMatrixAt(n, m4);
    col.copy(cA).lerp(cB, clamp(patchy + rr(-0.25, 0.25), 0, 1));
    if (rnd() < 0.12) col.lerp(cC, 0.6);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;
  scene.add(mesh);
}

// ---------------------------------------------------------------- flowers
const flowers = [];
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _white = new THREE.Color(0xffffff);
const stemMat = () => M(0x4d9c3c, { r: 0.7 });
function makeFlower(type, color, height) {
  const root = new THREE.Group(), bend = new THREE.Group();
  root.add(bend);
  const lean = rr(-0.12, 0.12);
  const sg = [tg(new THREE.CylinderGeometry(0.07, 0.11, height, 6), [0, height / 2, 0])];
  const leafG = new THREE.SphereGeometry(0.5, 8, 6);
  for (let i = 0; i < 2; i++) {
    const a = rnd() * 6.28, y = height * rr(0.2, 0.5);
    sg.push(tg(leafG, [Math.cos(a) * 0.45, y + 0.15, Math.sin(a) * 0.45], [0, -a, 0.6], [1, 0.12, 0.42]));
  }
  put(bend, merge(sg), stemMat());
  const head = new THREE.Group(); head.position.y = height; head.rotation.set(rr(0.35, 0.7), 0, lean); bend.add(head);
  const petal = new THREE.SphereGeometry(0.5, 8, 6);
  const pg = [];
  if (type === 'daisy' || type === 'sun') {
    const n = type === 'sun' ? 16 : 11, R = type === 'sun' ? 0.95 : 0.62, len = type === 'sun' ? 0.8 : 0.72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283;
      pg.push(tg(petal, [Math.cos(a) * R, 0, Math.sin(a) * R], [0, -a, 0.12], [len, 0.14, 0.36]));
    }
    put(head, merge(pg), M(color, { r: 0.55 }));
    put(head, new THREE.SphereGeometry(type === 'sun' ? 0.72 : 0.36, 12, 8), M(type === 'sun' ? 0x7a4a22 : 0xffc21a, { r: 0.8 }), [0, 0.08, 0], null, [1, 0.45, 1]);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283;
      pg.push(tg(petal, [Math.cos(a) * 0.28, 0.45, Math.sin(a) * 0.28], [0, -a, -0.2], [0.42, 1.05, 0.6]));
    }
    head.rotation.x *= 0.3;
    put(head, merge(pg), M(color, { r: 0.4 }));
  }
  root.userData = { bend, bx: 0, bz: 0, phase: rnd() * 6, h: height };
  flowers.push(root);
  return root;
}

function buildFlowerBed(scene) {
  const b = L.bed;
  // soil mound
  put(scene, new THREE.SphereGeometry(b.r, 32, 10, 0, 6.283, 0, Math.PI / 2), M(C.soil, { r: 1, env: 0.1 }), [b.x, -0.05, b.z], null, [1, 0.06, 1], false);
  // rounded border stones
  const sg = [], stone = new THREE.SphereGeometry(0.6, 10, 8);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * 6.283, r = b.r + rr(-0.1, 0.15);
    sg.push(tg(stone, [b.x + Math.cos(a) * r, 0.18, b.z + Math.sin(a) * r], [0, rnd() * 3, 0], [rr(0.9, 1.3), rr(0.55, 0.8), rr(0.8, 1.1)]));
  }
  put(scene, merge(sg), M(0xd9d2c2, { r: 0.85 }));
  const cols = { daisy: [0xffffff, 0xfff3fb, 0xffd3ec], tulip: [0xff4f6d, 0xff8a3c, 0xb86bff, 0xff6fb3, 0xffd23f], sun: [0xffc928] };
  let placed = 0, guard = 0;
  const spots = [];
  while (placed < 17 && guard++ < 400) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * (b.r - 0.9);
    const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    if (Math.hypot(x - b.x, z - b.z) < 2.3) continue; // teddy's clearing
    if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 1.9)) continue;
    // keep the camera-side of the clearing low so teddy is visible
    const front = z > b.z + 0.5 && Math.abs(x - b.x) < 2.6;
    const type = front ? 'tulip' : pick(['daisy', 'tulip', 'sun', 'daisy', 'tulip']);
    const h = front ? rr(1.5, 2.0) : type === 'sun' ? rr(3.9, 4.5) : type === 'daisy' ? rr(2.7, 3.5) : rr(2.3, 3.0);
    const f = makeFlower(type, pick(cols[type]), h);
    f.position.set(x, 0.2, z); f.rotation.y = rnd() * 6.28;
    scene.add(f); spots.push([x, z]); placed++;
  }
  // a few wanderers along the fence and around the yard
  const extra = [[-31, -8, 'sun'], [-31.5, -3, 'daisy'], [-31, 2, 'sun'], [-28, -14, 'daisy'], [30.5, 2, 'daisy'], [31, -3, 'tulip'], [31, 6, 'sun'],
    [-4, -29.5, 'daisy'], [1, -30, 'tulip'], [6, -29.5, 'sun'], [11, -30, 'daisy'], [-9, 19, 'tulip'], [-6, 21, 'daisy'], [27, 21, 'tulip'], [-27, 22, 'daisy'], [-11, -29.5, 'tulip'],
    [36, -30, 'tulip'], [55, -30, 'daisy'], [59, -29.5, 'sun'], [71, -12, 'daisy'], [71.5, 2, 'sun'], [71, 13, 'tulip'], [66, 21.5, 'daisy'], [50, 22, 'tulip'], [34, 23, 'sun']];
  for (const [x, z, type] of extra) {
    const f = makeFlower(type, pick(cols[type]), type === 'sun' ? rr(3.8, 4.4) : rr(2.4, 3.2));
    f.position.set(x, 0, z); f.rotation.y = rnd() * 6.28; scene.add(f);
  }
  // watering can
  const can = new THREE.Group(); can.position.set(b.x + 7.6, 0, b.z - 3.4); can.rotation.y = 0.7; scene.add(can);
  const cm = M(0x5fb6e8, { r: 0.35 });
  put(can, new THREE.CylinderGeometry(0.75, 0.85, 1.5, 16), cm, [0, 0.75, 0]);
  put(can, new THREE.CylinderGeometry(0.1, 0.16, 1.5, 8), cm, [1.15, 1.0, 0], [0, 0, -0.9]);
  put(can, new THREE.CylinderGeometry(0.28, 0.1, 0.25, 10), M(0xffd65c, { r: 0.4 }), [1.78, 1.5, 0], [0, 0, -0.9]);
  put(can, new THREE.TorusGeometry(0.55, 0.09, 8, 16, Math.PI), cm, [-0.75, 0.95, 0], [0, 0, Math.PI / 2]);
}

// ---------------------------------------------------------------- pond
const lilies = [];
function buildPond(scene, uniforms) {
  const p = L.pond;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: uniforms.uTime, uHeli: uniforms.uHeli, uWash: uniforms.uPondWash, uC: { value: new THREE.Vector2(p.x, p.z) }, uR: { value: new THREE.Vector2(p.rx, p.rz) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uHeli; uniform float uWash; uniform vec2 uC; uniform vec2 uR; varying vec3 vW;
      void main(){
        vec2 p = (vW.xz - uC)/uR; float e = length(p);
        vec3 col = mix(vec3(0.0,0.42,0.58), vec3(0.16,0.80,0.74), smoothstep(0.15, 1.0, e));
        float c = sin(vW.x*1.3 + uTime*0.8 + sin(vW.z*0.9+uTime*0.5)*1.5) * sin(vW.z*1.1 - uTime*0.6 + sin(vW.x*0.7)*1.3);
        col += vec3(0.10,0.16,0.13) * smoothstep(0.5, 1.0, c);
        col += vec3(0.9,0.8,0.55) * smoothstep(0.93, 1.0, sin(vW.x*2.3 - vW.z*1.7 + uTime*1.3) * sin(vW.x*0.9 + vW.z*2.9 - uTime)) * 0.5;
        float d = distance(vW.xz, uHeli.xz);
        float rip = sin(d*3.0 - uTime*9.0) * exp(-d*0.26) * uWash;
        col += vec3(0.55) * smoothstep(0.3, 1.0, rip);
        col -= vec3(0.08,0.05,0.03) * smoothstep(0.3, 1.0, -rip);
        col = mix(col, vec3(0.9,1.0,0.96), smoothstep(0.93, 1.0, e + 0.02*sin(atan(p.y,p.x)*14.0 + uTime*1.5)) * 0.75);
        gl_FragColor = vec4(col, 0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  water.rotation.x = -Math.PI / 2; water.scale.set(p.rx, p.rz, 1); water.position.set(p.x, 0.07, p.z);
  scene.add(water);
  // pebble rim
  const sg = [], stone = new THREE.SphereGeometry(0.6, 10, 8);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * 6.283 + rr(-0.03, 0.03);
    sg.push(tg(stone, [p.x + Math.cos(a) * (p.rx + 0.25), 0.12, p.z + Math.sin(a) * (p.rz + 0.25)], [0, rnd() * 3, 0], [rr(0.8, 1.5), rr(0.5, 0.8), rr(0.8, 1.2)]));
  }
  put(scene, merge(sg), M(0xcfc8b8, { r: 0.8 }));
  // lily pads
  const padG = new THREE.CylinderGeometry(1, 1, 0.07, 20, 1, false, 0.35, 5.6);
  const spots = [[-4.6, -1.4, 1.2], [-2.4, 2.6, 0.9], [3.6, -2.4, 1.1], [5.2, 1.4, 0.8], [1.2, 3.3, 1.0], [-5.6, 1.6, 0.7], [2.4, -3.9, 0.75], [-1.6, -3.4, 0.9], [6.3, -0.9, 0.6]];
  spots.forEach(([dx, dz, s], i) => {
    const g = new THREE.Group(); g.position.set(p.x + dx, 0.1, p.z + dz); g.rotation.y = rnd() * 6.28; scene.add(g);
    put(g, padG, M(i % 2 ? 0x54b848 : 0x3fa046, { r: 0.45 }), [0, 0, 0], null, [s, 1, s], false);
    if (i % 3 === 0) {
      const pg = [], pet = new THREE.SphereGeometry(0.3, 8, 6);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283; pg.push(tg(pet, [Math.cos(a) * 0.22, 0.2, Math.sin(a) * 0.22], [0, -a, -0.7], [0.5, 1.1, 0.7])); }
      put(g, merge(pg), M(0xff9ed0, { r: 0.4 }), [0.1 * s, 0.05, 0]);
      put(g, new THREE.SphereGeometry(0.12, 8, 6), M(0xffe04a), [0.1 * s, 0.25, 0]);
    }
    lilies.push({ g, hx: g.position.x, hz: g.position.z, ox: 0, oz: 0, vx: 0, vz: 0, ph: rnd() * 6 });
  });
  // cattails
  const cg = [], hg = [];
  for (const [dx, dz] of [[-8.6, -2.2], [-8.9, -1.2], [-8.3, -3.0], [7.2, -4.2], [7.9, -3.5]]) {
    const h = rr(2.6, 3.6), x = p.x + dx, z = p.z + dz;
    cg.push(tg(new THREE.CylinderGeometry(0.05, 0.07, h, 5), [x, h / 2, z], [rr(-0.08, 0.08), 0, rr(-0.08, 0.08)]));
    hg.push(tg(new THREE.CapsuleGeometry(0.16, 0.6, 3, 8), [x, h - 0.2, z]));
    cg.push(tg(new THREE.SphereGeometry(0.5, 6, 5), [x + 0.25, h * 0.35, z], [0, rnd() * 3, 1.1], [1.4, 0.08, 0.22]));
  }
  put(scene, merge(cg), M(0x5aa040, { r: 0.7 }));
  put(scene, merge(hg), M(0x7a4a22, { r: 0.9 }));
}

// ---------------------------------------------------------------- tree
function buildTree(scene, dyn) {
  const t = L.tree, g = new THREE.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
  const bark = M(0x8b5a3a, { r: 0.9, env: 0.2 });
  const prof = [[4.6, 0], [3.6, 0.6], [2.9, 2], [2.5, 6], [2.3, 12], [2.5, 17], [3.2, 21]].map((p) => new THREE.Vector2(p[0], p[1]));
  put(g, new THREE.LatheGeometry(prof, 14), bark);
  // roots
  const rg = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; rg.push(tg(new THREE.CapsuleGeometry(0.8, 3.4, 4, 8), [Math.cos(a) * 3.6, 0.3, Math.sin(a) * 3.6], [0, -a, Math.PI / 2 - 0.25])); }
  put(g, merge(rg), bark);
  // friendly knot-hole
  put(g, new THREE.SphereGeometry(0.75, 12, 8), M(0x4a2c1a, { r: 1 }), [1.2, 6.2, 2.25], null, [1, 1.25, 0.3], false);
  put(g, new THREE.TorusGeometry(0.85, 0.22, 8, 16), bark, [1.2, 6.2, 2.3], [0, 0.45, 0], [1, 1.25, 1]);
  // big low branch (holds the tire swing) + its leaves
  const dir = new THREE.Vector3(L.swing.x - t.x, 0, L.swing.z - t.z);
  const len = dir.length() + 3.5, ang = Math.atan2(dir.x, dir.z);
  const br = new THREE.Group(); br.position.set(0, 12.2, 0); br.rotation.y = ang; g.add(br);
  put(br, new THREE.CylinderGeometry(0.5, 1.15, len, 8), bark, [0, 0.9, len / 2], [Math.PI / 2 - 0.14, 0, 0]);
  const blobG = new THREE.IcosahedronGeometry(1, 2);
  const leafMats = [M(C.leaf, { r: 0.8, env: 0.25 }), M(C.leafD, { r: 0.8, env: 0.25 }), M(C.leafL, { r: 0.8, env: 0.25 })];
  const low = [[len - 0.5, 14.6, 0.5, 3.1], [len - 3.5, 15.4, -2.2, 2.6], [len + 1.8, 13.6, 1.6, 2.2], [len - 2, 15, 2.6, 2.4]];
  low.forEach(([zz, y, xx, r], i) => put(br, blobG, leafMats[i % 3], [xx, y - 12.2, zz], [rnd(), rnd(), 0], [r, r * 0.8, r]));
  // canopy: lumpy clusters with gaps so sunlight dapples through
  const blobs = [[0, 27, 0, 9], [-8, 25, 3, 6.5], [8, 26, -2, 7], [2, 24, 9, 6], [-3, 25, -9, 6.5], [10, 23, 7, 4.6], [-10, 23, -6, 4.8], [15, 22, 0, 3.6],
    [5, 22, 15, 3.4], [-6, 21, 12, 3.6], [13, 21, 12, 2.6], [18, 21, 6, 2.2], [9, 20.5, 19, 2.1], [0, 20.5, 17, 2.0], [19, 20, -5, 2.6]];
  blobs.forEach(([x, y, z, r], i) => put(g, blobG, leafMats[i % 3], [x, y, z], [rnd(), rnd(), 0], [r, r * 0.72, r]));
  // sun shafts slipping through the leaves
  const shaftTex = canvasTex(64, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,236,170,0)'); gr.addColorStop(0.25, 'rgba(255,236,170,0.9)'); gr.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const g2 = c.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = g2; c.fillRect(0, 0, w, h);
  });
  const shafts = [];
  const mkShaft = (x, z, w, o, kind, len = 30) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 5; scene.add(m); shafts.push({ m, o, x, z, kind, ph: rnd() * 6 });
  };
  for (const [x, z, w, o] of [[-13, -15, 3.2, 0.2], [-6, -11, 2.4, 0.16], [-16, -8, 2.8, 0.18], [-2, -17, 2.0, 0.13], [-10, -3, 2.2, 0.14]]) mkShaft(x, z, w, o, 'tree');
  // long beams through the morning haze
  for (const [x, z, w, o] of [[-18, 4, 5, 0.2], [-4, -14, 4, 0.17], [8, 10, 5.5, 0.18], [24, -4, 4.5, 0.18], [36, 12, 5.5, 0.17], [50, -12, 5, 0.18], [62, 6, 4.5, 0.15], [16, -22, 4, 0.15]]) mkShaft(x, z, w, o, 'beam', 44);
  dyn.shafts = shafts;
  // low morning mist drifting over the lawn and pond
  const mistTex = canvasTex(128, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  dyn.mist = [];
  for (const [x, y, z, sx] of [[-20, 1.2, -29, 26], [6, 1.4, -30, 30], [34, 1.2, -29, 28], [60, 1.3, -28, 24], [L.pond.x, 0.9, L.pond.z, 20], [-24, 1.1, 8, 18], [44, 1.0, 14, 22], [58, 1.0, -2, 18], [-4, 1.0, 20, 22]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0, depthWrite: false, color: 0xfff6ea }));
    sp.scale.set(sx, sx * 0.22, 1); sp.position.set(x, y, z); sp.renderOrder = 4; scene.add(sp);
    dyn.mist.push({ sp, x, ph: rnd() * 6 });
  }
  // tire swing
  const sw = new THREE.Group(); sw.position.set(L.swing.x, 12.6, L.swing.z); scene.add(sw);
  const rope = M(0xe6d2a0, { r: 1 });
  put(sw, new THREE.CylinderGeometry(0.07, 0.07, 9.3, 5), rope, [-0.55, -4.65, 0], [0, 0, -0.06]);
  put(sw, new THREE.CylinderGeometry(0.07, 0.07, 9.3, 5), rope, [0.55, -4.65, 0], [0, 0, 0.06]);
  put(sw, new THREE.TorusGeometry(1.15, 0.5, 12, 24), M(0x34373d, { r: 0.75 }), [0, -10.2, 0], [0, ang + 1.2, 0]);
  dyn.swing = { g: sw, a: 0.1, v: 0, b: 0, bv: 0 };
  // mushrooms at the roots
  for (const [dx, dz, s] of [[5.2, 3.4, 1], [6.1, 2.2, 0.7], [4.2, 5.0, 0.55], [-1.5, 6.0, 0.8], [7.0, -0.6, 0.6]]) {
    const m = new THREE.Group(); m.position.set(t.x + dx, 0, t.z + dz); m.scale.setScalar(s); scene.add(m);
    put(m, new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), M(0xfff3e0, { r: 0.7 }), [0, 0.45, 0]);
    put(m, new THREE.SphereGeometry(0.75, 16, 8, 0, 6.283, 0, Math.PI / 2), M(0xe8392e, { r: 0.4 }), [0, 0.8, 0], null, [1, 0.8, 1]);
    const dots = [];
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + s, e = 0.5 + (i % 2) * 0.35; dots.push(tg(new THREE.SphereGeometry(0.11, 6, 5), [Math.cos(a) * Math.sin(e) * 0.75, 0.8 + Math.cos(e) * 0.6, Math.sin(a) * Math.sin(e) * 0.75])); }
    put(m, merge(dots), M(0xffffff, { r: 0.6 }), [0, 0, 0], null, null, false);
  }
}

// ---------------------------------------------------------------- play structure
function buildTower(scene) {
  const t = L.tower, g = new THREE.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
  const wood = M(C.wood, { r: 0.7 }), woodD = M(C.woodDark, { r: 0.75 }), h = t.s / 2, py = t.platY;
  const post = new THREE.CylinderGeometry(0.3, 0.34, 8.4, 10), pg = [], balls = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    pg.push(tg(post, [sx * h, 4.2, sz * h]));
    balls.push([sx * h, 8.65, sz * h]);
  }
  // deck planks
  for (let i = 0; i < 6; i++) pg.push(tg(new RoundedBoxGeometry(0.82, 0.3, t.s + 0.5, 2, 0.08), [-h + 0.42 + i * 0.835, py - 0.15, 0]));
  // cross braces
  pg.push(tg(new THREE.CylinderGeometry(0.13, 0.13, 7.2, 6), [-h, 2.7, 0], [0.75, 0, 0]));
  pg.push(tg(new THREE.CylinderGeometry(0.13, 0.13, 7.2, 6), [h, 2.7, 0], [-0.75, 0, 0]));
  pg.push(tg(new THREE.CylinderGeometry(0.13, 0.13, 7.2, 6), [0, 2.7, -h], [0, 0, 0.75]));
  put(g, merge(pg), wood);
  balls.forEach((b, i) => put(g, new THREE.SphereGeometry(0.42, 14, 10), M([C.red, C.blue, C.yellow, C.teal][i], { r: 0.3 }), b));
  // railings (north, east, west) – low so the robot stays visible
  const rail = [], bar = new THREE.CylinderGeometry(0.11, 0.11, t.s, 8), sp = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6);
  rail.push(tg(bar, [0, py + 1.25, -h], [0, 0, Math.PI / 2]), tg(bar, [h, py + 1.25, 0], [Math.PI / 2, 0, 0]), tg(bar, [-h, py + 1.25, 0], [Math.PI / 2, 0, 0]));
  for (let i = 1; i < 6; i++) {
    const o = -h + (i * t.s) / 6;
    rail.push(tg(sp, [o, py + 0.65, -h]), tg(sp, [h, py + 0.65, o]));
    if (i !== 3) rail.push(tg(sp, [-h, py + 0.65, o]));
  }
  put(g, merge(rail), M(C.teal, { r: 0.4 }));
  // ladder on the west side
  const lad = [];
  for (const o of [-0.7, 0.7]) lad.push(tg(new THREE.CylinderGeometry(0.11, 0.11, 6.4, 8), [-h - 1.0, py / 2 + 0.2, o], [0, 0, -0.3]));
  for (let i = 0; i < 6; i++) lad.push(tg(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), [-h - 1.78 + i * 0.3, 0.75 + i * 0.93, 0], [Math.PI / 2, 0, 0]));
  put(g, merge(lad), M(C.red, { r: 0.4 }));
  // buttery-yellow slide heading south toward the camera
  const z0 = h + 0.1, z1 = 11.6;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, py + 0.08, z0 - 0.5), new THREE.Vector3(0, py + 0.02, z0 + 0.6), new THREE.Vector3(0, py - 1.7, z0 + 3.0),
    new THREE.Vector3(0, 1.7, z1 - 3.4), new THREE.Vector3(0, 0.62, z1 - 1.3), new THREE.Vector3(0, 0.5, z1),
  ]);
  const N = 28, pos = [], idx = [], W = 1.15;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPoint(i / N);
    // U-shaped cross-section, 5 points
    for (const [ox, oy] of [[-W, 0.5], [-W * 0.86, 0.08], [0, 0], [W * 0.86, 0.08], [W, 0.5]]) pos.push(p.x + ox, p.y + oy, p.z);
    if (i < N) for (let k = 0; k < 4; k++) { const a = i * 5 + k; idx.push(a, a + 5, a + 1, a + 1, a + 5, a + 6); }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
  const slideMat = M(C.yellow, { r: 0.28, side: THREE.DoubleSide, env: 0.8 });
  put(g, sg, slideMat);
  const lips = [];
  for (const sx of [-1, 1]) {
    const c2 = new THREE.CatmullRomCurve3(curve.getPoints(N).map((p) => new THREE.Vector3(sx * W, p.y + 0.5, p.z)));
    lips.push(tg(new THREE.TubeGeometry(c2, N, 0.17, 8), [0, 0, 0]));
  }
  put(g, merge(lips), M(0xffc83a, { r: 0.3 }));
  put(g, new THREE.CylinderGeometry(0.16, 0.16, 2.3, 8), wood, [-0.9, 1.15, z1 - 4.4]);
  put(g, new THREE.CylinderGeometry(0.16, 0.16, 2.3, 8), wood, [0.9, 1.15, z1 - 4.4]);
  // bunting between the back posts
  const flagG = new THREE.ConeGeometry(0.34, 0.7, 3), cols = [C.red, C.yellow, C.blue, 0xffffff, C.teal, 0xff8a3c];
  for (let i = 0; i < 7; i++) {
    const u = (i + 0.5) / 7, x = -h + u * t.s, y = 8.2 - Math.sin(u * Math.PI) * 0.6;
    put(g, flagG, M(cols[i % cols.length], { r: 0.5, side: THREE.DoubleSide }), [x, y, -h], [Math.PI, 0, 0], [1, 1, 0.12]);
  }
  put(g, new THREE.CylinderGeometry(0.035, 0.035, t.s, 4), woodD, [0, 8.38, -h], [0, 0, Math.PI / 2], [1, 1, 1], false);
}

// ---------------------------------------------------------------- shed + pad
function buildShed(scene, dyn) {
  const s = L.shed, g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
  const wallTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#fff3dc'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(190,150,100,0.35)'; c.fillRect(i * 32, 0, 2, h); c.fillStyle = `rgba(255,255,255,${0.1 + (i % 3) * 0.08})`; c.fillRect(i * 32 + 2, 0, 30, h); }
  });
  put(g, new RoundedBoxGeometry(s.w, s.h, s.d, 3, 0.25), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, envMapIntensity: 0.4 }), [0, s.h / 2, 0]);
  // red gable roof with generous overhang
  const sh = new THREE.Shape();
  const hw = s.w / 2 + 0.9, rh = 3.0;
  sh.moveTo(-hw, 0); sh.lineTo(0, rh); sh.lineTo(hw, 0); sh.lineTo(hw - 0.5, -0.28); sh.lineTo(0, rh - 0.6); sh.lineTo(-hw + 0.5, -0.28); sh.closePath();
  const roofG = new THREE.ExtrudeGeometry(sh, { depth: s.d + 1.6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  put(g, roofG, M(C.red, { r: 0.35, env: 0.7 }), [0, s.h + 0.15, -s.d / 2 - 0.8]);
  const gable = new THREE.Shape(); gable.moveTo(-s.w / 2 + 0.1, 0); gable.lineTo(0, rh - 0.75); gable.lineTo(s.w / 2 - 0.1, 0); gable.closePath();
  put(g, new THREE.ExtrudeGeometry(gable, { depth: s.d - 0.3, bevelEnabled: false }), M(C.cream, { r: 0.7 }), [0, s.h - 0.05, -s.d / 2 + 0.15]);
  // door + window + sign on the camera-facing wall
  const fz = s.d / 2;
  put(g, new RoundedBoxGeometry(1.7, 2.8, 0.2, 3, 0.3), M(C.teal, { r: 0.4 }), [-1.2, 1.4, fz]);
  put(g, new THREE.SphereGeometry(0.13, 8, 6), M(C.yellow, { r: 0.3 }), [-0.65, 1.4, fz + 0.14]);
  put(g, new THREE.TorusGeometry(0.72, 0.16, 10, 24), M(C.red, { r: 0.4 }), [1.55, 2.25, fz + 0.05]);
  put(g, new THREE.CircleGeometry(0.7, 24), M(0x9fdcff, { r: 0.1, e: 0xffe9a8, ei: 0.35 }), [1.55, 2.25, fz + 0.04], null, null, false);
  const signTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect ? c.roundRect(4, 4, w - 8, h - 8, 30) : c.rect(4, 4, w - 8, h - 8); c.fill();
    c.lineWidth = 8; c.strokeStyle = '#e23b2e'; c.stroke();
    c.fillStyle = '#e23b2e'; c.font = '900 58px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RESCUE', w / 2, h / 2 + 4);
  });
  put(g, new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.5 }), [0, s.h + 1.0, fz + 0.14], null, null, false);
  // flower box
  put(g, new RoundedBoxGeometry(1.9, 0.45, 0.5, 2, 0.12), M(C.blue, { r: 0.45 }), [1.55, 1.15, fz + 0.3]);
  const fl = [];
  for (let i = 0; i < 5; i++) fl.push(tg(new THREE.SphereGeometry(0.2, 8, 6), [0.85 + i * 0.35, 1.52 + (i % 2) * 0.1, fz + 0.3]));
  put(g, merge(fl), M(0xff7fb0, { r: 0.5 }));
  // roof beacon
  put(g, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), M(0xdddddd), [2.2, s.h + 2.4, 0]);
  const beacon = put(g, new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff2a1a, emissiveIntensity: 1.5 }), [2.2, s.h + 3.05, 0], null, null, false);
  dyn.beacon = beacon;
  // windsock
  const pole = new THREE.Group(); pole.position.set(s.x - 5.2, 0, s.z + 1.5); scene.add(pole);
  put(pole, new THREE.CylinderGeometry(0.09, 0.12, 6.2, 8), M(0xf4f4f4, { r: 0.4 }), [0, 3.1, 0]);
  put(pole, new THREE.SphereGeometry(0.17, 8, 6), M(C.yellow), [0, 6.25, 0]);
  const sock = new THREE.Group(); sock.position.set(0, 5.8, 0); pole.add(sock);
  const sockTex = canvasTex(64, 64, (c) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff7a1a'; c.fillRect(0, i * 16, 64, 16); } });
  put(sock, new THREE.CylinderGeometry(0.16, 0.42, 2.0, 12, 1, true), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.7 }), [1.05, 0, 0], [0, 0, Math.PI / 2]);
  dyn.sock = { g: sock, yaw: 0.6, droop: 0.4 };
  // stepping stones from the door to the pad
  const st = [];
  for (const [x, z, r] of [[8.0, -4.9, 0.8], [6.9, -3.2, 0.7], [6.2, -1.4, 0.75], [5.9, 0.4, 0.65]]) st.push(tg(new THREE.CylinderGeometry(r, r * 1.05, 0.14, 12), [x, 0.07, z], [0, rnd() * 3, 0], [1, 1, rr(0.8, 1)]));
  put(scene, merge(st), M(0xd8d0bf, { r: 0.9 }), [0, 0, 0], null, null, false);
  // hose reel beside the shed
  put(g, new THREE.TorusGeometry(0.7, 0.2, 8, 20), M(0x58b85a, { r: 0.5 }), [-3.32, 1.5, 0.6], [0, Math.PI / 2, 0]);
  put(g, new THREE.TorusGeometry(0.42, 0.18, 8, 16), M(0x58b85a, { r: 0.5 }), [-3.36, 1.5, 0.6], [0, Math.PI / 2, 0]);
}

function buildPad(scene, dyn) {
  const p = L.pad;
  const tex = canvasTex(512, 512, (c, w) => {
    c.fillStyle = '#7d8ea3'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,50,70'},0.05)`; c.beginPath(); c.arc(rnd() * w, rnd() * w, rr(4, 26), 0, 7); c.fill(); }
    c.strokeStyle = '#fffbe8'; c.lineWidth = 26; c.beginPath(); c.arc(w / 2, w / 2, 198, 0, 7); c.stroke();
    c.strokeStyle = '#ffd43d'; c.lineWidth = 12; c.setLineDash([34, 22]); c.beginPath(); c.arc(w / 2, w / 2, 236, 0, 7); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#ffd43d'; c.font = '900 300px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, w / 2 + 16);
  }, { aniso: 8 });
  const side = M(0x64748a, { r: 0.6 });
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, envMapIntensity: 0.4 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.15, p.y, 40), [side, top, side]);
  pad.position.set(p.x, p.y / 2, p.z); pad.rotation.y = Math.PI / 2; pad.receiveShadow = true; pad.castShadow = true; scene.add(pad);
  dyn.padLights = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283 + 0.39;
    const m = put(scene, new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffc400, emissiveIntensity: 0.4 }), [p.x + Math.cos(a) * (p.r + 0.02), p.y + 0.02, p.z + Math.sin(a) * (p.r + 0.02)], null, null, false);
    dyn.padLights.push(m);
  }
  // picnic blanket: where rescued toys go to rest
  const btex = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#fff6ea'; c.fillRect(0, 0, w, w);
    c.fillStyle = 'rgba(226,59,46,0.55)';
    for (let i = 0; i < 8; i += 2) { c.fillRect(i * 32, 0, 32, w); c.fillRect(0, i * 32, w, 32); }
  });
  const bl = new THREE.Mesh(new RoundedBoxGeometry(L.blanket.w, 0.1, L.blanket.d, 2, 0.05), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.95, envMapIntensity: 0.2 }));
  bl.position.set(L.home.x, 0.06, L.home.z); bl.receiveShadow = true; scene.add(bl);
}

// ---------------------------------------------------------------- fence, backdrop, sandbox
function buildFence(scene) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.62, 0); sh.lineTo(-0.62, 6.1); sh.quadraticCurveTo(-0.6, 6.7, 0, 7.2); sh.quadraticCurveTo(0.6, 6.7, 0.62, 6.1); sh.lineTo(0.62, 0); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
  const spots = [];
  for (let x = -35; x <= L.east + 0.01; x += 1.42) spots.push([x, -33.4, 0]);
  for (let z = -32; z <= 42; z += 1.42) { spots.push([-35.4, z, Math.PI / 2]); spots.push([L.east, z, -Math.PI / 2]); }
  const mesh = new THREE.InstancedMesh(geo, M(0xffe9c4, { r: 0.6 }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  spots.forEach(([x, z, ry], i) => {
    q.setFromEuler(new THREE.Euler(0, ry, rr(-0.012, 0.012)));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, rr(0.96, 1.03), 1));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHSL(0.09, 0.6, rr(0.86, 1.0)));
  });
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  const railM = M(0xf2dfbf, { r: 0.7 });
  for (const y of [1.6, 5.0]) {
    put(scene, new THREE.BoxGeometry(L.east + 36, 0.4, 0.2), railM, [(L.east - 35) / 2, y, -33.6]);
    put(scene, new THREE.BoxGeometry(0.2, 0.4, 76), railM, [-35.6, y, 5]);
    put(scene, new THREE.BoxGeometry(0.2, 0.4, 76), railM, [L.east + 0.2, y, 5]);
  }
  // soft neighbourhood behind the fence
  const blob = new THREE.IcosahedronGeometry(1, 2), mats = [M(0x4d9a3e, { r: 0.9, env: 0.2 }), M(0x6fb548, { r: 0.9, env: 0.2 }), M(0x3d8a44, { r: 0.9, env: 0.2 })];
  for (let i = 0; i < 22; i++) {
    const x = -52 + i * 7 + rr(-2, 2), r = rr(5, 9);
    put(scene, blob, mats[i % 3], [x, r * 0.75 + rr(0, 3), -41 - rr(0, 10)], [rnd(), rnd(), 0], [r, r * 0.85, r], false);
  }
  for (let i = 0; i < 9; i++) {
    const r = rr(5, 8);
    put(scene, blob, mats[i % 3], [-44 - rr(0, 6), r * 0.8, -30 + i * 8], null, [r, r * 0.85, r], false);
    put(scene, blob, mats[(i + 1) % 3], [L.east + 9 + rr(0, 6), r * 0.8, -30 + i * 8], null, [r, r * 0.85, r], false);
  }
  // neighbour's house peeking over
  const hs = new THREE.Group(); hs.position.set(16, 0, -52); scene.add(hs);
  put(hs, new THREE.BoxGeometry(16, 12, 8), M(0xfbe3b4, { r: 0.8 }), [0, 6, 0], null, null, false);
  put(hs, new THREE.ConeGeometry(13, 6, 4), M(0xd9713a, { r: 0.6 }), [0, 15, 0], [0, Math.PI / 4, 0], [1, 1, 0.65], false);
  put(hs, new THREE.BoxGeometry(1.6, 4, 1.6), M(0xc7553a, { r: 0.7 }), [4, 16.5, 0], null, null, false);
}

function buildSandbox(scene) {
  const s = L.sandbox, g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = 0.12; scene.add(g);
  const fr = [], h = s.s / 2;
  for (const [x, z, ry] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]]) fr.push(tg(new RoundedBoxGeometry(s.s + 0.6, 0.7, 0.6, 2, 0.15), [x, 0.35, z], [0, ry, 0]));
  put(g, merge(fr), M(C.blue, { r: 0.4 }));
  const sand = new THREE.PlaneGeometry(s.s, s.s, 12, 12), pa = sand.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 1.7) * Math.cos(pa.getY(i) * 1.3) * 0.12 + 0.36);
  sand.computeVertexNormals();
  put(g, sand, M(C.sand, { r: 1, env: 0.15 }), [0, 0, 0], [-Math.PI / 2, 0, 0], null, false);
  // sandcastle, bucket, spade
  const cg = [tg(new THREE.CylinderGeometry(0.75, 0.9, 0.9, 12), [-1.2, 0.8, -0.8]), tg(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 10), [-1.2, 1.5, -0.8]), tg(new THREE.ConeGeometry(0.34, 0.5, 10), [-1.2, 2.05, -0.8])];
  put(g, merge(cg), M(0xe6c886, { r: 1 }));
  put(g, new THREE.CylinderGeometry(0.6, 0.42, 0.95, 14, 1, true), M(C.red, { r: 0.35, side: THREE.DoubleSide }), [1.3, 0.85, 0.9], [0.25, 0, 0.5]);
  put(g, new THREE.TorusGeometry(0.55, 0.05, 6, 16, Math.PI), M(0xffffff, { r: 0.4 }), [1.1, 1.2, 0.8], [0.25, 0, 0.5]);
  put(g, new THREE.CylinderGeometry(0.07, 0.07, 1.3, 6), M(C.yellow, { r: 0.4 }), [0.2, 0.75, -1.6], [0.5, 0, 1.1]);
  put(g, new THREE.SphereGeometry(0.3, 8, 6), M(C.yellow, { r: 0.4 }), [0.8, 0.5, -1.72], null, [1.1, 0.25, 0.8]);
}

// ---------------------------------------------------------------- build + per-frame
export function buildWorld(scene, renderer, uniforms, quality) {
  const dyn = {};
  const lights = buildSky(scene, renderer);
  buildGround(scene);
  buildGrass(scene, uniforms, quality.grass);
  buildFlowerBed(scene);
  buildPond(scene, uniforms);
  buildTree(scene, dyn);
  buildTower(scene);
  buildShed(scene, dyn);
  buildPad(scene, dyn);
  buildFence(scene);
  buildSandbox(scene);

  function update(dt, t, heli, wash) {
    // flowers lean away from the rotor wash and sway in the breeze
    for (const f of flowers) {
      const u = f.userData, dx = f.position.x - heli.x, dz = f.position.z - heli.z, d = Math.hypot(dx, dz) + 0.01;
      const k = smoothstep(8, 1.5, d) * wash * 0.5 * (0.8 + 0.2 * Math.sin(t * 17 + u.phase));
      const tx = (dx / d) * k + Math.sin(t * 1.3 + u.phase) * 0.035, tz = (dz / d) * k + Math.cos(t * 1.1 + u.phase) * 0.03;
      u.bx += (tx - u.bx) * Math.min(1, dt * 7); u.bz += (tz - u.bz) * Math.min(1, dt * 7);
      // convert world lean into the flower's rotated frame
      const c = Math.cos(f.rotation.y), s = Math.sin(f.rotation.y);
      const lx = u.bx * c - u.bz * s, lz = u.bx * s + u.bz * c;
      u.bend.rotation.z = -lx; u.bend.rotation.x = lz;
    }
    // lily pads drift from the wash, then float home
    for (const l of lilies) {
      const dx = l.g.position.x - heli.x, dz = l.g.position.z - heli.z, d = Math.hypot(dx, dz) + 0.01;
      const k = smoothstep(7, 1, d) * wash * 5;
      l.vx += ((dx / d) * k - l.ox * 3 - l.vx * 2.2) * dt; l.vz += ((dz / d) * k - l.oz * 3 - l.vz * 2.2) * dt;
      l.ox += l.vx * dt; l.oz += l.vz * dt;
      l.g.position.set(l.hx + l.ox, 0.1 + Math.sin(t * 2 + l.ph) * 0.015, l.hz + l.oz);
      l.g.rotation.z = Math.sin(t * 2.3 + l.ph) * 0.03 + l.vx * 0.05;
    }
    // tire swing
    const sw = dyn.swing;
    {
      const dx = L.swing.x - heli.x, dz = L.swing.z - heli.z, d = Math.hypot(dx, dz) + 0.01, k = smoothstep(9, 2, d) * wash;
      sw.v += (-sw.a * 2.2 - sw.v * 0.35 + (dx / d) * k * 1.4 + Math.sin(t * 0.7) * 0.03) * dt; sw.a += sw.v * dt;
      sw.bv += (-sw.b * 2.2 - sw.bv * 0.35 + (dz / d) * k * 1.4) * dt; sw.b += sw.bv * dt;
      sw.g.rotation.z = clamp(-sw.a, -0.6, 0.6); sw.g.rotation.x = clamp(sw.b, -0.6, 0.6);
    }
    // windsock points away from the helicopter when it's close
    const so = dyn.sock;
    {
      const wp = so.g.parent.position, dx = wp.x - heli.x, dz = wp.z - heli.z, d = Math.hypot(dx, dz), k = smoothstep(11, 3, d) * wash;
      const targetYaw = k > 0.05 ? Math.atan2(-dz, dx) : 0.6 + Math.sin(t * 0.4) * 0.3;
      so.yaw += (((targetYaw - so.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3);
      so.droop += ((k > 0.05 ? 0.0 : 0.38) - so.droop) * Math.min(1, dt * 3);
      so.g.rotation.set(0, so.yaw, -so.droop + Math.sin(t * 9) * 0.03 * (1 + k * 3));
    }
    dyn.beacon.material.emissiveIntensity = 0.6 + 1.6 * Math.max(0, Math.sin(t * 3));
    dyn.padLights.forEach((m, i) => { m.material.emissiveIntensity = 0.3 + 1.6 * Math.max(0, Math.sin(t * 4 - i * 0.785)); });
    // sun shafts: long axis along the light, face turned toward the camera
    const sd = L.sunDir, cur = lights.cur;
    for (const s of dyn.shafts) {
      const w = s.kind === 'tree' ? cur.tree : cur.beam, op = s.o * w * (0.75 + 0.25 * Math.sin(t * 0.6 + s.ph));
      s.m.visible = op > 0.004; if (!s.m.visible) continue;
      s.m.material.opacity = op; s.m.material.color.copy(cur.tint).lerp(_white, 0.35);
      const up = s.kind === 'tree' ? 11 : 14;
      s.m.position.set(s.x + sd.x * up, sd.y * up, s.z + sd.z * up);
      if (dyn.cam) {
        _z.copy(dyn.cam.position).sub(s.m.position); _z.addScaledVector(sd, -_z.dot(sd)).normalize();
        _x.crossVectors(sd, _z).normalize();
        s.m.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, sd, _z));
      }
    }
    for (const m of dyn.mist) { m.sp.material.opacity = cur.mist * 0.42 * (0.8 + 0.2 * Math.sin(t * 0.3 + m.ph)); m.sp.visible = cur.mist > 0.01; m.sp.position.x = m.x + Math.sin(t * 0.05 + m.ph) * 3; }
  }
  return { update, lights, setTime: lights.setTime, setCamera(c) { dyn.cam = c; }, flowerHeads: () => flowers.map((f) => new THREE.Vector3(f.position.x, f.position.y + f.userData.h * 0.96, f.position.z)) };
}
