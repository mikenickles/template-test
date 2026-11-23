// Round 3A check 1a: the train. A lap timing, determinism and whistles; B trainClearance() and my own envelope check;
// C riding every car type (where you land, carry, yaw follow, jump off); D the tunnel scrape from every roof; E bullets
// and grenades against the train. Runs on the frozen snapshot. Every loop is tick-limited.
// Usage: node bug_r3a_01_train.cjs [sections, default ABCDE]
const { boot } = require('./bug_r3a_lib.cjs');
const SECT = process.argv[2] || 'ABCDE';

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((SECT) => {
    const G = __game, DT = 1 / 60, out = {}, L = R3.L;
    const st = () => G.state();
    const r3 = (a) => a.map((v) => +(+v).toFixed(3));
    const world = (c, along, lat) => { const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw); return [c.pos[0] + along * fx + lat * lx, c.pos[2] + along * fz + lat * lz]; };
    const reset = () => { G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0; G.trainRescueLog.length = 0; };

    // ---- A. timing, determinism, whistles ----
    if (SECT.includes('A')) {
      const A = { samples: [], maxErr: 0, whistles: [] };
      const t0 = st().time, s0 = st().train.s;
      let w = st().train.whistles;
      for (let i = 0; i < Math.round(2 * 54.3 * 60) + 30; i++) {
        G.step(DT); const s = st(), exp = (((s0 + 4 * (s.time - t0)) % L) + L) % L, err = Math.min(Math.abs(s.train.s - exp), L - Math.abs(s.train.s - exp));
        A.maxErr = Math.max(A.maxErr, err);
        if (s.train.whistles !== w) { w = s.train.whistles; const e = s.train.cars[0]; const front = R3.point(e.sFront); A.whistles.push({ t: +s.time.toFixed(3), engineFront: [+front.x.toFixed(2), +front.z.toFixed(2)], count: w }); }
        if (i % 1000 === 0) A.samples.push([+s.time.toFixed(2), +s.train.s.toFixed(3), +exp.toFixed(3)]);
      }
      // speed constant: car centres move 4 u/s along s
      A.lap = st().train.lap; A.length = st().train.length; A.speed = st().train.speed;
      // a lap is the same however the time is stepped: one big step vs 60 small ones
      const sa = st().train.s; G.step(1); const sb = st().train.s; for (let i = 0; i < 60; i++) G.step(DT); const sc = st().train.s;
      A.bigVsSmallStep = [+((sb - sa + L) % L).toFixed(4), +((sc - sb + L) % L).toFixed(4)];
      // trainAt(t) agrees with the live train
      const live = st().train.cars, pred = G.trainAt(st().time);
      A.trainAtVsLive = Math.max(...live.map((c, i) => Math.hypot(c.pos[0] - pred[i].x, c.pos[2] - pred[i].z)));
      // the player teleporting, dying or the train being blocked does not shift the schedule
      const before = st().train.s, tb = st().time; G.teleport(43, 0, 80); G.setInput({ forward: true }); G.step(20); G.clearInput(); G.teleport(60, 45, 100); G.step(4);
      A.afterInterference = { expected: +(((before + 4 * (st().time - tb)) % L + L) % L).toFixed(3), actual: +st().train.s.toFixed(3) };
      out.A = A;
    }

    // ---- B. clearance ----
    if (SECT.includes('B')) {
      const hits = {};
      for (const c of G.colliders) {
        if (c.kind === 'string' || c.kind === 'pad' || c.test) continue;
        if (c.y1 !== undefined && (c.y1 <= 0.25 || c.y0 >= 6)) continue;
        if (c.kind === 'cyl') { for (let a = 0; a < 64; a++) for (const rr of [c.r * 0.5, c.r]) { const x = c.x + Math.cos(a / 64 * 6.283) * rr, z = c.z + Math.sin(a / 64 * 6.283) * rr; if (R3.inEnv(x, z)) hits[c.id] = [+x.toFixed(2), +z.toFixed(2)]; } continue; }
        if (c.kind === 'ramp' && Number.isFinite(c.h0)) { const top = Math.max(c.h0, c.h1), bot = Number.isFinite(c.thickness) ? Math.min(c.h0, c.h1) - c.thickness : 0; if (top <= 0.25 || bot >= 6) continue; }
        for (let x = c.x0; x <= c.x1 + 1e-9; x += 0.1) for (let z = c.z0; z <= c.z1 + 1e-9; z += 0.1) if (R3.inEnv(x, z)) { hits[c.id] = [+x.toFixed(2), +z.toFixed(2)]; break; }
      }
      // nearest static solid to the envelope, in units, per region
      out.B = { trainClearance: G.trainClearance(), myEnvelopeHits: hits };
    }

    // ---- C. riding every car ----
    if (SECT.includes('C')) {
      out.C = [];
      const spots = [['engine', 0, -4.5, 'front roof'], ['engine', 0, 4.5, 'rear (cab?)'], ['engine', 0, 0, 'middle'], ['boxcar', 1, 0, 'roof'], ['flatbed', 2, -3.75, 'deck at rideSpot'], ['flatbed', 2, 0, 'middle (cargo?)'], ['flatbed', 2, 4, 'other end'], ['gondola', 3, 0, 'deck middle'], ['gondola', 3, 5, 'deck end'], ['caboose', 4, 0, 'roof']];
      for (const [type, idx, along, label] of spots) for (const crouch of [false, true]) {
        reset(); R3.waitCarAt(idx, 6);
        let c = R3.cars()[idx]; const [x, z] = world(c, along, 0);
        G.teleport(x, R3.TOP[type] + (type === 'engine' || type === 'flatbed' ? 1.3 : 0.3), z, c.yaw, 0); if (crouch) G.setInput({ crouch: true });
        for (let i = 0; i < 40; i++) G.step(DT);
        c = R3.cars()[idx]; const p0 = st().player, q0 = R3.local(c, p0.x, p0.z), yaw0 = p0.yaw - c.yaw;
        let maxDrift = 0, minY = 99, maxY = -99, offTicks = 0, inside = 0, yawErr = 0;
        for (let i = 0; i < 25 * 60; i++) {
          G.step(DT); c = R3.cars()[idx]; const p = st().player, q = R3.local(c, p.x, p.z);
          const d = Math.hypot(q.along - q0.along, q.lat - q0.lat); maxDrift = Math.max(maxDrift, d);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          if (!p.onGround) offTicks++;
          let dy = (p.yaw - c.yaw) - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yawErr = Math.max(yawErr, Math.abs(dy));
          if (R3.inCar(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8).length) inside++;
        }
        const p1 = st().player;
        const row = { car: type, spot: label, crouch, landedY: +p0.y.toFixed(3), riding: st().riding, local0: r3([q0.along, q0.lat]), maxDriftOn25s: +maxDrift.toFixed(3), yRange: r3([minY, maxY]), airTicks: offTicks, yawFollowErrDeg: +(yawErr * 180 / Math.PI).toFixed(2), insideCarTicks: inside, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), rescues: G.rescueLog.length, trainRescues: G.trainRescueLog.length, end: r3([p1.x, p1.y, p1.z]) };
        // jump straight up with no input: horizontal velocity right after take-off vs the car's
        G.clearInput(); G.step(0.2); c = R3.cars()[idx]; const cv = c.vel; G.setInput({ jump: true }); G.step(DT); G.step(DT); G.setInput({ jump: false });
        const pj = st().player; row.jumpVel = r3([pj.vx, pj.vz]); row.carVel = r3(cv || [0, 0]);
        for (let i = 0; i < 90 && !st().player.onGround; i++) G.step(DT); G.step(DT);
        const pl = st().player; row.afterJumpOnCar = !!R3.cars().some((k) => { const q = R3.local(k, pl.x, pl.z); return Math.abs(q.along) < 6.4 && Math.abs(q.lat) < 2.4 && pl.y > 0.5; });
        // jump off sideways (strafe right) and land on the floor: no damage
        G.setInput({ jump: true, right: true }); G.step(0.1); G.setInput({ right: true }); for (let i = 0; i < 180 && !(st().player.onGround && st().player.y < 0.01); i++) G.step(DT); G.clearInput(); G.step(0.3);
        const pf = st().player; row.jumpOff = { end: r3([pf.x, pf.y, pf.z]), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), inEnvelope: R3.inEnv(pf.x, pf.z) };
        out.C.push(row);
        G.teleport(60, 0, 20); G.step(0.5);
      }
    }

    // ---- D. tunnel scrape ----
    if (SECT.includes('D')) {
      out.D = [];
      const spots = [['engine', 0, -4.5, 'front roof'], ['engine', 0, 4.5, 'rear end'], ['boxcar', 1, -4.5, 'roof front'], ['boxcar', 1, 4.5, 'roof rear'], ['caboose', 4, 0, 'roof'], ['flatbed', 2, -3.75, 'deck'], ['flatbed', 2, 0.5, 'cargo block top', 4.5], ['flatbed', 2, 1.5, 'cargo block top', 4.5], ['gondola', 3, 0, 'deck']];
      for (const [type, idx, along, label, yAt] of spots) for (const crouch of [false, true]) {
        reset(); R3.waitCarAt(idx, 108);                       // car centre at the start of the east straight; tunnel is s 124..148
        let c = R3.cars()[idx]; const [x, z] = world(c, along, 0);
        G.teleport(x, yAt || R3.TOP[type] + (type === 'engine' || type === 'flatbed' ? 1.3 : 0.3), z, c.yaw, 0); if (crouch) G.setInput({ crouch: true });
        for (let i = 0; i < 40; i++) G.step(DT);
        const y0 = st().player.y; let left = null, inTunnelMinX = 99, inTunnelMaxX = -99, inside = 0, solid = 0, maxHead = 0;
        for (let i = 0; i < 16 * 60; i++) {
          G.step(DT); const p = st().player; c = R3.cars()[idx];
          const q = R3.local(c, p.x, p.z), onCar = Math.abs(q.along) < 6.4 && Math.abs(q.lat) < 2.4 && p.y > 0.6;
          if (!onCar && !left) left = { t: +(i / 60).toFixed(2), pos: r3([p.x, p.y, p.z]), carAlong: +q.along.toFixed(2) };
          if (p.z > 68 && p.z < 92 && p.x > 72 && p.x < 82) { inTunnelMinX = Math.min(inTunnelMinX, p.x); inTunnelMaxX = Math.max(inTunnelMaxX, p.x); maxHead = Math.max(maxHead, p.y + (p.crouching ? 1.2 : 1.8)); }
          if (R3.inCar(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8).length) inside++;
          if (T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.3, eps: 0.05 }).length) solid++;
        }
        G.clearInput(); const p = st().player;
        const row = { car: type, spot: label, crouch, rodeAt: +y0.toFixed(2), leftCar: left, xRangeInTunnel: [inTunnelMinX, inTunnelMaxX].map((v) => +v.toFixed(2)), maxHeadInTunnel: +maxHead.toFixed(2), insideCarTicks: inside, insideStaticTicks: solid, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), rescues: G.rescueLog.length, trainRescues: G.trainRescueLog.slice(0, 2), end: r3([p.x, p.y, p.z]) };
        // if left in the tunnel clearance, can you walk out (along the tunnel, north) in 8 s?
        if (p.z > 68 && p.z < 92 && p.y < 0.5) { G.look(0, 0); G.setInput({ forward: true }); G.step(8); G.clearInput(); const q = st().player; row.walkOut = r3([q.x, q.y, q.z]); row.walkedOut = q.z < 67.5; }
        out.D.push(row);
        G.teleport(60, 0, 20); G.step(0.5);
      }
    }

    // ---- E. bullets and grenades against the train ----
    if (SECT.includes('E')) {
      const E = { shots: [], grenades: [] };
      // bullets: stand 6 units west of the west straight, shoot east at each car as it passes x 43, z 80
      for (let idx = 0; idx < 5; idx++) for (const y of [0.6, 1.0, 3.0, 5.5]) {
        reset(); G.selectWeapon('rifle'); R3.waitCarAt(idx, 27.5);   // car centre at z 80 on the west straight
        G.teleport(37, 0, 80, -Math.PI / 2, 0); G.give('ammo'); G.step(0.5);
        const c = R3.cars()[idx]; G.lookAt(43, y, c.pos[2]); const e = G.fire();
        E.shots.push({ car: c.type, aimY: y, hit: e && e.hit, kind: e && e.kind, surface: e && e.surface, dist: e && +e.distance.toFixed(2) });
      }
      // raycast hook against the train at a known spot
      { R3.waitCarAt(1, 27.5); const r = G.raycast([37, 2, 80], [1, 0, 0]); E.raycastBoxcar = r && { id: r.id, kind: r.kind, d: +r.distance.toFixed(3) }; }
      // grenades: lob onto the flatbed and gondola decks from beside the track; follow every tick
      for (const [idx, along] of [[2, -3.75], [3, 0], [1, 0], [0, 0], [4, 0]]) for (const lead of [0, 2, 4]) {
        reset(); G.give('grenade'); R3.waitCarAt(idx, 20 + lead);      // car centre at z 87.5 - lead
        G.teleport(38, 0, 80, 0, 0); G.step(0.3);
        let c = R3.cars()[idx]; const [tx, tz] = world(c, along - 2.5, 0); G.lookAt(tx, 2.8, tz);
        G.setInput({ grenade: true }); G.step(DT); G.setInput({ grenade: false }); G.step(DT);
        const o = G.grenades[G.grenades.length - 1]; if (!o) { E.grenades.push({ idx, lead, thrown: false }); continue; }
        let insideCar = 0, out = 0, onCarTicks = 0, last = null, maxSpeed = 0, rodeVel = null;
        for (let i = 0; i < 140 && G.grenades.includes(o); i++) {
          last = [o.x, o.y, o.z]; c = R3.cars()[idx];
          const q = R3.local(c, o.x, o.z), on = Math.abs(q.along) < 6 && Math.abs(q.lat) < 2 && o.y > 0.3 && o.y < R3.TOP[c.type] + 0.6;
          if (on) { onCarTicks++; if (o.rest || Math.abs(o.vy) < 0.5) rodeVel = r3([o.vx, o.vz]); }
          if (R3.inCar(o.x, o.y - 0.16, o.z, 0.32, 0.16, 0.03).length) insideCar++;
          if (o.x < 0 || o.x > 120 || o.z < 0 || o.z > 160 || o.y < 0 || o.y > 90) out++;
          maxSpeed = Math.max(maxSpeed, Math.hypot(o.vx, o.vy, o.vz));
          G.step(DT);
        }
        E.grenades.push({ car: R3.cars()[idx].type, lead, burstAt: last && r3(last), ticksOnCar: onCarTicks, velWhileOnCar: rodeVel, carVel: R3.cars()[idx].vel, ticksInsideCarBox: insideCar, ticksOutsideRoom: out, blastLog: G.shotLog.filter((e) => e.weapon === 'grenade').slice(-3).map((e) => e.hit + ':' + e.damage), selfDmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
        G.step(0.5);
      }
      // grenade burst next to a player riding a deck: self damage only (no train damage, no rescue)
      reset(); G.give('grenade'); R3.waitCarAt(2, 6); { const c = R3.cars()[2]; const [x, z] = world(c, -3.75, 0); G.teleport(x, 3, z, c.yaw, -1.5); G.step(1); G.setInput({ grenade: true }); G.step(DT); G.setInput({ grenade: false }); G.step(2.5); const p = st().player; E.burstOnDeckWithPlayer = { dmg: G.damageLog.map((d) => d.cause + ' ' + d.amount.toFixed(1)), riding: st().riding, pos: r3([p.x, p.y, p.z]), trainRescues: G.trainRescueLog.length }; }
      out.E = E;
    }
    return out;
  }, SECT);
  if (out.A) { const A = out.A; console.log(`A. lap ${A.lap} s, length ${A.length}, speed ${A.speed} | max |s - (s0 + 4t)| over 2 laps: ${A.maxErr.toExponential(2)} | 1 s step vs 60 ticks: ${JSON.stringify(A.bigVsSmallStep)} | trainAt vs live: ${A.trainAtVsLive.toExponential(2)} | after interference ${JSON.stringify(A.afterInterference)}`); console.log('   whistles:', JSON.stringify(A.whistles)); }
  if (out.B) console.log('B. trainClearance():', JSON.stringify(out.B.trainClearance), '| my envelope check, static solids inside the swept envelope (y 0.25..6):', JSON.stringify(out.B.myEnvelopeHits));
  if (out.C) { console.log('C. riding:'); for (const r of out.C) console.log('   ', JSON.stringify(r)); }
  if (out.D) { console.log('D. tunnel:'); for (const r of out.D) console.log('   ', JSON.stringify(r)); }
  if (out.E) { console.log('E. shots:'); for (const r of out.E.shots) console.log('   ', JSON.stringify(r)); console.log('   raycast boxcar', JSON.stringify(out.E.raycastBoxcar)); console.log('E. grenades:'); for (const r of out.E.grenades) console.log('   ', JSON.stringify(r)); console.log('   burst on deck with player', JSON.stringify(out.E.burstOnDeckWithPlayer)); }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
