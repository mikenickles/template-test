// Round 3 re-check: early (first 20 s) long-range (over 50 u) kills on the east side from feel_r3b_matches.json (and the old run for comparison),
// by difficulty, side and weapon, with the shooter and victim positions grouped into spots.
const fs = require('fs');
const dir = process.env.FEEL_OUT || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad';
for (const f of ['feel_r3_matches.json', 'feel_r3b_matches.json']) { if (!fs.existsSync(dir + '/' + f)) continue;
  const all = JSON.parse(fs.readFileSync(dir + '/' + f)); console.log('\n#', f);
  for (const d of ['recruit', 'regular', 'veteran']) { const M = all.filter((m) => m.difficulty === d), R = M.flatMap((m) => m.rounds.filter((r) => r.end));
    const K = R.flatMap((r) => r.kills).filter((k) => k.t < 20 && k.kPos && k.vPos && k.dist > 50 && (k.kPos[0] > 78 || k.vPos[0] > 78) && Math.max(k.kPos[0], k.vPos[0]) > 78);
    const by = (fn) => JSON.stringify(K.reduce((o, k) => (o[fn(k)] = (o[fn(k)] || 0) + 1, o), {}));
    console.log(d.padEnd(8), 'rounds', R.length, 'early long east kills', K.length, '(' + (K.length / R.length).toFixed(2) + '/round)', 'by killer side', by((k) => k.killerTeam), 'weapon', by((k) => k.weapon));
    const spot = (p) => (p[1] > 20 ? 'desk/shelf y' + Math.round(p[1]) : 'floor') + ' x' + Math.round(p[0] / 5) * 5 + ' z' + Math.round(p[2] / 10) * 10;
    console.log('         shooter spots', by((k) => k.killerTeam[0] + ' ' + spot(k.kPos)).slice(0, 600));
  } }
