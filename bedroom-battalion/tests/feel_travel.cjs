// Travel times over the waypoint graph (walkPath uses the real movement code) + raw straight-line crossings.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, N = G.waypoints.nodes, E = G.waypoints.edges, out = {};
    const adj = {};
    const cost = (a, b, kind) => {
      const A = N[a], B = N[b], dh = Math.hypot(A[0] - B[0], A[2] - B[2]), dy = Math.abs(A[1] - B[1]);
      if (kind === 'climb') return dy / 3.5 + 0.5;
      if (kind === 'launch') return 2.2;
      if (kind === 'drop') return dh / 7 + Math.sqrt(2 * dy / 22);
      return dh / 7;
    };
    for (const e of E) {
      (adj[e.a] = adj[e.a] || []).push([e.b, cost(e.a, e.b, e.kind), e.kind]);
      if (!e.oneWay) (adj[e.b] = adj[e.b] || []).push([e.a, cost(e.b, e.a, e.kind), e.kind]);
    }
    const path = (from, to, ban) => {
      const dist = {}, prev = {}, done = {}; dist[from] = 0;
      for (;;) {
        let u = null; for (const k in dist) if (!done[k] && (u === null || dist[k] < dist[u])) u = k;
        if (u === null) return null; if (u === to) break; done[u] = 1;
        for (const [v, c, kind] of adj[u] || []) { if (ban && ban(u, v, kind)) continue; const d = dist[u] + c; if (!(v in dist) || d < dist[v]) { dist[v] = d; prev[v] = u; } }
      }
      const p = [to]; while (p[0] !== from) p.unshift(prev[p[0]]); return p;
    };
    const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) { const A = N[p[i - 1]], B = N[p[i]]; L += Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); } return +L.toFixed(1); };
    const run = (name, from, to, ban) => {
      const p = path(from, to, ban); if (!p) { out[name] = 'NO PATH'; return; }
      G.clearInput(); G.teleport(N[from][0], N[from][1], N[from][2]); G.step(0.1);
      const hp0 = G.state().player.health;
      const s = G.walkPath(p, { sprint: true, timeout: 200 });
      const hp1 = G.state().player.health;
      G.clearInput(); G.teleport(N[from][0], N[from][1], N[from][2]); G.step(0.1);
      const w = G.walkPath(p, { sprint: false, timeout: 300 });
      out[name] = { sprint: s.ok ? s.time : 'STUCK@' + s.stuckAt, walk: w.ok ? w.time : 'STUCK@' + w.stuckAt, pathLen: len(p), hpLost: hp0 - hp1, via: p.join(' ') };
    };
    const noCentre = (lane) => (u, v) => false;
    // ---- crossings
    run('fort_to_fort_fastest', 'n.f.spawn', 's.f.spawn');
    const laneBan = (keep) => (u, v) => { const x = N[v][0]; const inFort = /\.f\./.test(v); return !inFort && !keep(x, v); };
    run('fort_to_fort_west_lane', 'n.f.spawn', 's.f.spawn', laneBan((x) => x <= 45));
    run('fort_to_fort_centre_lane', 'n.f.spawn', 's.f.spawn', laneBan((x) => x > 45 && x < 76));
    run('fort_to_fort_east_lane', 'n.f.spawn', 's.f.spawn', laneBan((x) => x >= 76));
    // ---- spawn to centre and high places, both teams
    const T = { centre_platform: 'm.plat', bed_top_mid: 'm.bed', desk_top_mid: 'm.desk', small_shelf_L1: 'n.ss1.a', small_shelf_top_L2: 'n.ss2.b', tall_shelf_L1: 's.ts1.a', tall_shelf_L2: 's.ts2.b', tall_shelf_top_L3: 's.ts3.d',
      bed_north_end: 'n.bed.end', bed_south_end: 's.bed.end', desk_north: 'n.desk.n', desk_south: 's.desk.s', chair_seat: 'm.seat', tunnel_top: 'm.tunnel.top', under_bed_mid: 'm.ub', spring_pad: 'm.pad' };
    for (const k in T) { run('green_to_' + k, 'n.f.spawn', T[k]); run('tan_to_' + k, 's.f.spawn', T[k]); }
    // ---- raw straight line wall to wall along x = 42 (west of the forts), walk and sprint
    for (const mode of ['walk', 'sprint']) {
      G.clearInput(); G.teleport(42, 0, 0.5, Math.PI, 0); G.step(0.1); G.setInput({ forward: true, sprint: mode === 'sprint' });
      let t = 0; while (G.state().player.z < 159.5 && t < 60) { G.step(1 / 60); t += 1 / 60; }
      const p = G.state().player; out['raw_wall_to_wall_x42_' + mode] = { time: +t.toFixed(2), endZ: +p.z.toFixed(2), x: +p.x.toFixed(2) };
      G.clearInput(); G.teleport(1, 0, 20, -Math.PI / 2, 0); G.step(0.1); G.setInput({ forward: true, sprint: mode === 'sprint' });
      t = 0; while (G.state().player.x < 119.5 && t < 60) { G.step(1 / 60); t += 1 / 60; }
      const q = G.state().player; out['raw_west_to_east_z20_' + mode] = { time: +t.toFixed(2), endX: +q.x.toFixed(2) };
    }
    out.damageLog = G.damageLog.slice(-5);
    return out;
  });
  for (const k in r) console.log(k.padEnd(34), JSON.stringify(r[k]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
