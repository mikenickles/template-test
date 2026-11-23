// Is CONFIG.camera / CONFIG.fog live? Same view three times: baseline, baseline again, after changing CONFIG.
const crypto = require('crypto'); const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const hash = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
  const A = hash(await h.eyeShot('feel_tmp_a.png', [60, 0, 28], [60, 1.6, 140]));
  const B = hash(await h.eyeShot('feel_tmp_b.png', [60, 0, 28], [60, 1.6, 140]));
  await h.page.evaluate(() => { __game.CONFIG.camera.fovVertical = 100; __game.CONFIG.fog.near = 5; __game.CONFIG.fog.far = 100; });
  const C = hash(await h.eyeShot('feel_tmp_c.png', [60, 0, 28], [60, 1.6, 140]));
  console.log('repeat identical:', A === B, ' after live change identical to baseline:', A === C);
  for (const f of ['a', 'b', 'c']) fs.unlinkSync(__dirname + '/../screenshots/round1/feel_tmp_' + f + '.png');
  await h.browser.close();
})();
