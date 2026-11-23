// Round 3 re-check: (1) spectating several bots with different weapons: the watched bot's own instances hidden-and-
// diffed (0 px expected) and the viewmodel shown; (2) bodies against living crouched soldiers from real autoplay play
// at 10, 30, 60 and 100 units: rendered body colour, dE body vs crouched, silhouettes with the sun off (no shadows in
// the diff), and the gun's long axis on bodies (vertical component); (3) the climbing pose from the side and from
// below (nav test); (4) the east-lane toy box colour against cardboard and Tan.
const { open, dE, hex } = require('./visual_r3_lib.cjs');
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page;
  // ---------- (1) spectating ----------
  const sp = await p.evaluate(() => {
    const R = window.__r3, out = [], frames = [];
    __game.startMatch({ difficulty: 'regular', seed: 14 }); __game.setTimeScale(0); __game.step(7); __game.damagePlayer(500); __game.step(2.2);
    const seenW = {};
    for (let i = 0; i < 400 && out.length < 6; i++) {
      __game.render(); const s = __game.state(); if (s.match.phase !== 'live') break;
      const b = s.bots.find((o) => o.id === s.match.spectating); if (b && !seenW[b.id + b.weapon]) { seenW[b.id + b.weapon] = 1;
        const k = R.slotOf(b.pos); const A = R.full(); for (let q = 0; q < R.np; q++) R.hide.add(k * R.np + q); __game.render(); const B = R.full(); R.hide.clear(); __game.render();
        let n = 0; for (let j = 0; j < A.length; j += 4) if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 30) n++;
        const vm = window.__three.scenes.slice().sort((a, c) => a.children.length - c.children.length)[0]; const vis = vm.children.filter((c) => c.visible && c.isMesh).length;
        out.push({ name: b.name, weapon: b.weapon, crouching: b.crouching, ownModelPx: n, viewmodelMeshesVisible: vis, hudWeapon: document.getElementById('wname').textContent });
        if (frames.length < 4) frames.push(R.copy()); }
      if (i % 20 === 19) __game.spectateNext(); __game.step(0.25);
    }
    return { out, url: frames.length ? R.sheet(frames, [0, 0, 1280, 720], 0.4, 2) : null };
  });
  if (sp.url) h.save('visual_re_spectate.png', sp.url); console.log('spectate', JSON.stringify(sp.out));
  // ---------- (2) bodies vs crouched living ----------
  const bd = await p.evaluate(() => {
    const R = window.__r3, rows = [], frames = []; let guns = [];
    __game.startMatch({ difficulty: 'regular', seed: 23, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(6);
    const done = {}; let seed = 23;
    for (let i = 0; i < 60 * 15 * 40 && rows.length < 400; i++) {
      __game.step(1 / 15); const s = __game.state(); if (s.match.phase === 'matchEnd') { __game.startMatch({ difficulty: 'regular', seed: ++seed, autoplay: true }); __game.setGodMode(true); continue; }
      if (s.match.phase !== 'live' && s.match.phase !== 'roundEnd' || i % 6) continue;
      __game.render();
      for (const b of s.bots) { const cat = b.dead ? 'body' : b.crouching ? 'crouch' : null; if (!cat) continue; const key = b.id + cat + s.match.round; if (done[key]) continue; done[key] = 1;
        const k = R.slotOf(b.pos); if (k < 0) continue; const body = R.part(k, 1);
        if (cat === 'body') { const m = R.sold.matrix.clone(); R.sold.getMatrixAt(k * R.np + 3, m); const e = m.elements, L = Math.hypot(e[8], e[9], e[10]) || 1; guns.push(+(Math.abs(e[9]) / L).toFixed(2)); }
        const I = R.sun.intensity;
        for (const d of [10, 30, 60, 100]) for (let a = 0; a < 4; a++) {
          const az = a * Math.PI / 2 + 0.4, ev = [body.x + Math.sin(az) * d, Math.max(1.6, body.y + 0.9), body.z + Math.cos(az) * d]; if (ev[0] < 1 || ev[0] > 119 || ev[2] < 1 || ev[2] > 159) continue;
          const dv = [body.x - ev[0], body.y - ev[1], body.z - ev[2]], Ld = Math.hypot(...dv), rc = __game.raycast(ev, dv); if (rc && rc.distance < Ld - 0.6 && !/^bot|^player/.test(rc.id)) continue;
          R.cam(ev, [body.x, body.y, body.z]); __game.render(); const px = R.rd(0, 0, d <= 30 ? 3 : 1); for (let q = 0; q < R.np; q++) R.hide.add(k * R.np + q); __game.render(); const bg = R.rd(0, 0, d <= 30 ? 3 : 1); R.hide.clear();
          R.sun.intensity = 0; const sil = d === 30 ? R.silhouette(k) : null; R.sun.intensity = I;
          rows.push({ team: b.team, cat, d, px, bg, sil });
          if (d === 10 && cat === 'body' && frames.length < 3 && a === 0) { __game.render(); frames.push(R.copy()); }
          if (d === 10 && cat === 'crouch' && frames.length >= 3 && frames.length < 6 && a === 0) { __game.render(); frames.push(R.copy()); }
        }
        __game.clearView(); }
    }
    return { rows, guns, url: frames.length ? R.sheet(frames, [390, 160, 500, 400], 0.6, 3) : null };
  });
  if (bd.url) h.save('visual_re_bodies.png', bd.url);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const mc = (a) => [0, 1, 2].map((k) => med(a.map((c) => c[k])));
  console.log('body gun |vertical component| of the long axis (0 = flat, 1 = upright): n', bd.guns.length, 'median', med(bd.guns), 'max', Math.max(...bd.guns));
  for (const t of ['green', 'tan']) for (const d of [10, 30, 60, 100]) {
    const B = bd.rows.filter((r) => r.team === t && r.d === d && r.cat === 'body'), C = bd.rows.filter((r) => r.team === t && r.d === d && r.cat === 'crouch'); if (!B.length || !C.length) continue;
    const cb = mc(B.map((r) => r.px)), cc = mc(C.map((r) => r.px));
    console.log(t.padEnd(5), d + 'u', 'body', hex(cb), 'n' + B.length, '| crouched', hex(cc), 'n' + C.length, '| body vs crouched dE', dE(cb, cc), '| body vs behind median', med(B.map((r) => dE(r.px, r.bg))), '| crouched vs behind', med(C.map((r) => dE(r.px, r.bg))));
  }
  for (const c of ['body', 'crouch']) { const S = bd.rows.filter((r) => r.cat === c && r.sil && r.sil.px > 0).map((r) => r.sil); console.log('silhouette at 30u, sun off,', c, 'n', S.length, 'w', med(S.map((s) => s.w)), 'h', med(S.map((s) => s.h)), 'h/w', med(S.map((s) => +(s.h / s.w).toFixed(2)))); }
  // ---------- (3) climbing pose from the side and from below ----------
  const cl = await p.evaluate(() => {
    const R = window.__r3, frames = []; __game.startNavTest({ bots: 10, seed: 4 }); let got = 0, id = null, info = null;
    for (let i = 0; i < 60 * 180 && got < 4; i++) { __game.step(1 / 60); if (i % 10) continue; const s = __game.state(); const b = s.bots.find((o) => o.climbing && (!id || o.id === id)); if (!b) continue; if (b.pos[1] < 3) continue; id = b.id;
      __game.render(); const k = R.slotOf(b.pos); const arms = k >= 0 ? R.part(k, 4) : null, body = k >= 0 ? R.part(k, 1) : null; info = { pos: b.pos.map((v) => +v.toFixed(1)), armsY: arms && +arms.y.toFixed(2), bodyY: body && +body.y.toFixed(2), armsScale: arms && +arms.sy.toFixed(2), bodyUpY: body && body.upY.toFixed(2) };
      const side = got % 2 === 0; R.cam(side ? [b.pos[0] - 3.5, b.pos[1] + 0.9, b.pos[2] + 0.5] : [b.pos[0] - 1.5, Math.max(0.5, b.pos[1] - 4), b.pos[2] + 0.4], [b.pos[0], b.pos[1] + 0.9, b.pos[2]]); __game.render(); frames.push(R.copy()); __game.clearView(); got++; }
    __game.stopNavTest(); __game.removeBots(); return { info, url: frames.length ? R.sheet(frames, [390, 160, 500, 400], 0.6, 4) : null }; });
  if (cl.url) h.save('visual_re_climb.png', cl.url); console.log('climb', JSON.stringify(cl.info));
  // ---------- (4) toy box ----------
  const tb = await p.evaluate(() => { const R = window.__r3, c = __game.colliders.find((o) => /toybox/.test(o.id)); __game.start({ pointerLock: false }); __game.setTimeScale(0);
    const out = { collider: c && [c.id, c.x0, c.x1, c.z0, c.z1, c.y0, c.y1, c.surface] }; const faces = [];
    for (const [e, t] of [[[83.2, 1.6, 66], [83.2, 1.2, 78.5]], [[70, 1.6, 80], [81.4, 1.2, 80]], [[83.2, 6, 72], [83.2, 2.5, 80]]]) { R.cam(e, t); __game.render(); faces.push(R.rd(0, 0, 5)); }
    R.cam([78, 3, 66], [83.2, 1.2, 80]); __game.render(); out.url = R.sheet([R.copy()], [240, 110, 800, 500], 0.6); __game.clearView(); out.faces = faces; return out; });
  h.save('visual_re_toybox.png', tb.url); delete tb.url;
  const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  console.log('toybox', JSON.stringify(tb.collider), 'faces (north, west, top)', tb.faces.map(hex).join(' '), '| vs cardboard #8F6B47 dE', tb.faces.map((f) => dE(f, hx('#8F6B47'))).join(' / '), '| vs rendered Tan body #C5924A dE', tb.faces.map((f) => dE(f, hx('#C5924A'))).join(' / '), '| flat cardboard vs Tan', dE(hx('#8F6B47'), hx('#D9A75A')));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
