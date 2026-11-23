// Round 1 re-check: the repro calls from BUGS.md findings 1, 2, 3, 5 on every string / both shelf stairs /
// the skateboard top, and the new geometry (ruler props, seat stoppers, stair guards). Every loop is tick-limited.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const snap = () => { const p = T.st(); return { pos: T.pos(), onGround: p.onGround, climbing: p.climbing, hp: +p.health.toFixed(1) }; };
    const strings = G.colliders.filter((c) => c.kind === 'string');

    // ---- finding 1: W held for 12 s on every string, from every side that has standing room ----
    out.f1 = [];
    for (const s of strings) for (let a = 0; a < 8; a++) {
      const dx = Math.cos(a * Math.PI / 4), dz = Math.sin(a * Math.PI / 4);
      G.clearInput(); T.reset(); G.teleport(s.x + dx * 2, s.y0 + 0.3, s.z + dz * 2, T.yawOf(-dx, -dz), 0);
      if (T.inside({ lift: 0 }).length) continue;
      G.step(0.4); const p0 = T.st(); if (!p0.onGround || Math.abs(p0.y - s.y0) > 0.02) continue;
      G.setInput({ forward: true });
      let regrabs = 0, was = false, topped = false;
      for (let i = 0; i < 720; i++) { G.step(DT); const p = T.st(); if (p.climbing && !was && topped) regrabs++; if (!p.climbing && was && p.y > s.y1 - 0.1) topped = true; was = p.climbing; }
      G.clearInput(); G.step(0.2);
      const e = snap();
      out.f1.push({ id: s.id, from: a * 45, ok: topped && e.onGround && !e.climbing && Math.abs(e.pos[1] - s.y1) < 0.5 && regrabs === 0, regrabs, end: e.pos, climbing: e.climbing });
    }
    // after topping out: can the string still be used downward (walk back into it after releasing W)?
    out.f1down = (() => { G.clearInput(); G.teleport(110.5, 20, 130, Math.PI / 2, 0); G.step(0.2); G.setInput({ forward: true }); G.step(6); G.clearInput(); G.step(0.7); const a = snap(); G.setInput({ forward: true }); G.step(0.6); const b = snap(); G.clearInput(); G.setInput({ back: true }); for (let i = 0; i < 600 && T.st().climbing; i++) G.step(DT); G.clearInput(); G.step(0.2); return { standing: a, walkedBackIn: b, afterS: snap() }; })();

    // ---- finding 2: the three repro calls, plus a scan across the shelf-side strip, walk and sprint, with W+A / W+D ----
    out.f2 = [];
    const climb = (name, start, yaw, inp, done) => {
      G.clearInput(); T.reset(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.2); G.setInput(inp);
      let ok = false, still = 0, deep = null;
      for (let i = 0; i < 900 && !ok; i++) { G.step(DT); const p = T.st(); if (done(p)) ok = true; if (p.onGround && Math.hypot(p.vx, p.vz) < 0.01) still++; else still = 0; if (still > 90) break; const d = T.inside({ lift: 0.66 }); if (d.length && !deep) deep = d; }
      G.clearInput();
      out.f2.push({ name, start, ok, end: T.pos(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), deep });
    };
    const KEYS = { W: { forward: true }, 'W+Shift': { forward: true, sprint: true }, 'W+A': { forward: true, left: true }, 'W+D': { forward: true, right: true } };
    for (const k in KEYS) {
      for (const x of [107.3, 107.6, 107.65, 107.8, 107.9, 107.99]) {
        climb(`tall stairs ${k} x=${x}`, [x, 0, 154], 0, KEYS[k], (p) => p.onGround && p.y > 19.99);
        climb(`small stairs ${k} x=${x}`, [x, 0, 6], Math.PI, KEYS[k], (p) => p.onGround && p.y > 19.99);
      }
      for (const x of [91.5, 91.9, 92.1, 92.3]) {
        climb(`skateboard ${k} x=${x}`, [x, 0, 47], Math.PI, KEYS[k], (p) => p.onGround && p.y > 16.99 && p.z > 73.4);
        climb(`chair stairs ${k} x=${x}`, [x, 0, 113], 0, KEYS[k], (p) => p.onGround && p.y > 16.99 && p.z < 86.6);
      }
    }
    // ---- finding 3: aim at the L1 node from each stair foot / mid-stair and hold W: must reach L1 with no damage ----
    out.f3 = [];
    for (const [name, foot, node, zs] of [['tall', [105.7, 0, 152.5], [110.5, 120], [152.5, 145, 140, 135, 130, 125]], ['small', [105.7, 0, 7.5], [110.5, 40], [7.5, 15, 20, 25, 30, 35]]]) for (const zTurn of zs) for (const sprint of [false, true]) {
      G.clearInput(); T.reset(); G.teleport(foot[0], 0, foot[2], name === 'tall' ? 0 : Math.PI, 0); G.step(0.2); G.setInput({ forward: true, sprint });
      for (let i = 0; i < 900 && (name === 'tall' ? T.st().z > zTurn : T.st().z < zTurn); i++) G.step(DT);
      G.lookAt(node[0], T.st().y + 1.6, node[1]);
      let res = 'timeout';
      for (let i = 0; i < 600; i++) { G.step(DT); const p = T.st(); if (p.onGround && Math.abs(p.y - 20) < 0.01 && p.x > 108.4) { res = 'on L1'; break; } if (p.onGround && p.y < 1 && i > 30 && Math.abs(p.z - foot[2]) > 3) { res = 'on the floor'; break; } }
      G.clearInput();
      out.f3.push({ shelf: name, zTurn, sprint, res, end: T.pos(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
    }
    // ---- finding 5: second press 1..6 ticks after letting go, string grabbed from the ground, every floor string ----
    out.f5 = [];
    for (const [sx, sz, yaw] of [[107, 52, Math.PI], [107, 108, 0]]) for (let gap = 1; gap <= 6; gap++) {
      G.clearInput(); T.reset(); G.teleport(sx, 0, sz, yaw, 0); G.step(0.2); G.setInput({ forward: true }); G.step(2);
      const y = T.st().y, wasClimbing = T.st().climbing;
      G.clearInput(); G.setInput({ jump: true }); G.step(DT); G.setInput({ jump: false }); for (let i = 0; i < gap; i++) G.step(DT); G.setInput({ jump: true }); G.step(DT);
      out.f5.push({ wasClimbing, releaseY: +y.toFixed(2), gap, vy: +T.st().vy.toFixed(2) }); G.clearInput();
    }

    // ---- new geometry: ruler props and seat stoppers ----
    out.geo = { runs: 0, deep: [], wedged: [], fellToFloorFromRuler: [], rescues: 0 };
    const MODES = { walk: { forward: true }, sprint: { forward: true, sprint: true }, sprintjump: { forward: true, sprint: true, jump: true }, crouch: { forward: true, crouch: true } };
    const run = (tag, start, yaw, mode, ticks = 150) => {
      G.clearInput(); T.reset(); G.teleport(start[0], start[1] + 0.3, start[2], yaw, 0);
      if (T.inside({ lift: 0 }).length) return;
      G.step(0.4); const p0 = T.st(); if (!p0.onGround) return;
      out.geo.runs++;
      for (let i = 0; i < ticks; i++) { G.setInput(Object.assign({}, MODES[mode], MODES[mode].jump ? { jump: i % 20 < 10 } : {})); G.step(DT); const p = T.st(); const d = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.66, eps: 0.05 }); if (d.length && out.geo.deep.length < 12) out.geo.deep.push({ tag, mode, i, pos: T.pos(), d }); }
      G.clearInput(); for (let i = 0; i < 300 && !T.st().onGround; i++) G.step(DT);
      const q = T.st();
      if (G.rescueLog.length) out.geo.rescues++;
      if (/from ruler|seat/.test(tag) && q.y < 1 && G.damageLog.length) out.geo.fellToFloorFromRuler.push({ tag, mode, start, end: T.pos(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
      // wedge test: any of 8 directions (or a jump) must move us
      let best = 0;
      for (let a = 0; a < 8 && best < 0.4; a++) { G.teleport(q.x, q.y, q.z, a * Math.PI / 4, 0); G.setInput({ forward: true }); G.step(0.5); G.clearInput(); const w = T.st(); best = Math.max(best, Math.hypot(w.x - q.x, w.z - q.z) + Math.abs(w.y - q.y)); }
      if (best < 0.4) out.geo.wedged.push({ tag, mode, at: [q.x, q.y, q.z] });
    };
    const rulerY = { n: (z) => 26 - (z - 64) * 9 / 11, s: (z) => 17 + (z - 85) * 9 / 11 };
    for (const mode in MODES) {
      // off the rulers sideways, west and east, along their whole length
      for (const [r, z0, z1] of [['n', 64.3, 74.8], ['s', 85.2, 95.7]]) for (let z = z0; z <= z1; z += 0.75) for (const [yaw, side] of [[Math.PI / 2, 'west'], [-Math.PI / 2, 'east']]) for (const ob of [0, 0.6, -0.6])
        run(`from ruler ${r} z=${z.toFixed(2)} walking ${side} ob ${ob}`, [94, rulerY[r](z), z], yaw + ob, mode, 120);
      // on the seat, into each stopper and each ruler foot from every direction
      for (const [cx, cz] of [[92.45, 73.3], [92.2, 86.7], [94, 75], [94, 85]]) for (let a = 0; a < 16; a++) { const dx = Math.cos(a * Math.PI / 8), dz = Math.sin(a * Math.PI / 8); run(`seat toward (${cx},${cz}) from ${a * 22.5}deg`, [cx + dx * 1.8, 17, cz + dz * 1.8], T.yawOf(-dx, -dz), mode, 120); }
      // floor level into the props from every side, and into the 0.5 slot between ramp/stairs and prop
      for (const [pz0, pz1] of [[64, 73], [87, 96]]) for (let z = pz0 - 0.6; z <= pz1 + 0.6; z += 0.6) { run(`floor into prop from east z=${z.toFixed(1)}`, [97.5, 0, z], Math.PI / 2, mode, 120); run(`floor into prop from west z=${z.toFixed(1)}`, [84.5, 0, z], -Math.PI / 2, mode, 200); }
      for (const x of [92.1, 92.25, 92.4, 93, 94, 95, 95.6]) { run(`floor into prop n from north x=${x}`, [x, 0, 61], Math.PI, mode, 120); run(`floor into prop s from south x=${x}`, [x, 0, 99], 0, mode, 120); run(`under seat into prop n from south x=${x}`, [x, 0, 76], 0, mode, 120); run(`under seat into prop s from north x=${x}`, [x, 0, 84], Math.PI, mode, 120); }
      // skateboard / chair stairs heads at their east edge, at angles toward the ruler
      for (const x of [90, 91, 91.6, 92, 92.3]) for (const ob of [0, -0.4, -0.8]) { run(`skateboard head x=${x} ob ${ob}`, [x, (68 - 50) * 17 / 23, 68], Math.PI + ob, mode, 200); }
      for (const x of [90, 91, 91.6, 92]) for (const ob of [0, 0.4, 0.8]) run(`chair stairs head x=${x} ob ${ob}`, [x, 17 / 29 * 23, 91.4], 0 - ob, mode, 200);
      // stair guards: from the stairs sideways at every 4th step, from the floor under L1, from L1 down onto them
      for (const [zf, dir, zc] of [[151, -1, 136], [9, 1, 24]]) {
        for (let i = 2; i <= 33; i += 3) { const z = zf + dir * 0.85 * (i - 0.5); for (const ob of [0, 0.6, -0.6]) run(`stairs step ${i} into guard`, [106.5, 20 / 34 * i, z], -Math.PI / 2 + ob, mode, 100); }
        for (let z = zc - 16; z <= zc + 16; z += 2) for (const ob of [0, 0.6, -0.6]) run(`floor under L1 into guard z=${z}`, [110.5, 0, z], Math.PI / 2 + ob, mode, 120);
        for (let z = zc - 14; z <= zc + 14; z += 3.5) run(`L1 west rim off the edge z=${z}`, [109.5, 20, z + 1], Math.PI / 2, mode, 150);
      }
    }
    return out;
  });
  const bad1 = out.f1.filter((r) => !r.ok);
  console.log(`finding 1: ${out.f1.length} string approaches with W held 12 s, ${bad1.length} not left standing at the top`);
  const by = {}; for (const r of out.f1) (by[r.id] = by[r.id] || []).push(r.from + (r.ok ? ':ok' : ':BAD')); for (const k in by) console.log('   ', k, by[k].join(' '));
  for (const r of bad1.slice(0, 8)) console.log('    BAD', JSON.stringify(r));
  console.log('   then walk back in and descend:', JSON.stringify(out.f1down));
  const bad2 = out.f2.filter((r) => !r.ok || r.dmg.length || r.deep);
  console.log(`finding 2: ${out.f2.length} runs, ${bad2.length} not reaching the top cleanly`); for (const r of bad2) console.log('   ', JSON.stringify(r));
  const bad3 = out.f3.filter((r) => r.res !== 'on L1' || r.dmg.length);
  console.log(`finding 3: ${out.f3.length} runs, ${bad3.length} not ending on L1 undamaged`); for (const r of bad3) console.log('   ', JSON.stringify(r));
  console.log('finding 5 (vy after the second press; a jump would be about 7.4):', out.f5.map((r) => `${r.wasClimbing ? '' : 'NOT-CLIMBING '}gap${r.gap}:${r.vy}`).join(' '));
  console.log(`new geometry: ${out.geo.runs} runs | inside a solid by more than 5 cm: ${out.geo.deep.length} | wedged: ${out.geo.wedged.length} | fell to the floor from ruler/seat runs: ${out.geo.fellToFloorFromRuler.length} | rescues: ${out.geo.rescues}`);
  for (const r of out.geo.deep) console.log('    deep', JSON.stringify(r));
  for (const r of out.geo.wedged.slice(0, 12)) console.log('    wedged', JSON.stringify(r));
  const falls = {}; for (const r of out.geo.fellToFloorFromRuler) { const k = r.tag.replace(/z=[\d.]+ /, '').replace(/ from [\d.]+deg/, '').replace(/ ob -?[\d.]+/, '') + ' / ' + r.mode; (falls[k] = falls[k] || []).push(r); }
  for (const k in falls) console.log(`    fell: ${k} x${falls[k].length} e.g. ${JSON.stringify(falls[k][0])}`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
