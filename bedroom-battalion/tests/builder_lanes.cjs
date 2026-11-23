// Builder: straight lanes up the shelf stairs, skateboard and chair stairs across their shelf-side / ruler-side edge.
// A lane passes when the player stands at the top height at any point; otherwise the final state is printed.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 320, height: 200 });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); });
  const out = await page.evaluate(() => {
    const g = __game, P = () => g.state().player, r = {};
    const lane = (x, z, yaw, secs, topY, input, onTop) => { onTop = onTop || (() => true); g.clearInput(); g.teleport(60, 0, 20); const n = g.damageLog.length; g.teleport(x, 0, z, yaw, 0); g.step(0.1); g.setInput(input);
      let t = 0, p = P(); while (t < secs) { g.step(1 / 60); t += 1 / 60; p = P(); if (p.onGround && p.y >= topY - 0.01 && onTop(p)) break; }
      g.clearInput(); const d = g.damageLog.slice(n).map((k) => +k.amount.toFixed(1));
      return x.toFixed(2) + ':' + (p.onGround && p.y >= topY - 0.01 && onTop(p) ? 'top ' + t.toFixed(1) + 's' : 'NO (' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + ')') + (d.length ? ' dmg ' + d : ''); };
    const range = (a, b, s) => { const o = []; for (let x = a; x <= b + 1e-6; x += s) o.push(+x.toFixed(2)); return o; };
    const W = { forward: true }, S = { forward: true, sprint: true }, seatN = (p) => p.z > 73.05, seatS = (p) => p.z < 86.95;
    r.repro = [lane(107.9, 154, 0, 9, 20, W), lane(107.9, 6, Math.PI, 9, 20, W), lane(92.3, 47, Math.PI, 9, 17, W, seatN)];
    r.tallWalk = range(107.3, 108.4, 0.05).map((x) => lane(x, 154, 0, 9, 20, W));
    r.tallSprint = range(107.3, 108.4, 0.05).map((x) => lane(x, 154, 0, 9, 20, S));
    r.smallWalk = range(107.3, 108.4, 0.05).map((x) => lane(x, 6, Math.PI, 9, 20, W));
    r.skateWalk = range(91.0, 92.4, 0.05).map((x) => lane(x, 47, Math.PI, 9, 17, W, seatN));
    r.skateSprint = range(91.0, 92.4, 0.05).map((x) => lane(x, 47, Math.PI, 9, 17, S, seatN));
    r.chairStairsWalk = range(91.0, 92.4, 0.05).map((x) => lane(x, 113, 0, 9, 17, W, seatS));
    r.chairStairsSprint = range(91.0, 92.4, 0.05).map((x) => lane(x, 113, 0, 9, 17, S, seatS));
    // BUGS 3: from the stair foot, aim at the L1 node and hold W: must reach L1 (y 20) or be blocked, never fall
    g.clearInput(); g.teleport(60, 0, 20); let n = g.damageLog.length; g.teleport(105.7, 0, 152.5); g.step(0.1); g.lookAt(110.5, 21.6, 120); g.setInput(W);
    let t = 0, p = P(); while (t < 12) { g.step(1 / 60); t += 1 / 60; p = P(); if (p.onGround && p.y >= 19.99) break; }
    r.aimAtL1FromFoot = { pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], t: +t.toFixed(1), dmg: g.damageLog.slice(n).map((d) => +d.amount.toFixed(1)) };
    g.clearInput();
    return r;
  });
  for (const k in out) console.log(k, Array.isArray(out[k]) ? '\n   ' + out[k].join('\n   ') : JSON.stringify(out[k]));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
