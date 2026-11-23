// Round 3 re-check: spectating view after death, a body after a kill, and the whistle (which sound plays on which straight).
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const files = [];
  await h.page.evaluate(() => { const G = __game; G.startMatch({ difficulty: 'regular', seed: 3, autoplay: false }); G.step(5.1); G.damagePlayer(150); G.step(2.0); G.render(); });
  files.push(await h.shot('round3/feel_re_spectate_1.png'));
  await h.page.evaluate(() => { const G = __game; G.step(6); G.render(); });
  files.push(await h.shot('round3/feel_re_spectate_2.png'));
  await h.page.evaluate(() => { const G = __game; G.spectateNext(); G.step(0.2); G.render(); });
  files.push(await h.shot('round3/feel_re_spectate_3.png'));
  const wh = await h.page.evaluate(() => { const G = __game; G.step(60); const a = G.audioLog.filter((e) => /whistle/.test(e.name)).slice(-4); return { audio: a, log: G.trainWhistles.slice(-4), sounds: Object.keys(G.CONFIG.audio.sounds).filter((k) => /whistle/.test(k)).map((k) => k + ' ' + JSON.stringify(G.CONFIG.audio.sounds[k].map((L) => L.f))) }; });
  console.log(JSON.stringify(wh, null, 1));
  require('child_process').execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile 3x1 -geometry 640x360+2+2 "${__dirname}/../screenshots/round3/feel_re_cmp_spectate.png"`);
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
