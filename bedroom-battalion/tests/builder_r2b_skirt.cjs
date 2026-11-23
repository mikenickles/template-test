// Round 2 pass 3, item 5: BUGS R2-7 repro and angled starts 4 to 16 degrees (both ways) from x 94.6 to 95.4 on both rulers,
// walking and sprinting, held for up to 4 s or until on top of the ruler (y 26): no drop below the seat and no damage.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game, out = { runs: 0, falls: [], endedOnDesk: 0 }; g.start({ pointerLock: false }); g.setTimeScale(0);
    const run = (x, z, yaw, sprint) => {
      g.clearInput(); g.give('health'); const dl = g.damageLog.length; g.teleport(x, 17, z, yaw, 0); g.step(0.2);
      g.setInput({ forward: true, sprint }); let minY = 99; for (let i = 0; i < 240; i++) { g.step(1 / 60); const q = g.state().player; minY = Math.min(minY, q.y); if (q.y > 25.9 && q.onGround) break; } g.clearInput();   // stop once on top of the ruler
      const p = g.state().player; return { pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), minY: +minY.toFixed(2), dmg: g.damageLog.slice(dl).reduce((a, d) => a + d.amount, 0) };
    };
    out.repro = run(95.3, 78, -8 * Math.PI / 180, false);
    for (const ruler of ['n', 's']) for (const sprint of [false, true]) for (let a = 4; a <= 16; a += 2) for (const side of [1, -1]) for (let x = 94.6; x <= 95.4001; x += 0.1) {
      const deg = side * a, yaw = ruler === 'n' ? -deg * Math.PI / 180 : Math.PI + deg * Math.PI / 180;     // side 1 = toward the desk (east)
      const res = run(x, ruler === 'n' ? 78 : 82, yaw, sprint); out.runs++;
      if (res.dmg > 0 || res.minY < 16.9) out.falls.push({ ruler, sprint, deg, x: +x.toFixed(1), ...res });
      if (res.pos[1] > 25.9) out.endedOnDesk++; else out.stopped = (out.stopped || 0) + 1;
    }
    return out;
  });
  console.log(JSON.stringify({ repro: r.repro, runs: r.runs, falls: r.falls.length, fallsTowardDesk: r.falls.filter((f) => f.deg > 0).length, fallsAwayByDeg: r.falls.filter((f) => f.deg < 0).reduce((o, f) => (o[f.deg] = (o[f.deg] || 0) + 1, o), {}), awayExample: r.falls.find((f) => f.deg < 0), reachedRulerTop: r.endedOnDesk, stoppedOnSeatOrRuler: r.stopped, errors }));
  await browser.close();
})();
