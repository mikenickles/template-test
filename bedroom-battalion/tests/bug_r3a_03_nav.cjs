// Round 3A check 2: bot navigation in nav test mode, with my own detection on every tick (not the game's logs):
// stalls (a living bot moves less than 1.0 unit in any 12 s window), unlogged teleports (more than 1.5 units in one tick),
// ticks inside a static solid, outside the room, inside the train envelope while not riding or crossing, overlapping a car
// box by more than 10 cm, health lost, plus the game's stuckLog, trainRescueLog and navStats for comparison.
// Usage: node bug_r3a_03_nav.cjs <seed> [simSeconds=1200] [bots=10]
const { boot } = require('./bug_r3a_lib.cjs');
const SEED = +(process.argv[2] || 1), SECS = +(process.argv[3] || 1200), BOTS = +(process.argv[4] || 10);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ SEED, SECS, BOTS }) => {
    const G = __game, DT = 1 / 60;
    G.teleport(2, 0, 2); G.step(DT);                         // player out of the way in the NW corner
    G.startNavTest({ bots: BOTS, seed: SEED });
    const S = { ticks: 0, stalls: [], teleports: [], solid: {}, solidEx: [], outRoom: 0, env: {}, envEx: [], envTicks: 0, carHits: [], hpLoss: [], climbTicks: 0, rideTicks: 0, states: {} };
    const hist = new Map(), last = new Map(), stallOpen = new Map(), envRun = new Map(), hp = new Map(), prevState = new Map();
    S.crossStarts = 0; S.crossEarly = [];
    // seconds until any car box covers the point where the bot's line crosses the track (from trainAt), up to 4 s
    const carSoon = (x, z, t0) => { const sp = R3.point(G.trackS(x, z)); for (let dt = 0; dt <= 4; dt += 0.05) { for (const c of G.trainAt(t0 + dt)) { const q = R3.local({ pos: [c.x, 0, c.z], yaw: c.yaw }, sp.x, sp.z); if (Math.abs(q.along) < 6.4 && Math.abs(q.lat) < 2.4) return dt; } } return null; };
    const N = Math.round(SECS * 60);
    for (let i = 0; i < N; i++) {
      G.step(DT); S.ticks++;
      const t = G.state().time;
      for (const b of G.state().bots) {
        if (b.dead) continue;
        const [x, y, z] = b.pos;
        S.states[b.state] = (S.states[b.state] || 0) + 1;
        if (b.state === 'cross' && prevState.get(b.id) !== 'cross') { S.crossStarts++; const w = carSoon(x, z, t); if (w !== null && w < 3 && S.crossEarly.length < 20) S.crossEarly.push({ t: +t.toFixed(2), bot: b.id, pos: [x, z].map((v) => +v.toFixed(2)), edge: b.edge, carIn: +w.toFixed(2) }); else if (w !== null && w < 3) S.crossEarly.push(null); }
        prevState.set(b.id, b.state);
        if (b.climbing) S.climbTicks++; if (b.riding) S.rideTicks++;
        // unlogged teleport
        const L = last.get(b.id);
        if (L && Math.hypot(x - L[0], z - L[2]) + Math.abs(y - L[1]) > 1.5) S.teleports.push({ t: +t.toFixed(2), bot: b.id, from: L.map((v) => +v.toFixed(2)), to: [x, y, z].map((v) => +v.toFixed(2)), state: b.state, edge: b.edge, stuckLogLen: G.stuckLog.length, trainRescues: G.trainRescueLog.length });
        last.set(b.id, [x, y, z]);
        // stall: 1 s samples, 12 s window
        if (i % 60 === 0) {
          const h = hist.get(b.id) || []; h.push([x, y, z, t, b.state, b.node, b.edge]); if (h.length > 13) h.shift(); hist.set(b.id, h);
          if (h.length === 13) {
            const moved = Math.max(...h.map((q) => Math.hypot(q[0] - h[0][0], q[2] - h[0][2]) + Math.abs(q[1] - h[0][1])));
            if (moved < 1.0) { if (!stallOpen.get(b.id)) { stallOpen.set(b.id, { bot: b.id, from: +h[0][3].toFixed(1), pos: [x, y, z].map((v) => +v.toFixed(2)), states: [...new Set(h.map((q) => q[4]))], node: b.node, edge: b.edge }); } stallOpen.get(b.id).to = +t.toFixed(1); }
            else if (stallOpen.get(b.id)) { S.stalls.push(stallOpen.get(b.id)); stallOpen.delete(b.id); }
          }
        }
        // inside a static solid (body shrunk 5 cm, lifted 0.3 so stairs and slopes do not count)
        const sol = T.solidAt(x, y, z, b.crouching ? 1.2 : 1.8, { lift: 0.3, eps: 0.05 });
        if (sol.length) { const k = sol.join('+'); S.solid[k] = (S.solid[k] || 0) + 1; if (S.solidEx.length < 8) S.solidEx.push({ t: +t.toFixed(2), bot: b.id, pos: [x, y, z].map((v) => +v.toFixed(2)), state: b.state, edge: b.edge }); }
        if (x < 0.39 || x > 119.61 || z < 0.39 || z > 159.61 || y < -0.01 || y > 89) S.outRoom++;
        // envelope, not riding or crossing
        const crossing = b.state === 'cross' || b.edgeKind === 'cross' && b.state !== 'wait_cross';
        if (R3.inEnv(x, z) && !b.riding && b.state !== 'ride' && !crossing && y < 5) {
          S.envTicks++; S.env[b.state] = (S.env[b.state] || 0) + 1;
          const r = envRun.get(b.id) || { from: t, n: 0, pos: [x, z], state: b.state, edge: b.edge }; r.n++; envRun.set(b.id, r);
        } else if (envRun.get(b.id)) { const r = envRun.get(b.id); if (r.n > 60 && S.envEx.length < 12) S.envEx.push({ bot: b.id, from: +r.from.toFixed(1), secs: +(r.n / 60).toFixed(2), pos: r.pos.map((v) => +v.toFixed(2)), state: r.state, edge: r.edge }); envRun.delete(b.id); }
        // train overlap
        const ic = R3.inCar(x, y, z, b.crouching ? 1.2 : 1.8);
        if (ic.length && Math.max(...ic.map((q) => q.depth)) > 0.1 && S.carHits.length < 12) S.carHits.push({ t: +t.toFixed(2), bot: b.id, car: ic[0], state: b.state, edge: b.edge });
        // health
        const ph = hp.get(b.id); if (ph !== undefined && b.hp < ph) S.hpLoss.push({ t: +t.toFixed(2), bot: b.id, lost: +(ph - b.hp).toFixed(1), pos: [x, y, z].map((v) => +v.toFixed(1)), edge: b.edge }); hp.set(b.id, b.hp);
      }
    }
    for (const v of stallOpen.values()) S.stalls.push(Object.assign(v, { open: true }));
    const ns = G.navStats();
    return { S, ns: { simSeconds: ns.simSeconds, rides: ns.rides, rideStarts: ns.rideStarts, rideBoards: ns.rideBoards, rideAborts: ns.rideAborts, rideGiveUps: ns.rideGiveUps, crossTotal: ns.crossTotal, crossWaitSeconds: ns.crossWaitSeconds, unusedKinds: ns.unusedKinds, unusedRoutes: ns.unusedRoutes, unusedCross: ns.unusedCross, unusedEdges: ns.unusedEdges.length, edgesTotal: ns.edgesTotal, stuck: ns.stuck, rescues: ns.rescues, envelopeSeconds: ns.envelopeSeconds, evades: ns.evades, repaths: ns.repaths, stuckJumps: ns.stuckJumps, stuckStrafes: ns.stuckStrafes, stuckRepaths: ns.stuckRepaths, trainPushes: ns.trainPushes, hitWhileWaiting: ns.hitWhileWaiting, noPath: ns.noPath, dead: ns.dead }, stuckLog: G.stuckLog.slice(0, 20), trainRescueLog: G.trainRescueLog.slice(0, 20), rescueLog: G.rescueLog.slice(0, 10), unusedEdgeList: ns.unusedEdges.slice(0, 40) };
  }, { SEED, SECS, BOTS });
  const S = out.S;
  console.log(`seed ${SEED}, ${BOTS} bots, ${SECS} s (${S.ticks} ticks)`);
  console.log('navStats', JSON.stringify(out.ns));
  console.log(`MY DETECTION: stalls (<1 unit in 12 s) ${S.stalls.length} | unlogged-or-logged teleports ${S.teleports.length} | static-solid ticks ${JSON.stringify(S.solid)} | out of room ${S.outRoom} | envelope ticks not riding/crossing ${S.envTicks} ${JSON.stringify(S.env)} | car overlaps >10 cm ${S.carHits.length} | hp losses ${S.hpLoss.length} | climb ticks ${S.climbTicks} | ride ticks ${S.rideTicks}`);
  console.log('states', JSON.stringify(S.states));
  console.log(`cross starts ${S.crossStarts}, started with a car reaching the crossing point within 3 s: ${S.crossEarly.length}`); for (const x of S.crossEarly.filter(Boolean).slice(0, 8)) console.log('   EARLY CROSS', JSON.stringify(x));
  for (const x of S.stalls) console.log('   STALL', JSON.stringify(x));
  for (const x of S.teleports.slice(0, 15)) console.log('   TELEPORT', JSON.stringify(x));
  for (const x of S.solidEx) console.log('   SOLID', JSON.stringify(x));
  for (const x of S.envEx) console.log('   ENVELOPE >1 s', JSON.stringify(x));
  for (const x of S.carHits) console.log('   CAR', JSON.stringify(x));
  for (const x of S.hpLoss.slice(0, 10)) console.log('   HP', JSON.stringify(x));
  for (const x of out.stuckLog) console.log('   stuckLog', JSON.stringify(x));
  for (const x of out.trainRescueLog) console.log('   trainRescueLog', JSON.stringify(x));
  for (const x of out.rescueLog) console.log('   rescueLog', JSON.stringify(x));
  console.log('unused edges (first 40):', JSON.stringify(out.unusedEdgeList));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
