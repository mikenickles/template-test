// Round 2 re-check 2 (feel_re2_ pictures; copy of feel_r2b_frames.cjs). Round 2 re-check (copy of feel_r2_frames.cjs): frame-by-frame captures across one shot per weapon (hit), a kill, impacts by surface, idle viewmodels.
const { boot } = require('./feel_lib.cjs');
const { execSync } = require('child_process');
const dir = __dirname + '/../screenshots/round2/';
(async () => {
  const h = await boot();
  const setup = (w, extra) => h.page.evaluate(([w, extra]) => { const G = __game; G.clearInput(); G.resetTargets(); G.give('ammo'); G.give('health'); G.teleport(60, 0, 42); G.selectWeapon(w === 'pistol' ? 'rifle' : 'pistol'); G.step(0.8); G.selectWeapon(w); G.step(1.2); G.lookAt(60, 0.8, 34); if (extra === 'scope') { G.setInput({ scope: true }); G.step(0.4); } G.render(); }, [w, extra || null]);
  const seq = async (tag, ticks, pre) => { const files = []; for (const k of ticks) { await h.page.evaluate(([k, pre]) => { const G = __game; if (k === 0) { /* frame before the shot */ } else if (k === 1) { G.setInput({ fire: true }); G.step(1 / 60); G.setInput({ fire: false }); } else G.step(1 / 60 * (pre || 1)); G.render(); }, [k, pre]); files.push(await h.shot('round2/feel_re2_fr_' + tag + '_' + String(k).padStart(2, '0') + '.png')); } return files; };
  const mont = (out, files, tile) => execSync(`montage ${files.map((f) => '"' + f + '"').join(' ')} -tile ${tile} -geometry 640x360+3+3 "${dir}${out}"`);
  // idle viewmodels
  const idle = []; for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { await setup(w); idle.push(await h.shot('round2/feel_re2_vm_' + w + '.png')); }
  mont('feel_re2_cmp_viewmodels.png', idle, '2x2');
  // one shot, hit not kill: frame before, shot tick, then 5 more ticks
  for (const w of ['rifle', 'smg', 'sniper', 'pistol']) { await setup(w); const f = await seq('hit_' + w, [0, 1, 2, 3, 4, 6]); mont('feel_re2_cmp_shot_' + w + '.png', f, '3x2'); }
  // sniper scoped shot
  { await setup('sniper', 'scope'); const f = await seq('hit_sniper_scoped', [0, 1, 2, 3, 4, 6]); await h.page.evaluate(() => __game.clearInput()); mont('feel_re2_cmp_shot_sniper_scoped.png', f, '3x2'); }
  // kill: rifle, bring the dummy to 20 hp first, then the killing shot and the tip-over
  { await setup('rifle'); await h.page.evaluate(() => { const G = __game; for (let i = 0; i < 3; i++) { G.lookAt(60, 0.8, 34); G.fire(); G.step(0.6); } G.lookAt(60, 0.8, 34); G.render(); });
    const f = []; f.push(await h.shot('round2/feel_re2_fr_kill_00.png'));
    for (const [k, n] of [[1, 1], [2, 1], [4, 2], [8, 4], [14, 6], [30, 16]]) { await h.page.evaluate(([k, n]) => { const G = __game; if (k === 1) { G.setInput({ fire: true }); G.step(1 / 60); G.setInput({ fire: false }); } else G.step(n / 60); G.render(); }, [k, n]); f.push(await h.shot('round2/feel_re2_fr_kill_' + String(k).padStart(2, '0') + '.png')); }
    mont('feel_re2_cmp_kill.png', f.slice(0, 6), '3x2'); }
  // impacts by surface: fire 3 shots at each surface from 4 units and capture 2 ticks after the last
  const surf = await h.page.evaluate(() => { const G = __game; const want = {}; // find a collider of each surface with a clear standing spot 4 units in front
    for (const c of G.colliders) { if (want[c.surface] || c.kind !== 'box' || /^room\.(ceiling|wall)/.test(c.id)) continue; want[c.surface] = c.id; } return want; });
  const S = { wood: [[60, 0, 60], [60, 0.2, 63]], fabric: [[26, 18, 80], [26, 18.1, 84]], plastic: [[60, 0, 30], [56.4, 0.8, 34]], book: [[100, 0, 12], [105.5, 3, 16]], card: [[70, 0, 80], [72.7, 2, 80]], metal: [[42, 0, 80], [38, 0.3, 80]] };
  const sf = []; const got = {};
  for (const s in S) { got[s] = await h.page.evaluate(([p, t]) => { const G = __game; G.clearInput(); G.give('ammo'); G.teleport(p[0], p[1], p[2]); G.selectWeapon('rifle'); G.step(1); let last = null; for (let i = 0; i < 3; i++) { G.lookAt(t[0], t[1], t[2]); last = G.fire(); G.step(0.12); } G.lookAt(t[0], t[1], t[2]); const e = G.fire(); G.step(2 / 60); G.render(); return e && (e.hit + ' / ' + e.surface); }, S[s]); sf.push(await h.shot('round2/feel_re2_fr_impact_' + s + '.png')); }
  console.log('impact surfaces hit:', JSON.stringify(got));
  mont('feel_re2_cmp_impacts.png', sf, '3x2');
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
