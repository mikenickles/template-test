// Round 2 re-check: grenade. (1) damage against miss distance from many real throws at a dummy; (2) best throw from 10 to 18 units;
// (3) placed bursts at set offsets; (4) burst frames from about 14 and 40 units; (5) arc preview against landing; (6) the throw tick on screen.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
const dir = __dirname + '/../screenshots/round2/';
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });   // test side: stop the page's own draw loop so every frame is drawn by hand
  await h.page.waitForTimeout(300);
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state(), out = {};
    const D = [60, 0, 34];   // dummy target.1 position
    const toss = (pos, yaw, pitch) => { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(pos[0], pos[1], pos[2], yaw, pitch); G.step(0.3); G.look(yaw, pitch);
      const d0 = G.damageLog.length, n0 = G.shotLog.length; G.throwGrenade(0.2); let k = 0, last = null, rest = null;
      while (G.grenades.length && k++ < 240) { const g = G.grenades[0]; last = [g.x, g.y, g.z]; if (g.rest && !rest) rest = [g.x, g.y, g.z]; G.step(T); }
      const ev = G.shotLog.slice(-3).filter((e) => e.weapon === 'grenade' && e.time >= st().time - 0.1);
      const hit = ev.find((e) => e.hit === 'target.1');
      return { at: last, miss: Math.hypot(last[0] - D[0], last[2] - D[2]), dmg: hit ? hit.damage : 0, down: st().targets[0].down, self: G.damageLog.slice(d0).reduce((a, d) => a + d.amount, 0) }; };
    // 1+2: from 10, 12, 14, 16, 18 units south of the dummy, sweep pitch and a little yaw; record every throw
    const all = []; out.best = {};
    for (const d of [10, 12, 14, 16, 18]) { let best = null; const pos = [D[0], 0, D[2] + d];
      for (let p = -12; p <= 20; p += 1) for (const dy of [-0.06, -0.03, 0, 0.03, 0.06]) { const r = toss(pos, dy, p * Math.PI / 180); all.push(r); if (!best || r.miss < best.miss) best = Object.assign({ pitchDeg: p, yawOff: dy }, r); }
      out.best['from ' + d + ' u'] = { pitchDeg: best.pitchDeg, yawOff: best.yawOff, missBy: +best.miss.toFixed(2), damage: best.dmg, killed: best.down, selfDamage: Math.round(best.self) };
      const k = all.filter((a) => Math.abs(a.at[2] - pos[2]) < 40 && a.down).length; out.best['from ' + d + ' u'].killsInSweep = k + ' of 165'; }
    // damage against horizontal miss distance, binned
    out.curve = {}; for (let b = 0; b < 8; b += 0.5) { const s = all.filter((a) => a.miss >= b && a.miss < b + 0.5 && a.at[1] < 0.5); if (!s.length) continue; const dm = s.map((a) => a.dmg); out.curve[b.toFixed(1) + '-' + (b + 0.5).toFixed(1)] = { n: s.length, meanDmg: Math.round(dm.reduce((x, y) => x + y, 0) / s.length), maxDmg: Math.round(Math.max(...dm)), killPct: Math.round(100 * s.filter((a) => a.down).length / s.length) }; }
    out.killRadius = +Math.max(0, ...all.filter((a) => a.down).map((a) => a.miss)).toFixed(2);
    out.totalThrows = all.length; out.totalKills = all.filter((a) => a.down).length;
    // 3: placed bursts: stand beside the dummy, throw straight down, step away before it bursts
    out.placed = {}; for (const off of [0.4, 0.8, 1, 1.5, 2, 3, 4, 5, 6, 6.8]) { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(D[0] + off + 0.0, 0, D[2] - 0.5, 0, -1.54); G.step(0.3); G.look(0, -1.54); G.throwGrenade(0.05); let k = 0; G.step(0.3); let gx = null, gz = null; G.teleport(110, 0, 150); while (G.grenades.length && k++ < 200) { gx = G.grenades[0].x; gz = G.grenades[0].z; G.step(T); }
      const e = G.shotLog[G.shotLog.length - 1]; out.placed['dropped ' + off] = { burstOffset: gx === null ? null : +Math.hypot(gx - D[0], gz - D[2]).toFixed(2), damage: e.weapon === 'grenade' && e.hit === 'target.1' ? e.damage : 0, killed: st().targets[0].down }; }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // 4: burst frames from about 14 and 40 units: throw from (30,0,20) east along the floor in the open NW quarter, then stand at the range
  const frames = {};
  for (const range of [14, 40]) {
    const files = [];
    const info = await h.page.evaluate((range) => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(10, 0, 12, -Math.PI / 2, 0); G.step(0.3); G.look(-Math.PI / 2, 0); G.throwGrenade(0.2);
      let k = 0; while (G.grenades.length && G.grenades[0].fuse > 1 / 60 + 1e-6 && k++ < 200) G.step(1 / 60); const g = G.grenades[0];
      let vp = null; for (let a = 0; a < 360 && !vp; a += 3) { const x = g.x + range * Math.sin(a * Math.PI / 180), z = g.z + range * Math.cos(a * Math.PI / 180); if (x < 3 || x > 117 || z < 3 || z > 157) continue; let ok = true; for (const ty of [0.3, 3.5, 7]) { const dx = g.x - x, dy = ty - 1.6, dz = g.z - z, L = Math.hypot(dx, dy, dz); const r = G.raycast([x, 1.6, z], [dx, dy, dz]); if (r && r.distance < L - 0.3) ok = false; } if (ok) vp = [x, z, a]; }
      G.teleport(vp[0], 0, vp[1]); G.lookAt(g.x, 1.6, g.z); G.selectWeapon('rifle'); G.render(); return { gx: g.x, gz: g.z, fuse: g.fuse, viewer: vp, actualRange: Math.hypot(G.state().player.x - g.x, G.state().player.z - g.z) }; }, range);
    files.push(await h.shot('round2/feel_re_burst_' + range + 'u_t0.png'));
    let t = 0; for (const n of [1, 2, 2, 4, 6, 9]) { t += n; await h.page.evaluate((n) => { __game.step(n / 60); __game.render(); }, n); files.push(await h.shot('round2/feel_re_burst_' + range + 'u_t' + t + '.png')); }
    frames[range] = info; execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -label %t -tile 4x2 -geometry 640x360+3+3 "${dir}feel_re_cmp_burst_${range}u.png"`);
  }
  // reference picture: same spot with two dummies-sized markers? use the real dummies instead: burst next to dummy target.1 seen from 14 u to the side
  { const files = [];
    await h.page.evaluate(() => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.teleport(60.5, 0, 33.5, 0, -1.54); G.step(0.3); G.look(0, -1.54); G.throwGrenade(0.05); let k = 0; while (G.grenades.length && G.grenades[0].fuse > 1 / 60 + 1e-6 && k++ < 200) G.step(1 / 60); G.teleport(74, 0, 34); G.lookAt(60, 1.2, 34); G.render(); });
    files.push(await h.shot('round2/feel_re_burst_dummy_t0.png'));
    let t = 0; for (const n of [1, 3, 4, 7]) { t += n; await h.page.evaluate((n) => { __game.step(n / 60); __game.render(); }, n); files.push(await h.shot('round2/feel_re_burst_dummy_t' + t + '.png')); }
    execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -label %t -tile 3x2 -geometry 640x360+3+3 "${dir}feel_re_cmp_burst_dummy.png"`); }
  // 5: arc preview against where it lands; 6: the throw tick and the two ticks after
  const cases = [['level', [10, 0, 12], -Math.PI / 2, 0], ['up30', [10, 0, 12], -Math.PI / 2, 30 * Math.PI / 180], ['down', [10, 0, 12], -Math.PI / 2, -25 * Math.PI / 180], ['wall', [10, 0, 12], 0.5, 0.15], ['at_dummy', [60, 0, 46], 0, 0]];
  const arcRes = {};
  for (const [tag, pos, yaw, pitch] of cases) {
    await h.page.evaluate(([pos, yaw, pitch]) => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.selectWeapon('rifle'); G.teleport(pos[0], pos[1], pos[2], yaw, pitch); G.step(0.8); G.look(yaw, pitch); G.setInput({ grenade: true }); G.step(0.25); G.look(yaw, pitch); G.render(); }, [pos, yaw, pitch]);
    const a = await h.shot('round2/feel_re_gr_' + tag + '_1_arc.png');
    await h.page.evaluate(() => { const G = __game; G.setInput({ grenade: false }); G.step(1 / 60); G.render(); });
    const b = await h.shot('round2/feel_re_gr_' + tag + '_2_throwtick.png');
    await h.page.evaluate(() => { __game.step(1 / 60); __game.render(); });
    const b2 = await h.shot('round2/feel_re_gr_' + tag + '_3_tick2.png');
    arcRes[tag] = await h.page.evaluate(([yaw, pitch]) => { const G = __game; let k = 0, last = null; while (G.grenades.length && G.grenades[0].fuse > 2 / 60 && k++ < 200) { G.step(1 / 60); } const g = G.grenades[0]; last = g && [+g.x.toFixed(2), +g.y.toFixed(2), +g.z.toFixed(2)]; G.look(yaw, pitch); G.render(); return last; }, [yaw, pitch]);
    const c = await h.shot('round2/feel_re_gr_' + tag + '_4_rest.png');
    await h.page.evaluate(() => { __game.step(4 / 60); __game.render(); });
    const d = await h.shot('round2/feel_re_gr_' + tag + '_5_burst.png');
    execSync(`montage "${a}" "${b}" "${b2}" "${c}" "${d}" -label %t -tile 5x1 -geometry 512x288+3+3 "${dir}feel_re_cmp_grenade_${tag}.png"`);
  }
  console.log('burst frame spots', JSON.stringify(frames), 'rest points', JSON.stringify(arcRes));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
