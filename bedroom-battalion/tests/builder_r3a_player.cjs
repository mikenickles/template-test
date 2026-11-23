// Round 3A player-side train tests: lap time, whistles, boarding, deck and roof laps, tunnel scrape, pushes on the track, wedge.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = __game, out = {};
    g.start({ pointerLock: false }); g.setTimeScale(0);
    const st = () => g.state(), car = (type) => st().train.cars.find((c) => c.type === type);
    const dmg0 = () => g.damageLog.length;
    const stepUntil = (fn, max) => { let n = 0; while (!fn() && n < max * 60) { g.step(1 / 60); n++; } return n / 60; };
    // ---- lap time and whistles (scan audioLog every second so nothing scrolls out of the 200-entry log) ----
    g.teleport(60, 0, 80);
    const s0 = st().train.cars[0].sFront, t0 = st().time;
    let prev = s0, wraps = 0, lapT = null, seen = new Set(), whistles = [];
    for (let i = 0; i < 60 * 120; i++) {
      g.step(1 / 60);
      const s = st().train.cars[0].sFront;
      if (s < prev) wraps++;
      if (wraps === 1 && lapT === null && s >= s0) lapT = st().time - t0;
      prev = s;
      if (i % 30 === 0) for (const e of g.audioLog) if (e.name === 'train_whistle' && !seen.has(e.time)) { seen.add(e.time); whistles.push(e.time); }
    }
    for (const e of g.audioLog) if (e.name === 'train_whistle' && !seen.has(e.time)) { seen.add(e.time); whistles.push(e.time); }
    out.lap = { lapSeconds: +lapT.toFixed(3), designLap: st().train.lap, whistlesIn120s: whistles.length, whistleTimes: whistles,
      whistleSides: g.trainWhistles.map((w) => w.side), clacksLogged: g.audioLog.filter((e) => e.name === 'train_clack').length };
    // ---- 1. board a flatbed deck from the floor with a jump (west straight, facing west) ----
    const boardAt = (type, z) => {
      g.clearInput(); g.teleport(46.6, 0, z, Math.PI / 2, 0);
      // wait for the deck spot (flatbed 3.75 behind the centre, gondola centre) to be 2.0 units south of us (it moves north at 4)
      const off = type === 'flatbed' ? 3.75 : 0, lead = type === 'flatbed' ? 2.0 : 1.4;
      const waited = stepUntil(() => { const c = car(type); return Math.abs(c.pos[0] - 43) < 0.05 && Math.abs((c.pos[2] + off) - (z + lead)) < 0.05; }, 70);
      g.setInput({ forward: true }); g.step(0.1); g.setInput({ forward: true, jump: true }); g.step(1 / 60); g.setInput({ forward: true }); g.step(0.5); g.clearInput(); g.step(0.3);
      const s = st();
      return { waited: +waited.toFixed(2), riding: s.riding, pos: [s.player.x, s.player.y, s.player.z].map((v) => +v.toFixed(2)), health: s.player.health };
    };
    let d0 = dmg0();
    out.boardFlatbed = boardAt('flatbed', 90);
    // ---- 2. ride a full lap on the deck, no input ----
    const lapRide = (label, crouch) => {
      const yaw0 = st().player.yaw; let off = 0, minY = 99, yawSum = 0, prevYaw = yaw0, leftAt = null;
      if (crouch) g.setInput({ crouch: true });
      for (let i = 0; i < 60 * 54.3; i++) {
        g.step(1 / 60);
        const s = st(); if (!s.riding && leftAt === null) leftAt = +s.time.toFixed(2);
        minY = Math.min(minY, s.player.y); const dy = Math.atan2(Math.sin(s.player.yaw - prevYaw), Math.cos(s.player.yaw - prevYaw)); yawSum += dy; prevYaw = s.player.yaw;
      }
      const s = st();
      return { label, ridingAtEnd: s.riding, leftAt, minY: +minY.toFixed(2), yawTurned: +(yawSum / (2 * Math.PI)).toFixed(3) + ' turns', end: [s.player.x, s.player.y, s.player.z].map((v) => +v.toFixed(2)) };
    };
    out.deckLap = lapRide('flatbed deck');
    out.deckLapDamage = g.damageLog.length - d0;
    // jump off while riding keeps the train velocity
    { const s = st(); g.setInput({ jump: true }); g.step(1 / 60); g.clearInput(); g.step(2 / 60); const s2 = st(); out.jumpOff = { riding: s.riding, vAfterJump: [+s2.player.vx.toFixed(2), +s2.player.vz.toFixed(2)], car: car('flatbed').vel }; g.step(1); }
    // ---- 3. roof lap, crouched through the tunnel (boxcar roof) ----
    g.clearInput();
    stepUntil(() => { const c = car('boxcar'); return Math.abs(c.pos[0] - 43) < 0.05 && c.pos[2] < 95 && c.pos[2] > 90; }, 70);
    { const c = car('boxcar'); g.teleport(c.pos[0], 5, c.pos[2], 0, 0); }
    d0 = dmg0();
    out.roofLapCrouched = lapRide('boxcar roof crouched', true);
    out.roofLapDamage = g.damageLog.length - d0;
    g.clearInput(); g.step(0.5);
    // ---- 4. standing on a roof into the tunnel: scraped off, no damage, not stuck ----
    const scrape = (type) => {
      g.clearInput();
      stepUntil(() => { const c = car(type); return Math.abs(c.pos[0] - 77) < 0.05 && c.pos[2] > 59 && c.pos[2] < 62; }, 70);
      const c = car(type), y = type === 'engine' ? 6 : 5, u = type === 'engine' ? 4 : 0;
      g.teleport(c.pos[0], y, c.pos[2] + u, Math.PI, 0);
      const d0 = dmg0(), tr0 = g.trainRescueLog.length, ts0 = Object.assign({}, g.trainStats); let leftAt = null, maxZ = 0, trace = [];
      for (let i = 0; i < 60 * 12; i++) {
        g.step(1 / 60); const s = st();
        if (!s.riding && leftAt === null) leftAt = [s.player.x, s.player.y, s.player.z].map((v) => +v.toFixed(2));
        if (i % 30 === 0) trace.push([+s.player.x.toFixed(2), +s.player.y.toFixed(2), +s.player.z.toFixed(2), s.riding ? 1 : 0]);
      }
      const s = st();
      // then walk away north (out of the tunnel mouth) for 1.5 s with the normal controls: proves the player is not stuck
      const a0 = st().player; g.look(0, 0); g.setInput({ forward: true }); g.step(1.5); g.clearInput(); const a1 = st().player;
      const w2 = { ok: Math.hypot(a1.x - a0.x, a1.z - a0.z) > 3, pos: [+a1.x.toFixed(2), +a1.y.toFixed(2), +a1.z.toFixed(2)], moved: +Math.hypot(a1.x - a0.x, a1.z - a0.z).toFixed(2) };
      return { type, scrapedOffAt: leftAt, endBeforeWalk: trace[trace.length - 1], damage: g.damageLog.length - d0, rescues: g.trainRescueLog.length - tr0,
        pushes: { side: g.trainStats.side - ts0.side, ahead: g.trainStats.ahead - ts0.ahead, blocked: g.trainStats.blocked - ts0.blocked },
        walkAway: w2, health: s.player.health, trace: trace.slice(0, 16) };
    };
    out.scrapeBoxcar = scrape('boxcar');
    out.scrapeEngineCab = scrape('engine');
    out.scrapeCaboose = scrape('caboose');
    // ---- 5. standing on the track in front of the train ----
    const front = (label, x, z, yaw) => {
      g.clearInput(); g.give('health');
      // place when the engine front is about 20 units of track away
      const sp = g.trackS(x, z);
      stepUntil(() => { const sf = st().train.cars[0].sFront; const d = ((sp - sf) % 216.814 + 216.814) % 216.814; return d > 19 && d < 21; }, 70);
      g.teleport(x, 0, z, yaw || 0, 0);
      const d0 = dmg0(), tr0 = g.trainRescueLog.length, ts0 = Object.assign({}, g.trainStats); let hitAt = null, inside = 0, trace = [];
      for (let i = 0; i < 60 * 25; i++) {
        g.step(1 / 60); const s = st();
        if (hitAt === null && (g.trainStats.pushes > ts0.pushes)) hitAt = +s.time.toFixed(2);
        if (i % 60 === 0) trace.push([+s.player.x.toFixed(2), +s.player.z.toFixed(2)]);
      }
      const s = st();
      return { label, start: [x, z], end: [s.player.x, s.player.y, s.player.z].map((v) => +v.toFixed(2)), damage: g.damageLog.length - d0, health: s.player.health,
        pushes: { total: g.trainStats.pushes - ts0.pushes, side: g.trainStats.side - ts0.side, ahead: g.trainStats.ahead - ts0.ahead, blocked: g.trainStats.blocked - ts0.blocked },
        rescues: g.trainRescueLog.slice(tr0), trace };
    };
    out.trackStraight = front('west straight', 43, 70);
    out.trackStraightOffCentre = front('west straight, 1.2 east of centre', 44.2, 75);
    out.trackCurve = front('north curve', 60, 35.5);
    out.trackCurveSouth = front('south curve, outer side', 72.02, 119.52);
    out.trackTunnel = front('in the tunnel', 77, 0 + 80);
    out.trackTunnelSide = front('in the tunnel, 1.5 west of centre', 75.5, 84);
    // tight spots by the crayons (the closest static cover to the curve): standing against their track-side face
    out.crayonN1 = front('against n.C-a.crayon1', 57.0, 33.42);
    out.crayonN2 = front('against n.C-a.crayon2', 63.0, 33.42);
    out.crayonS1 = front('against s.C-a.crayon1', 57.0, 126.58);
    // wedges built with test blocks (collider only): static cover right beside the west straight, then a closed box
    g.addTestBlock(45.15, 47, 60, 66, 3);
    out.wedgeBlockSideExit = front('wedged between the car and a block beside the straight (exit after the block)', 44.7, 63);
    g.removeTestBlocks();
    g.addTestBlock(45.15, 47, 56, 72, 3); g.addTestBlock(39, 40.85, 56, 72, 3); g.addTestBlock(40.85, 45.15, 56, 57, 3);
    out.wedgeBlockClosed = front('closed wedge: blocks on both sides and ahead (forces the logged fallback)', 43, 64);
    g.removeTestBlocks();
    out.wedgeBlockClosedAfter = st().player;
    out.trainRescueLogTotal = g.trainRescueLog.length;
    out.trainRescueLog = g.trainRescueLog.slice();
    out.damageLogTotal = g.damageLog.filter((d) => d.cause !== 'fall').length;
    out.falls = g.damageLog.slice();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
