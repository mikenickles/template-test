// Round 3: summarise feel_r3_matches.json (pacing, lanes, train, callouts, behaviour, balance) per difficulty.
const fs = require('fs');
const IN = process.argv[2] || ((process.env.FEEL_OUT || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad') + '/feel_r3_matches.json');
const all = JSON.parse(fs.readFileSync(IN, 'utf8'));
const med = (a) => { a = a.filter((x) => x !== null && x !== undefined); if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
for (const diff of ['recruit', 'regular', 'veteran', 'all']) {
  const M = all.filter((m) => diff === 'all' || m.difficulty === diff); if (!M.length) continue;
  const R = M.flatMap((m) => m.rounds.filter((r) => r.end)); const K = R.flatMap((r) => r.kills);
  console.log(`\n===== ${diff}: ${M.length} matches, ${R.length} rounds`);
  const w = { green: 0, tan: 0 }; M.forEach((m) => w[m.rep.winner] = (w[m.rep.winner] || 0) + 1);
  const rw = { green: 0, tan: 0, null: 0 }; R.forEach((r) => rw[r.end.winner] = (rw[r.end.winner] || 0) + 1);
  console.log('matches won green/tan', w.green, w.tan, '| rounds won green/tan/replay', rw.green, rw.tan, rw.null);
  const dur = R.map((r) => r.end.duration); const full = R.filter((r) => r.end.reason !== 'eliminated').length;
  console.log('round length median', med(dur), 's; ran to time (not eliminated):', full, pct(full, R.length), '| reasons', JSON.stringify(R.reduce((o, r) => (o[r.end.reason] = (o[r.end.reason] || 0) + 1, o), {})));
  console.log('first engage median', med(R.map((r) => r.firstEngage)), 's; first shot', med(R.map((r) => r.firstShot)), 's; first kill', med(R.map((r) => r.firstKill)), 's; longest gap without a shot median', med(R.map((r) => r.maxGap)), 's; rounds with a 40 s+ silent stretch', R.filter((r) => r.maxGap >= 40).length);
  const kt = K.map((k) => k.t); const bins = [0, 15, 30, 40, 60, 90, 120, 150]; console.log('kills by time in round:', bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}s ${K.filter((k) => k.t >= b && k.t < bins[i + 1]).length}`).join('  '));
  const st = M.reduce((o, m) => { const s = m.rep.stats; o.shots += s.shots.green + s.shots.tan; o.hits += s.hits; o.kills += s.kills; o.head += s.headKills; o.gren += s.grenades.green + s.grenades.tan; o.rides += s.rides.green + s.rides.tan; o.rideTries += s.rideTries; o.cross += s.crossings.green + s.crossings.tan; return o; }, { shots: 0, hits: 0, kills: 0, head: 0, gren: 0, rides: 0, rideTries: 0, cross: 0 });
  console.log(`hit rate ${pct(st.hits, st.shots)} (${st.hits}/${st.shots}); headshot kills ${pct(st.head, st.kills)}; grenades/match ${(st.gren / M.length).toFixed(1)}; rides/match ${(st.rides / M.length).toFixed(1)} (tries ${(st.rideTries / M.length).toFixed(1)}); crossings/match ${(st.cross / M.length).toFixed(0)}`);
  const kd = K.filter((k) => k.dist !== null).map((k) => k.dist); console.log('kill distance median', med(kd), '| <15u', pct(kd.filter((d) => d < 15).length, kd.length), '15-40u', pct(kd.filter((d) => d >= 15 && d < 40).length, kd.length), '40-80u', pct(kd.filter((d) => d >= 40 && d < 80).length, kd.length), '80u+', pct(kd.filter((d) => d >= 80).length, kd.length));
  console.log('kills by weapon', JSON.stringify(K.reduce((o, k) => (o[k.weapon] = (o[k.weapon] || 0) + 1, o), {})));
  // lanes: kills by the victim's lane, split by killer team
  const lanes = ['west', 'bed', 'centre', 'east', 'desk', 'shelf']; console.log('kills by victim lane (green kills / tan kills):', lanes.map((l) => `${l} ${K.filter((k) => k.vLane === l && k.killerTeam === 'green').length}/${K.filter((k) => k.vLane === l && k.killerTeam === 'tan').length}`).join('  '));
  console.log('kills by killer role (green/tan):', ['west', 'bed', 'centre', 'high', 'east'].map((r) => `${r} ${K.filter((k) => k.killerRole === r && k.killerTeam === 'green').length}/${K.filter((k) => k.killerRole === r && k.killerTeam === 'tan').length}`).join('  '));
  // early sniper trades in the east
  const early = K.filter((k) => k.t < 15); console.log('kills in the first 15 s of live:', early.length, 'of', K.length, '| by sniper', early.filter((k) => k.weapon === 'sniper').length, '| killer high role', early.filter((k) => k.killerRole === 'high').length, '| examples', JSON.stringify(early.slice(0, 4).map((k) => [k.t, k.weapon, k.killerRole, k.kPos, k.vPos])));
  const lu = M.reduce((o, m) => { for (const t of ['green', 'tan']) for (const k in m.rep.laneUse[t]) o[t][k] = (o[t][k] || 0) + m.rep.laneUse[t][k]; return o; }, { green: {}, tan: {} });
  for (const t of ['green', 'tan']) { const tot = Object.values(lu[t]).reduce((a, b) => a + b, 0); console.log('laneUse', t, Object.keys(lu[t]).map((k) => `${k} ${pct(lu[t][k], tot)}`).join(' ')); }
  // train
  const sg = M.reduce((o, m) => { o.clear += m.sight.clear; o.train += m.sight.train; o.stat += m.sight.stat; return o; }, { clear: 0, train: 0, stat: 0 });
  console.log(`sightlines sampled ${sg.clear + sg.train + sg.stat}: clear ${pct(sg.clear, sg.clear + sg.train + sg.stat)}, blocked by train ${pct(sg.train, sg.clear + sg.train + sg.stat)}, by static ${pct(sg.stat, sg.clear + sg.train + sg.stat)}; train share of non-static blocks ${pct(sg.train, sg.clear + sg.train)}`);
  console.log('kills with killer or victim within 9 u of a car', pct(K.filter((k) => k.nearTrain).length, K.length));
  // behaviour
  const b = M.reduce((o, m) => { o.s += m.beh.samples; o.c += m.beh.crouch; o.h += m.beh.high; o.r += m.beh.riding; for (const k in m.beh.states) o.st[k] = (o.st[k] || 0) + m.beh.states[k]; return o; }, { s: 0, c: 0, h: 0, r: 0, st: {} });
  console.log('bot samples', b.s, 'crouched', pct(b.c, b.s), 'on high ground', pct(b.h, b.s), 'riding', pct(b.r, b.s), '| states', Object.keys(b.st).sort((x, y) => b.st[y] - b.st[x]).map((k) => `${k} ${pct(b.st[k], b.s)}`).join(' '));
  // callouts
  const c = M.reduce((o, m) => { o.n += m.co.n; o.e += m.co.enemyRegion; o.ok += m.co.ok; o.w += m.co.wrong; for (const k in m.co.byText) o.t[k] = (o.t[k] || 0) + m.co.byText[k]; o.ex.push(...m.co.wrongEx); return o; }, { n: 0, e: 0, ok: 0, w: 0, t: {}, ex: [] });
  const live = R.reduce((a, r) => a + r.end.duration, 0) / 60;
  console.log(`callouts ${c.n} (${(c.n / live).toFixed(1)} per live minute); enemy-region callouts right ${pct(c.ok, c.e)}, wrong ${c.w}; examples ${JSON.stringify(c.ex.slice(0, 4))}`);
  console.log('callout texts', JSON.stringify(Object.keys(c.t).sort((x, y) => c.t[y] - c.t[x]).map((k) => k + ' ' + c.t[k])));
  const stuck = M.reduce((a, m) => a + m.rep.stuckLog.length, 0), resc = M.reduce((a, m) => a + m.rep.trainRescueLog.length, 0); console.log('stuckLog', stuck, 'trainRescueLog', resc);
}
