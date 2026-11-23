// Round 4B: soldier lineups of both teams in every pose (stand rifle, kneel SMG, sniper scoped, climbing, pistol, a body) seen at
// 5, 20 and 60 units, and the soldier fit check against the hit volumes. Screenshots under screenshots/round4/.
const { launch } = require('./harness.cjs');
const dists = (process.argv[2] || '5,20,60').split(',').map(Number);
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const setup = (team, z0) => page.evaluate(([team, z0]) => {
    const g = __game; g.removeBots(); g.start({ pointerLock: false }); g.setTimeScale(0);
    const poses = ['stand', 'kneel', 'scoped', 'climb', 'pistol', 'body'], out = [];
    poses.forEach((p, i) => {
      const id = g.spawnBot(team); const b = g.bots.find((o) => o.id === id);
      b.x = b.px = 34.5 + i * 1.2; b.z = b.pz = z0; b.y = b.py = 0; b.yaw = b.ryaw = Math.PI; b.pitch = 0; b.vx = b.vz = 0; b.onGround = true;
      b.arsenal.current = p === 'kneel' ? 'smg' : p === 'scoped' ? 'sniper' : p === 'pistol' ? 'pistol' : 'rifle';
      if (p === 'kneel') b.crouching = true; if (p === 'scoped') b.arsenal.scope = 1; if (p === 'climb') b.climbing = { ex: 0, ez: 1 };
      if (p === 'body') { b.dead = true; b.tip = 1; }
      out.push(p);
    });
    return out;
  }, [team, z0]);
  for (const team of ['green', 'tan']) {
    await setup(team, 40);
    for (const d of dists) {
      await page.evaluate((d) => { const g = __game; g.teleport(37.5, 0, 40 + d); g.lookAt(37.5, d > 30 ? 0.9 : 0.8, 40); g.render(); g.render(); }, d);
      await shot('round4/builder_r4b_soldiers_' + team + '_' + d + 'm.png');
      if (d >= 40) { await page.evaluate(() => { const g = __game; g.CONFIG.camera.fovVertical = 12; g.render(); g.render(); }); await shot('round4/builder_r4b_soldiers_' + team + '_' + d + 'm_zoom.png'); await page.evaluate(() => { __game.CONFIG.camera.fovVertical = 75; }); }
    }
  }
  // both teams side by side at 60 units in the haze, standing
  await page.evaluate(() => { const g = __game; g.removeBots(); for (const [t, x] of [['green', 36.5], ['tan', 38.5]]) { const id = g.spawnBot(t); const b = g.bots.find((o) => o.id === id); b.x = b.px = x; b.z = b.pz = 40; b.y = b.py = 0; b.yaw = b.ryaw = Math.PI; b.pitch = 0; b.vx = b.vz = 0; }
    g.teleport(37.5, 0, 100); g.lookAt(37.5, 0.9, 40); g.render(); g.render(); });
  await shot('round4/builder_r4b_teams_60m.png');
  // the same 60-unit view through a 12-degree lens (same distance, same haze), so the two figures can be judged at a glance
  await page.evaluate(() => { const g = __game; g.CONFIG.camera.fovVertical = 12; g.render(); g.render(); });
  await shot('round4/builder_r4b_teams_60m_zoom.png');
  await page.evaluate(() => { __game.CONFIG.camera.fovVertical = 75; });
  const fit = await page.evaluate(() => __game.soldierFit());
  console.log(JSON.stringify(fit));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
