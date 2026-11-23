// Round 3A screenshots: the train from the floor, a bot riding a deck, a group of bots, a scrape, the grenade hand.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const until = (src) => ev((src) => { const f = new Function('g', 'c', 'return ' + src); const g = __game; let n = 0; const car = (t) => g.state().train.cars.find((c) => c.type === t); while (!f(g, car) && n < 6000) { g.step(1 / 60); n++; } return n; }, src);
  // 1. train from the floor, west lane, engine coming up the west straight
  await until("c('engine').pos[0] < 43.05 && c('engine').pos[2] < 92 && c('engine').pos[2] > 88");
  await ev(() => { __game.teleport(48.5, 0, 70); __game.lookAt(43, 2.6, 90); __game.step(1 / 60); __game.render(); });
  await shot('round3/builder_r3a_train_floor.png');
  const dc1 = await ev(() => __game.state().drawCalls);
  // 2. east straight with the tunnel, from the floor near the east lane
  await until("c('engine').pos[0] > 76.9 && c('engine').pos[2] > 60 && c('engine').pos[2] < 62");
  await ev(() => { __game.teleport(84, 0, 50); __game.lookAt(77, 3, 66); __game.step(1 / 60); __game.render(); });
  await shot('round3/builder_r3a_train_tunnel.png');
  // 3. a bot riding a deck: one bot sent along the west ride edge, photographed from beside the track while it rides
  await ev(() => { const g = __game; g.removeBots(); const id = g.spawnBot('tan', 's.c.x'); window._rid = id; });
  let rideInfo = null;
  for (let k = 0; k < 140 && !rideInfo; k++) {
    rideInfo = await ev(() => {
      const g = __game, b = g.state().bots[0];
      if (!b.path.length && !b.riding) { const w = g.deckWait('ride.w').wait; if (w > 3 && w < 7) g.botGoto(window._rid, 'n.c.x', { via: 'ride.w' }); }
      g.step(0.5);
      const s = g.state().bots[0];
      return s.riding && s.pos[2] < 80 ? s : null;
    });
  }
  if (rideInfo) await ev(() => { const g = __game, b = g.state().bots[0]; g.teleport(50, 0, b.pos[2] - 9); g.lookAt(b.pos[0], 1.9, b.pos[2]); g.render(); });
  await shot('round3/builder_r3a_bot_riding.png');
  // 4. a group of bots walking up the open west lane toward the camera, both teams
  await ev(() => { const g = __game; g.removeBots();
    const P = [[38, 48], [40.5, 49], [37, 51], [39.5, 52], [41.5, 51.5], [38.5, 54.5], [40.5, 55], [37.5, 57], [39.5, 58], [41, 57.5]];
    P.forEach(([x, z], i) => { g.spawnBot(i < 5 ? 'green' : 'tan', 'n.w.4'); const b = g.bots[g.bots.length - 1]; g.bots[g.bots.length - 1].x = x; b.z = z; b.px = x; b.pz = z; b.lastNode = 'n.w.3'; });
    g.bots.forEach((b) => g.botGoto(b.id, 'n.w.2', { ride: false }));
    g.step(1.0); g.teleport(40, 0, 36); g.step(0.25); g.lookAt(39.5, 1.0, 50); g.render(); });
  await shot('round3/builder_r3a_bot_group.png');
  const dc2 = await ev(() => ({ dc: __game.state().drawCalls, tri: __game.state().triangles, chev: __game.state().bots.filter((b) => b.chevron).length, states: __game.state().bots.map((b) => b.state) }));
  // 5. a crouched soldier on a roof and the tunnel: player view standing on the boxcar heading into the tunnel
  await ev(() => __game.removeBots());
  await until("c('boxcar').pos[0] > 76.9 && c('boxcar').pos[2] > 59 && c('boxcar').pos[2] < 60");
  await ev(() => { const g = __game, c = g.state().train.cars.find((c) => c.type === 'boxcar'); g.teleport(c.pos[0], 5, c.pos[2], Math.PI, -0.05); g.step(1.6); g.render(); });
  await shot('round3/builder_r3a_roof_into_tunnel.png');
  // 6. the grenade hand while aiming
  await ev(() => { const g = __game; g.step(4); g.clearInput(); g.teleport(60, 0, 40, 0, 0); g.give('grenade'); g.setInput({ grenade: true }); g.step(0.3); g.render(); });
  await shot('round3/builder_r3a_grenade_hand.png');
  await ev(() => { const g = __game; g.setInput({ grenade: false }); g.step(3); g.clearInput(); });
  // 7. dead soldier tipped over
  await ev(() => { const g = __game; g.removeBots(); const id = g.spawnBot('tan', 'n.c.3'); g.teleport(59, 0, 44); g.lookAt(59, 1.0, 52); g.selectWeapon('sniper'); g.step(1); g.lookAt(59, 1.62, 52); g.fire(); g.step(1); g.lookAt(59, 0.5, 52); g.render(); });
  await shot('round3/builder_r3a_soldier_down.png');
  console.log(JSON.stringify({ rideInfo, dc1, dc2 }));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
