// Builder checks for round 1 pass 2 (FIXLIST items 1 to 5).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = {};
  // ---- item 1: every string, hold forward for 12 s: must end standing on the top surface ----
  out.strings = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {}, W = Math.PI / 2;
    const run = (label, x, y, z, yaw, secs = 12) => { g.clearInput(); g.teleport(x, y, z, yaw, 0); g.setInput({ forward: true }); g.step(secs); const p = P(); g.clearInput();
      r[label] = { climbing: p.climbing, onGround: p.onGround, pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], hp: p.health }; };
    run('BUGS1 repro tall_L2_a', 110.5, 20, 130, W);
    run('tall_L2_b', 110.5, 20, 146, W); run('tall_L3_a', 110.5, 40, 136, W); run('tall_L3_b', 110.5, 40, 152, W);
    run('small_L2_a', 110.5, 20, 30, W); run('small_L2_b', 110.5, 20, 14, W);
    run('yoyo from under the desk', 107, 0, 58, 0); run('yoyo from the north', 107, 0, 51, Math.PI); run('yoyo from the west', 104, 0, 54.5, -W);
    run('lace from under the desk', 107, 0, 102, Math.PI); run('lace from the south', 107, 0, 109, 0);
    // after topping out with forward held: release, press forward again (walks back into the string from the top: allowed grab-from-top)
    g.clearInput(); g.teleport(110.5, 20, 130, W, 0); g.setInput({ forward: true }); g.step(12); const a = P();
    g.clearInput(); g.step(0.1); g.look(-W, 0); g.setInput({ forward: true }); g.step(0.6); const b = P(); g.clearInput();
    r.thenTurnEastAndWalk = { before: [+a.x.toFixed(2), a.y, +a.z.toFixed(2)], after: [+b.x.toFixed(2), b.y, +b.z.toFixed(2)], climbing: b.climbing };
    // still usable downward: walk into the string from the top surface, S descends
    g.clearInput(); g.teleport(110.5, 40, 130, W, 0); g.setInput({ forward: true }); g.step(1.5); const c = P();
    g.clearInput(); g.setInput({ back: true }); g.step(6); const d = P(); g.clearInput();
    r.downFromTop = { grabbed: c.climbing, end: [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)], climbing: d.climbing, onGround: d.onGround };
    return r;
  });
  // ---- item 1: no extra jump after letting go ----
  out.airJump = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, res = [];
    for (const gap of [0, 1, 2, 3, 4, 5]) {
      g.clearInput(); g.teleport(107, 0, 52, Math.PI, 0); g.step(0.2); g.setInput({ forward: true }); g.step(2);
      const y0 = P().y; g.clearInput(); g.setInput({ jump: true }); g.step(1 / 60); g.setInput({ jump: false });
      for (let i = 0; i < gap; i++) g.step(1 / 60);
      g.setInput({ jump: true }); g.step(1 / 60); const vy = P().vy; g.setInput({ jump: false });
      let maxY = P().y; for (let i = 0; i < 200 && !P().onGround; i++) { g.step(1 / 60); maxY = Math.max(maxY, P().y); }
      res.push({ gap, releaseY: +y0.toFixed(2), vyAfterSecondPress: +vy.toFixed(2), maxYAfter: +maxY.toFixed(2) });
      g.teleport(60, 0, 20);
    }
    return res;
  });
  // ---- item 2: the three BUGS 2 repro calls, plus edge scans ----
  out.deadStop = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    const run = (x, z, yaw, secs, input) => { g.clearInput(); g.teleport(60, 0, 20); const n = g.damageLog.length; g.teleport(x, 0, z, yaw, 0); g.setInput(input || { forward: true }); g.step(secs); const p = P(); g.clearInput();
      return { pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], onGround: p.onGround, dmg: g.damageLog.slice(n).map((d) => +d.amount.toFixed(1)) }; };
    r.tallStairs = run(107.9, 154, 0, 8);
    r.smallStairs = run(107.9, 6, Math.PI, 9);
    r.skateTopEast = run(92.3, 47, Math.PI, 9);
    const scan = (label, xs, z, yaw, secs, topY, input) => { r[label] = xs.map((x) => { const q = run(x, z, yaw, secs, input); return x.toFixed(2) + ':' + (q.pos[1] >= topY - 0.01 ? 'top' : 'y=' + q.pos[1] + (q.dmg.length ? ' dmg ' + q.dmg : '')); }).join('  '); };
    const xs = []; for (let x = 107.0; x <= 108.61; x += 0.1) xs.push(x);
    scan('tallScan walk', xs, 154, 0, 9, 20); scan('tallScan sprint', xs, 154, 0, 7, 20, { forward: true, sprint: true });
    scan('smallScan walk', xs, 6, Math.PI, 9, 20);
    const sk = []; for (let x = 91.4; x <= 92.41; x += 0.1) sk.push(x);
    scan('skateScan walk', sk, 47, Math.PI, 9, 17); scan('skateScan sprint', sk, 47, Math.PI, 7, 17, { forward: true, sprint: true });
    const cs = []; for (let x = 91.4; x <= 92.41; x += 0.1) cs.push(x);
    scan('chairStairsScan walk', cs, 113, 0, 9, 17); scan('chairStairsScan sprint', cs, 113, 0, 7, 17, { forward: true, sprint: true });
    // BUGS 3: from the stair foot, aim at the L1 node and hold W
    g.clearInput(); g.teleport(60, 0, 20); let n = g.damageLog.length; g.teleport(105.7, 0, 152.5); g.lookAt(110.5, 21.6, 120); g.setInput({ forward: true }); g.step(10); let p = P(); g.clearInput();
    r.aimAtL1FromFoot = { pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], dmg: g.damageLog.slice(n).map((d) => +d.amount.toFixed(1)) };
    return r;
  });
  // ---- item 3: live camera and fog ----
  out.live = await page.evaluate(() => {
    const g = __game, C = g.CONFIG, r = { fog: [C.fog.near, C.fog.far], fov: C.camera.fovVertical, hemi: [C.color.hemiSky, C.color.hemiGround, C.light.hemiIntensity], sun: C.light.sunIntensity, bed: C.color.bed };
    return r;
  });
  const px = async () => page.evaluate(() => { __game.render(); const c = document.getElementById('view'), gl = c.getContext('webgl2') || c.getContext('webgl'); const b = new Uint8Array(4);
    const at = (fx, fy) => { gl.readPixels(Math.floor(c.width * fx), Math.floor(c.height * (1 - fy)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]]; };
    return { farWall: at(0.5, 0.2), nearWall: at(0.03, 0.2), ceiling: at(0.5, 0.03) }; });
  await page.evaluate(() => { __game.teleport(60, 0, 28, Math.PI, 0); __game.setView('spawn_green'); });
  out.liveBefore = await px();
  await page.evaluate(() => { __game.CONFIG.fog.near = 1; __game.CONFIG.fog.far = 60; __game.CONFIG.camera.fovVertical = 40; });
  out.liveAfterFogAndFov = await px();
  out.cameraFovApplied = await page.evaluate(() => 0 + 0);   // placeholder to keep ordering
  await page.evaluate(() => { __game.CONFIG.fog.near = 10; __game.CONFIG.fog.far = 220; __game.CONFIG.camera.fovVertical = 75; __game.render(); });
  out.liveRestored = await px();
  await page.waitForTimeout(400);
  out.shot = await shot('round1/builder_p2_spawn_green.png');
  for (const v of ['bed_top', 'shelf_top', 'east_lane']) { await page.evaluate((n) => { __game.setView(n); __game.render(); }, v); await page.waitForTimeout(400); await shot('round1/builder_p2_' + v + '.png'); }
  // gate-level view down the room to judge haze: eye at the gate, clear line to the far wall along x = 60 is blocked by the ruin, so use x = 48
  await page.evaluate(() => { __game.clearView(); __game.teleport(48, 0, 30, Math.PI, 0.1); __game.render(); }); await page.waitForTimeout(400); await shot('round1/builder_p2_lane_x48.png');
  // ---- item 4 numbers ----
  out.tuning = await page.evaluate(() => {
    const g = __game, r = { climbSpeed: g.CONFIG.climb.speed, airControl: g.CONFIG.move.airControl };
    const path = (ids) => { g.clearInput(); g.teleport(60, 0, 20); const q = g.walkPath(ids, { sprint: true }); return [q.ok, q.time]; };
    r.spawnToDeskByYoyo = path(['n.f.spawn', 'n.f.ine', 'n.f.edoor', 'n.e.1', 'n.e.2', 'n.e.4', 'n.yy.foot', 'n.desk.n']);
    r.spawnToDeskBySmallStairsBridge = path(['n.f.spawn', 'n.f.ine', 'n.f.edoor', 'n.e.1', 'n.e.2', 'n.ss.app', 'n.ss.foot', 'n.ss.top', 'n.ss1.a', 'n.ss1.s', 'n.desk.br', 'n.desk.n']);
    r.spawnToDeskBySkate = path(['n.f.spawn', 'n.f.ine', 'n.f.edoor', 'n.e.1', 'n.e.2', 'n.e.3w', 'n.e.3', 'n.seat', 'n.rul.foot', 'n.rul.top', 'n.desk.w']);
    r.shelfString = path(['s.ts1.b', 's.ts2.b']);
    return r;
  });
  // ---- item 5 ----
  out.cover = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, ids = ['n.W-c', 's.W-c', 'n.E-c', 'n.C-a.crayon1', 's.C-a.crayon2', 's.tall.guard', 'n.small.guard', 'chair.stopper.n', 'chair.stopper.s'];
    const r = { colliders: ids.map((id) => { const c = g.colliders.find((k) => k.id === id); return c ? id + ' ' + JSON.stringify(c.kind === 'cyl' ? [c.x, c.z, c.r, c.y0, c.y1] : [c.x0, c.x1, c.z0, c.z1, c.y0, c.y1]) : id + ' MISSING'; }) };
    r.blocked = g.validateWaypoints();
    r.edgeCount = g.waypoints.edges.length;
    g.clearInput(); g.teleport(54, 0, 28, Math.PI, 0); g.setInput({ forward: true }); g.step(1); r.crayonBlocksWalkAtZ = +P().z.toFixed(2);
    g.setInput({ forward: true, jump: true }); g.step(1 / 60); g.setInput({ forward: true, jump: false }); g.step(1.5); r.crayonJumpOver = [+P().y.toFixed(2), +P().z.toFixed(2)]; g.clearInput();
    return r;
  });
  out.routes = await page.evaluate(() => {
    const r = {};
    for (const id of Object.keys(__game.routes)) { const row = [];
      for (const sprint of [false, true]) { __game.clearInput(); __game.teleport(60, 0, 20); const h = __game.state().player.health; const q = __game.walkPath(__game.routes[id], { sprint }); const p = __game.state().player; row.push(q.ok, q.time, +p.y.toFixed(2), p.health - h); }
      r[id] = row; }
    return r;
  });
  out.edges = await page.evaluate(() => {
    const g = __game, fails = []; let n = 0;
    for (const e of g.waypoints.edges) for (const dir of e.oneWay ? [[e.a, e.b]] : [[e.a, e.b], [e.b, e.a]]) {
      g.clearInput(); g.teleport(60, 0, 20); n++;
      const h0 = g.state().player.health, res = g.walkPath(dir, { timeout: 40 }), p = g.state().player, B = g.waypoints.nodes[dir[1]];
      if (!res.ok || (dir[1] !== 'm.pad' && Math.abs(p.y - B[1]) > 0.75) || p.health < h0) fails.push({ edge: dir.join(' > '), kind: e.kind, ok: res.ok, pos: res.pos, hp: p.health });
    }
    return { walked: n, fails };
  });
  out.state = await page.evaluate(() => { const s = __game.state(); return { drawCalls: s.drawCalls, triangles: s.triangles }; });
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
