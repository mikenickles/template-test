// Movement mechanics measured with raw setInput + step on open floor (x 20, z 10..24 strip is clear? use 90,140 area checked below).
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, out = {};
    const st = () => G.state().player;
    const tick = () => G.step(T);
    // open strip: x = 20, z from 8 to 22 heading south is clear floor in the NW corner? verify by walking it.
    const START = [10, 0, 6];            // NW corner, heading east along z = 6 (clear to x ~ 44)
    const reset = (yaw) => { G.clearInput(); G.teleport(START[0], START[1], START[2], yaw, 0); G.step(0.2); };
    const EAST = -Math.PI / 2;           // yaw 0 = north, positive = left (west) => east is -pi/2
    // 1. accel: time to 95 % and 100 % walk speed
    for (const mode of ['walk', 'sprint', 'crouch']) {
      reset(EAST);
      if (mode === 'crouch') { G.setInput({ crouch: true }); G.step(0.5); }
      G.setInput({ forward: true, sprint: mode === 'sprint' });
      const target = mode === 'walk' ? 5 : mode === 'sprint' ? 7 : 2.5;
      let t95 = null, t100 = null, x0 = st().x; const prof = [];
      for (let i = 1; i <= 40; i++) { tick(); const p = st(); const v = Math.hypot(p.vx, p.vz); if (i <= 8) prof.push(+v.toFixed(2));
        if (t95 === null && v >= 0.95 * target) t95 = i * T; if (t100 === null && v >= target - 1e-6) t100 = i * T; }
      const dAccel = st().x - x0;
      // stop: release and measure distance + time
      const xs = st().x; G.clearInput(); if (mode === 'crouch') G.setInput({ crouch: true });
      let ts = null; for (let i = 1; i <= 30; i++) { tick(); const p = st(); if (ts === null && Math.hypot(p.vx, p.vz) < 1e-6) ts = i * T; }
      out[mode] = { topSpeed: target, t95, t100, speedFirst8Ticks: prof, stopTime: ts, stopDist: +(st().x - xs).toFixed(3) };
    }
    // 2. reverse (W -> S) and strafe response at walk speed
    reset(EAST); G.setInput({ forward: true }); G.step(0.5);
    G.setInput({ forward: false, back: true }); let x = st().x, far = x, tRev = null, tFull = null;
    for (let i = 1; i <= 40; i++) { tick(); const p = st(); if (p.x > far) far = p.x; if (tRev === null && p.vx <= 0) tRev = i * T; if (tFull === null && p.vx <= -5 + 1e-6) tFull = i * T; }
    out.reverse = { overshoot: +(far - x).toFixed(3), timeToZero: tRev, timeToFullBack: tFull };
    reset(EAST); G.setInput({ right: true }); let tS = null;
    for (let i = 1; i <= 30; i++) { tick(); const p = st(); if (tS === null && Math.hypot(p.vx, p.vz) >= 5 - 1e-6) tS = i * T; }
    const ps = st(); out.strafe = { timeToFull: tS, speed: +Math.hypot(ps.vx, ps.vz).toFixed(3) };
    G.setInput({ right: false, left: true }); let zz = st().z, zfar = zz, tFlip = null;
    for (let i = 1; i <= 30; i++) { tick(); const p = st(); if (Math.abs(p.z - zz) > Math.abs(zfar - zz)) zfar = p.z; if (tFlip === null && Math.abs(p.vz) >= 5 - 1e-6 && Math.sign(p.vz) !== Math.sign(ps.vz)) tFlip = i * T; }
    out.strafeFlip = { ADADtimeToFullOpposite: tFlip, overshoot: +Math.abs(zfar - zz).toFixed(3) };
    // diagonal speed (W + D)
    reset(EAST); G.setInput({ forward: true, right: true }); G.step(0.5); let p = st(); out.diagonalSpeed = +Math.hypot(p.vx, p.vz).toFixed(3);
    // backpedal + sprint
    reset(EAST); G.setInput({ back: true, sprint: true }); G.step(0.5); p = st(); out.backSprintSpeed = +Math.hypot(p.vx, p.vz).toFixed(3);
    reset(EAST); G.setInput({ right: true, sprint: true }); G.step(0.5); p = st(); out.strafeSprintSpeed = +Math.hypot(p.vx, p.vz).toFixed(3);
    reset(EAST); G.setInput({ right: true, forward: true, sprint: true }); G.step(0.5); p = st(); out.diagSprintSpeed = +Math.hypot(p.vx, p.vz).toFixed(3);
    // 3. jump: standing
    reset(EAST); G.setInput({ jump: true }); let apex = 0, air = 0, left = false, tLeft = 0;
    for (let i = 1; i <= 120; i++) { tick(); const q = st(); if (!q.onGround) { left = true; air++; if (q.y > apex) apex = q.y; } else if (left) break; else tLeft++; if (i === 2) G.setInput({ jump: false }); }
    out.jumpStanding = { apex: +apex.toFixed(3), airTime: +(air * T).toFixed(3), ticksBeforeLeaving: tLeft };
    // held jump = bunny hop? hold jump for 3 s and count jumps
    reset(EAST); G.setInput({ jump: true }); let jumps = 0, was = true; for (let i = 0; i < 180; i++) { tick(); const q = st(); if (was && !q.onGround) jumps++; was = q.onGround; }
    out.jumpHeld3s = jumps;
    // running jump distance (walk and sprint)
    for (const mode of ['walk', 'sprint']) {
      reset(EAST); G.setInput({ forward: true, sprint: mode === 'sprint' }); G.step(0.5);
      const xa = st().x; G.setInput({ jump: true }); tick(); G.setInput({ jump: false }); let n = 1; let ap = 0;
      while (!st().onGround && n < 200) { tick(); n++; ap = Math.max(ap, st().y); }
      out['jumpDist_' + mode] = { dist: +(st().x - xa).toFixed(3), air: +(n * T).toFixed(3), apex: +ap.toFixed(3), speedAfter: +Math.hypot(st().vx, st().vz).toFixed(3) };
    }
    // 4. air control: standing jump, then hold forward; and running jump then release / reverse / strafe
    reset(EAST); G.setInput({ jump: true }); tick(); G.setInput({ jump: false, forward: true }); let n = 1; const xa = st().x;
    while (!st().onGround && n < 200) { tick(); n++; }
    out.airControl_standingJumpThenForward = { dist: +(st().x - xa).toFixed(3), endSpeed: +Math.hypot(st().vx, st().vz).toFixed(3) };
    reset(EAST); G.setInput({ forward: true }); G.step(0.5); const xb = st().x; G.setInput({ jump: true }); tick(); G.setInput({ jump: false, forward: false }); n = 1;
    while (!st().onGround && n < 200) { tick(); n++; }
    out.airControl_runJumpThenRelease = { dist: +(st().x - xb).toFixed(3), endSpeed: +Math.hypot(st().vx, st().vz).toFixed(3) };
    reset(EAST); G.setInput({ forward: true }); G.step(0.5); const xc = st().x; G.setInput({ jump: true }); tick(); G.setInput({ jump: false, forward: false, back: true }); n = 1;
    while (!st().onGround && n < 200) { tick(); n++; }
    out.airControl_runJumpThenBack = { dist: +(st().x - xc).toFixed(3), endVx: +st().vx.toFixed(3) };
    reset(EAST); G.setInput({ forward: true }); G.step(0.5); const zc = st().z; G.setInput({ jump: true }); tick(); G.setInput({ jump: false, right: true }); n = 1;
    while (!st().onGround && n < 200) { tick(); n++; }
    out.airControl_runJumpPlusStrafe = { sideDrift: +(st().z - zc).toFixed(3), endSpeed: +Math.hypot(st().vx, st().vz).toFixed(3) };
    // 5. crouch transition: time for eye to settle (y is feet; eye not in state, so time is eyeLerp-derived) and speed change
    reset(EAST); G.setInput({ forward: true }); G.step(0.5); G.setInput({ crouch: true }); let tc = null;
    for (let i = 1; i <= 30; i++) { tick(); const q = st(); if (tc === null && Math.hypot(q.vx, q.vz) <= 2.5 + 1e-6) tc = i * T; }
    out.crouchWhileWalking = { timeToCrouchSpeed: tc, crouching: st().crouching, eyeDropTime_calc: (G.CONFIG.player.eye - G.CONFIG.player.crouchEye) / G.CONFIG.player.eyeLerp };
    // crouch jump height
    reset(EAST); G.setInput({ crouch: true }); G.step(0.3); G.setInput({ crouch: true, jump: true }); tick(); G.setInput({ crouch: true, jump: false }); let ca = 0; n = 0;
    while (n < 200) { tick(); n++; ca = Math.max(ca, st().y); if (st().onGround) break; }
    out.crouchJumpApex = +ca.toFixed(3);
    // 6. what can be jumped onto: ruin platform (1.2) yes; brick 1.2; block 3 no. step-up without jump = 0.65
    out.config = { move: G.CONFIG.move, climb: G.CONFIG.climb, player: G.CONFIG.player };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
