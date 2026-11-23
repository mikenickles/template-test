// Round 2 re-check: Round 1 finding 12 (drop under the desk top beside each ruler) after the apron moved to x 95.5..96,
// plus the diagonal approach from bug_03. Traces where each run leaves its support. Parts 2 and 3: argv 'head', 'skirt'.
const { boot } = require('./bug_lib.cjs');
if (!process.argv[2]) (async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, res = [];
    const run = (name, tp, look, sprint, secs = 4) => {
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0; G.teleport(...tp); G.lookAt(...look);
      G.setInput({ forward: true, sprint }); let leave = null, prevG = true, path = [];
      for (let i = 0; i < Math.round(secs * 60); i++) {
        G.step(DT); const p = G.state().player;
        if (prevG && !p.onGround && !leave && p.y > 1) leave = { tick: i, at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] };
        prevG = p.onGround; if (i % 15 === 0) path.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
      G.clearInput(); const p = G.state().player;
      res.push({ name, sprint, end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), leftSupport: leave, path: path.slice(0, 14) });
    };
    for (const sp of [false, true]) {
      run('R1-12 repro 1, ruler north', [93.31, 17, 76.66], [94, 18.6, 75], sp);
      run('R1-12 repro 2, ruler north', [92.5, 17, 77], [95.2, 18.6, 70], sp);
      run('R1-12 repro 3, ruler south', [92.5, 17, 83], [95.2, 18.6, 90], sp);
      run('bug_03 diagonal (89,78) toward (96,64)', [89, 17, 78], [96, 18.6, 64], sp, 6);
      run('mirror: (89,82) toward (96,96)', [89, 17, 82], [96, 18.6, 96], sp, 6);
    }
    return res;
  });
  for (const r of out) console.log((r.dmg.length ? '!! ' : 'ok ') + JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
// Part 2: walking straight up the ruler next to the apron, per tick: how far the head (feet + 1.8) rises into the desk
// top's underside (y 24.5, x >= 95) while the capsule (r 0.4) still overlaps x 95. Run: node bug_r2b_06_apron_drop.cjs head
if (process.argv[2] === 'head') (async () => {
  const { browser, page, errors } = await boot();
  const rows = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, rows = [];
    for (const [x, z0, yaw] of [[95.1, 78, 0], [95.3, 78, 0], [95.45, 78, 0], [95.3, 82, Math.PI]]) for (const sprint of [false, true]) for (const jump of [false, true]) {
      G.clearInput(); G.teleport(x, 17, z0, yaw, 0); G.step(0.2); G.setInput({ forward: true, sprint });
      let worst = 0, at = null, ticks = 0;
      for (let i = 0; i < 300; i++) {
        if (jump) G.setInput({ forward: true, sprint, jump: i % 20 < 2 });
        G.step(DT); const p = G.state().player, h = p.y + (p.crouching ? 1.2 : 1.8) - 24.5, over = p.x + 0.4 - 95;
        if (h > 0.005 && over > 0.005 && p.y < 24.5) { ticks++; if (h > worst) { worst = h; at = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), p.onGround]; } }
      }
      rows.push({ x, ruler: z0 < 80 ? 'north' : 'south', sprint, jump, ticksHeadInDeskTop: ticks, deepestCm: +(worst * 100).toFixed(1), at });
    }
    G.clearInput(); return rows;
  });
  for (const r of rows) console.log(JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
// Part 3 (re-check 2): the desk skirt panel 96..96.5, 73..87, 17..24.5. R2-7 repro, then walking, sprinting and
// sprint-jumping at the seat's east edge from every heading between north-east and south-east, all along the seat.
// Run: node bug_r2b_06_apron_drop.cjs skirt
if (process.argv[2] === 'skirt') (async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, res = { r27: null, edge: { runs: 0, falls: [], stuck: [], maxX: 0 } };
    G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(95.3, 17, 78, -8 * Math.PI / 180, 0); G.step(0.2); G.setInput({ forward: true }); G.step(4); G.clearInput();
    const p = G.state().player; res.r27 = { end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], dmg: G.damageLog.map((d) => d.amount) };
    for (let z = 73.5; z <= 86.51; z += 0.5) for (let deg = -80; deg <= 80; deg += 20) for (const mode of ['walk', 'sprint', 'sprintjump']) {
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0;
      const yaw = -Math.PI / 2 + deg * Math.PI / 180;           // -PI/2 faces east (+x)
      G.teleport(93.5, 17, z, yaw, 0); G.step(0.1);
      let minY = 17, last = null, still = 0, maxX = 0;
      for (let i = 0; i < 150; i++) {
        G.setInput({ forward: true, sprint: mode !== 'walk', jump: mode === 'sprintjump' && i % 30 < 2 }); G.step(DT);
        const q = G.state().player; minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x);
      }
      G.clearInput(); G.step(0.5);
      const q = G.state().player; res.edge.runs++; res.edge.maxX = Math.max(res.edge.maxX, maxX);
      if (G.damageLog.length || minY < 16.5 || G.rescueLog.length) { if (res.edge.falls.length < 10) res.edge.falls.push({ z, deg, mode, end: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)], dmg: G.damageLog.map((d) => d.amount) }); }
      // stuck: cannot walk back west off the panel within 1 s
      G.look(Math.PI / 2, 0); const x0 = q.x; G.setInput({ forward: true }); G.step(1); G.clearInput();
      if (q.y > 16.5 && G.state().player.x > x0 - 2) { if (res.edge.stuck.length < 10) res.edge.stuck.push({ z, deg, mode, from: x0, to: G.state().player.x }); }
    }
    return res;
  });
  console.log('R2-7 repro:', JSON.stringify(out.r27));
  console.log(`seat east edge: ${out.edge.runs} runs, falls ${out.edge.falls.length}, could not walk back ${out.edge.stuck.length}, furthest east x ${out.edge.maxX.toFixed(3)}`);
  for (const f of out.edge.falls) console.log('   FALL', JSON.stringify(f)); for (const s of out.edge.stuck) console.log('   STUCK', JSON.stringify(s));
  console.log('ERRORS', JSON.stringify(errors)); await browser.close();
})();
