// Round 3: is there a frame-time spike on the first grenade burst of a fresh page? Two fresh pages; in each, three
// grenades thrown by the player in free play from the same spot, every tick rendered from 2 s before to 0.3 s after the
// burst. Reports the burst frame against the median of the 30 frames before it. Software renderer, shared machine.
const { open } = require('./visual_r3_lib.cjs');
(async () => {
  for (let run = 0; run < 2; run++) {
    const h = await open({ width: 1280, height: 720 });
    const r = await h.page.evaluate(() => {
      const timed = () => { const gl = document.getElementById('view').getContext('webgl2'), px = new Uint8Array(4); const a = performance.now(); __game.render(); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - a; };
      const prog = () => window.__three.renderer.info.programs.length, geo = () => window.__three.renderer.info.memory.geometries, out = [];
      for (let g = 0; g < 3; g++) {
        __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 30, 0, 0); __game.step(0.5); __game.lookAt(60, 1, 44); __game.throwGrenade(0.2);
        const before = [], p0 = prog(), g0 = geo(); let burst = null, after = [];
        for (let i = 0; i < 200; i++) { const had = __game.grenades.length; __game.step(1 / 60); const ms = timed(); if (!burst && had && !__game.grenades.length) { burst = ms; continue; } if (!burst) before.push(ms); else { after.push(ms); if (after.length >= 6) break; } }
        before.sort((a, b) => a - b); out.push({ grenade: g + 1, burstMs: +burst.toFixed(1), medianBefore: +before[before.length >> 1].toFixed(1), after: after.map((v) => +v.toFixed(1)), programs: [p0, prog()], geometries: [g0, geo()] });
        __game.step(1);
      }
      return out;
    });
    console.log('page', run + 1, JSON.stringify(r));
    await h.browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
