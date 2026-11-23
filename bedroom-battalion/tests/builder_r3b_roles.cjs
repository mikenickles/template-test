// Round 3B: kills and deaths per role and team over many autoplay matches (where does one side gain?). Note: roles are per
// round but the report keeps each soldier's last role, so this is per final role; deaths by region come from the kill list.
const { launch } = require('./harness.cjs');
const diff = process.argv[2] || 'regular', n = +(process.argv[3] || 12), base = +(process.argv[4] || 300);
(async () => {
  const { browser, page } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(([diff, n, base]) => {
    const g = __game, roleKD = {}, deathWhere = { green: {}, tan: {} }, killWeapon = { green: {}, tan: {} };
    // record each death's region and the victim's role at the time
    let wins = { green: 0, tan: 0 };
    for (let s = base; s < base + n; s++) {
      g.setTimeScale(0); g.startMatch({ difficulty: diff, seed: s, autoplay: true });
      let seen = 0;
      while (g.state().match.phase !== 'matchEnd' && g.state().time < 1e7) {
        g.step(0.5);
        while (seen < g.killFeed.length) {
          const k = g.killFeed[seen++], v = k.victim === 'You' ? g.state().player : g.state().bots.find((b) => b.name === k.victim);
          const vr = k.victim === 'You' ? 'player' : (g.bots.find((b) => b.name === k.victim) || {}).role;
          const kr = k.killer === 'You' ? 'player' : (g.bots.find((b) => b.name === k.killer) || {}).role;
          const key = (t, r) => t + ':' + r;
          roleKD[key(k.victimTeam, vr)] = roleKD[key(k.victimTeam, vr)] || [0, 0]; roleKD[key(k.victimTeam, vr)][1]++;
          if (k.killerTeam) { roleKD[key(k.killerTeam, kr)] = roleKD[key(k.killerTeam, kr)] || [0, 0]; roleKD[key(k.killerTeam, kr)][0]++; killWeapon[k.killerTeam][k.weapon] = (killWeapon[k.killerTeam][k.weapon] || 0) + 1; }
          const pos = v.pos || [v.x, v.y, v.z], z = pos[2], y = pos[1];
          const where = (y > 15 ? 'high ' : 'floor ') + (z < 53 ? 'north' : z > 107 ? 'south' : 'middle');
          deathWhere[k.victimTeam][where] = (deathWhere[k.victimTeam][where] || 0) + 1;
        }
      }
      wins[g.state().match.winner]++;
    }
    return { wins, roleKD, deathWhere, killWeapon };
  }, [diff, n, base]);
  console.log(JSON.stringify(r.wins)); for (const k of Object.keys(r.roleKD).sort()) console.log(k, 'K', r.roleKD[k][0], 'D', r.roleKD[k][1]);
  console.log('deaths where', JSON.stringify(r.deathWhere)); console.log('kills by weapon', JSON.stringify(r.killWeapon));
  await browser.close();
})();
