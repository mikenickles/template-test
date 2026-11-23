// Spring pad reliability, string grab comfort, naive (single-aim) route entries, descents, sightline pairs.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_los.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = FEEL.st, out = {};
    // ---------- SPRING PAD: approach from many directions, speeds and with different keys held in the air
    const pad = { x: 38, z: 80 }; const spring = [];
    const dirs = { fromNorth: [38, 72], fromSouth: [38, 88], fromEast: [46, 80], fromNE: [44, 74], fromSE: [44, 86], fromWest_underBed: [33, 80], clipNE_corner: [41, 72], clipEdge_east: [39.6, 72], clipEdge_west: [36.4, 72] };
    for (const dn in dirs) for (const mode of ['sprint', 'walk', 'crouch']) for (const air of ['holdForward', 'release', 'holdBack']) {
      const s = dirs[dn]; G.clearInput(); G.teleport(s[0], 0, s[1]); G.step(T);
      const tgt = dn.startsWith('clip') ? [s[0], 0, 90] : [pad.x, 0, pad.z];
      G.lookAt(tgt[0], 1.6, tgt[2]);
      G.setInput({ forward: true, sprint: mode === 'sprint', crouch: mode === 'crouch' });
      let t = 0, launchedAt = null, apex = 0, hp0 = st().health, land = null;
      while (t < 12) { G.step(T); t += T; const p = st();
        if (launchedAt === null && p.vy > 20) { launchedAt = t; if (air === 'release') G.clearInput(); if (air === 'holdBack') G.setInput({ forward: false, back: true, sprint: false, crouch: false }); }
        if (launchedAt !== null) { apex = Math.max(apex, p.y); if (p.onGround && t > launchedAt + 0.2) { land = p; break; } } }
      G.clearInput();
      if (launchedAt === null) { spring.push({ dn, mode, air, launched: false }); continue; }
      spring.push({ dn, mode, air, launched: true, airTime: +(t - launchedAt).toFixed(2), apex: +apex.toFixed(1), landX: +land.x.toFixed(1), landZ: +land.z.toFixed(1), landY: +land.y.toFixed(1), onBed: Math.abs(land.y - 18) < 2.6 && land.x < 35, hpLost: hp0 - st().health });
    }
    const L = spring.filter((s) => s.launched);
    out.spring = { runs: spring.length, launched: L.length, landedOnBed: L.filter((s) => s.onBed).length, hurt: L.filter((s) => s.hpLost > 0).length,
      airTime: [Math.min(...L.map((s) => s.airTime)), Math.max(...L.map((s) => s.airTime))], apex: [Math.min(...L.map((s) => s.apex)), Math.max(...L.map((s) => s.apex))],
      landX: [Math.min(...L.map((s) => s.landX)), Math.max(...L.map((s) => s.landX))], landZ: [Math.min(...L.map((s) => s.landZ)), Math.max(...L.map((s) => s.landZ))],
      notOnBed: L.filter((s) => !s.onBed), notLaunched: spring.filter((s) => !s.launched).map((s) => s.dn + '/' + s.mode).filter((v, i, a) => a.indexOf(v) === i) };
    // does walking the west lane hugging the bed launch you by accident? straight line north to south at several x
    out.spring.accidental = {};
    for (const x of [35.5, 36, 36.5, 37, 38, 39, 39.5, 40, 40.5]) { G.clearInput(); G.teleport(x, 0, 70); G.step(T); G.lookAt(x, 1.6, 95); G.setInput({ forward: true, sprint: true }); let launched = false; for (let i = 0; i < 240; i++) { G.step(T); if (st().vy > 20) { launched = true; break; } } out.spring.accidental['x=' + x] = launched; G.clearInput(); G.step(3); }

    // ---------- STRINGS: grab tolerance on the yo-yo string (107, 54.5). walk straight south toward z = 60 from lateral offsets
    const grab = {};
    for (const off of [0, 0.3, 0.6, 0.75, 0.85, 1.0, 1.3]) { G.clearInput(); G.teleport(107 + off, 0, 50); G.step(T); G.lookAt(107 + off, 1.6, 60); G.setInput({ forward: true, sprint: true }); let g = false, t = 0; while (t < 2.5) { G.step(T); t += T; if (st().climbing) { g = true; break; } } grab['offset ' + off] = g ? 'grab at t=' + t.toFixed(2) : 'MISSED, ended at ' + JSON.stringify([+st().x.toFixed(2), +st().z.toFixed(2)]); G.clearInput(); }
    out.yoyoGrabStraightRun = grab;
    // approach from the far side (from under the desk, heading north): can you grab it?
    G.clearInput(); G.teleport(107, 0, 60); G.step(T); G.lookAt(107, 1.6, 50); G.setInput({ forward: true }); let gg = false; for (let i = 0; i < 180; i++) { G.step(T); if (st().climbing) { gg = true; break; } } out.yoyoGrabFromUnderDesk = gg; G.clearInput();
    // strafing past / jumping at the string
    G.clearInput(); G.teleport(105, 0, 53.9); G.step(T); G.look(Math.PI, 0); G.setInput({ left: true }); gg = false; for (let i = 0; i < 120; i++) { G.step(T); if (st().climbing) { gg = true; break; } } out.yoyoGrabByStrafingPast = gg; G.clearInput();
    // look around while on the string: does yaw matter for climbing? climb looking away
    G.clearInput(); G.teleport(107, 0, 52); G.step(T); G.lookAt(107, 1.6, 60); G.setInput({ forward: true }); G.step(1); const c1 = st().climbing; G.look(0, 0.5); G.step(1); const y1 = st().y; out.climbWhileLookingAway = { climbing: c1, yAfter1sLookingBackwards: +y1.toFixed(2), stillClimbing: st().climbing };
    // jump off mid-string: where do you go, what does it cost
    G.setInput({ forward: true }); G.step(2); const yj = st().y; G.setInput({ forward: false, jump: true }); G.step(T); G.setInput({ jump: false }); G.step(3); out.jumpOffString = { fromY: +yj.toFixed(1), end: [+st().x.toFixed(1), +st().y.toFixed(1), +st().z.toFixed(1)], health: st().health };
    // release all keys on the string: do you hold position?
    G.clearInput(); G.teleport(107, 0, 52); G.step(T); G.lookAt(107, 1.6, 60); G.setInput({ forward: true }); G.step(3); G.clearInput(); const yh = st().y; G.step(2); out.hangWithNoKeys = { y0: +yh.toFixed(2), y1: +st().y.toFixed(2), climbing: st().climbing };
    // descend: from the desk top walk north into the yo-yo string, then S
    G.clearInput(); G.teleport(107, 26, 59); G.step(T); G.lookAt(107, 27.6, 50); G.setInput({ forward: true }); let td = 0, grabbed = null; while (td < 3) { G.step(T); td += T; if (st().climbing) { grabbed = td; break; } }
    const afterGrab = st(); G.step(0.5); const stillTop = st();
    G.setInput({ forward: false, back: true }); let tdn = 0; while (tdn < 12 && (st().climbing || !st().onGround)) { G.step(T); tdn += T; }
    out.descendYoyo = { grabbedFromTopAt: grabbed, posAtGrab: [+afterGrab.x.toFixed(2), +afterGrab.y.toFixed(2), +afterGrab.z.toFixed(2)], holdingForwardAfterGrab_y: +stillTop.y.toFixed(2), descendTime: +tdn.toFixed(2), end: [+st().x.toFixed(1), +st().y.toFixed(1), +st().z.toFixed(1)], health: st().health };
    G.clearInput();
    // shelf: walk west off L2 toward the string from the board -> grab or fall?
    const shelf = {};
    for (const zoff of [0, 0.5, 0.9, 1.5]) { G.clearInput(); G.teleport(112, 40, 130 + zoff); G.step(T); G.lookAt(100, 41.6, 130 + zoff); G.setInput({ forward: true, sprint: true }); G.step(1.5); const p = st(); shelf['zoff ' + zoff] = p.climbing ? 'grabbed' : 'FELL/ended y=' + p.y.toFixed(1) + ' hp=' + p.health; G.clearInput(); G.step(3); G.teleport(60, 0, 20); G.step(T); }
    out.shelfRunWestOffL2AtStringL2a = shelf;

    // ---------- NAIVE ENTRIES: one aim at the visible top of the route from where a player first sees it, then hold W
    const naive = {};
    const N = {
      blanket_from_fort_west_door: { s: [44.5, 0, 17], aim: [26, 18, 45], want: (p) => p.y > 17.5 },
      blanket_from_east_side:      { s: [40, 0, 35],   aim: [26, 18, 45], want: (p) => p.y > 17.5 },
      bedbooks_from_tan_west_door: { s: [44.5, 0, 143], aim: [26, 18, 115], want: (p) => p.y > 17.5 },
      skate_from_green_east_door:  { s: [75.5, 0, 17], aim: [89, 17, 73], want: (p) => p.y > 16.5 },
      chairstairs_from_tan_east_door: { s: [75.5, 0, 143], aim: [89, 17, 87], want: (p) => p.y > 16.5 },
      smallstairs_from_green_east_door: { s: [75.5, 0, 17], aim: [105.7, 20, 38], want: (p) => p.y > 19.5 },
      tallstairs_from_tan_east_door: { s: [75.5, 0, 143], aim: [105.7, 20, 122], want: (p) => p.y > 19.5 },
      ruler_n_from_skate_top:      { s: [89, 17, 73.6], aim: [94, 26, 64.3], want: (p) => p.y > 25.5 },
      ruler_s_from_stairs_top:     { s: [89, 17, 86.4], aim: [94, 26, 95.7], want: (p) => p.y > 25.5 },
      ruler_n_from_seat_centre:    { s: [90.5, 17, 80], aim: [94, 26, 64.3], want: (p) => p.y > 25.5 },
    };
    for (const k in N) { const d = N[k]; G.clearInput(); G.teleport(d.s[0], d.s[1], d.s[2]); G.step(T); G.lookAt(d.aim[0], d.s[1] + 1.6, d.aim[2]); G.setInput({ forward: true, sprint: true });
      let t = 0, ok = false, stall = 0; while (t < 15) { G.step(T); t += T; const p = st(); if (d.want(p) && p.onGround) { ok = true; break; } if (Math.hypot(p.vx, p.vz) < 0.5 || Math.hypot(p.vx, p.vz) < 3) stall += T; }
      const p = st(); naive[k] = { reached: ok, time: +t.toFixed(2), slowOrStalledFor: +stall.toFixed(2), end: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], hp: p.health }; G.clearInput(); }
    out.naive = naive;

    // ---------- DESCENTS (time and health), sprinting
    const desc = {};
    const D = {
      bed_step_off_east_edge:  { s: [30, 18, 70],  pts: [[40, 0, 70, 3]] },
      bed_via_bear_head:       { s: [10, 18, 50],  pts: [[10, 15, 43, 1.5], [10, 9, 36.2, 1.5], [10, 0, 24, 3]] },
      bed_via_bucket:          { s: [10, 18, 110], pts: [[10, 10, 118, 2], [10, 0, 132, 3]] },
      bed_down_blanket:        { s: [26, 18, 50],  pts: [[26, 0, 22, 2]] },
      bed_down_books:          { s: [26, 18, 110], pts: [[26, 0, 145, 2]] },
      desk_step_off_west_edge_n: { s: [100, 26, 60], pts: [[88, 0, 60, 3]] },
      desk_via_seat_and_tunnel: { s: [100, 26, 80], pts: [[93, 17, 80, 2], [79, 8, 80, 2.5], [77, 0, 97, 3]] },
      desk_down_ruler_and_skate: { s: [97, 26, 64.3], pts: [[94, 26, 64.3], [94, 17, 76.5, 1], [89, 17, 74.5, 1], [89, 0, 48.5, 2]] },
      tallL1_step_off:          { s: [112, 20, 140], pts: [[100, 0, 140, 3]] },
    };
    for (const k in D) { const d = D[k]; const hp = () => st().health; G.clearInput(); G.teleport(60, 0, 20); G.step(T); const before = G.damageLog.length;
      const run = FEEL.drive(d.s, d.pts, { sprint: true, maxT: 30 }); const dmg = G.damageLog.slice(before).map((x) => Math.round(x.amount));
      desc[k] = { ok: run.ok, time: run.time, damage: dmg, end: run.end }; }
    out.descents = desc;

    // ---------- SIGHTLINE PAIRS (eye to chest)
    const pairs = {
      tower_to_tower: [[70.5, 8.6, 11.5], [70.5, 8.0, 148.5]], greenGate_to_tanGate: [[60, 1.6, 28], [60, 1.0, 132]], greenSlit_to_tanSlit: [[54, 1.5, 25.2], [54, 1.5, 134.8]],
      bedEdge_to_deskEdge: [[34.4, 19.6, 80], [95.6, 27, 60]], tallTop_to_greenTower: [[108.6, 61.6, 140], [70.5, 8.0, 11.5]], smallTop_to_tanTower: [[108.6, 41.6, 24], [70.5, 8.0, 148.5]],
      tallTop_to_smallTop: [[108.6, 61.6, 140], [110.5, 41, 24]], tallTop_to_greenSpawn: [[108.6, 61.6, 140], [60, 1, 20]], smallTop_to_tanSpawn: [[108.6, 41.6, 24], [60, 1, 140]],
      bedNorthEnd_to_greenSpawn: [[26, 19.6, 45.6], [60, 1, 20]], bedSouthEnd_to_tanSpawn: [[26, 19.6, 114.4], [60, 1, 140]], deskN_to_greenSpawn: [[104, 27.6, 55.6], [60, 1, 20]], deskS_to_tanSpawn: [[104, 27.6, 104.4], [60, 1, 140]],
    };
    out.sight = {}; for (const k in pairs) { const b = LOS.blocked(pairs[k][0], pairs[k][1]); out.sight[k] = b ? 'blocked by ' + b : 'OPEN, ' + Math.hypot(pairs[k][0][0] - pairs[k][1][0], pairs[k][0][1] - pairs[k][1][1], pairs[k][0][2] - pairs[k][1][2]).toFixed(0) + ' u'; }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
