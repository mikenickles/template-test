// Re-check: the damage-free way down the bear (bed 18 -> head 15 -> body 9 -> legs 3 -> floor) at the new air control.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, out = {};
    const paths = { 'sprint straight north over head': [[10, 15, 43, 1.5], [10, 0, 24, 3]], 'sprint, via body ledge then legs': [[10, 15, 43, 1.5], [10, 9, 36.2, 1.2], [13.5, 3, 31, 1.5], [13.5, 0, 25, 2]],
                    'sprint, off the head sideways onto body east ledge': [[10, 15, 41, 1.5], [15, 9, 41, 1.2], [20, 0, 41, 2.5]] };
    for (const k in paths) for (const sprint of [true, false]) { G.clearInput(); G.teleport(60, 0, 20); G.step(1 / 60); const b = G.damageLog.length;
      const run = FEEL.drive([10, 18, 50], paths[k], { sprint, maxT: 20 }); out[k.replace('sprint', sprint ? 'sprint' : 'walk')] = { ok: run.ok, time: run.time, damage: G.damageLog.slice(b).map((d) => Math.round(d.amount)), end: run.end }; }
    return out;
  });
  for (const k in r) console.log(k.padEnd(52), JSON.stringify(r[k]));
  await h.browser.close();
})();
