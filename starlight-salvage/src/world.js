import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge, rnd, rr, canvasTex, smoothstep } from './util.js';

/** Layout: the debris floats on the plane y = 0, the ship cruises above it. */
export const L = {
  cruise: 6,                                   // ship altitude over the debris plane
  start: { x: 0, z: 6 },
  bounds: { x0: -36, x1: 36, z0: -28, z1: 24 },
  wreck: { x: -16, z: -8, r: 7.2 },            // the ship cannot fly in here; an astronaut can
  sunDir: new THREE.Vector3(0.38, 1, 0.42).normalize(),
};
/** Soft round obstacles for the ship (never a bump: it eases round them). */
export const PUSHERS = [L.wreck];

function buildSky(scene, renderer) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD;
      void main(){ vec3 d = normalize(vD);
        vec3 c = mix(vec3(0.10,0.07,0.24), vec3(0.05,0.05,0.16), smoothstep(-0.3, 0.6, d.y));
        c += vec3(0.55,0.20,0.50) * pow(max(dot(d, normalize(vec3(-0.7,-0.05,-0.7))), 0.0), 3.0) * 0.55;
        c += vec3(0.10,0.45,0.55) * pow(max(dot(d, normalize(vec3(0.8,-0.1,-0.5))), 0.0), 4.0) * 0.6;
        c += vec3(0.95,0.60,0.35) * pow(max(dot(d, normalize(vec3(0.1,-0.25,-1.0))), 0.0), 9.0) * 0.35;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), skyMat);
  sky.frustumCulled = false; scene.add(sky);
  // Soft image-based light so the paint keeps the same gentle sheen as the helicopter.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){ float h = normalize(vD).y;
      vec3 c = mix(vec3(0.25,0.75,0.72), vec3(0.55,0.5,0.95), smoothstep(-0.4, 0.5, h));
      c += vec3(1.0,0.85,0.7) * pow(max(dot(normalize(vD), normalize(vec3(0.38,1.0,0.42))), 0.0), 6.0) * 2.0;
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.04).texture;
  pm.dispose();

  // stars
  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd() * 6.283, y = rr(-0.5, 1), r = Math.sqrt(1 - y * y), b = rr(0.45, 1);
    pos.set([Math.cos(a) * r * 1400, y * 1400, Math.sin(a) * r * 1400], i * 3);
    const tint = rnd(); col.set([b, b * (tint < 0.2 ? 0.85 : 1), b * (tint > 0.8 ? 0.8 : 1)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);

  const hemi = new THREE.HemisphereLight(0xb7b0ff, 0x3fc7b8, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 3.4);
  sun.castShadow = true; sun.shadow.mapSize.setScalar(2048);
  const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 10; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return { sky, stars, hemi, sun };
}

function buildPlanet(scene) {
  // a big friendly planet far below gives the field a "down" and something to drift over
  const tex = canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    [[0, '#2b7fa8'], [0.25, '#39b3ae'], [0.45, '#7fd6b0'], [0.55, '#f2c58a'], [0.7, '#e88f8f'], [0.85, '#8a6fc9'], [1, '#4a4aa0']].forEach(([s, c]) => gr.addColorStop(s, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { // soft swirly cloud bands
      const x = rnd() * w, y = rnd() * h, rw = rr(40, 220), rh = rr(6, 26);
      g.fillStyle = `rgba(255,${Math.floor(rr(225, 255))},${Math.floor(rr(215, 255))},${rr(0.03, 0.13)})`;
      g.beginPath(); g.ellipse(x, y, rw, rh, rr(-0.12, 0.12), 0, 6.283); g.fill();
      if (x + rw > w) { g.beginPath(); g.ellipse(x - w, y, rw, rh, 0, 0, 6.283); g.fill(); }
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(40,30,90,${rr(0.04, 0.1)})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(30, 90), rr(10, 30), 0, 0, 6.283); g.fill(); }
  }, { aniso: 8 });
  tex.wrapS = THREE.RepeatWrapping;
  const R = 700, c = new THREE.Vector3(0, -R - 55, -40);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshBasicMaterial({ map: tex, color: 0xa6a6c0 }));
  planet.position.copy(c); planet.rotation.z = Math.PI / 2; scene.add(planet);   // equator up, so the bands run under the field
  const shell = (scale, side, frag) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(R * scale, 96, 48), new THREE.ShaderMaterial({
      side, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float d = dot(normalize(vN), normalize(vV)); ${frag} }`,
    }));
    m.position.copy(c); scene.add(m); return m;
  };
  shell(1.004, THREE.FrontSide, 'float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.2) * 0.75; gl_FragColor = vec4(vec3(0.45,0.85,1.0) * a, a);');
  shell(1.05, THREE.BackSide, 'float a = pow(smoothstep(0.0, 0.31, -d), 1.6) * 0.9; gl_FragColor = vec4(vec3(0.4,0.8,1.0) * a, a);');
  return planet;
}

function buildRocks(scene) {
  // drifting rocks under the debris plane: scenery to fly over, never in the way
  const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) { // push shared corners the same way so the rock stays closed
    const k = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(3)).join(',');
    if (!seen.has(k)) seen.set(k, rr(0.72, 1.18));
    const s = seen.get(k); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const N = 60, mesh = new THREE.InstancedMesh(geo, M(0x7d7aa6, { r: 0.9, flat: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const s = rr(0.5, 2.6) * (rnd() < 0.12 ? 2 : 1);
    q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6));
    m.compose(new THREE.Vector3(rr(-62, 62), rr(-16, -2.2) - s, rr(-52, 36)), q, new THREE.Vector3(s, s * rr(0.6, 1), s));
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setHSL(rr(0.62, 0.74), rr(0.15, 0.3), rr(0.45, 0.62)));
  }
  mesh.receiveShadow = true; scene.add(mesh);
}

function buildWreck(scene) {
  // the rib cage of an old freighter: the ship has to stay outside, an astronaut can float in
  const g = new THREE.Group(); g.position.set(L.wreck.x, -0.6, L.wreck.z); g.rotation.y = 0.25; scene.add(g);
  const hull = M(0x6aa3ad, { r: 0.55, m: 0.25 }), stripe = M(0xff8a2a, { r: 0.45 }), dark = M(0x4a5a6e, { r: 0.6 });
  const ribs = [], caps = [];
  [-4.2, -2.1, 0, 2.1, 4.2].forEach((z, i) => {
    const R = 5.2 - Math.abs(z) * 0.22, arc = i === 1 ? Math.PI * 0.62 : i === 3 ? Math.PI * 0.8 : Math.PI;
    ribs.push(tg(new THREE.TorusGeometry(R, 0.3, 8, 30, arc), [0, 0, z]));
    caps.push(tg(new THREE.TorusGeometry(R, 0.34, 8, 6, 0.16), [0, 0, z], [0, 0, 0.5]));
    caps.push(tg(new THREE.TorusGeometry(R, 0.34, 8, 6, 0.16), [0, 0, z], [0, 0, 0.1]));
  });
  put(g, merge(ribs), hull); put(g, merge(caps), stripe);
  for (const sx of [-1, 1]) put(g, new RoundedBoxGeometry(0.5, 0.4, 9.6, 2, 0.12), dark, [sx * 4.9, 0.1, 0]);
  put(g, new RoundedBoxGeometry(0.4, 0.4, 9.2, 2, 0.12), dark, [0, 5.0, 0]);
  put(g, new RoundedBoxGeometry(2.6, 0.14, 1.8, 2, 0.05), hull, [3.9, 2.4, -3.1], [0.2, 0.3, 1.05]);
  put(g, new RoundedBoxGeometry(2.2, 0.14, 1.6, 2, 0.05), hull, [-4.1, 2.0, 2.2], [-0.2, 0.1, -1.0]);
  const lamp = put(g, new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb040, emissiveIntensity: 2 }), [0, 5.35, 4.3], null, null, false);
  return { g, lamp };
}

/** One small pool of glowing dots for sparkles, thruster puffs and celebrations. */
function buildSparks(scene) {
  const N = 320, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ps = [];
  for (let i = 0; i < N; i++) { ps.push({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0, max: 1, c: new THREE.Color() }); pos[i * 3 + 1] = -999; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.renderOrder = 8; scene.add(pts);
  let next = 0; const tmp = new THREE.Color();
  const one = (x, y, z, vx, vy, vz, life, color) => { const q = ps[next++ % N]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.life = q.max = life; q.c.set(color); };
  return {
    one,
    burst(x, y, z, n, spread = 1, color = 0xffe9a0) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = (1.5 + Math.random() * 3.5) * spread;
        one(x, y, z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, 0.6 + Math.random() * 0.7, i % 3 === 0 ? 0xffffff : color);
      }
    },
    update(dt) {
      const k = Math.exp(-2.2 * dt);
      for (let i = 0; i < N; i++) {
        const q = ps[i];
        if (q.life > 0) { q.life -= dt; q.v.multiplyScalar(k); q.p.addScaledVector(q.v, dt); if (q.life <= 0) q.p.y = -999; }
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        const b = q.life > 0 ? smoothstep(0, 0.4, q.life / q.max) : 0; tmp.copy(q.c).multiplyScalar(b);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

export function buildWorld(scene, renderer) {
  const lights = buildSky(scene, renderer);
  const planet = buildPlanet(scene);
  buildRocks(scene);
  const wreck = buildWreck(scene);
  const sparks = buildSparks(scene);
  // dust motes hanging in the field: they are what makes speed visible in empty space
  const N = 520, dpos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) dpos.set([rr(-60, 60), rr(-5, 9), rr(-46, 40)], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.11, color: 0xcfe6ff, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(dust);
  return {
    lights, sparks,
    update(dt, t, focus) {
      lights.sky.position.copy(focus); lights.stars.position.copy(focus);
      lights.sun.target.position.set(focus.x, 2, focus.z);
      lights.sun.position.copy(lights.sun.target.position).addScaledVector(L.sunDir, 70);
      planet.rotation.x = t * 0.004;
      wreck.lamp.material.emissiveIntensity = Math.sin(t * 2.2) > 0.2 ? 2.6 : 0.3;
      sparks.update(dt);
    },
  };
}
