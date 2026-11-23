// Check 3: walk, sprint, sprint+jump and crouch into every box and cylinder collider from every side,
// at face centres, near face ends, at oblique angles and at the corners; and into the room walls and corners.
// An independent overlap test (bug_lib T.inside) looks for the body being inside a solid on every tick.
// Also flags: lifted on top of something taller than a step / a jump, jitter while blocked, rescues, NaN.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const res = await page.evaluate(() => {
    const G = __game, DT = 1 / 60;
    const MODES = { walk: { forward: true }, sprint: { forward: true, sprint: true }, sprintjump: { forward: true, sprint: true, jump: true }, crouch: { forward: true, crouch: true } };
    const stats = { runs: 0, skipped: 0, ticks: 0 };
    const findings = { deep: {}, shallow: {}, onTop: {}, jitter: {}, rescue: [], nan: [] };
    const add = (bucket, key, info) => { const b = findings[bucket]; if (!b[key]) b[key] = { n: 0, first: info }; b[key].n++; };

    // drop the player onto `base` at (x, z); false if that spot is not free standing room at that level
    const place = (x, z, base, yaw) => {
      G.clearInput();
      G.teleport(x, base + 0.3, z, yaw, 0);
      if (T.inside({ lift: 0.0 }).length) return false;
      G.step(0.4);
      const p = T.st();
      return p.onGround && Math.abs(p.y - base) < 0.02 && Math.hypot(p.x - x, p.z - z) < 0.01;
    };
    const approach = (c, sx, sz, yaw, tag) => {
      const base = c.y0, tall = c.y1 - base;
      for (const mode in MODES) {
        if (!place(sx, sz, base, yaw)) { stats.skipped++; continue; }
        T.reset();
        const inp = MODES[mode];
        let jiggle = 0, last = null, hist = [];
        for (let i = 0; i < 110; i++) {
          if (mode === 'sprintjump') { G.setInput({ forward: true, sprint: true, jump: i % 20 < 10 }); } else if (i === 0) G.setInput(inp);
          G.step(DT); stats.ticks++;
          const p = T.st();
          if (!Number.isFinite(p.x + p.y + p.z)) { findings.nan.push({ c: c.id, tag, mode }); break; }
          const deep = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.66 });
          if (deep.length) add('deep', c.id + ' <- ' + deep.join('+'), { tag, mode, i, pos: T.pos(), onGround: p.onGround });
          else if (p.onGround) { const sh = T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, { lift: 0.03 }); if (sh.length) add('shallow', c.id + ' <- ' + sh.join('+'), { tag, mode, i, pos: T.pos() }); }
          hist.push([p.x, p.y, p.z]);
        }
        G.clearInput();
        const p = T.st();
        stats.runs++;
        if (G.rescueLog.length) findings.rescue.push({ c: c.id, tag, mode, log: G.rescueLog.slice(0, 2) });
        // lifted on top of the thing?
        const limit = mode === 'sprintjump' ? 1.6 : 0.66;
        const over = c.kind === 'cyl' ? Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.4 : (p.x > c.x0 - 0.4 && p.x < c.x1 + 0.4 && p.z > c.z0 - 0.4 && p.z < c.z1 + 0.4);
        if (tall > limit && p.onGround && over && Math.abs(p.y - c.y1) < 0.02) add('onTop', c.id + ' (' + tall.toFixed(2) + ' tall) ' + mode, { tag, pos: T.pos(), from: [sx, base, sz] });
        // jitter: in the last 30 ticks the path length is much larger than the net movement, on the ground, walking modes only
        if (mode !== 'sprintjump') {
          const h = hist.slice(-30); let path = 0;
          for (let k = 1; k < h.length; k++) path += Math.hypot(h[k][0] - h[k - 1][0], h[k][1] - h[k - 1][1], h[k][2] - h[k - 1][2]);
          const net = Math.hypot(h[h.length - 1][0] - h[0][0], h[h.length - 1][1] - h[0][1], h[h.length - 1][2] - h[0][2]);
          if (path > 0.05 && net < path * 0.3) add('jitter', c.id + ' ' + mode, { tag, path: +path.toFixed(3), net: +net.toFixed(3), pos: T.pos() });
        }
      }
    };

    const skip = (c) => c.id.startsWith('room.') || /\.books\.\d+$/.test(c.id) && /^(bed|chair|s\.tall|n\.small)\.books\./.test(c.id);
    const OB = [0, 0.6, -0.6];        // head-on and about 35 degrees either way
    for (const c of G.colliders) {
      if (skip(c)) continue;
      if (c.kind === 'box') {
        const D = 1.3, faces = [
          { n: [0, -1], pts: [0.1, 0.5, 0.9].map((f) => [c.x0 + (c.x1 - c.x0) * f, c.z0 - D]) },
          { n: [0, 1], pts: [0.1, 0.5, 0.9].map((f) => [c.x0 + (c.x1 - c.x0) * f, c.z1 + D]) },
          { n: [-1, 0], pts: [0.1, 0.5, 0.9].map((f) => [c.x0 - D, c.z0 + (c.z1 - c.z0) * f]) },
          { n: [1, 0], pts: [0.1, 0.5, 0.9].map((f) => [c.x1 + D, c.z0 + (c.z1 - c.z0) * f]) }];
        for (const f of faces) for (const pt of f.pts) for (const ob of OB) approach(c, pt[0], pt[1], T.yawOf(-f.n[0], -f.n[1]) + ob, `face n=(${f.n}) from (${pt[0].toFixed(2)},${pt[1].toFixed(2)}) oblique ${ob}`);
        for (const [cx, cz, dx, dz] of [[c.x0, c.z0, -1, -1], [c.x1, c.z0, 1, -1], [c.x0, c.z1, -1, 1], [c.x1, c.z1, 1, 1]])
          approach(c, cx + dx * 0.95, cz + dz * 0.95, T.yawOf(-dx, -dz), `corner (${cx},${cz})`);
      } else if (c.kind === 'cyl') {
        for (let a = 0; a < 16; a++) {
          const ang = a * Math.PI / 8, dx = Math.cos(ang), dz = Math.sin(ang);
          for (const ob of OB) approach(c, c.x + dx * (c.r + 1.3), c.z + dz * (c.r + 1.3), T.yawOf(-dx, -dz) + ob, `radial ${a * 22.5}deg oblique ${ob}`);
        }
      }
    }

    // ---- room walls and corners: every 2.5 units along each wall, at the floor, 4 modes, head-on and oblique ----
    const wall = { runs: 0, bad: [] };
    const wallRun = (x, z, yaw, tag) => {
      for (const mode in MODES) {
        G.clearInput(); G.teleport(x, 0.3, z, yaw, 0);
        if (T.inside({ lift: 0 }).length) continue;
        G.step(0.4);
        const p0 = T.st(); if (!p0.onGround || p0.y > 0.01) continue;
        T.reset();
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9;
        for (let i = 0; i < 150; i++) {
          if (mode === 'sprintjump') G.setInput({ forward: true, sprint: true, jump: i % 20 < 10 }); else if (i === 0) G.setInput(MODES[mode]);
          G.step(DT); stats.ticks++;
          const p = T.st();
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); minY = Math.min(minY, p.y);
        }
        G.clearInput(); wall.runs++;
        if (minX < 0.4 - 1e-6 || maxX > 119.6 + 1e-6 || minZ < 0.4 - 1e-6 || maxZ > 159.6 + 1e-6 || minY < -1e-9 || G.rescueLog.length)
          wall.bad.push({ tag, mode, minX, maxX, minZ, maxZ, minY, rescues: G.rescueLog.length });
      }
    };
    for (let t = 1.5; t < 160; t += 2.5) for (const ob of OB) {
      if (t < 120) { wallRun(t, 2, T.yawOf(0, -1) + ob, `north wall x=${t} ob ${ob}`); wallRun(t, 158, T.yawOf(0, 1) + ob, `south wall x=${t} ob ${ob}`); }
      wallRun(2, t, T.yawOf(-1, 0) + ob, `west wall z=${t} ob ${ob}`); wallRun(118, t, T.yawOf(1, 0) + ob, `east wall z=${t} ob ${ob}`);
    }
    for (const [x, z, dx, dz] of [[2, 2, -1, -1], [118, 2, 1, -1], [2, 158, -1, 1], [118, 158, 1, 1]])
      for (const ob of [0, 0.3, -0.3, 0.7, -0.7]) wallRun(x, z, T.yawOf(dx, dz) + ob, `corner (${x},${z}) ob ${ob}`);
    return { stats, findings, wall };
  });
  console.log('stats', JSON.stringify(res.stats));
  for (const b of ['deep', 'shallow', 'onTop', 'jitter']) {
    const keys = Object.keys(res.findings[b]);
    console.log(`\n--- ${b}: ${keys.length} distinct ---`);
    for (const k of keys) console.log(`${k}  x${res.findings[b][k].n}  first: ${JSON.stringify(res.findings[b][k].first)}`);
  }
  console.log('\nrescues', JSON.stringify(res.findings.rescue).slice(0, 2000));
  console.log('nan', JSON.stringify(res.findings.nan));
  console.log('\nroom walls: runs', res.wall.runs, 'bad', JSON.stringify(res.wall.bad).slice(0, 3000));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
