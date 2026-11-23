// Round 2: live CONFIG trials (nothing written to index.html). Same duel code as feel_r2_ttk.cjs.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = 30;
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2_lib.js', 'utf8') });
  const r = await h.page.evaluate((N) => {
    const G = __game, C = G.CONFIG, out = {}; const spots = {}; for (const d of [10, 20, 30, 60]) spots[d] = R2.findSpot(d);
    const cell = (weapon, d, o) => { const ks = []; let kills = 0, shots = 0, hits = 0; for (let i = 0; i < N; i++) { const r = R2.duel(Object.assign({ weapon, spot: spots[d], zone: 'body', stance: 'stand', comp: true, maxT: 6 }, o)); shots += r.shots; hits += r.hits; if (r.killT !== null) { kills++; ks.push(r.killT); } }
      return (R2.med(ks) === null ? '--' : R2.med(ks).toFixed(2)) + 's/' + Math.round(100 * kills / N) + '%/hit' + Math.round(100 * hits / Math.max(1, shots)); };
    const save = JSON.parse(JSON.stringify(C.weapons)), saveGun = JSON.parse(JSON.stringify(C.gun));
    const restore = () => { for (const k in save) Object.assign(C.weapons[k], JSON.parse(JSON.stringify(save[k]))); Object.assign(C.gun, JSON.parse(JSON.stringify(saveGun))); };
    // ---- A. SMG against rifle up close
    const smgRow = () => ({ '10 stand spray': cell('smg', 10, {}), '10 move spray': cell('smg', 10, { stance: 'move' }), '20 stand spray': cell('smg', 20, {}), '20 move spray': cell('smg', 20, { stance: 'move' }), '30 stand b5': cell('smg', 30, { burst: 5 }), '60 crouch b5': cell('smg', 60, { burst: 5, stance: 'crouch' }) });
    out['A rifle (reference)'] = { '10 stand spray': cell('rifle', 10, {}), '10 move spray': cell('rifle', 10, { stance: 'move' }), '20 stand spray': cell('rifle', 20, {}), '20 move spray': cell('rifle', 20, { stance: 'move' }), '30 stand b3': cell('rifle', 30, { burst: 3 }), '60 crouch b3': cell('rifle', 60, { burst: 3, stance: 'crouch' }) };
    out['A smg now (16 dmg, spread 1.4, bloom 0.30)'] = smgRow();
    Object.assign(C.weapons.smg, { damage: 20 }); out['A smg damage 20'] = smgRow();
    Object.assign(C.weapons.smg, { damage: 20, spread: 1.0, bloom: 0.2, spreadMax: 3.5 }); out['A smg damage 20, spread 1.0, bloom 0.2, max 3.5'] = smgRow();
    Object.assign(C.weapons.smg, { damage: 18, spread: 1.0, bloom: 0.2, spreadMax: 3.5 }); out['A smg damage 18, spread 1.0, bloom 0.2, max 3.5'] = smgRow();
    restore();
    // global move multiplier is shared, so also try it
    C.gun.spreadMult.move = 1.2; out['A (gun.spreadMult.move 1.2) smg now'] = { '10 move': cell('smg', 10, { stance: 'move' }), '20 move': cell('smg', 20, { stance: 'move' }) }; out['A (gun.spreadMult.move 1.2) rifle'] = { '10 move': cell('rifle', 10, { stance: 'move' }), '20 move': cell('rifle', 20, { stance: 'move' }), '30 move b3': cell('rifle', 30, { stance: 'move', burst: 3 }) }; restore();
    // ---- B. recoil return: bursts and taps with NO correction by the player
    const recRow = () => ({ 'rifle b3 30': cell('rifle', 30, { burst: 3, comp: false }), 'rifle tap 30': cell('rifle', 30, { burst: 1, comp: false }), 'rifle tap 60': cell('rifle', 60, { burst: 1, comp: false }), 'pistol paced 30': cell('pistol', 30, { burst: 1, comp: false }), 'smg b5 20': cell('smg', 20, { burst: 5, comp: false }) });
    for (const v of [0.6, 0.8, 1.0]) { C.gun.recoilReturn = v; out['B no correction, recoilReturn ' + v] = recRow(); } restore();
    // ---- C. pistol against rifle at range, and pistol pacing
    const pisRow = () => ({ 'spam 10': cell('pistol', 10, {}), 'spam 30': cell('pistol', 30, {}), 'paced 30': cell('pistol', 30, { burst: 1 }), 'paced 60': cell('pistol', 60, { burst: 1 }), 'rifle tap 60 (ref)': cell('rifle', 60, { burst: 1 }) });
    out['C pistol now (spread 0.35, bloom 0.9, delay 0.25, falloff 40/90/0.7)'] = pisRow();
    Object.assign(C.weapons.pistol, { bloom: 0.6, recoverDelay: 0.12 }); out['C pistol bloom 0.6, recoverDelay 0.12'] = pisRow();
    Object.assign(C.weapons.pistol, { spread: 0.6, bloom: 0.6, recoverDelay: 0.12, falloff: [30, 70, 0.5] }); out['C pistol spread 0.6, bloom 0.6, delay 0.12, falloff 30/70/0.5'] = pisRow(); restore();
    return out;
  }, N);
  for (const k in r) { console.log('\n' + k); for (const c in r[k]) console.log('   ' + c.padEnd(22) + r[k][c]); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
