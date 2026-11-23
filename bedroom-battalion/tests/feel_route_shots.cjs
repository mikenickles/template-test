// Can each route be spotted from where a player first needs it? Player-eye shots (standing eye height).
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const S = [
    ['feel_r01_green_wdoor_to_blanket.png',   [44.5, 0, 17],  [26, 6, 35]],
    ['feel_r02_tan_wdoor_to_bedbooks.png',    [44.5, 0, 143], [26, 6, 128]],
    ['feel_r03_westlane_to_spring.png',       [39, 0, 62],    [38, 0.4, 80]],
    ['feel_r04_green_edoor_to_skate.png',     [75.5, 0, 17],  [92, 10, 62]],
    ['feel_r05_tan_edoor_to_chairstairs.png', [75.5, 0, 143], [92, 10, 98]],
    ['feel_r06_green_edoor_to_smallshelf.png',[75.5, 0, 17],  [107, 12, 22]],
    ['feel_r07_tan_edoor_to_tallshelf.png',   [75.5, 0, 143], [108, 22, 136]],
    ['feel_r08_floor_to_yoyo.png',            [96, 0, 38],    [107, 9, 54.5]],
    ['feel_r09_seat_from_skate_top.png',      [89, 17, 73.6], [89, 19, 84]],
    ['feel_r10_seat_look_at_ruler_n.png',     [89, 17, 78],   [94, 20, 72]],
    ['feel_r11_seat_look_tunnel_drop.png',    [91, 17, 80],   [77, 8, 80]],
    ['feel_r12_desk_find_yoyo_down.png',      [107, 26, 62],  [107, 26, 54.5]],
    ['feel_r13_desk_find_bridge_s.png',       [104, 26, 96],  [111.5, 24, 110]],
    ['feel_r14_shelfL1_find_string_up.png',   [115, 20, 130], [107.6, 24, 130]],
    ['feel_r15_shelfL2_find_string_down.png', [115, 40, 130], [107.6, 40, 130]],
    ['feel_r16_shelfL2_find_string_up.png',   [115, 40, 133], [107.6, 44, 136]],
    ['feel_r17_bedtop_find_ways_down_n.png',  [20, 18, 60],   [20, 16, 44]],
    ['feel_r18_ruler_n_walking_up.png',       [94, 19.5, 72], [94, 26.5, 63]],
    ['feel_r19_bridge_s_walking_down.png',    [111.5, 26, 104.5], [111.5, 19, 118]],
    ['feel_r20_tallstairs_foot.png',          [100, 0, 153],  [105.7, 6, 140]],
  ];
  for (const [n, p, t] of S) { await h.eyeShot(n, p, t); console.log('shot', n); }
  // on the yo-yo string half way up, looking out at the room (what the climb looks like)
  await h.page.evaluate(() => { __game.clearInput(); __game.teleport(107, 0, 52); __game.step(1 / 60); __game.lookAt(107, 1.6, 60); __game.setInput({ forward: true }); __game.step(4); __game.clearInput(); __game.lookAt(50, 5, 80); __game.render(); });
  await h.shot('round1/feel_r21_on_yoyo_string_lookout.png');
  // spring pad at apex, facing the way you ran (south)
  await h.page.evaluate(() => { __game.clearInput(); __game.teleport(38, 0, 74); __game.step(1 / 60); __game.lookAt(38, 1.6, 90); __game.setInput({ forward: true, sprint: true }); let n = 0; while (__game.state().player.vy < 20 && n++ < 300) __game.step(1 / 60); __game.clearInput(); __game.step(1.4); __game.render(); });
  await h.shot('round1/feel_r22_spring_apex_facing_south.png');
  await h.page.evaluate(() => { __game.lookAt(20, 18, 80); __game.render(); });
  await h.shot('round1/feel_r23_spring_apex_facing_bed.png');
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
