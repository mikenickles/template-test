// Player-eye screenshots for the SCALE pillar. Standing eye height (1.6) everywhere.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const S = [
    // name, feet position, look target
    ['feel_01_spawn_across.png',      [60, 0, 20],  [60, 1.6, 140]],
    ['feel_02_gate_across.png',       [60, 0, 28],  [60, 1.6, 140]],
    ['feel_03_gate_up_bed.png',       [60, 0, 28],  [18, 14, 75]],
    ['feel_04_gate_up_desk.png',      [60, 0, 28],  [107, 22, 75]],
    ['feel_05_gate_up_tallshelf.png', [60, 0, 28],  [114, 40, 136]],
    ['feel_06_gate_up_smallshelf.png',[60, 0, 28],  [114, 25, 24]],
    ['feel_07_gate_up_ceiling.png',   [60, 0, 28],  [60, 86, 80]],
    ['feel_08_gate_straight_up.png',  [60, 0, 28],  [60, 90, 28.5]],
    ['feel_09_bedtop_across.png',     [27, 18, 80], [100, 10, 80]],
    ['feel_10_bedtop_edge_down.png',  [34, 18, 80], [50, 0, 80]],
    ['feel_11_desktop_across.png',    [97.5, 26, 80], [20, 8, 80]],
    ['feel_12_desktop_edge_down.png', [96, 26, 66], [70, 0, 70]],
    ['feel_13_shelftop_across.png',   [110.5, 60, 136], [30, 0, 50]],
    ['feel_14_shelftop_down.png',     [109.2, 60, 136], [85, 0, 120]],
    ['feel_15_midfloor_south.png',    [60, 0, 66],  [60, 3, 110]],
    ['feel_16_midfloor_west_bed.png', [48, 0, 80],  [17, 12, 80]],
    ['feel_17_midfloor_east_desk.png',[70.8, 0, 62], [107, 20, 80]],
    ['feel_18_midfloor_north.png',    [60, 0, 95],  [60, 3, 20]],
    ['feel_19_underbed_north.png',    [28, 0, 80],  [28, 2, 50]],
    ['feel_20_underbed_out_east.png', [28, 0, 80],  [100, 6, 80]],
    ['feel_21_bedside_look_up.png',   [38, 0, 70],  [35, 18, 85]],
    ['feel_22_deskleg_look_up.png',   [100, 0, 48], [107, 26, 70]],
    ['feel_23_tallshelf_foot_up.png', [100, 0, 150],[112, 60, 136]],
    ['feel_24_spawn_tan_across.png',  [60, 0, 132], [60, 1.6, 20]],
    ['feel_25_gate_level_bedward.png',[60, 0, 28],  [18, 1.6, 75]],
    ['feel_26_gate_level_deskward.png',[60, 0, 28], [107, 1.6, 75]],
  ];
  for (const [n, p, t] of S) { await h.eyeShot(n, p, t); console.log('shot', n); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
