// Round 3: are crouched soldiers in cover still findable? Real autoplay matches; whenever a living bot is crouched inside
// or beside its fort (the slit walls) or next to the jumbo crayons, the camera looks at it from the enemy side, at eye
// height on the floor, 30 and 60 units out, inside a +-30 degree fan. Measured: visible pixels of the soldier (hide and
// diff), and the dE of its most-visible pixel against what is behind it.
const { open, dE, hex } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  const r = await p.evaluate(() => {
    const R = window.__r3, out = [], frames = []; let seed = 31, tries = 0;
    const zone = (b) => { const fortN = b.pos[2] < 32 && b.pos[0] > 42 && b.pos[0] < 78, fortS = b.pos[2] > 128 && b.pos[0] > 42 && b.pos[0] < 78;
      const crayon = b.pos[0] > 53 && b.pos[0] < 67 && ((b.pos[2] > 27 && b.pos[2] < 40) || (b.pos[2] > 120 && b.pos[2] < 133)); return crayon ? 'crayon' : fortN || fortS ? 'fort' : null; };
    __game.startMatch({ difficulty: 'regular', seed, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0);
    const seen = {};
    for (let i = 0; i < 60 * 60 * 12 && out.length < 40; i++) {
      __game.step(1 / 15); const s = __game.state(); if (s.match.phase === 'matchEnd') { __game.startMatch({ difficulty: 'regular', seed: ++seed, autoplay: true }); __game.setGodMode(true); continue; }
      if (s.match.phase !== 'live' || i % 3) continue;
      for (const b of s.bots) { if (b.dead || !b.crouching) continue; const z = zone(b); if (!z) continue; const key = b.id + Math.round(b.pos[0]) + Math.round(b.pos[2]); if (seen[key]) continue; seen[key] = 1;
        __game.render(); const k = R.slotOf(b.pos); if (k < 0) continue; const body = R.part(k, 1), head = R.part(k, 2);
        const toward = b.team === 'green' ? 1 : -1;      // the enemy is south of Green, north of Tan
        for (const d of [30, 60]) { let best = null;
          for (const a of [-30, -15, 0, 15, 30]) { const ang = a * Math.PI / 180, e = [body.x + Math.sin(ang) * d, 1.6, body.z + toward * Math.cos(ang) * d]; if (e[0] < 1 || e[0] > 119 || e[2] < 1 || e[2] > 159) continue;
            R.cam(e, [body.x, body.y + 0.2, body.z]); const sil = R.silhouette(k); let c = null;
            if (sil.px > 0) { // the body-colour pixel nearest the screen centre among changed pixels: sample head and body centres
              const pa = R.rd(0, 0, 1); for (let q = 0; q < R.np; q++) R.hide.add(k * R.np + q); __game.render(); const pb = R.rd(0, 0, 1); R.hide.clear(); __game.render(); c = { body: pa, bg: pb }; }
            if (!best || sil.px > best.px) best = { a, e, px: sil.px, w: sil.w, h: sil.h, c }; }
          if (best) { out.push({ team: b.team, zone: z, d, pos: b.pos.map((v) => +v.toFixed(1)), state: b.brainState, px: best.px, w: best.w, h: best.h, centre: best.c });
            if (frames.length < 6 && best.px > 0 && d === 30) { R.cam(best.e, [body.x, body.y + 0.2, body.z]); __game.render(); frames.push(R.copy()); } } }
        __game.clearView(); }
    }
    return { out, url: frames.length ? R.sheet(frames, [490, 260, 300, 200], 1, 3) : null };
  });
  if (r.url) h.save('visual_cover_crouched.png', r.url);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  for (const z of ['fort', 'crayon']) for (const d of [30, 60]) for (const t of ['green', 'tan']) { const s = r.out.filter((o) => o.zone === z && o.d === d && o.team === t); if (!s.length) continue;
    const vis = s.filter((o) => o.px > 0); const de = vis.filter((o) => o.centre).map((o) => dE(o.centre.body, o.centre.bg));
    console.log(z.padEnd(6), d + 'u', t.padEnd(5), 'samples', s.length, 'visible from the enemy side', vis.length, '| visible px median', med(vis.map((o) => o.px)), 'box', med(vis.map((o) => o.w)) + 'x' + med(vis.map((o) => o.h)), '| centre-pixel dE median', med(de)); }
  console.log('samples', JSON.stringify(r.out.slice(0, 6).map((o) => [o.team, o.zone, o.d, o.pos, o.px])));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
