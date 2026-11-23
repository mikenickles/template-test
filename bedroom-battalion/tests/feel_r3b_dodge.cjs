// Round 3 re-check: does a holding bot flee a grenade? One Tan bot (others removed) waits at its hold node; the player, standing
// 9 u off to its side (outside its 110 degree view cone), throws a grenade to land just in front of it (in view) or just behind it.
// Records the bot's distance from the grenade when it bursts and the damage it takes.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const PITCH = +(process.argv[2] || -40);
  const out = await h.page.evaluate((PITCH) => {
    const G = __game, T = 1 / 60, res = {};
    for (const diff of ['regular']) for (const where of ['front', 'behind']) { const rows = [];
      for (let i = 0; i < 8; i++) {
        G.startMatch({ difficulty: diff, seed: 700 + i, autoplay: false }); G.step(5.2); G.teleport(60, 0, 8); 
        const bs = G.state().bots; let tan = null; for (const b of bs) { if (b.team === 'tan' && !tan && b.role !== 'high' && b.role !== 'bed') tan = b.id; else G.killBot(b.id); }
        const B = G.bots.find((b) => b.id === tan); let k = 0; while (k++ < 30 * 60 && !(B.brain.state === 'hold' && Math.hypot(B.vx, B.vz) < 0.1)) { G.step(T); G.teleport(60, 0, 8); G.setRoundTime(140); }
        if (B.brain.state !== 'hold') { rows.push('no hold'); continue; }
        const fx = -Math.sin(B.yaw), fz = -Math.cos(B.yaw), sx = Math.cos(B.yaw), sz = -Math.sin(B.yaw);
        const aim = where === 'front' ? [B.x + fx * 2.5, B.z + fz * 2.5] : [B.x - fx * 2.5, B.z - fz * 2.5];
        const px = B.x + sx * 9, pz = B.z + sz * 9; G.teleport(px, B.y, pz); G.give('grenade'); G.give('health');
        // pitch search: a level-ish throw that lands near the aim point (precomputed carry is about 13.8 u level, so throw down a bit)
        G.lookAt(aim[0], B.y, aim[1]); const p = G.state().player; const yaw0 = p.yaw;
        // calibrate the pitch with simulated flights (no time passes): the game's own grenade code is not exposed, so throw test grenades from a saved state is not possible;
        // instead stand 6 u away and use a steep throw that drops close, then measure where it actually burst
        const px2 = B.x + sx * 6, pz2 = B.z + sz * 6; G.teleport(px2, B.y, pz2); G.lookAt(aim[0], B.y, aim[1]); const p2 = G.state().player; G.look(p2.yaw, PITCH * Math.PI / 180);
        const hp0 = B.hp, b0 = [B.x, B.z]; G.throwGrenade(0.05); G.teleport(px + sx * 30, B.y, pz + sz * 30);
        let d = null, gl = null, aimMiss = null; for (let t = 0; t < 200; t++) { gl = G.grenades[0]; if (!gl) break; if (gl.fuse <= 1 / 60 + 1e-6) { d = Math.hypot(gl.x - B.x, gl.z - B.z); aimMiss = Math.hypot(gl.x - aim[0], gl.z - aim[1]); } G.step(T); G.give('health'); }
        rows.push('miss ' + (aimMiss === null ? '?' : aimMiss.toFixed(1)) + ' bot ' + Math.hypot(B.x - b0[0], B.z - b0[1]).toFixed(1) + 'moved ' + (d === null ? '?' : d.toFixed(1)) + 'u/' + Math.round(hp0 - B.hp) + 'dmg/' + (B.brain.state));
      }
      res[diff + ' grenade ' + where] = rows.join('  ');
    }
    return res;
  }, PITCH);
  for (const k in out) console.log(k.padEnd(28), out[k]);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
