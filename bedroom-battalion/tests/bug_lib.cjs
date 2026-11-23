// Bug tester shared helpers. Not a test by itself.
// Everything in here drives the game only through window.__game (DESIGN.md section 11).
const { launch } = require('./harness.cjs');

// Runs in the page: installs window.T, a set of helpers built ONLY on the public hook.
function installPageHelpers() {
  const G = window.__game;
  const T = (window.T = {});
  const DT = 1 / 60;
  T.st = () => G.state().player;
  T.pos = () => { const p = G.state().player; return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; };
  T.tick = () => G.step(DT);

  // ---- independent overlap checker (my own maths, not the game's) -------------------------------------
  // Is the player's body inside a solid? Body = circle radius r (shrunk by eps) x [feet + lift, feet + height].
  T.solidAt = (x, y, z, height, opts = {}) => {
    const r = 0.4 - (opts.eps === undefined ? 0.02 : opts.eps);
    const lo = y + (opts.lift === undefined ? 0.05 : opts.lift), hi = y + height - 0.02;
    const hits = [];
    for (const c of G.colliders) {
      if (c.kind === 'string' || c.kind === 'pad') continue;
      if (c.kind === 'cyl') {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        if (Math.hypot(x - c.x, z - c.z) < r + c.r) hits.push(c.id);
        continue;
      }
      const cx = Math.min(Math.max(x, c.x0), c.x1), cz = Math.min(Math.max(z, c.z0), c.z1);
      if (Math.hypot(x - cx, z - cz) >= r) continue;
      if (c.kind === 'box') { if (c.y1 > lo && c.y0 < hi) hits.push(c.id); continue; }
      if (c.kind === 'ramp') {
        // sample the ramp surface over the circle's extent along the ramp axis
        const a0 = c.axis === 'x' ? c.x0 : c.z0, a1 = c.axis === 'x' ? c.x1 : c.z1, t = c.axis === 'x' ? x : z;
        const hAt = (v) => c.h0 + (c.h1 - c.h0) * Math.min(1, Math.max(0, (v - a0) / (a1 - a0)));
        const thin = Number.isFinite(c.thickness);
        // only the centre line sample: the game treats the capsule as a point for ramp height
        const top = hAt(t), bot = thin ? top - c.thickness : (c.base || 0);
        if (top > lo + 0.02 && bot < hi) hits.push(c.id + '@' + top.toFixed(2));
      }
    }
    return hits;
  };
  T.inside = (opts) => { const p = T.st(); return T.solidAt(p.x, p.y, p.z, p.crouching ? 1.2 : 1.8, opts); };
  T.outOfRoom = () => { const p = T.st(); return p.x < 0.39 || p.x > 119.61 || p.z < 0.39 || p.z > 159.61 || p.y < -0.001 || p.y > 90 - 1.2 + 0.001 || !Number.isFinite(p.x + p.y + p.z); };

  // ---- "player-like" drivers: setInput + lookAt + step only -------------------------------------------
  // Walk toward (x, z), re-aiming every tick like a player tracking a target. Stops when within tol.
  T.goTo = (x, z, o = {}) => {
    const tol = o.tol === undefined ? 0.3 : o.tol, timeout = o.timeout || 30;
    let t = 0, best = Infinity, since = 0;
    const trace = [];
    G.clearInput();
    for (;;) {
      const p = T.st();
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < tol && (o.anyY || o.y === undefined || Math.abs(p.y - o.y) < 0.8) && (p.onGround || o.air)) { G.clearInput(); return { ok: true, t: +t.toFixed(2), pos: T.pos() }; }
      if (t > timeout) { G.clearInput(); return { ok: false, why: 'timeout', t: +t.toFixed(2), pos: T.pos() }; }
      if (since > (o.stuck || 2)) { G.clearInput(); return { ok: false, why: 'stuck', t: +t.toFixed(2), pos: T.pos(), vel: [p.vx, p.vy, p.vz] }; }
      if (!p.climbing) G.lookAt(x, p.y + 1.6, z);
      G.setInput({ forward: true, sprint: !!o.sprint, crouch: !!o.crouch, jump: false });
      G.step(DT); t += DT;
      const q = T.st(), m = Math.hypot(x - q.x, z - q.z) + (o.y === undefined ? 0 : Math.abs(q.y - o.y));
      if (m < best - 0.005) { best = m; since = 0; } else since += DT;
      if (o.check) { const h = T.inside(); if (h.length) trace.push({ t: +t.toFixed(2), pos: T.pos(), inside: h }); }
      if (o.stopIf && o.stopIf(q)) { G.clearInput(); return { ok: true, stopped: true, t: +t.toFixed(2), pos: T.pos(), trace }; }
    }
  };
  // Hold a fixed set of keys with a fixed view direction for `secs`. Returns samples.
  T.hold = (input, secs, o = {}) => {
    G.clearInput(); G.setInput(input);
    const n = Math.round(secs * 60), out = { inside: [], maxSpeed: 0, minY: Infinity, maxY: -Infinity, path: [] };
    for (let i = 0; i < n; i++) {
      G.step(DT);
      const p = T.st();
      out.maxSpeed = Math.max(out.maxSpeed, Math.hypot(p.vx, p.vz));
      out.minY = Math.min(out.minY, p.y); out.maxY = Math.max(out.maxY, p.y);
      if (o.check !== false) { const h = T.inside(o.checkOpts); if (h.length && out.inside.length < 5) out.inside.push({ i, pos: T.pos(), h }); }
      if (o.every && i % o.every === 0) out.path.push(T.pos());
      if (o.until && o.until(p)) { out.stoppedAt = i; break; }
    }
    G.clearInput();
    out.pos = T.pos(); out.st = T.st();
    return out;
  };
  // yaw for walking toward a compass heading: 'n' -z, 's' +z, 'e' +x, 'w' -x
  T.yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  T.reset = () => { G.clearInput(); G.damageLog.length = 0; if (G.rescueLog) G.rescueLog.length = 0; };
}

async function boot(opts = {}) {
  const h = await launch({ width: opts.width || 640, height: opts.height || 360 });
  if (opts.start !== false) {
    await h.page.evaluate(() => { window.__game.start({ pointerLock: false }); window.__game.setTimeScale(0); });
  }
  await h.page.evaluate(installPageHelpers);
  return h;
}

function report(name, rows) {
  console.log('\n=== ' + name + ' ===');
  for (const r of rows) console.log(typeof r === 'string' ? r : JSON.stringify(r));
}

module.exports = { boot, report, installPageHelpers };
