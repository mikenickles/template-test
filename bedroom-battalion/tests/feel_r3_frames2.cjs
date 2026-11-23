// Round 3: close frame sequences of bots fighting, from the player's eye in god mode (does not shoot), every 0.33 s.
// west: from the bed's north end looking down on the west lane holds; ruin: crouched on the north side of the ruin looking south.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
const dir = __dirname + '/../screenshots/round3/';
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  for (const [tag, pos, look, seed, t0, crouch] of [['west', [30, 18, 52], [38, 0, 85], 21, 4, false], ['ruin', [60, 1.2, 73.5], [60, 1.2, 110], 22, 6, true], ['east', [94, 26, 58], [84, 0, 100], 23, 3, false]]) {
    const files = [];
    await h.page.evaluate(([pos, look, seed, t0, crouch]) => { const G = __game; G.startMatch({ difficulty: 'regular', seed, autoplay: false }); G.setGodMode(true); G.step(5.1); G.teleport(pos[0], pos[1], pos[2]); if (crouch) G.setInput({ crouch: true }); G.lookAt(look[0], look[1], look[2]); G.step(t0); }, [pos, look, seed, t0, crouch]);
    for (let i = 0; i < 24; i++) { await h.page.evaluate(([pos, look]) => { const G = __game; G.step(1 / 3); G.teleport(pos[0], pos[1], pos[2]); G.lookAt(look[0], look[1], look[2]); G.render(); }, [pos, look]);
      files.push(await h.shot(`round3/feel_fight_${tag}_${String(i).padStart(2, '0')}.png`)); }
    execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile 4x6 -geometry 480x270+2+2 "${dir}feel_cmp_fight_${tag}.png"`);
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
