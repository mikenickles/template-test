// Check 4: random and adversarial movement. Looks for: leaving the room, falling through floors, the safety
// net firing (rescueLog), NaN, the body inside a solid (independent checker), wrong fall damage, and being
// wedged (no direction moves the player at the end of an episode).
// Usage: node bug_08_fuzz.cjs [seed] [episodes]
const { boot } = require('./bug_lib.cjs');
const SEED = +(process.argv[2] || 1), EPISODES = +(process.argv[3] || 1500);

(async () => {
  const { browser, page, errors } = await boot();
  const res = await page.evaluate(({ SEED, EPISODES }) => {
    const G = __game, DT = 1 / 60;
    let s = SEED >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const out = { ticks: 0, episodes: 0, outOfRoom: [], rescues: [], nan: [], deep: {}, wedged: [], badDamage: [], deaths: 0, maxY: 0, startsSkipped: 0, belowFloor: [] };
    const nodes = Object.values(G.waypoints.nodes);
    // start generators
    const starts = [
      () => { const n = pick(nodes); return [n[0] + (rnd() - 0.5) * 2, n[1], n[2] + (rnd() - 0.5) * 2]; },             // near a waypoint, on its surface
      () => [0.5 + rnd() * 119, 0, 0.5 + rnd() * 159],                                                                  // anywhere on the floor
      () => pick([[0.6, 0, 0.6], [119.4, 0, 0.6], [0.6, 0, 159.4], [119.4, 0, 159.4], [0.6, 0, 80], [119.4, 0, 80], [60, 0, 0.6], [60, 0, 159.4]]),   // walls and corners
      () => [0.5 + rnd() * 119, 2 + rnd() * 80, 0.5 + rnd() * 159],                                                    // dropped from a random height anywhere
      () => { const c = pick(G.colliders); return [(c.x0 + c.x1) / 2 + (rnd() - 0.5) * (c.x1 - c.x0 + 1.2), c.y1 + rnd() * 3, (c.z0 + c.z1) / 2 + (rnd() - 0.5) * (c.z1 - c.z0 + 1.2)]; },  // above an edge of some collider
      () => [36 + rnd() * 4, rnd() < 0.5 ? 0 : rnd() * 12, 78 + rnd() * 4],                                             // on / above the spring pad
      () => { const st = pick(G.colliders.filter((c) => c.kind === 'string')); return [st.x + (rnd() - 0.5) * 2.4, st.y0 + rnd() * (st.y1 - st.y0 + 4), st.z + (rnd() - 0.5) * 2.4]; }  // around a string, any height
    ];
    for (let e = 0; e < EPISODES; e++) {
      let st = pick(starts)(), tries = 0;
      st = [Math.min(119.5, Math.max(0.5, st[0])), Math.min(87, Math.max(0, st[1])), Math.min(159.5, Math.max(0.5, st[2]))];
      while (T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length && tries++ < 20) st[1] += 1.0;      // never start inside a solid
      if (T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length || st[1] + 1.8 > 89.9) { out.startsSkipped++; continue; }
      T.reset();
      G.teleport(st[0], st[1], st[2], rnd() * 6.283, 0);
      out.episodes++;
      let yaw = rnd() * 6.283, inp = {}, hold = 0, peak = T.st().y, wasGround = T.st().onGround, wasClimb = false, hp = T.st().health, dmgSeen = 0, launched = false, died = false;
      const N = 240 + Math.floor(rnd() * 600);
      for (let i = 0; i < N; i++) {
        if (hold-- <= 0) {
          hold = 3 + Math.floor(rnd() * 45);
          const style = rnd();
          inp = { forward: rnd() < 0.7, back: rnd() < 0.15, left: rnd() < 0.25, right: rnd() < 0.25, jump: rnd() < (style < 0.3 ? 0.8 : 0.25), sprint: rnd() < 0.5, crouch: rnd() < 0.15 };
          if (rnd() < 0.6) yaw += (rnd() - 0.5) * (rnd() < 0.2 ? 6.283 : 1.2);
          G.look(yaw, (rnd() - 0.5) * 2);
          G.clearInput(); G.setInput(inp);
        }
        if (inp.jump && i % 9 === 0) G.setInput({ jump: false }); else if (inp.jump && i % 9 === 1) G.setInput({ jump: true });   // re-press: jump is edge triggered
        const before = T.st();
        G.step(DT); out.ticks++;
        const p = T.st();
        if (!Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz)) { out.nan.push({ e, i, st }); break; }
        if (p.x < 0.4 - 1e-6 || p.x > 119.6 + 1e-6 || p.z < 0.4 - 1e-6 || p.z > 159.6 + 1e-6 || p.y > 90 - (p.crouching ? 1.2 : 1.8) + 1e-6) out.outOfRoom.push({ e, i, st, pos: T.pos() });
        if (p.y < -1e-6) out.belowFloor.push({ e, i, st, pos: T.pos() });
        out.maxY = Math.max(out.maxY, p.y);
        const deep = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.66 });
        if (deep.length) { const k = deep.join('+'); if (!out.deep[k]) out.deep[k] = { n: 0, first: { e, i, st, pos: T.pos(), prev: [before.x, before.y, before.z], onGround: p.onGround, climbing: p.climbing, wasClimbing: before.climbing, inp } }; out.deep[k].n++; }
        // independent fall-damage bookkeeping: peak height since last support (ground or string)
        if (G.damageLog.length > dmgSeen) {
          for (let k = dmgSeen; k < G.damageLog.length; k++) {
            const d = G.damageLog[k];
            // the respawn (death) moves the player, so compare against the height just before this tick
            const landY = p.health === 100 && hp - d.amount <= 0 ? null : p.y;
            const fall = landY === null ? null : peak - landY;
            const expect = fall === null ? null : Math.max(0, (fall - 10) * 5);
            if (d.cause !== 'fall' || d.amount <= 0 || (expect !== null && Math.abs(expect - d.amount) > 0.75)) out.badDamage.push({ e, i, st, d, myPeak: peak, landY, expect });
            if (hp - d.amount <= 0) { out.deaths++; died = true; }
          }
          dmgSeen = G.damageLog.length;
        }
        if (died) break;
        if (p.onGround || p.climbing) peak = p.y; else peak = Math.max(peak, p.y);
        if (before.onGround && !p.onGround && !p.climbing) peak = Math.max(before.y, p.y);
        hp = p.health;
      }
      if (G.rescueLog.length) out.rescues.push({ e, st, log: G.rescueLog.slice(0, 2) });
      // wedge check: settle, then try 8 directions for 0.6 s each (with a jump); if none moves 0.5, we are wedged
      if (!died) {
        G.clearInput(); for (let i = 0; i < 400 && !(T.st().onGround || T.st().climbing); i++) G.step(DT);
        const q = T.st();
        if (q.onGround) {
          let best = 0;
          for (let a = 0; a < 8 && best < 0.5; a++) {
            G.teleport(q.x, q.y, q.z, a * Math.PI / 4, 0); G.setInput({ forward: true }); G.step(0.6); G.clearInput();
            const w = T.st(); best = Math.max(best, Math.hypot(w.x - q.x, w.z - q.z) + Math.abs(w.y - q.y));
          }
          if (best < 0.5) out.wedged.push({ e, st, at: [q.x, q.y, q.z], best });
        }
      }
    }
    return out;
  }, { SEED, EPISODES });
  const short = (a, n = 5) => JSON.stringify(a.slice(0, n)).slice(0, 1500);
  console.log(`seed ${SEED}: episodes ${res.episodes} (skipped ${res.startsSkipped}), ticks ${res.ticks}, deaths ${res.deaths}, max y ${res.maxY.toFixed(2)}`);
  console.log('out of room:', res.outOfRoom.length, short(res.outOfRoom));
  console.log('below floor:', res.belowFloor.length, short(res.belowFloor));
  console.log('safety-net rescues:', res.rescues.length, short(res.rescues));
  console.log('NaN:', res.nan.length, short(res.nan));
  console.log('wedged:', res.wedged.length, short(res.wedged));
  console.log('fall damage mismatches:', res.badDamage.length, short(res.badDamage));
  const dk = Object.keys(res.deep);
  console.log('inside a solid (distinct colliders):', dk.length);
  for (const k of dk) console.log('  ', k, 'x' + res.deep[k].n, JSON.stringify(res.deep[k].first).slice(0, 600));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
