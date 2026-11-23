// Round 3: watch bots from player-eye vantage points in a real match (god mode on, player not autoplayed), frames every 0.5 s,
// plus the round-flow screens: freeze picker, live HUD, death cam and spectating, round end, match end.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
const dir = __dirname + '/../screenshots/round3/';
(async () => {
  const h = await boot({ width: 1280, height: 720 });
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const snap = async (name) => h.shot('round3/' + name);
  // 1. freeze screen
  await h.page.evaluate(() => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 7, autoplay: false }); G.step(1); G.render(); });
  await snap('feel_flow_01_freeze.png');
  // 2. watch from a vantage: player on the green bed end looking at the centre and tan half, god mode
  const views = [['bedtop', [27, 18, 60], [60, 2, 110]], ['gate', [60, 0, 28], [60, 1.5, 100]], ['desk', [99, 26, 70], [60, 1, 110]]];
  for (const [tag, pos, look] of views) {
    const files = [];
    await h.page.evaluate(([pos, look]) => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 11, autoplay: false }); G.setGodMode(true); G.step(5.1); G.teleport(pos[0], pos[1], pos[2]); G.lookAt(look[0], look[1], look[2]); G.step(8); }, [pos, look]);
    for (let i = 0; i < 16; i++) { await h.page.evaluate(([pos, look]) => { const G = __game; G.teleport(pos[0], pos[1], pos[2]); G.lookAt(look[0], look[1], look[2]); G.step(1.5); G.teleport(pos[0], pos[1], pos[2]); G.lookAt(look[0], look[1], look[2]); G.render(); }, [pos, look]);
      files.push(await snap(`feel_watch_${tag}_${String(i).padStart(2, '0')}.png`)); }
    execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile 4x4 -geometry 480x270+2+2 "${dir}feel_cmp_watch_${tag}.png"`);
  }
  // 3. death cam and spectating
  await h.page.evaluate(() => { const G = __game; G.startMatch({ difficulty: 'veteran', seed: 3, autoplay: false }); G.setGodMode(false); G.step(5.1); G.damagePlayer(150); G.step(0.5); G.render(); });
  await snap('feel_flow_02_deathcam.png');
  await h.page.evaluate(() => { __game.step(1.5); __game.render(); });
  await snap('feel_flow_03_spectate.png');
  const spec = await h.page.evaluate(() => { const G = __game; let k = 0; while (G.state().match.phase === 'live' && k++ < 200 * 60) G.step(1 / 60); G.step(0.3); G.render(); return G.state().match; });
  await snap('feel_flow_04_roundend.png');
  const mend = await h.page.evaluate(() => { const G = __game; G.setGodMode(false); let k = 0; while (G.state().match.phase !== 'matchEnd' && k++ < 60) { G.skipRound('tan'); G.step(5); } G.step(0.5); G.render(); return G.state().match; });
  await snap('feel_flow_05_matchend.png');
  console.log(JSON.stringify({ spec, mend: { phase: mend.phase, score: mend.score } }));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
