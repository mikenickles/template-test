// Round 2 re-check: time to kill a 100 hp dummy, body aim, with the game's real spread and recoil.
// comp = aim put back on the target every tick (perfect recoil control); nocomp = aim once, never corrected.
// stance move = strafing left/right, switching every 0.5 s. Usage: node feel_r2b_ttk.cjs [trials] [distances comma list]
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 40);
const DISTS = (process.argv[3] || '10,20,40,60').split(',').map(Number);
const MODES = [['rifle', 'spray', 0], ['rifle', 'b3', 3], ['rifle', 'tap', 1], ['smg', 'spray', 0], ['smg', 'b5', 5], ['pistol', 'spam', 0], ['pistol', 'paced', 1]];
const CELLS = [['body', 'stand', true], ['body', 'move', true], ['body', 'crouch', true], ['body', 'stand', false], ['head', 'stand', true]];
(async () => {
  const t0 = Date.now();
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2b_lib.js', 'utf8') });
  const spots = await h.page.evaluate((D) => { const o = {}; for (const d of D) o[d] = R2B.findSpot(d); return o; }, DISTS);
  console.log('spots', JSON.stringify(spots));
  const rows = [];
  for (const d of DISTS) { if (!spots[d]) { console.log('no spot for', d); continue; }
    for (const [weapon, mode, burst] of MODES) for (const [zone, stance, comp] of CELLS) {
      if (!comp && burst === 0 && weapon !== 'pistol') { /* spray without correction: keep */ }
      const r = await h.page.evaluate(([spot, weapon, N, burst, zone, stance, comp]) => {
        const ks = []; let kills = 0, shots = 0, hits = 0;
        for (let i = 0; i < N; i++) { const r = R2B.duel({ weapon, spot, zone, stance, comp, burst, maxT: 6 }); shots += r.shots; hits += r.hits; if (r.killT !== null) { kills++; ks.push(r.killT); } }
        const s = ks.slice().sort((a, b) => a - b);
        return { killPct: Math.round(100 * kills / N), med: R2B.med(ks), p25: s.length ? s[Math.floor(s.length / 4)] : null, p75: s.length ? s[Math.floor(3 * s.length / 4)] : null, hitPct: Math.round(100 * hits / Math.max(1, shots)) };
      }, [spots[d], weapon, N, burst, zone, stance, comp]);
      rows.push({ d, weapon, mode, cell: zone + '/' + stance + '/' + (comp ? 'comp' : 'nocomp'), ...r });
    }
    console.log('done', d, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  fs.writeFileSync(require('path').join(process.env.FEEL_OUT || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad', 'feel_r2b_ttk.json'), JSON.stringify(rows));
  const f = (v) => (v === null || v === undefined ? ' -- ' : v.toFixed(2));
  for (const [zone, stance, comp] of CELLS) { const cell = zone + '/' + stance + '/' + (comp ? 'comp' : 'nocomp');
    console.log('\n== ' + cell + '  median s (25-75 %) kill% hit%');
    for (const [weapon, mode] of MODES) { const rr = rows.filter((r) => r.weapon === weapon && r.mode === mode && r.cell === cell);
      console.log((weapon + ' ' + mode).padEnd(13) + rr.map((r) => (r.d + 'u ' + f(r.med) + ' (' + f(r.p25) + '-' + f(r.p75) + ') ' + r.killPct + '% h' + r.hitPct).padEnd(34)).join('')); }
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
