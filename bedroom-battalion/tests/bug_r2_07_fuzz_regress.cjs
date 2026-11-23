// Round 2 check 9: fuzz for leaving the room while moving, firing, scoping, switching and throwing; every live grenade
// and the player are checked on every tick. Also: which sounds get logged, and the ruler lanes beside the new desk apron.
// Usage: node bug_r2_07_fuzz_regress.cjs [seed] [episodes]. All loops are tick-limited.
const { boot } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const SEED = +(process.argv[2] || 21), EPISODES = +(process.argv[3] || 1500);

(async () => {
  const { browser, page, errors } = await boot();
  await page.evaluate(installR2);
  const out = await page.evaluate(({ SEED, EPISODES }) => {
    const G = __game, DT = 1 / 60, rnd = R2.rng(SEED), out = {};
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const nodes = Object.values(G.waypoints.nodes), names = ['rifle', 'smg', 'sniper', 'pistol'];
    const S = { ticks: 0, episodes: 0, playerOut: [], playerDeep: {}, rescues: [], nan: [], grenOut: [], grenInside: {}, grenInsideAfterStart: [], throws: 0, shots: 0, ammoBad: [], sounds: {}, deaths: 0, grenadeDeaths: 0 };
    for (let e = 0; e < EPISODES; e++) {
      const n = pick(nodes); let st = rnd() < 0.7 ? [n[0] + (rnd() - 0.5) * 2, n[1], n[2] + (rnd() - 0.5) * 2] : [0.5 + rnd() * 119, rnd() < 0.5 ? 0 : rnd() * 60, 0.5 + rnd() * 159];
      let tries = 0; for (; tries < 20 && T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length; tries++) st[1] += 1;
      if (T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length || st[1] > 87) continue;
      G.clearInput(); G.give('health'); G.give('ammo'); G.give('grenade'); G.rescueLog.length = 0; G.damageLog.length = 0;
      G.teleport(st[0], st[1], st[2], rnd() * 6.283, 0); S.episodes++;
      let inp = {}, hold = 0, yaw = rnd() * 6.283, prevShots = G.shotLog.length, lastTime = -1; const seen = new Map();
      const N = 200 + Math.floor(rnd() * 500);
      for (let i = 0; i < N; i++) {
        if (hold-- <= 0) {
          hold = 3 + Math.floor(rnd() * 40);
          inp = { forward: rnd() < 0.65, back: rnd() < 0.12, left: rnd() < 0.2, right: rnd() < 0.2, jump: rnd() < 0.3, sprint: rnd() < 0.35, crouch: rnd() < 0.15, fire: rnd() < 0.55, scope: rnd() < 0.25, grenade: rnd() < 0.3, reload: rnd() < 0.08 };
          if (rnd() < 0.6) yaw += (rnd() - 0.5) * (rnd() < 0.2 ? 6.283 : 1.2);
          G.look(yaw, (rnd() - 0.5) * 3.08); G.clearInput(); G.setInput(inp);
          if (rnd() < 0.25) G.selectWeapon(pick(names));
          if (rnd() < 0.2) G.give('grenade');
        }
        if (inp.jump && i % 9 === 0) G.setInput({ jump: false }); else if (inp.jump && i % 9 === 1) G.setInput({ jump: true });
        G.step(DT); S.ticks++;
        const p = G.state().player, w = G.state().weapon, C = G.CONFIG.weapons[w.name];
        if (!Number.isFinite(p.x + p.y + p.z + p.yaw + p.pitch)) { S.nan.push({ e, i }); break; }
        if (p.x < 0.4 - 1e-6 || p.x > 119.6 + 1e-6 || p.z < 0.4 - 1e-6 || p.z > 159.6 + 1e-6 || p.y < -1e-6 || p.y > 88.8) S.playerOut.push({ e, i, pos: [p.x, p.y, p.z] });
        const deep = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.66, eps: 0.05 }); if (deep.length) { const k = deep.join('+'); S.playerDeep[k] = (S.playerDeep[k] || 0) + 1; }
        if (w.mag < 0 || w.mag > C.mag || w.reserve < 0 || w.reserve > C.reserve || w.grenades < 0 || w.grenades > 1) S.ammoBad.push({ e, i, w });
        for (const o of G.grenades) {
          const age = seen.get(o) || 0; seen.set(o, age + 1); if (age === 0) S.throws++;
          if (!Number.isFinite(o.x + o.y + o.z) || o.x < 0 || o.x > 120 || o.z < 0 || o.z > 160 || o.y < 0 || o.y > 90) { if (S.grenOut.length < 12) S.grenOut.push({ e, age, pos: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], player: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] }); S.grenOutTicks = (S.grenOutTicks || 0) + 1; if (age === 0 || !o._out) { o._out = 1; S.grenOutCount = (S.grenOutCount || 0) + 1; } continue; }
          const id = R2.inSolid(o.x, o.y, o.z, 0.02);
          if (id) { if (age === 0) { o._born = id; S.grenInside[id.replace(/\.\d+$/, '.N')] = (S.grenInside[id.replace(/\.\d+$/, '.N')] || 0) + 1; } else if (!o._born && !o._in) { o._in = 1; if (S.grenInsideAfterStart.length < 10) S.grenInsideAfterStart.push({ e, age, id, pos: [+o.x.toFixed(3), +o.y.toFixed(3), +o.z.toFixed(3)], vel: [+o.vx.toFixed(2), +o.vy.toFixed(2), +o.vz.toFixed(2)] }); S.grenTunnel = (S.grenTunnel || 0) + 1; } }
        }
        if (G.shotLog.length) { const le = G.shotLog[G.shotLog.length - 1]; if (le.time !== lastTime) { lastTime = le.time; if (le.weapon !== 'grenade') S.shots++; } }
      }
      for (const a of G.audioLog) S.sounds[a.name] = (S.sounds[a.name] || 0) + 1; G.audioLog.length = 0;
      if (G.rescueLog.length) S.rescues.push({ e, st, log: G.rescueLog.slice(0, 1) });
      S.deaths += G.damageLog.filter((d) => d.cause === 'fall' && d.amount >= 100).length; S.grenadeDeaths += G.damageLog.filter((d) => d.cause === 'grenade').length;
      G.clearInput(); G.step(2.1);       // let live grenades burst before the next episode
    }
    out.fuzz = S;
    // the sounds DESIGN 15.2 lists
    const want = ['shot_rifle', 'shot_smg', 'shot_sniper', 'shot_pistol', 'dry', 'reload_rifle', 'reload_smg', 'reload_sniper', 'reload_pistol', 'bolt', 'switch', 'hit', 'kill', 'grenade_pin', 'grenade_bounce', 'grenade_pop', 'step_wood', 'step_fabric', 'step_plastic', 'step_book', 'step_card', 'step_metal', 'jump', 'land'];
    // hit / kill / dry / step_metal / step_card need a deliberate run
    G.clearInput(); G.resetTargets(); G.give('ammo'); G.selectWeapon('sniper'); G.teleport(60, 0, 116, 0, 0); G.step(1); G.setInput({ scope: true }); G.step(0.5); G.lookAt(60, 0.8, 110); G.fire(); G.step(1.4); G.lookAt(60, 0.8, 110); G.fire(); G.step(1.4); G.clearInput();
    for (const [pos, yaw] of [[[38, 0, 84], 0], [[76, 8, 72], Math.PI], [[60, 3.3, 6.9], Math.PI / 2], [[115, 26, 80], 0]]) { G.teleport(pos[0], pos[1], pos[2], yaw, 0); G.setInput({ forward: true }); G.step(1.5); G.clearInput(); }
    for (const a of G.audioLog) S.sounds[a.name] = (S.sounds[a.name] || 0) + 1;
    out.soundsNeverLogged = want.filter((k) => !S.sounds[k]); out.soundsNotInDesign = Object.keys(S.sounds).filter((k) => !want.includes(k)); out.soundsWithoutRecipe = Object.keys(S.sounds).filter((k) => !G.CONFIG.audio.sounds[k]);

    // ---- ruler lanes beside the desk apron ----
    out.apronLanes = [];
    for (const [tag, z0, yaw, done] of [['north', 78, 0, (p) => p.y > 25.99 && p.z < 64.6], ['south', 82, Math.PI, (p) => p.y > 25.99 && p.z > 95.4]]) for (const sprint of [false, true]) {
      let row = '';
      for (let x = 94.0; x <= 96.01; x += 0.1) {
        G.clearInput(); G.give('health'); G.damageLog.length = 0; G.teleport(x, 17, z0, yaw, 0); G.step(0.2); G.setInput({ forward: true, sprint }); let ok = false;
        for (let i = 0; i < 420 && !ok; i++) { G.step(DT); const p = G.state().player; ok = p.onGround && done(p); }
        const p = G.state().player; row += ok ? 'T' : G.damageLog.length ? 'F' : p.y < 17.3 ? '#' : '?';
      }
      out.apronLanes.push(`ruler ${tag} ${sprint ? 'sprint' : 'walk  '} start x 94.0..96.0 step 0.1: ${row}   (T = top, # = stopped at the foot against the apron end, F = fell off the seat rim)`);
    }
    G.clearInput();
    return out;
  }, { SEED, EPISODES });
  const S = out.fuzz;
  console.log(`seed ${SEED}: ${S.episodes} episodes, ${S.ticks} ticks, ${S.shots} shots, ${S.throws} grenades thrown, ${S.deaths} fall deaths, ${S.grenadeDeaths} self grenade hits`);
  console.log('player out of the room:', S.playerOut.length, JSON.stringify(S.playerOut.slice(0, 3)), '| rescues:', S.rescues.length, JSON.stringify(S.rescues.slice(0, 2)).slice(0, 300), '| NaN:', S.nan.length, '| ammo out of range:', S.ammoBad.length);
  console.log('player inside a solid by more than 5 cm (tick counts):', JSON.stringify(S.playerDeep));
  console.log(`grenades outside the room box: ${S.grenOutCount || 0}`, JSON.stringify(S.grenOut.slice(0, 5)));
  console.log('grenades born inside a solid (by collider):', JSON.stringify(S.grenInside));
  console.log(`grenades that entered a solid after a clean start: ${S.grenTunnel || 0}`, JSON.stringify(S.grenInsideAfterStart.slice(0, 6)));
  console.log('sounds logged:', JSON.stringify(S.sounds));
  console.log('sounds in DESIGN 15.2 never logged:', JSON.stringify(out.soundsNeverLogged), '| logged but not listed:', JSON.stringify(out.soundsNotInDesign), '| logged with no recipe:', JSON.stringify(out.soundsWithoutRecipe));
  for (const r of out.apronLanes) console.log(r);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
