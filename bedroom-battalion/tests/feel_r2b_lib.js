// Round 2 re-check helpers (copy of feel_r2_lib.js; burst wait uses the per-weapon moving multiplier). Uses only the documented hook.
window.R2B = (() => {
  const G = __game, T = 1 / 60, st = () => G.state();
  const tgt = (id) => st().targets.find((t) => t.id === id);
  // find a floor spot `d` units from a dummy with a clear line (standing and crouched eye) to its head and body
  // find a floor spot `d` units from a dummy with a clear line (standing and crouched eye, and from 2.5 units either side) to its head and body
  function findSpot(d) {
    const sees = (x, z, t) => { for (const ey of [1.6, 1.0]) for (const ty of [0.7, 1.575]) { const r = G.raycast([x, ey, z], [t.pos[0] - x, t.pos[1] + ty - ey, t.pos[2] - z]); if (!r || r.id !== t.id) return false; } return true; };
    for (const t of st().targets) {
      for (let a = 0; a < 360; a += 2) { const dy = t.pos[1] + 0.75 - 1.6; if (Math.abs(dy) >= d) continue; const dh = Math.sqrt(d * d - dy * dy);
        const x = t.pos[0] + dh * Math.sin(a * Math.PI / 180), z = t.pos[2] + dh * Math.cos(a * Math.PI / 180);
        if (x < 3 || x > 117 || z < 3 || z > 157) continue;
        const px = (t.pos[2] - z) / dh, pz = -(t.pos[0] - x) / dh;
        if (!sees(x, z, t) || !sees(x + px * 2.5, z + pz * 2.5, t) || !sees(x - px * 2.5, z - pz * 2.5, t)) continue;
        let free = true; for (const s of [-1, 1]) { const r = G.raycast([x, 0.9, z], [px * s, 0, pz * s]); if (r && r.distance < 3.5) free = false; }
        if (!free) continue;
        G.clearInput(); G.teleport(x, 0, z); G.step(0.1); const p = st().player; if (!p.onGround || Math.abs(p.y) > 0.01 || Math.hypot(p.x - x, p.z - z) > 0.01) continue;
        return { id: t.id, x, z, d, targetPos: t.pos };
      } }
    return null;
  }
  // one engagement. o: weapon, spot, zone 'body'|'head', stance 'stand'|'crouch'|'move', comp (re-aim every tick), scoped, maxT
  function duel(o) {
    const t0 = tgt(o.spot.id), ty = o.zone === 'head' ? 1.575 : 0.75, W = G.CONFIG.weapons[o.weapon];
    G.clearInput(); G.resetTargets(); G.give('ammo'); G.teleport(o.spot.x, 0, o.spot.z); G.selectWeapon(o.weapon);
    if (o.stance === 'crouch') G.setInput({ crouch: true });
    G.step(1.0);
    const aim = () => { const p = st().player; G.lookAt(t0.pos[0], t0.pos[1] + ty, t0.pos[2]); };
    aim(); if (o.scoped) { G.setInput({ scope: true }); G.step(0.35); }
    const n0 = G.shotLog.length ? G.shotLog[G.shotLog.length - 1].time : -1;
    let t = 0, first = null, shots = 0, hits = 0, head = 0, killT = null, tick = 0; const maxTicks = Math.round((o.maxT || 6) * 60);
    let lastLen = G.shotLog.length, lastTime = n0, inBurst = 0, want = true;
    while (tick < maxTicks) {
      if (o.comp) aim();
      if (o.stance === 'move') { const ph = Math.floor(t / 0.5) % 2; G.setInput({ left: ph === 0, right: ph === 1 }); }
      // fire control: spray = hold / click as fast as allowed; burst = n shots then wait for the spread to settle; 
      const sp = st().weapon.spread, mult = (o.stance === "crouch" ? 0.6 : 1) * (o.stance === "move" ? (W.moveMult || G.CONFIG.gun.spreadMult.move) : 1), base = (o.scoped ? W.scopedSpread : W.spread) * mult;
      if (o.burst) { if (inBurst >= o.burst) { want = false; if (sp <= base + 0.02) inBurst = 0; } else want = true; } else want = true;
      if (W.auto) G.setInput({ fire: want }); else G.setInput({ fire: want && tick % 2 === 0 });
      G.step(T); t += T; tick++;
      const L = G.shotLog; const e = L[L.length - 1];
      if (e && e.time !== lastTime) { lastTime = e.time; shots++; inBurst++; if (first === null) first = t; if (e.hit === o.spot.id) { hits++; if (e.zone === 'head') head++; } }
      if (tgt(o.spot.id).down) { killT = t - first; break; }
    }
    G.clearInput();
    return { killT, shots, hits, head };
  }
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { findSpot, duel, med, tgt, st, T };
})();
