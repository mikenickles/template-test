// Round 2 re-check: BUGS R2-4 (desk apron vs ruler lanes). Every lane from the chair seat up both rulers, walk and
// sprint, straight and angled 8 degrees either way. Ruler footprint x 92.5..95.5, apron 95.5..96, seat 85..96.
// T = reached the desk top, S = stopped without falling (still on the seat or ruler), F = fell (damage or below the seat).
// Usage: node bug_r2b_03_ruler_lanes.cjs [angles, default 0,8,-8; positive = away from the desk on ruler north]. Every loop is tick-limited.
const { boot } = require('./bug_lib.cjs');
const ANGS = (process.argv[2] || '0,8,-8').split(',').map(Number);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((ANGS) => {
    const G = __game, DT = 1 / 60, rows = [], fails = [];
    const seat = G.colliders.find((c) => c.id === 'chair.seat');
    const xs = []; for (let x = 91.6; x <= 96.41; x += 0.1) xs.push(+x.toFixed(2));
    for (const [tag, z0, yaw0, done] of [['north', 78, 0, (p) => p.y > 25.2 && p.z < 65.2], ['south', 82, Math.PI, (p) => p.y > 25.2 && p.z > 94.8]]) {
      for (const sprint of [false, true]) for (const ang of ANGS) {
        let row = '';
        for (const x of xs) {
          G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0;
          const yaw = yaw0 + ang * Math.PI / 180;
          G.teleport(x, seat.y1, z0, yaw, 0); G.step(0.2);
          let ok = false, minY = 99, i = 0;
          G.setInput({ forward: true, sprint });
          for (; i < 480 && !ok; i++) { G.step(DT); const p = G.state().player; minY = Math.min(minY, p.y); ok = p.onGround && done(p); }
          // near the ruler top (within 0.8 of its end), turn onto the desk (east) and walk on: must stand on the desk top with no damage
          let onDesk = false;
          if (ok) { G.look(-Math.PI / 2, 0); G.setInput({ forward: true, sprint }); for (let k = 0; k < 90; k++) G.step(DT); G.clearInput(); G.step(0.2); const q = G.state().player; onDesk = q.onGround && Math.abs(q.y - 26) < 0.01 && q.x > 96 && G.damageLog.length === 0; }
          const p = G.state().player, fell = G.damageLog.length > 0 || minY < seat.y1 - 0.5 || G.rescueLog.length > 0;
          const c = ok ? (onDesk ? 'T' : 'X') : fell ? 'F' : 'S';
          row += c;
          if (x >= 92.6 && x <= 95.4 && ang === 0 && c !== 'T') fails.push({ tag, sprint, x, c, end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
          if (c === 'F' && fails.length < 40) fails.push({ tag, sprint, ang, x, c, end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], minY: +minY.toFixed(2), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
        }
        rows.push(`ruler ${tag} ${sprint ? 'sprint' : 'walk  '} ${ang >= 0 ? '+' : ''}${ang} deg: ${row}`);
      }
    }
    G.clearInput();
    return { rows, fails, xs: xs[0] + '..' + xs[xs.length - 1] };
  }, ANGS);
  console.log(`start x ${out.xs} step 0.1 (char 11 = 92.6, char 39 = 95.4, char 40 = 95.5). T = ruler top then onto the desk, X = ruler top but not onto the desk, S = stopped, no fall, F = fell`);
  for (const r of out.rows) console.log(r);
  console.log('problems:'); for (const f of out.fails) console.log('  ', JSON.stringify(f));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
