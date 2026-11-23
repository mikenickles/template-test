// The chair-seat U-turn onto the ruler ramps: what happens when a player cuts the corner (turns toward the ruler top early).
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = FEEL.st, out = {};
    // arrive up the skateboard at different x, then steer straight at a point part-way up the north ruler (continuous aim)
    for (const x of [87, 89, 91]) for (const aimZ of [75.5, 74.5, 73.5, 71, 68]) {
      G.clearInput(); G.teleport(60, 0, 20); G.step(T); const before = G.damageLog.length;
      G.teleport(x, 0, 49); G.step(T);
      let t = 0, phase = 0, res = 'timeout';
      while (t < 12) { const p = st();
        if (phase === 0) { G.lookAt(x, p.y + 1.6, 80); if (p.y > 16.95 && p.z > 73.05) phase = 1; }
        if (phase === 1) { const hgt = 17 + (75 - aimZ) * 9 / 11; G.lookAt(94, p.y + 1.6, aimZ); if (Math.abs(p.x - 94) < 1.2 && Math.abs(p.z - aimZ) < 1.0) phase = 2; }
        if (phase === 2) G.lookAt(94, p.y + 1.6, 60);
        G.setInput({ forward: true, sprint: true }); G.step(T); t += T;
        const q = st(); if (q.onGround && q.y > 25.9) { res = 'on desk at t=' + t.toFixed(2); break; } if (q.onGround && q.y < 1 && phase > 0) { res = 'FELL to floor at (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') t=' + t.toFixed(2); break; } }
      out['skate x=' + x + ' -> aim ruler at z=' + aimZ] = res + ' dmg ' + JSON.stringify(G.damageLog.slice(before).map((d) => Math.round(d.amount)));
    }
    // strafing/walking near the seat edges: seat is 11 x 14 with no rim. how much of the seat perimeter is open (no post/back)?
    // sprint 6.2 crossing check
    for (const v of [7, 6.5, 6.2]) { G.CONFIG.move.sprint = v; G.clearInput(); G.teleport(42, 0, 0.5, Math.PI, 0); G.step(0.1); G.setInput({ forward: true, sprint: true }); let t = 0; while (st().z < 159.5 && t < 60) { G.step(T); t += T; } out['wallToWall sprint=' + v] = +t.toFixed(1); }
    G.CONFIG.move.sprint = 7; G.clearInput();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await h.browser.close();
})();
