// Round 2: live grenade trials, scope zoom trial, and the round 1 leftovers (slits, bed top, bear descent).
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, C = G.CONFIG, out = {};
    const toss = (pos, yaw, pitch) => { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(pos[0], pos[1], pos[2], yaw, pitch); G.step(0.3); G.look(yaw, pitch); G.throwGrenade(0.2); let k = 0, last = null, peak = 0; while (G.grenades.length && k++ < 200) { const g = G.grenades[0]; last = [+g.x.toFixed(1), +g.y.toFixed(1), +g.z.toFixed(1)]; peak = Math.max(peak, g.y); G.step(T); } const e = G.shotLog[G.shotLog.length - 1]; return { burstAt: last, peak: +peak.toFixed(1), dmg: e.weapon === 'grenade' && e.hit ? e.hit + ':' + e.damage : 0, carry: +Math.hypot(last[0] - pos[0], last[2] - pos[2]).toFixed(1) }; };
    for (const [dmg, speed] of [[110, 18], [140, 18], [140, 24], [140, 30]]) { C.grenade.damage = dmg; C.grenade.speed = speed; const o = out['grenade damage ' + dmg + ', speed ' + speed] = {};
      o['thrown level at dummy from 12 / 15 u'] = [toss([60, 0, 46], 0, 0).dmg, toss([60, 0, 49], 0, 0).dmg];
      o['level carry on open floor'] = toss([8, 0, 12], -Math.PI / 2, 0).carry; o['35 deg carry'] = toss([8, 0, 12], -Math.PI / 2, 35 * Math.PI / 180).carry;
      const yawBed = Math.atan2(-(27 - 40), -(80 - 80)); o['lob at bed top (18) from (40,0,80), pitch 55 / 65 / 75'] = [55, 65, 75].map((d) => { const t = toss([40, 0, 80], yawBed, d * Math.PI / 180); return t.burstAt[1] > 17 ? 'ON BED ' + t.dmg : 'floor y ' + t.burstAt[1] + ' (peak ' + t.peak + ')'; });
      const yawT = Math.atan2(-(77 - 66), 0); o['lob at tunnel top (8) from (66,0,80), pitch 35 / 50 / 65'] = [35, 50, 65].map((d) => { const t = toss([66, 0, 80], Math.PI / 2 * -1, d * Math.PI / 180); return t.burstAt[1] > 7 ? 'ON TOP ' + t.dmg : 'y ' + t.burstAt[1] + ' (peak ' + t.peak + ')'; });
      // downward from the bed edge at the floor dummy (38,0,64)
      const yb = Math.atan2(-(38 - 33), -(64 - 70)); o['from bed edge (33,18,70) down at dummy (38,0,64), pitch -40'] = toss([33, 18, 70], yb, -40 * Math.PI / 180).dmg; }
    C.grenade.damage = 110; C.grenade.speed = 18;
    // bear descent (round 1 leftover): sprint and walk straight north off the head
    out.bear = {}; for (const sprint of [true, false]) { G.clearInput(); G.give('health'); G.teleport(60, 0, 20); G.step(T); const b = G.damageLog.length; const run = FEEL.drive([10, 18, 50], [[10, 15, 43, 1.5], [10, 9, 37.5, 1.5], [10, 0, 24, 3]], { sprint, maxT: 20 }); out.bear[sprint ? 'sprint' : 'walk'] = { ok: run.ok, time: run.time, damage: G.damageLog.slice(b).map((d) => Math.round(d.amount)) }; }
    G.clearInput();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // scope zoom trial at 135 u: fov 25 (now) and 18
  for (const fov of [25, 18]) { await h.page.evaluate((fov) => { const G = __game; G.CONFIG.weapons.sniper.scopeFov = fov; G.clearInput(); G.resetTargets(); G.teleport(109, 60, 144); G.selectWeapon('sniper'); G.step(1); const t = G.state().targets[0]; G.lookAt(t.pos[0], t.pos[1] + 1, t.pos[2]); G.setInput({ scope: true }); G.step(0.4); G.render(); }, fov); await h.shot('round2/feel_scope_135u_fov' + fov + '.png'); }
  await h.page.evaluate(() => { __game.CONFIG.weapons.sniper.scopeFov = 25; __game.clearInput(); __game.selectWeapon('rifle'); __game.step(1); });
  // round 1 leftovers
  const S = [['feel_r1_slit_west.png', [54, 0, 23.6], [54, 1.6, 80]], ['feel_r1_slit_east.png', [66, 0, 23.6], [66, 1.6, 80]], ['feel_r1_gate.png', [60, 0, 28], [60, 1.6, 140]], ['feel_r1_bedtop_across.png', [27, 18, 80], [100, 10, 80]], ['feel_r1_bed_south.png', [26, 18, 94], [26, 17, 116]], ['feel_r1_bed_from_gate.png', [60, 0, 28], [18, 1.6, 75]]];
  const files = []; for (const [n, p, t] of S) files.push(await h.eyeShot('../round2/' + n, p, t));
  execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -label %t -tile 3x2 -geometry 640x360+3+3 "${__dirname}/../screenshots/round2/feel_cmp_r1_leftovers.png"`);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
