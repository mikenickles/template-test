// Round 3A: the stuck ladder (jump 1.5 s, strafe 2.5 s, repath 3.5 s, placed and logged 6 s) against a test wall across an edge;
// a bot dropped on the track leaves the envelope at once.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game, out = {}; g.start({ pointerLock: false }); g.setTimeScale(0); g.teleport(60, 0, 16);
    // wall across n.c.3 > n.c.4 (too tall to jump), wide enough that a strafe cannot get round it
    g.addTestBlock(55, 66, 56, 57, 4);
    const id = g.spawnBot('tan', 'n.c.3'); g.botGoto(id, 'n.c.4', { ride: false });
    const ev = [], s0 = g.stuckLog.length; let last = null, jumps = 0;
    for (let i = 0; i < 60 * 14; i++) {
      const was = g.state().bots[0]; g.step(1 / 60); const b = g.state().bots[0];
      const ix = g.bots[0];
      if (ix.jumpHeld && !last) jumps++;
      last = ix.jumpHeld;
      if (i % 30 === 0) ev.push([+g.state().time.toFixed(2), b.state, b.stuckTime, b.edge, b.pos.map((v) => +v.toFixed(2)).join(',')]);
    }
    out.stuckTrace = ev; out.stuckLog = g.stuckLog.slice(s0); out.jumpsPressed = jumps;
    g.removeBots(); g.removeTestBlocks();
    // a bot standing on the west straight leaves the envelope at once, whatever the train is doing
    // wait until the train is on the far side of the oval (engine front on the east straight)
    let k = 0; while (!(g.state().train.cars[0].sFront > 120 && g.state().train.cars[0].sFront < 150) && k < 4000) { g.step(1 / 60); k++; }
    const p0 = g.trainStats.pushes;
    const id2 = g.spawnBot('green', 'n.w.4'); const b2 = g.bots[0]; b2.x = b2.px = 43; b2.z = b2.pz = 70;
    const tr = [];
    for (let i = 0; i < 60 * 2; i++) { g.step(1 / 60); const s = g.state().bots[0]; if (i % 6 === 0) tr.push([+(i / 60).toFixed(2), s.state, s.inEnvelope, s.pos.map((v) => +v.toFixed(2)).join(',')]); }
    out.leaveEnvelope = tr.slice(0, 10); out.leaveEnvelopePushes = g.trainStats.pushes - p0;
    g.removeBots();
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('errors', JSON.stringify(errors)); await browser.close();
})();
