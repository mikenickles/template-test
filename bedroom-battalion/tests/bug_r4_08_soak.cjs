// Round 4 check 7: soak. One page, N full autoplay matches back to back (different difficulties), stepped with a render
// every simulated second. After every round end: JS heap after a forced GC, renderer geometries / textures / programs,
// DOM nodes, JS event listeners, decal ring, live particles and tracers. Expect flat lines. Usage: node bug_r4_08_soak.cjs [n] [build]
const path = require('path');
const { launch } = require('./harness.cjs');
const NM = +(process.argv[2] || 3);
const FILE = path.resolve(process.argv[3] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
  page.setDefaultTimeout(120000);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const metrics = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await cdp.send('Performance.getMetrics'); const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value; const r = await page.evaluate(() => { const ri = __game.renderInfo(), fx = __game.fxStats(), s = __game.state(); return { geo: ri.geometries, tex: ri.textures, prog: ri.programs, calls: ri.calls, decal: fx.decalNext, parts: fx.particles, tracers: fx.tracers, round: s.match.round, phase: s.match.phase, score: s.match.score, t: +s.time.toFixed(0), audioLog: __game.audioLog.length, shotLog: __game.shotLog.length, killFeed: __game.killFeed.length, botLog: __game.botLog.length }; }); return Object.assign({ heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2), nodes: g('Nodes'), listeners: g('JSEventListeners') }, r); };
  const rows = [await metrics()];
  const diffs = ['recruit', 'regular', 'veteran', 'regular', 'veteran'];
  for (let k = 0; k < NM; k++) {
    await page.evaluate(([d, s]) => { __game.startMatch({ difficulty: d, seed: s, autoplay: true }); __game.setTimeScale(0); }, [diffs[k % diffs.length], 700 + k]);
    for (let guard = 0; guard < 3000; guard++) {
      const ph = await page.evaluate(() => { const G = __game; const r0 = G.state().match.round, p0 = G.state().match.phase; for (let i = 0; i < 60; i++) { G.step(1 / 60); if (G.state().match.phase !== p0) break; } G.render(); return { phase: G.state().match.phase, changed: G.state().match.phase !== p0 }; });
      if (ph.changed && (ph.phase === 'roundEnd' || ph.phase === 'matchEnd')) rows.push(await metrics());
      if (ph.phase === 'matchEnd') break;
    }
    const rep = await page.evaluate(() => { const m = __game.matchReport(); return `${m.winner} ${m.score.green}-${m.score.tan}`; });
    rows.push(Object.assign(await metrics(), { matchDone: k, result: rep }));
  }
  for (const r of rows) console.log(JSON.stringify(r));
  const first = rows[1], last = rows[rows.length - 1];
  console.log(`heap ${rows[0].heapMB} -> after first round ${first.heapMB} -> end ${last.heapMB} MB | geometries ${rows[0].geo} -> ${last.geo} | textures ${rows[0].tex} -> ${last.tex} | programs ${rows[0].prog} -> ${last.prog} | DOM nodes ${rows[0].nodes} -> ${last.nodes} | listeners ${rows[0].listeners} -> ${last.listeners}`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
