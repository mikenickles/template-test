// Round 3A: bullets and grenades against cars, carry-overs, soldiers (hit volumes, tip-over, chevrons), draw calls, sim cost.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, fileSizeBytes, shot } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game, out = {};
    g.start({ pointerLock: false }); g.setTimeScale(0);
    const st = () => g.state(), car = (t) => st().train.cars.find((c) => c.type === t);
    const until = (fn, max) => { let n = 0; while (!fn() && n < max * 60) { g.step(1 / 60); n++; } return n / 60; };
    // ---- bullets stop at cars: a Tan bot stands behind the west straight, the boxcar passes between ----
    const bid = g.spawnBot('tan', 'n.w.5');            // (38, 0, 75)
    until(() => { const c = car('boxcar'); return Math.abs(c.pos[0] - 43) < 0.05 && Math.abs(c.pos[2] - 75) < 0.3; }, 70);
    g.teleport(50, 0, 75); g.lookAt(38, 1.2, 75); g.give('ammo'); g.selectWeapon('rifle'); g.step(0.6);
    const e1 = g.fire();
    out.bulletAtCar = { hit: e1 && e1.hit, kind: e1 && e1.kind, distance: e1 && e1.distance, botHp: st().bots[0].hp };
    until(() => car('caboose').pos[2] < 60, 30); g.step(0.5); g.lookAt(38, 1.2, 75); g.step(0.3);
    const e2 = g.fire();
    out.bulletAfterTrain = { hit: e2 && e2.hit, kind: e2 && e2.kind, zone: e2 && e2.zone, damage: e2 && e2.damage, botHp: st().bots[0].hp };
    // headshot kills: tip-over, chips, the body stays and stops blocking bullets
    g.lookAt(38, 1.62, 75); g.selectWeapon('sniper'); g.step(1); const e3 = g.fire(); g.step(0.5);
    const b3 = st().bots[0];
    out.kill = { hit: e3 && e3.hit, zone: e3 && e3.zone, damage: e3 && e3.damage, dead: b3.dead, hp: b3.hp, state: b3.state };
    g.selectWeapon('rifle'); g.step(1); g.lookAt(38, 1.0, 75); const e4 = g.fire();
    out.shotThroughBody = { hit: e4 && e4.hit, kind: e4 && e4.kind };
    // friendly: a Green bot takes no damage from the player
    const gid = g.spawnBot('green', 'n.w.4'); g.lookAt(37.5, 1.2, 64); g.step(0.3); const e5 = g.fire();
    out.friendly = { hit: e5 && e5.hit, damage: e5 && e5.damage, hp: st().bots.find((b) => b.id === gid).hp };
    g.removeBots();
    // ---- grenade bounces off a moving boxcar and picks up its velocity (west straight, car moving north at 4) ----
    until(() => { const c = car('boxcar'); return Math.abs(c.pos[0] - 43) < 0.05 && Math.abs(c.pos[2] - 90) < 0.3; }, 70);
    g.teleport(50, 0, 86); g.look(Math.PI / 2, -0.15); g.give('grenade');
    g.setInput({ grenade: true }); g.step(1 / 60); g.setInput({ grenade: false }); g.step(1 / 60);
    const gr = g.grenades[0], tr = []; let before = null, after = null;
    for (let i = 0; i < 80 && g.grenades[0] === gr; i++) {
      const b0 = gr.trainBounces || 0; const v = [gr.vx, gr.vy, gr.vz];
      g.step(1 / 60);
      if (!before && (gr.trainBounces || 0) > b0) { before = v.map((x) => +x.toFixed(2)); after = [gr.vx, gr.vy, gr.vz].map((x) => +x.toFixed(2)); }
      if (i % 4 === 0) tr.push([+gr.x.toFixed(2), +gr.y.toFixed(2), +gr.z.toFixed(2)]);
    }
    out.grenade = { trainBounces: gr.trainBounces || 0, velBefore: before, velAfter: after, carVel: car('boxcar').vel, path: tr.slice(0, 12) };
    // grenade lying on the track is knocked aside by the car rather than left inside it
    g.clearInput(); g.step(3);
    // ---- carry-overs ----
    const C = g.CONFIG, col = (id) => g.colliders.find((c) => c.id === id);
    g.teleport(60, 0, 40, 0, 0); g.selectWeapon('sniper'); g.step(1); g.setInput({ scope: true }); g.step(0.4);
    const tr0 = g.fxStats().tracers; const s1 = g.fire(); g.step(1 / 60); const trScoped = g.fxStats().tracers;
    g.clearInput(); g.step(1.5); g.selectWeapon('rifle'); g.step(0.6); const s2 = g.fire(); g.step(1 / 60); const trUnscoped = g.fxStats().tracers;
    g.give('grenade'); g.setInput({ grenade: true }); g.step(0.3); g.render(); const handAim = g.fxStats().handVisible; g.setInput({ grenade: false }); g.step(1 / 60); g.render(); const handAfter = g.fxStats().handVisible;
    out.carryOvers = {
      noTracerScoped: { scoped: !!(s1 && st().weapon), tracersBefore: tr0, afterScopedShot: trScoped, afterUnscopedShot: trUnscoped },
      pistolLayers: C.audio.sounds.shot_pistol.map((L) => L.k + ':' + L.t + ':' + L.f + (L.f1 ? '>' + L.f1 : '') + ' g' + L.g), jumpGain: C.audio.sounds.jump[0].g,
      grenadeHand: { whileAiming: handAim, afterThrow: handAfter },
      crayons: ['n.C-a.crayon1', 'n.C-a.crayon2', 's.C-a.crayon1', 's.C-a.crayon2'].map((id) => { const c = col(id); return id + ' x ' + c.x0 + '..' + c.x1 + ' z ' + c.z0 + '..' + c.z1 + ' h ' + c.y1; }),
      tunnel: ['tunnel.roof', 'tunnel.wall.w', 'tunnel.wall.e'].map((id) => { const c = col(id); return id + ' y ' + c.y0 + '..' + c.y1; })
    };
    g.step(2.5);
    // ---- 10 soldiers and the train in view: draw calls and triangles ----
    g.range(false);
    const spots = [[52, 0, 44], [55, 0, 46], [58, 0, 45], [61, 0, 44], [64, 0, 46], [52, 0, 40], [56, 0, 41], [60, 0, 42], [64, 0, 41], [67, 0, 43]];
    spots.forEach((p, i) => { g.spawnBot(i % 2 ? 'tan' : 'green'); const b = g.bots[g.bots.length - 1]; b.x = b.px = p[0]; b.z = b.pz = p[2]; b.y = b.py = 0; });
    until(() => { const c = car('engine'); return c.pos[2] < 40 && c.pos[0] > 55 && c.pos[0] < 62; }, 70);
    g.teleport(60, 0, 62, 0, -0.05); g.lookAt(60, 2, 38); g.step(1 / 60);
    let dc = 0, tri = 0; for (let i = 0; i < 3; i++) { g.render(); dc = Math.max(dc, st().drawCalls); tri = Math.max(tri, st().triangles); }
    out.drawCalls = { tenSoldiersAndTrain: dc, triangles: tri, botsAlive: st().bots.filter((b) => !b.dead).length,
      chevrons: st().bots.filter((b) => b.chevron).length, greenBots: st().bots.filter((b) => b.team === 'green').length };
    g.setInput({ fire: true }); let mx = 0; for (let i = 0; i < 20; i++) { g.step(1 / 60); g.render(); mx = Math.max(mx, st().drawCalls); } g.clearInput();
    out.drawCalls.firingRifle = mx;
    g.removeBots(); g.render(); out.drawCalls.noBots = st().drawCalls;
    g.setView('spawn_green'); g.render(); out.drawCalls.spawnGreenView = st().drawCalls; g.clearView();
    // ---- sim cost per tick: idle world against the 10-bot nav test ----
    const cost = (sec) => { const n = sec * 60, t0 = performance.now(); g.step(sec); return (performance.now() - t0) / n; };
    g.step(1); out.simCostIdleMs = +cost(20).toFixed(4);
    g.startNavTest({ bots: 10, seed: 7 }); g.step(5); out.simCost10BotsMs = +cost(60).toFixed(4);
    const t1 = performance.now(); for (let i = 0; i < 600; i++) { g.step(1 / 60); } out.simCost10BotsSingleStepsMs = +((performance.now() - t1) / 600).toFixed(4);
    g.removeBots();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('fileSizeBytes', fileSizeBytes, 'errors', JSON.stringify(errors));
  await browser.close();
})();
