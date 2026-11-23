// Round 2 re-check: the grenade (BUGS R2-1, R2-3, DESIGN 15.6 rules). Every live grenade is checked on every tick
// against my own point-in-solid test (bug_r2_lib R2.inSolid) and the room box. Blast damage is recomputed with
// 140 x (1 - d / 7) and my own line-of-sight march. All loops are tick-limited.
// Usage: node bug_r2b_01_grenade.cjs [seed] [randomThrows] [sections, default ABCDEF]
const { boot } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const SEED = +(process.argv[2] || 5), THROWS = +(process.argv[3] || 2500), SECT = process.argv[4] || 'ABCDEF';

(async () => {
  const { browser, page, errors } = await boot();
  await page.evaluate(installR2);
  const out = await page.evaluate(({ SEED, THROWS, SECT }) => {
    const G = __game, DT = 1 / 60, out = {}, K = G.CONFIG.grenade, DMG = 140;
    const r3 = (a) => a.map((v) => +(+v).toFixed(3));
    const prep = () => { G.clearInput(); G.give('health'); G.give('grenade'); G.give('ammo'); G.resetTargets(); G.shotLog.length = 0; G.audioLog.length = 0; G.damageLog.length = 0; G.rescueLog.length = 0; };
    const outside = (o) => !Number.isFinite(o.x + o.y + o.z) || o.x < 0 || o.x > 120 || o.z < 0 || o.z > 160 || o.y < 0 || o.y > 90;
    // hold G for `hold` s with `input`, release, follow the grenade until it bursts (tick-limited)
    const follow = (hold = 0.1, input = null, onAim = null) => {
      const before = G.grenades.slice();
      G.setInput(Object.assign({ grenade: true }, input || {})); for (let i = 0; i < Math.max(1, Math.round(hold * 60)); i++) { if (onAim) onAim(i); G.step(DT); }
      const eye = (() => { const p = G.state().player; return [p.x, p.y + (p.crouching ? 1.0 : 1.6), p.z]; })();
      G.setInput({ grenade: false }); G.step(DT);
      const eye2 = (() => { const p = G.state().player; return [p.x, p.y + (p.crouching ? 1.0 : 1.6), p.z]; })();
      const o = G.grenades.find((g) => !before.includes(g));
      if (!o) return { thrown: false };
      const r = { thrown: true, eye, start: [o.x, o.y, o.z], startInside: R2.inSolid(o.x, o.y, o.z, 0.0), inside: null, left: null, leftLive: 0, ticks: 1, last: null, v0: [o.vx, o.vy, o.vz] };
      if (r.startInside === 'outside') r.left = { tick: 0, pos: r3(r.start) };
      // eye to start segment must be clear (created at the eye and swept)
      // (the eye is sampled before and after the release tick; blocked only if both lines are blocked)
      r.sweepBlocked = !R2.clearLine(eye, r.start) && !R2.clearLine(eye2, r.start);
      for (let i = 0; i < 200; i++) {
        if (!G.grenades.includes(o)) break;
        r.last = [o.x, o.y, o.z]; r.lastV = [o.vx, o.vy, o.vz];
        if (outside(o)) { if (!r.left) r.left = { tick: i, pos: r3(r.last) }; r.leftLive++; }
        else { const id = R2.inSolid(o.x, o.y, o.z, 0.02); if (id && !r.inside) r.inside = { tick: i, pos: r3(r.last), id }; }
        G.step(DT); r.ticks++;
      }
      r.fuseSecs = +(r.ticks / 60).toFixed(3);
      return r;
    };
    // the burst may happen before or after the last tick's move: accept either position
    const blastCheck = (burst, v) => {
      const a = blastCheck1(burst); if (!a.length || !v) return a;
      const b = blastCheck1([burst[0] + v[0] * DT, burst[1] + v[1] * DT, burst[2] + v[2] * DT]); return b.length < a.length ? b : a;
    };
    const blastCheck1 = (burst) => {
      const b = [burst[0], burst[1] + 0.1, burst[2]], bad = [], got = {};
      for (const e of G.shotLog) if (e.weapon === 'grenade' && e.hit) got[e.hit] = e.damage;
      for (const t of G.state().targets) {
        const c = [t.pos[0], t.pos[1] + 0.9, t.pos[2]], d = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
        if (d >= 7.3) { if (got[t.id]) bad.push({ t: t.id, d, got: got[t.id], expect: 0 }); continue; }
        const clear = R2.clearLine(b, c), exp = clear && d < 7 ? DMG * (1 - d / 7) : 0, g = got[t.id] || 0;
        if (Math.abs(exp - g) > 1.5) bad.push({ t: t.id, d: +d.toFixed(2), got: g, expect: +exp.toFixed(1), clear, burst: r3(b) });
      }
      return bad;
    };
    const summary = (r) => ({ start: r3(r.start), startInside: r.startInside, sweepBlocked: r.sweepBlocked, wentInside: r.inside, leftRoom: r.left, burstAt: r.last && r3(r.last) });

    // ---- A. launch angle: view pitch + 10 deg, speed 18 ----
    if (SECT.includes('A')) {
      out.launch = [];
      for (const deg of [-80, -45, -22.9, -10, 0, 10, 22.9, 45, 70, 80]) {
        prep(); G.teleport(60, 0, 100, 0, deg * Math.PI / 180); G.step(0.2);
        const r = follow(0.1);
        const vy = r.v0[1] + 22 * DT, sp = Math.hypot(r.v0[0], vy, r.v0[2]);
        out.launch.push({ viewDeg: deg, launchDeg: +(Math.asin(vy / sp) * 180 / Math.PI).toFixed(2), speed: +sp.toFixed(3), clampedAt: deg + 10 > 90 ? '>90' : '' });
        G.step(2.2);
      }
    }
    // ---- B. pressed against things ----
    if (SECT.includes('B')) {
      out.hug = [];
      const hug = (name, pos, look, crouch, walkYaw) => {
        prep(); G.teleport(pos[0], pos[1], pos[2]);
        if (walkYaw !== undefined) { G.look(walkYaw, 0); G.setInput({ forward: true, crouch: !!crouch }); G.step(0.5); G.clearInput(); }
        if (crouch) G.setInput({ crouch: true }); G.step(0.4); G.lookAt(look[0], look[1], look[2]);
        const r = follow(0.1, crouch ? { crouch: true } : null);
        out.hug.push({ name, ...summary(r), self: G.damageLog.filter((d) => d.cause === 'grenade').map((d) => +d.amount.toFixed(1)), hits: G.shotLog.filter((e) => e.weapon === 'grenade' && e.hit).map((e) => e.hit + ':' + e.damage) });
        G.clearInput(); G.step(0.5);
      };
      hug('east room wall, level', [119.6, 0, 80.5], [130, 1.6, 80.5]);
      hug('east room wall, looking 40 deg down into it', [119.6, 0, 80.5], [130, -6.8, 80.5]);
      hug('north room wall, level', [80, 0, 0.4], [80, 1.6, -9]);
      hug('west room wall, level', [0.4, 0, 80], [-9, 1.6, 80]);
      hug('south room wall, level', [40, 0, 159.6], [40, 1.6, 170]);
      hug('room corner SE', [119.6, 0, 159.6], [130, 1.6, 170]);
      hug('room corner NW', [0.4, 0, 0.4], [-10, 1.6, -10]);
      hug('room corner NE, looking up into it', [119.6, 0, 0.4], [130, 9, -10]);
      hug('floor, straight down', [60, 0, 100], [60, -9, 100.01]);
      hug('floor, crouched straight down', [60, 0, 100], [60, -9, 100.01], true);
      hug('ceiling: on the tall shelf top? jump-free: standing on L3, straight up', [112, 60, 139], [112, 99, 139.01]);
      hug('Green fort front wall from inside, upper wall', [50, 0, 24.1], [50, 2.4, 30]);
      hug('Green fort front wall from inside, low wall (crouched)', [50, 0, 24.1], [50, 0.6, 30], true);
      hug('Tan fort wall from outside toward dummy 21 (crouched)', [66, 0, 133.6], [66, 0.9, 137], true);
      hug('Tan fort wall from outside, upper wall', [66, 0, 133.6], [66, 2.4, 137]);
      hug('tunnel wall from outside (1 thick)', [72.2, 0, 80], [77, 1.6, 80]);
      hug('bed leg', [35.4, 0, 46.5], [30, 1.6, 46.5]);
      hug('desk leg', [94.6, 0, 56.2], [100, 1.6, 56.2]);
      hug('tower parapet from the tower top', [73.1, 7, 9.5], [80, 8.0, 9.5]);
      hug('stair guard from under L1', [109, 0, 136], [100, 1.6, 136]);
      hug('under the skateboard, crouched, looking up', [89, 0, 52.9], [89, 9, 52.5], true);
      hug('under the bed looking up', [20, 0, 80], [20, 9, 80.3]);
      hug('under the desk looking up', [105, 0, 80], [105, 30, 80.2]);
      hug('ball (cylinder)', [54, 0, 95.2], [54, 1.6, 99]);
      hug('shelf post', [109.6, 0, 116.6], [100, 1.6, 116.6]);
      hug('alphabet block W-c', [36.4, 0, 70.5], [30, 1.6, 70.5]);
      hug('chair back from the seat, looking up at it', [86.6, 17, 80], [80, 20.8, 80]);
      hug('desk apron from the ruler side', [95.0, 21, 70], [99, 22, 70]);
      // walk into the corner first, then throw into the corner diagonal
      hug('walked into the SW room corner, throw into it', [3, 0, 157], [-5, 1.6, 165], false, Math.atan2(3, -3));
      hug('walked into the bed leg corner, throw into it', [37, 0, 48], [30, 1.6, 44], false, Math.atan2(1, 1));
    }
    // ---- C. systematic: every box collider face, player pushed against it, throw into it at 5 pitches ----
    if (SECT.includes('C')) {
      const S = { throws: 0, startInside: 0, sweepBlocked: 0, inside: 0, left: 0, leftLiveTicks: 0, examples: [] };
      const boxes = G.colliders.filter((c) => c.kind === 'box' && !/^room\.(floor|ceiling)/.test(c.id));
      for (const c of boxes) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const px = dx === 1 ? c.x1 + 0.45 : dx === -1 ? c.x0 - 0.45 : (c.x0 + c.x1) / 2;
          const pz = dz === 1 ? c.z1 + 0.45 : dz === -1 ? c.z0 - 0.45 : (c.z0 + c.z1) / 2;
          if (px < 0.4 || px > 119.6 || pz < 0.4 || pz > 159.6) continue;
          // stand on whatever is below the face mid height (try face bottom, then floor)
          let py = null;
          for (const y of [Math.max(0, c.y0), 0]) { if (!T.solidAt(px, y, pz, 1.8, { lift: 0 }).length) { py = y; break; } }
          if (py === null) continue;
          for (const pitch of [-0.6, -0.25, 0, 0.3, 0.7]) {
            prep(); G.teleport(px, py, pz, Math.atan2(dx, dz), 0);
            G.setInput({ forward: true }); G.step(0.25); G.clearInput(); G.step(DT);
            G.look(Math.atan2(dx, dz), pitch);
            const r = follow(0.05, null, () => G.look(Math.atan2(dx, dz), pitch));
            if (!r.thrown) continue;
            S.throws++;
            const bad = r.startInside || r.inside || r.left || r.sweepBlocked;
            if (r.startInside) S.startInside++; if (r.sweepBlocked) S.sweepBlocked++; if (r.inside) S.inside++; if (r.left) S.left++; S.leftLiveTicks += r.leftLive;
            if (bad && S.examples.length < 12) S.examples.push({ face: c.id + ' ' + (dx ? (dx > 0 ? '+x' : '-x') : dz > 0 ? '+z' : '-z'), pitch, playerFeet: r3([px, py, pz]), ...summary(r) });
            for (let i = 0; i < 300 && !G.state().player.onGround && !G.state().player.climbing; i++) G.step(DT);
          }
        }
      }
      out.faces = { boxes: boxes.length, ...S };
    }
    // ---- D. random throws from everywhere; half of them walk into the nearest thing first ----
    if (SECT.includes('D')) {
      const rnd = R2.rng(SEED), nodes = Object.values(G.waypoints.nodes);
      const S = { throws: 0, notThrown: 0, startInside: 0, sweepBlocked: 0, inside: 0, left: 0, leftLiveTicks: 0, ex: [], fuse: {}, blastBad: 0, blastEx: [], rescues: 0, pressed: 0 };
      for (let n = 0; n < THROWS; n++) {
        prep();
        const nd = nodes[Math.floor(rnd() * nodes.length)], mode = n % 5;
        const yaw = rnd() * 6.283, pitch = mode === 4 ? (rnd() < 0.5 ? -1.2 - rnd() * 0.34 : 1.2 + rnd() * 0.34) : (rnd() - 0.45) * 2.6;
        G.teleport(nd[0] + (rnd() - 0.5) * 3, nd[1], nd[2] + (rnd() - 0.5) * 3, yaw, 0);
        if (T.inside().length) { G.teleport(nd[0], nd[1], nd[2], yaw, 0); }
        G.step(0.15);
        if (rnd() < 0.5) { S.pressed++; G.setInput({ forward: true, crouch: rnd() < 0.3, sprint: rnd() < 0.3 }); G.step(0.3 + rnd() * 1.5); }
        G.look(yaw, pitch);
        const inp = mode === 1 ? { forward: true, sprint: rnd() < 0.5 } : mode === 2 ? { forward: rnd() < 0.5, jump: true } : mode === 3 ? { crouch: true, forward: rnd() < 0.5 } : null;
        G.clearInput();
        const r = follow(0.05 + rnd() * 0.3, inp, () => G.look(yaw, pitch)); G.clearInput();
        if (!r.thrown) { S.notThrown++; continue; }
        S.throws++;
        if (r.startInside) S.startInside++; if (r.sweepBlocked) S.sweepBlocked++; if (r.inside) S.inside++; if (r.left) S.left++; S.leftLiveTicks += r.leftLive;
        if ((r.startInside || r.inside || r.left || r.sweepBlocked) && S.ex.length < 12) S.ex.push({ n, eye: r3(r.eye), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), inp, ...summary(r) });
        S.fuse[r.fuseSecs] = (S.fuse[r.fuseSecs] || 0) + 1;
        if (!r.inside && !r.left && r.last) { const bad = blastCheck(r.last, r.lastV); if (bad.length) { S.blastBad++; if (S.blastEx.length < 6) S.blastEx.push(bad[0]); } }
        S.rescues += G.rescueLog.length;
        for (let i = 0; i < 300 && !G.state().player.onGround && !G.state().player.climbing; i++) G.step(DT);
      }
      out.random = S;
    }
    // ---- E. removal outside the room box: move a live grenade out by hand and step ----
    if (SECT.includes('E')) {
      out.removal = [];
      for (const [name, pos] of [['x 121', [121, 5, 80]], ['x -1', [-1, 5, 80]], ['z 161', [60, 5, 161]], ['z -0.5', [60, 5, -0.5]], ['y 95', [60, 95, 80]], ['y -2', [60, -2, 80]], ['inside, control', [60, 5, 80]]]) {
        prep(); G.teleport(60, 0, 100, 0, 0.3); G.step(0.2); G.setInput({ grenade: true }); G.step(0.1); G.setInput({ grenade: false }); G.step(DT);
        const o = G.grenades[G.grenades.length - 1]; o.x = pos[0]; o.y = pos[1]; o.z = pos[2];
        G.step(DT); const live1 = G.grenades.includes(o); G.step(DT); const live2 = G.grenades.includes(o);
        const pops = G.audioLog.filter((a) => a.name === 'grenade_pop').length, hits = G.shotLog.filter((e) => e.weapon === 'grenade').length;
        out.removal.push({ name, liveAfter1Tick: live1, liveAfter2Ticks: live2, popSounds: pops, blastLogged: hits });
        G.step(2.2);
      }
    }
    // ---- F. damage against distance and cover (140 max, radius 7) ----
    if (SECT.includes('F')) {
      out.distance = [];
      for (const dist of [0.6, 1.5, 3, 4.5, 6, 6.8, 7.2]) {
        prep(); G.teleport(60, 0, 126 + dist, 0, -1.54); G.step(0.3);
        const r = follow(0.05);
        const b = [r.last[0], r.last[1] + 0.1, r.last[2]], d = Math.hypot(60 - b[0], 0.9 - b[1], 126 - b[2]);
        const e = G.shotLog.find((s) => s.weapon === 'grenade' && s.hit === 'target.6') || G.shotLog.find((s) => s.weapon === 'grenade' && s.hit), self = G.damageLog.find((q) => q.cause === 'grenade');
        out.distance.push({ stoodAt: dist, toDummyChest: +d.toFixed(3), logged: e ? [e.hit, e.damage, e.distance] : null, expect: +Math.max(0, DMG * (1 - d / 7)).toFixed(2), dummyHp: G.state().targets.find((t) => t.pos[2] === 126 && t.pos[0] === 60).hp, selfDamage: self ? +self.amount.toFixed(1) : 0 });
      }
      // centred burst on a full-health dummy: drop a grenade on its head from above
      prep(); G.teleport(60, 0, 111, 0, -1.54); G.step(0.3); { const r = follow(0.05); out.centredBurstNextTo = { burst: r3(r.last), dummy5: G.state().targets.find((t) => t.pos[2] === 110 && t.pos[0] === 60) }; }
      out.cover = [];
      const cover = (name, pos, look) => { prep(); G.teleport(pos[0], pos[1], pos[2]); G.step(0.3); G.lookAt(look[0], look[1], look[2]); const r = follow(0.05); out.cover.push({ name, burst: r3(r.last), hits: G.shotLog.filter((e) => e.weapon === 'grenade' && e.hit).map((e) => e.hit + ' ' + e.damage + ' @' + e.distance), disagreesWithMyLineOfSight: blastCheck(r.last, r.lastV) }); };
      cover('outside the Tan front wall, dummy 21 behind it', [66, 0, 131], [66, -3, 133.5]);
      cover('inside the Tan fort beside dummy 21', [64, 0, 139], [64.5, -3, 138]);
      cover('behind the truck from dummy (60,0,50)', [66, 0, 55.5], [66, -4, 55]);
      cover('under the bed below the bed-top dummy', [27, 0, 80], [27, -5, 80.2]);
      cover('on the bed beside it', [29, 18, 80], [28.5, 10, 80]);
      cover('floor under the tunnel roof dummy', [77, 0, 80], [77, -5, 80.2]);
      cover('ruin floor behind a brick', [56.9, 0, 75], [57, -4, 75.2]);
    }
    return out;
  }, { SEED, THROWS, SECT });
  if (out.launch) { console.log('A. launch angle (view pitch -> launch):'); for (const r of out.launch) console.log('   ', JSON.stringify(r)); }
  if (out.hug) { console.log('B. pressed against geometry:'); for (const r of out.hug) { const bad = r.startInside || r.wentInside || r.leftRoom || r.sweepBlocked; console.log(`   ${bad ? '!!' : 'ok'} ${r.name}: ${JSON.stringify(r)}`); } }
  if (out.faces) { const S = out.faces; console.log(`C. every box face (${S.boxes} boxes): ${S.throws} throws | born in a solid ${S.startInside} | eye-to-start blocked ${S.sweepBlocked} | entered a solid ${S.inside} | left room ${S.left} (live ticks outside ${S.leftLiveTicks})`); for (const x of S.examples) console.log('   !!', JSON.stringify(x)); }
  if (out.random) { const S = out.random; console.log(`D. random throws seed ${SEED}: ${S.throws} thrown (${S.notThrown} refused, ${S.pressed} after walking into something) | born in a solid ${S.startInside} | eye-to-start blocked ${S.sweepBlocked} | entered a solid ${S.inside} | left room ${S.left} (live ticks outside ${S.leftLiveTicks}) | blast disagreements ${S.blastBad} | rescues ${S.rescues}`); console.log('   fuse histogram', JSON.stringify(S.fuse)); for (const x of S.ex) console.log('   !!', JSON.stringify(x)); for (const x of S.blastEx) console.log('   BLAST', JSON.stringify(x)); }
  if (out.removal) { console.log('E. removal outside the room box:'); for (const r of out.removal) console.log('   ', JSON.stringify(r)); }
  if (out.distance) { console.log('F. damage against distance:'); for (const r of out.distance) console.log('   ', JSON.stringify(r)); console.log('   centred burst:', JSON.stringify(out.centredBurstNextTo)); console.log('   cover:'); for (const r of out.cover) console.log('     ', JSON.stringify(r)); }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
