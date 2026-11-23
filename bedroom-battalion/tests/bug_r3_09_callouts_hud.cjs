// Round 3: callouts (at most one per bot per 4 s, three on screen, Green bots only, texts from 16.4) and the HUD kill feed
// (last five, 5 s each) over two autoplay matches stepped tick by tick. Usage: node bug_r3_09_callouts_hud.cjs
const { boot } = require('./bug_r3_lib.cjs');
const TEXTS = ['Enemy on the bed', 'Enemy under the bed', 'Enemy on the desk', 'Enemy on the chair', 'Enemy on the tall shelf', 'Enemy on the small shelf', 'Enemy on the train', 'Enemy at the ruin', 'Enemy at their fort', 'Enemy west lane', 'Enemy centre', 'Enemy east lane', "I'm hit", 'Enemy down', "I'm down", 'Last one'];
(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((TEXTS) => {
    const G = __game, DT = 1 / 60, r = { callouts: 0, tooSoon: [], notGreen: [], badText: {}, maxOnScreen: 0, feedMaxShown: 0, feedOld: 0, texts: {} };
    for (const seed of [11, 12]) {
      G.startMatch({ difficulty: 'regular', seed, autoplay: true }); G.setTimeScale(0);
      let seen = G.callouts.length; const last = {};
      const names = Object.fromEntries(G.state().bots.map((b) => [b.name, b.team]));
      for (let i = 0; i < 60 * 2600 && G.state().match.phase !== 'matchEnd'; i++) {
        G.step(DT);
        const C = G.callouts; if (C.length < seen) seen = 0;
        for (const c of C.slice(seen)) {
          r.callouts++; r.texts[c.text] = (r.texts[c.text] || 0) + 1;
          if (!TEXTS.includes(c.text)) r.badText[c.text] = (r.badText[c.text] || 0) + 1;
          if (names[c.who] !== 'green') r.notGreen.push(c);
          if (last[c.who] !== undefined && c.time - last[c.who] < 4 - 1e-6 && r.tooSoon.length < 6) r.tooSoon.push({ who: c.who, gap: +(c.time - last[c.who]).toFixed(2), text: c.text });
          last[c.who] = c.time;
        }
        seen = C.length;
        if (i % 30 === 0) {
          const shown = document.querySelectorAll('#callouts > *').length; r.maxOnScreen = Math.max(r.maxOnScreen, shown);
          const feed = document.querySelectorAll('#feed > *').length; r.feedMaxShown = Math.max(r.feedMaxShown, feed);
        }
      }
    }
    return r;
  }, TEXTS);
  console.log(JSON.stringify(out));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
