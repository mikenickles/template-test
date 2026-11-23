// Misc: big time steps / time scale, window resize, camera against the skirting board and door frame
// (visual-only boxes thicker than the player radius), hook use while paused / on the title.
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');
const SHOTS = process.argv[2] || path.resolve(__dirname, '..', 'screenshots', 'round1');

(async () => {
  const { browser, page, errors } = await launch({ width: 960, height: 540 });
  const out = {};
  // ---- hook before start: step() on the title screen ----
  out.stepOnTitle = await page.evaluate(() => { __game.setTimeScale(0); const a = __game.state(); __game.setInput({ forward: true }); __game.step(1); __game.clearInput(); const b = __game.state(); return { phase: b.phase, moved: +(b.player.z - a.player.z).toFixed(2), time: b.time }; });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });

  // ---- one huge step: 10 minutes of sprint-jumping into a corner, then into the pad ----
  out.hugeStep = await page.evaluate(() => {
    const r = {};
    __game.teleport(118, 0, 158, Math.atan2(-1, -1), 0); __game.setInput({ forward: true, sprint: true, jump: true });
    const n = __game.step(600); const p = __game.state().player; r.corner = { ticks: n, pos: [p.x, p.y, p.z], rescues: __game.rescueLog.length };
    __game.teleport(42, 0, 80, Math.PI / 2, 0); __game.setInput({ forward: true, sprint: false, jump: false });
    __game.step(300); const q = __game.state().player; r.padLoop = { pos: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)], hp: q.health, dmg: __game.damageLog.length, rescues: __game.rescueLog.length };
    __game.clearInput();
    return r;
  });
  // ---- real-time loop at high time scales while sprinting into walls ----
  out.timeScale = [];
  for (const scale of [4, 20, 200]) {
    out.timeScale.push(await page.evaluate(async (scale) => {
      __game.rescueLog.length = 0;
      __game.teleport(100, 0, 150, -Math.PI / 4 * 3, 0); __game.setInput({ forward: true, sprint: true });
      const t0 = __game.state().time, w0 = performance.now();
      __game.setTimeScale(scale);
      await new Promise((r) => setTimeout(r, 1500));
      __game.setTimeScale(0); __game.clearInput();
      const p = __game.state().player;
      return { scale, simSecs: +(__game.state().time - t0).toFixed(2), realSecs: +((performance.now() - w0) / 1000).toFixed(2), pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], inRoom: p.x >= 0.4 - 1e-6 && p.x <= 119.6 + 1e-6 && p.z >= 0.4 - 1e-6 && p.z <= 159.6 + 1e-6, rescues: __game.rescueLog.length };
    }, scale));
  }
  // ---- resize ----
  await page.setViewportSize({ width: 500, height: 800 }); await page.waitForTimeout(300);
  out.resizeTall = await page.evaluate(() => { __game.render(); const c = document.getElementById('view'); return { canvas: [c.width, c.height], css: [c.clientWidth, c.clientHeight], win: [innerWidth, innerHeight] }; });
  await page.setViewportSize({ width: 960, height: 540 }); await page.waitForTimeout(300);
  out.resizeBack = await page.evaluate(() => { __game.render(); const c = document.getElementById('view'); return { canvas: [c.width, c.height], win: [innerWidth, innerHeight] }; });

  // ---- camera vs the skirting board (0.6 thick, visual only) and the door frame (0.7 deep) ----
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (name, x, y, z, yaw, pitch) => {
    await page.evaluate(([x, y, z, yaw, pitch]) => { __game.clearView(); __game.setDebug(false); __game.teleport(x, y, z, yaw, pitch); __game.step(0.1); __game.render(); }, [x, y, z, yaw, pitch]);
    const file = path.join(SHOTS, name); await page.screenshot({ path: file }); return file;
  };
  out.shots = [];
  // pressed against the east wall in open floor, looking along the wall (north) and down along it
  await page.evaluate(() => { __game.teleport(118, 0, 68, -Math.PI / 2, 0); __game.setInput({ forward: true }); __game.step(1); __game.clearInput(); });
  out.atEastWall = await page.evaluate(() => { const p = __game.state().player; return [p.x, p.y, p.z]; });
  out.shots.push(await shot('bug_skirting_1_against_east_wall_look_north.png', out.atEastWall[0], 0, out.atEastWall[2], 0, -0.25));
  out.shots.push(await shot('bug_skirting_2_one_unit_off_wall_look_north.png', 119.0, 0, 68, 0, -0.25));
  out.shots.push(await shot('bug_skirting_3_against_east_wall_look_at_wall.png', out.atEastWall[0], 0, out.atEastWall[2], -Math.PI / 2 + 0.6, -0.5));
  // north wall at the door frame post (x 12.5..14, 0.7 deep)
  await page.evaluate(() => { __game.teleport(13.25, 0, 3, 0, 0); __game.setInput({ forward: true }); __game.step(1); __game.clearInput(); });
  out.atDoorFrame = await page.evaluate(() => { const p = __game.state().player; return [p.x, p.y, p.z]; });
  out.shots.push(await shot('bug_doorframe_1_against_frame_look_east.png', out.atDoorFrame[0], 0, out.atDoorFrame[2], -Math.PI / 2, 0));
  out.shots.push(await shot('bug_doorframe_2_against_frame_look_up.png', out.atDoorFrame[0], 0, out.atDoorFrame[2], 0, 1.2));
  // corner of the room
  out.shots.push(await shot('bug_skirting_4_room_corner_ne.png', 119.6, 0, 0.4, Math.PI * 0.75, -0.3));

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
