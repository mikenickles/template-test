// Close-ups for the checklist (sections 3 to 7), shadow quality, camera clipping, and a two-position jitter
// pair for every named view (for z-fighting / flicker: compared offline by visual_analyse.py).
const { open, freeCam, grabCanvas, VIEWS } = require('./visual_lib.cjs');

const CLOSE = {
  // name: [eye, target]
  overview_top:        null,                                  // handled below (straight down)
  overview_ne:         [[116, 84, 4],     [40, 0, 100]],
  overview_sw:         [[4, 84, 156],     [80, 0, 60]],
  fort_green_inside:   [[52, 1.6, 12],    [70, 4, 16]],
  fort_green_slit:     [[52, 1.6, 23.9],  [52, 1.5, 60]],
  fort_tan_outside:    [[60, 6, 120],     [62, 2, 146]],
  tower_top_green:     [[70.5, 8.6, 9.5], [60, 0, 60]],
  ruin:                [[60, 9, 66],      [60, 1, 80]],
  ruin_shadow_close:   [[62, 1.6, 77],    [56.5, 0.3, 76.6]],
  domino_shadow:       [[65, 1.6, 59],    [65.5, 0.6, 64]],
  pillar_shadow:       [[60, 4, 86],      [61, 1, 80]],
  bucket_spares:       [[18, 3, 138],     [9, 0.5, 128]],
  bear:                [[24, 6, 18],      [10, 6, 38]],
  bed_top_south:       [[30, 23, 48],     [14, 18, 110]],
  bed_pillows:         [[17.5, 20.5, 92], [17.5, 18.5, 106]],
  under_bed_east:      [[40, 1.6, 80],    [10, 2, 80]],
  under_desk:          [[90, 1.6, 80],    [112, 3, 80]],
  desk_items:          [[98, 28.5, 60],   [116, 28, 84]],
  ruler_desk_join_n:   [[98, 28, 60],     [94, 25, 66]],
  ruler_desk_join_side:[[88, 24, 60],     [94, 24.5, 66]],
  chair_from_floor:    [[78, 1.6, 96],    [90, 16, 80]],
  tall_shelf_floor:    [[92, 1.6, 136],   [112, 34, 136]],
  small_shelf_floor:   [[92, 1.6, 24],    [112, 24, 24]],
  tall_shelf_L1:       [[110.5, 21.6, 119], [114, 22, 140]],
  yoyo_from_floor:     [[100, 1.6, 44],   [107, 12, 54.5]],
  lace_from_floor:     [[100, 1.6, 116],  [107, 12, 105.5]],
  spring_pad:          [[44, 1.6, 84],    [38, 0.2, 80]],
  tunnel_inside:       [[77, 1.6, 66],    [77, 1.6, 92]],
  track_north_curve:   [[60, 5, 30],      [60, 0, 44]],
  door_window:         [[70, 30, 60],     [10, 40, 30]],
  ceiling_light:       [[60, 1.6, 60],    [60, 88, 80]],
  wall_east_far:       [[20, 20, 80],     [120, 45, 80]],
  wall_south_grazing:  [[60, 30, 120],    [60, 40, 160]],
  skirting_clip_west:  [[0.41, 1.6, 130], [0.41, 1.6, 150]],
  skirting_clip_face:  [[0.41, 1.6, 130], [-5, 1.6, 130]],
  door_clip:           [[30, 1.6, 0.41],  [40, 1.6, 0.41]],
  floor_planks_low:    [[20, 1.6, 150],   [20, 0, 156]],
  sunbeam_edge:        [[50, 12, 120],    [56, 0, 104]],
  car_w_b_under_bed:   [[42, 1.6, 52],    [34.5, 1, 59]],
  cover_west:          [[46, 3, 22],      [36, 2, 33]],
};

(async () => {
  const h = await open({ width: 1280, height: 720 });
  const p = h.page;
  for (const [name, def] of Object.entries(CLOSE)) {
    if (!def) continue;
    await freeCam(h, def[0], def[1]);
    await grabCanvas(h, `round1/visual_close_${name}.png`);
  }
  // straight-down views (lookAt cannot do pitch -90; use teleport + look with the pitch limit)
  await p.evaluate(() => { __game.clearView(); __game.teleport(60, 85 - 1.6, 80, Math.PI / 2, -1.54); });
  await grabCanvas(h, 'round1/visual_close_overview_top.png');
  await p.evaluate(() => { __game.teleport(20, 10 - 1.6, 150, 0, -1.54); });
  await grabCanvas(h, 'round1/visual_close_planks_topdown.png');
  // shadow-map resolution: a soldier-sized box does not exist yet, so look at the spare soldiers and a string shadow
  // ---- jitter pairs for every named view ----
  const views = await p.evaluate(() => __game.views);
  for (const v of VIEWS) {
    const [e, t] = views[v];
    await freeCam(h, e, t);
    await grabCanvas(h, `round1/visual_jitterA_${v}.png`);
    await freeCam(h, [e[0] + 0.004, e[1] + 0.003, e[2] + 0.004], t);
    await grabCanvas(h, `round1/visual_jitterB_${v}.png`);
  }
  // jitter pairs for three wide overviews as well (far geometry is where depth precision runs out)
  for (const name of ['overview_ne', 'overview_sw', 'wall_east_far']) {
    const [e, t] = CLOSE[name];
    await freeCam(h, [e[0] + 0.004, e[1] + 0.003, e[2] + 0.004], t);
    await grabCanvas(h, `round1/visual_jitterB_${name}.png`);
  }
  // named view == free camera at the same eye? (checks setView places the camera exactly as DESIGN says)
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
