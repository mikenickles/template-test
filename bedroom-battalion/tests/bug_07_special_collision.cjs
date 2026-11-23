// Check 3 / 5 (targeted): the things the generic sweep cannot reach because they do not sit on the floor:
// fort firing slits and upper walls, stair sides, low ceilings (under the bed, under the slab ramps),
// thin slab ramps from the side / from below / from above, chair back and posts, tower parapet and crenels.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const res = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    const MODES = { walk: { forward: true }, sprint: { forward: true, sprint: true }, sprintjump: { forward: true, sprint: true, jump: true }, crouch: { forward: true, crouch: true }, crouchjump: { forward: true, crouch: true, jump: true } };
    // run one probe; returns summary with any overlap the independent checker saw
    const probe = (start, yaw, mode, ticks = 150, opts = {}) => {
      G.clearInput(); T.reset();
      G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.3);
      const p0 = T.st();
      let deep = null, maxHead = -1e9, minY = 1e9, maxY = -1e9, viaGate = false;
      for (let i = 0; i < ticks; i++) {
        const m = MODES[mode];
        G.setInput(Object.assign({}, m, m.jump ? { jump: i % 24 < 12 } : {}));
        G.step(DT);
        const p = T.st(), h = p.crouching ? 1.2 : 1.8;
        if (p.x > 57.5 && p.x < 62.5 && ((p.z > 24.4 && p.z < 26.1) || (p.z > 133.9 && p.z < 135.6))) viaGate = true;
        maxHead = Math.max(maxHead, p.y + h); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        const d = T.solidAt(p.x, p.y, p.z, h, { lift: 0.66 });
        if (d.length && !deep) deep = { i, pos: T.pos(), ids: d };
      }
      G.clearInput();
      if (opts.settle) { for (let i = 0; i < 180 && !T.st().onGround; i++) G.step(DT); G.step(0.2); }
      const p = T.st();
      return { start, startOK: p0.onGround && !T.solidAt(start[0], start[1], start[2], 1.8, { lift: 0.03 }).length, end: T.pos(), onGround: p.onGround, crouching: p.crouching, viaGate, deep, maxHead: +maxHead.toFixed(3), minY: +minY.toFixed(3), maxY: +maxY.toFixed(3), rescues: G.rescueLog.length, dmg: G.damageLog.length };
    };

    // ---------- A. fort front walls (slits): from inside and outside, both forts, every 0.5 along x ----------
    out.fort = { runs: 0, crossed: [], deep: [], onWall: [] };
    for (const [name, zIn, zOut, zFace0, zFace1] of [['green', 23, 27.5, 24.5, 26], ['tan', 137, 132.5, 134, 135.5]]) {
      for (let x = 46.5; x <= 73.6; x += 0.5) {
        if (x > 57.0 && x < 63.0) continue;                       // the gate gap (57.5..62.5) is open
        for (const mode in MODES) for (const [z, yaw, side] of [[zIn, zIn < zOut ? YAW.s : YAW.n, 'inside'], [zOut, zIn < zOut ? YAW.n : YAW.s, 'outside']]) {
          if (side === 'inside' && (x < 47.9 || x > 72.1)) continue; // side walls
          for (const ob of [0, 0.5, -0.5]) {
            const r = probe([x, 0, z], yaw + ob, mode, 120, { settle: true }); out.fort.runs++;
            const crossed = side === 'inside' ? (zIn < zOut ? r.end[2] > zFace0 + 0.1 : r.end[2] < zFace1 - 0.1) : (zIn < zOut ? r.end[2] < zFace1 - 0.1 : r.end[2] > zFace0 + 0.1);
            const inGate = (r.end[0] > 57.5 && r.end[0] < 62.5) || r.viaGate;
            if (crossed && !inGate && r.end[0] > 45.6 && r.end[0] < 74.4) out.fort.crossed.push({ name, x, side, mode, ob, end: r.end });
            if (r.deep) out.fort.deep.push({ name, x, side, mode, ob, deep: r.deep });
            if (r.end[1] > 1.0 && r.onGround && r.end[2] > Math.min(zFace0, zFace1) - 0.4 && r.end[2] < Math.max(zFace0, zFace1) + 0.4) out.fort.onWall.push({ name, x, side, mode, ob, end: r.end, maxY: r.maxY });
          }
        }
      }
    }
    // gate gap: jump sideways from the gate onto the low wall top (1.15) under the upper wall
    out.gateJump = [];
    for (const [x, yaw] of [[58.2, YAW.w], [61.8, YAW.e]]) for (const mode of ['sprintjump', 'crouchjump']) { const r = probe([x, 0, 25.25], yaw, mode, 150); out.gateJump.push({ x, mode, end: r.end, deep: r.deep, maxY: r.maxY }); }

    // ---------- B. stair sides: walk into every side of every stair flight at floor level ----------
    out.stairSides = { runs: 0, deep: [], onTop: [] };
    const flights = [['bed.books', 22, 30, 115, 142], ['chair.books', 86, 92, 87, 110.2], ['s.tall.books', 103.5, 108, 116, 151], ['n.small.books', 103.5, 108, 9, 44]];
    for (const [id, x0, x1, z0, z1] of flights) for (let z = z0 + 0.3; z < z1; z += 0.45) for (const mode in MODES) for (const [x, yaw] of [[x0 - 1.2, YAW.e], [x1 + 1.2, YAW.w]]) for (const ob of [0, 0.5, -0.5]) {
      const r = probe([x, 0, z], yaw + ob, mode, 90); if (!r.startOK) continue; out.stairSides.runs++;
      if (r.deep) out.stairSides.deep.push({ id, x, z, mode, ob, deep: r.deep });
      if (r.end[1] > 1.6 && r.onGround && r.end[0] > x0 - 0.4 && r.end[0] < x1 + 0.4) out.stairSides.onTop.push({ id, x, z: +z.toFixed(2), mode, ob, end: r.end });   // climbed a step taller than a jump from the side
    }

    // ---------- C. under the bed (6 high): jump everywhere, walk in and out across the slab edge while jumping ----------
    out.underBed = { runs: 0, deep: [], headOver6: [] };
    for (let x = 4; x <= 34; x += 5) for (let z = 49; z <= 112; z += 7) for (const mode of ['sprintjump', 'crouchjump']) for (const yaw of [YAW.n, YAW.e, YAW.s, YAW.w]) {
      const r = probe([x, 0, z], yaw, mode, 150); if (!r.startOK) continue; out.underBed.runs++;
      if (r.deep) out.underBed.deep.push({ x, z, mode, yaw, deep: r.deep });
    }
    // jump in from outside: east edge x=35, north edge z=45, south edge z=115, timed so the apex is at the edge
    for (let d = 0.5; d <= 3.01; d += 0.25) for (const mode of ['sprintjump', 'crouchjump', 'walk']) {
      for (const [st, yaw] of [[[35 + d, 0, 70], YAW.w], [[35 + d, 0, 95], YAW.w], [[32.5, 0, 115.6 + d], YAW.n], [[10, 0, 45 - d], YAW.s], [[25, 0, 45 - d], YAW.s]]) {
        const r = probe(st, yaw, mode, 100); if (!r.startOK) continue; out.underBed.runs++;
        if (r.deep) out.underBed.deep.push({ st, mode, deep: r.deep });
        if (r.maxHead > 6.001 && r.end[0] < 34.6 && r.end[2] > 45.4 && r.end[2] < 114.6 && r.end[1] < 6) out.underBed.headOver6.push({ st, mode, maxHead: r.maxHead, end: r.end });
      }
    }

    // ---------- D. skateboard ramp (x 86..92, z 50..73, 0..17, 0.6 thick) ----------
    // D1 from the side at floor level, every 0.25 in z: where do you pass under, where are you blocked, where do you step on?
    out.skateSide = [];
    for (const mode of ['walk', 'crouch', 'sprintjump']) for (const [sx, yaw, tag] of [[84.5, YAW.e, 'from west'], [93.5, YAW.w, 'from east']]) {
      let row = '';
      for (let z = 49.5; z <= 60.01; z += 0.25) {
        const r = probe([sx, 0, z], yaw, mode, 150, { settle: true });
        const through = tag === 'from west' ? r.end[0] > 92.4 : r.end[0] < 85.6;
        const onRamp = r.end[1] > 0.3;
        row += r.deep ? 'X' : onRamp ? 'u' : through ? '-' : '#';
        if (r.deep) out.skateSide.push({ mode, tag, z, deep: r.deep });
      }
      out.skateSide.push(`${mode} ${tag} z=49.5..60 step .25: ${row}   (u = stepped up onto the ramp, # = blocked, - = passed underneath, X = inside the slab)`);
    }
    // D2 from underneath, walking north under the seat toward the low end: where does a standing / crouching player stop?
    out.skateUnder = [];
    for (const mode of ['walk', 'sprint', 'crouch', 'sprintjump', 'crouchjump']) for (const x of [86.3, 89, 91.7]) {
      const r = probe([x, 0, 68], YAW.n, mode, 420);
      out.skateUnder.push({ mode, x, end: r.end, crouching: r.crouching, deep: r.deep, maxHead: r.maxHead });
    }
    // D3 crouch in as far as it goes, release crouch: must stay crouched; back out: must stand up again
    out.skateStand = (() => {
      G.clearInput(); G.teleport(89, 0, 60, YAW.n, 0); G.step(0.2);
      G.setInput({ forward: true, crouch: true }); G.step(5);
      const a = { pos: T.pos(), crouching: T.st().crouching };
      G.clearInput(); G.step(1);
      const b = { pos: T.pos(), crouching: T.st().crouching, inside: T.inside({ lift: 0.66 }) };
      G.setInput({ jump: true }); G.step(0.5); G.clearInput(); G.step(0.5);
      const c = { pos: T.pos(), crouching: T.st().crouching, inside: T.inside({ lift: 0.66 }) };
      G.setInput({ back: true }); G.step(1.5); G.clearInput(); G.step(0.3);
      const d = { pos: T.pos(), crouching: T.st().crouching };
      return { crouchedIn: a, afterRelease: b, afterJump: c, afterBackingOut: d };
    })();
    // D4 drop onto the slab from above at a grid of points (including the very edges) and from several heights
    out.slabDrops = { runs: 0, fellThrough: [], samples: [] };
    const slabs = [['chair.skate', 86, 92, 50, 73, (z) => (z - 50) * 17 / 23], ['desk.ruler.n', 92.5, 95.5, 64, 75, (z) => 26 - (z - 64) * 9 / 11], ['desk.ruler.s', 92.5, 95.5, 85, 96, (z) => 17 + (z - 85) * 9 / 11],
      ['desk.bridge.n', 110, 113, 44, 55, (z) => 20 + (z - 44) * 6 / 11], ['desk.bridge.s', 110, 113, 105, 116, (z) => 26 - (z - 105) * 6 / 11]];
    for (const [id, x0, x1, z0, z1, h] of slabs) for (const fx of [-0.03, 0.02, 0.5, 0.98, 1.03]) for (let fz = 0.04; fz < 1; fz += 0.115) for (const drop of [0.3, 2, 9, 25, 55]) for (const inp of [{}, { forward: true, sprint: true }, { back: true }]) {
      const x = x0 + (x1 - x0) * fx, z = z0 + (z1 - z0) * fz, top = h(z);
      if (top + drop + 1.8 > 89) continue;
      // skip drops that start inside or above something else (desk top above the ruler edge, shelf boards...)
      G.clearInput(); T.reset(); G.teleport(x, top + drop, z, YAW.n, 0);
      if (T.inside({ lift: 0 }).length) continue;
      G.setInput(inp);
      let landedY = null, n = 0, blockedAbove = false;
      for (let i = 0; i < 400; i++) { G.step(DT); const p = T.st(); if (p.onGround) { landedY = p.y; break; } n++; }
      G.clearInput();
      const p = T.st(); out.slabDrops.runs++;
      const expect = h(Math.min(z1, Math.max(z0, p.z)));
      const onSlab = p.x > x0 - 0.4 && p.x < x1 + 0.4 && p.z > z0 - 0.4 && p.z < z1 + 0.4;
      if (onSlab && landedY !== null && landedY < expect - 0.7) out.slabDrops.fellThrough.push({ id, from: [+x.toFixed(2), +(top + drop).toFixed(2), +z.toFixed(2)], inp, landed: T.pos(), slabTopThere: +expect.toFixed(2) });
    }

    // ---------- E. ruler north low end on the seat: from the side, crouching under it on the seat rim ----------
    out.rulerSeat = [];
    for (const mode of ['walk', 'crouch', 'sprintjump', 'crouchjump']) {
      let row = '';
      for (let z = 72.7; z <= 76.01; z += 0.15) { const r = probe([90.5, 17, z], YAW.e, mode, 90, { settle: true }); row += r.deep ? 'X' : r.end[1] > 17.05 ? 'u' : r.end[1] < 16 ? 'f' : r.end[0] > 95.8 ? '-' : '#'; if (r.deep) out.rulerSeat.push({ mode, z, deep: r.deep }); }
      out.rulerSeat.push(`${mode} from seat x=90.5 walking east, z=72.7..76 step .15: ${row}  (u = up on the ruler, # = blocked, - = passed under to the east rim, f = fell off the seat, X = inside)`);
    }
    out.rulerSeatStand = (() => {
      G.clearInput(); G.teleport(91.5, 17, 72.75, YAW.e, 0); G.step(0.2);
      G.setInput({ forward: true, crouch: true }); while (T.st().x < 94) G.step(1 / 60);
      G.clearInput(); G.setInput({ crouch: true }); G.step(0.3);
      const a = { pos: T.pos(), crouching: T.st().crouching, onGround: T.st().onGround };
      G.clearInput(); G.step(1);
      const b = { pos: T.pos(), crouching: T.st().crouching, inside: T.inside({ lift: 0.66 }) };
      return { crouchedUnder: a, afterRelease: b };
    })();

    // ---------- F. chair: posts and back panel from the seat; gap under the panel ----------
    out.chair = [];
    for (const mode in MODES) for (let z = 73.3; z <= 86.71; z += 0.67) { const r = probe([88.5, 17, z], YAW.w, mode, 90); if (r.deep) out.chair.push({ mode, z, deep: r.deep }); }
    out.chairGapHead = probe([88.5, 17, 80], YAW.w, 'sprintjump', 40).maxHead;

    // ---------- G. tower: parapet and crenels, both forts ----------
    out.tower = { runs: 0, deep: [], left: {} };
    for (const [name, zc, zs] of [['green', 9.5, 1], ['tan', 150.5, -1]]) for (const mode in MODES) for (let a = 0; a < 360; a += 10) {
      const r = probe([70.5, 7, zc], a * Math.PI / 180, mode, 150); out.tower.runs++;
      if (r.deep) out.tower.deep.push({ name, mode, a, deep: r.deep });
      if (r.end[1] < 6.9) { const k = `${name} ${mode}`; (out.tower.left[k] = out.tower.left[k] || []).push(a + ':' + r.end.map((v) => Math.round(v * 10) / 10).join(',')); }
    }
    return out;
  });

  console.log('A. fort slits: runs', res.fort.runs, '| crossed the wall:', res.fort.crossed.length, JSON.stringify(res.fort.crossed.slice(0, 6)), '| inside:', res.fort.deep.length, JSON.stringify(res.fort.deep.slice(0, 4)), '| ended above y 1:', res.fort.onWall.length, JSON.stringify(res.fort.onWall.slice(0, 6)));
  console.log('   gate side jumps', JSON.stringify(res.gateJump));
  console.log('B. stair sides: runs', res.stairSides.runs, '| inside:', res.stairSides.deep.length, JSON.stringify(res.stairSides.deep.slice(0, 4)), '| climbed from the side above jump height:', res.stairSides.onTop.length, JSON.stringify(res.stairSides.onTop.slice(0, 8)));
  console.log('C. under bed: runs', res.underBed.runs, '| inside:', res.underBed.deep.length, JSON.stringify(res.underBed.deep.slice(0, 6)), '| head above 6 while under the slab:', JSON.stringify(res.underBed.headOver6.slice(0, 5)));
  console.log('D1. skateboard from the side:'); for (const r of res.skateSide) console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  console.log('D2. skateboard from underneath (walking north from z 68):'); for (const r of res.skateUnder) console.log('   ', JSON.stringify(r));
  console.log('D3. crouch under the skateboard then release:', JSON.stringify(res.skateStand));
  console.log('D4. drops onto slabs: runs', res.slabDrops.runs, '| fell through:', res.slabDrops.fellThrough.length, JSON.stringify(res.slabDrops.fellThrough.slice(0, 10)));
  console.log('E. ruler low end on the seat:'); for (const r of res.rulerSeat) console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  console.log('   crouch under ruler on seat rim:', JSON.stringify(res.rulerSeatStand));
  console.log('F. chair posts/back: inside:', res.chair.length, JSON.stringify(res.chair.slice(0, 4)), '| max head height jumping through the gap (panel underside 22):', res.chairGapHead);
  console.log('G. tower: runs', res.tower.runs, '| inside:', res.tower.deep.length, JSON.stringify(res.tower.deep.slice(0, 4)));
  for (const k in res.tower.left) console.log('   left the tower top:', k, res.tower.left[k].join(' | '));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
