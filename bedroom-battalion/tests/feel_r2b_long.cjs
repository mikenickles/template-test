// Round 2 re-check (copy of feel_r2_long.cjs): long range (80 to 150 units) from the perches and the floor. Which far dummies can be seen from where, and who wins out there.
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = 30;
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r2b_lib.js', 'utf8') });
  const perches = { 'desk N edge': [96, 26, 60], 'desk S edge': [96, 26, 100], 'bed E edge mid': [34, 18, 76], 'bed N end': [26, 18, 46.5], 'tall shelf L3': [109, 60, 144], 'small shelf L2': [109, 40, 22], 'green tower': [70.5, 7, 11.5], 'green gate floor': [60, 0, 28], 'floor NW (42,0,10)': [42, 0, 10] };
  const vis = await h.page.evaluate((perches) => {
    const out = {}; const G = __game;
    for (const n in perches) { const p = perches[n], e = [p[0], p[1] + 1.6, p[2]], row = [];
      for (const t of R2B.st().targets) { const see = (ty) => { const r = G.raycast(e, [t.pos[0] - e[0], t.pos[1] + ty - e[1], t.pos[2] - e[2]]); return r && r.id === t.id; };
        const d = Math.hypot(t.pos[0] - e[0], t.pos[1] + 0.75 - e[1], t.pos[2] - e[2]); const b = see(0.75), hd = see(1.575); if (b || hd) row.push({ id: t.id, d: +d.toFixed(0), body: b, head: hd }); }
      out[n] = row; }
    return out;
  }, perches);
  for (const n in vis) console.log(n.padEnd(20), vis[n].length + ' of 21 dummies in view;', 'beyond 80 u:', vis[n].filter((v) => v.d >= 80).map((v) => v.id.replace('target.', '#') + '@' + v.d + (v.body ? '' : '(head only)')).join(' '));
  // duels at long range: pick for each perch its farthest fully visible dummy
  const rows = [];
  for (const n in vis) { const far = vis[n].filter((v) => v.body && v.head).sort((a, b) => b.d - a.d)[0]; if (!far || far.d < 80) continue;
    const r = await h.page.evaluate(([p, id, d, N]) => {
      const G = __game, out = {}; const t = R2B.tgt(id);
      const run = (weapon, burst, scoped, zone) => { const ks = []; let kills = 0, shots = 0, hits = 0;
        for (let i = 0; i < N; i++) { G.clearInput(); G.resetTargets(); G.give('ammo'); G.teleport(p[0], p[1], p[2]); G.selectWeapon(weapon); G.step(1);
          const W = G.CONFIG.weapons[weapon], ty = zone === 'head' ? 1.575 : 0.75; const aim = () => G.lookAt(t.pos[0], t.pos[1] + ty, t.pos[2]); aim();
          if (scoped) { G.setInput({ scope: true }); G.step(0.35); }
          let tick = 0, tt = 0, first = null, lastTime = G.shotLog.length ? G.shotLog[G.shotLog.length - 1].time : -1, inB = 0, want = true, killT = null;
          while (tick < 480) { aim(); const sp = R2B.st().weapon.spread, base = scoped ? W.scopedSpread : W.spread;
            if (burst) { if (inB >= burst) { want = false; if (sp <= base + 0.02) inB = 0; } else want = true; }
            G.setInput({ fire: W.auto ? want : want && tick % 2 === 0 }); G.step(1 / 60); tt += 1 / 60; tick++;
            const e = G.shotLog[G.shotLog.length - 1]; if (e && e.time !== lastTime) { lastTime = e.time; shots++; inB++; if (first === null) first = tt; if (e.hit === id) hits++; }
            if (R2B.tgt(id).down) { killT = tt - first; break; } }
          G.clearInput(); if (killT !== null) { kills++; ks.push(killT); } }
        return (R2B.med(ks) === null ? '--' : R2B.med(ks).toFixed(2)) + 's ' + Math.round(100 * kills / N) + '% hit ' + Math.round(100 * hits / Math.max(1, shots)) + '%'; };
      out['sniper scoped body'] = run('sniper', 0, true, 'body'); out['sniper scoped head'] = run('sniper', 0, true, 'head');
      out['rifle tap body'] = run('rifle', 1, false, 'body'); out['rifle b3 body'] = run('rifle', 3, false, 'body'); out['rifle tap head'] = run('rifle', 1, false, 'head');
      out['pistol paced body'] = run('pistol', 1, false, 'body'); out['smg b5 body'] = run('smg', 5, false, 'body'); out['pistol spam body'] = run('pistol', 0, false, 'body'); out['rifle tap crouch-free head'] = run('rifle', 1, false, 'head');
      return out;
    }, [perches[n], far.id, far.d, N]);
    console.log('\n' + n + ' -> ' + far.id + ' at ' + far.d + ' u (median s to kill, kill % inside 8 s, hit %)'); for (const k in r) console.log('   ' + k.padEnd(20) + r[k]);
  }
  // scoped and unscoped pictures of the farthest dummy from three perches
  for (const [n, file] of [['desk N edge', 'desk'], ['bed E edge mid', 'bed'], ['tall shelf L3', 'tallshelf'], ['green tower', 'tower']]) {
    const far = vis[n].filter((v) => v.body && v.head).sort((a, b) => b.d - a.d)[0]; if (!far) continue;
    for (const scoped of [false, true]) {
      await h.page.evaluate(([p, id, scoped]) => { const G = __game, t = R2B.tgt(id); G.clearInput(); G.resetTargets(); G.teleport(p[0], p[1], p[2]); G.selectWeapon('sniper'); G.step(1); G.lookAt(t.pos[0], t.pos[1] + 1.0, t.pos[2]); if (scoped) { G.setInput({ scope: true }); G.step(0.4); } G.render(); }, [perches[n], far.id, scoped]);
      await h.shot('round2/feel_re_long_' + file + '_' + far.d + 'u_' + (scoped ? 'scoped' : 'hip') + '.png'); }
  }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
