// ASCII map of distance to the nearest standing-height (>= 1.8) floor cover. Each cell 2 x 4 units (x across, z down).
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game;
    const C = G.colliders.filter((c) => !/^room\./.test(c.id) && (c.kind === 'box' || c.kind === 'cyl' || (c.kind === 'ramp' && c.thickness === null)) && c.y0 <= 0.6 && c.y1 >= 1.2);
    const dist = (c, x, z) => c.kind === 'cyl' ? Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r) : Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
    const rows = []; const peaks = [];
    for (let z = 2; z < 160; z += 4) { let row = '';
      for (let x = 1; x < 120; x += 2) { let b = 1e9; for (const c of C) b = Math.min(b, dist(c, x, z));
        const under = x < 35 && z > 45 && z < 115;
        row += b === 0 ? '#' : b <= 4 ? '.' : b <= 8 ? (under ? 'u' : '-') : b <= 12 ? (under ? 'U' : 'o') : 'O'; peaks.push([b, x, z]); }
      rows.push(String(z).padStart(3) + ' ' + row); }
    peaks.sort((a, b) => b[0] - a[0]);
    const top = []; for (const p of peaks) { if (top.every((q) => Math.hypot(q[1] - p[1], q[2] - p[2]) > 14)) top.push(p); if (top.length >= 10) break; }
    return { rows, top: top.map((p) => ({ x: p[1], z: p[2], distToCover: +p[0].toFixed(1) })) };
  });
  console.log('legend: # cover (>=1.2 tall, on the floor)   . within 4   - 4..8   o 8..12   O >12   (u/U = same but under the bed)');
  console.log('    x: 0' + ' '.repeat(18) + '40' + ' '.repeat(18) + '80' + ' '.repeat(17) + '118');
  console.log(r.rows.join('\n'));
  console.log(JSON.stringify(r.top));
  await h.browser.close();
})();
