// Round 2 re-check: new 15.6 rules and state-machine abuse around the changed code.
//  A. holding fire through an empty magazine (rifle, SMG; pistol and sniper for comparison), with and without reserve
//  B. R buffered during a draw (BUGS R2-6), at several points in the draw, for every weapon
//  C. fire / reload / switch / scope / grenade in every order on one tick and on consecutive ticks, with invariants
//  D. death and respawn in the middle of each action
//  E. random abuse with invariants
// Usage: node bug_r2b_05_rules_state.cjs [seed]. Every loop is tick-limited.
const { boot } = require('./bug_lib.cjs');
const SEED = +(process.argv[2] || 9);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate((SEED) => {
    const G = __game, DT = 1 / 60, out = {}, CW = G.CONFIG.weapons, names = ['rifle', 'smg', 'sniper', 'pistol'];
    const W = () => G.state().weapon;
    const settle = (name) => { G.clearInput(); G.give('ammo'); G.give('health'); G.give('grenade'); G.resetTargets(); G.teleport(60, 0, 100, 0, 0.3); G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(0.8); G.selectWeapon(name); G.step(1.5); G.shotLog.length = 0; G.audioLog.length = 0; };
    const sounds = (n) => G.audioLog.filter((a) => a.name === n).length;
    const inv = (tag) => {
      const w = W(), C = CW[w.name], bad = [];
      if (!C) bad.push('unknown weapon ' + w.name);
      else {
        if (!Number.isInteger(w.mag) || w.mag < 0 || w.mag > C.mag) bad.push('mag ' + w.mag);
        if (!Number.isInteger(w.reserve) || w.reserve < 0 || w.reserve > C.reserve) bad.push('reserve ' + w.reserve);
        if (w.reloading && (w.mag >= C.mag)) bad.push('reloading with a full magazine');
      }
      if (w.grenades < 0 || w.grenades > 1) bad.push('grenades ' + w.grenades);
      if (w.scoped && w.name !== 'sniper') bad.push('scoped with ' + w.name);
      if (w.scoped && w.reloading) bad.push('scoped while reloading');
      if (!(w.spread >= 0 && Number.isFinite(w.spread))) bad.push('spread ' + w.spread);
      if (G.grenades.length > 2) bad.push('live grenades ' + G.grenades.length);
      return bad.length ? { tag, bad, w } : null;
    };

    // ---- A. held through empty ----
    out.heldEmpty = {};
    for (const name of names) {
      for (const reserve of ['full', 'zero']) {
        settle(name);
        // run the reserve dry first: shoot and reload until reserve 0 (tick-limited)
        if (reserve === 'zero') { for (let i = 0; i < 6000 && (W().reserve > 0 || W().reloading); i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); if (W().mag === 0 && !W().reloading) G.reload(); } G.clearInput(); G.step(0.5); }
        // leave 3 rounds in the magazine (when there are that many)
        for (let i = 0; i < 4000 && W().mag > 3; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); } G.clearInput(); G.step(CW[name].interval + 0.1);
        G.shotLog.length = 0; G.audioLog.length = 0;
        const start = { mag: W().mag, reserve: W().reserve };
        // hold fire continuously for 4.5 s
        G.setInput({ fire: true });
        const ev = []; let lastShots = 0, lastDry = 0, lastRel = false, reloadStartT = null, reloadEndT = null, t0 = G.state().time;
        for (let i = 0; i < 270; i++) {
          G.step(DT);
          const w = W(), s = G.shotLog.length, d = sounds('dry'), t = +(G.state().time - t0).toFixed(3);
          if (s > lastShots) { ev.push(['shot', t, w.mag]); lastShots = s; }
          if (d > lastDry) { ev.push(['dry', t]); lastDry = d; }
          if (w.reloading && !lastRel) { ev.push(['reload start', t]); reloadStartT = reloadStartT ?? t; }
          if (!w.reloading && lastRel) { ev.push(['reload end', t, w.mag, w.reserve]); reloadEndT = reloadEndT ?? t; }
          lastRel = w.reloading;
        }
        G.clearInput(); G.step(DT);
        // after release: one fresh press
        const d0 = sounds('dry'); G.setInput({ fire: true }); G.step(0.1); G.clearInput(); G.step(0.3);
        const compact = []; for (const e of ev) { const L = compact[compact.length - 1]; if (e[0] === 'shot' && L && L[0] === 'shots') { L[1]++; L[3] = e[1]; } else if (e[0] === 'shot') compact.push(['shots', 1, e[1], e[1]]); else compact.push(e); }
        out.heldEmpty[name + ' reserve ' + reserve] = { start, events: compact.slice(0, 14), dryWhileHeld4_5s: lastDry, freshPressDry: sounds('dry') - d0, freshPressReload: W().reloading, end: { mag: W().mag, reserve: W().reserve } };
        G.step(3.5);
      }
    }

    // ---- B. R buffered during the draw ----
    out.drawR = [];
    for (const name of names) {
      const draw = CW[name].draw;
      for (const frac of [0, 0.25, 0.5, 0.75, 0.95]) {
        for (const how of ['input 1 tick', 'reload() hook']) {
          settle(name); G.fire(); G.step(CW[name].interval + 0.05); const magBefore = W().mag;
          G.selectWeapon(name === 'pistol' ? 'rifle' : 'pistol'); G.step(0.6);
          // now switch back and press R partway through the draw
          G.selectWeapon(name); const tSel = G.state().time; G.step(Math.floor(draw * frac * 60) / 60);
          if (how === 'input 1 tick') { G.setInput({ reload: true }); G.step(DT); G.setInput({ reload: false }); } else { G.reload(); G.step(DT); }
          const pressedAt = +(G.state().time - tSel).toFixed(3);
          let startedAt = null; for (let i = 0; i < 90; i++) { if (W().reloading) { startedAt = +(G.state().time - tSel).toFixed(3); break; } G.step(DT); }
          out.drawR.push({ name, draw, pressedAt, how, magBefore: W().mag, reloadStartedAt: startedAt, ok: startedAt !== null && startedAt <= draw + 2 / 60 + 1e-6 });
          G.step(3.5);
        }
      }
      // R during draw with a full magazine: nothing; R then switch again inside the draw: the new weapon must not reload
      settle(name); G.selectWeapon('pistol' === name ? 'rifle' : 'pistol'); G.step(0.6); G.selectWeapon(name); G.step(0.05); G.reload(); G.step(1.2);
      const full = { reloading: W().reloading, mag: W().mag };
      settle(name); G.fire(); G.step(0.3); const other = name === 'pistol' ? 'rifle' : 'pistol'; G.selectWeapon(other); G.step(0.8); G.selectWeapon(name); G.step(0.05); G.reload(); G.step(DT); G.selectWeapon(other); G.step(1.2);
      out.drawR.push({ name, fullMagazineRDuringDraw: full, rThenSwitchAway: { weapon: W().name, reloading: W().reloading, mag: W().mag } });
    }

    // ---- C. every order of five actions on one tick, and spread over consecutive ticks ----
    const acts = {
      fire: () => G.fire(), fireIn: () => G.setInput({ fire: true }), reload: () => G.reload(), reloadIn: () => G.setInput({ reload: true }),
      switchP: () => G.selectWeapon('pistol'), switchS: () => G.selectWeapon('sniper'), scope: () => G.setInput({ scope: true }), gren: () => G.setInput({ grenade: true }), grenUp: () => G.setInput({ grenade: false }),
    };
    const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
    const C = { combos: 0, bad: [], neverFired: 0, outcomes: {} };
    for (const startW of ['sniper', 'rifle', 'smg', 'pistol']) for (const set of [['fire', 'reload', 'switchS', 'scope', 'gren'], ['fireIn', 'reloadIn', 'switchP', 'scope', 'gren'], ['fire', 'switchP', 'switchS', 'reload', 'grenUp']]) for (const spread of [false, true]) for (const p of perms(set)) {
      settle(startW); G.fire(); G.step(spread ? 0.4 : 0.15);
      if (p.includes('grenUp')) { G.setInput({ grenade: true }); G.step(0.2); }
      for (const a of p) { acts[a](); if (spread) G.step(DT); const b = inv(startW + ' ' + p.join('>') + ' after ' + a); if (b && C.bad.length < 10) C.bad.push(b); }
      for (let i = 0; i < 30; i++) { G.step(DT); const b = inv(startW + ' ' + p.join('>') + ' +' + i); if (b && C.bad.length < 10) { C.bad.push(b); break; } }
      G.clearInput(); G.step(DT);
      for (let i = 0; i < 300; i++) { G.step(DT); const b = inv('settling ' + startW + ' ' + p.join('>')); if (b && C.bad.length < 10) { C.bad.push(b); break; } }
      // after it all, the gun must work again: a fresh press fires within 4 s (reload / bolt / draw allowed)
      G.give('ammo'); const n = G.shotLog.length; let fired = false; for (let i = 0; i < 240 && !fired; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); fired = G.shotLog.length !== n && G.shotLog[G.shotLog.length - 1].weapon !== 'grenade'; } G.clearInput();
      if (!fired) { C.neverFired++; if (C.bad.length < 10) C.bad.push({ tag: 'gun dead after ' + startW + ' ' + p.join('>'), w: W() }); }
      const k = W().name + (W().scoped ? '+scoped' : ''); C.outcomes[k] = (C.outcomes[k] || 0) + 1; C.combos++;
      G.clearInput(); G.step(2.3);
    }
    out.orders = C;

    // ---- D. death mid-action ----
    out.death = [];
    const die = () => { G.teleport(60, 45, 100, 0, 0.2); for (let i = 0; i < 400 && G.state().player.health === 100 && G.state().player.y > 0.01; i++) G.step(DT); for (let i = 0; i < 30; i++) G.step(DT); };
    const mid = {
      'reloading rifle': () => { settle('rifle'); G.fire(); G.step(0.2); G.reload(); G.step(0.5); },
      'drawing sniper': () => { settle('pistol'); G.selectWeapon('sniper'); G.step(0.2); },
      'sniper mid-bolt, scoped': () => { settle('sniper'); G.setInput({ scope: true }); G.step(0.3); G.fire(); G.step(0.3); },
      'aiming a grenade': () => { settle('smg'); G.setInput({ grenade: true }); G.step(0.4); },
      'holding fire through empty, smg': () => { settle('smg'); for (let i = 0; i < 600 && W().mag > 0; i++) { G.setInput({ fire: true }); G.step(DT); } },
      'buffered R during draw': () => { settle('rifle'); G.fire(); G.step(0.2); G.selectWeapon('pistol'); G.step(0.5); G.selectWeapon('rifle'); G.step(0.1); G.reload(); },
      'live grenade at feet': () => { settle('rifle'); G.give('health'); G.teleport(60, 45, 100, 0, -1.5); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(DT); },
    };
    for (const k in mid) {
      mid[k](); const before = W(); const held = { ...G.state().player };
      die();
      const p = G.state().player, w = W(), b = inv('after death ' + k);
      const after = { name: w.name, mag: w.mag, reserve: w.reserve, reloading: w.reloading, scoped: w.scoped, drawing: w.drawing, grenades: w.grenades, liveGrenades: G.grenades.length, hp: p.health, pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] };
      G.clearInput(); G.step(1.5);
      const n = G.shotLog.length; let fired = false; for (let i = 0; i < 300 && !fired; i++) { G.setInput({ fire: i % 2 === 0 }); G.step(DT); fired = G.shotLog.length !== n; } G.clearInput();
      out.death.push({ during: k, before: { name: before.name, mag: before.mag, reloading: before.reloading, scoped: before.scoped, drawing: before.drawing }, died: held.health > p.health || p.health === 100, after, invariant: b, firesAfterRespawn: fired, stuckScope: W().scoped });
      G.step(2.5);
    }

    // ---- E. random abuse ----
    let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const E = { ticks: 0, bad: [], dryRuns: 0, maxDryPerSecond: 0 };
    settle('rifle'); let inp = {}; const dryTimes = [];
    for (let i = 0; i < 150000; i++) {
      if (rnd() < 0.1) { inp = { fire: rnd() < 0.6, scope: rnd() < 0.3, reload: rnd() < 0.15, grenade: rnd() < 0.2, forward: rnd() < 0.3, sprint: rnd() < 0.15, jump: rnd() < 0.1, crouch: rnd() < 0.15 }; G.clearInput(); G.setInput(inp); G.look(rnd() * 6.28, (rnd() - 0.5) * 2); }
      if (rnd() < 0.04) G.selectWeapon(names[Math.floor(rnd() * 4)]);
      if (rnd() < 0.01) G.fire(); if (rnd() < 0.01) G.reload();
      if (rnd() < 0.002) G.give('grenade'); if (rnd() < 0.0004) G.give('ammo');
      if (rnd() < 0.0003) G.teleport(60, 45, 100); if (rnd() < 0.002) G.teleport(30 + rnd() * 60, 0, 90 + rnd() * 20);
      const nd = sounds('dry');
      G.step(DT); E.ticks++;
      if (sounds('dry') > nd) dryTimes.push(i);
      if (G.audioLog.length > 150) G.audioLog.length = 0;
      const b = inv('fuzz ' + i); if (b) { if (E.bad.length < 10) E.bad.push(b); }
    }
    G.clearInput();
    for (let k = 0, j = 0; k < dryTimes.length; k++) { while (dryTimes[k] - dryTimes[j] >= 60) j++; E.maxDryPerSecond = Math.max(E.maxDryPerSecond, k - j + 1); }
    E.dryTotal = dryTimes.length;
    out.fuzz = E;
    return out;
  }, SEED);
  console.log('A. held through empty:'); for (const k in out.heldEmpty) console.log('   ', k.padEnd(22), JSON.stringify(out.heldEmpty[k]));
  console.log('B. R during draw:'); for (const r of out.drawR) console.log('   ', (r.ok === false ? '!! ' : '   ') + JSON.stringify(r));
  const C = out.orders; console.log(`C. orders: ${C.combos} combinations | invariant breaks / dead guns listed: ${C.bad.length} | gun did not fire again: ${C.neverFired} | end states ${JSON.stringify(C.outcomes)}`); for (const b of C.bad) console.log('   !!', JSON.stringify(b));
  console.log('D. death mid-action:'); for (const r of out.death) console.log('   ', JSON.stringify(r));
  console.log(`E. fuzz: ${out.fuzz.ticks} ticks | invariant breaks ${out.fuzz.bad.length} | dry clicks ${out.fuzz.dryTotal} | most in any 1 s ${out.fuzz.maxDryPerSecond}`); for (const b of out.fuzz.bad) console.log('   !!', JSON.stringify(b));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
