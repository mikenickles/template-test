// Round 4 check 1: frozen gameplay. Loads the round 3 build (git show c90ee3c:bedroom-battalion/index.html, saved by the
// caller) and the round 4B snapshot, dumps colliders, waypoints, routes, hit volumes and the whole CONFIG from each, and
// diffs them here in node with my own canonical digest (the round 3 build has no colliderHash()).
// Usage: node bug_r4_01_frozen.cjs <r3 build.html> [r4 build.html]
const path = require('path');
const crypto = require('crypto');
const { launch } = require('./harness.cjs');
const R3 = path.resolve(process.argv[2]);
const R4 = path.resolve(process.argv[3] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o === undefined ? null : o)).digest('hex').slice(0, 12);
const VISUAL_KEY = /colou?r|tex|mat|paint|tint|visual|art|shade|cap$/i;
const geo = (cols) => cols.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !VISUAL_KEY.test(k))));
const visualKeys = (cols) => [...new Set(cols.flatMap((c) => Object.keys(c).filter((k) => VISUAL_KEY.test(k))))];
const GAMEPLAY = ['player', 'move', 'climb', 'fall', 'spring', 'sim', 'input', 'room', 'route', 'track', 'spawn', 'nav', 'gun', 'weapons', 'grenade', 'target', 'train', 'soldier', 'bot', 'rides', 'navTest', 'difficulty', 'ai', 'match', 'roles', 'regions'];

async function dump(file) {
  const { browser, page, errors } = await launch({ width: 640, height: 360, file });
  const t0 = Date.now(); await page.waitForFunction(() => window.__game && window.__game.ready);
  const d = await page.evaluate(() => {
    const G = __game, r = {};
    const num = (v) => (typeof v === 'number' ? +v.toFixed(6) : v);
    r.colliders = G.colliders.filter((c) => !c.test).map((c) => { const o = {}; for (const k of Object.keys(c).sort()) { const v = c[k]; if (typeof v === 'function' || (v && typeof v === 'object' && !Array.isArray(v))) continue; o[k] = Array.isArray(v) ? v.map(num) : num(v); } return o; });
    r.waypoints = { nodes: Object.fromEntries(Object.entries(G.waypoints.nodes).map(([k, v]) => [k, v.map(num)])), edges: G.waypoints.edges.map((e) => ({ a: e.a, b: e.b, kind: e.kind, oneWay: !!e.oneWay, ride: e.ride || null, cost: e.cost !== undefined ? num(e.cost) : null })) };
    r.routes = G.routes;
    r.CONFIG = JSON.parse(JSON.stringify(G.CONFIG));
    r.colliderHash = G.colliderHash ? G.colliderHash() : null;
    // the same FNV-1a over the same fields as the 4B colliderHash(), applied to __game.colliders, so it also runs on round 3
    { const n = (v) => (v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(6) : String(v)) : Array.isArray(v) ? v.map(n).join(',') : String(v));
      const s = G.colliders.filter((c) => !c.test).map((c) => [c.id, c.kind, c.surface, c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, c.axis, c.h0, c.h1, c.thickness, c.base, c.x, c.z, c.r, c.ex, c.ez, c.launch].map(n).join('|')).join('\n');
      let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } r.myColliderHash = ('00000000' + h.toString(16)).slice(-8); }
    G.range(true); r.targets = G.state().targets.map((t) => ({ id: t.id, pos: t.pos })); G.range(false);
    r.validate = G.validateWaypoints();
    r.trainClearance = G.trainClearance();
    return r;
  });
  d.loadMs = Date.now() - t0; d.errors = errors.slice(); d.fileBytes = require('fs').statSync(file).size;
  await browser.close();
  return d;
}
function diff(a, b, p = '', out = []) {
  if (out.length > 200) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`.slice(0, 220)); return out; }
  if (a && typeof a === 'object') { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of keys) { if (!(k in a)) out.push(`${p}.${k}: (new) ${JSON.stringify(b[k])}`.slice(0, 220)); else if (!(k in b)) out.push(`${p}.${k}: (removed) ${JSON.stringify(a[k])}`.slice(0, 220)); else diff(a[k], b[k], p + '.' + k, out); } return out; }
  if (a !== b) out.push(`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`.slice(0, 220));
  return out;
}
(async () => {
  const a = await dump(R3), b = await dump(R4);
  console.log(`builds: r3 ${a.fileBytes} bytes, load to ready ${a.loadMs} ms | r4b ${b.fileBytes} bytes, load ${b.loadMs} ms`);
  console.log(`r4b colliderHash(): ${b.colliderHash} | same algorithm on __game.colliders: r3 ${a.myColliderHash}, r4b ${b.myColliderHash} | r3 build has colliderHash(): ${a.colliderHash !== null}`);
  console.log('collider keys treated as visual-only (excluded from the geometry digest):', JSON.stringify(visualKeys(a.colliders.concat(b.colliders))));
  const rows = [['colliders (geometry, kind, surface, ids)', geo(a.colliders), geo(b.colliders)], ['colliders (all fields)', a.colliders, b.colliders], ['waypoint nodes', a.waypoints.nodes, b.waypoints.nodes], ['waypoint edges', a.waypoints.edges, b.waypoints.edges], ['routes', a.routes, b.routes], ['dummy targets (range)', a.targets, b.targets]];
  for (const g of GAMEPLAY) rows.push(['CONFIG.' + g, a.CONFIG[g], b.CONFIG[g]]);
  for (const [name, x, y] of rows) { const same = md5(x) === md5(y); console.log(`${same ? 'SAME' : 'DIFF'} ${name.padEnd(24)} r3 ${md5(x)} r4b ${md5(y)}${same ? '' : '  (' + diff(x, y).length + ' differences)'}`); if (!same) for (const d of diff(x, y).slice(0, 25)) console.log('      ', d); }
  // every other CONFIG section: just list which changed
  const others = Object.keys({ ...a.CONFIG, ...b.CONFIG }).filter((k) => !GAMEPLAY.includes(k));
  console.log('non-gameplay CONFIG sections changed:', others.filter((k) => md5(a.CONFIG[k]) !== md5(b.CONFIG[k])).join(', '), '| unchanged:', others.filter((k) => md5(a.CONFIG[k]) === md5(b.CONFIG[k])).join(', '));
  console.log(`collider counts r3 ${a.colliders.length} r4b ${b.colliders.length}; validateWaypoints r3 ${JSON.stringify(a.validate)} r4b ${JSON.stringify(b.validate)}; trainClearance r3 ${JSON.stringify(a.trainClearance)} r4b ${JSON.stringify(b.trainClearance)}`);
  console.log('ERRORS r3', JSON.stringify(a.errors), 'r4b', JSON.stringify(b.errors));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
