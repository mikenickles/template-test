// Round 2: time to kill per weapon, range, zone, stance and trigger discipline, with the game's real spread and recoil.
// "comp" = the aim is put back on the target every tick (a perfect player). "nocomp" = aim once, never correct for recoil.
// Fire modes: spray (hold, or click at the fastest rate), b3 = 3-shot bursts, tap = single shots; bursts and taps wait for the spread to settle.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 30);
const MODES = { rifle: [['spray', 0], ['b3', 3], ['tap', 1]], smg: [['spray', 0], ['b5', 5]], pistol: [['spam', 0], ['paced', 1]], sniper: [['scoped', 0]], sniper_noscope: [['noscope', 0]] };
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2_lib.js', 'utf8') });
  const spots = await h.page.evaluate(() => { const o = {}; for (const d of [10, 30, 60, 100, 125]) o[d] = R2.findSpot(d); return o; });
  console.log('spots', JSON.stringify(spots));
  const rows = [];
  for (const d of Object.keys(spots)) { if (!spots[d]) continue;
    for (const weapon in MODES) for (const [mode, burst] of MODES[weapon]) {
      const r = await h.page.evaluate(([spot, weapon, N, burst]) => {
        const out = {}; const w = weapon.replace('_noscope', ''), scoped = weapon === 'sniper';
        for (const zone of ['body', 'head']) for (const stance of ['stand', 'crouch', 'move']) for (const comp of [true, false]) {
          if (!comp && (stance !== 'stand' || burst)) continue;
          const ks = [], sh = []; let kills = 0, shots = 0, hits = 0;
          for (let i = 0; i < N; i++) { const r = R2.duel({ weapon: w, spot, zone, stance, comp, scoped, burst, maxT: 6 }); shots += r.shots; hits += r.hits; if (r.killT !== null) { kills++; ks.push(r.killT); sh.push(r.shots); } }
          out[zone + '/' + stance + '/' + (comp ? 'comp' : 'nocomp')] = { killPct: Math.round(100 * kills / N), ttkMed: R2.med(ks) === null ? null : +R2.med(ks).toFixed(2), shotsMed: R2.med(sh), hitPct: Math.round(100 * hits / Math.max(1, shots)) };
        }
        return out;
      }, [spots[d], weapon, N, burst]);
      for (const k in r) rows.push({ d: +d, weapon, mode, cell: k, ...r[k] });
    } console.log('done', d); }
  fs.writeFileSync(__dirname + '/feel_r2_ttk.json', JSON.stringify(rows));
  for (const cell of ['body/stand/comp', 'body/crouch/comp', 'body/move/comp', 'head/stand/comp', 'head/crouch/comp', 'body/stand/nocomp']) {
    console.log('\n== ' + cell + '  (median s from first shot to kill, kill % inside 6 s, median shots, hit %)');
    for (const weapon in MODES) for (const [mode] of MODES[weapon]) { const rr = rows.filter((r) => r.weapon === weapon && r.mode === mode && r.cell === cell); if (!rr.length) continue;
      console.log((weapon.replace('_noscope', '') + ' ' + mode).padEnd(16) + rr.map((r) => (r.d + 'u ' + (r.ttkMed === null ? ' -- ' : r.ttkMed.toFixed(2)) + 's ' + r.killPct + '% ' + (r.shotsMed || '-') + 'sh ' + r.hitPct + '%').padEnd(28)).join('')); }
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
