import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, put, tg, merge, canvasTex, clamp, lerp, rr, rnd } from './util.js';
import { L, restHooks, restHeight } from './world.js';
import { SOLID } from './physics.js';

// The trampoline and the seesaw catapult. Things land on them by falling (let go early) or by
// being set down gently; the trampoline throws them high, the seesaw flings whatever sits on its other end.
const massOf = (t) => (SOLID[t.name] || [1])[0] + (t.isBucket ? t.water * 0.4 : 0) + (t.isBasket ? t.held.length * 0.2 : 0);

export function buildPlayground(scene, audio, life, { landingSpot }) {
  // ---------------------------------------------------------------- trampoline
  const T = L.tramp, tramp = { ...T, dip: 0, dipV: 0, heliPull: false, cool: 0, bounces: 0 };
  {
    const g = new THREE.Group(); g.position.set(T.x, 0, T.z); scene.add(g);
    const segTex = canvasTex(256, 32, (c, w, h) => { const cs = ['#ff4f6d', '#ffd23f', '#3d9be9', '#7bd66a', '#ff8a3c', '#b86bff']; for (let i = 0; i < 12; i++) { c.fillStyle = cs[i % 6]; c.fillRect((i * w) / 12, 0, w / 12 + 1, h); } });
    put(g, new THREE.TorusGeometry(T.r, 0.26, 10, 48), new THREE.MeshStandardMaterial({ map: segTex, roughness: 0.5, envMapIntensity: 0.6 }), [0, T.matY, 0], [Math.PI / 2, 0, 0]);
    const legs = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; legs.push(tg(new THREE.CylinderGeometry(0.07, 0.07, T.matY, 6), [Math.cos(a) * (T.r - 0.05), T.matY / 2, Math.sin(a) * (T.r - 0.05)])); }
    put(g, merge(legs), M(0x8a94a6, { r: 0.4, m: 0.4 }));
    tramp.matGeo = new THREE.RingGeometry(0.001, T.r - 0.15, 40, 7);
    tramp.matGeo.rotateX(-Math.PI / 2);
    tramp.base = Float32Array.from(tramp.matGeo.attributes.position.array);
    const mat = put(g, tramp.matGeo, M(0x23232c, { r: 0.7, side: THREE.DoubleSide }), [0, T.matY - 0.02, 0]);
    mat.castShadow = false;
    put(g, new THREE.CircleGeometry(0.5, 20), M(0xffd23f, { r: 0.6 }), [0, T.matY + 0.005, 0], [-Math.PI / 2, 0, 0], null, false).name = 'star';
    tramp.star = g.getObjectByName('star');
  }
  tramp.kick = (s) => { tramp.dipV -= s; };
  const onTramp = (x, z) => Math.hypot(x - T.x, z - T.z) < T.r - 0.3;
  const hitsTramp = (x, z) => Math.hypot(x - T.x, z - T.z) < T.r + 0.5; // the padded rim bounces things too

  // ---------------------------------------------------------------- seesaw (plank runs east-west, so the launch crosses the screen)
  const S = L.seesaw, saw = { theta: 0, omega: 0, seats: { A: null, B: null } };
  const thetaMax = Math.asin((S.pivotY - 0.1) / S.half);
  const SEAT = S.half - 0.75;
  let plank;
  {
    const g = new THREE.Group(); g.position.set(S.x, 0, S.z); scene.add(g);
    const sh = new THREE.Shape(); sh.moveTo(-0.7, 0); sh.lineTo(0.7, 0); sh.lineTo(0.12, S.pivotY); sh.lineTo(-0.12, S.pivotY); sh.closePath();
    put(g, new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }), M(0xe23b2e, { r: 0.4 }), [0, 0, -0.5]);
    plank = new THREE.Group(); plank.position.set(0, S.pivotY, 0); g.add(plank);
    put(plank, new RoundedBoxGeometry(S.half * 2, 0.22, 1.3, 2, 0.08), M(0xffd23f, { r: 0.45 }), [0, 0.11, 0]);
    put(plank, new RoundedBoxGeometry(0.5, 0.06, 1.34, 1, 0.03), M(0x3d9be9, { r: 0.5 }), [0, 0.23, 0]);
    for (const sx of [-1, 1]) {
      put(plank, new THREE.TorusGeometry(0.3, 0.06, 8, 16, Math.PI), M(0x3d9be9, { r: 0.4 }), [sx * (SEAT - 0.7), 0.22, 0]);
      put(plank, new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14), M(0xff7fb0, { r: 0.6 }), [sx * SEAT, 0.28, 0]);
    }
  }
  const plankY = (s) => S.pivotY + 0.22 + s * Math.sin(saw.theta);     // height of the plank top at signed distance s (A end is west, B end is east)
  const seatPos = (end, out) => { const s = end === 'A' ? -SEAT : SEAT; return out.set(S.x + s * Math.cos(saw.theta), plankY(s) + 0.04, S.z); };
  const onSaw = (x, z) => Math.abs(z - S.z) < 1.3 && Math.abs(x - S.x) < S.half + 0.3;

  // a pulsing ring on the raised, empty seat: "drop something here"
  const invite = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xff6fb3, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  invite.rotation.x = -Math.PI / 2; invite.renderOrder = 3; invite.visible = false; scene.add(invite);

  // the trampoline mat and the plank are places a toy can come down on
  restHooks.push((x, z) => (onTramp(x, z) ? T.matY - tramp.dip * 0.5 : onSaw(x, z) ? plankY(x - S.x) + 0.04 : undefined));

  // ---------------------------------------------------------------- throwing things
  function fling(t, vy, toX, toZ, spin = 7) {
    const p = t.group.position, [sx, sz] = landingSpot(toX, toZ), g = 20, rest = restHeight(sx, sz) ?? 0, h = Math.max(0, p.y - rest);
    t.fall = { from: p.clone(), to: new THREE.Vector3(sx, rest, sz), vy, g, t: 0, dur: (vy + Math.sqrt(vy * vy + 2 * g * h)) / g, spin: (rnd() < 0.5 ? -1 : 1) * spin };
    t.state = 'falling'; t.seat = null; t.rest = rest;
    return t.fall;
  }
  function launchFrom(end, k) {
    const pass = saw.seats[end]; if (!pass) return;
    saw.seats[end] = null;
    const dirX = end === 'A' ? -1 : 1, a = rr(-0.35, 0.35), dist = 5 + 17 * k, apex = 2.5 + 7.5 * k;
    const p = pass.group.position;
    const f = fling(pass, Math.sqrt(2 * 20 * apex), p.x + dirX * Math.cos(a) * dist, p.z + Math.sin(a) * dist, 6 + 6 * k);
    pass.launched = true;
    audio.sfx.whoosh(k); life.burst(p.x, p.y + 1, p.z, 18, 0.6);
    return f;
  }

  /**
   * A thing just came down at its resting spot. Returns 'bounce' when the playground took it over
   * (thrown again), 'seat' when it sat down on the seesaw, or null when nothing special happened.
   */
  function landed(t, impact) {
    const p = t.group.position;
    if (hitsTramp(p.x, p.z)) {
      t.tbounce = (t.tbounce || 0) + 1;
      if (t.tbounce > 3) { t.tbounce = 0; return null; }
      const vy = clamp(14 + impact * 0.4, 14, 20) * Math.pow(0.82, t.tbounce - 1), a = rnd() * Math.PI * 2, d = rr(7, 13);
      fling(t, vy, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 9);
      tramp.kick(4 + impact * 0.3); audio.sfx.boing(clamp(impact / 10, 0.4, 1)); tramp.bounces++;
      return 'bounce';
    }
    t.tbounce = 0;
    if (onSaw(p.x, p.z)) {
      const end = p.x < S.x ? 'A' : 'B', other = end === 'A' ? 'B' : 'A';
      const endWasUp = end === 'A' ? saw.theta < -0.05 : saw.theta > 0.05;
      if (saw.seats[end] && saw.seats[end] !== t) { // someone is already sitting there: tumble off the side
        fling(t, 5, p.x, p.z + (rnd() < 0.5 ? -3 : 3), 5); return 'bounce';
      }
      saw.seats[end] = t; t.seat = end;
      const m = massOf(t), sign = end === 'A' ? 1 : -1;
      saw.omega += sign * (0.8 + m * (impact + 2) * 0.12);
      audio.sfx.thunk(clamp(m / 4, 0.3, 1));
      const pass = saw.seats[other];
      if (endWasUp && pass) {
        const k = clamp((m * (impact + 3)) / (30 * Math.max(0.4, massOf(pass))), 0.25, 1.1);
        launchFrom(other, k); saw.lastLaunch = { by: t.name, flew: pass.name, k };
      }
      return 'seat';
    }
    return null;
  }

  // ---------------------------------------------------------------- per frame
  const tmp = new THREE.Vector3();
  function update(dt, t, things, bunny, carriedBy, heliPos) {
    // trampoline mat wobble
    tramp.dipV += (-tramp.dip * 70 - tramp.dipV * 5) * dt; tramp.dip += tramp.dipV * dt;
    if (Math.abs(tramp.dip) > 0.002 || Math.abs(tramp.dipV) > 0.01) {
      const pa = tramp.matGeo.attributes.position, R = T.r - 0.15;
      for (let i = 0; i < pa.count; i++) { const x = tramp.base[i * 3], z = tramp.base[i * 3 + 2], r = Math.hypot(x, z) / R; pa.setY(i, -tramp.dip * (1 - r * r)); }
      pa.needsUpdate = true; tramp.star.position.y = T.matY + 0.005 - tramp.dip;
    }
    // seesaw: settle toward the heavier side
    for (const e of ['A', 'B']) { const th = saw.seats[e]; if (th && (th.state !== 'placed' || th.seat !== e)) { saw.seats[e] = null; if (th.seat === e) th.seat = null; } }
    const mA = saw.seats.A ? massOf(saw.seats.A) : 0, mB = saw.seats.B ? massOf(saw.seats.B) : 0;
    saw.omega += ((mA - mB) * 1.6 - saw.omega * 2.4) * dt;
    saw.theta += saw.omega * dt;
    if (saw.theta > thetaMax) { saw.theta = thetaMax; if (saw.omega > 0) saw.omega *= -0.25; }
    if (saw.theta < -thetaMax) { saw.theta = -thetaMax; if (saw.omega < 0) saw.omega *= -0.25; }
    plank.rotation.z = saw.theta;
    {
      const up = saw.theta > 0.05 ? 'B' : saw.theta < -0.05 ? 'A' : null;
      invite.visible = !!(carriedBy && up && !saw.seats[up] && heliPos && Math.hypot(heliPos.x - S.x, heliPos.z - S.z) < 13);
      if (invite.visible) { seatPos(up, tmp); invite.position.set(tmp.x, tmp.y + 0.12, tmp.z); const k = 1 + Math.sin(t * 6) * 0.15; invite.scale.set(k, k, 1); }
    }
    for (const e of ['A', 'B']) { const th = saw.seats[e]; if (th) { seatPos(e, tmp); th.group.position.set(tmp.x, tmp.y, tmp.z); th.rest = tmp.y; } }

    // the bunny hops home to the seesaw after every adventure
    const b = bunny;
    if (b.state === 'placed' && !b.seat && b !== carriedBy) {
      b.homeT = (b.homeT || 0) + dt;
      const free = !saw.seats.A ? 'A' : !saw.seats.B ? 'B' : null;
      if (b.homeT > 2.5 && free) { b.state = 'hopping'; b.hop = { end: free, t: 0, from: b.group.position.clone() }; b.homeT = 0; }
    } else b.homeT = 0;
    if (b.state === 'hopping') {
      const h = b.hop, target = seatPos(h.end, tmp), dx = target.x - h.from.x, dz = target.z - h.from.z, d = Math.hypot(dx, dz);
      h.t += dt;
      const len = Math.min(1.6, d), u = Math.min(1, h.t / 0.42), g = b.group;
      g.rotation.set(0, Math.atan2(dx, dz), 0);
      if (d < 0.05 || (len === d && u >= 1)) {
        g.position.copy(target); b.state = 'placed'; b.rest = target.y; b.seat = h.end; saw.seats[h.end] = b; b.hop = null; b.sqV = 6; audio.sfx.thunk(0.3);
      } else {
        const nx = h.from.x + (dx / d) * len * u, nz = h.from.z + (dz / d) * len * u, end = len === d ? target.y : 0;
        g.position.set(nx, lerp(h.from.y, end, u) + Math.sin(u * Math.PI) * (len === d ? 1.4 : 0.7), nz);
        if (u >= 1) { h.from.set(nx, end, nz); h.t = 0; b.sqV = 4; if (rnd() < 0.3) audio.sfx.hop(); }
      }
    }
    // keep the bunny seated at the start
    if (!b.started) { b.started = true; saw.seats.A = b; b.seat = 'A'; b.state = 'placed'; saw.theta = thetaMax; }
  }

  // helicopter bouncing on the trampoline
  function heliOver(pos) { return Math.hypot(pos.x - T.x, pos.z - T.z) < T.r - 0.4; }

  return {
    tramp, saw, landed, update, heliOver, onTramp, onSaw,
    catches: (x, z) => hitsTramp(x, z) || (Math.abs(z - S.z) < 1.3 && Math.abs(x - S.x) < S.half + 0.3),
    floor(x, z) { if (onTramp(x, z)) return T.matY + 0.1 - tramp.dip; if (onSaw(x, z)) return plankY(x - S.x) + 0.15; return undefined; },
    seatPos,
  };
}
