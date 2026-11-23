// Injected into the page: a "player-like" raw-input driver. Only uses teleport/lookAt/setInput/step/state.
window.FEEL = (() => {
  const G = __game, T = 1 / 60;
  const st = () => G.state().player;
  // drive toward successive targets [x, y, z, opts]. Re-aims every `reaim` ticks (default 1 = continuous mouse).
  function drive(start, targets, o = {}) {
    const sprint = o.sprint !== false, reaim = o.reaim || 1, maxT = o.maxT || 60;
    G.clearInput(); G.teleport(start[0], start[1], start[2]); G.step(T);
    const trace = []; let t = 0, hp0 = st().health, stuck = null;
    const k = G.CONFIG.player.stepSmooth; let off = 0, prev = st();
    const rec = () => {
      const p = st();
      off *= Math.exp(-k * T); if (Math.abs(off) < 1e-3) off = 0;
      const dy = p.y - prev.y;
      if (prev.onGround && p.onGround && !p.climbing && Math.abs(dy) > 0.15) off -= dy;      // same rule as the game camera
      trace.push({ t, x: p.x, y: p.y, z: p.z, g: p.onGround, c: p.climbing, sp: Math.hypot(p.vx, p.vz), eye: p.y + 1.6 + off, moved: Math.hypot(p.x - prev.x, p.z - prev.z) / T });
      prev = p;
    };
    for (let i = 0; i < targets.length; i++) {
      const B = targets[i]; let n = 0, best = 1e9, since = 0;
      for (;;) {
        const p = st();
        const dh = Math.hypot(B[0] - p.x, B[2] - p.z), dy = Math.abs(B[1] - p.y);
        if (!p.climbing && p.onGround && dh < (B[3] || 0.5) && dy < 0.75) break;
        if (t > maxT || since > 3) { stuck = i; break; }
        if (!p.climbing && n % reaim === 0) G.lookAt(B[0], p.y + 1.6, B[2]);
        G.setInput({ forward: true, sprint });
        G.step(T); t += T; n++; rec();
        const m = dh + dy; if (m < best - 0.01) { best = m; since = 0; } else since += T;
      }
      if (stuck !== null) break;
    }
    G.clearInput();
    const p = st();
    return { ok: stuck === null, stuckAtTarget: stuck, time: +t.toFixed(2), hpLost: hp0 - p.health, end: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], trace };
  }
  // summary of a trace segment where the feet y is between ya and yb (the climb part)
  function seg(trace, pred) {
    const s = trace.filter(pred); if (s.length < 3) return null;
    const speeds = s.map((q) => q.moved);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    // eye roughness: vertical camera speed per tick, and residual of eye height against a straight line fit over time
    const ev = []; for (let i = 1; i < s.length; i++) ev.push((s[i].eye - s[i - 1].eye) / T);
    const fv = []; for (let i = 1; i < s.length; i++) fv.push((s[i].y - s[i - 1].y) / T);
    const n = s.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of s) { sx += q.t; sy += q.eye; sxx += q.t * q.t; sxy += q.t * q.eye; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    let rss = 0, maxRes = 0; for (const q of s) { const r = q.eye - (a + b * q.t); rss += r * r; maxRes = Math.max(maxRes, Math.abs(r)); }
    const evMean = ev.reduce((x, y) => x + y, 0) / ev.length;
    const evStd = Math.sqrt(ev.reduce((x, y) => x + (y - evMean) * (y - evMean), 0) / ev.length);
    return { dur: +(s[s.length - 1].t - s[0].t).toFixed(2), meanHSpeed: +mean.toFixed(2), minHSpeed: +Math.min(...speeds).toFixed(2),
      slowTicks: speeds.filter((v) => v < 0.5 * mean).length, climbRate: +b.toFixed(2),
      eyeVelMin: +Math.min(...ev).toFixed(2), eyeVelMax: +Math.max(...ev).toFixed(2), eyeVelStd: +evStd.toFixed(2),
      eyeResidualRms: +Math.sqrt(rss / n).toFixed(3), eyeResidualMax: +maxRes.toFixed(3), feetVelMax: +Math.max(...fv).toFixed(1) };
  }
  return { drive, seg, st, T };
})();
