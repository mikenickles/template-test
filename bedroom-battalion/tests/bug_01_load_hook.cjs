// Check 1: loads clean, __game.ready, every hook member in DESIGN.md section 11 exists and behaves.
const { launch } = require('./harness.cjs');

(async () => {
  const { browser, page, errors, blocked } = await launch({ width: 640, height: 360 });
  const out = {};
  out.ready = await page.evaluate(() => window.__game.ready);
  out.titleVisibleBeforeStart = await page.evaluate(() => getComputedStyle(document.getElementById('title')).display);
  out.phaseBefore = await page.evaluate(() => __game.state().phase);

  // members
  out.members = await page.evaluate(() => {
    const want = ['ready', 'start', 'state', 'teleport', 'look', 'lookAt', 'setInput', 'clearInput', 'step', 'render', 'setView', 'clearView',
      'setDebug', 'colliders', 'waypoints', 'routes', 'walkPath', 'validateWaypoints', 'spawnBot', 'skipRound', 'setTimeScale', 'damageLog'];
    const o = {};
    for (const k of want) o[k] = typeof __game[k];
    return o;
  });

  out.start = await page.evaluate(() => __game.start({ pointerLock: false }));
  out.afterStart = await page.evaluate(() => ({ phase: __game.state().phase, title: getComputedStyle(document.getElementById('title')).display }));
  out.setTimeScale0 = await page.evaluate(() => __game.setTimeScale(0));

  // state shape
  out.state = await page.evaluate(() => __game.state());
  out.stateKeys = await page.evaluate(() => {
    const s = __game.state();
    const need = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'onGround', 'crouching', 'climbing', 'health', 'surface'];
    return { top: Object.keys(s), missingPlayer: need.filter((k) => !(k in s.player)) };
  });

  // timeScale 0 really freezes the real-time loop
  const t0 = await page.evaluate(() => __game.state().time);
  await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => __game.state().time);
  out.frozenAtScale0 = { t0, t1 };

  // step advances exactly
  out.step = await page.evaluate(() => { const a = __game.state().time; const n = __game.step(1); return { n, dt: +(__game.state().time - a).toFixed(4) }; });
  out.stepHalfTick = await page.evaluate(() => { const a = __game.state().time; const n = __game.step(0.004); return { n, dt: +(__game.state().time - a).toFixed(4) }; });

  // teleport zeroes velocity, sets yaw/pitch
  out.teleport = await page.evaluate(() => {
    __game.teleport(60, 0, 40, 0, 0); __game.setInput({ forward: true }); __game.step(0.5);
    const moving = __game.state().player;
    __game.clearInput();
    __game.teleport(30, 0, 30, 1.0, 0.3);
    const p = __game.state().player;
    return { movingVz: moving.vz, after: [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.yaw, p.pitch, p.onGround] };
  });
  // teleport in mid-air: falls
  out.teleportAir = await page.evaluate(() => { __game.teleport(60, 5, 40); const a = __game.state().player.onGround; __game.step(1.5); const p = __game.state().player; return { onGroundAtPlace: a, after: [p.x, p.y, p.z, p.onGround] }; });

  // look / lookAt conventions: yaw 0 faces north (-z), positive turns left (west). pitch positive up.
  out.look = await page.evaluate(() => {
    const r = {};
    const walk = (yaw) => { __game.teleport(60, 0, 40); __game.look(yaw, 0); __game.setInput({ forward: true }); __game.step(1); __game.clearInput(); const p = __game.state().player; return [+(p.x - 60).toFixed(2), +(p.z - 40).toFixed(2)]; };
    r.yaw0 = walk(0); r.yawHalfPi = walk(Math.PI / 2); r.yawPi = walk(Math.PI); r.yawNegHalfPi = walk(-Math.PI / 2);
    __game.teleport(60, 0, 40); __game.lookAt(70, 1.6, 40); r.lookAtEast = [__game.state().player.yaw, __game.state().player.pitch];
    __game.lookAt(60, 11.6, 30); r.lookAtUpNorth = [__game.state().player.yaw, __game.state().player.pitch];
    __game.look(0, 5); r.pitchClampUp = __game.state().player.pitch;
    __game.look(0, -5); r.pitchClampDown = __game.state().player.pitch;
    __game.look(7, 0); r.yawWrap = __game.state().player.yaw;
    return r;
  });

  // setInput keys: each one alone
  out.inputs = await page.evaluate(() => {
    const r = {};
    const run = (inp, secs = 1) => { __game.teleport(60, 0, 40); __game.look(0, 0); __game.clearInput(); __game.setInput(inp); __game.step(secs); const p = __game.state().player; const o = [+(p.x - 60).toFixed(2), +p.y.toFixed(2), +(p.z - 40).toFixed(2), +Math.hypot(p.vx, p.vz).toFixed(2), p.crouching]; __game.clearInput(); __game.step(0.5); return o; };
    r.forward = run({ forward: true }); r.back = run({ back: true }); r.left = run({ left: true }); r.right = run({ right: true });
    r.sprintFwd = run({ forward: true, sprint: true }); r.sprintBack = run({ back: true, sprint: true }); r.sprintStrafe = run({ right: true, sprint: true });
    r.crouchFwd = run({ forward: true, crouch: true }); r.diag = run({ forward: true, right: true });
    r.jump = run({ jump: true }, 0.35);
    // held input persists across steps, clearInput releases
    __game.teleport(60, 0, 40); __game.look(0, 0); __game.setInput({ forward: true }); __game.step(0.5); __game.step(0.5); const a = __game.state().player.z; __game.clearInput(); __game.step(0.5); const b = __game.state().player.z; __game.step(0.5); const c = __game.state().player.z;
    r.heldThenCleared = [a, b, c];
    // partial setInput leaves other keys alone
    __game.setInput({ forward: true }); __game.setInput({ sprint: true }); __game.step(0.5); r.partial = Math.hypot(__game.state().player.vx, __game.state().player.vz); __game.clearInput();
    return r;
  });

  // jump apex
  out.jumpApex = await page.evaluate(() => { __game.teleport(60, 0, 40); __game.clearInput(); __game.step(0.2); __game.setInput({ jump: true }); let m = 0, air = 0; for (let i = 0; i < 120; i++) { __game.step(1 / 60); const p = __game.state().player; m = Math.max(m, p.y); if (!p.onGround) air++; } __game.clearInput(); return { apex: m, airTicks: air }; });

  // views
  out.views = await page.evaluate(() => {
    const names = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
    const r = {};
    for (const n of names) { r[n] = __game.setView(n); __game.render(); }
    r.bogus = __game.setView('nope');
    r.clear = __game.clearView();
    __game.render();
    return r;
  });
  out.render = await page.evaluate(() => { __game.render(); const s = __game.state(); return { drawCalls: s.drawCalls, triangles: s.triangles, fps: s.fps }; });

  // debug
  out.debug = await page.evaluate(() => { const a = __game.setDebug(true); __game.render(); const d1 = getComputedStyle(document.getElementById('debug')).display; const txt = document.getElementById('debug').textContent; const b = __game.setDebug(false); __game.render(); const d2 = getComputedStyle(document.getElementById('debug')).display; return { a, d1, b, d2, txt }; });

  // colliders / waypoints / routes
  out.colliders = await page.evaluate(() => {
    const kinds = {}, surf = {}, bad = [], ids = new Set(), dup = [];
    for (const c of __game.colliders) {
      kinds[c.kind] = (kinds[c.kind] || 0) + 1; surf[c.surface] = (surf[c.surface] || 0) + 1;
      if (!c.id || !c.kind || !c.surface || !c.bounds) bad.push(c.id || '?');
      if (ids.has(c.id)) dup.push(c.id); ids.add(c.id);
    }
    return { n: __game.colliders.length, kinds, surf, bad, dup };
  });
  out.waypoints = await page.evaluate(() => ({ nodes: Object.keys(__game.waypoints.nodes).length, edges: __game.waypoints.edges.length, kinds: __game.waypoints.edges.reduce((o, e) => (o[e.kind] = (o[e.kind] || 0) + 1, o), {}), sample: __game.waypoints.edges[0] }));
  out.routes = await page.evaluate(() => {
    const want = ['bed_blanket', 'bed_books', 'bed_spring', 'desk_skate', 'desk_stairs', 'desk_yoyo', 'desk_lace', 'tall_stairs', 'tall_bridge', 'tall_L2_a', 'tall_L2_b', 'tall_L3_a', 'tall_L3_b', 'small_stairs', 'small_bridge', 'small_L2_a', 'small_L2_b', 'tunnel_drop'];
    return { have: Object.keys(__game.routes), missing: want.filter((k) => !__game.routes[k]), unknownNodes: Object.entries(__game.routes).flatMap(([k, v]) => v.filter((n) => !__game.waypoints.nodes[n]).map((n) => k + ':' + n)) };
  });
  out.validateWaypoints = await page.evaluate(() => __game.validateWaypoints());
  out.stubs = await page.evaluate(() => ({ spawnBot: __game.spawnBot(), skipRound: __game.skipRound(), ts2: __game.setTimeScale(2), ts0: __game.setTimeScale(0) }));
  out.damageLog = await page.evaluate(() => ({ isArray: Array.isArray(__game.damageLog), len: __game.damageLog.length }));
  out.walkPathBad = await page.evaluate(() => [__game.walkPath(['nope']), __game.walkPath([])]);

  // timeScale > 0 runs real time: about scale x real seconds
  out.realtime = await page.evaluate(async () => {
    __game.teleport(60, 0, 40); __game.clearInput();
    const res = {};
    for (const s of [1, 2]) { __game.setTimeScale(s); const a = __game.state().time, w = performance.now(); await new Promise((r) => setTimeout(r, 1500)); res['scale' + s] = +((__game.state().time - a) / ((performance.now() - w) / 1000)).toFixed(2); }
    __game.setTimeScale(0);
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(errors));
  console.log('BLOCKED', JSON.stringify(blocked));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
