// Builder stress test: random-input walkers from every waypoint node. Flags NaN, leaving the room,
// ending up inside a solid, and any use of the safety net. Also re-runs every route with sprint.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = {};
  out.random = await page.evaluate(() => {
    const g = __game, C = g.colliders, P = () => g.state().player;
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const inside = (p) => {
      const y = p.y + 0.9;
      for (const c of C) {
        if (c.kind === 'string' || c.id === 'room.floor') continue;
        if (c.kind === 'cyl') { if (Math.hypot(p.x - c.x, p.z - c.z) < c.r - 0.05 && y > c.y0 && y < c.y1) return c.id; continue; }
        if (p.x <= c.x0 + 0.05 || p.x >= c.x1 - 0.05 || p.z <= c.z0 + 0.05 || p.z >= c.z1 - 0.05) continue;
        if (c.kind === 'ramp') {
          const t = c.axis === 'x' ? (p.x - c.x0) / (c.x1 - c.x0) : (p.z - c.z0) / (c.z1 - c.z0), h = c.h0 + (c.h1 - c.h0) * t;
          const b = Number.isFinite(c.thickness) ? h - c.thickness : c.base;
          if (y > b + 0.05 && y < h - 0.05) return c.id; continue;
        }
        if (y > c.y0 && y < c.y1) return c.id;
      }
      return null;
    };
    const ids = Object.keys(g.waypoints.nodes), bad = []; let ticks = 0, maxY = 0, respawns = 0;
    for (let w = 0; w < ids.length; w++) {
      const n = g.waypoints.nodes[ids[w]];
      g.clearInput(); g.teleport(n[0], n[1], n[2], rnd() * 6.28, 0);
      for (let k = 0; k < 40; k++) {
        if (rnd() < 0.6) g.look(rnd() * 6.283 - 3.14, rnd() - 0.5);
        g.setInput({ forward: rnd() < 0.85, back: rnd() < 0.1, left: rnd() < 0.2, right: rnd() < 0.2, jump: rnd() < 0.35, sprint: rnd() < 0.5, crouch: rnd() < 0.15 });
        const steps = 12 + Math.floor(rnd() * 50);
        for (let i = 0; i < steps; i++) {
          g.step(1 / 60); ticks++;
          const p = P();
          if (p.y > maxY) maxY = p.y;
          const fin = Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz);
          const emb = fin && !p.climbing ? inside(p) : null;
          if (!fin || p.x < 0.39 || p.x > 119.61 || p.z < 0.39 || p.z > 159.61 || p.y < -0.001 || emb) {
            if (bad.length < 12) bad.push({ start: ids[w], x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), inside: emb, fin });
            g.teleport(n[0], n[1], n[2]);
          }
        }
      }
    }
    return { walkers: ids.length, ticks, simMinutes: +(ticks / 3600).toFixed(1), bad, rescues: g.rescueLog.slice(0, 8), rescueCount: g.rescueLog.length, maxY: +maxY.toFixed(2), deaths: g.damageLog.filter((d) => d.amount >= 100).length, falls: g.damageLog.length };
  });
  out.sprintRoutes = await page.evaluate(() => {
    const r = {};
    for (const id of Object.keys(__game.routes)) { __game.clearInput(); __game.teleport(60, 0, 20); const h = __game.state().player.health; const res = __game.walkPath(__game.routes[id], { sprint: true }); r[id] = [res.ok, res.time, +__game.state().player.y.toFixed(2), __game.state().player.health - h]; }
    return r;
  });
  out.strings = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    // human-style: walk off the desk edge into the yo-yo string from the top, forward is ignored until re-pressed
    g.clearInput(); g.teleport(107, 26, 57.5, 0, 0); g.setInput({ forward: true }); g.step(1.5);
    r.grabFromTop = { climbing: P().climbing, y: +P().y.toFixed(2), z: +P().z.toFixed(2) };
    g.setInput({ forward: false, back: true }); g.step(2); r.descending = { climbing: P().climbing, y: +P().y.toFixed(2) };
    g.setInput({ back: false, jump: true }); g.step(1 / 60); g.clearInput(); g.step(2); r.letGo = { climbing: P().climbing, y: +P().y.toFixed(2), health: P().health };
    g.teleport(107, 26, 57.5, 0, 0); g.setInput({ forward: true }); g.step(1.5); g.clearInput(); g.step(0.1); g.setInput({ forward: true }); g.step(0.5);
    r.repressForwardAtTop = { climbing: P().climbing, y: +P().y.toFixed(2), z: +P().z.toFixed(2), onGround: P().onGround };
    g.clearInput(); g.teleport(107, 0, 52, Math.PI, 0); g.setInput({ forward: true }); g.step(3); r.midClimb = { climbing: P().climbing, y: +P().y.toFixed(2) };
    g.step(6); g.clearInput(); r.topExit = { climbing: P().climbing, x: +P().x.toFixed(2), y: +P().y.toFixed(2), z: +P().z.toFixed(2), onGround: P().onGround };
    return r;
  });
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
