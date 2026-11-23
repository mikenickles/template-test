// Round 3A checks 4 and part of 1/2: the 16.8 carry-overs, soldier hit volumes, bodies, chevrons, range(), and a player
// fuzz around the track (random movement, jumping, crouching, firing and throwing near and on the train) that counts
// trainRescueLog entries, damage from anything but falls and own grenades, car overlaps and leaving the room.
// Usage: node bug_r3a_05_soldiers_carry.cjs [seed] [episodes]. Every loop is tick-limited.
const { boot } = require('./bug_r3a_lib.cjs');
const SEED = +(process.argv[2] || 3), EPIS = +(process.argv[3] || 600);

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(({ SEED, EPIS }) => {
    const G = __game, DT = 1 / 60, N = G.waypoints.nodes, out = {};
    const r2 = (a) => a.map((v) => +(+v).toFixed(2));
    // ---- carry-overs ----
    const C = {};
    G.selectWeapon('sniper'); G.teleport(60, 0, 100, 0, 0); G.step(1.5); G.setInput({ scope: true }); G.step(0.5);
    G.fire(); let maxTr = 0; for (let i = 0; i < 10; i++) { maxTr = Math.max(maxTr, G.fxStats().tracers); G.step(DT); } C.tracersAfterScopedShot = maxTr; G.clearInput(); G.step(1.5);
    G.fire(); maxTr = 0; for (let i = 0; i < 10; i++) { maxTr = Math.max(maxTr, G.fxStats().tracers); G.step(DT); } C.tracersAfterUnscopedShot = maxTr;
    G.selectWeapon('rifle'); G.step(1); G.fire(); maxTr = 0; for (let i = 0; i < 6; i++) { maxTr = Math.max(maxTr, G.fxStats().tracers); G.step(DT); } C.tracersAfterRifleShot = maxTr;
    G.give('grenade'); C.handBefore = G.fxStats().handVisible; G.setInput({ grenade: true }); G.step(0.3); C.handWhileAiming = G.fxStats().handVisible; G.setInput({ grenade: false }); G.step(0.3); C.handAfterThrow = G.fxStats().handVisible; G.step(2.2);
    const A = G.CONFIG.audio; C.audio = { jump: JSON.stringify(A.sounds && A.sounds.jump).slice(0, 200), pistol: JSON.stringify(A.sounds && A.sounds.shot_pistol).slice(0, 300) };
    C.crayons = G.colliders.filter((c) => /crayon/.test(c.id)).map((c) => `${c.id} z ${c.z0}..${c.z1} y ${c.y0}..${c.y1}`);
    C.tunnelRoof = G.colliders.filter((c) => c.id === 'tunnel.roof').map((c) => `y ${c.y0}..${c.y1}`);
    // a player standing on a 5-high roof gets scraped, a crouched one rides: covered by bug_r3a_01 section D
    out.carry = C;

    // ---- soldiers: hit volumes, bodies, chevrons, range ----
    const S = {};
    S.targetsByDefault = G.state().targets.length; G.range(true); S.targetsWithRange = G.state().targets.length; G.range(false); S.targetsAfterRangeOff = G.state().targets.length;
    G.removeBots(); const tan = G.spawnBot('tan', 'n.c.3'); G.step(0.5);
    const tb = G.state().bots.find((b) => b.id === tan); G.selectWeapon('pistol'); G.step(0.6);
    G.teleport(tb.pos[0], 0, tb.pos[2] + 8, 0, 0); G.step(0.1);
    const shots = {};
    for (const [zone, y] of [['head', 1.6], ['body', 0.9], ['above', 1.95], ['beside', null]]) {
      const b = G.state().bots.find((q) => q.id === tan); G.give('ammo');
      if (y === null) G.lookAt(b.pos[0] + 0.7, 1.0, b.pos[2]); else G.lookAt(b.pos[0], b.pos[1] + y, b.pos[2]);
      const e = G.fire(); G.step(0.25); shots[zone] = e && { hit: e.hit, zone: e.zone, damage: e.damage, kind: e.kind };
    }
    S.shotsAtBot = shots; S.botHpAfter = G.state().bots.find((q) => q.id === tan).hp;
    S.killBot = G.killBot(tan); G.step(0.5); const dead = G.state().bots.find((q) => q.id === tan); S.deadState = dead && { dead: dead.dead, hp: dead.hp, pos: r2(dead.pos) };
    if (dead) { G.lookAt(dead.pos[0], 0.4, dead.pos[2]); const e = G.fire(); S.shotThroughBody = e && e.hit; G.teleport(dead.pos[0], 0, dead.pos[2] + 3, 0, 0); G.setInput({ forward: true }); G.step(1.5); G.clearInput(); S.walkedThroughBodyTo = r2([G.state().player.z]); }
    // chevrons: green teammate near with line of sight, far, behind a wall; tan enemy near
    G.removeBots(); G.teleport(60, 0, 100, 0, 0); G.step(0.1);
    const near = G.spawnBot('green', 's.c.3'), enemy = G.spawnBot('tan', 's.c.4'), far = G.spawnBot('green', 'n.f.spawn'), hidden = G.spawnBot('green', 's.f.spawn'); G.step(0.5);
    const ch = {}; for (const b of G.state().bots) ch[b.id === near ? 'nearTeammate' : b.id === enemy ? 'nearEnemy' : b.id === far ? 'farTeammate' : 'teammateInsideTanFort'] = { chevron: b.chevron, dist: +Math.hypot(b.pos[0] - 60, b.pos[2] - 100).toFixed(1), pos: r2(b.pos) };
    S.chevrons = ch; G.removeBots();
    // raycast hook at a soldier and at a range dummy
    { const id = G.spawnBot('green', 'n.c.3'); G.step(0.5); const b = G.state().bots.find((q) => q.id === id); G.teleport(b.pos[0], 0, b.pos[2] + 8, 0, 0); G.step(DT);
      const eye = [b.pos[0], 1.6, b.pos[2] + 8], d = [0, b.pos[1] + 1.6 - 1.6, -8];
      try { const r = G.raycast(eye, d); S.raycastAtSoldier = r && { id: r.id, kind: r.kind, zone: r.zone, d: +r.distance.toFixed(2) }; } catch (err) { S.raycastAtSoldier = 'THROWS ' + String(err) + ' | eye ' + JSON.stringify(eye) + ' dir ' + JSON.stringify(d.map((v) => +v.toFixed(3))); }
      G.removeBots(); G.range(true); G.teleport(60, 0, 116, 0, 0); G.step(DT);
      try { const r = G.raycast([60, 1.6, 116], [0, -0.1, -1]); S.raycastAtDummy = r && { id: r.id, kind: r.kind, zone: r.zone }; } catch (err) { S.raycastAtDummy = 'THROWS ' + String(err); }
      G.range(false); }
    // chevrons against my own line of sight (G.fire is not used; my march through static solids from eye to the chevron)
    { const ids = Object.keys(N), rnd = R2.rng(9), mism = []; let n = 0;
      for (let k = 0; k < 150; k++) { G.removeBots(); const pn = N[ids[Math.floor(rnd() * ids.length)]]; G.teleport(pn[0], pn[1], pn[2], 0, 0); G.step(DT);
        const id = G.spawnBot('green', ids[Math.floor(rnd() * ids.length)]); G.step(0.3); const b = G.state().bots.find((q) => q.id === id), p = G.state().player;
        const eye = [p.x, p.y + 1.6, p.z], dist = Math.hypot(b.pos[0] - p.x, b.pos[1] - p.y, b.pos[2] - p.z);
        const trainFree = (a, c) => { for (let t = 0.02; t < 0.98; t += 0.01) { const x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t; if (R3.inCar(x, y, z, 0.01, 0, 0).length || R3.cars().some((k) => k.type === 'engine' && (() => { const q = R3.local(k, x, z); return Math.abs(q.along) < 6 && Math.abs(q.lat) < 2 && y < 6; })())) return false; } return true; };
        const hd = [b.pos[0], b.pos[1] + 1.6, b.pos[2]], ab = [b.pos[0], b.pos[1] + 2.3, b.pos[2]];
        const losHead = R2.clearLine(eye, hd) && trainFree(eye, hd), losAbove = R2.clearLine(eye, ab) && trainFree(eye, ab);
        n++; if ((losHead && losAbove && dist < 58 && !b.chevron) || ((!losHead && !losAbove || dist > 62) && b.chevron)) mism.push({ player: pn, bot: r2(b.pos), dist: +dist.toFixed(1), losHead, losAbove, chevron: b.chevron }); }
      S.chevronCheck = { pairs: n, clearMismatches: mism.length, ex: mism.slice(0, 6) }; G.removeBots(); }
    out.soldiers = S;

    // ---- player fuzz around the track ----
    const rnd = R2.rng(SEED), F = { episodes: 0, ticks: 0, trainRescues: [], otherDamage: [], carOverlap: 0, maxDepth: 0, outRoom: 0, rescues: 0, rideTicks: 0, nan: 0 };
    const nearNodes = Object.values(N).filter((n) => n[0] > 30 && n[0] < 90 && n[2] > 25 && n[2] < 135);
    for (let e = 0; e < EPIS; e++) {
      const s = rnd() * R3.L, p = R3.point(s), lat = (rnd() - 0.5) * 9;
      let st = rnd() < 0.7 ? [p.x + lat * Math.cos(p.yaw), 0, p.z - lat * Math.sin(p.yaw)] : nearNodes[Math.floor(rnd() * nearNodes.length)].slice();
      if (T.solidAt(st[0], st[1], st[2], 1.8, { lift: 0 }).length) continue;
      if (R3.inCar(st[0], st[1], st[2]).length) continue;
      G.clearInput(); G.give('health'); G.give('ammo'); G.give('grenade'); G.damageLog.length = 0; G.rescueLog.length = 0; G.trainRescueLog.length = 0;
      G.teleport(st[0], st[1], st[2], rnd() * 6.283, 0); F.episodes++;
      let inp = {}, hold = 0, yaw = rnd() * 6.283;
      for (let i = 0; i < 300 + Math.floor(rnd() * 600); i++) {
        if (hold-- <= 0) { hold = 5 + Math.floor(rnd() * 50); inp = { forward: rnd() < 0.6, back: rnd() < 0.1, left: rnd() < 0.2, right: rnd() < 0.2, jump: rnd() < 0.35, sprint: rnd() < 0.3, crouch: rnd() < 0.25, fire: rnd() < 0.3, grenade: rnd() < 0.15 }; yaw += (rnd() - 0.5) * 3; G.look(yaw, (rnd() - 0.5) * 1.5); G.clearInput(); G.setInput(inp); if (rnd() < 0.2) G.give('grenade'); }
        if (inp.jump) G.setInput({ jump: i % 20 < 2 });
        G.step(DT); F.ticks++;
        const q = G.state().player;
        if (!Number.isFinite(q.x + q.y + q.z)) { F.nan++; break; }
        if (G.state().riding) F.rideTicks++;
        const ic = R3.inCar(q.x, q.y, q.z, q.crouching ? 1.2 : 1.8); if (ic.length) { F.carOverlap++; F.maxDepth = Math.max(F.maxDepth, ...ic.map((k) => k.depth)); }
        if (q.x < 0.39 || q.x > 119.61 || q.z < 0.39 || q.z > 159.61) F.outRoom++;
      }
      for (const d of G.damageLog) if (d.cause !== 'fall' && d.cause !== 'grenade') F.otherDamage.push(d);
      if (G.trainRescueLog.length && F.trainRescues.length < 10) F.trainRescues.push(...G.trainRescueLog.slice(0, 2));
      F.trainRescueCount = (F.trainRescueCount || 0) + G.trainRescueLog.length; F.rescues += G.rescueLog.length;
    }
    out.fuzz = F;
    return out;
  }, { SEED, EPIS });
  console.log('CARRY-OVERS', JSON.stringify(out.carry, null, 1));
  console.log('SOLDIERS', JSON.stringify(out.soldiers, null, 1));
  const F = out.fuzz;
  console.log(`PLAYER FUZZ near the track seed ${SEED}: ${F.episodes} episodes, ${F.ticks} ticks, riding ${F.rideTicks} ticks | trainRescueLog entries ${F.trainRescueCount || 0} | damage other than fall/own grenade ${F.otherDamage.length} | ticks overlapping a car >5 cm ${F.carOverlap} (max ${F.maxDepth.toFixed(3)}) | out of room ${F.outRoom} | room rescues ${F.rescues} | NaN ${F.nan}`);
  for (const r of F.trainRescues) console.log('   trainRescue', JSON.stringify(r));
  for (const r of F.otherDamage.slice(0, 5)) console.log('   damage', JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
