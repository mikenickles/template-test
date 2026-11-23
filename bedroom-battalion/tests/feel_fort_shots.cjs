// Fort views (slit, tower) and a check that changing CONFIG.camera / CONFIG.fog at run time has no effect on the picture.
const crypto = require('crypto'); const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const a = await h.eyeShot('feel_f01_slit_standing.png', [54, 0, 23.6], [54, 1.6, 80]);
  await h.eyeShot('feel_f02_slit_crouched.png', [54, 0, 23.6], [54, 1.0, 80], { crouch: true });
  await h.page.evaluate(() => __game.clearInput());
  await h.eyeShot('feel_f03_tower_top_south.png', [70.5, 7, 11.6], [62, 2, 80]);
  await h.eyeShot('feel_f04_spawn_look_up_over_wall.png', [60, 0, 20], [60, 30, 80]);
  const hash = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
  const h1 = hash(a);
  await h.page.evaluate(() => { __game.CONFIG.camera.fovVertical = 100; __game.CONFIG.fog.near = 5; __game.CONFIG.fog.far = 100; });
  const b = await h.eyeShot('feel_f01b_slit_standing_after_live_config_change.png', [54, 0, 23.6], [54, 1.6, 80]);
  console.log('picture identical after live CONFIG.camera/fog change:', h1 === hash(b));
  fs.unlinkSync(b);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
