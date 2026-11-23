// Builder mechanics checks: movement numbers, crouch ceiling, fall damage, safety net, walls, every edge both ways.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = {};
  out.validatorSanity = await page.evaluate(() => {
    const N = __game.waypoints.nodes, keep = { a: N['s.ub.1'].slice(), b: N['s.ub.2'].slice(), c: N['m.plat'].slice() };
    N['s.ub.1'] = [19, 0, 110]; N['s.ub.2'] = [22, 0, 100];
    const bad = __game.validateWaypoints();
    N['s.ub.1'] = keep.a; N['s.ub.2'] = keep.b;
    return { withDesignPositions: bad, afterRestore: __game.validateWaypoints().length };
  });
  out.move = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    g.clearInput(); g.teleport(48, 0, 40, Math.PI, 0);
    g.setInput({ forward: true });
    let t = 0; while (Math.hypot(P().vx, P().vz) < 4.999 && t < 2) { g.step(1 / 60); t += 1 / 60; }
    r.timeToWalkSpeed = +t.toFixed(3);
    g.step(1); r.walkSpeed = +Math.hypot(P().vx, P().vz).toFixed(3);
    const z0 = P().z; g.clearInput(); t = 0; while (Math.hypot(P().vx, P().vz) > 0.001 && t < 2) { g.step(1 / 60); t += 1 / 60; }
    r.stopTime = +t.toFixed(3); r.stopDist = +(P().z - z0).toFixed(3);
    g.setInput({ forward: true, sprint: true }); g.step(1); r.sprintSpeed = +Math.hypot(P().vx, P().vz).toFixed(3);
    g.clearInput(); g.setInput({ back: true, sprint: true }); g.step(1); r.sprintBackSpeed = +Math.hypot(P().vx, P().vz).toFixed(3);
    g.clearInput(); g.setInput({ forward: true, crouch: true }); g.step(1); r.crouchSpeed = +Math.hypot(P().vx, P().vz).toFixed(3); r.crouching = P().crouching;
    g.clearInput(); g.step(0.5);
    g.teleport(48, 0, 40, Math.PI, 0); g.setInput({ jump: true }); let peak = 0, air = 0;
    for (let i = 0; i < 120; i++) { g.step(1 / 60); const p = P(); peak = Math.max(peak, p.y); if (!p.onGround) air++; }
    r.jumpApex = +peak.toFixed(3); r.jumpAirTime = +(air / 60).toFixed(3); g.clearInput();
    return r;
  });
  out.stepUp = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    // spare soldier lying (h 0.5) is steppable; crayon (h 0.9) is a wall; crayon can be jumped onto
    g.clearInput(); g.teleport(3, 0, 129.3, -Math.PI / 2, 0); g.setInput({ forward: true }); g.step(0.5); r.onLyingSoldierY = +P().y.toFixed(2);
    g.clearInput(); g.teleport(54, 0, 28, Math.PI, 0); g.setInput({ forward: true }); g.step(1); r.crayonWalkZ = +P().z.toFixed(2); r.crayonWalkY = P().y;
    g.setInput({ jump: true }); g.step(0.4); r.crayonJumpY = +P().y.toFixed(2); r.crayonJumpZ = +P().z.toFixed(2); g.clearInput(); g.step(1);
    return r;
  });
  out.crouch = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    // under the skateboard ramp at z 52.8 the clearance is about 1.47: crouch fits, standing does not
    g.clearInput(); g.teleport(84, 0, 52.8, -Math.PI / 2, 0);
    g.setInput({ forward: true }); g.step(1.5); r.standingBlockedAtX = +P().x.toFixed(2);
    g.setInput({ forward: true, crouch: true }); g.step(1.2); r.crouchedReachedX = +P().x.toFixed(2);
    g.clearInput(); g.step(1); r.stillCrouchingUnderRamp = P().crouching;
    g.setInput({ jump: true }); g.step(0.5); r.jumpUnderRampY = +P().y.toFixed(3); g.clearInput();
    g.setInput({ forward: true }); g.step(3); g.clearInput(); g.step(0.3); r.afterWalkingOut = { x: +P().x.toFixed(2), crouching: P().crouching };
    return r;
  });
  out.fall = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    const drop = (x, y, z, yaw) => { const n = g.damageLog.length; g.clearInput(); g.teleport(x, y, z, yaw, 0); g.setInput({ forward: true }); g.step(4); g.clearInput(); g.step(0.5); return { y: +P().y.toFixed(2), health: +P().health.toFixed(1), log: g.damageLog.slice(n) }; };
    r.offBed = drop(33, 18, 70, -Math.PI / 2);          // 18 -> 0: expect 40
    g.teleport(60, 0, 20); r.offDesk = drop(97, 26, 62, Math.PI / 2); // 26 -> 0, walking west off the desk edge: expect 80
    r.offTunnel = drop(77, 8, 70, 0);                   // 8 -> 0: safe
    r.offL3 = drop(110, 60, 150, Math.PI / 2);          // 60 -> floor/stairs: lethal, respawn
    r.afterLethal = { x: P().x, z: P().z, health: P().health };
    return r;
  });
  out.safety = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    g.clearInput(); g.teleport(30, 0, 30); g.step(0.2);
    g.teleport(-10, 0, 50); g.step(0.1); r.outsideWest = [P().x, P().y, P().z];
    g.teleport(60, -20, 80); g.step(0.1); r.below = [P().x, P().y, P().z];
    g.teleport(60, 200, 80); g.step(0.1); r.above = [P().x, P().y, P().z];
    const walls = {};
    for (const [name, yaw] of [['north', 0], ['west', Math.PI / 2], ['south', Math.PI], ['east', -Math.PI / 2]]) {
      g.teleport(name === 'east' ? 100 : name === 'west' ? 20 : 48, 0, name === 'north' ? 3 : name === 'south' ? 157 : name === 'east' ? 2 : 20, yaw, 0);
      g.setInput({ forward: true, sprint: true }); g.step(6); g.clearInput(); const p = P(); walls[name] = [+p.x.toFixed(3), +p.z.toFixed(3)];
    }
    r.walls = walls; return r;
  });
  out.spring = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    const go = (label, x, z, yaw, input) => { g.clearInput(); g.teleport(x, 0, z, yaw, 0); g.setInput(input); let peak = 0;
      for (let i = 0; i < 300; i++) { g.step(1 / 60); const p = P(); peak = Math.max(peak, p.y); if (i > 30 && p.onGround) break; }
      g.clearInput(); const p = P(); r[label] = { land: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], peak: +peak.toFixed(2), health: p.health }; };
    go('fromNorthThenNoInput', 38, 77.4, Math.PI, { forward: true });
    go('fromEastHoldForward', 41, 80, Math.PI / 2, { forward: true });
    go('fromSouthSprint', 38, 83, 0, { forward: true, sprint: true });
    go('fromWestHoldEast', 35.6, 80, -Math.PI / 2, { forward: true });
    g.teleport(60, 0, 20); g.step(0.1); g.teleport(41, 0, 80, Math.PI / 2, 0); g.setInput({ forward: true }); g.step(0.5); g.clearInput(); g.step(3);
    r.fromEastReleaseInput = [+P().x.toFixed(2), +P().y.toFixed(2), +P().z.toFixed(2)];
    return r;
  });
  out.edges = await page.evaluate(() => {
    const g = __game, fails = []; let n = 0;
    for (const e of g.waypoints.edges) {
      for (const dir of e.oneWay ? [[e.a, e.b]] : [[e.a, e.b], [e.b, e.a]]) {
        g.clearInput(); g.teleport(60, 0, 20); n++;
        const h0 = g.state().player.health, res = g.walkPath(dir, { timeout: 40 });
        const p = g.state().player, B = g.waypoints.nodes[dir[1]];
        if (!res.ok || (dir[1] !== 'm.pad' && Math.abs(p.y - B[1]) > 0.75) || p.health < h0) fails.push({ edge: dir.join(' > '), kind: e.kind, ok: res.ok, time: res.time, pos: res.pos, health: p.health });
      }
    }
    return { walked: n, fails };
  });
  out.damageLogLen = await page.evaluate(() => __game.damageLog.length);
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
