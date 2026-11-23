// Round 2: grenade throw frame, body in flight and the burst, with the camera turned to where it lands.
const fs = require('fs'); const path = require('path');
const { open, SHOTS } = require('./visual_r2_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const r = await h.page.evaluate(() => {
    __game.resetTargets(); __game.give('grenade'); __game.teleport(60, 0, 30, 0, 0); __game.lookAt(60, 2.2, 50); __game.step(0.5);
    const c = document.getElementById('view'), W = 400, H = 300, labels = [], frames = [];
    const snap = (label, crop) => { __game.render(); const o = document.createElement('canvas'); o.width = W; o.height = H; o.getContext('2d').drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, W, H); frames.push(o); labels.push(label); };
    __game.setInput({ grenade: true }); __game.step(0.3); __game.clearInput(); __game.step(1 / 60); snap('throw tick', [0, 0, 1280, 720]);
    __game.step(1 / 60); snap('+1', [0, 0, 1280, 720]); __game.step(2 / 60); snap('+3', [0, 0, 1280, 720]);
    __game.step(0.4); const g = __game.grenades[0]; snap('0.45 s', [320, 180, 640, 360]);
    __game.step(1.4); const q = __game.grenades[0]; const pos = [q.x, q.y, q.z]; __game.lookAt(q.x, q.y + 0.5, q.z); snap('1.85 s, at rest', [440, 210, 400, 300]);
    const left = Math.round(q.fuse * 60);
    __game.step(left / 60); __game.lookAt(pos[0], pos[1] + 0.5, pos[2]); snap('burst tick', [440, 210, 400, 300]);
    for (const t of [2, 4, 10, 20, 34]) { __game.step(t / 60); __game.lookAt(pos[0], pos[1] + 0.5, pos[2]); snap('burst +' + t, [440, 210, 400, 300]); }
    const o = document.createElement('canvas'); o.width = (W + 4) * frames.length; o.height = H; const g2 = o.getContext('2d'); g2.fillStyle = '#f0f'; g2.fillRect(0, 0, o.width, H);
    frames.forEach((f, i) => g2.drawImage(f, i * (W + 4), 0));
    const p = __game.state().player;
    return { url: o.toDataURL('image/png'), labels, pos, dist: Math.hypot(pos[0] - p.x, pos[2] - p.z), log: __game.shotLog.slice(-2) };
  });
  fs.writeFileSync(path.resolve(SHOTS, 'visual_fx_grenade_flight_burst.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ labels: r.labels, pos: r.pos, dist: r.dist, log: r.log }));
  await h.browser.close();
})();
