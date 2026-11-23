// Check 2 (part A): every route in DESIGN 4.4 through walkPath, up and down, walk and sprint.
// walkPath's own `ok` is NOT trusted: the end position, height, health, damage log and rescue log are checked here.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const res = await page.evaluate(() => {
    const G = __game, N = G.waypoints.nodes, out = { routes: [], journeys: [] };
    const near = (p, n, tolH = 0.6, tolY = 0.3) => Math.hypot(p.x - n[0], p.z - n[2]) <= tolH && Math.abs(p.y - n[1]) <= tolY;
    const run = (id, ids, sprint, dir) => {
      T.reset();
      const s = N[ids[0]];
      G.teleport(s[0], s[1], s[2]); G.step(0.2);
      const start = T.st();
      const startOK = near(start, s, 0.05, 0.05) && start.onGround;
      const hp0 = start.health;
      const r = G.walkPath(ids, { sprint, timeout: 90 });
      G.clearInput(); G.step(0.5);
      const p = T.st(), e = N[ids[ids.length - 1]];
      return { id, dir, sprint, ok: r.ok, time: r.time, stuckAt: r.stuckAt, end: T.pos(), want: e, endOK: near(p, e) && p.onGround && !p.climbing, startOK,
        hpLost: hp0 - p.health, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), rescues: G.rescueLog.length, inside: T.inside() };
    };
    for (const id of Object.keys(G.routes)) {
      const ids = G.routes[id];
      for (const sprint of [false, true]) {
        out.routes.push(run(id, ids, sprint, 'up'));
        out.routes.push(run(id, ids.slice().reverse(), sprint, 'down'));
      }
    }

    // ---- journeys from the Green spawn with no teleport in between (BFS over the waypoint graph) ----
    const adj = {};
    for (const e of G.waypoints.edges) { (adj[e.a] = adj[e.a] || []).push(e.b); if (!e.oneWay) (adj[e.b] = adj[e.b] || []).push(e.a); }
    const bfs = (a, b) => {
      const prev = { [a]: null }, q = [a];
      while (q.length) { const u = q.shift(); if (u === b) break; for (const v of adj[u] || []) if (!(v in prev)) { prev[v] = u; q.push(v); } }
      if (!(b in prev)) return null;
      const path = []; for (let u = b; u; u = prev[u]) path.unshift(u); return path;
    };
    const journey = (name, legs, sprint) => {
      T.reset();
      G.teleport(60, 0, 20, Math.PI, 0); G.step(0.2);
      // walk from the spawn point to the first node by hand so walkPath does not teleport
      let at = 'n.f.spawn';
      const g0 = T.goTo(N[at][0], N[at][2], { timeout: 10 });
      const log = [];
      for (const leg of legs) {
        const ids = Array.isArray(leg) ? leg : bfs(at, leg);
        if (!ids) { log.push({ leg, err: 'no graph path from ' + at }); return { name, sprint, ok: false, log }; }
        const full = ids[0] === at ? ids : bfs(at, ids[0]).concat(ids.slice(1));
        const before = T.st(), f = N[full[0]];
        const teleported = Math.hypot(before.x - f[0], before.z - f[2]) > 1 || Math.abs(before.y - f[1]) > 1;
        const r = G.walkPath(full, { sprint, timeout: 200 });
        const p = T.st(), e = N[full[full.length - 1]];
        log.push({ to: full[full.length - 1], n: full.length, ok: r.ok, stuckAt: r.stuckAt, time: r.time, teleported, endOK: near(p, e) && p.onGround, end: T.pos() });
        if (!r.ok) return { name, sprint, ok: false, log };
        at = full[full.length - 1];
      }
      const p = T.st();
      return { name, sprint, ok: log.every((l) => l.ok && l.endOK && !l.teleported), end: T.pos(), hp: p.health, dmg: G.damageLog.length, rescues: G.rescueLog.length, time: +log.reduce((a, l) => a + l.time, 0).toFixed(1), log };
    };
    const R = G.routes;
    for (const sprint of [false, true]) {
      out.journeys.push(journey('spawn > bed_blanket > bed top', [R.bed_blanket], sprint));
      out.journeys.push(journey('spawn > bed_books > bed top', [R.bed_books], sprint));
      out.journeys.push(journey('spawn > bed_spring > bed top', [R.bed_spring], sprint));
      out.journeys.push(journey('spawn > desk_skate > desk', [R.desk_skate], sprint));
      out.journeys.push(journey('spawn > desk_stairs > desk', [R.desk_stairs], sprint));
      out.journeys.push(journey('spawn > desk_yoyo > desk', [R.desk_yoyo], sprint));
      out.journeys.push(journey('spawn > desk_lace > desk', [R.desk_lace], sprint));
      out.journeys.push(journey('spawn > tall_stairs > L2_a > L3_a (top shelf)', [R.tall_stairs, R.tall_L2_a, R.tall_L3_a], sprint));
      out.journeys.push(journey('spawn > tall_stairs > L2_b > L3_b (top shelf)', [R.tall_stairs, R.tall_L2_b, R.tall_L3_b], sprint));
      out.journeys.push(journey('spawn > tall_stairs > L2_a > L3_b (top shelf)', [R.tall_stairs, R.tall_L2_a, R.tall_L3_b], sprint));
      out.journeys.push(journey('spawn > tall_stairs > L2_b > L3_a (top shelf)', [R.tall_stairs, R.tall_L2_b, R.tall_L3_a], sprint));
      out.journeys.push(journey('spawn > desk_lace > tall_bridge > L2_a > L3_a (top shelf)', [R.desk_lace, R.tall_bridge, R.tall_L2_a, R.tall_L3_a], sprint));
      out.journeys.push(journey('spawn > desk_skate > desk walk > tall_bridge > L2_b > L3_b (top shelf)', [R.desk_skate, R.tall_bridge, R.tall_L2_b, R.tall_L3_b], sprint));
      out.journeys.push(journey('spawn > small_stairs > small_L2_a', [R.small_stairs, R.small_L2_a], sprint));
      out.journeys.push(journey('spawn > small_stairs > small_L2_b', [R.small_stairs, R.small_L2_b], sprint));
      out.journeys.push(journey('spawn > desk_yoyo > small_bridge > small_L2_a', [R.desk_yoyo, R.small_bridge, R.small_L2_a], sprint));
      out.journeys.push(journey('spawn > desk_skate > tunnel_drop', [R.desk_skate.slice(0, 3), R.tunnel_drop], sprint));
    }
    return out;
  });
  console.log('route | dir | sprint | ok | endOK | time | end | hpLost | dmg | rescues | stuckAt');
  for (const r of res.routes) console.log([r.id, r.dir, r.sprint ? 'sprint' : 'walk', r.ok, r.endOK, r.time, JSON.stringify(r.end), r.hpLost, JSON.stringify(r.dmg), r.rescues, r.stuckAt || '', r.inside.length ? 'INSIDE ' + r.inside : '', r.startOK ? '' : 'START-NOT-ON-NODE'].join(' | '));
  console.log('\nJOURNEYS');
  for (const j of res.journeys) {
    console.log([j.name, j.sprint ? 'sprint' : 'walk', 'ok=' + j.ok, JSON.stringify(j.end), 'hp=' + j.hp, 'dmg=' + j.dmg, 'rescues=' + j.rescues, 't=' + j.time].join(' | '));
    if (!j.ok) console.log('   ', JSON.stringify(j.log));
  }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
