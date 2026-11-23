// Round 4B HUD and menus: the title over the drifting room (two moments), the freeze picker, a live firefight HUD from the player's
// eye (autoplay), spectating, pause, round end and match end; at 1280 x 720 and 1920 x 1080 to show the scaling.
const { launch } = require('./harness.cjs');
(async () => {
  for (const [w, h] of [[1280, 720], [1920, 1080]]) {
    const { browser, page, errors, shot } = await launch({ width: w, height: h });
    const tag = (n) => 'round4/builder_r4b_ui_' + n + '_' + w + '.png';
    await page.waitForTimeout(400); await shot(tag('title_a'));
    if (w === 1280) { await page.waitForTimeout(6000); await shot(tag('title_b')); }
    await page.evaluate(() => { const g = __game; g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 22, autoplay: true }); g.step(2); g.render(); });
    await shot(tag('freeze'));
    const ff = await page.evaluate(() => { const g = __game;
      for (let i = 0; i < 3000; i++) { g.step(0.1); const s = g.state(); const feed = g.killFeed.filter((k) => s.time - k.time < 4).length, co = g.callouts.filter((c) => s.time - c.time < 3).length;
        if (s.match.phase === 'live' && !s.match.playerDead && feed > 0 && co > 0 && g.shotLog.length && g.shotLog[g.shotLog.length - 1].time > s.time - 0.2 && !g.shotLog[g.shotLog.length - 1].by) { g.render(); return { t: s.time, round: s.match.round }; } }
      g.render(); return null; });
    await shot(tag('firefight'));
    await page.evaluate(() => { const g = __game; g.damagePlayer(500); g.step(2.2); g.render(); });
    await shot(tag('spectate'));
    await page.evaluate(() => { const g = __game; g.pause(); g.render(); });
    await shot(tag('pause'));
    await page.evaluate(() => { const g = __game; g.resume(); g.setTimeScale(0); g.skipRound('green'); g.step(0.5); g.render(); });
    await shot(tag('round_end'));
    await page.evaluate(() => { const g = __game; for (let i = 0; i < 8 && g.state().match.phase !== 'matchEnd'; i++) { g.step(6); if (g.state().match.phase === 'live' || g.state().match.phase === 'freeze') g.skipRound('green'); } g.step(0.5); g.render(); });
    await shot(tag('match_end'));
    console.log(w, JSON.stringify(ff), 'errors', JSON.stringify(errors.slice(0, 5)));
    await browser.close();
  }
})();
