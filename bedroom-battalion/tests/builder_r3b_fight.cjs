// Round 3B: a live firefight from the player's eye (autoplay) with HUD, kill feed and callouts; draw calls over a live period;
// a crouched bot in cover; sim cost per tick in a match.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const ev = (fn, a) => page.evaluate(fn, a), out = {};
  // draw calls through a whole live round, rendered every 0.25 s, from the autoplayed player's eye
  out.drawCalls = await ev(() => {
    const g = __game; g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 21, autoplay: true });
    let mx = 0, sum = 0, n = 0, tri = 0, firing = 0;
    while (g.state().match.phase !== 'live') g.step(0.25);
    for (let i = 0; i < 600 && g.state().match.phase === 'live'; i++) { g.step(0.25); g.render(); const s = g.state(); mx = Math.max(mx, s.drawCalls); tri = Math.max(tri, s.triangles); sum += s.drawCalls; n++; }
    return { max: mx, mean: +(sum / n).toFixed(1), maxTriangles: tri, frames: n };
  });
  // a firefight shot: step until the player-bot is engaging and the kill feed and callouts are showing
  out.shot = await ev(() => {
    const g = __game; g.startMatch({ difficulty: 'regular', seed: 22, autoplay: true });
    for (let i = 0; i < 2400; i++) {
      g.step(0.1);
      const s = g.state(), feed = g.killFeed.filter((k) => s.time - k.time < 4).length, co = g.callouts.filter((c) => s.time - c.time < 3).length;
      if (s.match.phase === 'live' && !s.player.dead && g.bots.length && g.player === undefined && false) break;
      const me = g.bots && window.__me;
      if (s.match.phase === 'live' && !s.match.playerDead && feed > 0 && co > 0 && g.shotLog.length && g.shotLog[g.shotLog.length - 1].time > s.time - 0.2 && !g.shotLog[g.shotLog.length - 1].by) { g.render(); return { t: s.time, feed, co, round: s.match.round }; }
    }
    g.render(); return { t: g.state().time, failed: true };
  });
  await shot('round3/builder_r3b_firefight.png');
  out.feedAndCallouts = await ev(() => ({ feed: __game.killFeed.slice(-5), callouts: __game.callouts.slice(-5) }));
  // a crouched bot (cover or scoped sniper), seen from 5 units away
  out.crouch = await ev(() => {
    const g = __game; g.startMatch({ difficulty: 'regular', seed: 23 }); g.setGodMode(true);
    for (let i = 0; i < 3000; i++) {
      g.step(0.1);
      const b = g.state().bots.find((x) => x.crouching && !x.dead && x.pos[1] < 0.5);
      if (b) { const a = Math.atan2(b.pos[0] - 60, b.pos[2] - 80) + 0.6; g.teleport(b.pos[0] + Math.sin(a) * 4, b.pos[1], b.pos[2] + Math.cos(a) * 4); g.step(1 / 60); g.lookAt(b.pos[0], b.pos[1] + 0.6, b.pos[2]); g.render(); return { name: b.name, state: b.brainState, weapon: b.weapon, pos: b.pos }; }
    }
    return null;
  });
  await shot('round3/builder_r3b_crouched_bot.png');
  // sim cost per tick in a live match (10 soldiers, autoplay), against an empty sandbox
  out.simCost = await ev(() => {
    const g = __game; g.startMatch({ difficulty: 'veteran', seed: 24, autoplay: true });
    while (g.state().match.phase !== 'live') g.step(0.5);
    const t0 = performance.now(); g.step(60); const live = (performance.now() - t0) / 3600;
    return { msPerTickLiveMatch: +live.toFixed(4) };
  });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
