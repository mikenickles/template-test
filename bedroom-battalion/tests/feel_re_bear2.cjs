// Re-check: bear descent done carefully (stop on the head, then step off at crouch speed / with a short tap).
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, T = 1 / 60, st = () => G.state().player, out = {};
    for (const mode of ['crouch-walk off', 'walk tap 0.25 s then release', 'walk off then hold back']) {
      G.clearInput(); G.teleport(60, 0, 20); G.step(T); const b = G.damageLog.length; G.teleport(10, 15, 38.5, 0, 0); G.step(0.3);
      if (mode[0] === 'c') { G.setInput({ crouch: true, forward: true }); G.step(2.5); }
      else if (mode.includes('tap')) { G.setInput({ forward: true }); G.step(0.25); G.clearInput(); G.step(2); }
      else { G.setInput({ forward: true }); let n = 0; while (st().onGround && n++ < 120) G.step(T); G.setInput({ forward: false, back: true }); G.step(1.5); }
      G.clearInput(); G.step(0.5); const p = st(); out[mode] = { landedY: +p.y.toFixed(1), z: +p.z.toFixed(1), damage: G.damageLog.slice(b).map((d) => Math.round(d.amount)) }; }
    return out;
  });
  console.log(JSON.stringify(r));
  await h.browser.close();
})();
