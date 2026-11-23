// Round 2 re-check 2: tracers per gun down a long lane, on the shot tick and 2 ticks later, so the line can be seen
// leaving the muzzle (flash switched off in the test only so it does not cover the tracer start).
const fs = require('fs'); const path = require('path');
const { open, SHOTS } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const url = await h.page.evaluate(() => {
    const c = document.getElementById('view'), frames = [], keep = __game.CONFIG.gun.flashTime;
    const copy = () => { const o = document.createElement('canvas'); o.width = 640; o.height = 420; o.getContext('2d').drawImage(c, 640, 300, 640, 420, 0, 0, 640, 420); return o; };
    __game.CONFIG.gun.flashTime = 0;
    for (const w of ['rifle', 'smg', 'sniper', 'pistol']) {
      __game.clearInput(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(20, 0, 150, 0, 0); __game.step(1.5); __game.lookAt(20, 1.0, 20);
      __game.fire(); __game.render(); frames.push(copy()); __game.step(2 / 60); __game.render(); frames.push(copy()); __game.step(2);
    }
    __game.CONFIG.gun.flashTime = keep;
    const o = document.createElement('canvas'); o.width = 4 * 324; o.height = 2 * 214; const g = o.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
    frames.forEach((f, i) => g.drawImage(f, (i >> 1) * 324, (i & 1) * 214, 320, 210)); return o.toDataURL('image/png');
  });
  fs.writeFileSync(path.resolve(SHOTS, 'visual_re2_tracers.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('columns rifle, smg, sniper, pistol; rows shot tick, +2 ticks; errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
