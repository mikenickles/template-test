const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(() => {
    const g = __game; g.setTimeScale(0); g.startMatch({ difficulty: 'regular', seed: 1, autoplay: true }); g.setGodMode(false);
    // make everyone harmless to watch setup: stop perception by moving Tan and Green far... instead just record arrivals
    const out = [];
    for (let t = 0; t < 70; t += 2) {
      g.step(2);
      const S = g.state();
      out.push(t + 2 + ' ' + S.bots.filter((b) => b.role === 'bed' || b.role === 'high').map((b) => `${b.name}/${b.role}/${b.brainState}/${b.state} ${b.pos.map((v) => v.toFixed(1)).join(',')} hp${b.hp.toFixed(0)}${b.dead ? ' DEAD' : ''}`).join(' | '));
    }
    return out;
  });
  r.forEach((l) => console.log(l)); console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
