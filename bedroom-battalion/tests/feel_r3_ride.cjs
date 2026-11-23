// Round 3: the train for the player. (1) Boarding a flatbed / gondola deck from the floor beside the west straight: run at the
// track and jump when the deck centre is at a given offset; how wide is the timing window. (2) Riding through the tunnel standing
// and crouched on a roof and on a deck. (3) Whistle timing. (4) Frames of a ride.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state(), out = {};
    G.range(false);
    const car = (type) => st().train.cars.find((c) => c.type === type);
    // wait until the given car centre is at z = zc (northbound on the west straight: z decreasing) then act
    const waitFor = (type, zc) => { let k = 0; while (k++ < 60 * 70) { const c = car(type); if (Math.abs(c.pos[0] - 43) < 0.3 && c.pos[2] > zc && c.pos[2] - 0.07 <= zc) return true; G.step(T); } return false; };
    out.board = {};
    for (const type of ['flatbed', 'gondola']) for (const from of [2.5, 4.5]) { const row = [];
      for (let off = -8; off <= 8; off += 1) {
        G.clearInput(); G.teleport(43 + from + 0.4, 0, 80, -Math.PI / 2, 0); G.step(T);
        // stand beside the track at z 80; act when the car centre is `off` units before z 80 (positive = still south of you)
        G.teleport(43 + from + 0.4, 0, 80, Math.PI / 2, 0); if (!waitFor(type, 80 + off)) { row.push('?'); continue; }
        G.look(Math.PI / 2, 0); G.setInput({ forward: true, jump: true }); G.step(0.25); G.setInput({ forward: true, jump: false }); G.step(0.3); G.clearInput(); G.step(0.6);
        const s = st(); row.push(s.riding ? 'R' : (s.player.y > 0.5 ? 'u' : '.'));
      }
      out.board[type + ' from ' + from + ' u off the rail centre (offsets -8..8, R = riding)'] = row.join(''); }
    // tunnel: teleport onto a car and ride through the east straight tunnel
    out.tunnel = {};
    for (const [type, y, crouch] of [['boxcar', 5, false], ['boxcar', 5, true], ['flatbed', 1.2, false], ['gondola', 1.2, false], ['caboose', 5, true]]) {
      // wait until the car is on the east straight near z 60 (southbound), then put the player on it
      let k = 0; while (k++ < 60 * 70) { const c = car(type); if (Math.abs(c.pos[0] - 77) < 0.3 && Math.abs(c.pos[2] - 62) < 0.1) break; G.step(T); }
      const c = car(type); G.clearInput(); G.teleport(c.pos[0], y + 0.05, c.pos[2] + (type === 'flatbed' ? 3.75 : 0)); if (crouch) G.setInput({ crouch: true }); G.step(T);
      const h0 = st().player.health, d0 = G.damageLog.length; let ridT = 0, minY = 99, maxZ = 0;
      for (let i = 0; i < 6 * 60; i++) { G.step(T); const p = st(); if (p.riding) ridT += T; minY = Math.min(minY, p.player.y); maxZ = Math.max(maxZ, p.player.z); }
      const p = st().player; out.tunnel[type + (crouch ? ' crouched' : ' standing')] = { rodeFor: +ridT.toFixed(2), endZ: +p.z.toFixed(1), endY: +p.y.toFixed(1), endX: +p.x.toFixed(1), damage: G.damageLog.slice(d0).map((e) => Math.round(e.amount) + ' ' + e.cause), stillRiding: !!st().riding }; G.clearInput(); }
    out.whistles = G.trainWhistles.slice(-6);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // frames of a ride on the gondola from boarding to step-off (player eye)
  const files = [];
  await h.page.evaluate(() => { const G = __game, T = 1 / 60; const car = () => G.state().train.cars.find((c) => c.type === 'gondola'); let k = 0; while (k++ < 60 * 70) { const c = car(); if (Math.abs(c.pos[0] - 43) < 0.3 && Math.abs(c.pos[2] - 100) < 0.1) break; G.step(T); } const c = car(); G.clearInput(); G.teleport(c.pos[0], 1.25, c.pos[2], 0, 0); G.step(T); });
  for (let i = 0; i < 8; i++) { await h.page.evaluate(() => { const G = __game; G.step(1.2); const s = G.state(); G.look(s.player.yaw, -0.05); G.render(); }); files.push(await h.shot('round3/feel_ride_' + i + '.png')); }
  execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile 4x2 -geometry 480x270+2+2 "${__dirname}/../screenshots/round3/feel_cmp_ride.png"`);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
