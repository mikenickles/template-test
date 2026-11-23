// Round 3A: dummies out of play by default, back with range(true); default spawnBot; seed reproduces a nav run.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game, out = {}; g.start({ pointerLock: false }); g.setTimeScale(0);
    g.teleport(60, 0, 20, Math.PI, 0); g.lookAt(60, 1.2, 34); g.step(0.6);
    out.off = { targets: g.state().targets.length, shot: g.fire() };
    out.on = g.range(true); g.step(0.2);
    out.onState = { targets: g.state().targets.length, shot: g.fire() };
    g.range(false);
    out.spawnDefault = [g.spawnBot(), g.spawnBot('green'), g.state().bots.map((b) => [b.name, b.team, b.pos.map((v) => +v.toFixed(1))])];
    g.removeBots();
    const run = (seed) => { g.startNavTest({ bots: 10, seed }); g.step(120); const s = g.navStats(); const p = g.state().bots.map((b) => b.pos.map((v) => v.toFixed(3)).join(',')).join(';'); g.removeBots(); return { tasks: s.tasks, kinds: s.kindUse, sig: p.length, p }; };
    // same seed from the same game time reproduces: compare two runs started at matching train phase
    const t0 = g.state().time, lap = g.state().train.lap;
    const a = run(5); g.step(lap * Math.ceil((g.state().time - t0) / lap) - (g.state().time - t0)); const b = run(5);
    const pa = a.p.split(';').map((q) => q.split(',').map(Number)), pb = b.p.split(';').map((q) => q.split(',').map(Number));
    let md = 0; pa.forEach((q, i) => q.forEach((v, k) => { md = Math.max(md, Math.abs(v - pb[i][k])); }));
    out.seedRepeat = { sameTasks: JSON.stringify(a.tasks) === JSON.stringify(b.tasks), maxPositionDiff: md, a: a.tasks, b: b.tasks, timeA0: t0 };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
