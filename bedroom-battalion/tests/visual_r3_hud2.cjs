// Round 3 HUD, second pass: kill feed and callouts over a bright and a dark background (autoplay match, god mode),
// the pause menu with the app phase before and after, and what the spectating view draws of the spectated bot itself
// (its four instances hidden in the test: how much of the frame changes).
const { open } = require('./visual_r3_lib.cjs');
(async () => {
  for (const [tag, W, H] of [['720', 1280, 720], ['1080', 1920, 1080]]) {
    const h = await open({ width: W, height: H }); const p = h.page;
    const fc = await p.evaluate(() => { __game.startMatch({ difficulty: 'veteran', seed: 12, autoplay: true }); __game.setGodMode(true); __game.setTimeScale(0);
      for (let i = 0; i < 3000; i++) { __game.step(1 / 10); if (i % 5 === 0) __game.render(); if (document.querySelectorAll('#feed div').length >= 3 && document.querySelectorAll('#callouts div').length >= 2) break; }
      return { feed: [...document.querySelectorAll('#feed div')].map((d) => d.textContent), callouts: [...document.querySelectorAll('#callouts div')].map((d) => d.textContent) }; });
    console.log(tag, 'feed', JSON.stringify(fc));
    await p.evaluate(() => { window.__r3.cam([26, 19.6, 70], [-2, 60, 60]); __game.render(); });
    await h.snap(`visual_hud_feed_bright_${tag}.png`);
    await p.evaluate(() => { window.__r3.cam([20, 1.6, 95], [20, 3, 60]); __game.render(); });
    await h.snap(`visual_hud_feed_dark_${tag}.png`);
    await p.evaluate(() => __game.clearView());
    if (tag === '720') {
      // spectating: a fresh non-autoplay match, the player killed, then what the spectated bot's own model covers
      const sp = await p.evaluate(() => { __game.startMatch({ difficulty: 'regular', seed: 14 }); __game.setTimeScale(0); __game.step(7); __game.setGodMode(false); __game.damagePlayer(500); __game.step(2.2); __game.render();
        const R = window.__r3, s = __game.state(), id = s.match.spectating, b = s.bots.find((o) => o.id === id), k = R.slotOf(b.pos);
        const A = R.full(); for (let q = 0; q < R.np; q++) R.hide.add(k * R.np + q); __game.render(); const B = R.full(), shot = R.copy(); R.hide.clear(); __game.render();
        let n = 0, bottom = 0; const gl = R.gl(), W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight; for (let i = 0; i < W * Hh; i++) { const j = i * 4; if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 30) { n++; if (((i / W) | 0) < Hh * 0.3) bottom++; } }
        window.__specHidden = shot; return { spectating: b.name, slot: k, crouching: b.crouching, pctFrame: +(100 * n / (W * Hh)).toFixed(1), pctInBottom30: n ? Math.round(100 * bottom / n) : 0 }; });
      console.log('spectated bot own model covers', JSON.stringify(sp));
      await h.snap('visual_hud_spectate_own_model_720.png');
      // pause
      const ps = await p.evaluate(() => { const a = __game.state().app; __game.pause(); __game.render(); return { before: a, after: __game.state().app, pauseShown: getComputedStyle(document.getElementById('pause')).display }; });
      console.log('pause', JSON.stringify(ps)); await h.snap('visual_hud_pause_720.png');
    }
    console.log(tag, 'errors', JSON.stringify(h.errors));
    await h.browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
