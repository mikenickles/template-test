// Round 2 checks 6 (target dummies) and 8 (the ten carry-overs in DESIGN 15.5). Tick-limited loops only.
const { boot } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const path = require('path');

(async () => {
  const { browser, page, errors } = await boot({ width: 960, height: 540 });
  await page.evaluate(installR2);
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const T = (id) => G.state().targets.find((t) => t.id === id);
    // DESIGN 15.3 positions
    const spots = [[60, 0, 34], [60, 0, 50], [48, 0, 80], [70.8, 0, 80], [60, 0, 110], [60, 0, 126], [38, 0, 64], [100, 0, 66], [100, 0, 94], [38, 0, 96], [60, 1.2, 78], [27, 18, 80], [26, 18, 50], [104, 26, 66], [104, 26, 94], [112, 20, 131], [112, 60, 139], [112, 40, 16], [77, 8, 80], [70.5, 7, 150.5], [66, 0, 137]];
    const ts = G.state().targets;
    out.positions = { count: ts.length, mismatches: spots.map((s, i) => (ts[i] && ts[i].pos.join() === s.join() ? null : { i, design: s, build: ts[i] && ts[i].pos })).filter(Boolean), teams: ts.map((t) => t.pos[2] + ':' + t.team).join(' '), allHp100: ts.every((t) => t.hp === 100 && !t.down) };
    // is each dummy standing on something (not floating, not inside a solid)?
    out.placement = ts.map((t) => { const below = G.raycast([t.pos[0], t.pos[1] + 0.5, t.pos[2]], [0, -1, 0]); const inside = R2.inSolid(t.pos[0], t.pos[1] + 0.9, t.pos[2]) || R2.inSolid(t.pos[0], t.pos[1] + 1.6, t.pos[2]); return (Math.abs((below ? below.distance : 99) - 0.5) > 0.02 || inside) ? { id: t.id, groundBelow: below && [below.id, +below.distance.toFixed(2)], inside } : null; }).filter(Boolean);

    // ---- each dummy: 4 pistol body shots (30 each) from a few units away, then the down / stand-up cycle ----
    out.each = [];
    for (const t of ts) {
      G.clearInput(); G.resetTargets(); G.give('ammo'); G.give('health'); G.selectWeapon('rifle'); G.selectWeapon('pistol');
      // find a place to stand: around the dummy at its level
      let stand = null;
      for (let k = 0; k < 24 && !stand; k++) { const a = k * Math.PI / 12, r = 2.2 + (k % 3) * 0.8, x = t.pos[0] + Math.cos(a) * r, z = t.pos[2] + Math.sin(a) * r; if (R2.inSolid(x, t.pos[1] + 0.3, z) || R2.inSolid(x, t.pos[1] + 1.6, z)) continue; G.teleport(x, t.pos[1] + 0.2, z); G.step(0.3); const p = G.state().player; if (!p.onGround || Math.abs(p.y - t.pos[1]) > 0.05) continue; const rc = G.raycast([p.x, p.y + 1.0, p.z], [t.pos[0] - p.x, 0.7 - 1.0, t.pos[2] - p.z]); if (rc && rc.id === t.id) stand = [p.x, p.y, p.z]; }
      if (!stand) { out.each.push({ id: t.id, error: 'no place to stand with a clear shot' }); continue; }
      G.setInput({ crouch: true }); G.step(0.6);
      const hp = [], zones = [];
      for (let i = 0; i < 4; i++) { G.lookAt(t.pos[0], t.pos[1] + 0.7, t.pos[2]); const e = G.fire(); zones.push(e ? (e.hit === t.id ? e.zone + e.damage : 'MISS:' + e.hit) : 'null'); hp.push(T(t.id).hp); G.step(0.3); }
      const down = T(t.id).down;
      // while down: shots pass through, hp stays 0
      G.lookAt(t.pos[0], t.pos[1] + 0.7, t.pos[2]); const through = G.fire(); const hpDown = T(t.id).hp;
      let n = 0; for (; n < 400 && T(t.id).down; n++) G.step(DT);
      const upAfter = +((n) / 60 + 0.3 * 1 + 0).toFixed(2);        // one 0.3 s step followed the killing shot
      G.clearInput();
      const ok = hp.join() === '70,40,10,0' && down && hpDown === 0 && (!through || through.hit !== t.id) && T(t.id).hp === 100 && Math.abs(upAfter - 3) < 0.06;
      out.each.push({ id: t.id, ok, hpAfterEachShot: hp, shots: zones, downAfter4: down, shotWhileDown: through && through.hit, hpWhileDown: hpDown, standsUpAfterSecs: upAfter, hpAfterStanding: T(t.id).hp });
    }
    // overkill, headshot kill, damage carried between weapons, partial damage does not heal by itself
    G.clearInput(); G.resetTargets(); G.give('ammo'); G.selectWeapon('rifle'); G.teleport(60, 0, 116, 0, 0); G.step(1); G.lookAt(60, 0.8, 110); G.fire(); G.step(8);
    out.partialDamagePersists = T('target.5').hp;
    G.selectWeapon('sniper'); G.step(1); G.setInput({ scope: true }); G.step(0.5); G.lookAt(60, 1.57, 110); const hk = G.fire(); G.clearInput();
    out.headshotOverkill = { shot: hk && [hk.zone, hk.damage], hp: T('target.5').hp, down: T('target.5').down };
    out.resetWhileDown = (G.resetTargets(), { ret: true, hp: T('target.5').hp, down: T('target.5').down });
    G.step(4); out.afterResetNoGhostTimer = { hp: T('target.5').hp, down: T('target.5').down };
    // damage numbers and hit marker in the DOM after a render
    G.resetTargets(); G.selectWeapon('pistol'); G.step(1); G.lookAt(60, 0.8, 110); G.fire(); G.step(DT); G.render();
    out.dom = { numbersShown: [...document.querySelectorAll('.dmg')].filter((e) => e.style.display === 'block').map((e) => e.textContent), hitMarker: getComputedStyle(document.getElementById('hitm')).display, ammoText: document.getElementById('wname').textContent + ' ' + document.getElementById('mag').textContent + '/' + document.getElementById('res').textContent, grenadeText: document.querySelector('#ammo').textContent };

    // ---- carry-overs ----
    const C = (out.carry = {});
    // 1. trim thinned to 0.3: handled outside with screenshots. 2. counters include the shadow pass
    G.teleport(60, 0, 20, Math.PI, 0); G.render(); C.c2_counters = { drawCalls: G.state().drawCalls, triangles: G.state().triangles }; G.render(); C.c2_secondRenderSame = { drawCalls: G.state().drawCalls, triangles: G.state().triangles };
    C.c3_stepSmooth = G.CONFIG.player.stepSmooth;
    C.c4_views = { west_lane: G.views.west_lane[0], desk_top: G.views.desk_top[0], westEyeInsideSolid: R2.inSolid(...G.views.west_lane[0]), deskEyeInsideSolid: R2.inSolid(...G.views.desk_top[0]) };
    for (const v of ['west_lane', 'desk_top']) { const e = G.views[v][0], l = G.views[v][1], d = [l[0] - e[0], l[1] - e[1], l[2] - e[2]], r = G.raycast(e, d); C.c4_views[v + '_firstThingAlongTheView'] = r && [r.id, +r.distance.toFixed(1)]; }
    const col = (re) => G.colliders.filter((c) => re.test(c.id)).map((c) => `${c.id} [${c.x0}..${c.x1}, ${c.z0}..${c.z1}, ${c.y0}..${c.y1}]`);
    C.c5_crayons = col(/crayon/);
    C.c7_bearHead = col(/bear\.head/);
    C.c8_apron = col(/apron/);
    // 5. do the crayons still mask the slits? from each slit centre at eye height, straight out 40 units
    C.c5_slitViews = [48.5, 53.5, 64.75, 69.75].map((x) => { const r = G.raycast([x, 1.5, 24], [0, 0, 1]); return x + ':' + (r ? r.id + '@' + r.distance.toFixed(1) : 'clear'); });
    // 7. bear: walk off the bed north end above the bear, land on the body ledge (9), then down
    G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(10, 18, 47, 0, 0); G.step(0.2); G.setInput({ forward: true }); const trail = []; let ly = 18;
    for (let i = 0; i < 600; i++) { G.step(DT); const p = G.state().player; if (p.onGround && Math.abs(p.y - ly) > 0.5) { trail.push(+p.y.toFixed(1)); ly = p.y; } if (p.onGround && p.y < 0.01) break; }
    G.clearInput(); C.c7_bearWalkDown = { landings: trail, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) };
    // 8. desk apron: the finding 12 repro and its two variants
    C.c8_repros = [];
    for (const [x, z, tx, tz] of [[93.31, 76.66, 94, 75], [92.5, 77, 95.2, 70], [92.5, 83, 95.2, 90]]) { G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(x, 17, z); G.step(0.2); G.lookAt(tx, 18.6, tz); G.setInput({ forward: true }); G.step(4); G.clearInput(); const p = G.state().player; C.c8_repros.push({ end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) }); }
    // apron lanes: straight up each ruler across its width must still work
    C.c8_rulerLanes = [];
    for (const [z0, yaw, done] of [[78, 0, (p) => p.y > 25.99 && p.z < 64.6], [82, Math.PI, (p) => p.y > 25.99 && p.z > 95.4]]) for (const x of [92.55, 93.5, 94.5, 95, 95.45, 95.8]) { G.clearInput(); G.teleport(x, 17, z0, yaw, 0); G.step(0.2); G.setInput({ forward: true }); let ok = false; for (let i = 0; i < 400 && !ok; i++) { G.step(DT); const p = G.state().player; ok = p.onGround && done(p); } C.c8_rulerLanes.push(x + (yaw ? 's' : 'n') + ':' + (ok ? 'top' : 'STOP@' + G.state().player.y.toFixed(1))); }
    G.clearInput();
    // 9. no grab while falling faster than 12 u/s
    C.c9 = [];
    for (const above of [0.2, 1, 2, 3, 3.5, 4, 5, 10, 55]) { G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(107, 26 + above, 53.9, Math.PI, 0); let g = null; for (let i = 0; i < 900; i++) { const b = G.state().player; if (b.y < 24.5) G.setInput({ forward: true }); G.step(DT); const p = G.state().player; if (p.climbing) { g = +b.vy.toFixed(1); break; } if (p.onGround) break; } G.clearInput(); C.c9.push({ startAboveTop: above, grabbedAtFallSpeed: g, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) }); }
    // slow descent by repeated let-go and re-grab still possible? (each drop stays under 12 u/s for 0.45 s -> 9.9 u/s)
    G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(107, 26, 57, 0, 0); G.step(0.2); G.setInput({ forward: true }); for (let i = 0; i < 120 && !G.state().player.climbing; i++) G.step(DT);
    let hops = 0; for (let i = 0; i < 1200 && !G.state().player.onGround; i++) { const p = G.state().player; if (p.climbing) { G.setInput({ jump: true, forward: true }); G.step(DT); G.setInput({ jump: false, forward: true }); hops++; } else G.step(DT); }
    G.clearInput(); C.c9_letGoRegrabLadder = { hops, endY: G.state().player.y, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) };
    // 10. walkPath refuses one-way edges backward
    C.c10 = { bedSpringBackward: G.walkPath(['m.bed', 'm.bed.e', 'm.pad', 'n.w.5']), tunnelBackward: G.walkPath(['m.tunnel.top', 'm.seat']), forwardStillOk: G.walkPath(G.routes.tunnel_drop).ok, padForward: G.walkPath(G.routes.bed_spring).ok };
    return out;
  });
  console.log('positions:', JSON.stringify(out.positions));
  console.log('placement problems:', JSON.stringify(out.placement));
  const badEach = out.each.filter((e) => !e.ok);
  console.log(`each dummy (4 pistol body shots, down, shot while down, stand up): ${out.each.length - badEach.length} of ${out.each.length} as designed`);
  for (const e of badEach) console.log('   ', JSON.stringify(e));
  console.log('   sample:', JSON.stringify(out.each[0]));
  for (const k of ['partialDamagePersists', 'headshotOverkill', 'resetWhileDown', 'afterResetNoGhostTimer', 'dom']) console.log(k + ':', JSON.stringify(out[k]));
  for (const k in out.carry) console.log('CARRY ' + k + ': ' + JSON.stringify(out.carry[k]));
  // carry-over 1 and 6: screenshots against the wall, in the corner, at the door frame; and the bed
  const shots = [];
  const shot = async (name, x, y, z, yaw, pitch) => { await page.evaluate(([x, y, z, yaw, pitch]) => { __game.clearView(); __game.clearInput(); __game.teleport(x, y, z, yaw, pitch); __game.step(0.1); __game.render(); }, [x, y, z, yaw, pitch]); const f = path.resolve(__dirname, '..', 'screenshots', 'round2', name); require('fs').mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f }); shots.push(f); };
  await shot('bug_r2_skirting_against_east_wall.png', 119.6, 0, 68, 0, -0.25);
  await shot('bug_r2_skirting_corner_ne.png', 119.6, 0, 0.4, Math.PI * 0.75, -0.3);
  await shot('bug_r2_doorframe.png', 13.25, 0, 0.4, -Math.PI / 2, 0);
  await shot('bug_r2_bed_top.png', 60, 0, 60, Math.PI / 2 - 0.3, 0.25);
  await shot('bug_r2_under_bed.png', 30, 0, 80, Math.PI / 2, 0.5);
  console.log('trim colliders / visuals: see screenshots', shots.join(' '));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
