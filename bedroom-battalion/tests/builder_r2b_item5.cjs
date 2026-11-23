// Round 2 pass 2, FIXLIST item 5: team colour against background at 10 / 60 / 100 units (this build and, if given, an
// old-colour copy of the page), impact colours on their surfaces, sniper muzzle flash, damage numbers and HUD over a pale wall.
// Usage: node builder_r2b_item5.cjs [path to old-colour copy of index.html]
// Pixel analysis is done by builder_r2b_pixels.py on the screenshots this writes to screenshots/round2/builder_r2b_*.png.
const fs = require('fs'), path = require('path');
const { launch, GAME } = require('./harness.cjs');
const OLD = process.argv[2];
const SHOTS = path.resolve(__dirname, '..', 'screenshots', 'round2');

async function teamViews(file, tag) {
  const { browser, page, errors } = await launch({ width: 1280, height: 720, file });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  await page.addStyleTag({ content: '#hud { display: none !important; }' });      // test-side only: sample the world without the crosshair
  // viewing spots: floor ring points and waypoint nodes, with a clear line from the eye to the body centre and 1 unit to each side of it
  const views = await page.evaluate(() => {
    const g = __game, N = g.waypoints.nodes, out = [];
    for (const team of ['tan', 'green']) for (const d of [10, 60, 100]) {
      let n = 0;
      for (const T of g.state().targets.filter((t) => t.team === team)) {
        const bx = T.pos[0], by = T.pos[1] + 0.7, bz = T.pos[2];
        const cands = [];
        for (let a = 0; a < 360; a += 10) cands.push([bx + d * Math.sin(a * Math.PI / 180), 0, bz + d * Math.cos(a * Math.PI / 180)]);
        for (const id in N) cands.push(N[id]);
        for (const P of cands) {
          if (P[0] < 1 || P[0] > 119 || P[2] < 1 || P[2] > 159) continue;
          const ey = P[1] + 1.6, dist = Math.hypot(bx - P[0], by - ey, bz - P[2]);
          if (Math.abs(dist - d) > 2.5) continue;
          const h = g.raycast([P[0], ey, P[2]], [bx - P[0], by - ey, bz - P[2]]); if (!h || h.id !== T.id) continue;
          if (P[1] === 0) { const dn = g.raycast([P[0], 1.7, P[2]], [0, -1, 0]); if (!dn || dn.id !== 'room.floor' || dn.distance < 1.69) continue; }
          out.push({ team, d, id: T.id, eye: [P[0], ey, P[2]], body: [bx, by, bz], dist: +dist.toFixed(1) }); n++;
          break;
        }
        if (n >= 10) break;
      }
    }
    return out;
  });
  const rows = [];
  for (const [i, v] of views.entries()) {
    await page.evaluate((v) => { const g = __game; g.teleport(v.eye[0], v.eye[1] - 1.6, v.eye[2]); g.lookAt(v.body[0], v.body[1], v.body[2]); g.render(); }, v);
    const f = `builder_r2b_team_${tag}_${v.team}_${v.d}_${i}.png`;
    await page.screenshot({ path: path.join(SHOTS, f) });
    rows.push({ ...v, file: f });
  }
  await browser.close();
  return { rows, errors };
}

(async () => {
  const result = { team: { now: await teamViews(GAME, 'now') } };
  if (OLD) result.team.old = await teamViews(OLD, 'old');
  // ---- impacts, flash, damage numbers, HUD on this build ----
  const { browser, page, errors } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  // impacts: pistol shot from close range at a surface; kick, shake and tracer do not matter for the particle colour
  const impacts = [
    ['wood_floor', [60, 0, 62], [60, 0, 66.5]], ['wood_deskleg', [92, 0, 56.2], [95, 1.2, 56.2]], ['wood_bedleg', [38, 0, 46.5], [35, 1.5, 46.5]],
    ['wood_shelfpost', [104, 0, 117], [108, 1.2, 116.6]], ['fabric_bedside', [40, 0, 70], [35, 9, 70]], ['fabric_blanket', [27, 18, 75], [27, 18, 71]],
    ['fabric_bear', [10, 0, 50], [10, 4, 45]], ['fabric_pillow', [26, 18, 96], [26, 18.8, 100]]];
  result.impacts = [];
  // test-only CONFIG changes so the before/after frames differ only by the particles (restored after)
  await page.evaluate(() => { const C = __game.CONFIG, P = C.weapons.pistol; window._keep = [P.kickUp, P.kickSide, P.shake, C.gun.flashTime, C.fx.tracerLife, C.fx.casingLife, C.fx.decalSize];
    P.kickUp = P.kickSide = P.shake = 0; C.gun.flashTime = 0; C.fx.tracerLife = 0.001; C.fx.casingLife = 0.001; C.fx.decalSize = 0; });
  for (const [name, at, aim] of impacts) {
    await page.evaluate(([at, aim]) => { const g = __game; g.clearInput(); g.give('ammo'); g.selectWeapon('pistol'); g.teleport(at[0], at[1], at[2]); g.step(1.5); g.lookAt(aim[0], aim[1], aim[2]); g.render(); }, [at, aim]);
    const clip = { x: 540, y: 260, width: 200, height: 200 }, fb = `builder_r2b_impact_${name}_before.png`, f = `builder_r2b_impact_${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, fb), clip });
    const info = await page.evaluate(() => { const g = __game, s = g.fire(); g.step(2 / 60); g.render(); return { hit: s.hit, surface: s.surface, distance: s.distance }; });
    await page.screenshot({ path: path.join(SHOTS, f), clip });
    result.impacts.push({ name, ...info, file: f, before: fb });
    await page.evaluate(() => __game.step(1));
  }
  await page.evaluate(() => { const C = __game.CONFIG, P = C.weapons.pistol, k = window._keep; [P.kickUp, P.kickSide, P.shake, C.gun.flashTime, C.fx.tracerLife, C.fx.casingLife, C.fx.decalSize] = k; });
  // sniper muzzle flash: frames on the shot tick and after, plus rifle for reference
  result.flash = [];
  for (const w of ['sniper', 'rifle']) {
    await page.evaluate((w) => { const g = __game; g.clearInput(); g.give('ammo'); g.teleport(60, 0, 60, 0, 0); g.selectWeapon(w); g.step(1.5); g.look(0, 0.3); g.fire(); g.render(); }, w);
    for (let k = 0; k <= 4; k++) {
      const f = `builder_r2b_flash_${w}_tick${k}.png`;
      await page.screenshot({ path: path.join(SHOTS, f), clip: { x: 640, y: 300, width: 640, height: 420 } });
      result.flash.push({ w, tick: k, file: f });
      await page.evaluate(() => { __game.step(1 / 60); __game.render(); });
    }
    // flash with no sim ticks but many renders: stays the same time-based length (rendered 6 times on the shot tick)
    await page.evaluate(() => { const g = __game; g.step(1.5); g.fire(); for (let i = 0; i < 6; i++) g.render(); });
    const f = `builder_r2b_flash_${w}_after6renders.png`;
    await page.screenshot({ path: path.join(SHOTS, f), clip: { x: 640, y: 300, width: 640, height: 420 } }); result.flash.push({ w, tick: 'renders6', file: f });
  }
  // damage numbers over a pale background: SMG burst into the bed-top dummy from the floor (window wall behind)
  result.numbers = await page.evaluate(() => {
    const g = __game, out = []; g.clearInput(); g.resetTargets(); g.give('ammo'); g.selectWeapon('smg'); g.teleport(97, 26, 64.3); g.step(1);
    g.lookAt(104, 26.7, 66); g.setInput({ fire: true });        // desk dummy, east wall behind it
    for (let i = 0; i < 14; i++) { g.lookAt(104, 26.7, 66); g.step(1 / 60); }
    g.clearInput(); g.render();
    const cx = innerWidth / 2, cy = innerHeight / 2, R = [];
    for (const el of document.querySelectorAll('.dmg')) if (el.style.display === 'block') { const b = el.getBoundingClientRect(); R.push({ t: el.textContent, l: b.left, r: b.right, tp: b.top, bt: b.bottom }); }
    let overlaps = 0; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (R[i].l < R[j].r && R[j].l < R[i].r && R[i].tp < R[j].bt && R[j].tp < R[i].bt) overlaps++;
    const coverCross = R.filter((b) => b.l < cx + 12 && b.r > cx - 12 && b.tp < cy + 12 && b.bt > cy - 12).length;
    const minDist = Math.min(...R.map((b) => Math.max(0, Math.max(b.l - cx, cx - b.r, b.tp - cy, cy - b.bt))));
    return { shown: R.length, texts: R.map((b) => b.t), overlaps, coveringCrosshair: coverCross, nearestEdgeToCentrePx: +minDist.toFixed(1), shotLog: g.shotLog.slice(-8).map((s) => s.hit) };
  });
  await page.screenshot({ path: path.join(SHOTS, 'builder_r2b_numbers_pale.png') });
  // HUD text over a pale wall and skirting: 2 units from the east wall, facing it
  await page.evaluate(() => { const g = __game; g.clearInput(); g.selectWeapon('rifle'); g.teleport(118, 0, 140, -Math.PI / 2, 0); g.step(1); g.look(-Math.PI / 2, 0.05); g.render(); });
  await page.screenshot({ path: path.join(SHOTS, 'builder_r2b_hud_palewall.png') });
  await page.evaluate(() => { const g = __game; g.look(-Math.PI / 2, -0.6); g.render(); });
  await page.screenshot({ path: path.join(SHOTS, 'builder_r2b_hud_paleskirting.png') });
  // named views
  for (const v of ['bed_top', 'desk_top', 'west_lane', 'spawn_tan']) { await page.evaluate((v) => { __game.setView(v); __game.render(); }, v); await page.screenshot({ path: path.join(SHOTS, `builder_r2b_view_${v}.png`) }); }
  await page.evaluate(() => __game.clearView());
  result.views = await page.evaluate(() => ({ bed_top: __game.views.bed_top, desk_top: __game.views.desk_top, west_lane: __game.views.west_lane }));
  result.errors = { now: result.team.now.errors, old: result.team.old && result.team.old.errors, main: errors };
  fs.writeFileSync(path.join(__dirname, 'builder_r2b_item5.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ impacts: result.impacts, numbers: result.numbers, views: result.views, errors: result.errors, teamViews: { now: result.team.now.rows.length, old: result.team.old ? result.team.old.rows.length : 0 } }, null, 1));
  await browser.close();
})();
