// Round 4A budget against the round 3 baseline. Builds: the 4A snapshot (snapshots/index_r4a.html) and round 3
// (`git show c90ee3c:bedroom-battalion/index.html`, written to a temp file by this script). For each build, twice and
// interleaved (r3, 4A, r3, 4A) because the machine is shared: time from navigation to `__game.ready`, a digest of the
// collider list, every named view (WebGL draw calls and triangles per pass, median render ms of 9), a firefight
// (autoplay match, overview camera and the soldier's eye), shader programs and texture uploads after a whole match.
// Software renderer: milliseconds are relative, so the result is the 4A / r3 ratio per view.
const fs = require('fs'); const path = require('path'); const os = require('os'); const { execSync } = require('child_process');
const { launch } = require('./harness.cjs'); const { glProbe } = require('./visual_lib.cjs'); const { captureThree } = require('./visual_r2_lib.cjs');
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
const R3 = path.join(process.env.BB_TMP || os.tmpdir(), 'bb_index_r3_c90ee3c.html');      // BB_TMP: a scratch folder for the extracted baseline
fs.writeFileSync(R3, execSync('git show c90ee3c:bedroom-battalion/index.html', { cwd: path.resolve(__dirname, '..'), maxBuffer: 1 << 26 }));
const R4 = path.resolve(__dirname, '..', 'snapshots', 'index_r4a.html');
async function measure(file, tag) {
  const h = await launch({ width: 1280, height: 720, file }); const p = h.page;
  await p.addInitScript(glProbe); await p.addInitScript(captureThree);
  const t0 = Date.now(); await p.reload(); await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 60000 }); const loadMs = Date.now() - t0;
  const out = { tag, loadMs };
  out.colliders = await p.evaluate(() => { const s = JSON.stringify(__game.colliders.map((c) => [c.id, c.kind, c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, c.surface])); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return { n: __game.colliders.length, digest: (h >>> 0).toString(16) }; });
  await p.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.step(1);
    window.__cnt = () => { let c = 0, t = 0; const per = {}; for (const k in window.__gl.passes) { const P = window.__gl.passes[k]; c += P.calls; t += P.tris; per[k] = [P.calls, Math.round(P.tris)]; } return { calls: c, tris: Math.round(t), per }; };
    window.__timed = () => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); window.__gl.reset(); const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - a; };
    window.__med = (n) => { const t = []; for (let i = 0; i < n; i++) t.push(window.__timed()); t.sort((a, b) => a - b); return +t[n >> 1].toFixed(1); }; });
  out.views = {};
  for (const v of VIEWS) out.views[v] = await p.evaluate((v) => { __game.setView(v); window.__timed(); window.__timed(); const c = window.__cnt(); return Object.assign(c, { ms: window.__med(9) }); }, v);
  await p.evaluate(() => __game.clearView());
  out.fight = await p.evaluate(() => {
    __game.startMatch({ difficulty: 'veteran', seed: 3, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(6);
    const R = { overview: { max: 0, per: null, tris: 0, ms: [] }, eye: { max: 0, per: null, tris: 0, ms: [] } };
    for (let i = 0; i < 40 * 30; i++) { __game.step(1 / 30); if (i % 15) continue; const s = __game.state(); if (s.match.phase !== 'live') continue;
      for (const [key, ov] of [['overview', true], ['eye', false]]) { if (ov) { __game.views.probe = [[60, 70, 4], [60, 0, 92]]; __game.setView('probe'); } else __game.clearView();
        const ms = window.__timed(), c = window.__cnt(); R[key].ms.push(ms); if (c.calls > R[key].max) { R[key].max = c.calls; R[key].per = c.per; } R[key].tris = Math.max(R[key].tris, c.per.screen ? c.per.screen[1] : 0); } }
    __game.clearView(); for (const k of ['overview', 'eye']) { const a = R[k].ms.sort((x, y) => x - y); R[k].ms = +a[a.length >> 1].toFixed(1); }
    // finish the match with a render every 2 s, then count programs and textures
    let k = 0; while (__game.state().match.phase !== 'matchEnd' && k++ < 1500) { __game.step(1); if (k % 2 === 0) __game.render(); }
    const r = window.__three.renderer; R.afterMatch = { programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries, matchEnded: __game.state().match.phase === 'matchEnd' };
    return R; });
  out.textures = await p.evaluate(() => window.__gl.tex.filter((t) => t.w > 1).map((t) => [t.w, t.h, t.levels || 0]));
  out.errors = h.errors;
  await h.browser.close();
  return out;
}
(async () => {
  const runs = [];
  for (const [file, tag] of [[R3, 'r3'], [R4, 'r4a'], [R3, 'r3'], [R4, 'r4a']]) { const r = await measure(file, tag); runs.push(r); console.log(tag, 'load', r.loadMs, 'ms', JSON.stringify(r.colliders), 'errors', JSON.stringify(r.errors)); }
  fs.writeFileSync(path.resolve(__dirname, 'visual_r4a_budget_result.json'), JSON.stringify(runs, null, 1));
  const by = (tag) => runs.filter((r) => r.tag === tag), avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log('\nview            r3 calls / main tris   4A calls (main+shadow) / main tris   4A/r3 ms (run 1, run 2)');
  for (const v of VIEWS) { const a = by('r3'), b = by('r4a'); const ratio = [0, 1].map((i) => +(b[i].views[v].ms / a[i].views[v].ms).toFixed(2));
    console.log(v.padEnd(14), String(a[0].views[v].calls).padStart(4), String(a[0].views[v].per.screen[1]).padStart(8), '   ', String(b[0].views[v].calls).padStart(4), JSON.stringify(Object.values(b[0].views[v].per).map((x) => x[0])), String(b[0].views[v].per.screen[1]).padStart(8), '   ', ratio.join(' / '), ' ms', a.map((r) => r.views[v].ms).join('/'), 'vs', b.map((r) => r.views[v].ms).join('/')); }
  for (const k of ['overview', 'eye']) { const a = by('r3'), b = by('r4a'); console.log('firefight', k.padEnd(8), 'r3', a[0].fight[k].max, 'calls', a[0].fight[k].tris, 'main tris |', '4A', b[0].fight[k].max, 'calls', JSON.stringify(b[0].fight[k].per), b[0].fight[k].tris, 'main tris | ms ratio', [0, 1].map((i) => +(b[i].fight[k].ms / a[i].fight[k].ms).toFixed(2)).join(' / ')); }
  for (const r of runs) console.log(r.tag, 'after match', JSON.stringify(r.fight.afterMatch), 'textures', JSON.stringify(r.textures));
  console.log('load ms r3', by('r3').map((r) => r.loadMs).join('/'), '4A', by('r4a').map((r) => r.loadMs).join('/'));
})().catch((e) => { console.error(e); process.exit(1); });
