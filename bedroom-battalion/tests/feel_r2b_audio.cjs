// Round 2 re-check (copy of feel_r2_audio.cjs): sound without ears. (1) audioLog order and timing against shotLog. (2) Each sound rendered in an OfflineAudioContext
// from the game's own CONFIG.audio.sounds layer table, with the same graph the game builds (noise -> biquad -> gain envelope, or oscillator -> envelope),
// then measured: peak, RMS, length above -40 dB, attack time, spectral centroid, share of energy below 300 Hz and above 3 kHz.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const log = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, out = {};
    const run = (w, ticks, auto) => { G.clearInput(); G.resetTargets(); G.give('ammo'); G.teleport(60, 0, 42); G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(0.8); G.selectWeapon(w); G.step(1.2); const t0 = G.state().time;
      for (let i = 0; i < ticks; i++) { G.lookAt(60, 0.8, 34); G.setInput({ fire: auto ? true : i % 2 === 0 }); G.step(T); } G.clearInput();
      const a = G.audioLog.filter((e) => e.time >= t0).map((e) => e.name.replace('shot_', 'S:') + '@' + (e.time - t0).toFixed(2)), s = G.shotLog.filter((e) => e.time >= t0);
      const st = s.map((e) => e.time), gaps = st.slice(1).map((t, i) => +(t - st[i]).toFixed(3));
      const shotSounds = G.audioLog.filter((e) => e.time >= t0 && e.name.startsWith('shot_')).map((e) => e.time);
      return { events: a.join(' '), shotGaps: gaps, everyShotHasSoundSameTick: st.length === shotSounds.length && st.every((t, i) => Math.abs(t - shotSounds[i]) < 1e-6) }; };
    out.rifle = run('rifle', 36, true); out.smg = run('smg', 30, true); out.pistol = run('pistol', 60, false); out.sniper = run('sniper', 170, false);
    // empty + reload + switch
    { G.clearInput(); G.give('ammo'); G.selectWeapon('rifle'); G.step(1); G.selectWeapon('pistol'); G.step(1); const t0 = G.state().time; G.look(0, 1); for (let i = 0; i < 12; i++) { G.fire(); G.step(0.2); } G.setInput({ fire: true }); G.step(T); G.setInput({ fire: false }); G.step(1.6); G.selectWeapon('rifle'); G.step(0.5);
      out.emptyReloadSwitch = G.audioLog.filter((e) => e.time >= t0 && !e.name.startsWith('shot_')).map((e) => e.name + '@' + (e.time - t0).toFixed(2)).join(' '); }
    // movement sounds
    { G.clearInput(); G.teleport(20, 0, 10, -Math.PI / 2, 0); G.step(0.5); const t0 = G.state().time; G.setInput({ forward: true, sprint: true }); G.step(1.5); G.setInput({ jump: true }); G.step(T); G.setInput({ jump: false }); G.step(1.2); G.clearInput();
      out.move = G.audioLog.filter((e) => e.time >= t0).map((e) => e.name + '@' + (e.time - t0).toFixed(2)).join(' '); }
    out.sounds = G.CONFIG.audio.sounds;
    return out;
  });
  for (const k of ['rifle', 'smg', 'pistol', 'sniper']) console.log(k.padEnd(7), 'shot gaps', JSON.stringify(log[k].shotGaps.slice(0, 8)), ' sound on the shot tick:', log[k].everyShotHasSoundSameTick, '\n        ', log[k].events.slice(0, 330));
  console.log('empty/reload/switch:', log.emptyReloadSwitch); console.log('move:', log.move);
  // offline render
  const m = await h.page.evaluate(async (sounds) => {
    const SR = 44100, out = {};
    for (const name in sounds) { const layers = sounds[name]; const len = Math.max(...layers.map((L) => (L.at || 0) + L.d)) + 0.1;
      const ctx = new OfflineAudioContext(1, Math.ceil(len * SR), SR);
      const nb = ctx.createBuffer(1, SR, SR), nd = nb.getChannelData(0); let seed = 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 2147483648 - 1; }
      for (const L of layers) { const t0 = (L.at || 0), t1 = t0 + L.d, env = ctx.createGain(); env.gain.setValueAtTime(L.g, t0); env.gain.exponentialRampToValueAtTime(0.0008, t1); env.connect(ctx.destination); let src;
        if (L.k === 'n') { src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const f = ctx.createBiquadFilter(); f.type = L.t; f.Q.value = L.q || 0.7; f.frequency.setValueAtTime(L.f, t0); if (L.f1) f.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(f); f.connect(env); src.start(t0, 0.1); }
        else { src = ctx.createOscillator(); src.type = L.t; src.frequency.setValueAtTime(L.f, t0); if (L.f1) src.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(env); src.start(t0); }
        src.stop(t1 + 0.02); }
      const buf = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, sq = 0, iPeak = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) { peak = a; iPeak = i; } sq += buf[i] * buf[i]; }
      const thr = peak * 0.01; let last = 0; for (let i = 0; i < buf.length; i++) if (Math.abs(buf[i]) > thr) last = i;
      // 50 ms window RMS max (loudness proxy)
      const w = Math.round(0.05 * SR); let best = 0; for (let i = 0; i + w <= buf.length; i += w >> 2) { let s = 0; for (let j = i; j < i + w; j++) s += buf[j] * buf[j]; best = Math.max(best, Math.sqrt(s / w)); }
      // spectrum by DFT on the first 8192 samples (Hann), magnitude-squared weighted centroid
      const Nf = 8192, re = new Float64Array(Nf / 2), bins = Nf / 2; let num = 0, den = 0, low = 0, high = 0;
      const x = new Float64Array(Nf); for (let i = 0; i < Nf && i < buf.length; i++) x[i] = buf[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf));
      for (let k = 1; k < bins; k += 2) { let a = 0, b = 0; const wk = 2 * Math.PI * k / Nf; for (let i = 0; i < Nf; i += 1) { a += x[i] * Math.cos(wk * i); b -= x[i] * Math.sin(wk * i); } const p = a * a + b * b, f = k * SR / Nf; num += p * f; den += p; if (f < 300) low += p; if (f > 3000) high += p; }
      out[name] = { peak: +peak.toFixed(2), clips: peak > 1, rms50ms: +best.toFixed(3), lengthMs: Math.round(last / SR * 1000), peakAtMs: Math.round(iPeak / SR * 1000), centroidHz: Math.round(num / den), below300pct: Math.round(100 * low / den), above3kPct: Math.round(100 * high / den), energy: +sq.toFixed(1) };
    }
    return out;
  }, log.sounds);
  console.log('\nsound'.padEnd(17), 'peak  rms50  length  centroid  <300Hz  >3kHz  energy   (raw layer sum before master 0.5)');
  for (const k in m) { const v = m[k]; console.log(k.padEnd(16), String(v.peak).padStart(5) + (v.clips ? '!' : ' '), String(v.rms50ms).padStart(6), (v.lengthMs + 'ms').padStart(7), (v.centroidHz + 'Hz').padStart(9), (v.below300pct + '%').padStart(6), (v.above3kPct + '%').padStart(6), String(v.energy).padStart(8)); }
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
