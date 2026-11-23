// Round 3 pass 2 screenshots: spectating (watched bot's viewmodel, its own model hidden), a body (grey, gun flat), climbing pose, train wheels.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const ev = (fn, a) => page.evaluate(fn, a), out = {};
  // spectating
  out.spec = await ev(() => { const g = __game; g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 31 }); g.setGodMode(false);
    while (g.state().match.phase !== 'live') g.step(0.25); g.step(6); g.damagePlayer(500); g.step(2); g.render(); const s = g.state(); return { spectating: s.match.spectating, weapon: (g.bots.find((b) => b.id === s.match.spectating) || {}).arsenal.current }; });
  await shot('round3/builder_r3c_spectating.png');
  // a body: kill a Tan bot standing in the open and look at it from 4 units
  out.body = await ev(() => { const g = __game; g.startMatch({ difficulty: 'regular', seed: 32 }); g.setGodMode(true);
    while (g.state().match.phase !== 'live') g.step(0.25);
    const b = g.bots.find((o) => o.team === 'tan'); b.x = b.px = 60; b.z = b.pz = 104; b.y = b.py = 0; g.step(1 / 60); g.killBot(b.id); g.step(1);
    b.x = b.px = 60; b.z = b.pz = 104;
    g.teleport(63, 0, 100.5); g.lookAt(60, 0.3, 104); g.step(1 / 60); g.render(); return { tip: b.tip, dead: b.dead }; });
  await shot('round3/builder_r3c_body.png');
  // climbing pose: a bot on the tall shelf string, seen from the shelf side
  out.climb = await ev(() => { const g = __game; g.quitToTitle(); g.start({ pointerLock: false }); g.setTimeScale(0);
    const id = g.spawnBot('tan', 's.ts1.b'); g.botGoto(id, 's.ts2.b', { ride: false });
    let n = 0; while (!(g.state().bots[0].climbing && g.state().bots[0].pos[1] > 27) && n++ < 1200) g.step(1 / 60);
    g.teleport(110.5, 20, 133.5); g.lookAt(107.6, g.state().bots[0].pos[1] + 0.9, 130); g.render(); return { climbing: g.state().bots[0].climbing, y: g.state().bots[0].pos[1] }; });
  await shot('round3/builder_r3c_climbing.png');
  // train wheels from the floor beside the west straight
  out.train = await ev(() => { const g = __game; g.removeBots();
    let n = 0; while (!(g.state().train.cars[2].pos[0] < 43.05 && Math.abs(g.state().train.cars[2].pos[2] - 80) < 1) && n++ < 6000) g.step(1 / 60);
    g.teleport(47.5, 0, 74); g.lookAt(43, 0.6, 80); g.render(); return { car: g.state().train.cars[2].type }; });
  await shot('round3/builder_r3c_train_wheels.png');
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close();
})();
