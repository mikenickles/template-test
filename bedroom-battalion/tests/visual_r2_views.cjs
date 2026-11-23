// Round 2: named views, HUD states at 1280x720 and 1920x1080, viewmodels, and the round 1 carry-overs that can be seen.
const { open, hex, dE } = require('./visual_r2_lib.cjs');
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];

async function hudSet(h, tag) {
  const p = h.page;
  const reset = () => p.evaluate(() => { __game.clearView(); __game.clearInput(); __game.resetTargets(); __game.give('ammo'); __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); });
  const ticks = () => p.evaluate(() => { __game.render(); const c = document.getElementById('crosshair').children; const w = __game.state().weapon;
    return { weapon: w.name, spreadDeg: +w.spread.toFixed(2), gapPx: +parseFloat(c[1].style.top).toFixed(1), shown: getComputedStyle(document.getElementById('crosshair')).display }; });
  await reset();
  console.log(tag, 'idle', JSON.stringify(await ticks())); await h.snap(`visual_hud_idle_${tag}.png`);
  // crosshair per weapon, still / after a burst / moving / airborne
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    await p.evaluate((w) => { __game.selectWeapon(w); __game.step(1); }, w);
    const still = await ticks();
    await p.evaluate(() => { __game.setInput({ fire: true }); __game.step(0.5); __game.clearInput(); });
    const burst = await ticks();
    if (w === 'smg') await h.snap(`visual_hud_bloom_smg_${tag}.png`);
    await p.evaluate(() => { __game.step(1.5); __game.give('ammo'); __game.teleport(60, 0, 20, Math.PI, 0); __game.setInput({ forward: true, sprint: false }); __game.step(0.3); });
    const moving = await ticks();
    await p.evaluate(() => { __game.clearInput(); __game.setInput({ jump: true }); __game.step(0.2); __game.clearInput(); });
    const air = await ticks();
    await p.evaluate(() => { __game.step(1); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(0.5); });
    console.log(tag, w, 'gap px still/burst/moving/air', still.gapPx, burst.gapPx, moving.gapPx, air.gapPx, ' spread deg', still.spreadDeg, burst.spreadDeg, moving.spreadDeg, air.spreadDeg);
  }
  // hit marker and damage number: rifle body shot on the Green floor dummy at (60,0,50) from 8 units
  await reset();
  await p.evaluate(() => { __game.teleport(60, 0, 42, Math.PI, 0); __game.lookAt(60, 0.9, 50); __game.step(0.1); });
  let r = await p.evaluate(() => { const e = __game.fire(); __game.render(); return { e, hit: getComputedStyle(document.getElementById('hitm')).display, cls: document.getElementById('hitm').className,
    nums: [...document.querySelectorAll('.dmg')].filter((d) => d.style.display === 'block').map((d) => d.textContent + '|' + d.className) }; });
  console.log(tag, 'hit', JSON.stringify(r)); await h.snap(`visual_hud_hit_${tag}.png`);
  // kill marker: sniper head shot
  await p.evaluate(() => { __game.step(1); __game.resetTargets(); __game.selectWeapon('sniper'); __game.step(1); __game.lookAt(60, 1.6, 50); __game.setInput({ scope: true }); __game.step(0.4); });
  await h.snap(`visual_hud_scope_${tag}.png`);
  r = await p.evaluate(() => { const e = __game.fire(); __game.clearInput(); __game.step(1 / 60); __game.render(); return { e, cls: document.getElementById('hitm').className,
    nums: [...document.querySelectorAll('.dmg')].filter((d) => d.style.display === 'block').map((d) => d.textContent + '|' + d.className) }; });
  console.log(tag, 'kill', JSON.stringify(r)); await h.snap(`visual_hud_kill_${tag}.png`);
  // reload label and grenade aim
  await reset();
  await p.evaluate(() => { __game.setInput({ fire: true }); __game.step(0.5); __game.clearInput(); __game.reload(); __game.step(0.6); });
  await h.snap(`visual_hud_reload_${tag}.png`);
  await reset();
  await p.evaluate(() => { __game.teleport(60, 0, 30, Math.PI, 0.1); __game.setInput({ grenade: true }); __game.step(0.3); });
  await h.snap(`visual_hud_grenade_aim_${tag}.png`);
  await p.evaluate(() => { __game.clearInput(); __game.step(3); });
  // bright background: on the bed, looking at the sunlit pillows and out of the window; dark: under the bed
  await reset();
  await p.evaluate(() => { __game.teleport(26, 18, 96, 0, 0); __game.lookAt(26, 18.8, 104); __game.step(0.2); });
  await h.snap(`visual_hud_bright_pillow_${tag}.png`);
  await p.evaluate(() => { __game.teleport(26, 18, 80, 0, 0); __game.lookAt(-2, 55, 80); __game.step(0.2); });
  await h.snap(`visual_hud_bright_window_${tag}.png`);
  await p.evaluate(() => { __game.selectWeapon('sniper'); __game.step(1); __game.setInput({ scope: true }); __game.step(0.4); });
  await h.snap(`visual_hud_scope_window_${tag}.png`);
  await p.evaluate(() => { __game.clearInput(); __game.selectWeapon('rifle'); __game.teleport(20, 0, 95, 0, 0); __game.lookAt(20, 5, 60); __game.step(1); });
  await h.snap(`visual_hud_dark_underbed_${tag}.png`);
  const rects = await p.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
    return { ammo: r('ammo'), health: r('health'), w: innerWidth, h: innerHeight }; });
  console.log(tag, 'rects', JSON.stringify(rects));
}

(async () => {
  let h = await open({ width: 1280, height: 720 });
  const p = h.page;
  for (const v of VIEWS) { await p.evaluate((v) => { __game.setView(v); __game.render(); }, v); await h.grab(`visual_${v}.png`); }
  const views = await p.evaluate(() => __game.views);
  console.log('views', JSON.stringify(views));
  // bed_top: is the eye inside a dummy?
  const t = await p.evaluate(() => __game.state().targets.map((T) => ({ id: T.id, pos: T.pos, team: T.team })));
  const e = views.bed_top[0];
  for (const T of t) { const d = Math.hypot(T.pos[0] - e[0], T.pos[2] - e[2]); if (d < 1 && e[1] > T.pos[1] && e[1] < T.pos[1] + 1.85) console.log('bed_top eye is inside', T.id, JSON.stringify(T.pos), 'head spans y', T.pos[1] + 1.35, 'to', T.pos[1] + 1.8); }
  for (const [name, eye] of [['a', [31, 19.6, 80]], ['b', [31, 19.6, 84]]]) { await h.cam(eye, views.bed_top[1]); await h.grab(`visual_bed_top_proposed_${name}.png`); }
  await hudSet(h, '720');

  // viewmodels: each gun at the spawn, then pressed against the fort wall, then in the dim under-bed, then far haze
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
    await p.evaluate((w) => { __game.clearView(); __game.clearInput(); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.2); }, w);
    await h.grab(`visual_vm_${w}.png`, [640, 360, 640, 360]);
    await p.evaluate(() => { __game.teleport(52, 0, 23, Math.PI, 0); __game.setInput({ forward: true }); __game.step(1); __game.clearInput(); __game.step(0.5); });
    await h.grab(`visual_vm_${w}_wall.png`, [640, 360, 640, 360]);
  }
  const wall = await p.evaluate(() => { const s = __game.state().player; return [s.x, s.z]; });
  console.log('against fort wall at', JSON.stringify(wall));
  await p.evaluate(() => { __game.selectWeapon('sniper'); __game.step(1); __game.fire(); });
  await h.grab('visual_vm_sniper_flash.png', [320, 180, 960, 540]);
  await p.evaluate(() => { __game.step(2); __game.selectWeapon('rifle'); __game.step(1); __game.reload(); __game.step(1.1); });
  await h.grab('visual_vm_rifle_reload.png', [640, 360, 640, 360]);
  await p.evaluate(() => __game.step(3));

  // ---- carry-overs ----
  const walk = (x, z, yaw) => p.evaluate(([x, z, yaw]) => { __game.clearInput(); __game.teleport(x, 0, z, yaw, 0); __game.setInput({ forward: true }); __game.step(2); __game.clearInput(); __game.step(0.3); const s = __game.state().player; return [+s.x.toFixed(3), +s.z.toFixed(3)]; }, [x, z, yaw]);
  console.log('rest at west wall', JSON.stringify(await walk(3, 130, Math.PI / 2)));
  await p.evaluate(() => __game.look(Math.PI / 2, -0.9)); console.log(' skirting, looking down at the wall foot: centre', hex(await h.px(0.5, 0.5)), 'lower', hex(await h.px(0.5, 0.75)));
  await h.grab('visual_carry_skirting_touch.png');
  console.log('rest at door frame', JSON.stringify(await walk(44.75, 3, 0)));
  await p.evaluate(() => __game.look(0, 0)); console.log(' door frame straight on: centre', hex(await h.px(0.5, 0.5)));
  console.log('rest at door', JSON.stringify(await walk(30, 3, 0)));
  await p.evaluate(() => __game.look(0.6, 0)); console.log(' door, yaw 0.6: centre', hex(await h.px(0.5, 0.5)), 'right', hex(await h.px(0.85, 0.5)), 'left', hex(await h.px(0.15, 0.5)));
  await h.grab('visual_carry_door_yaw06.png');
  const probe = async (name, eye, tg) => { await h.cam(eye, tg); const c = await h.px(0.5, 0.5, 9); console.log(' colour', name, hex(c)); return c; };
  const bedShade = await probe('bed top shade', [8, 24, 75], [8, 18, 75.01]), bedSun = await probe('bed top sun', [27, 24, 75.5], [27.6, 18, 75.51]);
  const pilShade = await probe('pillow top shade', [9, 25, 106], [9, 19.8, 106.01]), pilSun = await probe('pillow top sun', [26, 25, 104], [26, 19.8, 104.01]);
  const under = await probe('bed underside', [20, 1.6, 95], [20, 6, 95.01]), floor = await probe('floor under bed', [14.4, 3, 96], [14.4, 0, 96.01]);
  await probe('bed side', [41, 12, 60], [35, 12, 60]); await probe('desk apron west face', [89, 21, 68], [95, 21, 68]);
  console.log(' pillow vs bed dE shade', dE(pilShade, bedShade), 'sun', dE(pilSun, bedSun), '| underside vs floor dE', dE(under, floor));
  await h.cam([30, 23, 48], [14, 18, 110]); await h.grab('visual_carry_bed_top.png');
  await h.cam([40, 1.6, 80], [10, 2, 80]); await h.grab('visual_carry_under_bed.png');
  await h.cam([60, 6, 44], [60, 1, 30]); await h.grab('visual_carry_crayons_fort.png');
  await h.cam([84, 22, 62], [95, 20, 70]); await h.grab('visual_carry_apron.png');
  const col = await p.evaluate(() => __game.colliders.filter((c) => /crayon|apron/.test(c.id)).map((c) => [c.id, c.x0, c.x1, c.z0, c.z1, c.y0, c.y1]));
  console.log('colliders', JSON.stringify(col), 'total', await p.evaluate(() => __game.colliders.length));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();

  h = await open({ width: 1920, height: 1080 });
  await hudSet(h, '1080');
  console.log('errors 1080', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
