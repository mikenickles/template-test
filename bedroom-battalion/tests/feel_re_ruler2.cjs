// Re-check: does the seat stopper snag players who hug the ruler-side edge of the skateboard / chair stairs?
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_drive.js', 'utf8') });
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state().player, out = {};
    // straight up the skateboard / chair stairs at fixed x, single heading, 6 s
    for (const [name, z0, zAim] of [['skate', 49, 90], ['chairstairs', 111.5, 70]]) for (const x of [90.5, 91, 91.3, 91.6, 91.9]) {
      G.clearInput(); G.teleport(x, 0, z0); G.step(T); G.lookAt(x, 1.6, zAim); G.setInput({ forward: true, sprint: true }); let t = 0, stall = 0;
      while (t < 6) { G.step(T); t += T; const p = st(); if (Math.hypot(p.vx, p.vz) < 3.5) stall += T; if (p.onGround && p.y > 16.95 && Math.abs(p.z - 80) < 3) break; }
      const p = st(); out[name + ' straight x=' + x] = { reachedSeatMiddle: Math.abs(p.z - 80) < 3 && p.y > 16.9, t: +t.toFixed(2), stalled: +stall.toFixed(2), end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] }; }
    // from the stuck spot on the skateboard against the prop, steer straight at the ruler foot (continuous aim), then up
    for (const [name, s, pts] of [['recover direct N', [92.1, 13.3, 68], [[94, 17, 75.8, 0.8], [94, 26, 64.3]]], ['recover round stopper N', [92.1, 13.3, 68], [[90.8, 17, 74.6, 0.5], [94, 17, 75.8, 0.8], [94, 26, 64.3]]],
                                  ['recover direct S', [92.1, 14.07, 92], [[94, 17, 84.2, 0.8], [94, 26, 95.7]]]]) {
      const run = FEEL.drive(s, pts, { sprint: true, maxT: 12 }); out[name] = { ok: run.ok, time: run.time, end: run.end }; }
    // whole routes as a player would run them (aim at ruler foot from the ramp head)
    for (const [name, s, pts] of [['desk_skate full', [84, 0, 48.5], [[89, 0, 48.5], [89, 17, 74.5], [94, 17, 76.5], [94, 26, 64.3], [97, 26, 64.3]]], ['desk_skate hugging east', [84, 0, 48.5], [[91.5, 0, 49], [91.5, 17, 73.2, 0.4], [94, 17, 76, 0.8], [94, 26, 64.3]]],
                                  ['desk_stairs full', [84, 0, 111.7], [[89, 0, 111.7], [89, 17, 85.5], [94, 17, 83.5], [94, 26, 95.7], [97, 26, 95.7]]], ['desk_stairs hugging east', [84, 0, 111.7], [[91.5, 0, 111.5], [91.5, 17, 86.8, 0.4], [94, 17, 84, 0.8], [94, 26, 95.7]]]]) {
      const run = FEEL.drive(s, pts, { sprint: true, maxT: 20 }); const slow = run.trace.filter((q) => q.g && q.moved < 3.5).length; out[name] = { ok: run.ok, time: run.time, slowSeconds: +(slow * T).toFixed(2), end: run.end }; }
    return out;
  });
  for (const k in r) console.log(k.padEnd(30), JSON.stringify(r[k])); console.log(JSON.stringify(h.errors));
  await h.browser.close();
})();
