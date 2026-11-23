// How much does the chair back block the desk's view, and what would a higher slat (panel y 28..33 instead of 22..33) give?
// The collider is changed in this browser session only, for the sightline maths; index.html is not touched.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_los.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const cb = __game.colliders.find((c) => c.id === 'chair.back'); const out = {};
    const eyes = { 'desk west edge mid (95.6,27.6,80)': [95.6, 27.6, 80], 'desk centre m.desk (97.5,27.6,80)': [97.5, 27.6, 80], 'desk west edge north (95.6,27.6,60)': [95.6, 27.6, 60] };
    for (const y0 of [22, 26, 28]) { cb.y0 = y0; for (const n in eyes) { const v = LOS.view(eyes[n]); out['panel bottom y=' + y0 + ' | ' + n] = { floorSeenPct: v.chestVisiblePct, west: v.west, centre: v.centre, east: v.east }; } }
    cb.y0 = 22;
    return out;
  });
  for (const k in r) console.log(k.padEnd(62), JSON.stringify(r[k]));
  await h.browser.close();
})();
