// Round 2: grenade. Flight, bounces, fuse, blast, self-damage; arc preview pictures against the real burst.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state(), out = {};
    const toss = (pos, yaw, pitch, hold) => { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(pos[0], pos[1], pos[2], yaw, pitch); G.step(0.3); G.look(yaw, pitch);
      const a0 = G.audioLog.length, d0 = G.damageLog.length, s0 = G.shotLog.length ? G.shotLog[G.shotLog.length - 1].time : -1;
      G.throwGrenade(hold || 0.2); const tRel = st().time; let tick = 0, first = null, peak = -9, restAt = null, last = null, bounces = 0, firstLand = null;
      while (G.grenades.length && tick < 200) { const g = G.grenades[0]; last = { x: g.x, y: g.y, z: g.z, rest: g.rest }; peak = Math.max(peak, g.y); if (g.rest && restAt === null) restAt = tick * T; G.step(T); tick++; }
      const ev = G.audioLog.slice(-12).filter((e) => e.time >= tRel - 0.5).map((e) => e.name.replace('grenade_', '') + '@' + (e.time - tRel).toFixed(2));
      const fb = G.audioLog.filter((e) => e.time >= tRel - 0.01 && e.name === 'grenade_bounce'); const p = st().player;
      return { fuse: +(tick * T).toFixed(2), burstAt: last && [+last.x.toFixed(1), +last.y.toFixed(1), +last.z.toFixed(1)], carry: last && +Math.hypot(last.x - pos[0], last.z - pos[2]).toFixed(1), firstBounceAt: fb.length ? +(fb[0].time - tRel).toFixed(2) : null, bounceSounds: fb.length,
        peakHeight: +(peak - pos[1]).toFixed(1), cameToRestAt: restAt, selfDamage: G.damageLog.slice(d0).map((d) => Math.round(d.amount)), events: ev.join(' ') }; };
    // flat open floor in the NW corner, throwing east along z = 6
    out.flatFloor = {}; for (const deg of [-20, -10, 0, 10, 20, 35, 60]) out.flatFloor['pitch ' + deg] = toss([8, 0, 12], -Math.PI / 2, deg * Math.PI / 180);
    // blast damage against the dummy at (60,0,34): thrown from the south at different stand-off distances, level aim
    out.blast = {}; for (const d of [6, 9, 12, 15, 18, 22]) { const res = toss([60, 0, 34 + d], 0, 0); const e = G.shotLog[G.shotLog.length - 1]; out.blast['thrown from ' + d + ' u'] = { burstAt: res.burstAt, missBy: +Math.hypot(res.burstAt[0] - 60, res.burstAt[2] - 34).toFixed(1), dummyDamage: e.weapon === 'grenade' ? e.damage : 0, self: res.selfDamage }; }
    // ideal placement: damage with distance (drop it by looking at the floor next to the dummy from different offsets)
    out.blastFalloff = {}; for (const off of [1, 2, 3, 4, 5, 6]) { G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(60 + off, 0, 34.0, 0, -1.5); G.step(0.3); G.throwGrenade(0.1); let k = 0; G.teleport(100, 0, 150); while (G.grenades.length && k++ < 200) G.step(T); const e = G.shotLog[G.shotLog.length - 1]; out.blastFalloff['burst ' + off + ' u from dummy'] = e.weapon === 'grenade' ? e.damage : 0; }
    // cover: dummy behind the Tan fort slit (66,0,137), grenade lands outside the wall
    { const res = toss([66, 0, 122], Math.PI, 0); const e = G.shotLog[G.shotLog.length - 1]; out.throughFortWall = { burstAt: res.burstAt, damageToDummyBehindWall: e.weapon === 'grenade' && e.hit ? e.hit + ' ' + e.damage : 0 }; }
    // self damage: at your feet, against a wall 2 units away, straight up
    out.self = { atFeet: toss([8, 0, 12], -Math.PI / 2, -1.5).selfDamage, wall2uAhead: toss([8, 0, 2.5], 0, 0).selfDamage, straightUp: toss([8, 0, 12], 0, 1.5).selfDamage, levelAndStandStill: toss([8, 0, 12], -Math.PI / 2, 0).selfDamage };
    // up onto perches from the floor: bed (18) from beside it, desk (26), tunnel top (8)
    out.lob = {}; for (const [name, pos, look, pitches] of [['bed top from (40,0,80)', [40, 0, 80], [27, 80], [40, 50, 60, 70]], ['tunnel top (8) from (86,0,80)', [86, 0, 80], [77, 80], [20, 35, 50]], ['desk top (26) from (88,0,60)', [88, 0, 60], [104, 66], [50, 60, 70]], ['chair seat (17) from (80,0,62)', [80, 0, 62], [90, 80], [45, 55, 65]]]) {
      for (const deg of pitches) { const yaw = Math.atan2(-(look[0] - pos[0]), -(look[1] - pos[2])); const res = toss(pos, yaw, deg * Math.PI / 180); out.lob[name + ' pitch ' + deg] = { burstAt: res.burstAt, peak: res.peakHeight }; } }
    // hold time does not cook: fuse from release
    out.cook = { hold0_2: toss([8, 0, 12], -Math.PI / 2, 0, 0.2).fuse, hold1_5: toss([8, 0, 12], -Math.PI / 2, 0, 1.5).fuse };
    // one per life; firing blocked while aiming
    { G.clearInput(); G.give('grenade'); G.give('ammo'); G.selectWeapon('rifle'); G.step(1); const l = G.shotLog.length; G.setInput({ grenade: true }); G.step(0.3); G.setInput({ grenade: true, fire: true }); G.step(0.3); const fired = G.shotLog.length !== l || (G.shotLog[G.shotLog.length - 1].weapon === 'rifle' && G.shotLog[G.shotLog.length - 1].time > G.state().time - 0.3);
      G.setInput({ grenade: false, fire: false }); G.step(T); const left = G.state().weapon.grenades; G.setInput({ fire: true }); let k = 0, t0 = G.state().time; while (k++ < 60 && !(G.shotLog[G.shotLog.length - 1].time >= t0)) G.step(T); out.misc = { fireWhileAiming: fired, grenadesAfterThrow: left, timeToFireAfterThrow: +(k * T).toFixed(2) }; G.clearInput(); G.step(2.5); }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // arc preview against the real burst, same camera: aim (arc drawn), then 5 frames along the flight, then the burst frame
  const cases = [['level', [8, 0, 12], -Math.PI / 2, 0], ['up35', [8, 0, 12], -Math.PI / 2, 35 * Math.PI / 180], ['bounce_wall', [8, 0, 12], 0.5, 0.15], ['at_dummy', [60, 0, 46], 0, 0.05]];
  for (const [tag, pos, yaw, pitch] of cases) {
    await h.page.evaluate(([pos, yaw, pitch]) => { const G = __game; G.clearInput(); G.resetTargets(); G.give('grenade'); G.give('health'); G.teleport(pos[0], pos[1], pos[2], yaw, pitch); G.step(0.3); G.look(yaw, pitch); G.setInput({ grenade: true }); G.step(0.2); G.look(yaw, pitch); G.render(); }, [pos, yaw, pitch]);
    const a = await h.shot('round2/feel_gr_' + tag + '_1_arc.png');
    await h.page.evaluate(([yaw, pitch]) => { const G = __game; G.setInput({ grenade: false }); G.step(1 / 60); G.step(1.0); G.look(yaw, pitch); G.render(); }, [yaw, pitch]);
    const b = await h.shot('round2/feel_gr_' + tag + '_2_flight1s.png');
    await h.page.evaluate(([yaw, pitch]) => { const G = __game; let k = 0; while (G.grenades.length && k++ < 120) G.step(1 / 60); G.step(2 / 60); G.look(yaw, pitch); G.render(); }, [yaw, pitch]);
    const c = await h.shot('round2/feel_gr_' + tag + '_3_burst.png');
    execSync(`montage "${a}" "${b}" "${c}" -tile 3x1 -geometry 640x360+3+3 "${__dirname}/../screenshots/round2/feel_cmp_grenade_${tag}.png"`);
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
