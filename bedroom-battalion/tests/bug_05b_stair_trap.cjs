// Follow-up on the book-stair dead stop under the shelf L1 board, plus the fort wall top walk.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    const sample = () => { const p = T.st(); return { pos: T.pos(), vel: [+p.vx.toFixed(2), +p.vy.toFixed(2), +p.vz.toFixed(2)], onGround: p.onGround, climbing: p.climbing }; };
    const getStuck = () => { G.clearInput(); G.teleport(107.9, 0, 154, YAW.n, 0); G.step(0.2); G.setInput({ forward: true }); G.step(8); G.clearInput(); return sample(); };

    out.stuck = getStuck();
    const tryKeys = (label, inp, secs = 4) => { getStuck(); G.setInput(inp); G.step(secs); G.clearInput(); G.step(0.2); out['escape with ' + label] = sample(); };
    tryKeys('W (4 s more)', { forward: true });
    tryKeys('W+Shift', { forward: true, sprint: true });
    tryKeys('W+A (strafe away from the shelf while still pushing forward)', { forward: true, left: true });
    tryKeys('W+D', { forward: true, right: true });
    tryKeys('W+Space (re-pressed 4 times)', { forward: true, jump: true });
    tryKeys('A alone for 0.3 s then W', null);
    getStuck(); G.setInput({ left: true }); G.step(0.3); G.clearInput(); G.setInput({ forward: true }); G.step(4); G.clearInput(); G.step(0.2); out['escape with A alone for 0.3 s then W'] = sample();
    getStuck(); G.setInput({ back: true }); G.step(0.5); G.clearInput(); G.step(0.2); out['S alone 0.5 s (can you back off?)'] = sample();

    // natural play 1: walk up the middle of the stairs, then cut the corner toward the shelf near the top
    out.cutCorner = [];
    for (const zTurn of [140, 135, 130, 128, 126, 125, 124.5, 124]) for (const sprint of [false, true]) {
      G.clearInput(); T.reset(); G.teleport(105.75, 0, 153, YAW.n, 0); G.step(0.2);
      G.setInput({ forward: true, sprint });
      while (T.st().z > zTurn) G.step(DT);
      const turnAt = T.pos();
      G.lookAt(110.5, T.st().y + 1.6, 120);                    // look at the spot on L1 you are heading for
      let t = 0, res = 'timeout';
      for (; t < 8; t += DT) { G.step(DT); const p = T.st(); if (p.onGround && Math.abs(p.y - 20) < 0.01 && p.x > 108.4) { res = 'on L1'; break; } if (p.onGround && p.y < 1) { res = 'fell to the floor'; break; } if (p.onGround && Math.hypot(p.vx, p.vz) < 0.01 && t > 0.5) { res = 'DEAD STOP'; break; } }
      G.clearInput();
      out.cutCorner.push({ turnedAt: turnAt, sprint, result: res, end: T.pos(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
    }
    // natural play 2: track the L1 node with the view the whole way from the foot (what walkPath would do without the s.ts.top node)
    for (const sprint of [false, true]) {
      G.clearInput(); T.reset(); G.teleport(105.7, 0, 152.5); G.step(0.2);
      const r = T.goTo(110.5, 120, { sprint, timeout: 15, y: 20 });
      out['track L1 node (110.5,120) from the stair foot' + (sprint ? ' sprint' : '')] = { r, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) };
    }
    // same on the small shelf (mirror)
    G.clearInput(); T.reset(); G.teleport(105.75, 0, 7, YAW.s, 0); G.step(0.2); G.setInput({ forward: true }); while (T.st().z < 34) G.step(DT);
    G.lookAt(110.5, T.st().y + 1.6, 40); G.step(4); G.clearInput(); out.smallShelfCutCorner = sample();

    // fort north wall top, reached properly: up the tower ramp from its foot, then sidestep north
    G.clearInput(); T.reset(); G.teleport(51.5, 0, 9, YAW.e, 0); G.step(0.2);
    G.setInput({ forward: true }); while (T.st().x < 60.5) G.step(DT); G.clearInput(); G.step(0.2);
    const onRamp = sample();
    G.look(YAW.n, 0); G.setInput({ forward: true }); G.step(0.35); G.clearInput(); G.step(0.3);
    const north = sample();
    G.look(YAW.w, 0); G.setInput({ forward: true }); G.step(2.2); G.clearInput(); G.step(0.3);
    const west = sample();
    out.fortWallTop = { onRamp, afterSidesteppingNorth: north, afterWalkingWestOnTheWallTop: west, surface: T.st().surface, dmg: G.damageLog.length };
    return out;
  });
  for (const k of Object.keys(out)) {
    if (Array.isArray(out[k])) { console.log(k + ':'); for (const r of out[k]) console.log('   ' + JSON.stringify(r)); } else console.log(k + ': ' + JSON.stringify(out[k]));
  }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
