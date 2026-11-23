// Round 2 pass 2, FIXLIST item 3: grenade damage on a centred burst, burst frames from about 14 and 40 units,
// arc preview, and the size of the grenade on screen on the throw tick. Screenshots go to screenshots/round2/builder_r2b_*.png
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = {};
  // ---- damage: grenade dropped at a dummy's feet, and aimed throws from 6, 10 and 14 units (best pitch found by search) ----
  out.damage = await page.evaluate(() => {
    const g = __game, r = {};
    const T = () => g.state().targets.find((t) => t.id === 'target.1');      // (60, 0, 34), open floor
    const throwAt = (x, z, yaw, pitchDeg) => {
      g.clearInput(); g.resetTargets(); g.give('grenade'); g.give('health'); g.teleport(x, 0, z, yaw, 0); g.step(0.1); g.look(yaw, pitchDeg * Math.PI / 180);
      g.setInput({ grenade: true }); g.step(0.1); g.setInput({ grenade: false }); g.step(1 / 60);
      const o = g.grenades[0]; let last = null; for (let i = 0; i < 150 && g.grenades.includes(o); i++) { last = [o.x, o.y, o.z]; g.step(1 / 60); }
      const L = g.shotLog.filter((s) => s.weapon === 'grenade' && s.hit === 'target.1').pop();
      return { burst: last.map((v) => +v.toFixed(2)), horiz: +Math.hypot(last[0] - 60, last[2] - 34).toFixed(2), damage: L ? L.damage : 0, killed: T().down };
    };
    for (const d of [6, 10, 14]) {
      let best = null;
      for (let p = -85; p <= 40; p += 1) { const t = throwAt(60, 34 + d, 0, p); if (!best || t.horiz < best.horiz) best = { pitch: p, ...t }; }
      r['from' + d] = best;
    }
    // damage against horizontal distance of the burst from the dummy (formula check at the new 140)
    r.config = { damage: g.CONFIG.grenade.damage, radius: g.CONFIG.grenade.radius };
    g.resetTargets();
    return r;
  });
  console.log('damage', JSON.stringify(out.damage, null, 1));
  // ---- throw tick: how much of the screen the grenade covers (now, and with hideNear 0 = the old drawing) ----
  const redFrac = async (name) => {
    await page.evaluate(() => __game.render()); const p = await shot('round2/' + name);
    return p;
  };
  out.throwTick = {};
  for (const [label, hide] of [['now', null], ['oldDrawing', 0]]) {
    await page.evaluate((hide) => {
      const g = __game; if (hide !== null) { g._keepHide = g.CONFIG.grenade.hideNear; g.CONFIG.grenade.hideNear = hide; }
      g.clearInput(); g.give('grenade'); g.give('health'); g.teleport(60, 0, 60, 0, 0); g.step(0.2); g.look(0, 0.1);
      g.setInput({ grenade: true }); g.step(0.3); g.setInput({ grenade: false }); g.step(1 / 60);
    }, hide);
    out.throwTick[label] = [await redFrac(`builder_r2b_throwtick_${label}_t1.png`)];
    await page.evaluate(() => __game.step(1 / 60));
    out.throwTick[label].push(await redFrac(`builder_r2b_throwtick_${label}_t2.png`));
    await page.evaluate(() => __game.step(1 / 60));
    out.throwTick[label].push(await redFrac(`builder_r2b_throwtick_${label}_t3.png`));
    await page.evaluate(() => { const g = __game; g.step(2.2); if (g._keepHide !== undefined) { g.CONFIG.grenade.hideNear = g._keepHide; delete g._keepHide; } });
  }
  // ---- arc preview against the floor and a pale wall ----
  for (const [label, pos, yaw, pitch] of [['floor', [60, 0, 60], 0, -0.25], ['palewall', [45, 0, 150], Math.PI / 2, 0.3]]) {
    await page.evaluate(([pos, yaw, pitch]) => { const g = __game; g.clearInput(); g.give('grenade'); g.teleport(pos[0], pos[1], pos[2], yaw, pitch); g.step(0.2); g.look(yaw, pitch); g.setInput({ grenade: true }); g.step(0.3); }, [pos, yaw, pitch]);
    await redFrac(`builder_r2b_arc_${label}.png`);
    await page.evaluate(() => { __game.clearInput(); __game.setInput({ grenade: false }); __game.step(2.3); });
  }
  // ---- burst seen from about 14 and 40 units ----
  out.burst = {};
  for (const D of [14, 40]) {
    const info = await page.evaluate((D) => {
      const g = __game; g.clearInput(); g.resetTargets(); g.give('grenade'); g.give('health');
      g.teleport(60, 0, 60, 0, 0); g.step(0.2); g.look(Math.PI * 0.75, 0.15);        // throw toward the south-west floor of the centre lane
      g.setInput({ grenade: true }); g.step(0.1); g.setInput({ grenade: false }); g.step(1 / 60);
      const o = g.grenades[0]; g.step(1.85);
      // a viewer spot D units from the resting grenade with a clear line to it
      let spot = null;
      for (let a = 0; a < 360 && !spot; a += 5) {
        const r = a * Math.PI / 180, x = o.x + D * Math.sin(r), z = o.z + D * Math.cos(r);
        if (x < 2 || x > 118 || z < 2 || z > 158) continue;
        const h = g.raycast([x, 1.6, z], [o.x - x, o.y + 0.3 - 1.6, o.z - z]); if (h && h.distance < Math.hypot(o.x - x, o.y + 0.3 - 1.6, o.z - z) - 0.3) continue;
        const dn = g.raycast([x, 1.7, z], [0, -1, 0]); if (!dn || dn.id !== 'room.floor' || dn.distance < 1.69) continue;
        spot = [x, z];
      }
      g.teleport(spot[0], 0, spot[1]); g.lookAt(o.x, o.y + 1.5, o.z);
      return { grenade: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), viewer: spot.map((v) => +v.toFixed(2)), fuse: +o.fuse.toFixed(3) };
    }, D);
    // step to the burst, then capture frames at 1, 5, 9 and 15 ticks after it
    await page.evaluate(() => { const g = __game; let k = 0; while (g.grenades.length && k < 60) { g.step(1 / 60); k++; } });
    const frames = [];
    let ticks = 1;
    for (const t of [1, 5, 9, 15]) { await page.evaluate((n) => __game.step(n / 60), t - ticks); ticks = t; frames.push(await redFrac(`builder_r2b_burst_${D}u_t${t}.png`)); }
    info.dist = +Math.hypot(info.grenade[0] - info.viewer[0], info.grenade[2] - info.viewer[1]).toFixed(1);
    info.frames = frames.map((f) => f.split('/').pop());
    out.burst[D] = info;
    await page.evaluate(() => __game.step(1));
  }
  // ---- burst seen with the effects hidden for a no-burst reference frame at 14 units ----
  out.drawCalls = await page.evaluate(() => { const g = __game; g.render(); return g.state().drawCalls; });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
