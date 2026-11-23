// Walk every section 4.4 route with raw input the way a player would (aim at the next landmark, hold W / shift).
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const F = FEEL, out = {};
    const R = {
      bed_blanket:  { start: [42, 0, 24],   pts: [[26, 0, 23.5], [26, 18, 47], [26, 18, 68]], climb: (q) => q.y > 0.05 && q.y < 17.95 },
      bed_books:    { start: [33, 0, 145],  pts: [[26, 0, 144.5], [26, 18, 113.8], [17.5, 18, 113.5]], climb: (q) => q.y > 0.05 && q.y < 17.95 },
      desk_skate:   { start: [84, 0, 48.5], pts: [[89, 0, 48.5], [89, 17, 74.5], [94, 17, 76.5], [94, 26, 64.3], [97, 26, 64.3], [97.5, 26, 80]], climb: (q) => q.y > 0.05 && q.y < 16.95 },
      desk_stairs:  { start: [84, 0, 111.7], pts: [[89, 0, 111.7], [89, 17, 85.5], [94, 17, 83.5], [94, 26, 95.7], [97, 26, 95.7], [97.5, 26, 80]], climb: (q) => q.y > 0.05 && q.y < 16.95 },
      desk_yoyo:    { start: [100, 0, 48],  pts: [[107, 0, 53.3], [107, 26, 57.5, 2.2]], climb: (q) => q.c },
      desk_lace:    { start: [100, 0, 112], pts: [[107, 0, 106.7], [107, 26, 102.5, 2.2]], climb: (q) => q.c },
      tall_stairs:  { start: [100, 0, 153], pts: [[105.7, 0, 152.5], [105.7, 20, 120], [110.5, 20, 120]], climb: (q) => q.y > 0.05 && q.y < 19.95 },
      small_stairs: { start: [100, 0, 7],   pts: [[105.7, 0, 7.5], [105.7, 20, 40], [110.5, 20, 40]], climb: (q) => q.y > 0.05 && q.y < 19.95 },
      tall_bridge:  { start: [107, 26, 102.5], pts: [[111.5, 26, 103.5], [111.5, 20, 117.5], [110.5, 20, 120]], climb: (q) => q.y > 20.05 && q.y < 25.95 },
      small_bridge: { start: [107, 26, 57.5], pts: [[111.5, 26, 56.5], [111.5, 20, 42.5], [110.5, 20, 40]], climb: (q) => q.y > 20.05 && q.y < 25.95 },
      tall_L2_a:    { start: [110.5, 20, 130], pts: [[110.5, 40, 130, 2.6]], climb: (q) => q.c, aimString: [107.6, 130] },
      tall_L2_b:    { start: [110.5, 20, 146], pts: [[110.5, 40, 146, 2.6]], climb: (q) => q.c, aimString: [107.6, 146] },
      tall_L3_a:    { start: [110.5, 40, 136], pts: [[110.5, 60, 136, 2.6]], climb: (q) => q.c, aimString: [107.6, 136] },
      tall_L3_b:    { start: [110.5, 40, 152], pts: [[110.5, 60, 152, 2.6]], climb: (q) => q.c, aimString: [107.6, 152] },
      small_L2_a:   { start: [110.5, 20, 30], pts: [[110.5, 40, 30, 2.6]], climb: (q) => q.c, aimString: [107.6, 30] },
      small_L2_b:   { start: [110.5, 20, 14], pts: [[110.5, 40, 14, 2.6]], climb: (q) => q.c, aimString: [107.6, 14] },
      tunnel_drop:  { start: [89, 17, 74.5], pts: [[91, 17, 80], [77, 8, 80, 3]], climb: (q) => !q.g },
    };
    for (const id in R) {
      const d = R[id]; const res = {};
      for (const mode of ['sprint', 'walk']) {
        // string routes: the "target" is above us, so aim at the string first (a player looks at the yellow line)
        let pts = d.pts;
        if (d.aimString) pts = [[d.aimString[0], d.start[1], d.aimString[1], 0.01]].concat(d.pts);   // never "arrives": replaced by grab below
        let run;
        if (d.aimString) {
          // custom: walk at the string until climbing, hold forward until off, then stop
          const G = __game; G.clearInput(); G.teleport(d.start[0], d.start[1], d.start[2]); G.step(F.T);
          let t = 0; const trace = []; let grabbedAt = null, offAt = null; const hp0 = F.st().health;
          while (t < 30) {
            const p = F.st();
            if (!p.climbing) G.lookAt(d.aimString[0], p.y + 1.6, d.aimString[1]);
            G.setInput({ forward: true, sprint: mode === 'sprint' }); G.step(F.T); t += F.T;
            const q = F.st(); trace.push({ t, x: q.x, y: q.y, z: q.z, g: q.onGround, c: q.climbing, eye: q.y + 1.6, moved: 0 });
            if (q.climbing && grabbedAt === null) grabbedAt = t;
            if (grabbedAt !== null && !q.climbing) { offAt = t; break; }
          }
          G.clearInput(); G.step(0.5); const e = F.st();
          run = { ok: offAt !== null && e.onGround && Math.abs(e.y - d.pts[0][1]) < 0.1, time: +t.toFixed(2), hpLost: hp0 - e.health, end: [+e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2)], trace, grabbedAt: grabbedAt && +grabbedAt.toFixed(2), onString: offAt && +(offAt - grabbedAt).toFixed(2) };
        } else run = F.drive(d.start, pts, { sprint: mode === 'sprint' });
        const s = F.seg(run.trace, d.climb);
        res[mode] = { ok: run.ok, time: run.time, hpLost: run.hpLost, end: run.end, stuckAtTarget: run.stuckAtTarget, grabbedAt: run.grabbedAt, onString: run.onString, climb: s };
      }
      out[id] = res;
    }
    return out;
  });
  for (const id in r) for (const m of ['sprint', 'walk']) { const q = r[id][m]; console.log(id.padEnd(13), m.padEnd(6), 'ok', q.ok, 't', q.time, 'hp-', q.hpLost, 'end', JSON.stringify(q.end), q.grabbedAt !== undefined ? 'grab@' + q.grabbedAt + ' onString ' + q.onString : '', '\n    climb', JSON.stringify(q.climb)); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
