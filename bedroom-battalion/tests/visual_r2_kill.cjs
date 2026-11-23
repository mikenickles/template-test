// Round 2: kill sequence (tip-over, chips, stand-up) seen unscoped: rifle body shots until the dummy drops.
const fs = require('fs'); const path = require('path');
const { open, SHOTS } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const r = await h.page.evaluate(() => {
    __game.resetTargets(); __game.selectWeapon('rifle'); __game.teleport(60, 0, 44, 0, 0); __game.step(1); __game.teleport(60, 0, 44, 0, 0); __game.lookAt(60, 0.9, 50);
    const W = __game.CONFIG.weapons.rifle; let n = 0;
    while (__game.state().targets[1].hp > 26 && n < 10) { __game.lookAt(60, 0.9, 50); __game.fire(); __game.step(0.5); n++; }
    __game.lookAt(60, 0.9, 50);
    const c = document.getElementById('view'), crop = [440, 200, 400, 320], ticks = [0, 2, 5, 9, 15, 30, 100, 185, 200], o = document.createElement('canvas'); o.width = 404 * ticks.length; o.height = 320;
    const g = o.getContext('2d'); const e = __game.fire(); let at = 0; const down = [];
    ticks.forEach((t, i) => { if (t > at) { __game.step((t - at) / 60); at = t; } __game.render(); g.drawImage(c, crop[0], crop[1], crop[2], crop[3], i * 404, 0, 400, 320); down.push(__game.state().targets[1].down); });
    return { url: o.toDataURL('image/png'), shots: n + 1, e, down };
  });
  fs.writeFileSync(path.resolve(SHOTS, 'visual_fx_kill.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ shots: r.shots, e: r.e, down: r.down }));
  await h.browser.close();
})();
