// Round 2 re-check: render sounds that play on the same tick together (after the 0.5 master), and try SMG gain changes.
// Same graph as feel_r2_audio.cjs; nothing is written to index.html.
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const out = await h.page.evaluate(async () => {
    const S = __game.CONFIG.audio.sounds, M = __game.CONFIG.audio.master, SR = 44100;
    const render = async (groups, seed0) => { // groups: [[layers, startSeconds], ...]
      const len = Math.max(...groups.map(([ls, at]) => at + Math.max(...ls.map((L) => (L.at || 0) + L.d)))) + 0.1;
      const ctx = new OfflineAudioContext(1, Math.ceil(len * SR), SR), master = ctx.createGain(); master.gain.value = M; master.connect(ctx.destination);
      const nb = ctx.createBuffer(1, SR, SR), nd = nb.getChannelData(0); let seed = seed0 || 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 2147483648 - 1; }
      for (const [layers, at] of groups) for (const L of layers) { const t0 = at + (L.at || 0), t1 = t0 + L.d, env = ctx.createGain(); env.gain.setValueAtTime(L.g, t0); env.gain.exponentialRampToValueAtTime(0.0008, t1); env.connect(master); let src;
        if (L.k === 'n') { src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const f = ctx.createBiquadFilter(); f.type = L.t; f.Q.value = L.q || 0.7; f.frequency.setValueAtTime(L.f, t0); if (L.f1) f.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(f); f.connect(env); src.start(t0, 0.1 + Math.random() * 0.3); }
        else { src = ctx.createOscillator(); src.type = L.t; src.frequency.setValueAtTime(L.f, t0); if (L.f1) src.frequency.exponentialRampToValueAtTime(L.f1, t1); src.connect(env); src.start(t0); }
        src.stop(t1 + 0.02); }
      const b = (await ctx.startRendering()).getChannelData(0); let peak = 0, sq = 0; for (const v of b) { peak = Math.max(peak, Math.abs(v)); sq += v * v; }
      const w = Math.round(0.05 * SR); let best = 0; for (let i = 0; i + w <= b.length; i += w >> 2) { let s = 0; for (let j = i; j < i + w; j++) s += b[j] * b[j]; best = Math.max(best, Math.sqrt(s / w)); }
      const r1 = Math.min(b.length, SR); let s1 = 0; for (let i = 0; i < r1; i++) s1 += b[i] * b[i];
      return { peak: +peak.toFixed(3), clips: peak > 1, rms50: +best.toFixed(3), rms1s: +Math.sqrt(s1 / SR).toFixed(3) };
    };
    const res = {}, worst = async (groups) => { let r = null; for (let s = 1; s <= 12; s++) { const x = await render(groups, s * 7919); if (!r || x.peak > r.peak) r = x; } return r; };
    res['sniper + kill, same tick (worst of 12)'] = await worst([[S.shot_sniper, 0], [S.kill, 0]]);
    res['sniper alone'] = await worst([[S.shot_sniper, 0]]);
    res['grenade_pop + kill + kill (two dummies)'] = await worst([[S.grenade_pop, 0], [S.kill, 0], [S.kill, 0]]);
    res['pistol + kill'] = await worst([[S.shot_pistol, 0], [S.kill, 0]]);
    // one second of sustained fire: rifle 10 shots, smg 15 shots
    const burst = (L, n, gap) => Array.from({ length: n }, (_, i) => [L, i * gap]);
    res['rifle 1 s held (10 shots)'] = await render(burst(S.shot_rifle, 10, 0.1));
    res['smg 1 s held (15 shots)'] = await render(burst(S.shot_smg, 15, 1 / 15));
    res['smg single'] = await render([[S.shot_smg, 0]]); res['rifle single'] = await render([[S.shot_rifle, 0]]);
    const smgTry = (g1, g2) => S.shot_smg.map((L, i) => Object.assign({}, L, { g: i === 0 ? g1 : g2 }));
    res['smg single, gains 1.3 / 0.75'] = await render([[smgTry(1.3, 0.75), 0]]);
    res['smg 1 s held, gains 1.3 / 0.75'] = await render(burst(smgTry(1.3, 0.75), 15, 1 / 15));
    const snTry = S.shot_sniper.map((L, i) => Object.assign({}, L, { g: i === 0 ? 0.6 : i === 1 ? 0.55 : L.g }));
    res['sniper + kill, gains 0.6 / 0.55 (worst of 12)'] = await worst([[snTry, 0], [S.kill, 0]]);
    return res;
  });
  for (const k in out) console.log(k.padEnd(48), JSON.stringify(out[k]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
