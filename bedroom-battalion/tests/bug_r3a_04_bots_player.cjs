// Round 3A check 3 (and ride crowding from check 2): bots against the player and each other.
//  A. a bot's route with the player standing on it (wait nodes, crossings, string feet and tops, ruler, bridge, door,
//     stairs, tunnel top), against a control run with the player out of the way
//  B. crowded rides: 1 to 4 bots forced onto the same ride edge at once (botGoto via), player on the wait node
//  C. spawnBot on every node: lands where it should, not in a solid, not in the envelope, then walks to a far node
// My own detection throughout: arrival, time, stalls (no 1-unit move in 12 s), teleports, static-solid ticks.
// Usage: node bug_r3a_04_bots_player.cjs [sections, default ABC]. Every loop is tick-limited.
const { boot } = require('./bug_r3a_lib.cjs');
const SECT = process.argv[2] || 'ABC';

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((SECT) => {
    const G = __game, DT = 1 / 60, N = G.waypoints.nodes, out = {};
    const r2 = (a) => a.map((v) => +(+v).toFixed(2));
    const bot = (id) => G.state().bots.find((q) => q.id === id);
    // follow bots until they reach their goals (or maxSecs); returns per-bot results
    const follow = (goals, maxSecs, extra) => {
      const res = {}, hist = {}, lastP = {};
      for (const id in goals) res[id] = { arrived: false, t: null, stall: 0, teleports: 0, solid: 0, states: new Set(), maxStill: 0 };
      let still = {};
      for (let i = 0; i < Math.round(maxSecs * 60); i++) {
        if (extra) extra(i);
        G.step(DT);
        let all = true;
        for (const id in goals) {
          const b = bot(id), r = res[id]; if (!b || r.arrived) continue; all = false;
          const [x, y, z] = b.pos, g = N[goals[id]]; r.states.add(b.state);
          if (lastP[id] && Math.hypot(x - lastP[id][0], z - lastP[id][2]) + Math.abs(y - lastP[id][1]) > 1.5) r.teleports++;
          lastP[id] = [x, y, z];
          if (T.solidAt(x, y, z, b.crouching ? 1.2 : 1.8, { lift: 0.3, eps: 0.05 }).length) r.solid++;
          if (i % 60 === 0) { const h = (hist[id] = hist[id] || []); h.push([x, y, z]); if (h.length > 13) h.shift(); if (h.length === 13 && Math.max(...h.map((q) => Math.hypot(q[0] - h[0][0], q[2] - h[0][2]) + Math.abs(q[1] - h[0][1]))) < 1) r.stall++; }
          if (Math.hypot(x - g[0], z - g[2]) < 0.6 && Math.abs(y - g[1]) < 0.75 && b.state !== 'climb' && b.state !== 'ride') { r.arrived = true; r.t = +(i / 60).toFixed(2); r.end = r2(b.pos); }
        }
        if (all) break;
      }
      for (const id in res) { res[id].states = [...res[id].states].join(','); if (!res[id].arrived) { const b = bot(id); res[id].end = b && r2(b.pos); res[id].stateNow = b && b.state; res[id].edgeNow = b && b.edge; } }
      return res;
    };
    const clean = () => { G.removeBots(); G.stuckLog.length = 0; G.trainRescueLog.length = 0; G.clearInput(); G.give('health'); };

    // ---- A. player on the route ----
    if (SECT.includes('A')) {
      out.A = [];
      const cases = [
        ['wait node ride.w (bot forced via ride.w)', 's.c.x', 'n.c.x', 'w.ride.w', { via: 'ride.w' }],
        ['wait node ride.e (bot forced via ride.e)', 'n.c.y', 's.c.y', 'w.ride.e', { via: 'ride.e' }],
        ['crossing node n.c.x (west lane crossing, far side)', 'n.w.x', 'n.c.3', 'n.c.x', {}],
        ['crossing start n.w.x', 'n.w.3', 'n.c.3', 'n.w.x', {}],
        ['crossing node s.c.y', 's.e.x', 's.c.4', 's.c.y', {}],
        ['yo-yo string foot', 'n.e.4', 'n.desk.n', 'n.yy.foot', {}],
        ['yo-yo string top', 'n.yy.foot', 'n.desk.1', 'n.desk.n', {}],
        ['shoelace foot', 's.e.4', 's.desk.s', 's.sl.foot', {}],
        ['small shelf string foot L1', 'n.ss1.a', 'n.ss2.b', 'n.ss1.b', {}],
        ['tall shelf string top L2', 's.ts1.b', 's.ts2.c', 's.ts2.b', {}],
        ['ruler foot (seat side)', 'n.seat', 'n.desk.w', 'n.rul.foot', {}],
        ['ruler top', 'n.rul.foot', 'n.desk.1', 'n.rul.top', {}],
        ['bridge to small shelf (desk end)', 'n.desk.1', 'n.ss1.a', 'n.desk.br', {}],
        ['fort west door', 'n.f.inw', 'n.w.1', 'n.f.wdoor', {}],
        ['fort gate', 'n.f.spawn', 'n.c.2', 'n.f.gate', {}],
        ['tunnel top (drop edge start)', 'm.seat', 'm.c.e', 'm.tunnel.top', {}],
        ['chair seat (tunnel_drop start)', 'n.e.3', 'm.tunnel.top', 'm.seat', {}],
        ['tall book stairs foot', 's.ts.app', 's.ts.top', 's.ts.foot', {}],
        ['bed books stairs foot', 's.bs.app', 's.bed.end', 's.bs.foot', {}],
      ];
      for (const [label, from, to, block, opts] of cases) {
        if (!N[from] || !N[to] || !N[block]) { out.A.push({ label, error: 'missing node', from, to, block }); continue; }
        const row = { label, from, to, playerOn: block };
        for (const withPlayer of [false, true]) {
          clean(); G.teleport(...(withPlayer ? N[block] : [2, 0, 2])); G.step(0.2);
          const id = G.spawnBot('green', from); G.step(DT);
          const path = G.botGoto(id, to, opts);
          const r = follow({ [id]: to }, 90)[id];
          const p = G.state().player;
          row[withPlayer ? 'withPlayer' : 'control'] = Object.assign(r, { path: path ? path.length : false, stuckLog: G.stuckLog.length, trainRescues: G.trainRescueLog.length, playerMovedFrom: withPlayer ? +Math.hypot(p.x - N[block][0], p.z - N[block][2]).toFixed(2) : null });
        }
        out.A.push(row);
      }
    }
    // ---- B. crowded rides ----
    if (SECT.includes('B')) {
      out.B = [];
      for (const [ride, from, to] of [['ride.w', 's.c.x', 'n.c.x'], ['ride.e', 'n.c.y', 's.c.y']]) for (const n of [1, 2, 4]) for (const playerOnWait of [false, true]) {
        clean(); const wait = ride === 'ride.w' ? 'w.ride.w' : 'w.ride.e';
        G.teleport(...(playerOnWait ? N[wait] : [2, 0, 2])); G.step(0.2);
        const goals = {}; for (let k = 0; k < n; k++) { const id = G.spawnBot(k % 2 ? 'tan' : 'green', from); goals[id] = to; G.step(0.3); G.botGoto(id, to, { via: ride }); }
        const ns0 = G.navStats();
        let maxOnDeck = 0, envNotRiding = 0;
        const r = follow(goals, 150, () => { const bs = G.state().bots; const riding = {}; for (const b of bs) { if (b.riding) riding[b.riding] = (riding[b.riding] || 0) + 1; if (R3.inEnv(b.pos[0], b.pos[2]) && !b.riding && b.state !== 'ride' && b.state !== 'board' && b.state !== 'alight' && b.state !== 'cross') envNotRiding++; } maxOnDeck = Math.max(maxOnDeck, ...Object.values(riding), 0); });
        const ns = G.navStats();
        out.B.push({ ride, bots: n, playerOnWait, arrived: Object.values(r).filter((q) => q.arrived).length, times: Object.values(r).map((q) => q.t), stalls: Object.values(r).reduce((a, q) => a + q.stall, 0), teleports: Object.values(r).reduce((a, q) => a + q.teleports, 0), solidTicks: Object.values(r).reduce((a, q) => a + q.solid, 0), maxBotsOnOneDeck: maxOnDeck, envTicksNotRidingOrBoarding: envNotRiding, rides: ns.rides, boards: ns.rideBoards, aborts: ns.rideAborts, giveUps: ns.rideGiveUps, stuckLog: G.stuckLog.length, trainRescues: G.trainRescueLog.length, notArrived: Object.entries(r).filter(([, q]) => !q.arrived).map(([id, q]) => ({ id, end: q.end, state: q.stateNow, edge: q.edgeNow })) });
      }
    }
    // ---- C. spawn on every node ----
    if (SECT.includes('C')) {
      const ids = Object.keys(N), C = { nodes: ids.length, bad: [], walked: 0, arrived: 0, notArrived: [], stalls: 0, solidTicks: 0, teleports: 0 };
      clean(); G.teleport(2, 0, 2); G.step(DT);
      const rnd = R2.rng(5);
      for (const nid of ids) {
        G.removeBots(); const id = G.spawnBot(rnd() < 0.5 ? 'green' : 'tan', nid);
        if (!id) { C.bad.push({ nid, why: 'spawnBot returned ' + id }); continue; }
        G.step(1); const b = bot(id), [x, y, z] = b.pos, n = N[nid];
        const sol = T.solidAt(x, y, z, 1.8, { lift: 0.3, eps: 0.05 });
        const why = [];
        if (Math.hypot(x - n[0], z - n[2]) > 1.0 || Math.abs(y - n[1]) > 0.8) why.push('moved off its node');
        if (sol.length) why.push('inside ' + sol.join('+'));
        if (R3.inEnv(n[0], n[2])) why.push('node inside the envelope');
        if (b.hp < 100) why.push('hp ' + b.hp);
        if (why.length) C.bad.push({ nid, node: n, pos: r2(b.pos), state: b.state, why });
        // walk to a far node (random), 75 s limit
        const to = ids[Math.floor(rnd() * ids.length)]; if (to === nid) continue;
        const path = G.botGoto(id, to); if (!path) { C.notArrived.push({ nid, to, why: 'no path' }); continue; }
        C.walked++;
        const r = follow({ [id]: to }, 75)[id];
        if (r.arrived) C.arrived++; else C.notArrived.push({ nid, to, end: r.end, state: r.stateNow, edge: r.edgeNow });
        C.stalls += r.stall; C.solidTicks += r.solid; C.teleports += r.teleports;
      }
      C.stuckLog = G.stuckLog.slice(0, 10); C.trainRescues = G.trainRescueLog.slice(0, 10);
      out.C = C;
    }
    return out;
  }, SECT);
  if (out.A) { console.log('A. player on the route (control | with player):'); for (const r of out.A) console.log('   ', JSON.stringify(r)); }
  if (out.B) { console.log('B. crowded rides:'); for (const r of out.B) console.log('   ', JSON.stringify(r)); }
  if (out.C) { const C = out.C; console.log(`C. spawnBot on ${C.nodes} nodes: bad spawns ${C.bad.length} | walked to a random node ${C.walked}, arrived ${C.arrived} | stalls ${C.stalls} | solid ticks ${C.solidTicks} | teleports ${C.teleports} | stuckLog ${C.stuckLog.length} | trainRescues ${C.trainRescues.length}`); for (const b of C.bad) console.log('   BAD', JSON.stringify(b)); for (const b of C.notArrived) console.log('   NOT ARRIVED', JSON.stringify(b)); for (const s of C.stuckLog) console.log('   stuckLog', JSON.stringify(s)); for (const s of C.trainRescues) console.log('   trainRescue', JSON.stringify(s)); }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
