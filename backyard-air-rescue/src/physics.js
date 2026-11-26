import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, canvasTex, clamp, lerp } from './util.js';
import { L } from './world.js';

// Real rigid-body physics for the things you can knock over: block towers, dominoes, a can pyramid.
// Whatever hangs on the winch (or is flying through the air) becomes a solid ball in this world,
// so a swinging robot plows through a tower while a light duck bounces off it.

const GROUND = 1, PIECE = 2, PROXY = 4;
const groups = (member, filter) => (member << 16) | filter;
// how heavy and how big each carryable thing is as a solid
export const SOLID = { teddy: [1.4, 0.72], duck: [0.5, 0.62], robot: [6, 0.8], kite: [0.35, 0.62], ball: [0.7, 0.52], boat: [0.9, 0.62], doll: [0.9, 0.58], bucket: [1.6, 0.62], basket: [1.3, 0.75], bunny: [0.8, 0.6] };

export async function initPhysics(scene, audio, life) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  world.timestep = 1 / 60;
  const events = new RAPIER.EventQueue(true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.9).setCollisionGroups(groups(GROUND, PIECE)));

  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
  // ---- visuals: one instanced mesh per kind of piece
  const blockTex = canvasTex(64, 64, (c, w) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, w - 16); c.fillStyle = 'rgba(255,255,255,0.0)'; });
  const domTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(6, h / 2 - 2, w - 12, 4); c.fillStyle = 'rgba(255,255,255,1)'; for (const [x, y] of [[20, 24], [44, 44], [32, 34], [20, 88], [44, 88], [32, 104]]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fillStyle = 'rgba(30,30,40,0.55)'; c.fill(); } });
  const canTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(0, 18, w, 28); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 16, w, 3); c.fillRect(0, 45, w, 3); c.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(16 + i * 32, 32, 7, 0, 7); c.fill(); } });
  const kinds = {
    block: { geo: new RoundedBoxGeometry(1.1, 1.1, 1.1, 3, 0.12), mat: new THREE.MeshStandardMaterial({ map: blockTex, roughness: 0.45, envMapIntensity: 0.7 }), max: 40, n: 0,
      collider: () => RAPIER.ColliderDesc.roundCuboid(0.48, 0.48, 0.48, 0.07).setDensity(0.6).setFriction(0.75).setRestitution(0.12) },
    domino: { geo: new RoundedBoxGeometry(0.95, 1.9, 0.3, 2, 0.06), mat: new THREE.MeshStandardMaterial({ map: domTex, roughness: 0.4, envMapIntensity: 0.7 }), max: 30, n: 0,
      collider: () => RAPIER.ColliderDesc.cuboid(0.475, 0.95, 0.15).setDensity(0.7).setFriction(0.5).setRestitution(0.05) },
    can: { geo: new THREE.CylinderGeometry(0.32, 0.32, 0.78, 18), mat: new THREE.MeshStandardMaterial({ map: canTex, roughness: 0.25, metalness: 0.45, envMapIntensity: 1.0 }), max: 12, n: 0,
      collider: () => RAPIER.ColliderDesc.cylinder(0.39, 0.32).setDensity(0.35).setFriction(0.6).setRestitution(0.3) },
  };
  for (const k of Object.values(kinds)) {
    k.mesh = new THREE.InstancedMesh(k.geo, k.mat, k.max); k.mesh.castShadow = true; k.mesh.receiveShadow = true; k.mesh.frustumCulled = false; k.mesh.count = 0; scene.add(k.mesh);
  }

  // ---- structures
  const structures = [], byHandle = new Map();
  function structure(name, cx, cz) { const s = { name, cx, cz, pieces: [], state: 'standing', t0: 0, lastActive: 0, cheered: false, rebuildT: 0 }; structures.push(s); return s; }
  function piece(s, kind, x, y, z, yaw, color) {
    const K = kinds[kind], idx = K.n++; K.mesh.count = K.n;
    const q = new THREE.Quaternion().setFromEuler(_e.set(0, yaw, 0));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setCanSleep(true).setLinearDamping(0.05).setAngularDamping(0.15));
    const col = world.createCollider(K.collider().setCollisionGroups(groups(PIECE, GROUND | PIECE | PROXY)).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(12), body);
    body.sleep();
    K.mesh.setColorAt(idx, _c.set(color));
    const p = { kind, K, idx, body, home: new THREE.Vector3(x, y, z), homeQ: q.clone(), from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), s };
    byHandle.set(col.handle, p); s.pieces.push(p);
    return p;
  }
  const RAINBOW = [0xff4f6d, 0xff8a3c, 0xffd23f, 0x7bd66a, 0x3d9be9, 0xb86bff];
  { // block tower near the sandbox: 2 x 2, four high
    const s = structure('tower', L.blocks.x, L.blocks.z);
    for (let k = 0; k < 4; k++) for (const [dx, dz] of [[-0.555, -0.555], [0.555, -0.555], [-0.555, 0.555], [0.555, 0.555]]) piece(s, 'block', s.cx + dx, 0.55 + k * 1.102, s.cz + dz, 0, RAINBOW[(k + (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)) % 6]);
  }
  { // block pyramid in the garden, two deep
    const s = structure('pyramid', L.pyramid.x, L.pyramid.z);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) for (const dz of [-0.555, 0.555]) piece(s, 'block', s.cx + (i - (3 - row) / 2) * 1.11, 0.55 + row * 1.102, s.cz + dz, 0, RAINBOW[(row * 2 + i) % 6]);
  }
  { // a winding domino run
    const s = structure('dominoes', (L.domino.x0 + L.domino.x1) / 2, (L.domino.z0 + L.domino.z1) / 2);
    const P = (u) => new THREE.Vector3(lerp(L.domino.x0, L.domino.x1, u) + Math.sin(u * Math.PI * 2) * 2.2, 0, lerp(L.domino.z0, L.domino.z1, u));
    let u = 0, prev = P(0), n = 0;
    while (u <= 1 && n < 30) {
      const a = P(Math.max(0, u - 0.01)), b = P(Math.min(1, u + 0.01)), yaw = Math.atan2(b.x - a.x, b.z - a.z);
      piece(s, 'domino', prev.x, 0.951, prev.z, yaw, RAINBOW[n % 6]); n++;
      // step along the curve about 0.85 units
      let d = 0, cur = prev; while (d < 0.85 && u < 1) { u += 0.002; const nx = P(u); d += nx.distanceTo(cur); cur = nx; }
      if (u >= 1) break; prev = cur;
    }
  }
  { // tin cans stacked on a little garden table
    const T = L.cans, top = 1.3;
    const tg = new THREE.Group(); tg.position.set(T.x, 0, T.z); scene.add(tg);
    put(tg, new RoundedBoxGeometry(3.4, 0.16, 1.5, 2, 0.06), M(0xc98d55, { r: 0.7 }), [0, top - 0.08, 0]);
    for (const [x, z] of [[-1.5, -0.6], [1.5, -0.6], [-1.5, 0.6], [1.5, 0.6]]) put(tg, new THREE.CylinderGeometry(0.08, 0.1, top - 0.16, 6), M(0xa66a3a, { r: 0.8 }), [x, (top - 0.16) / 2, z]);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.7, 0.08, 0.75).setTranslation(T.x, top - 0.08, T.z).setCollisionGroups(groups(GROUND, PIECE)));
    const s = structure('cans', T.x, T.z);
    const CC = [0xe23b2e, 0x3d9be9, 0x7bd66a, 0xffd23f, 0xff8a3c];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) piece(s, 'can', T.x + (i - (3 - row) / 2) * 0.67, top + 0.39 + row * 0.781, T.z, 0, CC[(row + i) % 5]);
  }
  for (const k of Object.values(kinds)) if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true;

  // ---- solid stand-ins for whatever is on the winch or flying through the air
  const proxies = new Map();
  function proxy(thing) {
    let pr = proxies.get(thing);
    if (!pr) {
      const [mass, r] = SOLID[thing.name] || [1, 0.6];
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setGravityScale(0).lockRotations().setCanSleep(false).setCcdEnabled(true));
      const col = world.createCollider(RAPIER.ColliderDesc.ball(r).setMass(mass).setFriction(0.3).setRestitution(0.35).setCollisionGroups(groups(PROXY, PIECE)), body);
      body.setEnabled(false);
      pr = { body, col, on: false, target: new THREE.Vector3(), r };
      byHandle.set(col.handle, { proxy: thing });
      proxies.set(thing, pr);
    }
    return pr;
  }
  /** Ask the solid stand-in for `thing` to be at `center` after this step (or switch it off with null). */
  function drive(thing, center, dt) {
    const pr = proxy(thing);
    if (!center) { if (pr.on) { pr.body.setEnabled(false); pr.on = false; } return; }
    if (!pr.on) { pr.body.setEnabled(true); pr.body.setTranslation(center, true); pr.body.setLinvel({ x: 0, y: 0, z: 0 }, true); pr.on = true; }
    const p = pr.body.translation();
    _v.set(center.x - p.x, center.y - p.y, center.z - p.z).multiplyScalar(1 / dt);
    if (_v.length() > 40) _v.setLength(40);
    pr.body.setLinvel(_v, true);
    pr.target.copy(center);
  }
  /** Where the stand-in ended up after the step: different from its target if it hit something. */
  function pushedBy(thing, out) { const pr = proxies.get(thing); if (!pr || !pr.on) return null; const p = pr.body.translation(); return out.set(p.x - pr.target.x, p.y - pr.target.y, p.z - pr.target.z); }

  // ---- per-frame
  let lastClack = 0, acc = 0;
  /** How many fixed 1/60 s steps to run this frame (so physics keeps real time even at 30 fps). */
  function plan(dt) { acc = Math.min(acc + dt, 0.1); const k = Math.min(3, Math.floor(acc * 60 + 1e-6)); acc -= k / 60; return k; }
  function step(k, t, carriedNear) {
    for (let i = 0; i < k; i++) world.step(events);
    // clatter: one sound per knock from a piece that is actually moving (stacked blocks pressing on each other stay quiet)
    events.drainContactForceEvents((ev) => {
      if (t - lastClack < 0.04) return;
      const a = byHandle.get(ev.collider1()), b = byHandle.get(ev.collider2());
      const p = (a && a.kind && a) || (b && b.kind && b); if (!p) return;
      const lv = p.body.linvel(), av = p.body.angvel(), sp = Math.hypot(lv.x, lv.y, lv.z) + 0.25 * Math.hypot(av.x, av.y, av.z);
      if (sp < 1.4) return;
      lastClack = t;
      audio.sfx.clack(p.kind, clamp(sp / 9, 0.15, 1), (a && a.proxy) || (b && b.proxy) ? 1 : 0);
    });
    for (const s of structures) {
      let displaced = 0, active = false;
      for (const p of s.pieces) {
        const tr = p.body.translation(), ro = p.body.rotation();
        _v.set(tr.x, tr.y, tr.z); _q.set(ro.x, ro.y, ro.z, ro.w);
        if (s.state !== 'rebuilding') {
          if (_v.distanceTo(p.home) > 0.35 || _q.angleTo(p.homeQ) > 0.3) displaced++;
          if (!p.body.isSleeping()) { const lv = p.body.linvel(); if (Math.hypot(lv.x, lv.y, lv.z) > 0.25) active = true; }
        }
        p.K.mesh.setMatrixAt(p.idx, _m.compose(_v, _q, _s));
      }
      if (s.state === 'standing' && displaced) { s.state = 'down'; s.t0 = t; s.lastActive = t; s.cheered = false; }
      if (s.state === 'down') {
        if (active) s.lastActive = t;
        if (!s.cheered && t - s.lastActive > 1.6 && displaced / s.pieces.length >= 0.5) { s.cheered = true; audio.sfx.cheer(); life.burst(s.cx, 3, s.cz, 50, 1.1); }
        if ((t - s.lastActive > 4.5 || t - s.t0 > 15) && !carriedNear(s.cx, s.cz)) startRebuild(s, t);
      }
      if (s.state === 'rebuilding') rebuildStep(s, t);
      s.displaced = displaced;
    }
    for (const k of Object.values(kinds)) k.mesh.instanceMatrix.needsUpdate = true;
  }
  // knocked-over pieces float back into place, bottom ones first
  function startRebuild(s, t) {
    s.state = 'rebuilding'; s.rebuildT = t;
    const order = [...s.pieces].sort((a, b) => a.home.y - b.home.y || a.home.x - b.home.x);
    order.forEach((p, i) => {
      const tr = p.body.translation(), ro = p.body.rotation();
      p.from.set(tr.x, tr.y, tr.z); p.fromQ.set(ro.x, ro.y, ro.z, ro.w); p.delay = i * 0.06;
      p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    });
    audio.sfx.rebuild();
  }
  function rebuildStep(s, t) {
    let done = true;
    for (const p of s.pieces) {
      const u = clamp((t - s.rebuildT - p.delay) / 0.9, 0, 1), e = u * u * (3 - 2 * u);
      if (u < 1) done = false;
      _v.lerpVectors(p.from, p.home, e); _v.y += Math.sin(u * Math.PI) * 1.6;
      _q.slerpQuaternions(p.fromQ, p.homeQ, e);
      p.body.setNextKinematicTranslation(_v); p.body.setNextKinematicRotation(_q);
    }
    if (done) {
      for (const p of s.pieces) {
        p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
        p.body.setTranslation(p.home, false); p.body.setRotation(p.homeQ, false);
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false); p.body.sleep();
      }
      s.state = 'standing'; life.burst(s.cx, 2, s.cz, 16, 0.5);
    }
  }
  return {
    plan, step, drive, pushedBy, structures,
    report: () => structures.map((s) => ({ name: s.name, state: s.state, pieces: s.pieces.length, displaced: s.displaced || 0 })),
  };
}
