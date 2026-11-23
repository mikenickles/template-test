// Round 4 check 4: instanced soldiers, bodies, decals and the viewmodel, checked on rendered pixels.
//  A. soldiers: project each soldier's chest into the frame and read the pixel there: team colour when standing, greyer and
//     lower after death (tipped), team colour again at the next round start; after removeBots and after a whole runMatch,
//     a frame of the same view must match the empty-room frame (no ghost parts left).
//  B. decals: 3,000 shots on wood, fabric, plastic, book and card plus 40 grenade scorches; the decal ring index stays
//     under its pool size and geometries/textures do not grow.
//  C. viewmodel: one frame per weapon, while reloading, scoped, dead and spectating; the lower-right region must differ
//     between weapons and the scoped frame must hide it.
// Frames go to <outdir> for viewing. Usage: node bug_r4_05_soldiers_vm.cjs <outdir> [build]. Loops are tick-limited.
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');
const OUT = path.resolve(process.argv[2]);
const FILE = path.resolve(process.argv[3] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const W = 640, H = 360;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await launch({ width: W, height: H, file: FILE });
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (name) => { const b = await page.screenshot({ path: path.join(OUT, name + '.png') }); return name; };
  // pixel read via a tiny clip screenshot of the canvas, averaged in node (PNG decode with zlib)
  const zlib = require('zlib');
  const pngPixels = (buf) => { // minimal PNG decoder for 8-bit RGB/RGBA, no interlace
    let p = 8, w, h, ct, idat = []; while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
    const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, stride = w * bpp, out = Buffer.alloc(w * h * bpp); let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = line[x];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } cur[x] = v & 255; }
      cur.copy(out, y * stride); prev = cur; }
    return { w, h, bpp, data: out };
  };
  const pixel = async (x, y) => { x = Math.max(2, Math.min(W - 3, Math.round(x))); y = Math.max(2, Math.min(H - 3, Math.round(y))); const img = pngPixels(await page.screenshot({ clip: { x: x - 2, y: y - 2, width: 5, height: 5 } })); let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < img.w * img.h; i++) { r += img.data[i * img.bpp]; g += img.data[i * img.bpp + 1]; b += img.data[i * img.bpp + 2]; n++; } return [r / n, g / n, b / n].map(Math.round); };
  const frameDiff = async (a, bName) => { const A = pngPixels(fs.readFileSync(path.join(OUT, a + '.png'))), B = pngPixels(fs.readFileSync(path.join(OUT, bName + '.png'))); let n = 0; for (let i = 0; i < A.w * A.h; i++) { const d = (Math.abs(A.data[i * A.bpp] - B.data[i * B.bpp]) + Math.abs(A.data[i * A.bpp + 1] - B.data[i * B.bpp + 1]) + Math.abs(A.data[i * A.bpp + 2] - B.data[i * B.bpp + 2])) / 3; if (d > 40) n++; } return n; };
  const regionDiff = async (a, bName, x0, y0, x1, y1) => { const A = pngPixels(fs.readFileSync(path.join(OUT, a + '.png'))), B = pngPixels(fs.readFileSync(path.join(OUT, bName + '.png'))); let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * A.w + x; const d = (Math.abs(A.data[i * A.bpp] - B.data[i * B.bpp]) + Math.abs(A.data[i * A.bpp + 1] - B.data[i * B.bpp + 1]) + Math.abs(A.data[i * A.bpp + 2] - B.data[i * B.bpp + 2])) / 3; if (d > 40) n++; } return n; };
  await ev(() => {
    window.PJ = (P, W, H) => { const G = __game, p = G.state().player, eye = [p.x, p.y + (p.crouching ? 1.0 : 1.6), p.z], yaw = p.yaw, pt = p.pitch; const f = [-Math.sin(yaw) * Math.cos(pt), Math.sin(pt), -Math.cos(yaw) * Math.cos(pt)], r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; const v = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]]; const xc = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], yc = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], zc = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; if (zc <= 0.1) return null; const t = Math.tan((G.CONFIG.camera.fovVertical || 75) * Math.PI / 360); return [(xc / (zc * t * W / H) + 1) / 2 * W, (1 - yc / (zc * t)) / 2 * H]; };
  });
  const out = {};
  // ---- A. soldiers ----
  await ev(() => { const G = __game; G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots(); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); });
  await shot('A0_empty');
  const spots = ['n.f.spawn', 'n.f.inw', 'n.f.ine', 'n.f.wdoor', 'n.f.edoor'];
  const ids = await ev((spots) => { const G = __game, ids = []; for (const [k, n] of spots.entries()) ids.push(G.spawnBot(k % 2 ? 'tan' : 'green', n)); G.step(0.3); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); return ids; }, spots);
  await shot('A1_bots');
  const sample = async () => { const ps = await ev(([W, H]) => __game.state().bots.map((b) => ({ id: b.id, team: b.team, dead: b.dead, chest: PJ([b.pos[0], b.pos[1] + 1.0, b.pos[2]], W, H), head: PJ([b.pos[0], b.pos[1] + 1.65, b.pos[2]], W, H), occluded: (() => { const p = __game.state().player; const o = [p.x, p.y + 1.6, p.z], d = [b.pos[0] - o[0], b.pos[1] + 1.0 - o[1], b.pos[2] - o[2]]; const h = __game.raycast(o, d); return h && h.kind !== 'soldier' && h.distance < Math.hypot(...d) - 0.5; })() })), [W, H]); const res = []; for (const q of ps) res.push({ id: q.id, team: q.team, dead: q.dead, occluded: q.occluded, chest: q.chest && await pixel(...q.chest), head: q.head && await pixel(...q.head) }); return res; };
  out.standing = await sample();
  await ev((ids) => { const G = __game; G.killBot(ids[0]); G.killBot(ids[1]); G.step(2.5); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); }, ids);
  await shot('A2_two_dead'); out.afterTwoDeaths = await sample();
  await ev(() => { const G = __game; G.removeBots(); G.step(0.1); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); });
  await shot('A3_removed'); out.ghostPixelsAfterRemove = await regionDiff('A0_empty', 'A3_removed', 0, 0, W, Math.round(H * 0.62));   // above the viewmodel and HUD
  // a match: freeze frame of the Green spawn, then kill some, next round start, then runMatch and back to free play
  await ev(() => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 5, autoplay: false }); G.setTimeScale(0); G.setGodMode(true); G.step(0.5); G.teleport(60, 0, 30, 0, 0); G.look(0, -0.1); G.render(); });
  await shot('A4_freeze_round1');
  await ev(() => { const G = __game; for (let i = 0; i < 60 * 8 && G.state().match.phase !== 'live'; i++) G.step(1 / 60); for (const b of G.state().bots.filter((q) => q.team === 'green')) G.killBot(b.id); G.step(2.5); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); });
  await shot('A5_green_bots_dead'); out.deadGreens = (await sample()).filter((q) => q.team === 'green');
  await ev(() => { const G = __game; G.setRoundTime(0.2); for (let i = 0; i < 60 * 12 && G.state().match.phase !== 'freeze'; i++) G.step(1 / 60); G.step(0.3); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); });
  await shot('A6_round2_freeze'); out.round2Greens = (await sample()).filter((q) => q.team === 'green'); out.round2Phase = await ev(() => __game.state().match);
  await ev(() => { const G = __game; G.runMatch({ difficulty: 'veteran', seed: 3 }); G.quitToTitle(); G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots(); G.teleport(60, 0, 30, 0, -0.08); G.look(0, -0.08); G.render(); });
  await shot('A7_after_match_free'); out.ghostPixelsAfterMatch = await regionDiff('A0_empty', 'A7_after_match_free', 0, 0, W, Math.round(H * 0.62));
  out.botsVisibleControl = await regionDiff('A0_empty', 'A1_bots', 0, 0, W, Math.round(H * 0.62));
  out.playerAfterMatch = await ev(() => { const p = __game.state().player; return { hp: p.health, dead: p.dead, phase: __game.state().match.phase }; });
  // ---- B. decals ----
  out.decals = await ev(() => {
    const G = __game, F = G.CONFIG.fx, r = { pool: F.decals, scorchPool: F.scorches, before: G.renderInfo() }; G.setGodMode(true);
    const targets = [[[60, 0, 100], [0, -0.6, -1]], [[30, 0, 100], [-1, 0.6, 0]], [[60, 0, 60], [1, -0.1, 0]], [[100, 0, 120], [1, 0.1, 0.2]], [[80, 0, 76], [0.3, 0, 1]]];
    let maxIdx = 0;
    for (let k = 0; k < 3000; k++) { const [p, d] = targets[k % targets.length]; G.teleport(p[0], p[1], p[2]); G.lookAt(p[0] + d[0] * 10, p[1] + 1.6 + d[1] * 10 + Math.sin(k) * 2, p[2] + d[2] * 10 + Math.cos(k) * 3); G.give('ammo'); G.selectWeapon('smg'); G.fire(); G.step(0.07); maxIdx = Math.max(maxIdx, G.fxStats().decalNext); if (k % 100 === 0) G.render(); }
    for (let k = 0; k < 40; k++) { G.give('grenade'); G.give('health'); G.teleport(20 + k * 2, 0, 100, 0, -1.2); G.throwGrenade(0.1); G.step(2.3); }
    G.render(); r.after = G.renderInfo(); r.maxDecalIndex = maxIdx; r.fx = G.fxStats();
    delete r.before.art; delete r.after.art; return r;
  });
  // ---- C. viewmodel ----
  await ev(() => { const G = __game; G.quitToTitle(); G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots(); G.setGodMode(false); G.give('health'); });
  const vmShots = [];
  for (const w of ['rifle', 'smg', 'pistol', 'sniper']) { await ev((w) => { const G = __game; G.teleport(60, 0, 100, Math.PI, 0.35); G.selectWeapon(w); G.step(1); G.look(Math.PI, 0.35); G.render(); }, w); vmShots.push(await shot('C_vm_' + w)); }
  await ev(() => { const G = __game; G.selectWeapon('rifle'); G.step(1); G.fire(); G.step(0.1); G.reload(); G.step(0.6); G.render(); }); await shot('C_vm_rifle_reloading');
  await ev(() => { const G = __game; G.selectWeapon('sniper'); G.step(1); G.setInput({ scope: true }); G.step(0.5); G.render(); }); await shot('C_vm_sniper_scoped');
  await ev(() => { const G = __game; G.clearInput(); G.step(0.4); G.selectWeapon('rifle'); G.setInput({ fire: true }); G.step(0.05); G.selectWeapon('smg'); G.step(0.05); G.selectWeapon('pistol'); G.clearInput(); G.step(0.03); G.render(); }); await shot('C_vm_switch_midfire');
  await ev(() => { const G = __game; G.step(1); G.damagePlayer(500); G.step(0.5); G.render(); }); await shot('C_vm_dead');
  const R = [W / 2, H * 0.45, W, H];   // lower-right quarter
  out.vm = {};
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.vm[`${vmShots[i]} vs ${vmShots[j]}`] = await regionDiff(vmShots[i], vmShots[j], R[0], R[1], R[2], R[3]);
  out.vm.reloadVsIdle = await regionDiff('C_vm_rifle', 'C_vm_rifle_reloading', ...R);
  out.vm.scopedVsUnscoped = await regionDiff('C_vm_sniper', 'C_vm_sniper_scoped', ...R);
  for (const k of ['standing', 'afterTwoDeaths', 'deadGreens', 'round2Greens']) { console.log(k); for (const q of out[k]) console.log('   ', JSON.stringify(q)); }
  for (const k of ['botsVisibleControl', 'ghostPixelsAfterRemove', 'ghostPixelsAfterMatch', 'playerAfterMatch', 'round2Phase', 'decals', 'vm']) console.log(k, JSON.stringify(out[k]));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
