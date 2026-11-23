// Round 4: the round 4B sound graph rendered offline with the game's own CONFIG (layers, master, reverb impulse and sends, room tone):
// loudness of distant enemy shots, impacts and the plastic clatter against the room tone and creaks; the reverb tail. Enemy sounds use the
// game's listenerGain (audioRef 5 / distance). Note from reading the graph: no panner node anywhere, so every sound is mono and centred.
const fs = require('fs');
const { launch } = require('./harness.cjs');
(async () => {
  const h = await launch({ file: __dirname + '/../snapshots/index_r4b.html' });
  const r = await h.page.evaluate(async () => {
    const A = __game.CONFIG.audio, S = A.sounds, SR = 44100, ref = __game.CONFIG.train.audioRef;
    async function render(events, secs, withTone) {   // events: [name, vol, at]
      const ctx = new OfflineAudioContext(1, Math.ceil(secs * SR), SR), out = ctx.createGain(); out.gain.value = A.master; out.connect(ctx.destination);
      const nb = ctx.createBuffer(1, SR, SR), nd = nb.getChannelData(0); let seed = 99; for (let i = 0; i < nd.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 2147483648 - 1; }
      const R = A.reverb, len = Math.floor(R.seconds * SR), ir = ctx.createBuffer(1, len, SR), d2 = ir.getChannelData(0); for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d2[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / len, R.decay); }
      const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = R.wet; verb.connect(wet); wet.connect(out);
      if (withTone) { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = nb; src.loop = true; f.type = 'lowpass'; f.frequency.value = A.ambience.toneCut; g.gain.value = A.ambience.tone; src.connect(f); f.connect(g); g.connect(out); src.start(0); }
      for (const [name, vol, at] of events) { const send = R.send[name] || 0; for (const L of S[name]) { const t0 = at + (L.at || 0), t1 = t0 + L.d, env = ctx.createGain(); env.gain.setValueAtTime(Math.max(0.0009, L.g * vol), t0); env.gain.exponentialRampToValueAtTime(0.0008, t1); env.connect(out);
        if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; env.connect(sg); sg.connect(verb); }
        let src; if (L.k === 'n') { src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const f = ctx.createBiquadFilter(); f.type = L.t; f.Q.value = L.q || 0.7; f.frequency.setValueAtTime(L.f, t0); if (L.f1) f.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(f); f.connect(env); src.start(t0, 0.1); }
        else { src = ctx.createOscillator(); src.type = L.t; src.frequency.setValueAtTime(L.f, t0); if (L.f1) src.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(env); src.start(t0); } src.stop(t1 + 0.02); } }
      const b = (await ctx.startRendering()).getChannelData(0); const w = Math.round(0.05 * SR); let best = 0, peak = 0; for (let i = 0; i + w <= b.length; i += w >> 2) { let s = 0; for (let j = i; j < i + w; j++) s += b[j] * b[j]; best = Math.max(best, Math.sqrt(s / w)); }
      for (const v of b) peak = Math.max(peak, Math.abs(v));
      // tail: rms over 0.3..1.3 s after the start
      let ts = 0; const a0 = Math.floor(0.3 * SR), a1 = Math.min(b.length, Math.floor(1.3 * SR)); for (let i = a0; i < a1; i++) ts += b[i] * b[i];
      return { rms50: +best.toFixed(4), peak: +peak.toFixed(3), tail: +Math.sqrt(ts / Math.max(1, a1 - a0)).toFixed(4) };
    }
    const out = {}, dB = (x, ref) => +(20 * Math.log10(x / ref)).toFixed(1);
    out.roomTone = await render([], 1.5, true);
    const tone = out.roomTone.rms50;
    for (const [n, v] of [['creak_room', 1], ['creak_bed', 1]]) out[n] = await render([[n, v, 0]], 1.8, false);
    for (const d of [5, 15, 30, 60, 100]) { const g = d <= ref ? 1 : ref / d; for (const n of ['shot_rifle', 'shot_smg', 'shot_pistol', 'shot_sniper', 'hit_wood', 'hit_fabric', 'clatter']) out[n + ' at ' + d + ' u'] = await render([[n, g, 0]], 1.5, false); }
    out['own rifle (full level)'] = await render([['shot_rifle', 1, 0]], 1.5, false);
    out['own step_wood'] = await render([['step_wood', 1, 0]], 0.5, false);
    for (const k in out) { if (k !== 'roomTone') out[k].vsRoomTone_dB = dB(out[k].rms50, tone); }
    return out;
  });
  for (const k in r) console.log(k.padEnd(28), JSON.stringify(r[k]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
