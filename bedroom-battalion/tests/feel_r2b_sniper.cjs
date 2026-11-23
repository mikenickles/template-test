// Round 2 re-check: sniper scoped hit rate still, crouched, strafing and jumping (first shot only), and unscoped; scope pictures at fov 20.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2b_lib.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, out = {};
    for (const d of [30, 60]) { const spot = R2B.findSpot(d); const t = R2B.tgt(spot.id);
      for (const mode of ['still', 'crouch', 'strafe', 'jump', 'hip still']) { let hits = 0, heads = 0; const n = 40;
        for (let i = 0; i < n; i++) { G.clearInput(); G.resetTargets(); G.give('ammo'); G.teleport(spot.x, 0, spot.z); G.selectWeapon('sniper'); G.step(1.5);
          const aim = () => G.lookAt(t.pos[0], t.pos[1] + 0.75, t.pos[2]); aim();
          const sc = mode !== 'hip still'; if (sc) G.setInput({ scope: true }); if (mode === 'crouch') G.setInput({ crouch: true }); G.step(0.4);
          if (mode === 'strafe') { G.setInput({ left: true }); G.step(0.3); } if (mode === 'jump') { G.setInput({ jump: true }); G.step(0.2); }
          aim(); const e = G.fire(); if (e && e.hit === spot.id) { hits++; if (e.zone === 'head') heads++; } G.clearInput(); G.step(0.8); }
        out[d + 'u ' + mode] = Math.round(100 * hits / n) + '% hit (' + heads + ' head)'; } }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  for (const fov of [20]) { await h.page.evaluate(() => { const G = __game; G.clearInput(); G.resetTargets(); G.teleport(109, 60, 144); G.selectWeapon('sniper'); G.step(1); const t = G.state().targets[0]; G.lookAt(t.pos[0], t.pos[1] + 1, t.pos[2]); G.setInput({ scope: true }); G.step(0.4); G.render(); }); await h.shot('round2/feel_re_scope_135u_fov20.png'); console.log('fov rendered', await h.page.evaluate(() => __game.state().weapon.fov)); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
