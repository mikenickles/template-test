// Round 3 team readability with real soldiers in a real match (autoplay, god mode, seeded). Every 0.5 s of sim the match
// is frozen and soldiers are sampled by state: moving, still, crouched, dead (tipped body), riding, climbing; and by
// surface: floor, bed, desk, shelves, train. For each sample, the camera (a custom named view, so the match is not
// disturbed) looks at the soldier's body from 10, 30, 60, 100 and 150 units in 8 directions, at body height and 12 up.
// Same measure as rounds 1-2: body centre pixel vs the pixels just left and right of the body, CIE76, worst side.
// Each view is also tagged sun / shade (sun switched off and re-rendered). Silhouettes (hide-and-diff) are taken at 30
// units for living vs dead shape. Usage: node visual_r3_teams.cjs [seed]
const fs = require('fs'); const path = require('path');
const { open, dE, hex } = require('./visual_r3_lib.cjs');
const DIST = [10, 30, 60, 100, 150], SEED = +(process.argv[2] || 11);
const CAP = { dead: 16, crouch: 18, ride: 8, climb: 8, moving: 16, still: 10, bed: 10, desk: 10, shelf: 10, train: 8 };
const cls = (id) => !id ? 'none' : id === 'room.floor' ? 'floor' : /^room\.wall|^room\.ceil/.test(id) ? 'wall' : /^bed\.|^bear|^bucket/.test(id) ? 'bed' : /^desk\.|^chair\./.test(id) ? 'desk' : /train|car\./.test(id) ? 'train' : /fort/.test(id) ? 'fort' : /tall|small/.test(id) ? 'shelf' : /^ruin/.test(id) ? 'ruin' : /^bot|^player|soldier/.test(id) ? 'soldier' : 'cover';
(async () => {
  const t0 = Date.now();
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  await p.evaluate((seed) => { __game.startMatch({ difficulty: 'regular', seed, autoplay: true }); __game.setGodMode(true); __game.step(6); }, SEED);
  const got = {}; for (const k in CAP) got[k] = 0;
  const rows = [], sil = [], prev = {}; let simT = 0;
  for (let it = 0; it < 900 && Object.keys(CAP).some((k) => got[k] < CAP[k]); it++) {
    const st = await p.evaluate(() => { __game.step(0.5); const s = __game.state(); return { phase: s.match.phase, bots: s.bots.concat([{ id: 'player', team: 'green', pos: [s.player.x, s.player.y, s.player.z], dead: s.player.dead, crouching: s.player.crouching, riding: s.riding, climbing: s.player.climbing }]) }; });
    simT += 0.5;
    if (st.phase === 'matchEnd') { await p.evaluate((seed) => { __game.startMatch({ difficulty: 'regular', seed, autoplay: true }); __game.setGodMode(true); }, SEED + it); continue; }
    if (st.phase !== 'live') { for (const b of st.bots) prev[b.id] = b.pos; continue; }
    const pick = [];
    for (const b of st.bots) {
      const q = prev[b.id]; const moved = q ? Math.hypot(b.pos[0] - q[0], b.pos[2] - q[2]) : 0; prev[b.id] = b.pos;
      const cats = [];
      if (b.dead) cats.push('dead'); else {
        cats.push(b.crouching ? 'crouch' : moved > 0.6 ? 'moving' : 'still');
        if (b.riding) cats.push('ride', 'train'); if (b.climbing) cats.push('climb');
        if (b.pos[1] > 15 && b.pos[0] < 40) cats.push('bed'); if (b.pos[1] > 20 && b.pos[0] > 88) cats.push(b.pos[0] > 105 && (b.pos[2] < 45 || b.pos[2] > 115) ? 'shelf' : 'desk');
        if (b.pos[1] > 30) cats.push('shelf');
      }
      const want = cats.filter((c) => got[c] < CAP[c]);
      if (!want.length || (b.dead && it % 6)) continue;
      pick.push({ b, cats: [...new Set(cats)] });
    }
    for (const { b, cats } of pick.slice(0, 3)) {
      for (const c of cats) got[c]++;
      const r = await p.evaluate(([b, DIST]) => {
        const R = window.__r3, k = R.slotOf(b.pos); if (k < 0) return null;
        const body = R.part(k, 1), c = [body.x, body.y, body.z], out = [];
        const H = 720, fov = __game.CONFIG.camera.fovVertical, f = H / 2 / Math.tan(fov * Math.PI / 360);
        for (const d of DIST) for (let a = 0; a < (d >= 100 ? 16 : 8); a++) for (const lift of [0.85, 12]) {
          if (lift > 1 && d < 30) continue;
          const az = a * Math.PI / (d >= 100 ? 8 : 4) + 0.2, hd = Math.sqrt(Math.max(0, d * d - lift * lift));
          const e = [c[0] + Math.sin(az) * hd, c[1] + lift, c[2] + Math.cos(az) * hd];
          if (e[0] < 1 || e[0] > 119 || e[2] < 1 || e[2] > 159 || e[1] > 88 || e[1] < 0.3) continue;
          const dv = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], L = Math.hypot(...dv), rc = __game.raycast(e, dv);
          if (rc && rc.distance < L - 0.6 && !/^bot|^player/.test(rc.id)) continue;               // no line of sight to the body
          const back = __game.raycast([c[0] + dv[0] / L * 0.8, c[1] + dv[1] / L * 0.8, c[2] + dv[2] / L * 0.8], dv);
          R.cam(e, c); __game.render();
          const wpx = 0.5 * f / L, n = wpx >= 9 ? 5 : wpx >= 4 ? 3 : 1, off = Math.max(3, Math.round(wpx * 1.6 + 2));
          const px = R.rd(0, 0, n), l = R.rd(-off, 0, n), rr = R.rd(off, 0, n);
          for (let q = 0; q < R.np; q++) R.hide.add(k * R.np + q); __game.render(); const bg = R.rd(0, 0, n); R.hide.clear();
          let sun = null; if (d <= 60) { const I = R.sun.intensity; R.sun.intensity = 0; __game.render(); sun = R.rd(0, 0, n); R.sun.intensity = I; }
          out.push({ d, lift, e, body: px, bg, l, r: rr, sunOff: sun, behind: back ? back.id : null, wpx: +wpx.toFixed(1) });
        }
        // silhouette from one clear 30 unit eye-level view
        let s = null; const v30 = out.find((o) => o.d === 30 && o.lift < 1); if (v30) { R.cam(v30.e, c); s = R.silhouette(k); }
        __game.clearView();
        return { k, c, tipUp: body.upY, out, sil: s };
      }, [b, DIST]);
      if (!r) continue;
      if (r.sil) sil.push({ team: b.team, cats, ...r.sil, upY: +r.tipUp.toFixed(2) });
      for (const o of r.out) {
        const dl = dE(o.body, o.l), dr = dE(o.body, o.r);
        rows.push({ id: b.id, team: b.team, cats, d: o.d, lift: o.lift, e: o.e.map((v) => +v.toFixed(1)), c: r.c.map((v) => +v.toFixed(1)), body: hex(o.body), bgL: hex(o.l), bgR: hex(o.r), side: Math.min(dl, dr), dEmin: dE(o.body, o.bg), bgHidden: hex(o.bg), behind: cls(o.behind), sun: o.sunOff ? (dE(o.body, o.sunOff) > 8 ? 'sun' : 'shade') : 'n/a', wpx: o.wpx });
      }
    }
    if (it % 40 === 0) console.log('t', simT, 'got', JSON.stringify(got), 'views', rows.length, Math.round((Date.now() - t0) / 1000) + 's');
  }
  fs.writeFileSync(path.resolve(__dirname, 'visual_r3_teams_result.json'), JSON.stringify({ rows, sil }));
  // ---- report ----
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
  const under = (a) => a.length ? Math.round(100 * a.filter((v) => v < 15).length / a.length) + '%' : '-';
  const line = (label, f) => { const out = [label.padEnd(18)]; for (const d of DIST) { const m = rows.filter((x) => x.d === d && f(x)).map((x) => x.dEmin); out.push((d + ':').padStart(5) + (m.length ? (med(m) + '/' + pct(m, 0.1) + ' ' + under(m) + ' n' + m.length) : '-').padEnd(20)); } console.log(out.join('')); };
  console.log('\nviews', rows.length, 'samples by category', JSON.stringify(got), 'sim', simT, 's');
  console.log('cells: median / p10 dE of the body against the same pixel with that soldier hidden (what is behind it), share under 15, n');
  for (const team of ['green', 'tan']) { line(team + ' all', (x) => x.team === team); for (const c of ['moving', 'still', 'crouch', 'dead', 'ride', 'climb', 'bed', 'desk', 'shelf']) line(team + ' ' + c, (x) => x.team === team && x.cats.includes(c)); }
  console.log('\nside-pixel metric (rounds 1-2 method), all states except dead:'); for (const team of ['green', 'tan']) { const o = [team]; for (const d of DIST) { const m = rows.filter((x) => x.team === team && x.d === d && !x.cats.includes('dead')).map((x) => x.side); o.push(d + ':' + med(m) + ' ' + under(m)); } console.log(' ', o.join('  ')); }
  console.log('\nby background (all distances <=60 | >=100):');
  for (const team of ['green', 'tan']) for (const b of ['floor', 'wall', 'bed', 'desk', 'shelf', 'fort', 'cover', 'ruin', 'train', 'soldier', 'none']) {
    const n = rows.filter((x) => x.team === team && x.behind === b && x.d <= 60).map((x) => x.dEmin), f = rows.filter((x) => x.team === team && x.behind === b && x.d >= 100).map((x) => x.dEmin);
    if (n.length + f.length) console.log(' ', team.padEnd(6), b.padEnd(8), 'near', String(med(n)).padStart(5), under(n).padStart(4), 'n' + n.length, '| far', String(med(f)).padStart(5), under(f).padStart(4), 'n' + f.length);
  }
  console.log('\nsun vs shade (<=60):'); for (const team of ['green', 'tan']) for (const s of ['sun', 'shade']) { const m = rows.filter((x) => x.team === team && x.sun === s).map((x) => x.dEmin); console.log(' ', team, s, med(m), under(m), 'n' + m.length); }
  console.log('\nGreen vs Tan body colour (median colours) by distance and state:');
  for (const d of DIST) for (const c of ['all', 'dead']) { const sel = (t) => rows.filter((x) => x.team === t && x.d === d && (c === 'all' ? !x.cats.includes('dead') : x.cats.includes('dead'))).map((x) => x.body).sort(); const g = sel('green'), t = sel('tan');
    if (g.length && t.length) { const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)); const mc = (a) => [0, 1, 2].map((k) => med(a.map((s) => hx(s)[k]))); console.log(' ', d, c.padEnd(5), hex(mc(g)), 'vs', hex(mc(t)), 'dE', dE(mc(g), mc(t))); } }
  console.log('\nworst 12 views <=60 units:'); for (const x of rows.filter((x) => x.d <= 60).sort((a, b) => a.dEmin - b.dEmin).slice(0, 12)) console.log(' ', x.team, x.cats.join('+'), 'at', JSON.stringify(x.c), 'from', JSON.stringify(x.e), x.d + 'u', 'body', x.body, 'bg', x.bgL, x.bgR, 'dE', x.dEmin, x.behind, x.sun);
  console.log('\nsilhouettes at 30 units (px, w x h, h/w):');
  for (const c of ['still', 'moving', 'crouch', 'dead', 'ride']) { const s = sil.filter((x) => x.cats.includes(c) && x.px > 0); if (s.length) console.log(' ', c.padEnd(7), 'n' + s.length, 'px', med(s.map((x) => x.px)), 'w', med(s.map((x) => x.w)), 'h', med(s.map((x) => x.h)), 'h/w', med(s.map((x) => +(x.h / x.w).toFixed(2))), 'body up-axis y', med(s.map((x) => x.upY))); }
  console.log('errors', JSON.stringify(h.errors), Math.round((Date.now() - t0) / 1000) + 's');
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
