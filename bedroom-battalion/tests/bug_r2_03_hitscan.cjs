// Round 2 check 4: hitscan correctness. The game's raycast is compared with an independent ray march through my own
// point-in-solid test (boxes, cylinders, wedge and slab ramps), then targeted cases: walls, floors, bed, desk, shelf
// boards, slits and gaps, flush against geometry, dummies from every side, straight up and down.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, out = {};
    if (typeof G.range === 'function') G.range(true);   // round 3: dummies only with range(true)
    const cols = G.colliders.filter((c) => c.kind !== 'string');
    // ---- my own point-in-solid, with a coarse grid ----
    const CELL = 4, NX = 32, NZ = 42, grid = Array.from({ length: NX * NZ }, () => []);
    for (const c of cols) { const i0 = Math.max(0, Math.floor((c.x0 + 4) / CELL)), i1 = Math.min(NX - 1, Math.floor((c.x1 + 4) / CELL)), j0 = Math.max(0, Math.floor((c.z0 + 4) / CELL)), j1 = Math.min(NZ - 1, Math.floor((c.z1 + 4) / CELL)); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[j * NX + i].push(c); }
    const inSolid = (x, y, z) => {
      const i = Math.floor((x + 4) / CELL), j = Math.floor((z + 4) / CELL); if (i < 0 || j < 0 || i >= NX || j >= NZ) return 'outside';
      for (const c of grid[j * NX + i]) {
        if (c.kind === 'cyl') { if (y > c.y0 && y < c.y1 && (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return c.id; continue; }
        if (x <= c.x0 || x >= c.x1 || z <= c.z0 || z >= c.z1) continue;
        if (c.kind === 'ramp') { const a0 = c.axis === 'x' ? c.x0 : c.z0, a1 = c.axis === 'x' ? c.x1 : c.z1, t = c.axis === 'x' ? x : z, top = c.h0 + (c.h1 - c.h0) * (t - a0) / (a1 - a0), bot = Number.isFinite(c.thickness) ? top - c.thickness : (c.base || 0); if (y < top && y > bot) return c.id; continue; }
        if (y > c.y0 && y < c.y1) return c.id;
      }
      return null;
    };
    const march = (o, d, max, step) => { for (let t = 0; t <= max; t += step) { const id = inSolid(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t); if (id) return { t, id }; } return null; };
    let s = 12345; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // remove dummies from the comparison by knocking them all down (down targets are not hit)
    const noTargets = (o, d) => { const r = G.raycast(o, d); return r && r.kind === 'target' ? 'target' : r; };
    out.random = { rays: 0, shotThrough: [], phantom: [], wrongId: 0, noHit: [], kinds: {} };
    const eyes = Object.values(G.waypoints.nodes);
    for (let n = 0; n < 6000; n++) {
      let o;
      if (n % 3 === 0) { const e = eyes[Math.floor(rnd() * eyes.length)]; o = [e[0] + (rnd() - 0.5), e[1] + 1.0 + rnd() * 0.6, e[2] + (rnd() - 0.5)]; }
      else o = [0.5 + rnd() * 119, 0.2 + rnd() * (rnd() < 0.6 ? 8 : 88), 0.5 + rnd() * 159];
      if (inSolid(o[0], o[1], o[2])) continue;
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), d = [Math.sin(ph) * Math.cos(th), Math.cos(ph) * (rnd() < 0.5 ? 0.25 : 1), Math.sin(ph) * Math.sin(th)], l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
      const g = noTargets(o, d); if (g === 'target') continue;
      out.random.rays++;
      if (!g) { out.random.noHit.push({ o, d }); continue; }
      out.random.kinds[g.kind] = (out.random.kinds[g.kind] || 0) + 1;
      const m = march(o, d, g.distance + 0.5, 0.02);
      if (!m) { out.random.phantom.push({ o, d, game: [g.id, +g.distance.toFixed(3)], march: null }); continue; }
      if (m.t < g.distance - 0.06) { const fine = march(o, d, g.distance - 0.03, 0.002); if (fine) out.random.shotThrough.push({ o: o.map((v) => +v.toFixed(3)), d: d.map((v) => +v.toFixed(4)), game: [g.id, +g.distance.toFixed(3)], firstSolid: [fine.id, +fine.t.toFixed(3)] }); }
      else if (m.t > g.distance + 0.06) out.random.phantom.push({ o, d, game: [g.id, +g.distance.toFixed(3)], march: [m.id, +m.t.toFixed(3)] });
      else if (m.id !== g.id) out.random.wrongId++;
    }
    // ---- every collider, aimed: 6 rays at each collider's centre from 3 units outside each face ----
    out.aimed = { rays: 0, missed: [] };
    for (const c of cols) {
      if (c.id.startsWith('room.')) continue;
      const cx = c.kind === 'cyl' ? c.x : (c.x0 + c.x1) / 2, cz = c.kind === 'cyl' ? c.z : (c.z0 + c.z1) / 2;
      let cy = (c.y0 + c.y1) / 2; if (c.kind === 'ramp') { const top = (c.h0 + c.h1) / 2; cy = Number.isFinite(c.thickness) ? top - c.thickness / 2 : (top + (c.base || 0)) / 2; }
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        // back off along -d until we are in free space (max 40 units), then shoot at the centre
        let o = null; for (let k = 0.3; k < 40; k += 0.3) { const p = [cx - d[0] * k, cy - d[1] * k, cz - d[2] * k]; const sId = inSolid(p[0], p[1], p[2]); if (!sId) { const q = [p[0] - d[0] * 1.5, p[1] - d[1] * 1.5, p[2] - d[2] * 1.5]; o = inSolid(q[0], q[1], q[2]) ? [p[0] - d[0] * 0.05, p[1] - d[1] * 0.05, p[2] - d[2] * 0.05] : q; if (inSolid(o[0], o[1], o[2])) o = null; break; } if (sId !== c.id && sId !== 'outside') { /* another solid touches this face */ } if (sId === 'outside') break; }
        if (!o) continue;
        const g = noTargets(o, d); if (g === 'target') continue; out.aimed.rays++;
        const m = march(o, d, 45, 0.01);
        if (!g || !m || Math.abs(g.distance - m.t) > 0.03) out.aimed.missed.push({ collider: c.id, kind: c.kind, from: o.map((v) => +v.toFixed(2)), dir: d, game: g ? [g.id, +g.distance.toFixed(3)] : null, march: m ? [m.id, +m.t.toFixed(3)] : null });
      }
    }

    // ---- targeted, through the real fire() path (sniper, scoped, crouched: 0.03 deg) ----
    const shoot = (from, at, opts = {}) => {
      G.clearInput(); G.give('ammo'); G.resetTargets(); G.selectWeapon('sniper'); G.teleport(from[0], from[1], from[2]); G.setInput({ scope: true, crouch: !!opts.crouch }); G.step(1.5);
      const p = G.state().player; G.lookAt(at[0], at[1], at[2]); const e = G.fire(); G.clearInput();
      return e ? { hit: e.hit, zone: e.zone, kind: e.kind, d: e.distance, eyeFeet: +p.y.toFixed(2), onGround: p.onGround } : null;
    };
    out.cases = {};
    const C = out.cases;
    // slits: from inside the Green fort through the slit at standing eye height to the dummy at (60,0,34)? the gate is at 57.5..62.5, so use the slit at x 53
    C.slitStandingFromInside = shoot([53.5, 0, 22], [53.5, 1.6, 40]);
    C.slitCrouchedFromInside = shoot([53.5, 0, 22], [53.5, 1.0, 40], { crouch: true });
    C.slitPillar = shoot([51.75, 0, 22], [51.75, 1.6, 40]);
    C.slitFromOutsideToInside = shoot([53.5, 0, 30], [53.5, 1.6, 10]);
    C.tanSlitDummyFromOutside = shoot([66, 0, 128], [66, 1.5, 137]);          // dummy behind the Tan slit at (66,0,137): head through the slit
    C.tanSlitDummyBodyThroughLowWall = shoot([66, 0, 128], [66, 0.6, 137]);
    C.gate = shoot([60, 0, 16], [60, 1.2, 34]);
    // walls and floors
    C.fortWallFlush = shoot([50, 0, 23.9], [50, 1.6, 40]);                     // flush against the inside of the front wall, aiming at the high wall? eye 1.6 is slit height
    C.fortWallFlushHigh = shoot([50, 0, 23.9], [50, 2.6, 26]);
    C.underBedUp = shoot([20, 0, 80], [20, 30, 80.01]);
    C.bedTopDown = shoot([26, 18, 68], [26, 0, 68.01]);
    C.deskTopDown = shoot([104, 26, 80], [104, 0, 80.5]);
    C.underDeskUp = shoot([104, 0, 80], [104, 40, 80.5]);
    C.shelfL1Up = shoot([114, 20, 130], [114, 80, 130.3]);
    C.shelfL2Down = shoot([114, 40, 131], [114, 0, 131.3]);
    C.underShelfUp = shoot([114, 0, 130], [114, 80, 130.3]);
    C.straightUpOpen = shoot([60, 0, 100], [60, 90, 100.5]);
    C.straightDownOpen = shoot([60, 0, 100], [60, -5, 100.05]);
    C.wallN = shoot([80, 0, 3], [80, 1.6, -5]); C.wallE = shoot([117, 0, 80.5], [130, 1.6, 80.5]); C.wallW = shoot([40, 0, 20], [-5, 1.6, 20]); C.wallS = shoot([80, 0, 157], [80, 1.6, 170]);
    C.windowIsSolid = shoot([40, 0, 40], [-1, 50, 80]);
    // flush against things, shooting into them and along them
    C.flushEastWallIntoIt = shoot([119.6, 0, 80.5], [125, 1.6, 80.5]);
    C.flushCornerDiagonal = shoot([119.6, 0, 159.6], [130, 1.6, 170]);
    C.flushAgainstTunnelWall = shoot([72.2, 0, 80], [77, 1.6, 80]);            // tunnel wall w at x 72.6..73.6; the dummy on the roof must not be hit
    C.flushAgainstDeskLeg = shoot([94.6, 0, 56], [100, 1.6, 56]);
    C.flushAgainstStairGuard = shoot([110.5, 0, 136], [100, 1.6, 136]);        // from under L1, west through the guard at the stairs
    C.throughStairGuardFromStairs = shoot([106, 20 / 34 * 10, 151 - 0.85 * 9.5], [115, 20 / 34 * 10 + 1.6, 151 - 0.85 * 9.5]);
    C.rulerPropFromSeat = shoot([90, 17, 80], [94, 20, 68]);                   // ruler north and its prop
    C.rulerPropFromFloorEast = shoot([99, 0, 68], [90, 1.6, 68]);
    C.deskApron = shoot([99, 0, 70], [90, 21, 70]);
    // thin slabs: skateboard from below and above, ruler bridge from below, chair back gap
    C.skateboardFromBelow = shoot([89, 0, 64], [89, 30, 64.2]);
    C.skateboardFromAbove = shoot([89, 17, 78], [89, 9, 62]);
    C.bridgeFromBelow = shoot([111.5, 0, 110], [111.5, 60, 110.2]);
    C.chairBackGap = shoot([90, 17, 80], [70, 18.6, 80]);                      // through the open gap y 17..22 under the back panel
    C.chairBackPanel = shoot([90, 17, 80], [84, 27, 80]);
    C.crenelGap = shoot([70.5, 7, 9.5], [69.4, 8.6, 20]);                      // through a 1.2 crenel gap (x 68.8..70)
    C.crenelMerlon = shoot([70.5, 7, 9.5], [70.6, 7.6, 20]);
    C.fortDoorGap = shoot([60, 0, 17], [30, 1.6, 17]);                         // west door gap z 15..19
    C.underBedThrough = shoot([40, 0, 80.3], [-5, 1.6, 80.3], { crouch: true });   // under the bed all the way to the west wall? shoebox is in the way
    C.cylinderMug = shoot([104, 26, 74], [115, 29, 74]);
    C.cylinderBall = shoot([54, 0, 90], [54, 3, 99]);
    C.springPad = shoot([45, 0, 80], [38, 0.2, 80]);
    C.stringIsNotSolid = shoot([107, 0, 50], [107, 1.6, 60]);
    // dummies: zones from above, below, far, the sides, the back
    const dm = (name, from, y) => { const t = G.state().targets.find((q) => q.pos[0] === 60 && q.pos[2] === 110); const r = G.raycast(from, [t.pos[0] - from[0], y - from[1], t.pos[2] - from[2]]); C['dummy ' + name] = r ? { id: r.id, zone: r.zone, d: +r.distance.toFixed(2) } : null; };
    dm('head from the front, level', [60, 1.57, 116], 1.57); dm('body from the front, level', [60, 0.8, 116], 0.8); dm('neck line y 1.35 (boundary)', [60, 1.35, 116], 1.35);
    dm('head from straight above', [60, 30, 110], 1.6); dm('head top from 45 deg above', [60, 9, 117], 1.7); dm('body from the side', [66, 0.8, 110], 0.8); dm('head from the side', [66, 1.57, 110], 1.57);
    dm('head from behind', [60, 1.57, 104], 1.57); dm('body from below (floor level looking up at chest)', [60, 0.05, 112], 1.0); dm('feet / base y 0.02', [60, 0.02, 116], 0.02);
    dm('beside the head, x +0.3 (shoulder is 0.4 wide, head 0.225)', [60.3, 1.57, 116], 1.57);
    {
      const t = G.state().targets.find((q) => q.pos[0] === 60 && q.pos[2] === 110), r = G.raycast([60.3, 1.57, 116], [0, 0, -1]); C['dummy beside the head x +0.3, straight ray'] = r ? { id: r.id, zone: r.zone } : null;
      const r2 = G.raycast([60, 1.85, 116], [0, 0, -1]); C['dummy just above the head y 1.85'] = r2 ? { id: r2.id, zone: r2.zone, d: +r2.distance.toFixed(1) } : null;
      // tipped-over dummy: knock it down, then shoot where it stood and where it lies
      G.clearInput(); G.resetTargets(); G.selectWeapon('sniper'); G.teleport(60, 0, 116); G.step(1.5); G.lookAt(60, 1.57, 110); const kill = G.fire(); G.step(1);
      const st = G.state().targets.find((q) => q.id === t.id);
      C.tipped = { killShot: kill && [kill.zone, kill.damage], down: st.down, hp: st.hp, standingVolume: G.raycast([60, 0.8, 116], [0, 0, -1]).id, lyingWhereTheVisualIs: G.raycast([60, 3, 111.2], [0, -1, 0]).id, lyingOtherSide: G.raycast([60, 3, 108.8], [0, -1, 0]).id };
      G.selectWeapon('rifle'); G.step(1); G.shotLog.length = 0; G.lookAt(60, 0.8, 110); G.fire(); C.tipped.shotAtStandingVolumeWhileDown = G.shotLog[0].hit; G.step(2.5);
      const st2 = G.state().targets.find((q) => q.id === t.id); C.tipped.after3_5s = { down: st2.down, hp: st2.hp };
    }
    // far: every dummy that can be seen from any waypoint node, head and body, checked against geometry
    return out;
  });
  const r = out.random;
  console.log(`random rays: ${r.rays} compared with my ray march | kinds hit ${JSON.stringify(r.kinds)} | shot through a solid: ${r.shotThrough.length} | stopped in thin air: ${r.phantom.length} | same distance, other id (touching solids): ${r.wrongId} | no hit at all: ${r.noHit.length}`);
  for (const x of r.shotThrough.slice(0, 8)) console.log('   THROUGH', JSON.stringify(x));
  for (const x of r.phantom.slice(0, 8)) console.log('   PHANTOM', JSON.stringify(x));
  for (const x of r.noHit.slice(0, 4)) console.log('   NOHIT', JSON.stringify(x));
  console.log(`aimed at every collider from each side: ${out.aimed.rays} rays, ${out.aimed.missed.length} disagree`);
  const byC = {}; for (const x of out.aimed.missed) { const k = x.collider.replace(/\.\d+$/, ".N"); byC[k] = (byC[k] || 0) + 1; } console.log("   by collider:", JSON.stringify(byC));
  for (const x of out.aimed.missed.filter((m) => !/books\.\d+$/.test(m.collider)).slice(0, 12)) console.log('   ', JSON.stringify(x));
  for (const k in out.cases) console.log('  ' + k + ': ' + JSON.stringify(out.cases[k]));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
