// Targeted repros for individual suspicions. Each block prints what it measured.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    const sample = () => { const p = T.st(); return { pos: T.pos(), vel: [+p.vx.toFixed(2), +p.vy.toFixed(2), +p.vz.toFixed(2)], onGround: p.onGround, climbing: p.climbing, crouching: p.crouching, surface: p.surface, hp: p.health }; };

    // ---- 1. shelf-side edge of the tall / small book stairs: dead stop under the L1 board ----
    out.stairEdge = {};
    out.stairEdge.scan = [];
    for (let x = 107.3; x <= 108.41; x += 0.05) {
      G.clearInput(); G.teleport(x, 0, 154, YAW.n, 0); G.step(0.2); G.setInput({ forward: true }); G.step(9); G.clearInput();
      const p = T.st(); out.stairEdge.scan.push(`${x.toFixed(2)}:${p.y > 19.99 ? 'top' : 'stop y=' + p.y.toFixed(2) + ' z=' + p.z.toFixed(1)}`);
    }
    // natural case: stand at the stair foot, look at where you want to go on L1 (the route's own L1 node), hold W
    G.clearInput(); G.teleport(105.7, 0, 152.5); G.step(0.2); G.lookAt(110.5, 21.6, 120); G.setInput({ forward: true }); G.step(10);
    out.stairEdge.aimAtL1FromFoot = sample();
    // once stopped: does anything short of strafing away free you?
    const stuck = () => { G.clearInput(); G.teleport(107.9, 0, 154, YAW.n, 0); G.step(0.2); G.setInput({ forward: true }); G.step(8); return sample(); };
    out.stairEdge.stuckAt = stuck();
    G.step(3); out.stairEdge.after3sMoreW = sample();
    G.setInput({ forward: true, sprint: true }); G.step(2); out.stairEdge.plusSprint = sample();
    stuck(); G.setInput({ forward: true, jump: true }); G.step(0.1); G.setInput({ jump: false }); G.step(2); out.stairEdge.plusJump = sample();
    stuck(); G.setInput({ forward: true, crouch: true }); G.step(2); out.stairEdge.plusCrouch = sample();
    stuck(); G.setInput({ forward: true, right: true }); G.step(2); out.stairEdge.plusStrafeRightTowardShelf = sample();
    stuck(); G.setInput({ forward: true, left: true }); G.step(2); out.stairEdge.plusStrafeLeftAway = sample();
    // same on the small shelf
    G.clearInput(); G.teleport(107.9, 0, 6, YAW.s, 0); G.step(0.2); G.setInput({ forward: true }); G.step(9); out.stairEdge.smallShelf = sample();
    // and the top of the skateboard at its east edge under the ruler's low end
    G.clearInput(); G.teleport(92.3, 0, 47, YAW.s, 0); G.step(0.2); G.setInput({ forward: true }); G.step(9); out.stairEdge.skateTopEast = sample();

    // ---- 2. shelf strings: hold W all the way (the only way to climb). Where do you end up? ----
    out.stringTop = [];
    for (const [id, z, y0, exitYaw] of [['tall_L2_a', 130, 20], ['tall_L3_a', 136, 40], ['small_L2_a', 30, 20]]) {
      G.clearInput(); G.teleport(110.5, y0, z, YAW.w, 0); G.step(0.2);
      G.setInput({ forward: true });
      const ev = []; let prev = T.st();
      for (let i = 0; i < 60 * 12; i++) { G.step(DT); const p = T.st(); if (p.climbing !== prev.climbing || p.onGround !== prev.onGround) ev.push(`${(i / 60).toFixed(2)}s ${p.climbing ? 'climbing' : p.onGround ? 'ground' : 'air'} @${T.pos()}`); prev = p; }
      const end = sample();
      // release W, press W again without turning (4 times)
      const taps = [];
      for (let k = 0; k < 4; k++) { G.clearInput(); G.step(0.2); G.setInput({ forward: true }); G.step(0.6); const p = T.st(); taps.push(p.climbing ? 'hanging' : p.onGround ? 'on shelf' : 'air'); }
      // turn round (face east, the exit direction) and press W
      G.clearInput(); G.step(0.2); G.look(YAW.e, 0); G.setInput({ forward: true }); G.step(0.6); G.clearInput();
      out.stringTop.push({ id, events: ev, after12sOfW: end, tapWAgainWithoutTurning: taps, afterTurningEastAndW: sample() });
    }
    // floor strings: natural approach (yo-yo from the north, shoelace from the south) and the awkward one (from under the desk)
    for (const [id, sx, sz, yaw] of [['yoyo from north', 107, 51, YAW.s], ['yoyo from under the desk', 107, 58, YAW.n], ['lace from south', 107, 109, YAW.n], ['lace from under the desk', 107, 102, YAW.s], ['yoyo from the west', 104, 54.5, YAW.e]]) {
      G.clearInput(); G.teleport(sx, 0, sz, yaw, 0); G.step(0.2); G.setInput({ forward: true }); G.step(12);
      out.stringTop.push({ id, after12sOfW: sample() });
    }

    // ---- 3. second jump in mid-air right after letting go of a string ----
    out.airJump = (() => {
      const run = (gapTicks) => {
        G.clearInput(); T.reset(); G.teleport(107, 0, 52, YAW.s, 0); G.step(0.2);
        G.setInput({ forward: true }); G.step(3);                 // grab from the ground and climb
        const a = sample();
        G.clearInput(); G.setInput({ jump: true }); G.step(DT);   // let go
        const b = sample();
        G.setInput({ jump: false }); for (let i = 0; i < gapTicks; i++) G.step(DT);
        G.setInput({ jump: true }); G.step(DT);
        const c = sample(); let maxY = c.pos[1];
        G.setInput({ jump: false });
        for (let i = 0; i < 300 && !T.st().onGround; i++) { G.step(DT); maxY = Math.max(maxY, T.st().y); }
        return { gapTicks, onString: a.pos, afterLetGo: b.vel, afterSecondPress: c.vel, releaseY: b.pos[1], maxYAfter: +maxY.toFixed(3), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) };
      };
      return [1, 2, 3, 4, 5, 6].map(run);
    })();
    // control: same thing but the string was grabbed in mid-air (jumped into it), and a plain mid-air second press after a normal jump
    out.airJumpControl = (() => {
      G.clearInput(); T.reset(); G.teleport(60, 0, 40, 0, 0); G.step(0.2);
      G.setInput({ jump: true }); G.step(DT); G.setInput({ jump: false }); G.step(0.3); G.setInput({ jump: true }); G.step(DT);
      return { secondPressInNormalJump_vy: T.st().vy };
    })();

    // ---- 4. tight gaps: ruin brick / stub (0.7 wide) and toy car / yo-yo body (0.8 at the narrowest) ----
    out.gaps = [];
    const gapRun = (name, start, yaw, inp, secs = 4) => {
      G.clearInput(); T.reset(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.2);
      G.setInput(inp);
      let path = 0, prev = T.st(), deepest = 0, flips = 0, lastDx = 0, lastDz = 0;
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) {
        G.step(DT); const p = T.st();
        const dx = p.x - prev.x, dz = p.z - prev.z;
        if (i > n - 60) { path += Math.hypot(dx, dz); if (dx * lastDx + dz * lastDz < -1e-9) flips++; }
        lastDx = dx; lastDz = dz; prev = p;
      }
      const p = T.st(), start2 = T.pos();
      G.clearInput(); G.step(0.3);
      return { name, end: start2, lastSecondPath: +path.toFixed(4), directionFlipsInLastSecond: flips, inside: T.inside({ lift: 0.66, eps: 0.0 }), inside1cm: T.inside({ lift: 0.66, eps: 0.01 }) };
    };
    for (const inp of [{ forward: true }, { forward: true, sprint: true }]) {
      out.gaps.push(gapRun('ruin north-west: into the 0.7 gap between ruin.brick.2 (z0 73.2) and ruin.stub.n.high (z1 72.5), heading west', [56, 0, 72.95], YAW.w, inp));
      out.gaps.push(gapRun('same gap heading east from outside', [52.9, 0, 72.85], YAW.e, inp));
      out.gaps.push(gapRun('same gap, diagonal NW', [55.2, 0, 73.6], T.yawOf(-1, -0.6), inp));
      out.gaps.push(gapRun('E-b car (z1 49) / yo-yo body (r 2.2 at 111,52): heading east through the 0.8 pinch', [108, 0, 49.4], YAW.e, inp));
      out.gaps.push(gapRun('same pinch heading west', [114.5, 0, 49.4], YAW.w, inp));
      out.gaps.push(gapRun('same pinch diagonal', [108.6, 0, 49.2], T.yawOf(1, 0.15), inp));
    }

    // ---- 5. tunnel_drop at different speeds ----
    out.tunnelDrop = [];
    for (const [tag, inp] of [['walk', { forward: true }], ['sprint', { forward: true, sprint: true }], ['crouch-walk', { forward: true, crouch: true }], ['walk to the edge, stop, then walk', null]]) {
      G.clearInput(); T.reset(); G.teleport(91, 17, 80, YAW.w, 0); G.step(0.2);
      if (inp) G.setInput(inp);
      else { G.setInput({ forward: true }); while (T.st().x > 85.0) G.step(DT); G.clearInput(); G.step(0.5); G.setInput({ forward: true }); }
      for (let i = 0; i < 600; i++) { G.step(DT); const p = T.st(); if (p.onGround && p.y < 16) break; }
      G.clearInput(); G.step(0.2);
      out.tunnelDrop.push({ tag, landed: T.pos(), dmg: G.damageLog.map((d) => d.amount) });
    }

    // ---- 6. fort north wall top from the tower ramp ----
    out.fortWallTop = (() => {
      G.clearInput(); T.reset(); G.teleport(62, 0, 9, 0, 0); G.step(0.3);                // on the tower ramp (x 53..67, z 7.5..10.5)
      const onRamp = sample();
      G.look(YAW.n, 0); G.setInput({ forward: true }); G.step(0.6); G.clearInput(); G.step(0.2);
      const stepNorth = sample();
      G.look(YAW.w, 0); G.setInput({ forward: true }); G.step(2); G.clearInput(); G.step(0.2);
      return { onRamp, afterWalkingNorthOffTheRamp: stepNorth, afterWalkingWestAlongIt: sample() };
    })();

    // ---- 7. teleport() with the head a few mm inside a big slab: sideways eject ----
    out.teleportEject = (() => {
      G.clearInput(); T.reset(); G.teleport(60, 0, 40); G.step(0.2);
      G.teleport(13.3, 4.205, 70.7); G.step(DT);
      return { after1Tick: T.pos(), rescueLog: JSON.parse(JSON.stringify(G.rescueLog)) };
    })();

    // ---- 8. jump under a ceiling that only just clears, then check for sideways ejection (float edge) ----
    out.ceilingTouch = [];
    for (const [name, x, y, z] of [['on tall stairs step 27 at x 108.2, jump into the L1 board', 108.2, null, 128.3], ['on tall stairs step 27 at x 107.9', 107.9, null, 128.3]]) {
      G.clearInput(); T.reset(); G.teleport(x, 30, z, YAW.n, 0);        // drop in from above? no: place on the stair by walking
      G.teleport(x, 0, 154, YAW.n, 0); G.step(0.2); G.setInput({ forward: true }); while (T.st().z > z) G.step(DT); G.clearInput(); G.step(0.3);
      const a = T.pos();
      let maxDx = 0, prev = T.st(), maxHead = 0;
      for (let k = 0; k < 6; k++) { G.setInput({ jump: true }); G.step(DT); G.setInput({ jump: false }); for (let i = 0; i < 50; i++) { G.step(DT); const p = T.st(); maxDx = Math.max(maxDx, Math.abs(p.x - prev.x) + Math.abs(p.z - prev.z)); maxHead = Math.max(maxHead, p.y + 1.8); prev = p; } }
      out.ceilingTouch.push({ name, before: a, after: T.pos(), maxHead: +maxHead.toFixed(4), biggestHorizontalJumpInOneTick: +maxDx.toFixed(4) });
    }
    return out;
  });
  const P = (k, v) => console.log(k, JSON.stringify(v));
  console.log('--- 1. stair edge under the shelf board ---');
  console.log('lane scan (start x: result):', out.stairEdge.scan.join(' | '));
  for (const k of Object.keys(out.stairEdge)) if (k !== 'scan') P('  ' + k, out.stairEdge[k]);
  console.log('--- 2. strings with W held ---');
  for (const r of out.stringTop) P('  ', r);
  console.log('--- 3. air jump after string release ---');
  for (const r of out.airJump) P('  ', r);
  P('  control', out.airJumpControl);
  console.log('--- 4. tight gaps ---');
  for (const r of out.gaps) P('  ', r);
  console.log('--- 5. tunnel drop ---');
  for (const r of out.tunnelDrop) P('  ', r);
  console.log('--- 6. fort wall top ---'); P('  ', out.fortWallTop);
  console.log('--- 7. teleport eject ---'); P('  ', out.teleportEject);
  console.log('--- 8. ceiling touch ---'); for (const r of out.ceilingTouch) P('  ', r);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
