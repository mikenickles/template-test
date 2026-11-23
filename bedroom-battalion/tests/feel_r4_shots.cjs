// Round 4: round 3 against round 4B, same cameras. (1) scale: player-eye views on the floor, desk, bed and under the bed;
// (2) routes from the places a player looks for them; (3) viewmodels: share of the screen each gun covers (frame with the gun
// against the frame right after a switch, when the gun is dropped out of view) at 1280x720; (4) HUD at 1280x720 and 1920x1080: title,
// freeze picker, live fight with kill feed; (5) a kill seen from 15 u.
const fs = require('fs');
const { launch } = require('./harness.cjs');
const { execSync } = require('child_process');
const S = '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad';
const BUILDS = { r3: S + '/index_r3.html', r4b: __dirname + '/../snapshots/index_r4b.html' };
const dir = __dirname + '/../screenshots/round4/';
const VIEWS = [
  ['scale_floor_spawn', [60, 0, 20], [60, 3, 80]], ['scale_floor_mid', [60, 0, 66], [60, 6, 140]], ['scale_floor_lookup_desk', [84, 0, 60], [104, 20, 75]],
  ['scale_desk_top', [100, 26, 66], [30, 10, 90]], ['scale_bed_top', [27, 18, 70], [100, 8, 80]], ['scale_under_bed', [26, 0, 80], [45, 1.5, 80]],
  ['route_westlane_to_slope', [42, 0, 24], [28, 8, 44]], ['route_eastdoor_to_chair', [80, 0, 38], [90, 12, 75]], ['route_desk_to_yoyo', [104, 26, 60], [107, 26, 55]],
  ['route_bed_to_bookstairs', [26, 18, 100], [26, 17, 116]], ['route_shelf_string', [104, 0, 20], [108, 25, 20]], ['route_spring_pad', [42, 0, 70], [37.5, 0, 80]],
];
(async () => {
  const cov = {};
  for (const build in BUILDS) {
    const h = await launch({ file: BUILDS[build] });
    await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r4_lib.js', 'utf8') });
    // title screen as loaded (1280x720)
    await h.page.waitForTimeout(800); await h.page.screenshot({ path: dir + `feel_${build}_title_1280.png` });
    await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.clearInput(); });
    for (const [name, pos, look] of VIEWS) { await h.page.evaluate(([pos, look]) => { const G = __game; G.clearView(); G.teleport(pos[0], pos[1], pos[2]); G.step(1 / 60); G.lookAt(look[0], look[1], look[2]); G.render(); }, [pos, look]); await h.page.screenshot({ path: dir + `feel_${build}_${name}.png` }); }
    // viewmodel coverage: look at the far wall from mid-room; frame with gun vs frame just after switching (gun dropped)
    cov[build] = {};
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
      const other = w === 'pistol' ? 'rifle' : 'pistol';
      await h.page.evaluate(([w, other]) => { const G = __game; G.teleport(60, 0, 60, 0, 0); G.selectWeapon(other); G.step(1.5); G.selectWeapon(w); G.step(1.5); G.look(0, 0.05); G.render(); }, [w, other]);
      const a = (await h.page.screenshot()).toString('base64'); await h.page.screenshot({ path: dir + `feel_${build}_vm_${w}.png` });
      await h.page.evaluate(([other]) => { const G = __game; G.selectWeapon(other); G.look(0, 0.05); G.render(); }, [other]);
      const b = (await h.page.screenshot()).toString('base64');
      cov[build][w] = await h.page.evaluate(async ([a, b]) => { const A = await R4.pixels(a), B = await R4.pixels(b); let n = 0, nb = 0; const w = A.w, h = A.h;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const d = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]); if (d > 30 && y > h * 0.3) { n++; if (x > w * 0.42 && x < w * 0.58) nb++; } }
        return { screenPct: +(100 * n / (w * h)).toFixed(1), centreStripPct: +(100 * nb / (w * h * 0.16)).toFixed(1) }; }, [a, b]);
      // fire and reload frames
      await h.page.evaluate(([w]) => { const G = __game; G.selectWeapon(w); G.step(1.5); G.give('ammo'); G.look(0, 0.05); G.setInput({ fire: true }); G.step(1 / 60); G.setInput({ fire: false }); G.render(); }, [w]);
      await h.page.screenshot({ path: dir + `feel_${build}_vm_${w}_fire.png` });
      await h.page.evaluate(() => { const G = __game; G.step(0.5); G.fire(); G.step(0.3); G.reload(); G.step(0.5); G.render(); });
      await h.page.screenshot({ path: dir + `feel_${build}_vm_${w}_reload.png` });
    }
    await h.page.evaluate(() => { const G = __game; G.selectWeapon('sniper'); G.step(1.5); G.teleport(109, 60, 144); G.lookAt(60, 0, 40); G.setInput({ scope: true }); G.step(0.5); G.render(); });
    await h.page.screenshot({ path: dir + `feel_${build}_vm_sniper_scoped.png` }); await h.page.evaluate(() => __game.clearInput());
    // HUD at two sizes: freeze picker and a live fight with a kill feed
    for (const [W, H] of [[1280, 720], [1920, 1080]]) {
      await h.page.setViewportSize({ width: W, height: H });
      await h.page.evaluate(() => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 3, autoplay: false }); G.setTimeScale(0); G.step(2); G.render(); });
      await h.page.screenshot({ path: dir + `feel_${build}_hud_freeze_${W}.png` });
      await h.page.evaluate(() => { const G = __game; G.setGodMode(true); G.step(4); G.teleport(60, 0, 40); G.step(20); G.lookAt(60, 1.5, 100); G.render(); });
      await h.page.screenshot({ path: dir + `feel_${build}_hud_live_${W}.png` });
    }
    await h.page.setViewportSize({ width: 1280, height: 720 });
    // a kill seen from 15 u: one Tan bot staged on the open floor, shot until it dies, frames through the tip-over
    const kf = [];
    await h.page.evaluate(() => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 4, autoplay: false }); G.setTimeScale(0); G.setGodMode(true); G.step(5.2); const tan = G.bots.find((b) => b.team === 'tan'); for (const b of G.bots) if (b !== tan) G.killBot(b.id);
      for (const b of G.bots) if (b !== tan && b.dead) { b.x = 5; b.y = -60; b.z = 5; } tan.x = 60; tan.y = 0; tan.z = 40; G.teleport(60, 0, 25); G.selectWeapon('rifle'); G.give('ammo'); G.step(0.6);
      tan.x = 60; tan.y = 0; tan.z = 40; tan.vx = tan.vz = 0; G.lookAt(tan.x, 1.0, tan.z); });
    for (let k = 0; k < 6; k++) { const dead = await h.page.evaluate(() => { const G = __game; const tan = G.bots.find((b) => b.team === 'tan' && !b.dead) || G.bots.find((b) => b.team === 'tan'); tan.x = 60; tan.z = 40; tan.vx = tan.vz = 0; G.lookAt(60, 1.0, 40); G.fire(); G.step(1 / 60); G.render(); return G.bots.filter((b) => b.team === 'tan').every((b) => b.dead); });
      const f = dir + `feel_${build}_kill_${k}.png`; await h.page.screenshot({ path: f }); kf.push(f); if (dead) break; await h.page.evaluate(() => { __game.step(0.15); }); }
    for (const t of [0.15, 0.3, 1.0]) { await h.page.evaluate((t) => { __game.step(t); __game.render(); }, t); const f = dir + `feel_${build}_kill_after${t}.png`; await h.page.screenshot({ path: f }); kf.push(f); }
    execSync(`montage ${kf.map((f) => '"' + f + '"').join(' ')} -tile 3x3 -geometry 426x240+2+2 "${dir}feel_cmp_${build}_kill.png"`);
    console.log(build, 'errors', JSON.stringify(h.errors));
    await h.browser.close();
  }
  // side-by-side montages r3 | r4b
  for (const [name] of VIEWS) execSync(`montage "${dir}feel_r3_${name}.png" "${dir}feel_r4b_${name}.png" -tile 2x1 -geometry 640x360+2+2 "${dir}feel_pair_${name}.png"`);
  console.log('viewmodel coverage (share of the 1280x720 screen; share of the centre strip 42-58 % width, lower 70 %)', JSON.stringify(cov));
})();
