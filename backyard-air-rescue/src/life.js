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

  // ---- butterflies
  const flies = [];
  const wingG = new THREE.CircleGeometry(0.26, 10);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group(); scene.add(g);
    const m = new THREE.MeshBasicMaterial({ color: pick([0xff9a3c, 0xfff06a, 0xff7ab8, 0x9ad0ff, 0xffffff]), side: THREE.DoubleSide });
    const l = new THREE.Group(), r = new THREE.Group(); g.add(l, r);
    const wl = new THREE.Mesh(wingG, m); wl.position.x = -0.22; wl.rotation.x = -Math.PI / 2; wl.scale.set(1, 1.3, 1); l.add(wl);
    const wr = new THREE.Mesh(wingG, m); wr.position.x = 0.22; wr.rotation.x = -Math.PI / 2; wr.scale.set(1, 1.3, 1); r.add(wr);
    const home = i < 3 ? new THREE.Vector3(L.bed.x + rr(-4, 4), rr(3.2, 4.6), L.bed.z + rr(-4, 4)) : new THREE.Vector3(rr(-12, 24), rr(2, 3.4), rr(-10, 8));
    flies.push({ g, l, r, home, ph: rnd() * 10, off: new THREE.Vector3() });
  }

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

  function update(dt, t, heli, wash) {
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
        l.p.x = clamp(l.p.x, -33.5, 33.5); l.p.z = clamp(l.p.z, -31.5, 38);
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
      if (p.x < -32 || p.x > 32) { bs.v.x *= -0.6; p.x = clamp(p.x, -32, 32); }
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

    for (const f of flies) {
      const tt = t * 0.5 + f.ph;
      const px = f.home.x + Math.sin(tt) * 3 + Math.sin(tt * 2.3) * 1.1, py = f.home.y + Math.sin(tt * 3.1) * 0.5, pz = f.home.z + Math.cos(tt * 0.8) * 3 + Math.cos(tt * 1.9);
      // scatter politely when the helicopter comes by
      const dx = px + f.off.x - heli.x, dz = pz + f.off.z - heli.z, d = Math.hypot(dx, dz) + 0.01, k = smoothstep(6, 1, d) * wash;
      f.off.x += ((dx / d) * k * 5 - f.off.x * 0.6) * dt * 3; f.off.z += ((dz / d) * k * 5 - f.off.z * 0.6) * dt * 3;
      const nx = px + f.off.x, nz = pz + f.off.z;
      f.g.rotation.y = Math.atan2(nx - f.g.position.x, nz - f.g.position.z);
      f.g.position.set(nx, py, nz);
      const flap = Math.sin(t * 22 + f.ph) * 1.0;
      f.l.rotation.z = flap; f.r.rotation.z = -flap;
    }

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
  return { update, burst };
}
