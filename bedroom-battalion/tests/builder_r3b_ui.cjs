// Round 3B with real mouse and keys: title, settings, Play, freeze pick (key and click), pause/resume, the Esc-click race,
// settings after a reload, death and spectating, round-end and match-end screens, Enter rematch, Esc title; screenshots.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
  const ev = (fn, a) => page.evaluate(fn, a), st = () => ev(() => __game.state());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const out = {};
  // ---- title and settings with real input ----
  await shot('round3/builder_r3b_title.png');
  await page.mouse.click(...await center('#tDiff [data-d="veteran"]'));
  await page.mouse.click(...await center('#tSens')); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.mouse.click(...await center('#tVol')); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  out.settingsOnTitle = await ev(() => __game.settings());
  // ---- Play: match starts in freeze with the pointer locked ----
  await page.mouse.click(...await center('#tPlay')); await wait(300);
  let s = await st(); out.afterPlay = { app: s.app, phase: s.match.phase, locked: s.pointerLocked, difficulty: s.match.difficulty, bots: s.bots.length };
  await ev(() => __game.setTimeScale(0));
  await page.keyboard.press('Digit2'); out.pickByKey2 = (await st()).match.pick;
  await page.keyboard.press('Digit3'); out.pickByKey3 = (await st()).match.pick;
  await page.mouse.click(640, 360); out.pickByLockedClick = (await st()).match.pick;    // locked: a click cycles the pick
  await ev(() => __game.render()); await shot('round3/builder_r3b_freeze_picker.png');
  out.weaponAfterPick = (await st()).weapon.name;
  // ---- pause and resume with real input ----
  await page.keyboard.press('Escape'); await wait(100);
  s = await st(); out.afterEsc = { app: s.app, locked: s.pointerLocked };
  await ev(() => __game.render()); await shot('round3/builder_r3b_pause.png');
  await page.mouse.click(...await center('#pSens')); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  out.settingsInPause = await ev(() => __game.settings());
  await page.mouse.click(...await center('#pResume')); await wait(200);
  s = await st(); out.afterResume = { app: s.app, locked: s.pointerLocked };
  // ---- the Esc-click race (BUGS R1 finding 4): Esc, then a click on Resume after 0, 10, 30, 60 ms ----
  out.escClick = [];
  for (const ms of [0, 10, 30, 60, 0, 10]) {
    await page.keyboard.press('Escape'); if (ms) await wait(ms);
    const p = await center('#pResume'); await page.mouse.click(p[0], p[1]); await wait(250);
    s = await st(); out.escClick.push({ ms, app: s.app, locked: s.pointerLocked, bad: s.app === 'paused' && s.pointerLocked });
    if (s.app === 'paused') { await page.mouse.click(...await center('#pResume')); await wait(250); }
  }
  // ---- freeze pick by clicking the option (mouse free) ----
  await ev(() => { __game.setTimeScale(0); __game.startMatch({ difficulty: 'regular', seed: 5 }); });
  await page.mouse.click(...await center('#picker [data-w="smg"]'));
  s = await st(); out.pickByOptionClick = { pick: s.match.pick, weapon: s.weapon.name, phase: s.match.phase };
  // ---- player death: camera tips, then spectates a Green bot; left click cycles ----
  await ev(() => { __game.step(5.1); __game.damagePlayer(150); __game.step(0.5); __game.render(); });
  await shot('round3/builder_r3b_death_tip.png');
  await ev(() => { __game.step(1.2); __game.render(); });
  s = await st(); out.spectate1 = { dead: s.match.playerDead, spec: s.match.spectating };
  await shot('round3/builder_r3b_spectating.png');
  await page.mouse.click(640, 360); s = await st(); out.spectateAfterClick = s.match.spectating;
  await page.mouse.click(640, 360); s = await st(); out.spectateAfterClick2 = s.match.spectating;
  // ---- rounds: time, replay x3, health tiebreak, skipped; then the match-end screen ----
  out.rounds = await ev(() => {
    const g = __game, R = [];
    const live = () => { while (g.state().match.phase !== 'live') g.step(0.5); };
    const finish = () => { while (g.state().match.phase === 'roundEnd') g.step(0.5); };
    g.startMatch({ difficulty: 'regular', seed: 9 }); g.setGodMode(true);
    live(); g.killBot(g.bots.find((b) => b.team === 'tan').id); g.setRoundTime(0.01); g.step(0.1); R.push(g.state().match.lastRound); finish();   // time: 5 v 4
    for (let i = 0; i < 3; i++) { live(); g.skipRound(); R.push(Object.assign({ replays: g.state().match.replays }, g.state().match.lastRound)); finish(); }   // equal: replay
    live(); g.bots.find((b) => b.team === 'tan').hp = 40; g.setRoundTime(0.01); g.step(0.1); R.push(g.state().match.lastRound); finish();          // fourth equal: health
    R.push({ score: g.state().match.score });
    return R;
  });
  await ev(() => { const g = __game; while (g.state().match.phase !== 'live') g.step(0.5); g.skipRound('green'); g.step(0.2); g.render(); });
  await shot('round3/builder_r3b_round_end.png');
  await ev(() => { const g = __game; for (let i = 0; i < 6 && g.state().match.phase !== 'matchEnd'; i++) { while (g.state().match.phase !== 'live' && g.state().match.phase !== 'matchEnd') g.step(0.5); if (g.state().match.phase === 'live') g.skipRound('green'); } while (g.state().match.phase === 'roundEnd') g.step(0.5); g.render(); });
  s = await st(); out.matchEnd = { phase: s.match.phase, winner: s.match.winner, score: s.match.score, locked: s.pointerLocked, app: s.app };
  await shot('round3/builder_r3b_match_end.png');
  await page.keyboard.press('Enter'); await wait(300);
  s = await st(); out.afterEnter = { phase: s.match.phase, score: s.match.score, round: s.match.round, app: s.app, locked: s.pointerLocked };
  await ev(() => { const g = __game; g.setTimeScale(0); for (let i = 0; i < 7 && g.state().match.phase !== 'matchEnd'; i++) { while (g.state().match.phase !== 'live' && g.state().match.phase !== 'matchEnd') g.step(0.5); if (g.state().match.phase === 'live') g.skipRound('tan'); } while (g.state().match.phase === 'roundEnd') g.step(0.5); });
  await page.keyboard.press('Escape'); await wait(200);
  s = await st(); out.afterEscOnMatchEnd = { app: s.app, phase: s.match.phase, bots: s.bots.length };
  // ---- settings survive a reload ----
  await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready);
  out.settingsAfterReload = await ev(() => __game.settings());
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
