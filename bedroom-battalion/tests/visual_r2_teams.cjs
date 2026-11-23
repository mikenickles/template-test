// Round 2 team readability: every dummy from 10, 30, 60, 100 and 150 units, 12 directions, eye level and raised.
// The camera looks straight at the dummy's body, so the body is at the screen centre; its colour is compared with
// the pixels just left and right of it (dE76). Also the shelf sniper sightlines, unscoped and at the scope's fov.
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');
const DIST = [10, 30, 60, 100, 150];
const cls = (id) => !id ? 'none' : id === 'room.floor' ? 'floor' : /^room\.wall|^room\.ceil/.test(id) ? 'wall' : /^bed\.|^bear|^bucket/.test(id) ? 'bed' : /^desk\.|^chair\./.test(id) ? 'desk' : /fort/.test(id) ? 'fort' : /tall|small/.test(id) ? 'shelf' : /^ruin/.test(id) ? 'ruin' : /^target/.test(id) ? 'dummy' : 'cover';

(async () => {
  const h = await open({ width: 1280, height: 720 });
  const p = h.page;
  await p.evaluate(() => { __game.selectWeapon('pistol'); __game.step(1); });
  const targets = await p.evaluate(() => __game.state().targets);
  const sample = (eye, T, fov) => p.evaluate(([e, T, fov]) => {
    const C = __game.CONFIG, c = [T.pos[0], T.pos[1] + 0.75, T.pos[2]], d = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], L = Math.hypot(d[0], d[1], d[2]);
    const rc = __game.raycast(e, d);
    if (!rc || rc.id !== T.id || Math.abs(rc.distance - L) > 0.6) return null;                 // no line of sight to the body
    const back = __game.raycast([c[0] + d[0] / L * 0.7, c[1] + d[1] / L * 0.7, c[2] + d[2] / L * 0.7], d);
    const keep = C.camera.fovVertical; if (fov) C.camera.fovVertical = fov;
    __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(c[0], c[1], c[2]); __game.render();
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const f = H / 2 / Math.tan((fov || keep) * Math.PI / 360), wpx = 0.5 * f / L, hpx = 1.8 * f / L;       // narrowest body side, full height
    const n = wpx >= 9 ? 5 : wpx >= 4 ? 3 : 1, off = Math.max(3, Math.round(wpx * 1.6 + 2));
    const rd = (dx, dy, n) => { const b = new Uint8Array(n * n * 4); gl.readPixels((W >> 1) + dx - (n >> 1), (H >> 1) + dy - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const ch = [[], [], []]; for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) ch[k].push(b[i * 4 + k]); return ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }); };
    const out = { body: rd(0, 0, n), left: rd(-off, 0, n), right: rd(off, 0, n), wpx: +wpx.toFixed(1), hpx: +hpx.toFixed(1), behind: back ? back.id : null, dist: +L.toFixed(1) };
    C.camera.fovVertical = keep;
    return out;
  }, [eye, T, fov || 0]);

  const rows = [];
  for (const T of targets) {
    for (const d of DIST) for (let a = 0; a < 12; a++) for (const lift of [0.85, 12]) {
      if (lift > 1 && d < 30) continue;
      const az = a * Math.PI / 6, hd = Math.sqrt(Math.max(0, d * d - (lift - 0.75) ** 2));
      const e = [T.pos[0] + Math.sin(az) * hd, T.pos[1] + 0.75 + lift, T.pos[2] + Math.cos(az) * hd];
      if (e[0] < 1 || e[0] > 119 || e[2] < 1 || e[2] > 159 || e[1] > 88) continue;
      const s = await sample(e, T);
      if (!s) continue;
      const dl = dE(s.body, s.left), dr = dE(s.body, s.right);
      rows.push({ id: T.id, team: T.team, pos: T.pos, d, az: a * 30, lift, eye: e.map((v) => +v.toFixed(1)), body: hex(s.body), bgL: hex(s.left), bgR: hex(s.right), dEmin: Math.min(dl, dr), dEmax: Math.max(dl, dr), wpx: s.wpx, hpx: s.hpx, behind: cls(s.behind) });
    }
  }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
  console.log('views with line of sight:', rows.length);
  console.log('\nteam   dist  views  body px (w x h)  dE worst side: median / 10th pct / min   share under dE 15   median body colour');
  for (const team of ['green', 'tan']) for (const d of DIST) {
    const r = rows.filter((x) => x.team === team && x.d === d); if (!r.length) continue;
    const m = r.map((x) => x.dEmin), mid = r.slice().sort((a, b) => a.dEmin - b.dEmin)[r.length >> 1];
    console.log(team.padEnd(6), String(d).padStart(4), String(r.length).padStart(6), ('   ' + r[0].wpx + ' x ' + r[0].hpx).padEnd(18), String(med(m)).padStart(6), String(pct(m, 0.1)).padStart(8), String(Math.min(...m)).padStart(7), ('   ' + Math.round(100 * m.filter((v) => v < 15).length / m.length) + ' %').padEnd(18), mid.body);
  }
  console.log('\nby what is behind the dummy (median dE worst side / share under 15), all distances up to 60 then 100+:');
  for (const team of ['green', 'tan']) for (const b of ['floor', 'wall', 'bed', 'desk', 'fort', 'shelf', 'cover', 'ruin']) {
    const near = rows.filter((x) => x.team === team && x.behind === b && x.d <= 60).map((x) => x.dEmin), far = rows.filter((x) => x.team === team && x.behind === b && x.d >= 100).map((x) => x.dEmin);
    if (near.length + far.length) console.log(' ', team.padEnd(6), b.padEnd(6), 'near n', String(near.length).padStart(3), 'median', String(med(near)).padStart(5), 'under15', near.length ? Math.round(100 * near.filter((v) => v < 15).length / near.length) + ' %' : '-', '| far n', String(far.length).padStart(3), 'median', String(med(far)).padStart(5), 'under15', far.length ? Math.round(100 * far.filter((v) => v < 15).length / far.length) + ' %' : '-');
  }
  console.log('\nworst 12 views at 60 units or less:');
  for (const x of rows.filter((x) => x.d <= 60).sort((a, b) => a.dEmin - b.dEmin).slice(0, 12)) console.log(' ', x.id, x.team, JSON.stringify(x.pos), 'from', JSON.stringify(x.eye), x.d + 'u', 'body', x.body, 'bg', x.bgL, x.bgR, 'dE', x.dEmin, 'behind', x.behind);
  // lit vs shaded body colour per team at 10 units
  for (const team of ['green', 'tan']) { const r = rows.filter((x) => x.team === team && x.d === 10); const by = {}; for (const x of r) (by[x.id] = by[x.id] || []).push(x.body); console.log(team, 'body colours at 10 units by dummy:', Object.entries(by).map(([k, v]) => k + ' ' + [...new Set(v)].slice(0, 4).join('/')).join(' | ')); }

  // ---- shelf sniper sightlines: tall shelf L3 (Tan side) to Green dummies, small shelf L2 (Green side) to Tan dummies ----
  console.log('\nshelf sightlines (unscoped fov 75 | scoped fov 25):');
  for (const [name, eye, team] of [['tall shelf L3 edge', [108.6, 61.6, 136], 'green'], ['small shelf L2 edge', [108.6, 41.6, 22], 'tan'], ['tan tower', [70.5, 8.6, 148], 'green'], ['green tower', [70.5, 8.6, 12], 'tan']]) {
    for (const T of targets.filter((t) => t.team === team)) {
      const u = await sample(eye, T), s = await sample(eye, T, 25);
      if (!u) continue;
      console.log(' ', name.padEnd(20), T.id.padEnd(10), JSON.stringify(T.pos).padEnd(14), (u.dist + 'u').padEnd(7), 'unscoped', (u.wpx + 'x' + u.hpx + 'px').padEnd(12), 'dE', String(Math.min(dE(u.body, u.left), dE(u.body, u.right))).padEnd(5), hex(u.body), 'on', hex(u.left), '| scoped', (s.wpx + 'x' + s.hpx + 'px').padEnd(12), 'dE', Math.min(dE(s.body, s.left), dE(s.body, s.right)), hex(s.body), 'behind', cls(u.behind));
    }
  }
  // ---- evidence: one clear-lane dummy per team at each distance, crop around the dummy, enlarged 3x ----
  const stripFor = async (file, T, dirs, fov) => {
    const url = await p.evaluate(([T, dirs, fov]) => {
      const c = document.getElementById('view'), o = document.createElement('canvas'), w = 200, hh = 150; o.width = (w * 2 + 4) * dirs.length; o.height = hh * 2; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
      const keep = __game.CONFIG.camera.fovVertical; if (fov) __game.CONFIG.camera.fovVertical = fov;
      dirs.forEach((e, i) => { __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(T[0], T[1] + 0.75, T[2]); __game.render(); g.drawImage(c, 640 - w / 2, 360 - hh / 2, w, hh, i * (w * 2 + 4), 0, w * 2, hh * 2); });
      __game.CONFIG.camera.fovVertical = keep; return o.toDataURL('image/png'); }, [T, dirs, fov || 0]);
    fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64'));
  };
  const pick = (id) => DIST.map((d) => { const r = rows.filter((x) => x.id === id && x.d === d && x.lift < 1).sort((a, b) => a.dEmin - b.dEmin); return r.length ? r[r.length >> 1] : null; }).filter(Boolean);
  for (const [file, id] of [['visual_team_green_floor.png', 'target.2'], ['visual_team_tan_floor.png', 'target.5'], ['visual_team_tan_floor_b.png', 'target.9'], ['visual_team_green_floor_b.png', 'target.8']]) {
    const r = pick(id); if (!r.length) continue;
    console.log(file, r.map((x) => x.d + 'u dE ' + x.dEmin + ' ' + x.body + ' on ' + x.bgL + '/' + x.bgR + ' behind ' + x.behind).join(' | '));
    await stripFor(file, r[0].pos, r.map((x) => x.eye));
  }
  const g = targets.filter((t) => t.team === 'green').map((t) => t.pos), t0 = targets.find((t) => t.id === 'target.1').pos;
  await stripFor('visual_team_shelf_unscoped.png', t0, [[108.6, 61.6, 136]]); await stripFor('visual_team_shelf_scoped.png', t0, [[108.6, 61.6, 136]], 25);
  await p.evaluate(() => { __game.teleport(108.6, 60, 136, 0, 0); __game.lookAt(60, 0.75, 34); __game.selectWeapon('sniper'); __game.step(1); __game.lookAt(60, 0.75, 34); });
  await h.snap('visual_team_shelf_view_unscoped.png');
  await p.evaluate(() => { __game.setInput({ scope: true }); __game.step(0.4); __game.lookAt(60, 0.75, 34); });
  await h.snap('visual_team_shelf_view_scoped.png');
  fs.writeFileSync(path.resolve(__dirname, 'visual_r2_teams_result.json'), JSON.stringify(rows));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
