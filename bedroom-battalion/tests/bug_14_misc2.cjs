// Misc 2: ledge overhang, waypoint nodes really on the ground at their stated height, how high a thing can be
// mounted from the side (box vs ramp), double-click start and quick pause/resume with real events.
const { launch } = require('./harness.cjs');
const { installPageHelpers } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const out = {};
  // ---- real events first: double click on the title, then Esc + immediate click, three times ----
  await page.mouse.dblclick(320, 180); await page.waitForTimeout(300);
  out.afterDblClick = await page.evaluate(() => ({ phase: __game.state().phase, lock: !!document.pointerLockElement }));
  out.quickResume = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape'); await page.mouse.click(320, 180); await page.waitForTimeout(250);
    out.quickResume.push(await page.evaluate(() => ({ phase: __game.state().phase, lock: !!document.pointerLockElement, title: getComputedStyle(document.getElementById('title')).display })));
  }
  out.errorsAfterClicks = errors.slice();
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  await page.evaluate(installPageHelpers);

  Object.assign(out, await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    // ---- ledge overhang: creep to an edge (crouch speed), how far past the edge is the centre while still standing? ----
    out.overhang = [];
    for (const [name, start, yaw, edge, axis, sign] of [['bed east edge x=35', [33, 18, 90], -Math.PI / 2, 35, 'x', 1], ['desk west edge x=95', [97, 26, 62], Math.PI / 2, 95, 'x', -1], ['tall L3 north edge z=116', [114, 60, 118], 0, 116, 'z', -1], ['tower top west edge x=67', [69, 7, 12], Math.PI / 2, 67, 'x', -1]]) {
      G.clearInput(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.2); G.setInput({ forward: true, crouch: true });
      let last = null; for (let i = 0; i < 600; i++) { G.step(DT); const p = T.st(); if (!p.onGround || Math.abs(p.y - start[1]) > 0.01) break; last = p[axis]; }
      G.clearInput();
      out.overhang.push({ name, lastStandingCentre: +last.toFixed(3), centrePastEdgeBy: +((last - edge) * sign).toFixed(3) });
    }
    // ---- waypoint nodes: drop onto each node and compare the ground height with the node's y ----
    out.nodesOffGround = [];
    for (const [id, n] of Object.entries(G.waypoints.nodes)) {
      G.clearInput(); G.teleport(n[0], n[1] + 0.5, n[2]);
      const blocked = T.solidAt(n[0], n[1], n[2], 1.8, { lift: 0.66 });
      for (let i = 0; i < 200 && !T.st().onGround; i++) G.step(DT);
      const p = T.st();
      if (Math.abs(p.y - n[1]) > 0.02 || blocked.length || Math.hypot(p.x - n[0], p.z - n[2]) > 0.01) out.nodesOffGround.push({ id, node: n, groundY: +p.y.toFixed(3), surface: p.surface, pushedTo: Math.hypot(p.x - n[0], p.z - n[2]) > 0.01 ? T.pos() : undefined, insideSolid: blocked.length ? blocked : undefined });
    }
    out.nodeCount = Object.keys(G.waypoints.nodes).length;
    // ---- how high can you mount from the side with a sprint jump: a box vs a slab ramp ----
    out.mount = (() => {
      const r = {};
      // boxes: ruin sill 1.2, yo-yo body (cyl) 1.4, sock 1.6, ruin stub low 1.8
      const tryBox = (name, start, yaw, top) => { G.clearInput(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.2); let on = false; for (let k = 0; k < 4 && !on; k++) { G.setInput({ forward: true, sprint: true, jump: true }); G.step(DT); G.setInput({ jump: false }); for (let i = 0; i < 60; i++) { G.step(DT); const p = T.st(); if (p.onGround && Math.abs(p.y - top) < 0.01) on = true; } } G.clearInput(); r[name] = on ? 'mounted' : 'blocked'; };
      tryBox('ruin sill 1.2 high', [49, 0, 80], -Math.PI / 2, 1.2);
      tryBox('yo-yo body 1.4 high', [111, 0, 48.6], Math.PI, 1.4);
      tryBox('lost sock 1.6 high', [9, 0, 57.5], 0, 1.6);
      tryBox('ruin low stub 1.8 high', [59, 0, 69], Math.PI, 1.8);
      // skateboard from the west side at increasing surface height
      r.skateboardFromSide = [];
      for (let h = 1.0; h <= 2.41; h += 0.1) {
        const z = 50 + h * 23 / 17;
        G.clearInput(); G.teleport(84.6, 0, z, -Math.PI / 2, 0); G.step(0.2);
        let on = false; for (let k = 0; k < 3 && !on; k++) { G.setInput({ forward: true, sprint: true, jump: true }); G.step(DT); G.setInput({ jump: false }); for (let i = 0; i < 50; i++) { G.step(DT); const p = T.st(); if (p.onGround && p.y > 0.5 && p.x > 85.6) on = true; } }
        G.clearInput();
        r.skateboardFromSide.push(h.toFixed(1) + ':' + (on ? 'mounted' : 'blocked'));
      }
      return r;
    })();
    return out;
  }));
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
