// A/B: balance on regular seeds 100..105 with a live CONFIG override (key=value pairs on the command line).
const { launch } = require('./harness.cjs');
const sets = process.argv.slice(2);
(async () => {
  const { browser, page } = await launch({ width: 640, height: 360 });
  for (const set of sets.length ? sets : ['none']) {
    const r = await page.evaluate((set) => {
      const C = __game.CONFIG, wins = { green: 0, tan: 0 }, sc = [];
      if (set !== 'none') for (const kv of set.split(',')) { const [k, v] = kv.split('='); const path = k.split('.'); let o = C; while (path.length > 1) o = o[path.shift()]; o[path[0]] = +v; }
      for (let s = 100; s < 106; s++) { __game.setTimeScale(0); const m = __game.runMatch({ difficulty: 'regular', seed: s, autoplay: true }); wins[m.winner]++; sc.push(m.score.green + '-' + m.score.tan); }
      return { set, wins, sc };
    }, set);
    console.log(JSON.stringify(r));
  }
  await browser.close();
})();
