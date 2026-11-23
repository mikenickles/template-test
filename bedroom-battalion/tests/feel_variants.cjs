// FOV and haze comparisons. camera.fov and fog are read once at start-up, so each variant is a temporary COPY of
// index.html (in the scratchpad, never the real file) with only the CONFIG text changed.
const { boot, variant } = require('./feel_lib.cjs');
const CAM = 'camera: { fovVertical: 75, near: 0.05, far: 400 }', FOG = 'fog: { near: 30, far: 330 }';
const V = [
  ['fov60', [[CAM, 'camera: { fovVertical: 60, near: 0.05, far: 400 }']]],
  ['fov75', []],
  ['fov90', [[CAM, 'camera: { fovVertical: 90, near: 0.05, far: 400 }']]],
  ['fov100', [[CAM, 'camera: { fovVertical: 100, near: 0.05, far: 400 }']]],
  ['fog_10_220', [[FOG, 'fog: { near: 10, far: 220 }']]],
  ['fog_5_160', [[FOG, 'fog: { near: 5, far: 160 }']]],
  ['fov85_fog_10_220', [[CAM, 'camera: { fovVertical: 85, near: 0.05, far: 400 }'], [FOG, 'fog: { near: 10, far: 220 }']]],
];
const only = process.argv[2];
const SHOTS = [
  ['gate_across', [60, 0, 28], [60, 1.6, 140]],
  ['gate_desk',   [60, 0, 28], [107, 1.6, 75]],
  ['gate_bed',    [60, 0, 28], [18, 1.6, 75]],
  ['mid_south',   [60, 0, 50], [60, 3, 140]],
  ['bedtop',      [27, 18, 80], [100, 10, 80]],
  ['westlane',    [40, 0, 30], [30, 10, 70]],
];
(async () => {
  for (const [tag, rep] of V) {
    if (only && !tag.includes(only)) continue;
    const h = await boot(rep.length ? { file: variant(tag, rep) } : {});
    for (const [n, p, t] of SHOTS) await h.eyeShot('feel_var_' + tag + '_' + n + '.png', p, t);
    console.log(tag, 'done', JSON.stringify(h.errors));
    await h.browser.close();
  }
})();
