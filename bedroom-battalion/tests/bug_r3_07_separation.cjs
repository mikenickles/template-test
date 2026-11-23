// Round 3 check 7: soft separation (16.10 item 5) near ledges. For every raised waypoint node: find the nearest drop edge,
// then (a) the player walks into a bot from the inner side toward the edge, (b) the player stands on the edge side of an idle
// bot, (c) two and three bots spawned on the same node. Records any soldier that ends lower than it started (pushed off),
// fall damage, and soldiers inside solids. Free play with spawnBot (idle bots). Usage: node bug_r3_07_separation.cjs
const { boot } = require('./bug_r3_lib.cjs');
(async () => {
  const { browser, page, errors } = await boot({ start: 'free' });
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, N = G.waypoints.nodes, rows = [];
    const ground = (x, y, z) => { for (let d = 0; d <= y + 0.5; d += 0.1) if (T.solidAt(x, y - d - 0.05, z, 0.05, { lift: 0, eps: 0.39 }).length) return y - d; return 0; };
    const raised = Object.entries(N).filter(([id, n]) => n[1] > 2 && !/^w\./.test(id));
    for (const [id, n] of raised) {
      // nearest drop edge in 16 directions (a point 0.5 past which the floor is more than 2 lower)
      let best = null;
      for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI, dx = Math.sin(a), dz = Math.cos(a); for (let d = 0.2; d < 4; d += 0.1) { const x = n[0] + dx * d, z = n[2] + dz * d; if (T.solidAt(x, n[1] + 0.3, z, 1.5, { lift: 0, eps: 0.39 }).length) break; if (n[1] - ground(x, n[1], z) > 2) { if (!best || d < best.d) best = { d, dx, dz }; break; } } }
      if (!best) continue;
      const res = { node: id, y: n[1], edge: +best.d.toFixed(1) };
      for (const mode of ['player pushes bot toward edge', 'bot beside player on the edge side', 'three bots on the node']) {
        G.removeBots(); G.clearInput(); G.give('health'); G.damageLog.length = 0;
        G.teleport(5, 0, 5); G.step(DT);
        const ids = [G.spawnBot('green', id)]; if (mode.startsWith('three')) { ids.push(G.spawnBot('green', id)); ids.push(G.spawnBot('tan', id)); }
        G.step(0.1);
        const b0 = G.state().bots.filter((b) => ids.includes(b.id)).map((b) => b.pos.slice());
        const yaw = Math.atan2(-best.dx, -best.dz);
        const along = (x, z) => (x - n[0]) * best.dx + (z - n[2]) * best.dz;
        const pLimit = best.d - 0.45;                                  // the player never goes past its own safe line
        if (mode.startsWith('player pushes')) { G.teleport(n[0] - best.dx * 0.7, n[1], n[2] - best.dz * 0.7, yaw, 0); }
        const xOff = Math.min(0.3, Math.max(0, best.d - 0.5));
        if (mode.startsWith('bot beside')) { G.teleport(n[0] + best.dx * xOff, n[1], n[2] + best.dz * xOff, yaw, 0); res.playerStartOffset = +xOff.toFixed(2); }
        let minBotY = 99, minPY = 99;
        for (let i = 0; i < 240; i++) {
          if (mode.startsWith('player pushes')) { const p = G.state().player; if (along(p.x, p.z) >= pLimit) { G.clearInput(); G.teleport(n[0] + best.dx * pLimit, n[1], n[2] + best.dz * pLimit, yaw, 0); } else G.setInput({ forward: true }); }
          G.step(DT); for (const b of G.state().bots) if (ids.includes(b.id)) minBotY = Math.min(minBotY, b.pos[1]); if (!mode.startsWith('three')) minPY = Math.min(minPY, G.state().player.y);
        }
        if (mode.startsWith('three')) { const bs = G.state().bots.filter((b) => ids.includes(b.id)); let md = 99; for (let a = 0; a < bs.length; a++) for (let c = a + 1; c < bs.length; c++) md = Math.min(md, Math.hypot(bs[a].pos[0] - bs[c].pos[0], bs[a].pos[2] - bs[c].pos[2])); res.threeBotsMinSpacing = +md.toFixed(3); }
        G.clearInput();
        const bots = G.state().bots.filter((b) => ids.includes(b.id));
        res[mode] = { botsFell: bots.filter((b) => b.pos[1] < n[1] - 1).map((b) => `${b.id}@${b.pos.map((v) => +v.toFixed(1)).join(',')} hp${b.hp}`), playerFell: !mode.startsWith('three') && minPY < n[1] - 1 ? { minY: +minPY.toFixed(1), hp: G.state().player.health, dmg: G.damageLog.map((d) => d.cause + d.amount.toFixed(0)) } : null, botHp: bots.map((b) => b.hp), botMovedMax: +Math.max(...bots.map((b, i) => Math.hypot(b.pos[0] - b0[i][0], b.pos[2] - b0[i][2]))).toFixed(2), botsInSolid: bots.filter((b) => T.solidAt(b.pos[0], b.pos[1], b.pos[2], 1.8, { lift: 0.3, eps: 0.05 }).length).length };
      }
      rows.push(res);
    }
    G.removeBots();
    return rows;
  });
  let falls = 0;
  for (const r of out) { const bad = Object.values(r).some((v) => v && typeof v === 'object' && ((v.botsFell && v.botsFell.length) || v.playerFell || v.botsInSolid)); if (bad) falls++; console.log((bad ? '!! ' : 'ok ') + JSON.stringify(r)); }
  console.log(`raised nodes tested ${out.length}, with a fall or overlap ${falls}`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
