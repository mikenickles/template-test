// What each high place can see (and so how exposed it is): % of open floor where a standing soldier's chest is in line of sight.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_los.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const P = {
      'floor: green gate (60,0,28)':        [60, 0, 28],
      'floor: mid (60,0,66)':               [60, 0, 66],
      'floor: west lane (38,0,70)':         [38, 0, 70],
      'floor: east lane (83,0,60)':         [83, 0, 60],
      'ruin platform (60,1.2,78)':          [60, 1.2, 78],
      'fort tower green (70.5,7,11.5)':     [70.5, 7, 11.5],
      'tunnel top (77,8,80)':               [77, 8, 80],
      'bed east edge mid (34.4,18,80)':     [34.4, 18, 80],
      'bed 3 back from edge (31.5,18,80)':  [31.5, 18, 80],
      'bed north end (26,18,45.6)':         [26, 18, 45.6],
      'bed south end (26,18,114.4)':        [26, 18, 114.4],
      'bed ridge R2 crest (17,20.4,80)':    [17, 20.4, 80],
      'chair seat west edge (86.8,17,80)':  [86.8, 17, 80],
      'desk west edge mid (95.6,26,80)':    [95.6, 26, 80],
      'desk west edge north (95.6,26,60)':  [95.6, 26, 60],
      'desk west edge south (95.6,26,100)': [95.6, 26, 100],
      'desk north edge (104,26,55.6)':      [104, 26, 55.6],
      'desk 3 back from edge (98.5,26,60)': [98.5, 26, 60],
      'small shelf L1 edge (108.6,20,24)':  [108.6, 20, 24],
      'small shelf L2 top edge (108.6,40,24)': [108.6, 40, 24],
      'tall shelf L1 edge (108.6,20,136)':  [108.6, 20, 136],
      'tall shelf L2 edge (108.6,40,136)':  [108.6, 40, 136],
      'tall shelf L3 top edge (108.6,60,140)': [108.6, 60, 140],
      'tall shelf L3 3 back (111.5,60,140)':   [111.5, 60, 140],
    };
    const out = {};
    const keyTargets = { greenGate: [60, 1.0, 28], greenWDoor: [44.5, 1.0, 17], greenEDoor: [75.5, 1.0, 17], tanGate: [60, 1.0, 132], tanWDoor: [44.5, 1.0, 143], tanEDoor: [75.5, 1.0, 143], ruinPlat: [60, 2.2, 78],
      bedMid: [27, 19, 80], deskMid: [100, 27, 80], smallTop: [110.5, 41, 24], tallTop: [110.5, 61, 136], padW: [38, 1, 80] };
    for (const n in P) { const p = P[n], e = [p[0], p[1] + 1.6, p[2]]; const v = LOS.view(e); const sees = []; for (const k in keyTargets) if (!LOS.blocked(e, keyTargets[k])) sees.push(k); v.sees = sees.join(','); out[n] = v; }
    return out;
  });
  console.log('place'.padEnd(40), 'chest%  head%   W   C   E   Nhalf Shalf   sees');
  for (const n in r) { const v = r[n]; console.log(n.padEnd(40), String(v.chestVisiblePct).padStart(5), String(v.headVisiblePct).padStart(6), String(v.west).padStart(5), String(v.centre).padStart(3), String(v.east).padStart(3), String(v.northHalf).padStart(6), String(v.southHalf).padStart(5), '  ', v.sees); }
  await h.browser.close();
})();
