// Round 3A check 1b: the train pushing the player. P: points on the track (straights, curves, tunnel) x lateral offsets
// x inputs (idle, toward, away, across, sprint, jump, crouch, crouch-walk). W: wedging, every spot where a static solid
// sits within 1.5 of the envelope edge, player standing and crouched, idle and pushing into the object.
// Each run: wait for the engine, teleport the player in front of it, run until the caboose has passed. Records damage,
// rescues (room and train), ticks overlapping a car box by more than 5 cm (my own box test), ticks inside a static
// solid, leaving the room, and which side the player ends on. Usage: node bug_r3a_02_push.cjs <P|W> [part k of n, "0/1"]
const { boot } = require('./bug_r3a_lib.cjs');
const MODE = process.argv[2] || 'P', PART = (process.argv[3] || '0/1').split('/').map(Number);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ MODE, PART }) => {
    const G = __game, DT = 1 / 60, L = R3.L;
    const st = () => G.state();
    const r3 = (a) => a.map((v) => +(+v).toFixed(2));
    // track frame at a world point: nearest track s, tangent yaw, signed lateral (+ = right of travel)
    const frame = (x, z) => { const s = G.trackS(x, z), p = R3.point(s); const lat = (x - p.x) * Math.cos(p.yaw) - (z - p.z) * Math.sin(p.yaw); return { s, p, lat }; };
    const atLat = (s, lat) => { const p = R3.point(s); return [p.x + lat * Math.cos(p.yaw), p.z - lat * Math.sin(p.yaw), p.yaw]; };
    const run = (x, z, yaw, input, crouch, label) => {
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0; G.trainRescueLog.length = 0;
      G.teleport(60, 0, 20); G.step(DT);
      const s0 = G.trackS(x, z);
      // wait (tick-limited) until the engine front is 9 units before the point
      for (let i = 0; i < 60 * 57; i++) { const d = (((s0 - st().train.cars[0].sFront) % L) + L) % L; if (d < 9.1 && d > 8.9 - 0.1) break; G.step(DT); }
      const f0 = frame(x, z);
      G.teleport(x, 0, z, yaw, 0); if (crouch) G.setInput({ crouch: true }); G.step(DT);
      const inp = Object.assign({}, input, crouch ? { crouch: true } : {});
      let overlap = 0, maxDepth = 0, solid = 0, outRoom = 0, ahead = 0, i = 0, firstPush = null;
      for (; i < 60 * 30; i++) {
        if (input.jump) G.setInput(Object.assign({}, inp, { jump: i % 30 < 2 })); else G.setInput(inp);
        G.step(DT);
        const p = st().player, h = p.crouching ? 1.2 : 1.8;
        const ic = R3.inCar(p.x, p.y, p.z, h); if (ic.length) { overlap++; maxDepth = Math.max(maxDepth, ...ic.map((k) => k.depth)); }
        if (T.solidAt(p.x, p.y, p.z, h, { lift: 0.3, eps: 0.05 }).length) solid++;
        if (p.x < 0.39 || p.x > 119.61 || p.z < 0.39 || p.z > 159.61) outRoom++;
        if (!firstPush && Math.hypot(p.vx, p.vz) > 6 && !input.sprint) firstPush = i;
        const tail = st().train.cars[4], dTail = (((tail.sFront - 12 - s0) % L) + L) % L;
        if (dTail > 3 && dTail < 40 && i > 120) break;           // caboose rear is 3 past the point
      }
      G.clearInput();
      const p = st().player, f1 = frame(p.x, p.z);
      return { label, start: r3([x, z]), startLat: +f0.lat.toFixed(2), crouch, endLat: +f1.lat.toFixed(2), sideFlip: Math.abs(f0.lat) > 0.3 && Math.sign(f0.lat) !== Math.sign(f1.lat) && Math.abs(f1.lat) < 10, pushedAhead: +(((f1.s - f0.s + L / 2) % L + L) % L - L / 2).toFixed(1), end: r3([p.x, p.y, p.z]), endInEnvelope: R3.inEnv(p.x, p.z), secs: +(i / 60).toFixed(1), overlapTicks: overlap, maxDepth: +maxDepth.toFixed(3), staticTicks: solid, outRoom, dmg: G.damageLog.map((d) => d.cause + ' ' + d.amount.toFixed(1)), rescues: G.rescueLog.length, trainRescues: G.trainRescueLog.map((r) => JSON.stringify(r).slice(0, 160)) };
    };
    const rows = [];
    if (MODE === 'P') {
      const inputs = { idle: {}, toward: { forward: true, face: 'toward' }, away: { forward: true, face: 'away' }, across: { forward: true, face: 'across' }, sprintToward: { forward: true, sprint: true, face: 'toward' }, jump: { jump: true, face: 'across' }, crouchIdle: { crouch: true }, crouchWalkAcross: { forward: true, crouch: true, face: 'across' } };
      const jobs = [];
      for (const s of [20, 45, 62, 82, 100, 114, 130, 142, 166, 182, 200]) for (const lat of [-1.6, -0.4, 0.4, 1.6]) for (const k of Object.keys(inputs)) jobs.push([s, lat, k]);
      for (let j = PART[0]; j < jobs.length; j += PART[1]) {
        const [s, lat, k] = jobs[j]; const [x, z, ty] = atLat(s, lat); const I = Object.assign({}, inputs[k]); const crouch = !!I.crouch; delete I.crouch;
        const yaw = I.face === 'toward' ? ty + Math.PI : I.face === 'away' ? ty : I.face === 'across' ? ty + (lat > 0 ? Math.PI / 2 : -Math.PI / 2) : ty + 1;
        delete I.face;
        rows.push(Object.assign({ s, input: k }, run(x, z, yaw, I, crouch, `s${s} lat${lat} ${k}`)));
      }
    } else {
      // W: candidate spots where a static solid (y range overlapping 0..1.8) is within 1.5 of the envelope edge
      const cand = new Map();
      for (let s = 0; s < L; s += 0.5) for (const side of [-1, 1]) {
        let dEdge = null;
        for (let d = 0.5; d <= 6; d += 0.05) { const [x, z] = atLat(s, side * d); if (!R3.inEnv(x, z)) { dEdge = d; break; } }
        if (dEdge === null) continue;
        for (let d = dEdge; d <= dEdge + 1.5; d += 0.05) {
          const [x, z] = atLat(s, side * d);
          const hit = T.solidAt(x, 0, z, 1.8, { eps: 0.38, lift: 0.05 });
          if (hit.length) { const id = hit[0], key = id + side + Math.floor(s / 3); if (!cand.has(key)) cand.set(key, { id, s, side, d, dEdge }); break; }
        }
      }
      const jobs = [];
      for (const c of cand.values()) for (const crouch of [false, true]) for (const mode of ['idle', 'intoObject', 'gap']) jobs.push([c, crouch, mode]);
      rows.push({ candidates: [...cand.values()].map((c) => `${c.id}@s${c.s} side${c.side} object at ${c.d.toFixed(2)}, envelope edge ${c.dEdge.toFixed(2)}`) });
      for (let j = PART[0]; j < jobs.length; j += PART[1]) {
        const [c, crouch, mode] = jobs[j];
        // 'idle'/'intoObject': stand inside the envelope 0.5 in from its edge, on the object's side, so the car pushes toward
        // the object; 'gap': stand outside the envelope in the gap against the object (should never be touched)
        const lat = mode === 'gap' ? Math.max(c.dEdge + 0.05, c.d - 0.42) : c.dEdge - 0.5;
        const [x, z, ty] = atLat(c.s, c.side * lat);
        const yaw = ty + (c.side > 0 ? -Math.PI / 2 : Math.PI / 2);   // face the object
        rows.push(Object.assign({ object: c.id, objectLat: +c.d.toFixed(2), envEdge: +c.dEdge.toFixed(2), mode }, run(x, z, yaw, mode === 'intoObject' ? { forward: true } : {}, crouch, `${c.id} ${mode}`)));
      }
    }
    return rows;
  }, { MODE, PART });
  let bad = 0;
  for (const r of out) {
    const flag = r.dmg && (r.dmg.length || r.rescues || r.trainRescues.length || r.maxDepth > 0.15 || r.staticTicks || r.outRoom || r.sideFlip);
    if (flag) bad++;
    console.log((flag ? '!! ' : r.dmg ? 'ok ' : '') + JSON.stringify(r));
  }
  console.log(`runs ${out.filter((r) => r.dmg).length}, flagged ${bad}`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
