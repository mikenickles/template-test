// Round 3 gate check 1: full autoplay matches, stepped tick by tick from startMatch so every tick can be checked with my own
// detection (not the game's logs): stalls, idling with a visible enemy, solids, room, envelope, never leaving spawn, rounds
// that run long, alive and score counts against the actual soldiers, fire rate / magazine per shooter, friendly fire,
// kill credit and headshots against the kill feed and the end table. Then the same seed through runMatch for comparison.
// Usage: node bug_r3_01_matches.cjs <difficulty> <seed0> <count>. Every loop is tick-limited.
const { boot } = require('./bug_r3_lib.cjs');
const DIFF = process.argv[2] || 'regular', SEED0 = +(process.argv[3] || 1), COUNT = +(process.argv[4] || 3);

(async () => {
  const { browser, page, errors } = await boot();
  const results = [];
  for (let k = 0; k < COUNT; k++) {
    const seed = SEED0 + k;
    const r = await page.evaluate(({ DIFF, seed }) => {
      const G = __game, DT = 1 / 60, CW = G.CONFIG.weapons, D = G.CONFIG.difficulty[DIFF];
      G.startMatch({ difficulty: DIFF, seed, autoplay: true }); G.setTimeScale(0);
      const out = { seed, problems: {}, ex: {}, rounds: [], myKills: {}, myDeaths: {}, myHeadKills: 0, shotsSeen: 0, ffHits: 0, ffDamage: 0 };
      const P = (k, ex) => { out.problems[k] = (out.problems[k] || 0) + 1; if (ex && (!out.ex[k] || out.ex[k].length < (/STUCK|spawn|view|friendly|freeze|faster|engage range/.test(k) ? 12 : 4))) (out.ex[k] = out.ex[k] || []).push(ex); };
      const r2 = (a) => a.map((v) => +(+v).toFixed(2));
      const soldiers = () => { const s = G.state(), p = s.player; const L = s.bots.map((b) => ({ id: b.id, name: b.name, team: b.team, pos: b.pos, hp: b.hp, dead: b.dead, state: b.brainState || b.state, move: b.state, yaw: b.yaw, crouch: b.crouching, riding: b.riding, edgeKind: b.edgeKind, weapon: b.weapon, mag: b.mag, bot: true })); L.push({ id: 'player', name: 'You', team: 'green', pos: [p.x, p.y, p.z], hp: p.health, dead: p.dead || p.health <= 0, state: 'player', move: 'player', yaw: p.yaw, crouch: p.crouching, riding: s.riding, weapon: s.weapon.name, mag: s.weapon.mag, bot: false }); return L; };
      const byId = {}; const roundVis = {}, roundShots = {}; const hist = {}, still = {}, vis = {}, lastShotT = {}, prevMag = {}, prevHp = {}, prevDead = {}, startPos = {}, firedAt = {};
      let phase = null, phaseT = 0, lastShot = G.shotLog[G.shotLog.length - 1] || null, roundLive0 = 0, feedSeen = 0, tick = 0;
      const maxTicks = 60 * 2600;
      for (; tick < maxTicks; tick++) {
        G.step(DT);
        const s = G.state(), m = s.match, t = s.time, L = soldiers();
        for (const q of L) byId[q.id] = q;
        if (m.phase !== phase) {
          if (m.phase === 'live') { roundLive0 = t; for (const q of L) { startPos[q.id] = q.pos.slice(); delete still[q.id]; hist[q.id] = []; vis[q.id] = null; } }
          if (phase === 'live' && m.phase !== 'live') {
            // round ended: check never-left-spawn and duration
            const dur = t - roundLive0; const row = { round: m.round, phase: m.phase, dur: +dur.toFixed(2), alive: m.alive, score: m.score, last: m.lastRound };
            const mine = { green: L.filter((q) => q.team === 'green' && !q.dead).length, tan: L.filter((q) => q.team === 'tan' && !q.dead).length }; row.myAlive = mine;
            if (mine.green !== m.alive.green || mine.tan !== m.alive.tan) P('alive count disagrees at round end', row);
            if (m.lastRound && m.lastRound.reason === 'eliminated' && mine.green > 0 && mine.tan > 0) P('eliminated but both alive', row);
            if (dur > 150.6) P('round longer than 2:30', row);
            for (const q of L) if (q.bot && (roundVis[q.id] || 0) > 5 && !roundShots[q.id]) P('round with an enemy visible in engage range over 5 s and no shot', { round: m.round, bot: q.name, weapon: q.weapon, visibleSecs: roundVis[q.id], dead: q.dead, pos: r2(q.pos) });
            for (const k in roundVis) delete roundVis[k]; for (const k in roundShots) delete roundShots[k];
            if (dur > 45) for (const q of L) if (!q.dead && q.bot && Math.hypot(q.pos[0] - startPos[q.id][0], q.pos[2] - startPos[q.id][2]) < 6) P('bot never left spawn', { round: m.round, bot: q.name, pos: r2(q.pos), dur: +dur.toFixed(1) });
            if (m.lastRound && m.lastRound.reason !== 'eliminated') row.survivors = L.filter((q) => !q.dead).map((q) => `${q.name}@${r2(q.pos).join(',')}:${q.state}/${q.move}`);
            out.rounds.push(row);
          }
          if (m.phase === 'freeze') { for (const q of L) startPos[q.id] = q.pos.slice(); out._freezeStart = t; }
          phase = m.phase; phaseT = t;
        }
        // alive counts every tick while live
        if (m.phase === 'live') {
          const g = L.filter((q) => q.team === 'green' && !q.dead).length, tn = L.filter((q) => q.team === 'tan' && !q.dead).length;
          if (g !== m.alive.green || tn !== m.alive.tan) P('alive count disagrees (live)', { t: +t.toFixed(2), hud: m.alive, mine: { green: g, tan: tn } });
          if ((g === 0 || tn === 0) && t - out._lastZeroCheck > 0.5) {}
        }
        // new shots this tick
        const log = G.shotLog; let i0 = lastShot ? log.lastIndexOf(lastShot) + 1 : 0; if (lastShot && i0 === 0 && log.length && log[0] !== lastShot && log.length === 200) i0 = Math.max(0, log.length - 12);   // ring full and our marker rotated out: take the newest few
        const fresh = log.slice(i0); if (log.length) lastShot = log[log.length - 1];
        const shotsBy = {};
        for (const e of fresh) {
          out.shotsSeen++;
          if (m.phase === 'freeze' || (m.phase === 'live' && t - roundLive0 < 0)) P('shot during freeze', { t: +t.toFixed(2), by: e.by, weapon: e.weapon });
          if (phase === 'freeze') P('shot during freeze', { t: +t.toFixed(2), by: e.by });
          const sh = byId[e.by] || byId.player;   // the player's shots carry its own internal id, not 'player'
          const tgt = byId[e.hit] || (e.kind === 'soldier' ? byId.player : null);
          if (sh && tgt && sh.team === tgt.team && e.by !== e.hit) { out.ffHits++; if (e.damage > 0) { out.ffDamage += e.damage; P('friendly damage', { t: +t.toFixed(2), by: sh.name, hit: tgt.name, weapon: e.weapon, damage: e.damage }); } }
          if (e.weapon !== 'grenade' && sh) {
            shotsBy[sh.id] = (shotsBy[sh.id] || 0) + 1; firedAt[sh.id] = t; roundShots[sh.id] = (roundShots[sh.id] || 0) + 1;
            const C = CW[e.weapon]; const lt = lastShotT[sh.id + e.weapon];
            if (lt !== undefined && t - lt < C.interval - DT * 0.6) P('fire faster than the weapon', { by: sh.name, weapon: e.weapon, gap: +(t - lt).toFixed(3), interval: C.interval });
            lastShotT[sh.id + e.weapon] = t;
            if (e.spread !== undefined && e.spread < C.spread * 0.6 * (e.weapon === 'sniper' ? (C.scopedSpread / C.spread) : 1) - 1e-6) P('spread below the weapon minimum', { by: sh.name, weapon: e.weapon, spread: e.spread });
          }
        }
        // magazines: never over capacity, shots only take rounds that exist
        for (const q of L) {
          if (q.dead) { prevMag[q.id] = undefined; continue; }
          const C = CW[q.weapon]; if (C && (q.mag > C.mag || q.mag < 0)) P('magazine out of range', { who: q.name, weapon: q.weapon, mag: q.mag });
          const pm = prevMag[q.id]; if (pm && pm.w === q.weapon && shotsBy[q.id] && q.mag > pm.mag - shotsBy[q.id] && q.mag !== C.mag) P('shot without using a round', { who: q.name, weapon: q.weapon, before: pm.mag, after: q.mag, shots: shotsBy[q.id] });
          if (pm && pm.w === q.weapon && shotsBy[q.id] && pm.mag === 0) P('fired with an empty magazine', { who: q.name, weapon: q.weapon });
          prevMag[q.id] = { w: q.weapon, mag: q.mag };
        }
        // deaths: kill credit from the last damaging shot this tick
        for (const q of L) {
          if (q.dead && prevDead[q.id] === false) {
            const killShot = [...fresh].reverse().find((e) => e.damage > 0 && (e.hit === q.id || (q.id === 'player' && e.kind === 'soldier' && !byId[e.hit])));
            out.myDeaths[q.name] = (out.myDeaths[q.name] || 0) + 1;
            const feed = G.killFeed.filter((f) => f.victim === q.name && f.round === m.round).slice(-1)[0];
            if (!feed) P('death not in kill feed', { victim: q.name, t: +t.toFixed(2) });
            if (killShot) {
              const killer = byId[killShot.by] ? byId[killShot.by].name : 'You';
              out.myKills[killer] = (out.myKills[killer] || 0) + 1; if (killShot.zone === 'head') out.myHeadKills++;
              if (feed && (feed.killer !== killer || !!feed.head !== (killShot.zone === 'head') || feed.weapon !== killShot.weapon)) P('kill feed disagrees with the killing shot', { victim: q.name, feed: { killer: feed.killer, weapon: feed.weapon, head: feed.head }, shot: { killer, weapon: killShot.weapon, zone: killShot.zone } });
            } else if (feed && !feed.self) { out.myKills[feed.killer] = (out.myKills[feed.killer] || 0) + 1; out.feedOnlyKills = (out.feedOnlyKills || 0) + 1; if (feed.head) out.myHeadKills++; }
          }
          prevDead[q.id] = q.dead;
        }
        if (m.phase === 'matchEnd') break;
        if (m.phase !== 'live') continue;
        const tr = t - roundLive0;
        for (const q of L) {
          if (q.dead || !q.bot) continue;
          const [x, y, z] = q.pos;
          // stalls
          if (tick % 30 === 0) {
            // STUCK (my rule, after 16.11): moved under 1 unit for 15 s, fired no shot in those 15 s, and not justified by
            // hold before 22 s into the round. Counted once per episode; episodes of 37 s or more counted separately.
            const h = hist[q.id] || (hist[q.id] = []); h.push([x, y, z, t, q.state, q.move]); if (h.length > 31) h.shift();
            const w = h.slice(-31); const moved = Math.max(...w.map((p) => Math.hypot(p[0] - w[0][0], p[2] - w[0][2]) + Math.abs(p[1] - w[0][1])));
            const noShot = !(firedAt[q.id] >= w[0][3]);
            const earlyHold = w.every((p) => p[4] === 'hold') && tr <= 22;
            if (w.length === 31 && moved < 1 && noShot && !earlyHold) {
              still[q.id] = (still[q.id] || 0) + 0.5; const sts = [...new Set(w.map((p) => p[4]))], mv = [...new Set(w.map((p) => p[5]))];
              if (still[q.id] === 0.5) P('STUCK: 15 s stationary, no shot, not justified', { round: m.round, t: +tr.toFixed(1), bot: q.name, weapon: q.weapon, pos: r2(q.pos), states: sts, moves: mv, crouch: q.crouch, lastFired: firedAt[q.id] ? +(t - firedAt[q.id]).toFixed(1) : null });
              if (still[q.id] === 22) P('STUCK 37 s or more', { round: m.round, t: +tr.toFixed(1), bot: q.name, pos: r2(q.pos), states: sts, moves: mv });
            } else still[q.id] = 0;
          }
          // enemy visible within the weapon's engage range (16.11) with my line of sight, any direction: seconds per round
          if (tick % 15 === 0) {
            const RANGE = { smg: 40, pistol: 50, rifle: 90, sniper: 1e9 }, vr = Math.min(RANGE[q.weapon] || 90, D.vision);
            const eye = [x, y + (q.crouch ? 1.0 : 1.6), z];
            const sees = L.some((e) => e.team !== q.team && !e.dead && Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z) <= vr && (R2.clearLine(eye, [e.pos[0], e.pos[1] + 1.55, e.pos[2]]) || R2.clearLine([x, y + 1.6, z], [e.pos[0], e.pos[1] + 1.55, e.pos[2]])));
            if (sees) { roundVis[q.id] = (roundVis[q.id] || 0) + 0.25; }
          }
          if (T.solidAt(x, y, z, q.crouch ? 1.2 : 1.8, { lift: 0.3, eps: 0.05 }).length) P('inside a static solid', { round: m.round, bot: q.name, pos: r2(q.pos), move: q.move, hits: T.solidAt(x, y, z, q.crouch ? 1.2 : 1.8, { lift: 0.3, eps: 0.05 }) });
          if (x < 0.39 || x > 119.61 || z < 0.39 || z > 159.61 || y < -0.01 || y > 89) P('out of the room', { bot: q.name, pos: r2(q.pos) });
          if (R3.inEnv(x, z) && y < 5 && !q.riding && !['ride', 'board', 'alight', 'cross'].includes(q.move) && q.edgeKind !== 'cross') P('in the envelope, not riding or crossing (ticks)', { bot: q.name, pos: r2(q.pos), move: q.move });
          // idle with a visible enemy: check at 6 Hz
          if (tick % 10 === 0) {
            const eye = [x, y + (q.crouch ? 1.0 : 1.6), z], fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw);
            let seen = null;
            for (const e of L) {
              if (e.team === q.team || e.dead) continue;
              const dx = e.pos[0] - x, dz = e.pos[2] - z, d = Math.hypot(dx, e.pos[1] - y, dz); if (d > D.vision) continue;
              if ((dx * fx + dz * fz) / Math.hypot(dx, dz) < Math.cos(55 * Math.PI / 180)) continue;
              const head = [e.pos[0], e.pos[1] + 1.55, e.pos[2]], body = [e.pos[0], e.pos[1] + 0.9, e.pos[2]];
              const clear = (p) => R2.clearLine(eye, p) && (() => { for (let a = 0.03; a < 0.97; a += 0.02) { const px = eye[0] + (p[0] - eye[0]) * a, py = eye[1] + (p[1] - eye[1]) * a, pz = eye[2] + (p[2] - eye[2]) * a; if (R3.cars().some((c) => { const l = R3.local(c, px, pz); const top = c.type === 'gondola' ? 2.4 : c.type === 'flatbed' ? 4.2 : c.type === 'engine' ? 6 : 5; return Math.abs(l.along) < 6.2 && Math.abs(l.lat) < 2.2 && py < top + 0.2; })) return false; } return true; })();
              if (clear(head) || clear(body)) { seen = { enemy: e.name, d: +d.toFixed(1) }; break; }
            }
            const v = vis[q.id];
            if (seen) { if (!v) vis[q.id] = { from: t, enemy: seen.enemy, d: seen.d, states: new Set([q.state]), fired: false }; else { v.states.add(q.state); if (firedAt[q.id] >= v.from) v.fired = true; if (q.move === 'climb') v.climbed = true; if (t - v.from > 3.0 && !v.fired && !v.flagged && !v.climbed && [...v.states].every((st) => ['advance', 'hold', 'hunt'].includes(st))) { v.flagged = true; P('enemy in view and clear for 3 s, never fired or engaged', { round: m.round, t: +tr.toFixed(1), bot: q.name, state: [...v.states].join(','), enemy: v.enemy, d: v.d, pos: r2(q.pos), move: q.move }); } } }
            else vis[q.id] = null;
          }
        }
      }
      out.ticks = tick; const m = G.state().match;
      out.end = { phase: m.phase, winner: m.winner, score: m.score, round: m.round };
      if (m.phase !== 'matchEnd') P('match did not end within the tick limit', out.end);
      if (!m.winner || (m.score.green !== 5 && m.score.tan !== 5)) P('no winner with 5', out.end);
      const rep = G.matchReport ? G.matchReport() : null;
      if (rep && rep.soldiers) { out.table = rep.soldiers.map((q) => `${q.name} ${q.kills}/${q.deaths}`).join(', '); for (const q of rep.soldiers) { if ((out.myKills[q.name] || 0) !== q.kills || (out.myDeaths[q.name] || 0) !== q.deaths) P('end table disagrees with my count', { name: q.name, table: [q.kills, q.deaths], mine: [out.myKills[q.name] || 0, out.myDeaths[q.name] || 0] }); } out.reportHeadKills = rep.stats && rep.stats.headKills; }
      out.stuckLog = G.stuckLog.length; out.trainRescues = G.trainRescueLog.length; out.idleLog = G.idleLog ? G.idleLog.length : 'n/a'; out.idleEx = G.idleLog ? G.idleLog.slice(0, 3) : [];
      // the same seed through runMatch: same result?
      const rm = G.runMatch({ difficulty: DIFF, seed, maxSimSeconds: 2600 });
      out.runMatch = { winner: rm.winner, score: rm.score, rounds: rm.rounds.length, stuck: rm.stuckLog.length, trainRescues: rm.trainRescueLog.length, errors: rm.errors.length, finished: rm.finished };
      out.sameAsStepped = rm.winner === out.end.winner && rm.score.green === out.end.score.green && rm.score.tan === out.end.score.tan && rm.rounds.length === out.rounds.length;
      return out;
    }, { DIFF, seed });
    results.push(r);
    console.log(`${DIFF} seed ${seed}: ${r.end.winner} ${r.end.score.green}-${r.end.score.tan} in ${r.rounds.length} rounds (${(r.ticks / 60).toFixed(0)} s) | reasons ${r.rounds.map((q) => q.last && q.last.reason[0]).join('')} | stuckLog ${r.stuckLog} trainRescues ${r.trainRescues} idleLog ${r.idleLog} ${JSON.stringify(r.idleEx).slice(0, 200)} | shots ${r.shotsSeen} ff hits ${r.ffHits} ff dmg ${r.ffDamage} | my head kills ${r.myHeadKills} report ${r.reportHeadKills} | runMatch ${JSON.stringify(r.runMatch)} same=${r.sameAsStepped}`);
    console.log('   problems', JSON.stringify(r.problems));
    for (const q of r.rounds) if (q.survivors) console.log('      time-out round', q.round, q.last && q.last.reason, JSON.stringify(q.alive), q.survivors.join(' | '));
    for (const k in r.ex) for (const e of r.ex[k]) console.log('     ', k, JSON.stringify(e).slice(0, 400));
  }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
