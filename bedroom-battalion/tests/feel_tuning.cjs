// Live CONFIG trials (no file edits): stair camera smoothing, string climb speed, air control. Plus jump-up window and tunnel drop.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = FEEL.st, out = {}, C = G.CONFIG;
    // --- stair camera smoothing (camera eye rebuilt from feet y with the game's own rule: offset -= step, offset *= exp(-k dt))
    out.stairs = {};
    for (const k of [16, 12, 10, 8, 6]) { C.player.stepSmooth = k;
      for (const mode of ['sprint', 'walk']) {
        const run = FEEL.drive([26, 0, 144.5], [[26, 18, 113.8]], { sprint: mode === 'sprint' });
        const s = FEEL.seg(run.trace, (q) => q.y > 3 && q.y < 15);        // steady part of the bed book stairs
        // worst lag of the camera below the true eye, and time for it to settle after the top step
        let lag = 0; for (const q of run.trace) lag = Math.max(lag, q.y + 1.6 - q.eye);
        out.stairs['k=' + k + ' ' + mode] = { eyeVelMin: s.eyeVelMin, eyeVelMax: s.eyeVelMax, ripplePct: Math.round(100 * (s.eyeVelMax - s.eyeVelMin) / (2 * s.climbRate)), eyeVelStd: s.eyeVelStd, residualRms: s.eyeResidualRms, maxCameraLagBelowEye: +lag.toFixed(2) };
      } }
    C.player.stepSmooth = 16;
    // --- going DOWN stairs at sprint: do you stay glued or go airborne (hop) ?
    { const run = FEEL.drive([26, 18, 113], [[26, 0, 145, 1.5]], { sprint: true }); const mid = run.trace.filter((q) => q.y < 17 && q.y > 1);
      out.stairsDown = { time: run.time, airborneTicksPct: Math.round(100 * mid.filter((q) => !q.g).length / mid.length), hp: st().health, seg: FEEL.seg(run.trace, (q) => q.y > 3 && q.y < 15) }; }
    { const run = FEEL.drive([26, 18, 50], [[26, 0, 22, 1.5]], { sprint: true }); const mid = run.trace.filter((q) => q.y < 17 && q.y > 1);
      out.blanketDown = { time: run.time, airborneTicksPct: Math.round(100 * mid.filter((q) => !q.g).length / mid.length), hp: st().health }; }
    { const run = FEEL.drive([89, 17, 72], [[89, 0, 48, 1.5]], { sprint: true }); const mid = run.trace.filter((q) => q.y < 16 && q.y > 1);
      out.skateDown = { time: run.time, airborneTicksPct: Math.round(100 * mid.filter((q) => !q.g).length / mid.length) }; }
    // --- whole-route stall check (any tick moving at < 50 % of sprint while not on a string), continuous aim
    const R = {
      desk_skate: [[84, 0, 48.5], [[89, 0, 48.5], [89, 17, 74.5], [94, 17, 76.5], [94, 26, 64.3], [97, 26, 64.3], [97.5, 26, 80]]],
      desk_skate_tight_turn: [[84, 0, 48.5], [[89, 0, 48.5], [91, 17, 73.4, 0.4], [94, 26, 64.3]]],
      desk_stairs: [[84, 0, 111.7], [[89, 0, 111.7], [89, 17, 85.5], [94, 17, 83.5], [94, 26, 95.7], [97, 26, 95.7], [97.5, 26, 80]]],
      desk_stairs_tight_turn: [[84, 0, 111.7], [[89, 0, 111.7], [91, 17, 86.6, 0.4], [94, 26, 95.7]]],
      bed_blanket_from_door: [[44.5, 0, 17], [[26, 0, 23.5], [26, 18, 47]]],
      bed_blanket_cut_corner: [[44.5, 0, 17], [[31.5, 0.3, 25.4, 0.4], [26, 18, 47]]],
      bed_books_from_door: [[44.5, 0, 143], [[26, 0, 144.5], [26, 18, 113.8]]],
      bed_books_cut_corner: [[44.5, 0, 143], [[29.5, 0.6, 141.5, 0.4], [26, 18, 113.8]]],
      small_stairs_from_door: [[75.5, 0, 17], [[105.7, 0, 7.5], [105.7, 20, 40], [110.5, 20, 40]]],
      tall_stairs_from_door: [[75.5, 0, 143], [[105.7, 0, 152.5], [105.7, 20, 120], [110.5, 20, 120]]],
    };
    out.routeStalls = {};
    for (const k in R) { const run = FEEL.drive(R[k][0], R[k][1], { sprint: true, maxT: 25 }); const slow = run.trace.filter((q) => !q.c && q.g && q.moved < 3.5).length;
      out.routeStalls[k] = { ok: run.ok, time: run.time, slowTicks: slow, slowSeconds: +(slow * T).toFixed(2), end: run.end, hp: st().health }; }
    // --- string climb speed
    out.stringSpeed = {};
    for (const v of [3.5, 4.5, 5.5, 7]) { C.climb.speed = v; const run = FEEL.drive([100, 0, 48], [[107, 0, 53.3], [107, 26, 57.5, 2.2]], { sprint: true }); out.stringSpeed['climb.speed=' + v] = { floorToDesk: run.time, onString26u: +(26 / v).toFixed(2), onString20u: +(20 / v).toFixed(2) }; }
    C.climb.speed = 3.5;
    // --- air control
    out.air = {};
    const EAST = -Math.PI / 2;
    for (const a of [0.25, 0.15, 0.1]) { C.move.airControl = a;
      const jump = (after) => { G.clearInput(); G.teleport(10, 0, 6, EAST, 0); G.step(0.2); G.setInput({ forward: true }); G.step(0.5); const x0 = st().x, z0 = st().z; G.setInput({ jump: true }); G.step(T); G.setInput(Object.assign({ jump: false, forward: false }, after)); let n = 1; while (!st().onGround && n < 200) { G.step(T); n++; } const p = st(); G.clearInput(); return { dx: +(p.x - x0).toFixed(2), dz: +(p.z - z0).toFixed(2), vx: +p.vx.toFixed(2) }; };
      const stand = () => { G.clearInput(); G.teleport(10, 0, 6, EAST, 0); G.step(0.2); const x0 = st().x; G.setInput({ jump: true }); G.step(T); G.setInput({ jump: false, forward: true }); let n = 1; while (!st().onGround && n < 200) { G.step(T); n++; } const p = st(); G.clearInput(); return { dx: +(p.x - x0).toFixed(2), vx: +p.vx.toFixed(2) }; };
      out.air['airControl=' + a] = { runJump_keepForward: jump({ forward: true }), runJump_release: jump({}), runJump_pullBack: jump({ back: true }), runJump_strafe: jump({ forward: true, right: true }), standingJump_thenForward: stand(), airAccel: +(a * 5 / C.move.groundAccelTime).toFixed(1) }; }
    C.move.airControl = 0.25;
    // --- jump-up window: run at the ruin platform (top 1.2, west face x = 57) from the west at z = 80 over the 1.2 sill? use the brick-free north face: platform z0 = 77, approach from north at x = 60
    out.jumpUp = {};
    for (const mode of ['walk', 'sprint']) { const ok = []; for (let d = 0.6; d <= 4.01; d += 0.2) {
        G.clearInput(); G.teleport(60, 0, 74.2, Math.PI, 0); G.step(T); G.setInput({ forward: true, sprint: mode === 'sprint' });
        let jumped = false, n = 0; while (n < 200) { const p = st(); if (!jumped && 77 - 0.4 - p.z <= d) { G.setInput({ jump: true }); jumped = true; } G.step(T); n++; if (jumped && n > 2) G.setInput({ jump: false }); if (jumped && st().onGround && n > 5) break; }
        G.step(0.3); if (st().y > 1.1) ok.push(+d.toFixed(1)); }
      out.jumpUp['platform1.2_' + mode + '_jumpDistancesThatLand'] = ok; }
    // start is 2.4 from the face, so also the standing case: stand touching the face, jump + forward
    G.clearInput(); G.teleport(60, 0, 76.55, Math.PI, 0); G.step(T); G.setInput({ forward: true, jump: true }); G.step(T); G.setInput({ jump: false }); G.step(1.2); out.jumpUp.standingAgainstFace = st().y > 1.1;
    // --- tunnel drop at each speed
    out.tunnelDrop = {};
    for (const mode of ['sprint', 'walk', 'crouch']) { G.clearInput(); G.teleport(60, 0, 20); G.step(T); const before = G.damageLog.length; G.teleport(90, 17, 80); G.step(T); G.lookAt(70, 18.6, 80);
      G.setInput({ forward: true, sprint: mode === 'sprint', crouch: mode === 'crouch' }); let n = 0; while (n < 600) { G.step(T); n++; const p = st(); if (p.onGround && p.y < 16) break; }
      const p = st(); out.tunnelDrop[mode] = { landedAt: [+p.x.toFixed(1), +p.y.toFixed(1)], onTunnelRoof: Math.abs(p.y - 8) < 0.1, damage: G.damageLog.slice(before).map((d) => Math.round(d.amount)) }; G.clearInput(); }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
