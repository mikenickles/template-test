// Round 2 re-check: regression. validateWaypoints(); all routes in __game.routes up and down, walk and sprint, with my
// own end checks (not walkPath's ok); then a fuzz of random movement, firing, scoping, switching and throwing that
// checks the player and every grenade against the room box on every tick, and logs context for any tick where the
// player is more than 5 cm inside a solid. Usage: node bug_r2b_07_regress.cjs [seed] [episodes]. Tick-limited.
const { boot } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const SEED = +(process.argv[2] || 31), EPISODES = +(process.argv[3] || 800);

(async () => {
  const { browser, page, errors } = await boot();
  await page.evaluate(installR2);
  const out = await page.evaluate(({ SEED, EPISODES }) => {
    const G = __game, DT = 1 / 60, out = {}, N = G.waypoints.nodes;
    out.validate = G.validateWaypoints();
    out.routeCount = Object.keys(G.routes).length;
    const oneWay = new Set(G.waypoints.edges.filter((e) => e.oneWay).map((e) => e.a + '>' + e.b));
    out.routes = [];
    for (const [id, ids] of Object.entries(G.routes)) for (const dir of ['up', 'down']) for (const sprint of [false, true]) {
      const path = dir === 'up' ? ids.slice() : ids.slice().reverse();
      const backward = dir === 'down' && path.some((n, i) => i && oneWay.has(n + '>' + path[i - 1]));
      G.clearInput(); G.give('health'); G.damageLog.length = 0; G.rescueLog.length = 0;
      const s0 = N[path[0]]; G.teleport(s0[0], s0[1], s0[2]); G.step(0.2);
      const r = G.walkPath(path, { sprint, timeout: 90 });
      const p = G.state().player, end = N[path[path.length - 1]];
      const near = Math.hypot(p.x - end[0], p.z - end[2]) <= 0.8 && Math.abs(p.y - end[1]) <= 0.35 && p.onGround;
      const dmg = G.damageLog.map((d) => +d.amount.toFixed(1));
      const verdict = backward ? (r.ok === false ? 'refused (one-way, expected)' : 'DROVE A ONE-WAY EDGE BACKWARD') : near && !dmg.length && !G.rescueLog.length ? 'ok' : 'FAIL';
      out.routes.push({ id, dir, gait: sprint ? 'sprint' : 'walk', verdict, hookOk: r.ok, t: +(+r.time || 0).toFixed(1), end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], want: end, dmg, rescues: G.rescueLog.length });
    }
    // ---- fuzz ----
    const rnd = R2.rng(SEED), pick = (a) => a[Math.floor(rnd() * a.length)], nodes = Object.values(N), names = ['rifle', 'smg', 'sniper', 'pistol'];
    const S = { episodes: 0, ticks: 0, playerOut: 0, playerOutEx: [], grenOut: 0, grenBorn: 0, grenInside: 0, grenEx: [], nan: 0, rescues: 0, deep: [], deepTicks: 0, ammoBad: 0, shots: 0, throws: 0 };
    for (let e = 0; e < EPISODES; e++) {
      const n = pick(nodes); const st = [n[0] + (rnd() - 0.5) * 2, n[1], n[2] + (rnd() - 0.5) * 2];
      if (T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length) continue;
      G.clearInput(); G.give('health'); G.give('ammo'); G.give('grenade'); G.rescueLog.length = 0; G.teleport(st[0], st[1], st[2], rnd() * 6.283, 0); S.episodes++;
      let inp = {}, hold = 0, yaw = rnd() * 6.283; const hist = [], seen = new Set();
      const len = 200 + Math.floor(rnd() * 500);
      for (let i = 0; i < len; i++) {
        if (hold-- <= 0) {
          hold = 3 + Math.floor(rnd() * 40);
          inp = { forward: rnd() < 0.65, back: rnd() < 0.12, left: rnd() < 0.2, right: rnd() < 0.2, jump: rnd() < 0.3, sprint: rnd() < 0.35, crouch: rnd() < 0.15, fire: rnd() < 0.55, scope: rnd() < 0.25, grenade: rnd() < 0.3, reload: rnd() < 0.08 };
          if (rnd() < 0.6) yaw += (rnd() - 0.5) * (rnd() < 0.2 ? 6.283 : 1.2);
          G.look(yaw, (rnd() - 0.5) * 3.08); G.clearInput(); G.setInput(inp);
          if (rnd() < 0.25) G.selectWeapon(pick(names)); if (rnd() < 0.2) G.give('grenade');
        }
        if (inp.jump && i % 9 === 0) G.setInput({ jump: false }); else if (inp.jump && i % 9 === 1) G.setInput({ jump: true });
        const lastShot = G.shotLog[G.shotLog.length - 1];
        G.step(DT); S.ticks++;
        const p = G.state().player, w = G.state().weapon, C = G.CONFIG.weapons[w.name];
        hist.push({ i, pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], v: [+p.vx.toFixed(2), +p.vy.toFixed(2), +p.vz.toFixed(2)], g: p.onGround, cl: p.climbing, cr: p.crouching, inp: Object.keys(inp).filter((k) => inp[k]).join(',') }); if (hist.length > 6) hist.shift();
        if (!Number.isFinite(p.x + p.y + p.z)) { S.nan++; break; }
        if (p.x < 0.4 - 1e-6 || p.x > 119.6 + 1e-6 || p.z < 0.4 - 1e-6 || p.z > 159.6 + 1e-6 || p.y < -1e-6 || p.y > 88.8) { S.playerOut++; if (S.playerOutEx.length < 4) S.playerOutEx.push(hist.slice()); }
        const deep = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.66, eps: 0.05 });
        if (deep.length) { S.deepTicks++; if (S.deep.length < 6) S.deep.push({ e, hits: deep, hist: hist.slice() }); }
        if (w.mag < 0 || w.mag > C.mag || w.reserve < 0 || w.reserve > C.reserve) S.ammoBad++;
        for (const o of G.grenades) {
          const first = !seen.has(o); if (first) { seen.add(o); S.throws++; }
          if (o.x < 0 || o.x > 120 || o.z < 0 || o.z > 160 || o.y < 0 || o.y > 90 || !Number.isFinite(o.x + o.y + o.z)) { S.grenOut++; if (S.grenEx.length < 4) S.grenEx.push({ e, first, pos: [o.x, o.y, o.z] }); continue; }
          const id = R2.inSolid(o.x, o.y, o.z, 0.02); if (id) { if (first) S.grenBorn++; else S.grenInside++; if (S.grenEx.length < 4) S.grenEx.push({ e, first, id, pos: [o.x, o.y, o.z] }); }
        }
        if (G.shotLog[G.shotLog.length - 1] !== lastShot) S.shots++;
      }
      S.rescues += G.rescueLog.length;
      G.clearInput(); G.step(2.1);
    }
    out.fuzz = S;
    return out;
  }, { SEED, EPISODES });
  console.log('validateWaypoints():', JSON.stringify(out.validate));
  console.log(`routes in __game.routes: ${out.routeCount}`);
  const bad = out.routes.filter((r) => r.verdict !== 'ok' && !r.verdict.startsWith('refused'));
  for (const r of out.routes) console.log(`   ${r.verdict === 'ok' ? 'ok ' : r.verdict.startsWith('refused') ? '-- ' : '!! '}${r.id.padEnd(13)} ${r.dir.padEnd(4)} ${r.gait.padEnd(6)} ${r.verdict} t=${r.t} end=${JSON.stringify(r.end)} want=${JSON.stringify(r.want)} dmg=${JSON.stringify(r.dmg)} rescues=${r.rescues}`);
  console.log(`route legs: ${out.routes.length}, ok ${out.routes.filter((r) => r.verdict === 'ok').length}, one-way refused ${out.routes.filter((r) => r.verdict.startsWith('refused')).length}, bad ${bad.length}`);
  const S = out.fuzz;
  console.log(`fuzz seed ${SEED}: ${S.episodes} episodes, ${S.ticks} ticks, ${S.shots} ticks with shots, ${S.throws} grenades | player out of room ${S.playerOut} | rescues ${S.rescues} | NaN ${S.nan} | ammo out of range ${S.ammoBad} | grenades outside ${S.grenOut}, born in a solid ${S.grenBorn}, entered a solid ${S.grenInside} | ticks >5 cm inside a solid ${S.deepTicks}`);
  for (const x of S.playerOutEx) console.log('   OUT', JSON.stringify(x));
  for (const x of S.grenEx) console.log('   GREN', JSON.stringify(x));
  for (const x of S.deep) console.log('   DEEP', JSON.stringify(x));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
