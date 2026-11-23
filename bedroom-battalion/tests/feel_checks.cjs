// Two numbers quoted in FEEL.md, measured rather than added up by hand:
// (a) Green spawn to the desk north end by the yo-yo string, at climb.speed 3.5 and 5.5; (b) how deep under the bed you must be to be hidden from the desk.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_los.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, N = G.waypoints.nodes, out = {};
    const yy = ['n.f.spawn', 'n.f.ine', 'n.f.edoor', 'n.e.1', 'n.e.2', 'n.e.4', 'n.yy.foot', 'n.desk.n'];
    const sl = ['s.f.spawn', 's.f.ine', 's.f.edoor', 's.e.1', 's.e.2', 's.e.4', 's.sl.foot', 's.desk.s'];
    const tall = ['s.f.spawn', 's.f.ine', 's.f.edoor', 's.e.1', 's.e.2', 's.ts.app', 's.ts.foot', 's.ts.top', 's.ts1.a', 's.ts1.b', 's.ts2.b', 's.ts2.d', 's.ts3.d'];
    for (const v of [3.5, 5.5]) { G.CONFIG.climb.speed = v;
      for (const [name, p] of [['green spawn -> desk north by yo-yo', yy], ['tan spawn -> desk south by shoelace', sl], ['tan spawn -> tall shelf L3', tall]]) {
        G.clearInput(); G.teleport(N[p[0]][0], 0, N[p[0]][2]); G.step(0.1); const w = G.walkPath(p, { sprint: true, timeout: 120 }); out[name + ' @ climb ' + v] = w.ok ? w.time : 'STUCK ' + w.stuckAt; } }
    G.CONFIG.climb.speed = 3.5;
    const eye = [95.6, 27.6, 60];
    out.underBedSeenFromDeskEdgeNorth = {}; for (const x of [34, 32, 30, 27, 24, 21, 18, 15]) out.underBedSeenFromDeskEdgeNorth['x=' + x] = { chest: !LOS.blocked(eye, [x, 1.0, 66]), head: !LOS.blocked(eye, [x, 1.6, 66]) };
    const eye2 = [108.6, 61.6, 140];
    out.underBedSeenFromTallTop = {}; for (const x of [34, 32, 30, 27, 24]) out.underBedSeenFromTallTop['x=' + x] = { chest: !LOS.blocked(eye2, [x, 1.0, 90]) };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await h.browser.close();
})();
