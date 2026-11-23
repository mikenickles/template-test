// Round 3A bug-tester helpers: boots the FROZEN snapshot (snapshots/index_r3a.html), never index.html.
// installs window.T (bug_lib page helpers), window.R2 (point-in-solid, ray march, seeded rng) and window.R3
// (my own car boxes, envelope and track maths from DESIGN 7 / 16.1, independent of the game's helpers).
const path = require('path');
const { launch } = require('./harness.cjs');
const { installPageHelpers } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const SNAP = path.resolve(__dirname, '..', 'snapshots', 'index_r3a.html');

function installR3() {
  const G = window.__game, R3 = (window.R3 = {});
  const TOP = { engine: 5, boxcar: 5, caboose: 5, flatbed: 1.2, gondola: 1.2 };
  R3.TOP = TOP;
  const L = 55 + Math.PI * 17 * 2 + 55;                 // 216.81
  R3.L = L;
  // DESIGN 7: s = 0 at (43, 107.5), north along x 43, east over the north curve, south along x 77, west over the south curve
  R3.point = (s) => {
    s = ((s % L) + L) % L;
    if (s < 55) return { x: 43, z: 107.5 - s, yaw: 0 };
    s -= 55; const a = Math.PI * 17;
    if (s < a) { const t = s / 17; return { x: 60 - 17 * Math.cos(t), z: 52.5 - 17 * Math.sin(t), yaw: -t }; }
    s -= a;
    if (s < 55) return { x: 77, z: 52.5 + s, yaw: Math.PI };
    s -= 55; const t = s / 17; return { x: 60 + 17 * Math.cos(t), z: 107.5 + 17 * Math.sin(t), yaw: Math.PI - t };
  };
  // swept envelope (16.1): annulus 13.5..19.5 round each curve centre beyond the straights, 2 either side of the straights
  R3.inEnv = (x, z, pad = 0) => {
    if (z >= 52.5 && z <= 107.5) return Math.abs(x - 43) < 2 + pad || Math.abs(x - 77) < 2 + pad;
    const cz = z < 52.5 ? 52.5 : 107.5, r = Math.hypot(x - 60, z - cz);
    return r > 13.5 - pad && r < 19.5 + pad;
  };
  R3.cars = () => G.state().train.cars;
  // car frame: forward f (yaw 0 faces -z, like the player), lateral l
  R3.local = (car, x, z) => { const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), dx = x - car.pos[0], dz = z - car.pos[2]; return { along: dx * fx + dz * fz, lat: dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw) }; };
  // is a soldier body (circle r, feet y, height h) inside a car's main box by more than eps?
  R3.inCar = (x, y, z, h = 1.8, r = 0.4, eps = 0.05) => {
    const out = [];
    for (const c of R3.cars()) {
      const q = R3.local(c, x, z), top = TOP[c.type];
      if (Math.abs(q.along) < 6 + r - eps && Math.abs(q.lat) < 2 + r - eps && y + 0.05 < top - eps && y + h > 0.25 + eps) {
        // depth of overlap horizontally
        out.push({ type: c.type, along: +q.along.toFixed(2), lat: +q.lat.toFixed(2), depth: +Math.min(6 + r - Math.abs(q.along), 2 + r - Math.abs(q.lat)).toFixed(3) });
      }
    }
    return out;
  };
  R3.sOfCar = (c) => c.sFront - 6;
  // step until a car (index) has its centre at track distance sWant (mod L), tick-limited (one lap + 1 s)
  R3.waitCarAt = (idx, sWant, maxSecs = 56) => {
    for (let i = 0; i < Math.round(maxSecs * 60); i++) {
      const c = R3.cars()[idx], d = (((sWant - R3.sOfCar(c)) % L) + L) % L;
      if (d < 4 / 60 + 1e-9) return true;
      G.step(1 / 60);
    }
    return false;
  };
}

async function boot(opts = {}) {
  const h = await launch({ width: opts.width || 640, height: opts.height || 360, file: opts.file || SNAP });
  if (opts.start !== false) await h.page.evaluate(() => { window.__game.start({ pointerLock: false }); window.__game.setTimeScale(0); });
  await h.page.evaluate(installPageHelpers);
  await h.page.evaluate(installR2);
  await h.page.evaluate(installR3);
  return h;
}
module.exports = { boot, SNAP, installR3 };
