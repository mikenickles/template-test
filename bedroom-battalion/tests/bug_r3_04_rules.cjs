// Round 3 gate check 3, 4 (friendly fire), 5 (spectating) and 8 (raycast at a soldier), driven through the hook with real
// keys for the weapon pick. Rounds are kept short with setRoundTime and killBot so each rule is isolated.
// Usage: node bug_r3_04_rules.cjs. Every loop is tick-limited.
const { boot } = require('./bug_r3_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot({ width: 960, height: 540 });
  const ev = (f, a) => page.evaluate(f, a);
  const out = {};
  await ev(() => {
    const G = __game, DT = 1 / 60;
    window.H = {
      m: () => G.state().match,
      bots: (team) => G.state().bots.filter((b) => !team || b.team === team),
      untilPhase: (ph, max = 20) => { for (let i = 0; i < max * 60; i++) { if (G.state().match.phase === ph) return true; G.step(DT); } return false; },
      toLive: () => { H.untilPhase('live', 15); },
      endRound: () => { const r = H.untilPhase('roundEnd', 170); const m = G.state().match; const res = { ok: r, last: m.lastRound, score: m.score, replays: m.replays, round: m.round, alive: m.alive }; H.untilPhase('freeze', 10) || H.untilPhase('matchEnd', 1); return res; },
    };
  });
  // ---- weapon pick with real keys, memory, default, keys 4/5 ----
  await ev(() => { __game.startMatch({ difficulty: 'regular', seed: 5, autoplay: false }); __game.setTimeScale(0); __game.setGodMode(true); });
  out.pick = { default: await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name })) };
  await page.keyboard.press('Digit3'); out.pick.key3 = await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name }));
  await page.keyboard.press('Digit4'); out.pick.key4 = await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name }));
  await page.keyboard.press('Digit5'); out.pick.key5 = await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name }));
  await page.click('#picker .opt[data-w="smg"]').catch((e) => { out.pick.clickError = String(e).slice(0, 120); });
  out.pick.clickSmg = await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name }));
  // freeze: player input does nothing, bots do not move, nobody fires
  out.freeze = await ev(() => { const G = __game, p0 = G.state().player, b0 = H.bots().map((b) => b.pos.slice()), n0 = G.shotLog.length; G.setInput({ forward: true, fire: true, jump: true }); G.fire(); G.setInput({ grenade: true }); G.step(1); const p1 = G.state().player; const moved = H.bots().filter((b, i) => Math.hypot(b.pos[0] - b0[i][0], b.pos[2] - b0[i][2]) > 0.05).map((b) => b.name); const r = { phase: H.m().phase, playerMoved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(3), playerY: p1.y, botsMoved: moved, shots: G.shotLog.length - n0, grenadesLive: G.grenades.length, grenadeCount: G.state().weapon.grenades }; G.clearInput(); return r; });
  // ---- round 1: elimination ----
  out.elim = await ev(() => { H.toLive(); for (const b of H.bots('tan')) __game.killBot(b.id); __game.step(0.1); return H.endRound(); });
  out.pick.round2 = await ev(() => ({ phase: H.m().phase, pick: H.m().pick, weapon: __game.state().weapon.name }));
  // ---- round 2: timer win (4 Green vs 3 Tan after two kills), grenade one per round, pistol carried ----
  out.timer = await ev(() => {
    const G = __game; H.toLive(); const r = {};
    G.give && 0; r.grenadesAtStart = G.state().weapon.grenades;
    G.teleport(60, 0, 24, Math.PI, -0.3); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(0.1); r.afterThrow = G.state().weapon.grenades;
    G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(0.1); r.liveGrenadesAfterSecondTry = G.grenades.length;
    G.selectWeapon('pistol'); G.step(0.4); r.pistol = G.state().weapon.name; G.selectWeapon(H.m().pick); G.step(0.5);
    const t = H.bots('tan'); G.killBot(t[0].id); G.killBot(t[1].id); G.step(0.1); r.aliveBefore = H.m().alive; G.setRoundTime(1.0); r.end = H.endRound(); return r;
  });
  out.pick.round3 = await ev(() => ({ pick: H.m().pick, weapon: __game.state().weapon.name, grenades: __game.state().weapon.grenades }));
  // ---- replays: equal numbers at 0:00, four times in a row; the fourth decided on health ----
  out.replays = [];
  for (let k = 0; k < 7; k++) {
    if (k >= 4 && out.replays[out.replays.length - 1].end.last.reason !== 'replay') break;
    out.replays.push(await ev((k) => {
      const G = __game; H.toLive(); const g = H.bots('green'), t = H.bots('tan'); G.killBot(g[0].id); G.killBot(t[0].id); G.step(0.1);
      if (k >= 3) { G.setGodMode(false); G.damagePlayer(30); G.setGodMode(true); }           // from the fourth tie on, Green has 30 less total health
      const before = { alive: H.m().alive, round: H.m().round, replays: H.m().replays, score: H.m().score, playerHp: G.state().player.health };
      G.setRoundTime(0.5); const end = H.endRound(); return { k, before, end };
    }, k));
  }
  // ---- friendly fire: the player shoots and grenades teammates; a grenade at the player's own feet ----
  out.ff = await ev(() => {
    const G = __game; H.toLive(); G.setGodMode(false); G.give('health'); const r = {};
    const mate = H.bots('green')[0]; const p = G.state().player;
    G.teleport(mate.pos[0], mate.pos[1], mate.pos[2] + 3, 0, 0); G.step(0.05); const m = H.bots('green').find((b) => b.id === mate.id);
    G.selectWeapon('pistol'); G.step(0.4); G.lookAt(m.pos[0], m.pos[1] + 1.0, m.pos[2]); const hpBefore = m.hp; const e = G.fire(); G.step(0.1);
    r.shotAtTeammate = { hit: e && e.hit, kind: e && e.kind, damage: e && e.damage, hpBefore, hpAfter: H.bots('green').find((b) => b.id === mate.id).hp };
    // grenade at feet among teammates (teleport next to them is fine: separation pushes gently)
    const mates = H.bots('green').filter((b) => !b.dead).slice(0, 2), hp0 = mates.map((b) => b.hp), php = G.state().player.health;
    G.teleport(mates[0].pos[0] + 1, mates[0].pos[1], mates[0].pos[2], 0, -1.5); G.setInput({ grenade: true }); G.step(1 / 60); G.setInput({ grenade: false }); G.step(2.3);
    r.grenadeAmongTeammates = { mateHpBefore: hp0, mateHpAfter: mates.map((b) => H.bots('green').find((q) => q.id === b.id).hp), playerHpBefore: php, playerHpAfter: G.state().player.health, playerDamageLog: G.damageLog.slice(-2) };
    G.setGodMode(true); return r;
  });
  // ---- spectating: kill the player, then walk the spectator through cycling and target deaths ----
  out.spect = await ev(() => {
    const G = __game, r = { steps: [] }; G.setGodMode(false);
    if (H.m().phase !== 'live') H.toLive();
    G.give('health'); G.damagePlayer(500); const t0 = G.state().time;
    const sp = () => H.m().spectating;
    for (let i = 0; i < 120; i++) { G.step(1 / 60); if (sp()) break; }
    r.firstSpectateAfter = +(G.state().time - t0).toFixed(3); r.first = sp();
    const seen = [sp()]; for (let k = 0; k < 6; k++) { G.spectateNext(); G.step(0.05); seen.push(sp()); }
    r.cycle = seen; r.livingGreens = H.bots('green').filter((b) => !b.dead).map((b) => b.name);
    // kill the bot being spectated: switch to another living Green
    for (let k = 0; k < 4; k++) { const cur = sp(); const b = H.bots('green').find((q) => q.name === cur || q.id === cur); if (!b) { r.steps.push({ k, cur, note: 'no target' }); break; } G.killBot(b.id); G.step(0.2); r.steps.push({ killed: b.name, now: sp(), phase: H.m().phase, alive: H.m().alive }); if (H.m().phase !== 'live') break; }
    // across the round end into the next freeze
    H.untilPhase('freeze', 12); r.nextFreeze = { phase: H.m().phase, spectating: sp(), playerHp: G.state().player.health, playerDead: H.m().playerDead };
    return r;
  });
  // real left click cycles while spectating
  out.spectClick = await ev(() => { const G = __game; H.toLive(); G.setGodMode(false); G.give('health'); G.damagePlayer(500); G.step(1.7); return { before: H.m().spectating }; });
  await page.mouse.click(480, 270); await ev(() => __game.step(0.05));
  out.spectClick.afterClick = await ev(() => ({ now: H.m().spectating, locked: !!document.pointerLockElement, phase: __game.state().phase }));
  // ---- R3A-1: raycast at a soldier ----
  out.raycast = await ev(() => { const G = __game; G.start({ pointerLock: false }); G.setTimeScale(0); G.removeBots(); const id = G.spawnBot('green', 'n.c.3'); G.step(0.5); const b = G.state().bots.find((q) => q.id === id); try { const r = G.raycast([b.pos[0], 1.6, b.pos[2] + 8], [0, 0, -1]); return r && { id: r.id, kind: r.kind, zone: r.zone, distance: +r.distance.toFixed(3) }; } catch (e) { return 'THROWS ' + e; } });
  for (const k in out) console.log(k.toUpperCase(), JSON.stringify(out[k], null, 0).slice(0, 2500));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
