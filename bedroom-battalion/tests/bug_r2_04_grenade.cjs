// Round 2 check 5: the grenade. Every live grenade is watched on every tick (G.grenades) against my own
// point-in-solid test and the room box. Blast damage is recomputed with my own line-of-sight march. Tick-limited.
const { boot } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const SEED = +(process.argv[2] || 3), THROWS = +(process.argv[3] || 1200);

(async () => {
  const { browser, page, errors } = await boot();
  await page.evaluate(installR2);
  const out = await page.evaluate(({ SEED, THROWS }) => {
    const G = __game, DT = 1 / 60, out = {}, K = G.CONFIG.grenade;
    const prep = () => { G.clearInput(); G.give('health'); G.give('grenade'); G.give('ammo'); G.resetTargets(); G.shotLog.length = 0; G.audioLog.length = 0; G.damageLog.length = 0; G.rescueLog.length = 0; };
    // throw now and follow the grenade until it bursts. Returns the trace summary.
    const follow = (hold = 0.1, input = null) => {
      const before = G.grenades.length;
      G.setInput(Object.assign({ grenade: true }, input || {})); for (let i = 0; i < Math.max(1, Math.round(hold * 60)); i++) G.step(DT);
      G.setInput({ grenade: false }); G.step(DT);
      if (G.grenades.length <= before) return { thrown: false };
      const o = G.grenades[G.grenades.length - 1];
      const r = { thrown: true, start: [o.x, o.y, o.z], startInside: R2.inSolid(o.x, o.y, o.z, 0.01), inside: null, left: null, ticks: 1, last: null, bounces: 0, maxSpeed: 0, rest: false };
      let pvx = o.vx, pvy = o.vy, pvz = o.vz;
      if (r.startInside && !r.inside) r.inside = { tick: 0, pos: r.start, id: r.startInside };
      for (let i = 0; i < 200; i++) {
        r.last = [o.x, o.y, o.z];
        const live = G.grenades.includes(o);
        if (!live) break;
        const id = R2.inSolid(o.x, o.y, o.z, 0.02);
        if (id && id !== 'outside' && !r.inside) r.inside = { tick: i, pos: [+o.x.toFixed(3), +o.y.toFixed(3), +o.z.toFixed(3)], id };
        if ((o.x < 0 || o.x > 120 || o.z < 0 || o.z > 160 || o.y < 0 || o.y > 90 || !Number.isFinite(o.x + o.y + o.z)) && !r.left) r.left = { tick: i, pos: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)] };
        if (o.rest) r.rest = true;
        G.step(DT); r.ticks++;
        const dv = Math.hypot(o.vx - pvx, o.vy - (pvy - 22 * DT), o.vz - pvz); if (dv > 0.5) r.bounces++;
        r.maxSpeed = Math.max(r.maxSpeed, Math.hypot(o.vx, o.vy, o.vz)); pvx = o.vx; pvy = o.vy; pvz = o.vz;
      }
      r.fuseSecs = +(r.ticks / 60).toFixed(3);
      return r;
    };
    const blastCheck = (burst) => {       // compare every blast entry in shotLog and the self damage with my own maths
      const b = [burst[0], burst[1] + 0.1, burst[2]], bad = [], got = {};
      for (const e of G.shotLog) if (e.weapon === 'grenade' && e.hit) got[e.hit] = e.damage;
      for (const t of G.state().targets) {
        const c = [t.pos[0], t.pos[1] + 0.9, t.pos[2]], d = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
        if (d >= 7.3) { if (got[t.id]) bad.push({ t: t.id, d, got: got[t.id], expect: 0 }); continue; }
        const clear = R2.clearLine(b, c), exp = clear && d < 7 ? 110 * (1 - d / 7) : 0, g = got[t.id] || 0;
        if (Math.abs(exp - g) > 1.2) bad.push({ t: t.id, d: +d.toFixed(2), got: g, expect: +exp.toFixed(1), clear, burst: b.map((v) => +v.toFixed(2)) });
      }
      return bad;
    };

    // ---- A. basics: one per life, give, hold time, fuse, pin / bounce / pop sounds, arc start ----
    prep(); G.teleport(60, 0, 100, 0, 0.3); G.step(0.3);
    const a1 = follow(0.5);
    out.basic = { first: { fuseSecs: a1.fuseSecs, bounces: a1.bounces, start: a1.start.map((v) => +v.toFixed(2)), last: a1.last.map((v) => +v.toFixed(2)) }, sounds: G.audioLog.map((s) => s.name).filter((n) => /grenade/.test(n)), countAfter: G.state().weapon.grenades };
    out.basic.secondWithoutGive = follow(0.1).thrown; out.basic.throwGrenadeHookWithNone = G.throwGrenade(0.2);
    out.basic.giveTwice = (G.give('grenade'), G.give('grenade'), G.state().weapon.grenades);
    const t0 = G.state().time; out.basic.throwGrenadeHook = G.throwGrenade(0.5); out.basic.hookAdvancedSecs = +(G.state().time - t0).toFixed(3); out.basic.liveAfterHook = G.grenades.length; G.step(2.2); out.basic.liveAfter2_2s = G.grenades.length;
    // launch speed and angle: first-tick velocity
    prep(); G.teleport(60, 0, 100, 0, 0); G.step(0.2); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(DT);
    { const o = G.grenades[0]; const sp = Math.hypot(o.vx, o.vy + 22 * DT, o.vz); out.basic.launch = { speed: +sp.toFixed(3), upDeg: +(Math.asin((o.vy + 22 * DT) / sp) * 180 / Math.PI).toFixed(2) }; G.step(2.2); }
    // held a long time before release: fuse runs from release
    prep(); G.teleport(60, 0, 100, 0, 0.3); const h = follow(4); out.basic.heldFourSecondsThenFuse = h.fuseSecs;
    // restitution: drop straight down from height and compare speeds across the first floor bounce
    prep(); G.teleport(60, 30, 100, 0, -1.54); G.setInput({ grenade: true }); G.step(DT); G.setInput({ grenade: false }); G.step(DT);
    { const o = G.grenades[0]; let pv = o.vy, rest = null; for (let i = 0; i < 115; i++) { G.step(DT); if (o.vy > 0 && pv < 0) { rest = { vyIn: +pv.toFixed(2), vyOut: +o.vy.toFixed(2), ratio: +(-o.vy / pv).toFixed(3) }; break; } pv = o.vy; } out.basic.floorBounce = rest; for (let i = 0; i < 400 && !G.state().player.onGround; i++) G.step(DT); G.step(2.5); }

    // ---- B. wall hugging: pressed against things, throwing into them ----
    out.hug = [];
    const hug = (name, pos, look, crouch) => {
      prep(); G.teleport(pos[0], pos[1], pos[2]); if (crouch) G.setInput({ crouch: true }); G.step(0.4); G.lookAt(look[0], look[1], look[2]);
      const r = follow(0.1, crouch ? { crouch: true } : null);
      const dead = G.damageLog.filter((d) => d.cause === 'grenade');
      out.hug.push({ name, start: r.start.map((v) => +v.toFixed(2)), startsInside: r.startInside, wentInside: r.inside, leftRoom: r.left, burstAt: r.last.map((v) => +v.toFixed(2)), selfDamage: dead.map((d) => +d.amount.toFixed(1)), targetsHit: G.shotLog.filter((e) => e.weapon === 'grenade' && e.hit).map((e) => e.hit + ':' + e.damage) });
    };
    hug('east room wall, level', [119.6, 0, 80.5], [130, 1.6, 80.5]);
    hug('north room wall, level', [80, 0, 0.4], [80, 1.6, -9]);
    hug('room corner SE, level', [119.6, 0, 159.6], [130, 1.6, 170]);
    hug('floor, straight down', [60, 0, 100], [60, -9, 100.01]);
    hug('Green fort front wall from inside, into the upper wall', [50, 0, 24.1], [50, 2.4, 30]);
    hug('Green fort front wall from inside, at the low wall (crouched)', [50, 0, 24.1], [50, 0.6, 30], true);
    hug('Tan fort wall from outside toward the dummy behind the slit', [66, 0, 133.6], [66, 0.9, 137]);
    hug('Tan fort wall from outside, upper wall', [66, 0, 133.6], [66, 2.4, 137]);
    hug('tunnel wall from outside (1 thick)', [72.2, 0, 80], [77, 1.6, 80]);
    hug('bed leg', [35.4, 0, 46.5], [30, 1.6, 46.5]);
    hug('desk leg', [94.6, 0, 56.2], [100, 1.6, 56.2]);
    hug('tower parapet (0.5 thick) from the tower top', [73.1, 7, 9.5], [80, 8.0, 9.5]);
    hug('stair guard from under L1 (0.6 thick)', [109, 0, 136], [100, 1.6, 136]);
    hug('under the skateboard low end, crouched, looking up', [89, 0, 52.9], [89, 9, 52.5], true);
    hug('under the skateboard, standing at the limit, looking up', [89, 0, 53.7], [89, 9, 53.3]);
    hug('under the bed looking up', [20, 0, 80], [20, 9, 80.3]);
    hug('ball (cylinder)', [54, 0, 95.2], [54, 1.6, 99]);
    hug('shelf post', [109.6, 0, 116.6], [100, 1.6, 116.6]);
    hug('alphabet block W-c', [36.4, 0, 70.5], [30, 1.6, 70.5]);
    hug('chair back panel from the seat, looking up at it', [86.6, 17, 80], [80, 20.8, 80]);

    // ---- C. random throws from everywhere, standing, moving and jumping ----
    const rnd = R2.rng(SEED), nodes = Object.values(G.waypoints.nodes);
    const S = { throws: 0, inside: [], left: [], fuse: {}, blastBad: [], selfHits: 0, deaths: 0, rest: 0, bounceTotal: 0, rescues: 0, startInside: 0, playerInside: 0 };
    for (let n = 0; n < THROWS; n++) {
      prep();
      const nd = nodes[Math.floor(rnd() * nodes.length)], mode = n % 4;
      G.teleport(nd[0] + (rnd() - 0.5), nd[1], nd[2] + (rnd() - 0.5), rnd() * 6.283, mode === 3 ? -1.2 - rnd() * 0.3 : (rnd() - 0.4) * 2.4); G.step(0.2);
      const inp = mode === 1 ? { forward: true, sprint: rnd() < 0.5 } : mode === 2 ? { forward: rnd() < 0.5, jump: true } : null;
      const r = follow(0.05 + rnd() * 0.3, inp); G.clearInput();
      if (!r.thrown) continue;
      S.throws++; S.bounceTotal += r.bounces; if (r.rest) S.rest++;
      if (r.startInside) S.startInside++;
      if (r.inside && S.inside.length < 10) S.inside.push({ from: [G.state().player.x, G.state().player.y, G.state().player.z].map((v) => +v.toFixed(2)), ...r.inside, start: r.start.map((v) => +v.toFixed(2)) });
      if (r.inside) S.insideCount = (S.insideCount || 0) + 1;
      if (r.left) { S.leftCount = (S.leftCount || 0) + 1; if (S.left.length < 10) S.left.push({ node: nd, ...r.left, start: r.start.map((v) => +v.toFixed(2)) }); }
      S.fuse[r.fuseSecs] = (S.fuse[r.fuseSecs] || 0) + 1;
      const self = G.damageLog.filter((d) => d.cause === 'grenade'); if (self.length) S.selfHits++;
      if (!r.inside && !r.left) { const bad = blastCheck(r.last); if (bad.length && S.blastBad.length < 8) S.blastBad.push(bad[0]); if (bad.length) S.blastBadCount = (S.blastBadCount || 0) + 1; }
      S.rescues += G.rescueLog.length;
      for (let i = 0; i < 300 && !G.state().player.onGround && !G.state().player.climbing; i++) G.step(DT);
    }
    out.random = S;

    // ---- D. damage against distance on open floor: drop at the feet next to a dummy, then step back ----
    out.distance = [];
    for (const dist of [0.6, 1.5, 3, 4.5, 6, 6.8, 7.2]) {
      prep(); G.teleport(60, 0, 126 + dist, 0, -1.54); G.step(0.3);       // dummy at (60, 0, 126)
      const r = follow(0.05);
      const b = [r.last[0], r.last[1] + 0.1, r.last[2]], d = Math.hypot(60 - b[0], 0.9 - b[1], 126 - b[2]);
      const e = G.shotLog.find((s) => s.weapon === 'grenade' && s.hit), self = G.damageLog.find((q) => q.cause === 'grenade');
      out.distance.push({ stoodAt: dist, burst: b.map((v) => +v.toFixed(2)), toDummyChest: +d.toFixed(3), logged: e ? [e.damage, e.distance] : null, expect: +Math.max(0, 110 * (1 - d / 7)).toFixed(2), selfDamage: self ? +self.amount.toFixed(1) : 0, playerDied: G.state().player.z === 20 });
    }
    // ---- E. cover: dummy at (60,0,34) with the jumbo crayon / fort wall between; dummy behind the Tan slit ----
    out.cover = [];
    const cover = (name, pos, look) => { prep(); G.teleport(pos[0], pos[1], pos[2]); G.step(0.3); G.lookAt(look[0], look[1], look[2]); const r = follow(0.05); const bad = blastCheck(r.last); out.cover.push({ name, burst: r.last.map((v) => +v.toFixed(2)), hits: G.shotLog.filter((e) => e.weapon === 'grenade' && e.hit).map((e) => e.hit + ' ' + e.damage + ' @' + e.distance), disagreesWithMyLineOfSight: bad }); };
    cover('outside the Tan front wall, dummy 21 is 3 units behind the slit wall', [66, 0, 131], [66, -3, 133.5]);
    cover('inside the Tan fort beside dummy 21', [64, 0, 139], [64.5, -3, 138]);
    cover('behind the truck from dummy 2 (60,0,50)', [66, 0, 55.5], [66, -4, 55]);
    cover('under the bed below the bed-top dummy (27,18,80)', [27, 0, 80], [27, -5, 80.2]);
    cover('on the bed beside it', [29, 18, 80], [28.5, 10, 80]);
    cover('floor under the tunnel roof dummy (77,8,80)', [77, 0, 80], [77, -5, 80.2]);
    cover('ruin floor next to the platform dummy (60,1.2,78), behind a brick', [56.9, 0, 75], [57, -4, 75.2]);
    return out;
  }, { SEED, THROWS });
  console.log('A. basics:', JSON.stringify(out.basic));
  console.log('B. pressed against geometry:'); for (const r of out.hug) console.log(`   ${r.startsInside || r.wentInside || r.leftRoom ? '!!' : '  '} ${r.name}: ${JSON.stringify({ start: r.start, startsInside: r.startsInside, wentInside: r.wentInside, leftRoom: r.leftRoom, burstAt: r.burstAt, selfDamage: r.selfDamage, targetsHit: r.targetsHit })}`);
  const S = out.random;
  console.log(`C. random throws: ${S.throws} | started inside a solid: ${S.startInside} | inside a solid at some tick: ${S.insideCount || 0} | left the room: ${S.leftCount || 0} | came to rest: ${S.rest} | bounces: ${S.bounceTotal} | self hits: ${S.selfHits} | player rescues: ${S.rescues} | blast results that disagree with my line of sight: ${S.blastBadCount || 0}`);
  console.log('   fuse seconds histogram:', JSON.stringify(S.fuse));
  for (const x of S.inside) console.log('   INSIDE', JSON.stringify(x));
  for (const x of S.left) console.log('   LEFT', JSON.stringify(x));
  for (const x of S.blastBad) console.log('   BLAST', JSON.stringify(x));
  console.log('D. damage against distance:'); for (const r of out.distance) console.log('   ', JSON.stringify(r));
  console.log('E. cover:'); for (const r of out.cover) console.log('   ', JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
