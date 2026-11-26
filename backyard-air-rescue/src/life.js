import * as THREE from 'three';
import { M, put, tg, merge, rnd, rr, pick, clamp, smoothstep, canvasTex, blobShadow } from './util.js';
import { L, inPond } from './world.js';

// Small living details that react to the rotor wash.
export function buildLife(scene) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

  // ---- fallen leaves
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.34); leafShape.quadraticCurveTo(0.26, -0.1, 0, 0.34); leafShape.quadraticCurveTo(-0.26, -0.1, 0, -0.34);
  const NL = 46;
  const leafMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape, 4), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), NL);
  leafMesh.castShadow = true; leafMesh.frustumCulled = false; scene.add(leafMesh);
  const leaves = [];
  const leafCols = [0xe8862a, 0xd9562b, 0xf2b53a, 0xb8c43c, 0xc96a2a];
  for (let i = 0; i < NL; i++) {
    let x, z;
    if (i < 30) { const a = rnd() * 6.28, r = rr(4, 17); x = L.tree.x + 9 + Math.cos(a) * r; z = L.tree.z + 10 + Math.sin(a) * r * 0.8; }
    else { x = rr(-28, 28); z = rr(-24, 22); }
    if (inPond(x, z, 0.5)) x -= 18;
    leaves.push({ p: new THREE.Vector3(x, 0.06, z), v: new THREE.Vector3(), r: new THREE.Euler(-Math.PI / 2, 0, rnd() * 6), w: new THREE.Vector3(), air: false, ph: rnd() * 6 });
    leafMesh.setColorAt(i, col.set(pick(leafCols)));
  }

  // ---- beach ball
  const ballTex = canvasTex(256, 128, (c, w, h) => { const cs = ['#ff4f5e', '#ffffff', '#ffd23f', '#ffffff', '#3d9be9', '#ffffff']; for (let i = 0; i < 6; i++) { c.fillStyle = cs[i]; c.fillRect((i * w) / 6, 0, w / 6 + 1, h); } });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.3, envMapIntensity: 0.8 }));
  ball.castShadow = true; ball.position.set(-5, 1.1, 12); scene.add(ball);
  const ballShadow = blobShadow(1.3, 0.4); scene.add(ballShadow);
  const bs = { v: new THREE.Vector3() };

  // ---- pinwheels
  const pinwheels = [];
  for (const [x, z, c1, c2] of [[-9.5, 8.5, 0xff5a79, 0xffd23f], [-10.8, 14.2, 0x3d9be9, 0xffffff], [6.3, 6.4, 0xffd23f, 0xff8a3c], [-2.6, -1.8, 0x7bd66a, 0xffffff]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rr(-0.5, 0.5); scene.add(g);
    put(g, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), M(0xffffff, { r: 0.5 }), [0, 1.3, 0]);
    const wheel = new THREE.Group(); wheel.position.set(0, 2.55, 0.12); g.add(wheel);
    const va = [], vb = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283;
      (i % 2 ? va : vb).push(tg(new THREE.SphereGeometry(0.5, 8, 6), [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0], [0.35, 0, a + 0.5], [0.72, 0.34, 0.06]));
    }
    put(wheel, merge(va), M(c1, { r: 0.35 })); put(wheel, merge(vb), M(c2, { r: 0.35 }));
    put(wheel, new THREE.SphereGeometry(0.11, 8, 6), M(0xffcf3a), [0, 0, 0.08]);
    pinwheels.push({ g, wheel, spin: 1 });
  }

  // ---- butterflies: patterned wings, they visit flowers and sit with their wings slowly opening
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.02, 0.52);
  wingShape.quadraticCurveTo(0.32, 1.04, 0.98, 0.95);   // leading edge out to the forewing tip
  wingShape.quadraticCurveTo(0.94, 0.62, 0.52, 0.5);    // forewing outer edge
  wingShape.quadraticCurveTo(0.88, 0.3, 0.62, 0.05);    // hindwing
  wingShape.quadraticCurveTo(0.3, -0.03, 0.02, 0.42);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 10);
  const SPECIES = [
    { base: '#ff8a1f', edge: '#2a1608', dots: '#ffffff', vein: true },   // monarch-ish
    { base: '#5cc8ff', edge: '#163a7a', dots: '#e8f8ff', eye: '#ffd23f' },
    { base: '#ffe45c', edge: '#e8a800', dots: '#ffffff' },               // lemon
    { base: '#ff9ad2', edge: '#b0408a', dots: '#ffffff', eye: '#7a2a8a' },
    { base: '#ffffff', edge: '#3a3a3a', dots: '#ffffff', tip: true },    // cabbage white
    { base: '#b88cff', edge: '#4a2a8a', dots: '#ffe0ff' },
  ];
  const wingMats = SPECIES.map((sp) => {
    const tex = canvasTex(128, 128, (c, w, h) => {
      const U = (u) => u * w, Vv = (v) => (1 - v) * h;
      c.fillStyle = sp.base; c.fillRect(0, 0, w, h);
      const gr = c.createRadialGradient(U(0), Vv(0.5), 6, U(0), Vv(0.5), w * 1.05);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(0.78, sp.edge + '00'); gr.addColorStop(0.9, sp.edge);
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      if (sp.vein) { c.strokeStyle = sp.edge; c.lineWidth = 2.5; for (const [u, v] of [[0.95, 0.9], [0.8, 0.62], [0.7, 0.2], [0.45, 0.08]]) { c.beginPath(); c.moveTo(U(0.02), Vv(0.5)); c.quadraticCurveTo(U(u * 0.5), Vv(0.5 + (v - 0.5) * 0.3), U(u), Vv(v)); c.stroke(); } }
      if (sp.tip) { c.fillStyle = sp.edge; c.beginPath(); c.arc(U(0.95), Vv(0.94), 22, 0, 7); c.fill(); }
      c.fillStyle = sp.dots; for (const [u, v, r] of [[0.86, 0.86, 4], [0.92, 0.76, 3.5], [0.78, 0.92, 3], [0.66, 0.16, 3.5], [0.54, 0.08, 3]]) { c.beginPath(); c.arc(U(u), Vv(v), r, 0, 7); c.fill(); }
      if (sp.eye) { c.fillStyle = sp.eye; c.beginPath(); c.arc(U(0.5), Vv(0.24), 9, 0, 7); c.fill(); c.fillStyle = '#1c1c24'; c.beginPath(); c.arc(U(0.5), Vv(0.24), 4.5, 0, 7); c.fill(); }
    });
    return new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, envMapIntensity: 0.4 });
  });
  const bodyMat = M(0x2a2230, { r: 0.6 }), bodyG = new THREE.CapsuleGeometry(0.035, 0.3, 3, 6), antG = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3), knobG = new THREE.SphereGeometry(0.022, 6, 4);
  const bfParts = [tg(bodyG, [0, 0, 0], [Math.PI / 2, 0, 0])];
  for (const sx of [-1, 1]) bfParts.push(tg(antG, [sx * 0.04, 0.07, 0.24], [0.9, 0, -sx * 0.4]), tg(knobG, [sx * 0.085, 0.13, 0.31]));
  const bfBody = merge(bfParts); // one draw call for the body and antennae
  const NB = 14, flies = [];
  let flowerHeads = [new THREE.Vector3(L.bed.x, 3, L.bed.z)];
  for (let i = 0; i < NB; i++) {
    const g = new THREE.Group(); scene.add(g);
    const S = rr(0.8, 1.0); g.scale.setScalar(S / 0.5);
    put(g, bfBody, bodyMat, [0, 0, 0], null, null, false);
    const mat = wingMats[i % wingMats.length], wings = [];
    for (const sx of [1, -1]) {
      const pivot = new THREE.Group(); g.add(pivot);
      const wm = new THREE.Mesh(wingGeo, mat); wm.rotation.x = Math.PI / 2; wm.position.z = -0.25; wm.scale.set(0.5 * sx, 0.5, 1); pivot.add(wm);
      wm.castShadow = true; wings.push(pivot);
    }
    const f = { g, wings, ph: rnd() * 10, vel: new THREE.Vector3(), state: 'fly', timer: rr(0, 4), target: new THREE.Vector3(rr(-20, 60), rr(2, 4), rr(-20, 15)), active: true, show: 1, flap: 0 };
    g.position.set(rr(-25, 65), rr(2, 5), rr(-25, 20));
    flies.push(f);
  }
  // usually the next flower over; now and then a longer trip across the yard
  const pickFlower = (f) => {
    const p = f.g.position, near = flowerHeads.filter((h) => { const d = Math.hypot(h.x - p.x, h.z - p.z); return d > 0.8 && d < 12; });
    const list = near.length && rnd() < 0.85 ? near : flowerHeads;
    const h = list[Math.floor(rnd() * list.length)]; f.target.copy(h); f.target.y += 0.22; f.state = 'fly';
  };
  let flyK = 1;

  // ---- pollen and dust motes catching the light
  const NP = 320, ppos = new Float32Array(NP * 3), pcol = new Float32Array(NP * 3), motes = [];
  for (let i = 0; i < NP; i++) motes.push({ x: rr(-24, 24), y: rr(0.3, 8), z: rr(-20, 20), ph: rnd() * 20, s: rr(0.6, 1.4), vx: 0, vy: 0, vz: 0 });
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const moteTex = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.35, 'rgba(255,240,190,0.7)'); gr.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
  const pollen = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.24, map: moteTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pollen.frustumCulled = false; scene.add(pollen);
  let pollenK = 1;

  // ---- confetti / sparkle bursts
  const NC = 160;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NC);
  conf.frustumCulled = false; scene.add(conf);
  const parts = [];
  const confCols = [0xff4f6d, 0xffd23f, 0x3d9be9, 0x7bd66a, 0xffffff, 0xff8a3c, 0xb86bff];
  for (let i = 0; i < NC; i++) { parts.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), life: 0, r: rnd() * 6, w: rr(4, 12) }); conf.setColorAt(i, col.set(confCols[i % confCols.length])); }
  let ci = 0;
  function burst(x, y, z, n = 50, power = 1) {
    for (let i = 0; i < n; i++) {
      const p = parts[ci++ % NC]; const a = rnd() * 6.283, u = rr(0.3, 1);
      p.p.set(x, y, z); p.v.set(Math.cos(a) * u * 4.5 * power, rr(5, 10) * power, Math.sin(a) * u * 4.5 * power); p.life = rr(1.6, 2.8);
    }
  }

  // ---- fireflies for the evening
  const NF = 90, fpos = new Float32Array(NF * 3), fcol = new Float32Array(NF * 3), flies2 = [];
  for (let i = 0; i < NF; i++) flies2.push({ x: rr(-30, L.east - 3), z: rr(-28, 24), y: rr(0.6, 4.2), ph: rnd() * 20, sp: rr(0.2, 0.5) });
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  const glow = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,240,120,0.9)'); gr.addColorStop(1, 'rgba(255,220,80,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const fireflies = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: 1.4, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fireflies.frustumCulled = false; fireflies.visible = false; scene.add(fireflies);
  let ffK = 0;

  let heliDx = 0, heliDz = 0, lastHx = null, lastHz = null;
  function update(dt, t, heli, wash) {
    if (lastHx !== null) { heliDx = heli.x - lastHx; heliDz = heli.z - lastHz; } lastHx = heli.x; lastHz = heli.z;
    if (ffK > 0.01) {
      for (let i = 0; i < NF; i++) {
        const f = flies2[i], tt = t * f.sp + f.ph;
        fpos[i * 3] = f.x + Math.sin(tt) * 2.2 + Math.sin(tt * 2.7) * 0.6; fpos[i * 3 + 1] = f.y + Math.sin(tt * 1.9) * 0.5; fpos[i * 3 + 2] = f.z + Math.cos(tt * 0.8) * 2.2;
        const tw = ffK * Math.max(0, Math.sin(t * 2.1 + f.ph * 3)) ** 2;
        fcol[i * 3] = tw; fcol[i * 3 + 1] = tw; fcol[i * 3 + 2] = tw * 0.7;
      }
      fgeo.attributes.position.needsUpdate = true; fgeo.attributes.color.needsUpdate = true;
    }

    // leaves
    for (let i = 0; i < NL; i++) {
      const l = leaves[i];
      const dx = l.p.x - heli.x, dz = l.p.z - heli.z, d = Math.hypot(dx, dz) + 0.01;
      const k = smoothstep(7.5, 1.2, d) * wash * smoothstep(8, 2, heli.y - l.p.y);
      if (k > 0.12 && (!l.air || l.p.y < 3.5)) {
        l.air = true;
        const f = k * 26 * dt;
        l.v.x += (dx / d) * f + Math.sin(t * 9 + l.ph) * f * 0.4; l.v.z += (dz / d) * f + Math.cos(t * 8 + l.ph) * f * 0.4;
        l.v.y += k * 15 * dt * (l.p.y < 1.6 ? 1 : 0.2);
        l.w.set(rr(-6, 6), rr(-6, 6), rr(-6, 6));
      }
      if (l.air) {
        l.v.y -= 4.2 * dt;
        l.v.multiplyScalar(Math.exp(-1.5 * dt));
        l.v.x += Math.sin(t * 3 + l.ph) * 1.2 * dt; // flutter
        l.p.addScaledVector(l.v, dt);
        l.r.x += l.w.x * dt; l.r.y += l.w.y * dt; l.r.z += l.w.z * dt;
        l.p.x = clamp(l.p.x, -33.5, L.east - 1.5); l.p.z = clamp(l.p.z, -31.5, 38);
        const floor = inPond(l.p.x, l.p.z) ? 0.1 : 0.06;
        if (l.p.y <= floor) { l.p.y = floor; if (l.v.length() < 1.2) { l.air = false; l.v.set(0, 0, 0); l.r.x = -Math.PI / 2; l.r.y = 0; } else { l.v.y = Math.abs(l.v.y) * 0.25; } }
      }
      m4.compose(l.p, q.setFromEuler(l.r), sc.set(1, 1, 1)); leafMesh.setMatrixAt(i, m4);
    }
    leafMesh.instanceMatrix.needsUpdate = true;

    // ball rolls away from the wash
    {
      const p = ball.position, dx = p.x - heli.x, dz = p.z - heli.z, d = Math.hypot(dx, dz) + 0.01, k = smoothstep(7, 1.5, d) * wash;
      bs.v.x += (dx / d) * k * 14 * dt; bs.v.z += (dz / d) * k * 14 * dt;
      bs.v.multiplyScalar(Math.exp(-0.9 * dt));
      p.x += bs.v.x * dt; p.z += bs.v.z * dt;
      if (p.x < -32 || p.x > L.east - 3) { bs.v.x *= -0.6; p.x = clamp(p.x, -32, L.east - 3); }
      if (p.z < -30 || p.z > 26) { bs.v.z *= -0.6; p.z = clamp(p.z, -30, 26); }
      for (const o of [{ x: L.tree.x, z: L.tree.z, r: 4.6 }, { x: L.shed.x, z: L.shed.z, r: 4.8 }, { x: L.tower.x, z: L.tower.z, r: 4.2 }]) {
        const ox = p.x - o.x, oz = p.z - o.z, od = Math.hypot(ox, oz);
        if (od < o.r) { const nx = ox / od, nz = oz / od, vn = bs.v.x * nx + bs.v.z * nz; p.x = o.x + nx * o.r; p.z = o.z + nz * o.r; if (vn < 0) { bs.v.x -= 1.6 * vn * nx; bs.v.z -= 1.6 * vn * nz; } }
      }
      const floating = inPond(p.x, p.z, -0.6);
      p.y = 1.1 + (floating ? -0.35 + Math.sin(t * 2.2) * 0.06 : 0);
      const sp = Math.hypot(bs.v.x, bs.v.z);
      if (sp > 0.01) { v3.set(bs.v.z, 0, -bs.v.x).normalize(); ball.rotateOnWorldAxis(v3, (sp * dt) / 1.1); }
      ballShadow.position.set(p.x, floating ? 0.09 : 0.03, p.z);
    }

    for (const pw of pinwheels) {
      const d = Math.hypot(pw.g.position.x - heli.x, pw.g.position.z - heli.z);
      const target = 1.2 + smoothstep(12, 2, d) * wash * 26;
      pw.spin += (target - pw.spin) * Math.min(1, dt * 2);
      pw.wheel.rotation.z -= pw.spin * dt;
    }

    // butterflies
    flies.forEach((f, i) => {
      const want = i < Math.round(flyK * NB);
      if (want && !f.active) { f.active = true; f.g.visible = true; f.g.position.set(heli.x + rr(-20, 20), 9, heli.z - 16); pickFlower(f); }
      if (!want && f.active && f.state !== 'leave') { f.state = 'leave'; f.target.set(f.g.position.x + rr(-10, 10), 16, f.g.position.z - 25); }
      if (!f.active) return;
      const p = f.g.position, dxh = p.x - heli.x, dzh = p.z - heli.z, dh = Math.hypot(dxh, dzh) + 0.01;
      if (wash > 0.2 && dh < 6.5 && f.state !== 'leave' && f.state !== 'flee') { f.state = 'flee'; f.timer = 1.6; f.target.set(p.x + (dxh / dh) * 9, p.y + 1.5, p.z + (dzh / dh) * 9); }
      f.timer -= dt;
      let flapA;
      if (f.state === 'sit') {
        // wings slowly open and close while it sips
        flapA = 0.25 + 0.95 * (0.5 + 0.5 * Math.sin(t * 1.6 + f.ph));
        f.vel.set(0, 0, 0);
        if (f.timer <= 0) { pickFlower(f); f.vel.y = 1.5; }
      } else {
        const tx = f.target.x - p.x, ty = f.target.y - p.y, tz = f.target.z - p.z, td = Math.hypot(tx, ty, tz) + 0.001;
        const speed = f.state === 'flee' ? 4.5 : f.state === 'leave' ? 3.5 : 2.1;
        // wander: a lazy figure-eight on top of the heading, slowing as it arrives
        const ar = Math.min(1, td / 2.5), wob = Math.sin(t * 2.3 + f.ph) * 0.9 * ar;
        const dvx = (tx / td) * speed * ar + Math.cos(t * 1.7 + f.ph) * wob, dvz = (tz / td) * speed * ar + Math.sin(t * 2.1 + f.ph) * wob, dvy = (ty / td) * speed * ar + Math.sin(t * 4 + f.ph) * 0.6;
        f.vel.x += (dvx - f.vel.x) * Math.min(1, dt * 3); f.vel.y += (dvy - f.vel.y) * Math.min(1, dt * 3); f.vel.z += (dvz - f.vel.z) * Math.min(1, dt * 3);
        p.addScaledVector(f.vel, dt);
        const glide = Math.sin(t * 0.9 + f.ph * 3) > 0.7 && f.state === 'fly';
        f.flap += dt * (glide ? 2 : 13 + (f.state === 'flee' ? 6 : 0));
        flapA = glide ? 0.35 + Math.sin(f.flap) * 0.1 : 0.15 + 1.15 * (0.5 + 0.5 * Math.sin(f.flap));
        const hs = Math.hypot(f.vel.x, f.vel.z);
        if (hs > 0.15) f.g.rotation.y = Math.atan2(f.vel.x, f.vel.z);
        f.g.rotation.x = clamp(-f.vel.y * 0.15, -0.4, 0.4);
        if (f.state === 'fly' && td < 0.2) { f.state = 'sit'; f.timer = rr(2.5, 7); p.copy(f.target); f.g.rotation.x = 0; }
        if (f.state === 'flee' && f.timer <= 0) pickFlower(f);
        if (f.state === 'leave' && td < 1.5) { f.active = false; f.g.visible = false; }
      }
      f.wings[0].rotation.z = flapA; f.wings[1].rotation.z = -flapA;
    });

    // pollen: a box of motes that travels with the helicopter, drifting on the breeze
    if (pollenK > 0.01) {
      pollen.visible = true;
      for (let i = 0; i < NP; i++) {
        const m = motes[i], tt = t * 0.4 + m.ph;
        let wx = m.x + heli.x, wz = m.z + heli.z;
        const dx = wx - heli.x, dz = wz - heli.z, d = Math.hypot(dx, dz) + 0.1, k = Math.max(0, 1 - d / 7) * wash;
        m.vx += ((dx / d) * k * 7 - m.vx * 1.2) * dt; m.vz += ((dz / d) * k * 7 - m.vz * 1.2) * dt; m.vy += (k * 2 - m.vy * 1.2) * dt;
        m.x += (0.18 + Math.sin(tt) * 0.12 + m.vx) * dt - heliDx; m.z += (Math.cos(tt * 0.8) * 0.1 + m.vz) * dt - heliDz; m.y += (0.04 + Math.sin(tt * 1.3) * 0.08 + m.vy) * dt;
        if (m.x > 24) m.x -= 48; if (m.x < -24) m.x += 48; if (m.z > 20) m.z -= 40; if (m.z < -20) m.z += 40; if (m.y > 8.5) m.y = 0.3; if (m.y < 0.2) m.y = 8;
        ppos[i * 3] = m.x + heli.x; ppos[i * 3 + 1] = m.y; ppos[i * 3 + 2] = m.z + heli.z;
        const tw = pollenK * (0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + m.ph * 7)) ** 3) * m.s;
        pcol[i * 3] = tw; pcol[i * 3 + 1] = tw * 0.92; pcol[i * 3 + 2] = tw * 0.7;
      }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
    } else pollen.visible = false;
    heliDx = 0; heliDz = 0;

    for (let i = 0; i < NC; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt; p.v.y -= 9 * dt; p.v.multiplyScalar(Math.exp(-1.6 * dt)); p.p.addScaledVector(p.v, dt); p.r += p.w * dt;
        if (p.p.y < 0.1) { p.p.y = 0.1; p.v.set(0, 0, 0); }
        const s = clamp(p.life * 2, 0, 1);
        m4.compose(p.p, q.setFromEuler(e.set(p.r, p.r * 0.7, p.r * 1.3)), sc.set(s, s, s));
      } else m4.compose(v3.set(0, -50, 0), q.identity(), sc.set(0.001, 0.001, 0.001));
      conf.setMatrixAt(i, m4);
    }
    conf.instanceMatrix.needsUpdate = true;
  }
  return {
    update, burst,
    setFireflies(k) { ffK = k; fireflies.visible = k > 0.01; },
    setFlowers(list) { flowerHeads = list; flies.forEach((f, i) => { const h = list[(i * 7) % list.length]; f.g.position.set(h.x, h.y + 0.22, h.z); f.target.copy(f.g.position); f.state = 'sit'; f.timer = rr(0.5, 6); }); },
    setTime(tod) { pollenK = tod < 1 ? 1 - tod * 0.62 : Math.max(0, 0.38 * (2 - tod) - 0.02); flyK = tod < 1 ? 1 - tod * 0.45 : Math.max(0, 0.55 * (2 - tod) * 1.2 - 0.1); },
    butterflies: () => flies.filter((f) => f.active && f.state !== 'leave').length,
    debugFlies: () => flies.map((f) => ({ st: f.state, p: f.g.position.toArray().map((v) => +v.toFixed(1)), tg: f.target.toArray().map((v) => +v.toFixed(1)) })),
    debugHeads: () => flowerHeads.length,
  };
}
