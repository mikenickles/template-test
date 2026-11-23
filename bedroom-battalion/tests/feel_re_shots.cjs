// Re-check shots after the round 1 fixes. Same positions as the first pass so they can be compared side by side.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const S = [
    ['feel_re_01_spawn_across.png',      [60, 0, 20],  [60, 1.6, 140]],
    ['feel_re_02_gate_across.png',       [60, 0, 28],  [60, 1.6, 140]],
    ['feel_re_04_gate_up_desk.png',      [60, 0, 28],  [107, 22, 75]],
    ['feel_re_25_gate_level_bedward.png',[60, 0, 28],  [18, 1.6, 75]],
    ['feel_re_26_gate_level_deskward.png',[60, 0, 28], [107, 1.6, 75]],
    ['feel_re_15_midfloor_south.png',    [60, 0, 66],  [60, 3, 110]],
    ['feel_re_mid50_south.png',          [60, 0, 50],  [60, 3, 140]],
    ['feel_re_07_gate_up_ceiling.png',   [60, 0, 28],  [60, 86, 80]],
    ['feel_re_09_bedtop_across.png',     [27, 18, 80], [100, 10, 80]],
    ['feel_re_13_shelftop_across.png',   [110.5, 60, 136], [30, 0, 50]],
    ['feel_re_16_midfloor_west_bed.png', [48, 0, 80],  [17, 12, 80]],
    // ways down, from on top
    ['feel_re_d01_desk_find_yoyo.png',     [107, 26, 62],  [107, 26, 54.5]],
    ['feel_re_d02_desk_find_lace.png',     [107, 26, 98],  [107, 26, 105.5]],
    ['feel_re_d03_desk_find_bridge_s.png', [104, 26, 96],  [111.5, 24, 110]],
    ['feel_re_d04_desk_find_bridge_n.png', [104, 26, 64],  [111.5, 24, 50]],
    ['feel_re_d05_desk_find_rulers.png',   [103, 26, 80],  [94, 26, 64]],
    ['feel_re_d06_desk_centre_west.png',   [104, 26, 80],  [90, 24, 80]],
    ['feel_re_d07_shelfL2_string_down.png',[115, 40, 130], [107.6, 40, 130]],
    ['feel_re_d08_shelfL3_strings_down.png',[116, 60, 144], [107.6, 60, 144]],
    ['feel_re_d09_smallL2_strings_down.png',[116, 40, 22], [107.6, 40, 22]],
    ['feel_re_d10_shelfL1_stairs_bridge.png',[115, 20, 126], [106, 20, 116]],
    ['feel_re_d11_bed_ways_down_n.png',    [20, 18, 60],   [26, 16, 44]],
    ['feel_re_d12_bed_ways_down_s.png',    [20, 18, 100],  [26, 16, 116]],
    ['feel_re_d13_bed_mid_look_n.png',     [26, 18, 80],   [26, 17, 45]],
    ['feel_re_d14_seat_ways.png',          [88, 17, 80],   [94, 18, 74]],
    ['feel_re_d15_seat_look_n.png',        [89, 17, 80],   [91, 17, 70]],
    // new cover and props from the floor
    ['feel_re_c01_westlane_Wc.png',        [39, 0, 60],    [36, 1.6, 80]],
    ['feel_re_c02_eastlane_Ec.png',        [84, 0, 34],    [84, 3, 60]],
    ['feel_re_c03_gate_crayons.png',       [60, 0, 26.5],  [60, 1.2, 40]],
    ['feel_re_c04_slit_standing.png',      [54, 0, 23.6],  [54, 1.6, 80]],
    ['feel_re_c05_ruler_prop_from_floor.png',[84, 0, 56],  [94, 14, 70]],
    ['feel_re_c06_crayon_crouch_behind.png',[54, 0, 28.8], [54, 1.0, 80], { crouch: true }],
  ];
  for (const [n, p, t, e] of S) { await h.eyeShot(n, p, t, e); await h.page.evaluate(() => __game.clearInput()); }
  console.log('done', JSON.stringify(h.errors));
  await h.browser.close();
})();
