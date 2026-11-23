// Round 2 pass 2: time to kill a 100 hp dummy with the game's real spread and recoil, aim put back on the body centre every tick.
// Items 2 (SMG vs rifle at 10/20/40/60, standing and strafing) and 4 (pistol vs rifle at 60 and 100).
// Usage: node builder_r2b_ttk.cjs [trials=60]
const { launch } = require('./harness.cjs');
const N = +(process.argv[2] || 60);
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.evaluate(() => {
    __game.start({ pointerLock: false }); __game.setTimeScale(0);
    const g = __game;
    window.TT = {
      // a floor spot d units from a floor dummy with a clear line to its body from the eye, across a 4 unit strafe lane
      findSpot(d, lane = 2.5, anyHeight = false) {
        const T0 = g.state().targets;
        for (const T of T0) {
          if (T.pos[1] !== 0 && !anyHeight) continue;
          for (let a = 0; a < 360; a += 3) {
            const r = a * Math.PI / 180, sx = Math.sin(r), sz = Math.cos(r), x = T.pos[0] + d * sx, z = T.pos[2] + d * sz;
            if (x < 3 || x > 117 || z < 3 || z > 157) continue;
            let ok = true;
            for (let o = -lane; o <= lane + 1e-9 && ok; o += 0.5) {
              const px = x + o * sz, pz = z - o * sx;        // perpendicular to the line of fire
              for (const ey of [1.6, 1.0]) {
                const h = g.raycast([px, ey, pz], [T.pos[0] - px, T.pos[1] + 0.7 - ey, T.pos[2] - pz]);
                if (!h || h.id !== T.id) { ok = false; break; }
              }
              const dn = g.raycast([px, 1.7, pz], [0, -1, 0]);
              if (!dn || dn.distance < 1.69 || dn.id !== 'room.floor') ok = false;
              for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = g.raycast([px, 0.3, pz], [ux, 0, uz]); if (w && w.distance < 0.6) ok = false; }
            }
            if (!ok) continue;
            g.teleport(x, 0, z); g.step(0.05); const p = g.state().player;
            if (Math.hypot(p.x - x, p.z - z) > 0.01 || p.y !== 0) continue;
            return { target: T.id, x: +x.toFixed(2), z: +z.toFixed(2), d };
          }
        }
        return null;
      },
      // long range: any waypoint node (perches included) whose eye sees a dummy's body 97 to 103 units away
      findPerch(d) {
        const N = g.waypoints.nodes, T0 = g.state().targets;
        for (const id in N) {
          const P = N[id];
          for (const T of T0) {
            const dx = T.pos[0] - P[0], dy = T.pos[1] + 0.7 - P[1] - 1.6, dz = T.pos[2] - P[2], dist = Math.hypot(dx, dy, dz);
            if (Math.abs(dist - d) > 3) continue;
            const h = g.raycast([P[0], P[1] + 1.6, P[2]], [dx, dy, dz]); if (!h || h.id !== T.id) continue;
            const h2 = g.raycast([P[0], P[1] + 1.6, P[2]], [dx, dy + 0.5, dz]); if (!h2 || h2.id !== T.id) continue;      // head clear too
            return { target: T.id, x: P[0], y: P[1], z: P[2], node: id, d: +dist.toFixed(1) };
          }
        }
        return null;
      },
      // mode: 'hold' (automatic held / semi pressed every other tick), 'tap' (one shot each time the spread has settled)
      duel(w, spot, strafe, mode, maxT) {
        g.clearInput(); g.give('ammo'); g.give('health'); g.resetTargets(); g.selectWeapon(w);
        g.teleport(spot.x, spot.y || 0, spot.z); g.step(0.8);
        const T = g.state().targets.find((t) => t.id === spot.target), idx = +T.id.split('.')[1] - 1;
        const W = g.CONFIG.weapons[w];
        let first = null, shots = 0, hits = 0, n0 = g.shotLog.length, last = g.shotLog[g.shotLog.length - 1];
        const t0 = g.state().time;
        for (let i = 0; i < maxT * 60; i++) {
          g.lookAt(T.pos[0], T.pos[1] + 0.7, T.pos[2]);
          const lr = strafe ? Math.floor(i / 24) % 2 === 0 : null;
          const S = g.state().weapon;
          let fire;
          if (mode === 'tap') {
            const m = strafe ? (W.moveMult || g.CONFIG.gun.spreadMult.move) : 1;
            fire = i % 2 === 0 && S.spread <= W.spread * m + 0.02;
          } else fire = W.auto ? true : i % 2 === 0;
          g.setInput({ fire, left: strafe ? lr : false, right: strafe ? !lr : false });
          g.step(1 / 60);
          const L = g.shotLog[g.shotLog.length - 1];
          if (L !== last) { last = L; shots++; if (L.hit === T.id) hits++; if (first === null) first = g.state().time - 1 / 60; }
          if (g.state().targets[idx].down) { g.clearInput(); return { t: g.state().time - first, shots, hits }; }
        }
        g.clearInput();
        return { t: null, shots, hits };
      },
      cell(w, spot, strafe, mode, n) {
        const ts = []; let shots = 0, hits = 0, kills = 0;
        for (let i = 0; i < n; i++) { const r = TT.duel(w, spot, strafe, mode, 6); shots += r.shots; hits += r.hits; if (r.t !== null) { kills++; ts.push(r.t); } }
        ts.sort((a, b) => a - b);
        const med = ts.length ? ts[Math.floor(ts.length / 2)] : null, mean = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : null;
        return { killPct: Math.round(100 * kills / n), median: med === null ? null : +med.toFixed(3), mean: mean === null ? null : +mean.toFixed(3), hitPct: Math.round(100 * hits / Math.max(1, shots)) };
      }
    };
  });
  const spots = await page.evaluate(() => { const o = {}; for (const d of [10, 20, 40, 60]) o[d] = TT.findSpot(d); o[100] = TT.findPerch(100); return o; });
  console.log('spots', JSON.stringify(spots));
  const res = {};
  const row = async (label, w, d, strafe, mode) => {
    if (!spots[d]) { res[label] = 'no spot'; return; }
    res[label] = await page.evaluate(([w, s, st, m, n]) => TT.cell(w, s, st, m, n), [w, spots[d], strafe, mode, N]);
    console.log(label.padEnd(34), JSON.stringify(res[label]));
  };
  console.log('== item 2: median seconds first shot to kill (n=' + N + '), held trigger, perfect aim');
  for (const d of [10, 20, 40, 60]) for (const strafe of [false, true]) for (const w of ['smg', 'rifle']) await row(`${w} ${d}u ${strafe ? 'strafe' : 'stand'} hold`, w, d, strafe, 'hold');
  console.log('== item 4: pistol vs rifle at 60 and 100 (standing)');
  for (const d of [60, 100]) {
    await row(`rifle ${d}u hold`, 'rifle', d, false, 'hold'); await row(`rifle ${d}u tap`, 'rifle', d, false, 'tap');
    await row(`pistol ${d}u fastest`, 'pistol', d, false, 'hold'); await row(`pistol ${d}u paced`, 'pistol', d, false, 'tap');
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
