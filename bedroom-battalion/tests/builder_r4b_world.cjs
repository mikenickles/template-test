// Round 4B: the train (side, front, from above), and impact marks: rifle shots and a grenade on wood (floor), fabric (blanket),
// plastic (fort brick), book (book stairs) and card (tunnel), each seen close up.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.setGodMode && g.setGodMode(true); });
  // train on the west straight at time 0: engine front near z 77.5 heading north
  const cams = { train_side: [[36.5, 0, 92], [43, 2.5, 90]], train_front: [[40, 1, 64], [43, 2.5, 76]], train_above: [[54, 12, 66], [43, 1, 86]] };
  for (const [k, [p, at]] of Object.entries(cams)) { await page.evaluate(([p, at]) => { const g = __game; g.teleport(p[0], p[1], p[2]); g.lookAt(at[0], at[1], at[2]); g.render(); g.render(); }, [p, at]); await shot('round4/builder_r4b_' + k + '.png'); }
  // impacts: shoot four rifle rounds at a surface from 6 units, then look at the marks from 1 unit; then drop a grenade on it
  const spots = { wood: [[60, 0, 38], [60, 0, 44]], fabric: [[25, 18, 66], [25, 18, 72]], plastic: [[52, 0, 32], [52, 0.6, 26]], book: [[26, 0, 150], [26, 2.4, 141.6]], card: [[70, 0, 80], [72.6, 2.2, 80]] };
  for (const [k, [from, aim]] of Object.entries(spots)) {
    const r = await page.evaluate(([from, aim]) => { const g = __game; g.give && g.give(); g.selectWeapon('rifle'); g.step(1);
      g.teleport(from[0], from[1], from[2]); const hits = [];
      for (let i = 0; i < 4; i++) { g.lookAt(aim[0] + (i % 2 - 0.5) * 0.5, aim[1] + (i < 2 ? 0.2 : -0.2), aim[2]); const e = g.fire(); g.step(0.2); hits.push(e && e.surface); }
      const ex = from[0], ey = from[1] + 1.6, ez = from[2], dx = aim[0] - ex, dy = aim[1] - ey, dz = aim[2] - ez, L = Math.hypot(dx, dy, dz);
      g.step(1.2); const t = Math.max(0.2, L - 1.1); g.teleport(ex + dx / L * t, ey + dy / L * t - 1.6, ez + dz / L * t); g.lookAt(aim[0], aim[1], aim[2]); g.render(); g.render();
      return hits; }, [from, aim]);
    await shot('round4/builder_r4b_impact_' + k + '.png');
    await page.evaluate(([from, aim]) => { const g = __game; g.teleport(aim[0], aim[1] + (aim[1] > 1 && aim[1] < 3 ? -aim[1] + (aim[1] > 2 && aim[0] > 70 ? 8.05 : 0) : 0), aim[2]); }, [from, aim]);
    console.log(k, JSON.stringify(r));
  }
  // grenade scorch on the floor and on the blanket: thrown straight down from above the spot, then seen from 4 units
  for (const [k, spot] of Object.entries({ wood: [60, 0, 42], fabric: [24, 18.2, 74] })) {
    await page.evaluate((s) => { const g = __game; const before = g.fxStats().scorchNext; g.teleport(s[0], s[1], s[2]); g.look(0, -1.5); g.throwGrenade(); g.step(3); const L = g.fxStats().lastScorch || s; window.__sc = [before, g.fxStats().scorchNext, L]; g.teleport(L[0] + 2.5, L[1] - 0.2, L[2] + 2.5); g.lookAt(L[0], L[1], L[2]); g.render(); g.render(); }, spot);
    await shot('round4/builder_r4b_scorch_' + k + '.png'); console.log('scorch', k, JSON.stringify(await page.evaluate(() => window.__sc)));
  }
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
