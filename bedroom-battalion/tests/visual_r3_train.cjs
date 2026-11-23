// Round 3 train look: whole consist from the floor and from above, car colours against what is behind them from the
// floor at 30, 60 and 100 units (is it readable as cover), z-fighting at couplings and trim (two renders with the eye
// moved 0.004, strongly changed pixels counted), wheels against the rails, the tunnel over a full lap (oriented car boxes
// against the tunnel colliders), and riders on decks (feet height vs deck height, sampled every tick of the ride).
// Free play (`start`), train pose is a function of game time; the camera is a custom named view.
const { open, dE, hex } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  // put the engine at the middle of the east straight heading south, by stepping time (train runs at 4 u/s)
  const at = (s) => p.evaluate((s) => { let k = 0; while (k++ < 4000) { const T = __game.state().train; const d = ((s - T.s) % T.length + T.length) % T.length; if (d < 0.05) break; __game.step(Math.min(10, Math.max(1 / 60, d / 4))); } return __game.state().train; }, s);
  const T0 = await p.evaluate(() => __game.state().train);
  console.log('track length', T0.length, 'lap s', T0.lap, 'cars', T0.cars.map((c) => c.type).join(' '));
  // the east straight runs z 52.5 -> 107.5 southbound; s = 0 at (43, 107.5). s of a point: find by trackPoint search
  const sOf = await p.evaluate(() => { const L = __game.state().train.length; const f = (x, z) => { let b = 0, bd = 1e9; for (let s = 0; s < L; s += 0.25) { const q = __game.trackPoint(s); const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; b = s; } } return b; };
    return { eastMid: f(77, 86), westMid: f(43, 80), northCurve: f(60, 35.5) }; });
  console.log('s of points', JSON.stringify(sOf));
  const frames = [];
  const shot = async (name, eye, tgt) => p.evaluate(([e, t]) => { window.__r3.cam(e, t); __game.render(); (window.__fr = window.__fr || []).push(window.__r3.copy()); return true; }, [eye, tgt]);
  // 1) the consist on the west straight seen from the floor at 14 units, and from above
  await at(sOf.westMid + 30);
  const cars = await p.evaluate(() => __game.state().train.cars);
  console.log('cars on west straight', JSON.stringify(cars.map((c) => [c.type, c.pos[0], c.pos[2], c.yaw])));
  await shot('side', [57, 1.6, 74], [43, 3, 74]);
  await shot('above', [62, 26, 50], [43, 2, 80]);
  await shot('far60', [100, 1.6, 85], [43, 3, 75]);
  await shot('far100', [104, 1.6, 140], [43, 3, 75]);
  // colours of each car body face from 30, 60, 100 units on the floor vs the pixels beside / above
  const read = await p.evaluate((cars) => { const R = window.__r3, out = [];
    for (const c of cars) for (const d of [30, 60, 100]) { const tgt = [c.pos[0], 2.6, c.pos[2]], e = [c.pos[0] + d * 0.94, 1.6, c.pos[2] + d * 0.34];
      if (e[0] > 119) { e[0] = 119; } const rc = __game.raycast(e, [tgt[0] - e[0], tgt[1] - e[1], tgt[2] - e[2]]); R.cam(e, tgt); __game.render();
      const H = 720, f = H / 2 / Math.tan(__game.CONFIG.camera.fovVertical * Math.PI / 360), L = Math.hypot(tgt[0] - e[0], tgt[2] - e[2]), up = Math.round(4.2 * f / L);
      out.push({ type: c.type, d, hit: rc && rc.id, body: R.rd(0, 0, 3), above: R.rd(0, up, 3) }); }
    return out; }, cars);
  for (const r of read) console.log('car', r.type.padEnd(8), r.d + 'u', 'first hit', String(r.hit).padEnd(22), 'body', hex(r.body), 'above roof', hex(r.above), 'dE', dE(r.body, r.above));
  // 2) couplings and trim: jitter test at 5 units on each gap and the engine rear, gondola door posts
  const jit = await p.evaluate((cars) => { const R = window.__r3, out = [];
    const spots = []; for (let i = 0; i < cars.length - 1; i++) { const a = cars[i], b = cars[i + 1]; spots.push(['gap ' + a.type + '-' + b.type, [(a.pos[0] + b.pos[0]) / 2, 1.0, (a.pos[2] + b.pos[2]) / 2]]); }
    spots.push(['engine rear trim', [cars[0].pos[0], 3.9, cars[0].pos[2] + 6.2 * (cars[0].pos[2] < cars[1].pos[2] ? 1 : -1)]]);
    spots.push(['gondola door', [cars[3].pos[0], 1.8, cars[3].pos[2]]]);
    for (const [name, t] of spots) for (const side of [1]) {
      const e = [t[0] + 5 * side, t[1] + 0.8, t[2] + 1.2];
      const grab = (ee) => { R.cam(ee, t); __game.render(); return R.full(); };
      const A = grab(e), B = grab([e[0] + 0.004, e[1] + 0.003, e[2] + 0.004]); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 48) n++;
      R.cam(e, t); __game.render(); (window.__fr = window.__fr || []).push(R.copy()); out.push([name, n]); }
    return out; }, cars);
  console.log('jitter (strongly changed px between two renders 0.004 apart; edges give a few dozen, z-fighting gives hundreds):', JSON.stringify(jit));
  // also the rear of the engine looked at square-on from behind, where the trim is drawn on the body's face
  await p.evaluate((c) => { const dz = c[1].pos[2] > c[0].pos[2] ? 1 : -1; const t = [c[0].pos[0], 3.9, c[0].pos[2] + 6 * dz]; const R = window.__r3;
    const grab = (e) => { R.cam(e, t); __game.render(); return R.full(); }; const e = [t[0] + 2.2, 4.4, t[2] + 0.7 * dz];
    const A = grab(e), B = grab([e[0] + 0.004, e[1] + 0.003, e[2]]); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 48) n++; window.__engRear = n; }, cars);
  // 3) wheels on the rails: close-up at wheel height
  await shot('wheels', [cars[1].pos[0] + 3.2, 0.5, cars[1].pos[2] + 1.5], [cars[1].pos[0] + 1.6, 0.3, cars[1].pos[2] - 2]);
  // 4) tunnel: oriented car boxes against the tunnel walls and roof over one lap, 0.25 s steps
  const tun = await p.evaluate(() => { const C = __game.colliders.filter((c) => /^tunnel\./.test(c.id)), K = __game.CONFIG.train, hw = K.carWid / 2, hl = K.carLen / 2; let worst = { pen: -9 }, inside = 0;
    for (let t = 0; t < 60; t += 0.25) for (const car of __game.trainAt(__game.state().time + t)) {
      const top = car.type === 'engine' ? K.cab : (car.type === 'flatbed' ? K.deck + K.cargo : car.type === 'gondola' ? K.gondolaWall : K.roof), fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const corners = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]].map(([u, v]) => [car.x + u * fx + v * fz, car.z + u * fz - v * fx]);
      const x0 = Math.min(...corners.map((q) => q[0])), x1 = Math.max(...corners.map((q) => q[0])), z0 = Math.min(...corners.map((q) => q[1])), z1 = Math.max(...corners.map((q) => q[1]));
      if (z1 > 68 && z0 < 92 && x0 < 81.4 && x1 > 72.6) inside++;
      for (const c of C) { const px = Math.min(x1, c.x1) - Math.max(x0, c.x0), pz = Math.min(z1, c.z1) - Math.max(z0, c.z0), py = Math.min(top, c.y1) - Math.max(0, c.y0);
        const pen = Math.min(px, pz, py); if (pen > worst.pen) worst = { pen: +pen.toFixed(3), id: c.id, type: car.type, x: [x0, x1].map((v) => +v.toFixed(2)), top }; } }
    return { inside, worst }; });
  console.log('tunnel over a lap: car-in-tunnel samples', tun.inside, '| deepest overlap with a tunnel collider (negative = clearance):', JSON.stringify(tun.worst));
  await at(sOf.eastMid + 3);
  await shot('tunnel mouth', [77.5, 1.6, 56], [77, 3, 75]);
  await shot('tunnel side', [86, 4, 68], [77, 3.5, 80]);
  // 5) riders: a Green bot sent over the east ride edge; feet vs deck height every tick while riding
  const ride = await p.evaluate(() => {
    const id = __game.spawnBot('green', 'w.ride.e'); __game.botGoto(id, 's.c.y'); const out = { id, samples: 0, dev: [], types: {}, worst: 0, frames: 0 };
    const top = { flatbed: 1.2, gondola: 1.2, engine: 5, boxcar: 5, caboose: 5 }; let shot = false;
    for (let i = 0; i < 60 * 90; i++) { __game.step(1 / 60); const b = __game.state().bots.find((o) => o.id === id); if (!b) break;
      if (b.riding) { out.samples++; out.types[b.riding] = (out.types[b.riding] || 0) + 1; const cargoTop = 4.2;
        const dy = Math.min(Math.abs(b.pos[1] - top[b.riding]), b.riding === 'flatbed' ? Math.abs(b.pos[1] - cargoTop) : 9); out.worst = Math.max(out.worst, dy);
        if (!shot && out.samples === 90) { shot = true; window.__r3.cam([b.pos[0] - 7, b.pos[1] + 2.5, b.pos[2] + 3], [b.pos[0], b.pos[1] + 0.8, b.pos[2]]); __game.render(); (window.__fr = window.__fr || []).push(window.__r3.copy()); out.atShot = b.pos.map((v) => +v.toFixed(2)); } }
      else if (out.samples > 0 && i > 0 && !b.riding && out.samples > 30) { out.end = b.pos.map((v) => +v.toFixed(2)); break; } }
    __game.removeBots(); return out; });
  console.log('rider:', JSON.stringify(ride));
  const engRear = await p.evaluate(() => window.__engRear);
  console.log('engine rear trim square-on jitter px:', engRear);
  const url = await p.evaluate(() => window.__r3.sheet(window.__fr, [0, 0, 1280, 720], 0.4, 3));
  h.save('visual_train_sheet.png', url);
  console.log('sheet order: side, above, far60, far100, then jitter views', JSON.stringify(jit.map((j) => j[0])), ', wheels, tunnel mouth, tunnel side, rider');
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
