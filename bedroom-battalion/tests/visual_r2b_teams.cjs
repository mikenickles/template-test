// Round 2 re-check: team readability on the current build, same method as visual_r2_teams.cjs (body centre pixel vs
// the pixels just left and right of the body, CIE76 dE, worst side). Every view is also tagged sun or shade (the body
// pixel is re-rendered with the sun switched off; a change over dE 8 means the visible face is sunlit).
// Then the same views are re-rendered under candidate fixes applied to the LIVE scene only (index.html is not edited):
// other Tan values, a dark outline hull on every soldier, other fog distances. A second metric, "edge", is the
// strongest dE of any pixel on the row across the body (catches an outline that the centre pixel cannot see).
// Usage: node visual_r2b_teams.cjs            (all candidates)
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');
const DIST = [10, 30, 60, 100, 150];
const cls = (id) => !id ? 'none' : id === 'room.floor' ? 'floor' : /^room\.wall|^room\.ceil/.test(id) ? 'wall' : /^bed\.|^bear|^bucket/.test(id) ? 'bed' : /^desk\.|^chair\./.test(id) ? 'desk' : /fort/.test(id) ? 'fort' : /tall|small/.test(id) ? 'shelf' : /^ruin/.test(id) ? 'ruin' : /^target/.test(id) ? 'dummy' : 'cover';
const CANDS = [
  { name: 'now', tan: null },
  { name: 'tan #C98A35/#8F5F22', tan: ['#C98A35', '#8F5F22'] },
  { name: 'tan #C4822A/#86561A', tan: ['#C4822A', '#86561A'] },
  { name: 'tan #B87A2E/#7E521C', tan: ['#B87A2E', '#7E521C'] },
  { name: 'outline 0.06 dark', tan: null, outline: [0.06, '#20180F'] },
  { name: 'outline 0.10 dark', tan: null, outline: [0.10, '#20180F'] },
  { name: 'fog 10/300', tan: null, fog: [10, 300] },
  { name: 'fog 20/320', tan: null, fog: [20, 320] },
  { name: 'tan #C98A35 + fog 20/320', tan: ['#C98A35', '#8F5F22'], fog: [20, 320] },
  { name: 'tan #C98A35 + outline 0.06', tan: ['#C98A35', '#8F5F22'], outline: [0.06, '#20180F'] },
];

(async () => {
  const t0 = Date.now();
  const h = await open({ width: 1280, height: 720, probe: true });
  const p = h.page;
  await p.evaluate(() => { __game.selectWeapon('pistol'); __game.step(1); });
  const targets = await p.evaluate(() => __game.state().targets);
  // in-page helpers
  await p.evaluate(() => {
    const S = window.__three.scenes[0];
    window.__tm = S.children.find((c) => c.isInstancedMesh && c.count === 63);
    window.__sun = S.children.find((c) => c.isDirectionalLight);
    window.__fogKeep = [__game.CONFIG.fog.near, __game.CONFIG.fog.far];
    window.__colKeep = []; const col = new window.__tm.instanceColor.array.constructor(window.__tm.instanceColor.array); window.__colKeep = col;
    window.__rd = (dx, dy, n) => { const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(n * n * 4);
      gl.readPixels((W >> 1) + dx - (n >> 1), (H >> 1) + dy - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const ch = [[], [], []]; for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) ch[k].push(b[i * 4 + k]); return ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }); };
    window.__row = (off) => { const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, w = 2 * off + 1, b = new Uint8Array(w * 4);
      gl.readPixels((W >> 1) - off, H >> 1, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); const out = []; for (let i = 0; i < w; i++) out.push([b[i * 4], b[i * 4 + 1], b[i * 4 + 2]]); return out; };
    window.__apply = (c) => {
      const M = window.__tm, T = __game.state().targets, col = new (M.instanceColor.array.constructor)(window.__colKeep); M.instanceColor.array.set(col);
      if (c.tan) { const THREEColor = window.__sun.color.constructor; const main = new THREEColor(c.tan[0]), dark = new THREEColor(c.tan[1]);
        T.forEach((t, i) => { if (t.team !== 'tan') return; M.setColorAt(i * 3, dark); M.setColorAt(i * 3 + 1, main); M.setColorAt(i * 3 + 2, main); }); }
      M.instanceColor.needsUpdate = true;
      const F = __game.CONFIG.fog; [F.near, F.far] = c.fog || window.__fogKeep;
      if (window.__hull) { window.__hull.parent.remove(window.__hull); window.__hull = null; }
      if (c.outline) {
        const [th, colr] = c.outline, Mat = M.material.constructor, S = window.__three.scenes[0];
        const BasicMat = Object.getPrototypeOf(S.children.find((o) => o.isInstancedMesh && o.count === 284).material).constructor;
        const mat = new BasicMat({ color: colr, side: 1 });         // BackSide inverted hull
        const hull = new M.constructor(M.geometry, mat, M.count), m4 = M.matrix.clone(), pos = window.__sun.position.clone(), q = window.__sun.quaternion.clone(), s = pos.clone();
        for (let i = 0; i < M.count; i++) { M.getMatrixAt(i, m4); m4.decompose(pos, q, s); s.set(s.x + 2 * th, s.y + 2 * th, s.z + 2 * th); m4.compose(pos, q, s); hull.setMatrixAt(i, m4); }
        hull.frustumCulled = false; hull.castShadow = false; hull.receiveShadow = false; S.add(hull); window.__hull = hull;
      }
    };
  });

  // ---- phase 1: views with line of sight (same grid as the first pass) and sun / shade ----
  const views = [];
  for (const T of targets) for (const d of DIST) for (let a = 0; a < 12; a++) for (const lift of [0.85, 12]) {
    if (lift > 1 && d < 30) continue;
    const az = a * Math.PI / 6, hd = Math.sqrt(Math.max(0, d * d - (lift - 0.75) ** 2));
    const e = [T.pos[0] + Math.sin(az) * hd, T.pos[1] + 0.75 + lift, T.pos[2] + Math.cos(az) * hd];
    if (e[0] < 1 || e[0] > 119 || e[2] < 1 || e[2] > 159 || e[1] > 88) continue;
    const v = await p.evaluate(([e, T]) => {
      const c = [T.pos[0], T.pos[1] + 0.75, T.pos[2]], d = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], L = Math.hypot(d[0], d[1], d[2]);
      const rc = __game.raycast(e, d);
      if (!rc || rc.id !== T.id || Math.abs(rc.distance - L) > 0.6) return null;
      const back = __game.raycast([c[0] + d[0] / L * 0.7, c[1] + d[1] / L * 0.7, c[2] + d[2] / L * 0.7], d);
      __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(c[0], c[1], c[2]); __game.render();
      const keep = __game.CONFIG.camera.fovVertical, H = 720, f = H / 2 / Math.tan(keep * Math.PI / 360), wpx = 0.5 * f / L;
      const n = wpx >= 9 ? 5 : wpx >= 4 ? 3 : 1;
      const lit = window.__rd(0, 0, n); const I = window.__sun.intensity; window.__sun.intensity = 0; __game.render(); const dark = window.__rd(0, 0, n); window.__sun.intensity = I;
      return { e, c, L, n, wpx: +wpx.toFixed(1), off: Math.max(3, Math.round(wpx * 1.6 + 2)), behind: back ? back.id : null, lit, dark };
    }, [e, T]);
    if (!v) continue;
    views.push({ id: T.id, team: T.team, pos: T.pos, d, az: a * 30, lift, e: v.e, c: v.c, n: v.n, off: v.off, wpx: v.wpx, behind: cls(v.behind), sun: dE(v.lit, v.dark) > 8 ? 'sun' : 'shade' });
  }
  console.log('views with line of sight:', views.length, 'sun', views.filter((v) => v.sun === 'sun').length, '(' + Math.round((Date.now() - t0) / 1000) + ' s)');

  // ---- phase 2: every candidate over every view ----
  const results = {};
  for (const C of CANDS) {
    await p.evaluate((c) => window.__apply(c), C);
    const rows = [];
    for (let i = 0; i < views.length; i += 40) {
      const chunk = views.slice(i, i + 40);
      const r = await p.evaluate((chunk) => chunk.map((v) => {
        __game.teleport(v.e[0], v.e[1] - 1.6, v.e[2]); __game.lookAt(v.c[0], v.c[1], v.c[2]); __game.render();
        return { body: window.__rd(0, 0, v.n), left: window.__rd(-v.off, 0, v.n), right: window.__rd(v.off, 0, v.n), row: window.__row(v.off) };
      }), chunk);
      r.forEach((s, k) => { const v = chunk[k]; const dl = dE(s.body, s.left), dr = dE(s.body, s.right);
        const edge = Math.max(...s.row.map((px) => Math.min(dE(px, s.left), dE(px, s.right))));
        rows.push(Object.assign({}, v, { body: hex(s.body), bgL: hex(s.left), bgR: hex(s.right), dEmin: Math.min(dl, dr), edge: +edge.toFixed(1) })); });
    }
    results[C.name] = rows;
    console.log('candidate done:', C.name, '(' + Math.round((Date.now() - t0) / 1000) + ' s)');
  }

  // ---- report ----
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
  const under = (a) => a.length ? Math.round(100 * a.filter((v) => v < 15).length / a.length) + '%' : '-';
  const now = results.now;
  console.log('\n== NOW: team / dist: views, body px, centre dE median / p10 / min, under 15, edge median, median body colour ==');
  for (const team of ['green', 'tan']) for (const d of DIST) {
    const r = now.filter((x) => x.team === team && x.d === d); if (!r.length) continue; const m = r.map((x) => x.dEmin), mid = r.slice().sort((a, b) => a.dEmin - b.dEmin)[r.length >> 1];
    console.log(team.padEnd(6), String(d).padStart(4), String(r.length).padStart(4), (r[0].wpx + 'px').padStart(7), String(med(m)).padStart(6), String(pct(m, 0.1)).padStart(6), String(Math.min(...m)).padStart(6), under(m).padStart(5), String(med(r.map((x) => x.edge))).padStart(6), mid.body);
  }
  console.log('\n== NOW by sun / shade (median centre dE, under 15) ==');
  for (const team of ['green', 'tan']) for (const d of DIST) { const line = [team, d]; for (const s of ['sun', 'shade']) { const m = now.filter((x) => x.team === team && x.d === d && x.sun === s).map((x) => x.dEmin); line.push(s + ' n' + m.length + ' ' + (m.length ? med(m) : '-') + ' ' + under(m)); } console.log(line.join('  ')); }
  console.log('\n== NOW by background, per distance (median centre dE / n) ==');
  for (const team of ['green', 'tan']) for (const b of ['floor', 'wall', 'bed', 'desk', 'fort', 'shelf', 'cover', 'ruin', 'none']) {
    const line = DIST.map((d) => { const m = now.filter((x) => x.team === team && x.behind === b && x.d === d).map((x) => x.dEmin); return d + ':' + (m.length ? med(m) + '/' + m.length : '-'); });
    if (now.some((x) => x.team === team && x.behind === b)) console.log(' ', team.padEnd(6), b.padEnd(6), line.join('  '));
  }
  console.log('\n== NOW worst 10 Tan views at 60 units or less ==');
  for (const x of now.filter((x) => x.team === 'tan' && x.d <= 60).sort((a, b) => a.dEmin - b.dEmin).slice(0, 10)) console.log(' ', x.id, JSON.stringify(x.pos), 'from', JSON.stringify(x.e.map((v) => +v.toFixed(1))), x.d + 'u', x.sun, 'body', x.body, 'bg', x.bgL, x.bgR, 'dE', x.dEmin, 'behind', x.behind);
  console.log('\n== CANDIDATES: Tan median centre dE (under 15) by distance | Tan edge median | Tan on floor at 10-30 | Green median (check unchanged) ==');
  for (const C of CANDS) {
    const R = results[C.name], line = [C.name.padEnd(28)];
    for (const d of DIST) { const m = R.filter((x) => x.team === 'tan' && x.d === d).map((x) => x.dEmin); line.push(d + ':' + med(m) + '(' + under(m) + ')'); }
    line.push('| edge ' + DIST.map((d) => med(R.filter((x) => x.team === 'tan' && x.d === d).map((x) => x.edge))).join('/'));
    const fl = R.filter((x) => x.team === 'tan' && x.d <= 30 && x.behind === 'floor').map((x) => x.dEmin); line.push('| floor<=30 ' + med(fl) + ' p10 ' + pct(fl, 0.1));
    const wl = R.filter((x) => x.team === 'tan' && x.d >= 60 && (x.behind === 'wall' || x.behind === 'shelf' || x.behind === 'bed')).map((x) => x.dEmin); line.push('| pale bg>=60 ' + med(wl) + '(' + under(wl) + ')');
    line.push('| green ' + DIST.map((d) => med(R.filter((x) => x.team === 'green' && x.d === d).map((x) => x.dEmin))).join('/'));
    line.push('| tan body@60 ' + R.filter((x) => x.team === 'tan' && x.d === 60).sort((a, b) => a.dEmin - b.dEmin)[30].body);
    console.log(line.join(' '));
  }
  fs.writeFileSync(path.resolve(__dirname, 'visual_r2b_teams_result.json'), JSON.stringify({ views: views.length, results }));

  // ---- evidence strips: Tan floor dummy target.9 and Green target.8, median view per distance, now and the chosen fix ----
  const pick = (R, id) => DIST.map((d) => { const r = R.filter((x) => x.id === id && x.d === d && x.lift < 1).sort((a, b) => a.dEmin - b.dEmin); return r.length ? r[r.length >> 1] : null; }).filter(Boolean);
  const strip = async (file, rowsets) => {
    const url = await p.evaluate((rowsets) => {
      const c = document.getElementById('view'), o = document.createElement('canvas'), w = 160, hh = 120, cols = Math.max(...rowsets.map((r) => r.eyes.length));
      o.width = (w * 2 + 4) * cols; o.height = (hh * 2 + 4) * rowsets.length; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      rowsets.forEach((rs, j) => { window.__apply(rs.cand); rs.eyes.forEach((v, i) => { __game.teleport(v.e[0], v.e[1] - 1.6, v.e[2]); __game.lookAt(v.c[0], v.c[1], v.c[2]); __game.render();
        g.drawImage(c, 640 - w / 2, 360 - hh / 2, w, hh, i * (w * 2 + 4), j * (hh * 2 + 4), w * 2, hh * 2); }); });
      window.__apply({ name: 'now' }); return o.toDataURL('image/png'); }, rowsets);
    fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));
  };
  const tanEyes = pick(now, 'target.9'), greenEyes = pick(now, 'target.8');
  console.log('\nstrip target.9 (Tan) views:', tanEyes.map((x) => x.d + 'u ' + x.behind + ' ' + x.sun).join(', '), '| target.8 (Green):', greenEyes.map((x) => x.d + 'u ' + x.behind + ' ' + x.sun).join(', '));
  await strip('visual_re_team_strips.png', [{ cand: CANDS[0], eyes: greenEyes }, { cand: CANDS[0], eyes: tanEyes }, { cand: CANDS[1], eyes: tanEyes }, { cand: CANDS[8], eyes: tanEyes }]);
  console.log('errors', JSON.stringify(h.errors), 'total', Math.round((Date.now() - t0) / 1000), 's');
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
