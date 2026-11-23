// Round 3 gate check 2: a full match per difficulty through the real flow: title, difficulty click, Play click (pointer lock),
// freeze with a real weapon-pick key or click, live, round end, next round, match end, Enter rematch (checked), then Esc to
// title. The player is driven by me through the hook (a simple shooter that holds near its fort and fires at visible
// enemies) or, with mode 'die', is killed early every round so the match plays out while spectating.
// Every round start is checked (health, grenade, magazines, positions, pick memory); freeze is checked to block movement and
// fire for everyone; bodies are checked to stay put; spectating is checked on every player death.
// Usage: node bug_r3_03_flow.cjs <difficulty> <mode: play|die> [seed]. Simulation is stepped (timeScale 0); every loop is tick-limited.
const { boot } = require('./bug_r3_lib.cjs');
const DIFF = process.argv[2] || 'recruit', MODE = process.argv[3] || 'play';
const LABEL = { recruit: 'RECRUIT', regular: 'REGULAR', veteran: 'VETERAN' };

(async () => {
  const { browser, page, errors } = await boot({ width: 960, height: 540 });
  const log = [];
  page.setDefaultTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  // title: pick difficulty by clicking its label, then Play
  const diffBox = await page.$('#tDiff');
  const opts = await page.$$('#tDiff *');
  for (const o of opts) { const t = (await o.textContent()).trim(); if (t === LABEL[DIFF]) { await o.click(); break; } }
  log.push(['title difficulty after click', await ev(() => ({ settings: typeof __game.settings === 'function' ? __game.settings() : __game.settings, sel: document.querySelector('#tDiff .sel') && document.querySelector('#tDiff .sel').dataset.d }))]);
  await page.click('#tPlay'); await page.waitForTimeout(400);
  log.push(['after Play', await ev(() => ({ match: __game.state().match.phase, difficulty: __game.state().match.difficulty, locked: !!document.pointerLockElement, app: __game.state().app }))]);
  await ev(() => {
    const G = __game; G.setTimeScale(0);
    const DT = 1 / 60, CW = G.CONFIG.weapons;
    const F = (window.F = { problems: [], notes: [], deaths: [], spect: [], rounds: [] });
    F.P = (k, x) => F.problems.push([k, x]);
    F.st = () => G.state();
    F.soldiers = () => { const s = G.state(), p = s.player; return s.bots.map((b) => ({ id: b.id, name: b.name, team: b.team, pos: b.pos, hp: b.hp, dead: b.dead, weapon: b.weapon, mag: b.mag, state: b.brainState })).concat([{ id: 'player', name: 'You', team: 'green', pos: [p.x, p.y, p.z], hp: p.health, dead: p.dead || p.health <= 0, weapon: s.weapon.name, mag: s.weapon.mag }]); };
    // my player: hold a spot just inside the fort, crouch-peek and fire at any visible Tan within 90
    F.drive = (i) => {
      const s = G.state(), p = s.player; if (p.dead || s.match.phase !== 'live') { G.clearInput(); return; }
      const eye = [p.x, p.y + (p.crouching ? 1.0 : 1.6), p.z];
      let best = null;
      for (const b of s.bots) { if (b.team !== 'tan' || b.dead) continue; const tgt = [b.pos[0], b.pos[1] + 1.0, b.pos[2]]; const d = Math.hypot(tgt[0] - eye[0], tgt[2] - eye[2]); if (d > 90) continue; if (!R2.clearLine(eye, tgt)) continue; if (!best || d < best.d) best = { d, tgt }; }
      const goal = [60, 0, 24];
      if (best) { G.lookAt(best.tgt[0], best.tgt[1], best.tgt[2]); G.setInput({ fire: i % 2 === 0, crouch: false }); if (s.weapon.mag === 0) G.setInput({ reload: true }); }
      else if (Math.hypot(p.x - goal[0], p.z - goal[2]) > 1) { G.lookAt(goal[0], p.y + 1.6, goal[2]); G.setInput({ forward: true, fire: false }); }
      else { G.clearInput(); G.look(Math.PI, 0); G.setInput({ crouch: i % 240 < 120 }); }
    };
    // run until phase changes (or max seconds); per-tick checks
    F.runPhase = (mode, maxSecs) => {
      const s0 = G.state().match, ph0 = s0.phase, t0 = G.state().time;
      const pos0 = {}; for (const q of F.soldiers()) pos0[q.id] = q.pos.slice();
      const bodies = {}; let spectBot = null, playerDiedAt = null; const lastShot0 = G.shotLog[G.shotLog.length - 1];
      for (let i = 0; i < Math.round(maxSecs * 60); i++) {
        if (ph0 === 'freeze') { G.setInput({ forward: true, fire: true }); }
        else if (ph0 === 'live') {
          if (mode === 'die' && i === 30 && !G.state().player.dead) { G.damagePlayer(500); }
          else if (mode === 'play') F.drive(i);
        }
        G.step(DT);
        const s = G.state(), m = s.match, t = s.time, L = F.soldiers();
        if (m.phase !== ph0) { G.clearInput(); return { from: ph0, to: m.phase, secs: +(t - t0).toFixed(2) }; }
        if (ph0 === 'freeze') {
          for (const q of L) if (Math.hypot(q.pos[0] - pos0[q.id][0], q.pos[2] - pos0[q.id][2]) > 0.05) { F.P('moved during freeze', { who: q.name, from: pos0[q.id], to: q.pos }); pos0[q.id] = q.pos.slice(); }
          const ls = G.shotLog[G.shotLog.length - 1]; if (ls !== lastShot0 && ls && ls.time > t0) F.P('shot during freeze', ls);
        }
        if (ph0 === 'live') {
          // bodies stay put for the round
          for (const q of L) { if (q.dead) { if (!bodies[q.id]) bodies[q.id] = q.pos.slice(); else if (Math.hypot(q.pos[0] - bodies[q.id][0], q.pos[2] - bodies[q.id][2]) > 0.3 && !F.bodyMoved) { F.bodyMoved = true; F.P('body moved', { who: q.name, from: bodies[q.id], to: q.pos }); } } }
          // spectating
          const p = s.player;
          if ((p.dead || p.health <= 0) && playerDiedAt === null) playerDiedAt = t;
          if (playerDiedAt !== null) {
            const greensAlive = L.filter((q) => q.team === 'green' && !q.dead && q.id !== 'player');
            const sp = m.spectating;
            if (t - playerDiedAt < 1.45 && sp) F.P('spectating before the 1.5 s death cam', { after: +(t - playerDiedAt).toFixed(2), sp });
            if (t - playerDiedAt > 1.6 && greensAlive.length) {
              const spBot = L.find((q) => q.name === sp || q.id === sp);
              if (!sp) F.P('no spectate target with Greens alive', { after: +(t - playerDiedAt).toFixed(2), alive: greensAlive.map((q) => q.name) });
              else if (!spBot || spBot.dead) F.P('spectating a dead or unknown soldier', { sp, after: +(t - playerDiedAt).toFixed(2) });
              else if (spBot.team !== 'green') F.P('spectating an enemy', { sp });
              if (sp && spBot && spectBot && spectBot !== sp) F.spect.push({ t: +t.toFixed(2), from: spectBot, to: sp, reason: L.find((q) => q.name === spectBot || q.id === spectBot)?.dead ? 'target died' : 'other' });
              spectBot = sp;
            }
          }
        }
      }
      return { from: ph0, to: 'TIMEOUT', secs: maxSecs };
    };
    F.roundStartCheck = (label) => {
      const s = G.state(), L = F.soldiers(), bad = [];
      for (const q of L) { if (q.dead || q.hp !== 100) bad.push(q.name + ' hp ' + q.hp); const C = CW[q.weapon]; if (C && q.mag !== C.mag) bad.push(q.name + ' mag ' + q.mag + '/' + C.mag + ' ' + q.weapon); }
      if (s.weapon.grenades !== 1) bad.push('player grenades ' + s.weapon.grenades);
      if (s.weapon.reserve !== CW[s.weapon.name].reserve) bad.push('player reserve ' + s.weapon.reserve);
      if (G.grenades.length) bad.push('live grenades carried over ' + G.grenades.length);
      if (bad.length) F.P('round start not reset', { label, bad });
      return { alive: s.match.alive, pick: s.match.pick, weapon: s.weapon.name };
    };
  });

  // main flow
  const maxRounds = 25; let rematchChecked = false; const picks = ['Digit2', 'Digit3', 'click1', 'Digit1', 'click3'];
  for (let r = 0; r < maxRounds; r++) {
    // freeze: real pick (key or click), check it, then let freeze run out
    const m = await ev(() => __game.state().match);
    if (m.phase !== 'freeze') { log.push(['expected freeze, got', m.phase]); break; }
    const start = await ev((l) => F.roundStartCheck(l), 'round ' + m.round);
    const pick = picks[r % picks.length];
    if (pick.startsWith('click')) {
      // a real click where the option is drawn (with the pointer locked the click lands wherever the browser sends it)
      const n = +pick.slice(5), w = { 1: 'rifle', 2: 'smg', 3: 'sniper' }[n];
      const box = await page.locator(`#picker .opt[data-w="${w}"]`).boundingBox().catch(() => null);
      const before = await ev(() => __game.state().match.pick);
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); else log.push(['picker option has no box', w]);
      const afterClick = await ev(() => ({ pick: __game.state().match.pick, locked: !!document.pointerLockElement, top: (() => { const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2); return e && e.id; })() }));
      log.push([`click on ${w} option (round ${m.round})`, { box: box && [Math.round(box.x), Math.round(box.y)], before, after: afterClick }]);
    }
    else await page.keyboard.press(pick);
    const after = await ev(() => ({ pick: __game.state().match.pick, weapon: __game.state().weapon.name }));
    const want = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'sniper', click1: 'rifle', click3: 'sniper' }[pick];
    const rf = await ev((mode) => F.runPhase(mode, 6), MODE);
    const live = await ev(() => ({ weapon: __game.state().weapon.name, carried: __game.state().weapon }));
    // pistol always carried: key 2 in live switches to the pistol, key 1 back
    await page.keyboard.press('Digit2'); const pistol = await ev(() => { __game.step(0.05); return __game.state().weapon.name; }); await page.keyboard.press('Digit1'); await ev(() => __game.step(0.05));
    const rl = await ev((mode) => F.runPhase(mode, 160), MODE);
    const re = await ev(() => ({ m: __game.state().match, overlay: getComputedStyle(document.querySelector('#roundEnd')).display, text: document.querySelector('#roundEnd').innerText.replace(/\s+/g, ' ') }));
    log.push([`round ${m.round}`, { start, pick, want, picked: after, freeze: rf, liveWeapon: live.weapon, key2InLive: pistol, live: rl, end: { phase: re.m.phase, last: re.m.lastRound, score: re.m.score, alive: re.m.alive, overlay: re.overlay, text: re.text.slice(0, 80) } }]);
    if (re.m.phase === 'roundEnd') { const nx = await ev(() => F.runPhase('wait', 5)); if (nx.to === 'matchEnd') re.m.phase = 'matchEnd'; else if (nx.to !== 'freeze') log.push(['after round end expected freeze', nx]); else log.push(['round end lasted', nx.secs]); }
    if (re.m.phase === 'matchEnd') {
      const me = await ev(() => ({ m: __game.state().match, overlay: getComputedStyle(document.querySelector('#matchEnd')).display, table: document.querySelector('#meTable').innerText.replace(/\s+/g, ' ').slice(0, 400), report: __game.matchReport && __game.matchReport().soldiers }));
      log.push(['MATCH END', me]);
      if (!rematchChecked) {
        rematchChecked = true;
        await page.keyboard.press('Enter'); await page.waitForTimeout(100);
        const rm = await ev(() => ({ m: __game.state().match, overlay: getComputedStyle(document.querySelector('#matchEnd')).display, alive: __game.state().bots.filter((b) => !b.dead).length, kf: __game.killFeed.length, hp: __game.state().player.health, locked: !!document.pointerLockElement }));
        log.push(['after Enter (rematch)', rm]);
        // play the rematch briefly, then Esc to pause and quit to title is checked in bug_r3_05; here go to the end screen again by skipRound
        await ev(() => { for (let k = 0; k < 5; k++) { __game.skipRound('tan'); for (let i = 0; i < 60 * 12 && __game.state().match.phase !== 'freeze' && __game.state().match.phase !== 'matchEnd'; i++) __game.step(1 / 60); } });
        const m2 = await ev(() => __game.state().match); log.push(['rematch after 5 skipRound(tan)', { phase: m2.phase, score: m2.score, winner: m2.winner }]);
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        log.push(['Esc on the end screen', await ev(() => ({ phase: __game.state().match.phase, app: __game.state().app, title: getComputedStyle(document.querySelector('#title')).display, locked: !!document.pointerLockElement }))]);
      }
      break;
    }
  }
  const F = await ev(() => ({ problems: F.problems.slice(0, 40), nProblems: F.problems.length, spect: F.spect.slice(0, 20) }));
  for (const l of log) console.log(JSON.stringify(l).slice(0, 1600));
  console.log('PROBLEMS', F.nProblems); for (const p of F.problems) console.log('  ', JSON.stringify(p).slice(0, 400));
  console.log('SPECTATE SWITCHES', JSON.stringify(F.spect));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
