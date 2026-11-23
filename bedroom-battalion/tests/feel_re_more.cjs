const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  for (const [n, p, t] of [
    ['feel_re_d16_bed_south_from_mid.png', [26, 18, 94], [26, 17, 116]],
    ['feel_re_d17_bed_south_on_pillow.png', [26, 19.8, 106], [26, 17, 116]],
    ['feel_re_d18_bed_east_edge_pad.png', [33, 18, 74], [38, 0, 80]],
    ['feel_re_s01_slit_east_standing.png', [66, 0, 23.6], [66, 1.6, 80]],
    ['feel_re_b01_bed_from_westlane.png', [42, 0, 36], [20, 10, 80]],
  ]) await h.eyeShot(n, p, t);
  await h.browser.close();
})();
