// Round 4 (full) checks on the 4B snapshot (snapshots/index_r4b.html), one section per run so a failure does not cost
// the rest: node visual_r4b_check.cjs <section>
//   teams     Green / Tan against what is behind them at 5, 20, 60 units in real autoplay play (living, kneeling, bodies):
//             body pixel vs the same pixel with every soldier mesh hidden. Plus the yellow letter blocks behind soldiers.
//   poses     close frames of a still soldier (base), a moving one (hop), kneeling, climbing, scoped sniper, a body.
//   hitfit    soldier art against the hit volumes (body 0.8 x 1.3 x 0.5 and head 0.45 cube) for standing soldiers.
//   guns      viewmodels idle and firing, scoped sniper, coverage and screen-edge cut, world-model guns in hand.
//   decals    marks per surface (after particles die) and the grenade scorch; pool cap after 300 shots.
//   train     the consist from the floor and close, art against train colliders (rays), z-fighting on the track.
// Screenshots go to screenshots/round4/visual_4_*.png. Software renderer: no timings here.
const fs = require('fs'); const path = require('path');
process.env.VIS_FILE = process.env.VIS_FILE || path.resolve(__dirname, '..', 'snapshots', 'index_r4b.html');
process.env.SHOTDIR = process.env.SHOTDIR || 'round4';
const { open, dE, hex } = require('./visual_r3_lib.cjs');
const SHOTS = path.resolve(__dirname, '..', 'screenshots', 'round4');
const save = (file, url) => { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.resolve(SHOTS, file), Buffer.from(url.split(',')[1], 'base64')); };
const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
const under = (a, t = 15) => a.length ? Math.round(100 * a.filter((v) => v < t).length / a.length) + '%' : '-';
const SEC = process.argv[2];
async function prep(p) {
  await p.evaluate(() => { const R = window.__r3, S = window.__three.scenes[0];
    R.soldiers = []; S.traverse((o) => { if (o.name && /^soldier\./.test(o.name)) R.soldiers.push(o); });
    // the game sets each soldier mesh's visible and count every frame, so hiding goes through a property wrapper
    R.hiding = false; for (const m of R.soldiers) { let v = m.visible; Object.defineProperty(m, 'visible', { get() { return R.hiding ? false : v; }, set(x) { v = x; }, configurable: true }); }
    R.hideSoldiers = (on) => { R.hiding = on; };
    R.vmScene = () => window.__three.scenes.slice().sort((a, b) => a.children.length - b.children.length)[0]; });
}
(async () => {
  const h = await open({ width: 1280, height: 720 }); const p = h.page; await prep(p);
  if (SEC === 'teams') {
    const rows = await p.evaluate(() => { const R = window.__r3, rows = []; let seed = 41;
      __game.startMatch({ difficulty: 'regular', seed, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(6);
      const done = {}; const cls = (id) => !id ? 'none' : id === 'room.floor' ? 'floor' : /^room\./.test(id) ? 'wall' : /^bed\./.test(id) ? 'bed' : /^desk\.|^chair\./.test(id) ? 'desk' : /fort/.test(id) ? 'fort' : /tall|small/.test(id) ? 'shelf' : /^ruin/.test(id) ? 'ruin' : /block/i.test(id) ? 'block' : /train/.test(id) ? 'train' : 'cover';
      for (let it = 0; it < 1600 && rows.length < 1400; it++) {
        __game.step(0.5); const s = __game.state(); if (s.match.phase === 'matchEnd') { __game.startMatch({ difficulty: 'regular', seed: ++seed, autoplay: true }); __game.setGodMode(true); continue; } if (s.match.phase !== 'live') continue;
        let taken = 0;
        for (const b of s.bots) { if (taken >= 2) break; const cat = b.dead ? 'body' : b.crouching ? 'kneel' : 'living'; const key = b.id + cat + Math.round(b.pos[0] / 8) + Math.round(b.pos[2] / 8); if (done[key]) continue; done[key] = 1; taken++;
          const c = [b.pos[0], b.pos[1] + (b.dead ? 0.25 : b.crouching ? 0.55 : 0.8), b.pos[2]];
          for (const d of [5, 20, 60]) for (let a = 0; a < 8; a++) for (const lift of [0.9, 10]) { if (lift > 1 && d < 20) continue;
            const az = a * Math.PI / 4 + 0.3, hd = Math.sqrt(Math.max(0, d * d - lift * lift)), e = [c[0] + Math.sin(az) * hd, c[1] + lift, c[2] + Math.cos(az) * hd]; if (e[0] < 1 || e[0] > 119 || e[2] < 1 || e[2] > 159 || e[1] > 88) continue;
            const dv = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], L = Math.hypot(...dv), rc = __game.raycast(e, dv); if (rc && rc.distance < L - 0.6 && !/^bot|^player/.test(rc.id)) continue;
            const back = __game.raycast([c[0] + dv[0] / L * 0.8, c[1] + dv[1] / L * 0.8, c[2] + dv[2] / L * 0.8], dv);
            R.cam(e, c); __game.render(); const n = d <= 5 ? 5 : d <= 20 ? 3 : 1, px = R.rd(0, 0, n); R.hideSoldiers(true); __game.render(); const bg = R.rd(0, 0, n); R.hideSoldiers(false);
            rows.push({ team: b.team, cat, d, lift, px, bg, behind: cls(back ? back.id : null), behindId: back ? back.id : null, c: c.map((v) => +v.toFixed(1)), e: e.map((v) => +v.toFixed(1)) }); }
          __game.clearView(); } }
      return rows; });
    fs.writeFileSync(path.resolve(__dirname, 'visual_r4_teams_result.json'), JSON.stringify(rows));
    const ok = rows.filter((r) => dE(r.px, r.bg) >= 3).map((r) => Object.assign(r, { de: dE(r.px, r.bg) }));
    console.log('views', rows.length, 'kept', ok.length, '(dropped: centre pixel not on the soldier)');
    for (const t of ['green', 'tan']) for (const c of ['living', 'kneel', 'body']) { const o = [t.padEnd(5), c.padEnd(6)]; for (const d of [5, 20, 60]) { const m = ok.filter((r) => r.team === t && r.cat === c && r.d === d).map((r) => r.de); o.push(d + 'u ' + (m.length ? med(m) + ' p10 ' + pct(m, 0.1) + ' <15 ' + under(m) + ' n' + m.length : '-')); } console.log(o.join(' | ')); }
    for (const t of ['green', 'tan']) { const B = {}; for (const r of ok.filter((r) => r.team === t && r.cat !== 'body')) (B[r.behind] = B[r.behind] || []).push(r.de); console.log(t, 'by background:', Object.entries(B).sort((a, b) => med(a[1]) - med(b[1])).map(([k, v]) => k + ' ' + med(v) + ' (p10 ' + pct(v, 0.1) + ', n' + v.length + ')').join(' | ')); }
    const mc = (a) => [0, 1, 2].map((k) => med(a.map((c) => c[k])));
    for (const d of [5, 20, 60]) { const g = ok.filter((r) => r.team === 'green' && r.cat !== 'body' && r.d === d).map((r) => r.px), t = ok.filter((r) => r.team === 'tan' && r.cat !== 'body' && r.d === d).map((r) => r.px), gb = ok.filter((r) => r.team === 'green' && r.cat === 'body' && r.d === d).map((r) => r.px), tb = ok.filter((r) => r.team === 'tan' && r.cat === 'body' && r.d === d).map((r) => r.px), tk = ok.filter((r) => r.team === 'tan' && r.cat === 'kneel' && r.d === d).map((r) => r.px), gk = ok.filter((r) => r.team === 'green' && r.cat === 'kneel' && r.d === d).map((r) => r.px);
      if (g.length && t.length) console.log(d + 'u Green', hex(mc(g)), 'Tan', hex(mc(t)), 'dE', dE(mc(g), mc(t)), gb.length > 2 && gk.length ? '| Green body ' + hex(mc(gb)) + ' vs kneeling dE ' + dE(mc(gb), mc(gk)) : '', tb.length > 2 && tk.length ? '| Tan body ' + hex(mc(tb)) + ' vs kneeling dE ' + dE(mc(tb), mc(tk)) : ''); }
    for (const r of ok.filter((r) => r.team === 'tan' && r.cat !== 'body').sort((a, b) => a.de - b.de).slice(0, 6)) console.log(' tan worst', r.cat, r.d + 'u', 'at', JSON.stringify(r.c), 'from', JSON.stringify(r.e), hex(r.px), 'on', hex(r.bg), 'dE', r.de, r.behindId);
    // yellow letter blocks: rendered face colours of block colliders, and dE to rendered soldier colours
    const blocks = await p.evaluate(() => { const R = window.__r3, out = []; __game.clearView(); for (const c of __game.colliders.filter((o) => /^(n|s|m)\./.test(o.id) && o.x1 !== undefined && o.y1 - o.y0 < 6 && o.y0 < 0.5)) { const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, cy = (c.y0 + c.y1) / 2; const e = [c.x1 + 4, cy + 0.5, cz + 1]; const rc = __game.raycast(e, [cx - e[0], cy - e[1], cz - e[2]]); if (!rc || rc.id !== c.id) continue; R.cam(e, [c.x1, cy, cz]); __game.render(); out.push({ id: c.id, px: R.rd(0, 0, 5), pos: [cx, cy, cz] }); } __game.clearView(); return out; });
    const tanCol = mc(ok.filter((r) => r.team === 'tan' && r.cat !== 'body' && r.d <= 20).map((r) => r.px)), grnCol = mc(ok.filter((r) => r.team === 'green' && r.cat !== 'body' && r.d <= 20).map((r) => r.px));
    const yb = blocks.filter((b) => b.px[0] > 150 && b.px[1] > 110 && b.px[2] < 120).map((b) => Object.assign(b, { dTan: dE(b.px, tanCol), dGreen: dE(b.px, grnCol) })).sort((a, b) => a.dTan - b.dTan);
    console.log('floor-standing cover pieces measured', blocks.length, '| yellow or orange ones', yb.length, '| closest to rendered Tan', hex(tanCol) + ':', yb.slice(0, 5).map((b) => b.id + ' ' + hex(b.px) + ' dE ' + b.dTan).join(' | '));
    const yt = yb[0]; if (yt) { const url = await p.evaluate(([pos]) => { const R = window.__r3; const id = __game.spawnBot('tan', Object.entries(__game.waypoints.nodes).filter(([k, v]) => v[1] < 0.5).sort((a, b) => Math.hypot(a[1][0] - pos[0], a[1][2] - pos[2]) - Math.hypot(b[1][0] - pos[0], b[1][2] - pos[2]))[0][0]); __game.step(0.1); const s = __game.state().bots.find((b) => b.id === id); const F = [];
      for (const d of [5, 20]) { const dx = s.pos[0] - pos[0], dz = s.pos[2] - pos[2], L = Math.hypot(dx, dz) || 1; R.cam([s.pos[0] + dx / L * d, 1.6, s.pos[2] + dz / L * d], [s.pos[0], 0.8, s.pos[2]]); __game.render(); F.push(R.copy()); } __game.clearView(); __game.removeBots(); return R.sheet(F, [390, 160, 500, 400], 0.6, 2); }, [yt.pos]); save('visual_4_tan_vs_block.png', url); }
  }
  if (SEC === 'poses') {
    const url = await p.evaluate(() => { const R = window.__r3, F = {}; const got = {};
      const grab = (k, b, side, up) => { if (got[k]) return; got[k] = 1; const yaw = b.yaw || 0; R.cam([b.pos[0] + Math.sin(yaw + side) * 3.2, b.pos[1] + up, b.pos[2] + Math.cos(yaw + side) * 3.2], [b.pos[0], b.pos[1] + 0.8, b.pos[2]]); __game.render(); F[k] = R.copy(); __game.clearView(); };
      __game.startMatch({ difficulty: 'regular', seed: 51, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(5.2);
      const prev = {};
      for (let i = 0; i < 60 * 300 && Object.keys(got).length < 7; i++) { __game.step(1 / 30); if (i % 3) continue; const s = __game.state(); if (s.match.phase === 'matchEnd') { __game.startMatch({ difficulty: 'regular', seed: 52 + i, autoplay: true }); __game.setGodMode(true); continue; }
        for (const b of s.bots) { const q = prev[b.id]; prev[b.id] = b.pos; const moving = q && Math.hypot(b.pos[0] - q[0], b.pos[2] - q[2]) > 0.25;
          if (s.match.phase === 'freeze') grab('still (freeze)', b, 1.2, 0.6);
          else if (b.dead) grab('body', b, 0.9, 1.2); else if (b.climbing) grab('climb', b, 1.57, 0.3); else if (b.crouching) grab('kneel', b, 1.3, 0.5); else if (b.weapon === 'sniper' && b.brainState === 'engage' && !moving) grab('sniper engage', b, 1.3, 0.5); else if (moving && b.team === 'tan') grab('moving tan', b, 1.4, 0.5); else if (moving) grab('moving green', b, 1.4, 0.5); } }
      const keys = ['still (freeze)', 'moving green', 'moving tan', 'kneel', 'climb', 'sniper engage', 'body'].filter((k) => F[k]);
      return { keys, url: R.sheet(keys.map((k) => F[k]), [440, 160, 400, 440], 0.7, 4) }; });
    save('visual_4_poses.png', url.url); console.log('poses sheet order:', url.keys.join(', '));
    // hop and base: a moving bot's feet height over the ground and whether base instances are drawn, every tick for 2 s
    const hop = await p.evaluate(() => { const S = window.__three.scenes[0]; const base = S.getObjectByName('soldier.base'); const out = []; __game.startMatch({ difficulty: 'regular', seed: 53, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(5.2);
      const base0 = []; __game.render(); base0.push(base.count); for (let i = 0; i < 60; i++) { __game.step(1 / 60); __game.render(); out.push(base.count); }
      return { baseCountFreezeEnd: base0[0], baseCountWhileRunning: [Math.min(...out), Math.max(...out)] }; });
    console.log('base instances drawn: at the end of freeze (all still)', hop.baseCountFreezeEnd, '| first second of live play (all running)', JSON.stringify(hop.baseCountWhileRunning));
  }
  if (SEC === 'hitfit') {
    let r = await p.evaluate(async () => { const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'); const R = window.__r3, S = window.__three.scenes[0];
      __game.startMatch({ difficulty: 'regular', seed: 61, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0); __game.step(1.5); __game.render(); S.updateMatrixWorld(true);
      const K = __game.CONFIG.soldier, rc = new THREE.Raycaster(), meshes = R.soldiers.filter((m) => m.visible && m.count > 0), out = []; meshes.forEach((m) => { m.boundingSphere = null; m.computeBoundingSphere(); });      // instanced bounds go stale as the count changes
      window.__hitMeshes = meshes.map((m) => m.name + ':' + m.count);
      for (const b of __game.state().bots) {     // freeze time: everyone standing still at spawn
        const yaw = b.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (const [name, y, half] of [['body low', 0.4, [0.4, 0.25]], ['body high', 1.1, [0.4, 0.25]], ['head', 1.58, [0.225, 0.225]]])
          for (const [dir, hw] of [['front', 1], ['back', -1], ['right', 2], ['left', -2]]) {
            const side = Math.abs(hw) === 1 ? [fx * Math.sign(hw), fz * Math.sign(hw)] : [rx * Math.sign(hw), rz * Math.sign(hw)], ext = Math.abs(hw) === 1 ? half[1] : half[0];
            const o = new THREE.Vector3(b.pos[0] + side[0] * 3, b.pos[1] + y, b.pos[2] + side[1] * 3), d = new THREE.Vector3(-side[0], 0, -side[1]); rc.set(o, d); rc.far = 6;
            const hits = rc.intersectObjects(meshes, false).filter((h) => h.distance < 3.4); const art = hits.length ? hits[0].distance : null;
            out.push({ name: b.name, part: name, dir, gap: art === null ? null : +((3 - ext) - art).toFixed(2) });      // positive: art sticks out past the hit box
          } }
      return { out, meshes: window.__hitMeshes }; });
    console.log('soldier meshes raycast', JSON.stringify(r.meshes)); r = r.out;
    for (const part of ['body low', 'body high', 'head']) for (const dir of ['front', 'back', 'right', 'left']) { const a = r.filter((x) => x.part === part && x.dir === dir); const g = a.filter((x) => x.gap !== null).map((x) => x.gap);
      console.log(part.padEnd(9), dir.padEnd(5), 'art past the hit volume (+) / inside it (-): median', med(g), 'range', g.length ? Math.min(...g) + '..' + Math.max(...g) : '-', '| no art on that line', a.length - g.length, 'of', a.length); }
  }
  if (SEC === 'guns') {
    const r = await p.evaluate(() => { const R = window.__r3, vm = R.vmScene(), out = [], F = [];
      __game.start({ pointerLock: false }); __game.setTimeScale(0);
      for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { __game.clearView(); __game.give('ammo'); __game.selectWeapon(w); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1.5); __game.look(Math.PI, 0); __game.render(); const A = R.full(); F.push(R.copy());
        const st = __game.state().player; R.cam([st.x, st.y + 1.6, st.z], [st.x - Math.sin(Math.PI) * 10, st.y + 1.6, st.z - Math.cos(Math.PI) * 10]); __game.render(); const B = R.full(); __game.clearView(); __game.render();      // a named view draws no viewmodel
        let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, bottom = 0, right = 0; for (let i = 0; i < 1280 * 720; i++) { const j = i * 4; if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 20) { n++; const x = i % 1280, y = 719 - ((i / 1280) | 0); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (y === 719) bottom++; if (x === 1279) right++; } }
        __game.fire(); __game.render(); F.push(R.copy()); __game.step(1);
        out.push({ w, coverPct: +(100 * n / (1280 * 720)).toFixed(1), box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], topY: y0, bottomEdgePx: bottom, rightEdgePx: right }); }
      __game.selectWeapon('sniper'); __game.step(1); __game.setInput({ scope: true }); __game.step(0.5); __game.lookAt(60, 1.6, 80); __game.render(); const scoped = R.copy(); __game.clearInput(); __game.step(0.5);
      // near-plane check: any viewmodel vertex closer than 0.05 to the viewmodel camera
      let nearest = 9; vm.traverse((o) => { if (o.isMesh && o.geometry && o.visible) { const g = o.geometry.attributes.position, v = R.sun.position.clone(); o.updateMatrixWorld(true); for (let i = 0; i < g.count; i += 3) { v.fromBufferAttribute(g, i).applyMatrix4(o.matrixWorld); nearest = Math.min(nearest, -v.z); } } });
      return { out, nearest: +nearest.toFixed(3), url: R.sheet(F, [560, 240, 720, 480], 0.45, 4), scoped: R.sheet([scoped], [0, 0, 1280, 720], 0.6) }; });
    save('visual_4_viewmodels.png', r.url); save('visual_4_scoped.png', r.scoped);
    for (const o of r.out) console.log('viewmodel', o.w.padEnd(6), 'covers', o.coverPct + '%', 'box x,y,w,h', JSON.stringify(o.box), 'top at y', o.topY, '| px on the bottom edge', o.bottomEdgePx, 'right edge', o.rightEdgePx);
    console.log('sheet: idle / firing for rifle, smg, sniper, pistol (pairs); nearest viewmodel vertex in front of the viewmodel camera (last gun drawn):', r.nearest);
  }
  if (SEC === 'decals') {
    const SURF = { wood_floor: [[90, 0, 20], [90, 0, 23.6]], fabric_bed: [[39.5, 0, 90], [35, 7, 90]], plastic_fort: [[55, 0, 20.5], [55, 0.6, 24.5]], book: [[34, 0, 130], [30, 2, 130]], card_tunnel: [[69.6, 0, 90.5], [72.6, 1.6, 90.5]], metal_mug: [[110, 26.4, 74], [112.2, 28, 74]] };
    const r = await p.evaluate((SURF) => { const R = window.__r3, out = [], F = []; __game.start({ pointerLock: false }); __game.setTimeScale(0);
      for (const [name, [e, a]] of Object.entries(SURF)) { __game.clearView(); __game.give('ammo'); __game.selectWeapon('pistol'); __game.teleport(e[0], e[1], e[2], 0, 0); __game.step(1.2); __game.teleport(e[0], e[1], e[2], 0, 0); __game.lookAt(a[0], a[1], a[2]);
        const s = __game.state().player, hit = __game.raycast([s.x, s.y + 1.6, s.z], [a[0] - s.x, a[1] - s.y - 1.6, a[2] - s.z]); if (!hit) { out.push({ name, hit: null }); continue; }
        const ey = [s.x, s.y + 1.6, s.z], v = [hit.point[0] - ey[0], hit.point[1] - ey[1], hit.point[2] - ey[2]], L = Math.hypot(...v), cam = [hit.point[0] - v[0] / L * 3, hit.point[1] - v[1] / L * 3, hit.point[2] - v[2] / L * 3];
        R.cam(cam, hit.point); __game.render(); const pre = R.rd(0, 0, 3); __game.clearView(); __game.fire(); __game.step(1.5); R.cam(cam, hit.point); __game.render(); const post = R.rd(0, 0, 3); F.push(R.copy()); __game.clearView();
        out.push({ name, hit: hit.id, surface: hit.surface, before: pre, after: post }); }
      // grenade scorch on the floor
      __game.give('grenade'); __game.teleport(60, 0, 56, 0, 0); __game.step(0.4); __game.look(0, -0.3); __game.throwGrenade(0.1); __game.step(3); __game.render();
      const sc = __game.state(); let gpos = null; const ds = window.__three.scenes[0].getObjectByName('fx.decals'); const m = R.sun.matrix.clone(); const live = []; for (let i = 0; i < ds.count; i++) { ds.getMatrixAt(i, m); if (m.elements[13] > -40) live.push(i); }
      // pool cap: 300 shots at the wall
      __game.selectWeapon('pistol'); __game.teleport(80, 0, 6, 0, 0); __game.step(1); for (let i = 0; i < 300; i++) { __game.give('ammo'); __game.lookAt(74 + (i % 12), 0.8 + ((i / 12) | 0) * 0.3, 0); __game.fire(); __game.step(0.2); }
      let liveAfter = 0; for (let i = 0; i < ds.count; i++) { ds.getMatrixAt(i, m); if (m.elements[13] > -40) liveAfter++; }
      return { out, poolSize: ds.count, liveAfterGrenade: live.length, liveAfter300: liveAfter, url: R.sheet(F, [490, 260, 300, 200], 1, 3) }; }, SURF);
    save('visual_4_decals.png', r.url);
    for (const o of r.out) console.log('decal', o.name.padEnd(13), 'hit', o.hit, o.surface, o.before ? hex(o.before) + ' -> ' + hex(o.after) + ' dE ' + dE(o.before, o.after) : '');
    console.log('decal pool instances', r.poolSize, '| live after one grenade', r.liveAfterGrenade, '| live after 300 more wall shots', r.liveAfter300);
    // scorch close-up
    const sc = await p.evaluate(() => { const R = window.__r3; __game.give('grenade'); __game.teleport(60, 0, 56, 0, 0); __game.step(0.4); __game.look(0, -0.3); __game.throwGrenade(0.1); let k = 0; while (__game.grenades.length && k++ < 400) __game.step(1 / 60); __game.step(1);
      const s = __game.state().player; R.cam([s.x, 4, s.z - 3], [s.x, 0, s.z - 9]); __game.render(); const u = R.sheet([R.copy()], [240, 110, 800, 500], 0.6); __game.clearView(); return u; });
    save('visual_4_scorch.png', sc);
  }
  if (SEC === 'train') {
    const r = await p.evaluate(async () => { const R = window.__r3, F = []; __game.start({ pointerLock: false }); __game.setTimeScale(0);
      // engine on the west straight
      let k = 0; while (k++ < 4000) { const T = __game.state().train; const d = ((57.5 - T.s) % T.length + T.length) % T.length; if (d < 0.05) break; __game.step(Math.min(10, Math.max(1 / 60, d / 4))); }
      const cars = __game.state().train.cars; for (const c of cars) { R.cam([c.pos[0] + 9, 3, c.pos[2] - 4], [c.pos[0], 2.2, c.pos[2]]); __game.render(); F.push(R.copy()); }
      R.cam([20, 1.6, 64], [43, 2.5, 82]); __game.render(); F.push(R.copy());
      // track z-fighting: jitter on the track close-up
      const e = [48, 1.2, 60], t = [43, 0.1, 66]; R.cam(e, t); __game.render(); const A = R.full(); R.cam([e[0] + 0.004, e[1] + 0.003, e[2] + 0.004], t); __game.render(); const B = R.full(); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 48) n++;
      R.cam(e, t); __game.render(); F.push(R.copy());
      // art vs train colliders: rays from 3 units out onto each car side and top centre, colliders vs rendered train meshes
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'); const S = window.__three.scenes[0]; S.updateMatrixWorld(true);
      const tm = []; S.traverse((o) => { if (o.isMesh && /train/i.test(o.name || '') && o.visible) tm.push(o); }); const rc = new THREE.Raycaster(), fit = [];
      for (const c of cars) for (const [nm, o, d] of [['top', [c.pos[0], 9, c.pos[2]], [0, -1, 0]], ['east side', [c.pos[0] + 4, 2.5, c.pos[2]], [-1, 0, 0]], ['west side', [c.pos[0] - 4, 2.5, c.pos[2]], [1, 0, 0]]]) {
        const kk = __game.raycast(o, d); rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d)); rc.far = 12; const hh = rc.intersectObjects(tm, false); fit.push({ car: c.type, face: nm, collider: kk ? kk.id : null, colD: kk ? +kk.distance.toFixed(2) : null, artD: hh.length ? +hh[0].distance.toFixed(2) : null }); }
      __game.clearView(); return { jitter: n, fit, meshes: tm.length, names: tm.map((m) => m.name), url: R.sheet(F, [0, 0, 1280, 720], 0.33, 4) }; });
    save('visual_4_train.png', r.url);
    console.log('train meshes', r.meshes, JSON.stringify(r.names), '| track jitter px', r.jitter);
    for (const f of r.fit) console.log(' fit', f.car.padEnd(8), f.face.padEnd(9), 'collider', String(f.collider).padEnd(24), f.colD, 'art', f.artD, f.colD !== null && f.artD !== null ? 'gap ' + (f.artD - f.colD).toFixed(2) : '');
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
