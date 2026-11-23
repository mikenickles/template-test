// Round 2: the grenade starts 0.54 in front of the eye. Pressed against a wall that is inside it, and it flies through.
// Demo against the dummy behind the Tan fort wall, with a control throw from one step back, and out of the room.
const { boot } = require('./bug_lib.cjs');
const path = require('path');
(async () => {
  const { browser, page, errors } = await boot({ width: 960, height: 540 });
  const out = await page.evaluate(() => {
    const G = __game, r = {};
    const run = (z, crouch) => { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.shotLog.length = 0; G.teleport(66, 0, z, 0, 0); G.setInput({ crouch }); G.step(0.5); G.look(Math.PI, -0.2); const p = G.state().player; G.setInput({ crouch, grenade: true }); G.step(0.1); G.setInput({ crouch, grenade: false }); G.step(1 / 60); const o = G.grenades[0], start = [o.x, o.y, o.z].map((v) => +v.toFixed(2)); let last = start; for (let i = 0; i < 130 && G.grenades.length; i++) { last = [o.x, o.y, o.z].map((v) => +v.toFixed(2)); G.step(1 / 60); } G.clearInput(); return { playerZ: +p.z.toFixed(2), grenadeStart: start, burst: last, dummy21: G.shotLog.filter((e) => e.weapon === 'grenade').map((e) => e.hit + ' ' + e.damage), hp: G.state().targets[20].hp }; };
    r.pressedAgainstTanFrontWallCrouched = run(133.6, true);       // wall is z 134..135.5, low part y 0..1.15
    r.controlOneStepBack = run(132.9, true);
    r.pressedStanding = run(133.6, false);
    // out of the room
    G.clearInput(); G.give('grenade'); G.teleport(119.6, 0, 80.5, -Math.PI / 2, 0); G.step(0.3); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(1 / 60); const o = G.grenades[0]; const tr = []; for (let i = 0; i < 125 && G.grenades.length; i++) { if (i % 30 === 0) tr.push([o.x, o.y, o.z].map((v) => +v.toFixed(1))); G.step(1 / 60); }
    r.eastRoomWall = { trace: tr };
    // elevation: DESIGN says view direction plus 10 degrees up
    r.elevation = [0, 0.4, -0.4].map((pitch) => { G.give('grenade'); G.teleport(60, 0, 100, 0, pitch); G.step(0.2); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(1 / 60); const g = G.grenades[G.grenades.length - 1], vy = g.vy + 22 / 60, sp = Math.hypot(g.vx, vy, g.vz); const res = { viewPitchDeg: +(pitch * 180 / Math.PI).toFixed(1), launchDeg: +(Math.asin(vy / sp) * 180 / Math.PI).toFixed(1), speed: +sp.toFixed(2) }; G.step(2.2); return res; });
    return r;
  });
  for (const k in out) console.log(k + ': ' + JSON.stringify(out[k]));
  await page.evaluate(() => { __game.setView('desk_top'); __game.render(); });
  const f = path.resolve(__dirname, '..', 'screenshots', 'round2', 'bug_r2_view_desk_top.png'); await page.screenshot({ path: f });
  await page.evaluate(() => { __game.setView('west_lane'); __game.render(); }); await page.screenshot({ path: f.replace('desk_top', 'west_lane') });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
