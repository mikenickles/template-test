// Round 4 check 5: menus and flow with real input, real time. Three cycles of title -> Play -> pause -> resume -> match end
// (skipRound) -> Enter rematch -> Esc to title; after each cycle count event listeners on window, document and the canvas
// (CDP DOMDebugger), DOM nodes, JS heap after GC, and renderer geometries/textures/programs. Then: one key press acts once
// (no doubled listeners), window resize keeps the canvas and HUD in step, losing pointer lock pauses and a click resumes,
// and HUD text scales with the window. Usage: node bug_r4_06_flow_leaks.cjs [build]. Loops are bounded.
const path = require('path');
const { launch } = require('./harness.cjs');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const wait = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
  const log = (...a) => console.log(...a);
  page.setDefaultTimeout(30000);
  const cdp = await page.context().newCDPSession(page);
  const listeners = async () => { const out = {}; for (const [k, expr] of [['window', 'window'], ['document', 'document'], ['canvas', 'document.querySelector("canvas")']]) { const { result } = await cdp.send('Runtime.evaluate', { expression: expr }); const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId }); const by = {}; for (const l of listeners) by[l.type] = (by[l.type] || 0) + 1; out[k] = by; } return out; };
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await cdp.send('Performance.getMetrics'); const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value; return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1), nodes: g('Nodes'), docs: g('Documents'), jsListeners: g('JSEventListeners') }; };
  await cdp.send('Performance.enable');
  const st = () => page.evaluate(() => { const s = __game.state(), ri = __game.renderInfo(); return { app: s.app, phase: s.match.phase, round: s.match.round, score: s.match.score, locked: !!document.pointerLockElement, geo: ri.geometries, tex: ri.textures, prog: ri.programs, weapon: s.weapon.name, pick: s.match.pick }; });
  const toEnd = () => page.evaluate(() => { const G = __game; G.setTimeScale(0); for (let k = 0; k < 6 && G.state().match.phase !== 'matchEnd'; k++) { G.skipRound('green'); for (let i = 0; i < 60 * 12 && !['freeze', 'matchEnd'].includes(G.state().match.phase); i++) G.step(1 / 60); } G.setTimeScale(1); });
  const out = { cycles: [] };
  out.start = { listeners: await listeners(), heap: await heap(), st: await st() };
  log('start', JSON.stringify(out.start));
  for (let c = 0; c < 3; c++) {
    const row = {};
    await page.click('#tPlay'); await wait(page, 500); row.play = await st();
    await page.keyboard.press('Escape'); await wait(page, 300); row.paused = await st();
    await page.click('#pResume'); await wait(page, 400); row.resumed = await st();
    await page.evaluate(() => { __game.setTimeScale(0); for (let i = 0; i < 60 * 10; i++) __game.step(1 / 60); __game.render(); __game.setTimeScale(1); }); // 30 s of play
    await toEnd(); await wait(page, 300); row.end = await st();
    await page.keyboard.press('Enter'); await wait(page, 400); row.rematch = await st();
    await toEnd(); await wait(page, 200);
    await page.keyboard.press('Escape'); await wait(page, 400); row.title = await st();
    row.listeners = await listeners(); row.heap = await heap();
    out.cycles.push(row); const r = row; log(`cycle ${c}:`, JSON.stringify({ play: [r.play.app, r.play.phase, r.play.locked], paused: [r.paused.app, r.paused.locked], resumed: [r.resumed.app, r.resumed.locked], end: [r.end.phase, r.end.score], rematch: [r.rematch.phase, r.rematch.round, r.rematch.score, r.rematch.locked], title: [r.title.app, r.title.phase], geo: r.title.geo, tex: r.title.tex, prog: r.title.prog, heap: r.heap, listeners: r.listeners }));
  }
  // single presses act once
  await page.click('#tPlay'); await wait(page, 500);
  await page.evaluate(() => __game.setTimeScale(0));
  out.once = {};
  const p0 = await st(); await page.keyboard.press('Digit2'); const p1 = await st(); await page.keyboard.press('Digit3'); const p2 = await st();
  out.once.pick = [p0.pick, p1.pick, p2.pick];
  await page.evaluate(() => { const G = __game; for (let i = 0; i < 60 * 8 && G.state().match.phase !== 'live'; i++) G.step(1 / 60); });
  const w0 = (await st()).weapon; await page.mouse.wheel(0, 100); await page.evaluate(() => __game.step(0.05)); const w1 = (await st()).weapon; await page.mouse.wheel(0, 100); await page.evaluate(() => __game.step(0.05)); const w2 = (await st()).weapon;
  out.once.wheel = [w0, w1, w2];
  const g0 = await page.evaluate(() => __game.state().weapon.grenades); await page.keyboard.down('KeyG'); await page.evaluate(() => __game.step(0.2)); await page.keyboard.up('KeyG'); await page.evaluate(() => __game.step(0.1));
  out.once.grenade = { before: g0, after: await page.evaluate(() => __game.state().weapon.grenades), live: await page.evaluate(() => __game.grenades.length) };
  await page.evaluate(() => __game.setTimeScale(1));
  await page.keyboard.press('Escape'); await wait(page, 300); out.once.escOnce = await st(); await page.click('#pResume'); await wait(page, 400);
  // pointer lock lost (as when the window loses focus), then a click resumes
  await page.evaluate(() => document.exitPointerLock()); await wait(page, 400); out.lockLost = await st();
  await page.mouse.click(320, 180); await wait(page, 500); out.afterClick = await st();
  if (out.afterClick.app === 'paused') { await page.click('#pResume').catch(() => {}); await wait(page, 500); out.afterResumeButton = await st(); }
  // resize and HUD scale
  const hud = () => page.evaluate(() => { const c = document.querySelector('canvas'), f = (id) => { const e = document.getElementById(id); return e ? parseFloat(getComputedStyle(e).fontSize) : null; }; return { canvas: [c.width, c.height, c.clientWidth, c.clientHeight], inner: [innerWidth, innerHeight], fonts: { mag: f('mag'), health: f('healthNum'), mtime: f('mtime'), wname: f('wname') } }; });
  out.resize = [];
  for (const [w, h] of [[640, 360], [1280, 720], [960, 540], [1280, 400], [500, 800], [640, 360]]) { await page.setViewportSize({ width: w, height: h }); await wait(page, 400); out.resize.push(await hud()); }
  out.end = { listeners: await listeners(), heap: await heap(), st: await st() };
  console.log('one press acts once:', JSON.stringify(out.once));
  console.log('pointer lock lost:', JSON.stringify(out.lockLost), '| after click:', JSON.stringify(out.afterClick), '| after Resume button:', JSON.stringify(out.afterResumeButton || null));
  for (const r of out.resize) console.log('resize', JSON.stringify(r));
  console.log('end', JSON.stringify(out.end));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
