// Round 3 soldiers: pose frame sequences (walk, climb, ride from the nav test; aim, crouch and tip-over from a match),
// feet against the ground (floating / sinking), body and gun inside static colliders (clipping), bodies staying put,
// riders' feet against the deck, and chevrons (over living teammates only, within 60 units, only with line of sight).
const { open, dE, hex } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  await p.evaluate(() => {
    const R = window.__r3; R.frames = {};
    R.grabFollow = (key, pos, side) => { const e = [pos[0] + side[0], pos[1] + side[1], pos[2] + side[2]]; R.cam(e, [pos[0], pos[1] + 0.8, pos[2]]); __game.render(); (R.frames[key] = R.frames[key] || []).push(R.copy()); };
    // static colliders as AABBs (train cars excluded: they move)
    R.cols = __game.colliders.filter((c) => c.x0 !== undefined && !/train/.test(c.id));
    R.inside = (x, y, z, r) => { for (const c of R.cols) { if (y < c.y0 || y > c.y1) continue; const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1); if (Math.hypot(dx, dz) < r - 0.12) return c.id; } return null; };
  });
  // ---------- nav test: walk, climb, ride; ground contact and clipping for every bot every 3rd tick ----------
  const nav = await p.evaluate(() => {
    const R = window.__r3; __game.startNavTest({ bots: 10, seed: 4 }); const st = { ticks: 0, grounded: 0, float: [], sink: [], bodyClip: {}, gunClip: 0, gunChecks: 0, ride: { n: 0, worst: 0, types: {} }, got: {} };
    const prevY = {}; const top = { flatbed: [1.2, 4.2], gondola: [1.2], engine: [5, 6], boxcar: [5], caboose: [5] };
    for (let i = 0; i < 60 * 180 && !(st.got.walk >= 8 && st.got.climb >= 8 && st.got.ride >= 8 && i > 60 * 100); i++) {
      __game.step(1 / 60); if (i % 6) continue; __game.render(); const s = __game.state();      // soldier matrices are written at render time
      for (const b of s.bots) {
        const k = R.slotOf(b.pos); if (k < 0) continue;
        const py = prevY[b.id]; prevY[b.id] = b.pos[1];
        if (b.riding) { st.ride.n++; st.ride.types[b.riding] = (st.ride.types[b.riding] || 0) + 1; const dy = Math.min(...top[b.riding].map((t) => Math.abs(b.pos[1] - t))); st.ride.worst = Math.max(st.ride.worst, +dy.toFixed(3));
          if ((st.got.ride || 0) < 8 && i % 18 === 0) { R.grabFollow('ride', b.pos, [-5, 2.5, -3]); st.got.ride = (st.got.ride || 0) + 1; } }
        if (b.climbing && (st.got.climb || 0) < 8 && i % 12 === 0 && (!st.climbId || st.climbId === b.id)) { st.climbId = b.id; R.grabFollow('climb', b.pos, [-3.5, 0.8, 0]); st.got.climb = (st.got.climb || 0) + 1; }
        if (!b.climbing && !b.riding && py !== undefined && Math.abs(py - b.pos[1]) < 1e-4) {
          st.grounded++; const rc = __game.raycast([b.pos[0], b.pos[1] + 0.5, b.pos[2]], [0, -1, 0]); const gap = rc ? +(rc.distance - 0.5).toFixed(3) : null;
          if (gap !== null && gap > 0.05) st.float.push([b.id, b.pos.map((v) => +v.toFixed(2)), gap, rc.id]); if (gap !== null && gap < -0.05) st.sink.push([b.id, b.pos.map((v) => +v.toFixed(2)), gap, rc.id]);
          if (b.pos[1] < 0.01 && (st.got.walk || 0) < 8 && i % 12 === 0 && (!st.walkId || st.walkId === b.id) && b.edgeKind === 'walk') { st.walkId = b.id; R.grabFollow('walk', b.pos, [3.2, 0.6, 1.2]); st.got.walk = (st.got.walk || 0) + 1; }
        }
        const body = R.part(k, 1), gun = R.part(k, 3); const c1 = R.inside(body.x, body.y, body.z, 0.4); if (c1) st.bodyClip[c1] = (st.bodyClip[c1] || 0) + 1;
        st.gunChecks++; if (R.inside(gun.x, gun.y, gun.z, 0.12)) st.gunClip++;
      }
      st.ticks++;
    }
    __game.stopNavTest(); __game.removeBots(); st.floatN = st.float.length; st.sinkN = st.sink.length; st.float = st.float.slice(0, 6); st.sink = st.sink.slice(0, 6);
    st.navStats = (() => { const n = __game.navStats(); return { rides: n.rides, crossings: n.crossings, stuck: n.stuck, rescues: n.rescues }; })();
    return st; });
  console.log('nav test', JSON.stringify(nav));
  // ---------- match: aim, crouch, tip-over, bodies staying put, chevrons ----------
  const m = await p.evaluate(() => {
    const R = window.__r3; __game.startMatch({ difficulty: 'regular', seed: 9 }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(5.5);
    const st = { chev: { checks: 0, shown: 0, shownNoLos: 0, shownFar: 0, hiddenWithLos: 0, onTan: 0, examples: [] }, got: {}, bodies: {}, bodyMoves: [], tip: null };
    const camPos = () => { const s = __game.state().player; return [s.x, s.y + 1.6, s.z]; };
    for (let i = 0; i < 60 * 150; i++) {
      __game.step(1 / 60); const s = __game.state(); if (s.match.phase !== 'live') { if (s.match.phase === 'roundEnd' || s.match.phase === 'matchEnd') break; continue; }
      if (i % 12 === 0) { __game.render(); const e = camPos();
        for (const b of s.bots) { const sl = R.slotOf(b.pos); if (sl < 0 || sl > 9) continue; const m4 = window.__m4 || (window.__m4 = R.sold.matrix.clone()); R.chev.getMatrixAt(sl, m4); const shown = m4.elements[13] > -40;
          const head = [b.pos[0], b.pos[1] + 1.6, b.pos[2]], dv = [head[0] - e[0], head[1] - e[1], head[2] - e[2]], L = Math.hypot(...dv), rc = __game.raycast(e, dv), los = !rc || rc.distance > L - 0.4 || /^bot/.test(rc.id);
          st.chev.checks++; if (shown) { st.chev.shown++; if (b.team === 'tan') st.chev.onTan++; if (b.dead) st.chev.onDead = (st.chev.onDead || 0) + 1; if (!los) { st.chev.shownNoLos++; if (st.chev.examples.length < 4) st.chev.examples.push([b.name, +L.toFixed(1), rc && rc.id]); } if (L > 60.5) st.chev.shownFar++; }
          else if (b.team === 'green' && !b.dead && los && L < 58) { st.chev.hiddenWithLos++; if ((st.chev.hidEx = st.chev.hidEx || []).length < 8) st.chev.hidEx.push([b.name, +L.toFixed(1), b.brainState, b.climbing, b.chevron, b.pos.map((v) => +v.toFixed(1))]); } }
      }
      // aim and crouch frames from bots doing it
      for (const b of s.bots) { if (b.dead) continue;
        if (b.brainState === 'engage' && !b.crouching && (st.got.aim || 0) < 1 && i % 30 === 0) { R.grabFollow('pose', b.pos, [Math.sin(b.yaw + 1.3) * 3, 0.4, Math.cos(b.yaw + 1.3) * 3]); st.got.aim = 1; st.aimInfo = [b.name, b.weapon]; }
        if (b.crouching && (st.got.crouch || 0) < 1 && i % 30 === 0) { R.grabFollow('pose', b.pos, [Math.sin(b.yaw + 1.3) * 3, 0.4, Math.cos(b.yaw + 1.3) * 3]); st.got.crouch = 1; st.crouchInfo = [b.name, b.brainState]; } }
      // bodies: record where each body is 0.5 s after death, then check every later tick
      for (const b of s.bots) { if (!b.dead) continue; const k = R.slotOf(b.pos); const base = k >= 0 ? R.part(k, 0) : null; if (!base) continue;
        st.deadSince = st.deadSince || {}; if (st.deadSince[b.id] === undefined) st.deadSince[b.id] = i; if (i - st.deadSince[b.id] < 60) continue;
        const B = st.bodies[b.id]; if (!B) st.bodies[b.id] = { t: i, pos: [base.x, base.y, base.z] }; else if (i - B.t > 30) { const d = Math.hypot(base.x - B.pos[0], base.y - B.pos[1], base.z - B.pos[2]); if (d > 0.05) st.bodyMoves.push([b.name, +d.toFixed(2), b.riding, b.pos.map((v) => +v.toFixed(1))]); B.pos = [base.x, base.y, base.z]; B.t = i; } }
      // tip-over sequence: kill the first living Tan bot in the open, 8 frames over 0.4 s
      if (!st.tip && i > 60 * 15) { const t = s.bots.find((b) => b.team === 'tan' && !b.dead && !b.climbing && b.pos[1] < 0.1);
        if (t) { const pos = t.pos.slice(); st.tip = { name: t.name }; __game.killBot(t.id); for (let f = 0; f < 8; f++) { R.grabFollow('tip', pos, [3.2, 0.7, 2.2]); __game.step(1 / 20); } } }
    }
    __game.clearView(); st.bodyMoves = st.bodyMoves.slice(0, 8); delete st.deadSince; st.bodiesTracked = Object.keys(st.bodies).length; delete st.bodies; return st; });
  console.log('match', JSON.stringify(m));
  for (const [key, crop, n] of [['walk', [440, 160, 400, 440], 8], ['climb', [440, 160, 400, 440], 8], ['ride', [340, 160, 600, 440], 4], ['tip', [440, 160, 400, 440], 8], ['pose', [440, 160, 400, 440], 2]]) {
    const url = await p.evaluate(([key, crop, n]) => { const F = (window.__r3.frames[key] || []).slice(0, n); return F.length ? window.__r3.sheet(F, crop, 0.6) : null; }, [key, crop, n]);
    if (url) h.save(`visual_soldier_${key}.png`, url); console.log('frames', key, url ? 'saved' : 'none');
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
