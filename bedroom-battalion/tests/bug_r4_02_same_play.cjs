// Round 4 checks 1-3: the same play on both builds. For round 3 (c90ee3c) and the 4B snapshot: soldier hit volumes by a
// ray grid, all 18 routes walk and sprint through walkPath (times), nav test on seeds, and runMatch per difficulty and seed
// (full signature: winner, score, every round's reason, duration and kills, stuck, idle, rescues, kill table).
// With gameplay frozen and matches deterministic, every number should be identical.
// Usage: node bug_r4_02_same_play.cjs <r3 build.html> [r4 build.html] [matches per difficulty, default 3]
const path = require('path');
const { launch } = require('./harness.cjs');
const R3 = path.resolve(process.argv[2]);
const R4 = path.resolve(process.argv[3] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const NM = +(process.argv[4] || 3);

async function play(file) {
  const { browser, page, errors } = await launch({ width: 640, height: 360, file });
  const r = await page.evaluate((NM) => {
    const G = __game, out = {};
    G.start({ pointerLock: false }); G.setTimeScale(0);
    // hit volumes: a 21 x 25 ray grid from 6 units at a standing bot, from 4 sides
    G.removeBots(); const id = G.spawnBot('green', 'n.c.3'); G.step(0.5); const b = G.state().bots.find((q) => q.id === id);
    const grid = [];
    for (const [dx, dz] of [[0, 6], [6, 0], [0, -6], [-6, 0]]) for (let i = -10; i <= 10; i++) for (let j = 0; j <= 24; j++) {
      const lat = i * 0.05, y = j * 0.08; const o = [b.pos[0] + dx + (dz ? lat : 0), b.pos[1] + y, b.pos[2] + dz + (dx ? lat : 0)];
      const h = G.raycast(o, [-dx, 0, -dz]); grid.push(h && h.kind === 'soldier' ? (h.zone === 'head' ? 'H' : 'B') : '.');
    }
    out.hitGrid = grid.join(''); out.hitCounts = { head: grid.filter((c) => c === 'H').length, body: grid.filter((c) => c === 'B').length };
    G.removeBots();
    // routes
    const N = G.waypoints.nodes, oneWay = new Set(G.waypoints.edges.filter((e) => e.oneWay).map((e) => e.a + '>' + e.b));
    out.routes = {};
    for (const [rid, ids] of Object.entries(G.routes)) for (const dir of ['up', 'down']) for (const sprint of [false, true]) {
      const p = dir === 'up' ? ids.slice() : ids.slice().reverse();
      if (dir === 'down' && p.some((n, i) => i && oneWay.has(n + '>' + p[i - 1]))) continue;
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(...N[p[0]]); G.step(0.2);
      const w = G.walkPath(p, { sprint, timeout: 90 }); const q = G.state().player, e = N[p[p.length - 1]];
      out.routes[`${rid} ${dir} ${sprint ? 'sprint' : 'walk'}`] = `${w.ok && Math.hypot(q.x - e[0], q.z - e[2]) < 0.8 && Math.abs(q.y - e[1]) < 0.35 && !G.damageLog.length ? 'ok' : 'FAIL'} ${(+w.time).toFixed(3)}`;
    }
    // nav test, two seeds, 300 s
    out.nav = {};
    for (const seed of [11, 23, 37]) { G.removeBots(); G.startNavTest({ bots: 10, seed }); G.step(300); const ns = G.navStats(); out.nav[seed] = { rides: ns.rides, cross: ns.crossTotal, stuck: ns.stuck, rescues: ns.rescues, env: ns.envelopeSeconds, pos: G.state().bots.map((q) => q.pos.map((v) => v.toFixed(2)).join(',')).join(' ') }; G.stopNavTest(); G.removeBots(); }
    // matches
    out.matches = {};
    for (const diff of ['recruit', 'regular', 'veteran']) for (let k = 0; k < NM; k++) {
      const seed = 600 + k; const m = G.runMatch({ difficulty: diff, seed });
      out.matches[`${diff} ${seed}`] = { sig: `${m.winner} ${m.score.green}-${m.score.tan} ` + m.rounds.map((q) => `${q.reason[0]}${q.duration}/${q.kills}`).join(' '), table: m.soldiers.map((s) => `${s.name}:${s.kills}/${s.deaths}`).join(','), stuck: m.stuckLog.length, idle: (G.idleLog || []).length, trainRescues: m.trainRescueLog.length, errors: m.errors.length, wall: m.wallSeconds };
    }
    return out;
  }, NM);
  r.errors = errors.slice();
  await browser.close();
  return r;
}
(async () => {
  const a = await play(R3), b = await play(R4);
  console.log(`hit volumes: r3 ${JSON.stringify(a.hitCounts)} r4b ${JSON.stringify(b.hitCounts)} | grid identical: ${a.hitGrid === b.hitGrid}`);
  let same = 0, n = 0; const rdiff = [];
  for (const k of Object.keys(a.routes)) { n++; if (a.routes[k] === b.routes[k]) same++; else rdiff.push(`${k}: r3 ${a.routes[k]} | r4b ${b.routes[k]}`); }
  console.log(`routes: ${n} legs, identical (status and time to the ms) ${same}; failures r3 ${Object.values(a.routes).filter((v) => v.startsWith('FAIL')).length} r4b ${Object.values(b.routes).filter((v) => v.startsWith('FAIL')).length}`);
  for (const d of rdiff) console.log('   ', d);
  for (const s of Object.keys(a.nav)) console.log(`nav seed ${s}: identical ${JSON.stringify(a.nav[s]) === JSON.stringify(b.nav[s])} | r3 rides ${JSON.stringify(a.nav[s].rides)} cross ${a.nav[s].cross} stuck ${a.nav[s].stuck} rescues ${a.nav[s].rescues} | r4b rides ${JSON.stringify(b.nav[s].rides)} cross ${b.nav[s].cross} stuck ${b.nav[s].stuck} rescues ${b.nav[s].rescues}`);
  for (const k of Object.keys(a.matches)) { const x = a.matches[k], y = b.matches[k]; console.log(`match ${k}: identical ${x.sig === y.sig && x.table === y.table} | r4b ${y.sig.slice(0, 90)} | stuck ${y.stuck} idle ${y.idle} trainRescues ${y.trainRescues} errors ${y.errors} wall r3 ${x.wall}s r4b ${y.wall}s`); if (x.sig !== y.sig) console.log('      r3 ', x.sig.slice(0, 160), '\n      r4b', y.sig.slice(0, 160)); }
  console.log('ERRORS r3', JSON.stringify(a.errors), 'r4b', JSON.stringify(b.errors));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
