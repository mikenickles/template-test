// Shadow quality close-ups inside the sunbeam (the only place the sun reaches): contact gaps (peter-panning),
// acne on faces at a grazing angle to the sun, aliasing of thin lit slivers, soft-edge width, cut-off.
const { open, freeCam, grabCanvas } = require('./visual_lib.cjs');
const S = {
  sliver_top:        [[54, 5, 92],      [54.01, 0, 90]],
  sliver_low:        [[54, 1.6, 104],   [54, 0, 96]],
  dominoes_south:    [[70, 2.5, 100.5], [66, 0.5, 96.8]],
  block_contact:     [[69.5, 1.2, 95],  [67.2, 0, 91.5]],
  brick_contact:     [[66.5, 1.6, 86],  [64.3, 0.2, 83.7]],
  bed_pillow_shadow: [[30, 21, 92],     [26, 18, 101]],
  bed_ridge_shadow:  [[28, 20.5, 66],   [20, 18, 80]],
  graze_block_north: [[65.5, 5, 86],    [65.5, 4.6, 90]],
  graze_marble_north:[[65.5, 2, 102.5], [65.5, 2, 106]],
  graze_ruin_wall:   [[66, 1.6, 84.5],  [68, 1.7, 81.5]],
  platform_pillar:   [[57.5, 3, 84],    [61, 1.2, 80]],
  bed_edge_shadow:   [[46, 6, 70],      [56, 0, 80]],
  window_bars_floor: [[62, 12, 84],     [66, 0, 90]],
};
(async () => {
  const h = await open({ width: 1280, height: 720 });
  for (const [name, [e, t]] of Object.entries(S)) { await freeCam(h, e, t); await grabCanvas(h, `round1/visual_shadow_${name}.png`); }
  // straight down on the lit strip, 1 unit = 36 px, to measure the soft edge width and the texel pattern
  await h.page.evaluate(() => { __game.clearView(); __game.teleport(62, 13 - 1.6, 92, 0, -1.54); });
  await grabCanvas(h, 'round1/visual_shadow_strip_topdown.png');
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
