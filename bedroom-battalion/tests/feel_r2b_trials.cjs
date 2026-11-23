// Round 2 re-check: live CONFIG trials for the SMG (nothing written to index.html). Same duel code as feel_r2b_ttk.cjs.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 40);
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2b_lib.js', 'utf8') });
  const r = await h.page.evaluate((N) => {
    const G = __game, C = G.CONFIG, out = {}, spots = {}; for (const d of [10, 20, 30, 40]) spots[d] = R2B.findSpot(d);
    const cell = (weapon, d, o) => { const ks = []; let kills = 0; for (let i = 0; i < N; i++) { const r = R2B.duel(Object.assign({ weapon, spot: spots[d], zone: 'body', stance: 'stand', comp: true, maxT: 6 }, o)); if (r.killT !== null) { kills++; ks.push(r.killT); } }
      return (R2B.med(ks) === null ? '--' : R2B.med(ks).toFixed(2)) + (kills < N ? '/' + Math.round(100 * kills / N) + '%' : ''); };
    const row = (w, b) => ({ '10 st': cell(w, 10, {}), '10 mv': cell(w, 10, { stance: 'move' }), '10 head': cell(w, 10, { zone: 'head' }), '20 st': cell(w, 20, {}), '20 mv': cell(w, 20, { stance: 'move' }), '20 nocomp': cell(w, 20, { comp: false }), '30 st burst': cell(w, 30, { burst: b }), '30 mv burst': cell(w, 30, { burst: b, stance: 'move' }), '40 st burst': cell(w, 40, { burst: b }) });
    const save = JSON.parse(JSON.stringify(C.weapons.smg)); const restore = () => Object.assign(C.weapons.smg, JSON.parse(JSON.stringify(save)));
    out['rifle (reference, b3)'] = row('rifle', 3);
    out['smg now (20 dmg, 900 rpm)'] = row('smg', 5);
    C.weapons.smg.damage = 25; out['smg damage 25'] = row('smg', 5); restore();
    C.weapons.smg.interval = 60 / 1100; out['smg 1100 rpm'] = row('smg', 5); restore();
    C.weapons.smg.damage = 25; C.weapons.smg.falloff = [20, 60, 0.4]; out['smg damage 25, falloff 20/60/0.4'] = row('smg', 5); restore();
    return out;
  }, N);
  const cols = Object.keys(r[Object.keys(r)[0]]);
  console.log(''.padEnd(36) + cols.map((c) => c.padEnd(12)).join(''));
  for (const k in r) console.log(k.padEnd(36) + cols.map((c) => String(r[k][c]).padEnd(12)).join(''));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
