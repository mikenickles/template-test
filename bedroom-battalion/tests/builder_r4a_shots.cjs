// Round 4A screenshots: the nine named views (DESIGN 10) plus the sunbeam with dust, under the bed, the desk top, a fort close up,
// the ruin, a cluster of floor toys and the ceiling light. Saved under screenshots/round4/.
const { launch } = require('./harness.cjs');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
const EXTRA = {   // [feet x, y, z] and the point looked at (eye is feet + 1.6)
  sunbeam_dust: [[96, 12.4, 126], [34, 22, 80]], under_bed_side: [[38.8, 0, 85], [10, 2.2, 74]], desk_top_close: [[99, 26, 98], [114, 27, 68]],
  fort_close: [[64, 0, 37], [57, 2.2, 24]], ruin: [[60.5, 1.2, 61], [60, 1.4, 80]], floor_toys: [[46, 0.6, 75], [58, 1.5, 55]], ceiling_light: [[60, 40, 52], [60, 86, 80]],
  tunnel_track: [[70, 0, 58], [77, 3, 74]], bed_pillows: [[24, 18, 84], [26, 19, 112]] };
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  for (const v of VIEWS) { if (only && !only.includes(v)) continue; await page.evaluate((v) => { __game.setView(v); for (let i = 0; i < 3; i++) __game.render(); }, v); await shot('round4/builder_r4a_view_' + v + '.png'); }
  await page.evaluate(() => __game.clearView());
  for (const [k, [p, at]] of Object.entries(EXTRA)) {
    if (only && !only.includes(k)) continue;
    await page.evaluate(([p, at]) => { const g = __game; g.teleport(p[0], p[1], p[2]); g.lookAt(at[0], at[1], at[2]); for (let i = 0; i < 3; i++) g.render(); }, [p, at]);
    await shot('round4/builder_r4a_' + k + '.png');
  }
  // a live firefight: bots fighting (player idle, god mode), the camera 3 units behind a Green bot that has a Tan bot in sight
  if (!only || only.includes('firefight')) {
    const r = await page.evaluate(() => { const g = __game; g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 22 }); g.setGodMode(true);
      for (let i = 0; i < 3000; i++) { g.step(0.1); const s = g.state(); if (s.match.phase !== 'live') continue;
        for (const a of s.bots) { if (a.dead || a.team !== 'green' || a.brainState !== 'engage' || a.pos[1] > 0.5) continue;
          const b = s.bots.filter((o) => !o.dead && o.team === 'tan').map((o) => [o, Math.hypot(o.pos[0] - a.pos[0], o.pos[2] - a.pos[2])]).filter((q) => q[1] > 8 && q[1] < 35).sort((x, y) => x[1] - y[1])[0];
          if (!b) continue; const t = b[0], dx = t.pos[0] - a.pos[0], dz = t.pos[2] - a.pos[2], L = Math.hypot(dx, dz);
          g.teleport(a.pos[0] - dx / L * 3 + dz / L * 1.2, a.pos[1], a.pos[2] - dz / L * 3 - dx / L * 1.2); g.lookAt(t.pos[0], t.pos[1] + 1, t.pos[2]); g.render();
          return { green: a.name, tan: t.name, d: +L.toFixed(1), at: a.pos.map((v) => +v.toFixed(1)) }; } }
      return null; });
    console.log('firefight', JSON.stringify(r));
    await shot('round4/builder_r4a_firefight.png');
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
