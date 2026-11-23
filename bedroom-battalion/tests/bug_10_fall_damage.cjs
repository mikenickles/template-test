// Check 7: fall damage against CONFIG (safe below 10 units, 5 hp per unit above) and what happens at 0 health.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const land = () => { for (let i = 0; i < 900 && !T.st().onGround; i++) G.step(DT); G.step(DT); };
    // make sure we start every case at full health: die once if needed (falls of 60 respawn at 100)
    const fullHealth = () => { if (T.st().health < 100) { G.clearInput(); G.teleport(60, 60, 60); land(); } G.damageLog.length = 0; };
    out.config = { fall: G.CONFIG.fall, health: G.CONFIG.player.health, gravity: G.CONFIG.move.gravity };

    // ---- A. straight drops onto the floor ----
    out.drops = [];
    for (const h of [5, 9.9, 10, 10.01, 10.2, 11, 12, 15, 18, 20, 26, 29.8, 29.99, 30, 30.01, 31, 40, 60, 85]) {
      fullHealth(); G.clearInput();
      G.teleport(70, h, 40, 0, 0); land();
      const p = T.st(), d = G.damageLog.slice();
      const expect = Math.max(0, (h - 10) * 5), lethal = expect >= 100;
      out.drops.push({ h, expect: +expect.toFixed(2), logged: d.map((x) => +x.amount.toFixed(3)), cause: d[0] && d[0].cause, hpAfter: +p.health.toFixed(2), lethal, pos: T.pos(), yaw: +p.yaw.toFixed(3),
        ok: (expect === 0 ? d.length === 0 : d.length === 1 && Math.abs(d[0].amount - expect) < 0.02) && (lethal ? p.health === 100 && Math.abs(p.x - 60) < 1e-9 && Math.abs(p.z - 20) < 1e-9 && p.y === 0 : Math.abs(p.health - (100 - expect)) < 0.02) });
    }

    // ---- B. real ledges ----
    const ledge = (name, start, yaw, inp, expectFall) => {
      fullHealth(); G.clearInput(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.3);
      const y0 = T.st().y; let peak = y0;
      G.setInput(inp);
      for (let i = 0; i < 40; i++) { G.step(DT); peak = Math.max(peak, T.st().y); if (inp.jump && i === 2) G.setInput({ jump: false }); }
      let left = false; for (let i = 0; i < 900; i++) { G.step(DT); const p = T.st(); peak = Math.max(peak, p.y); if (!p.onGround) left = true; if (left && p.onGround) break; }
      G.clearInput(); G.step(0.1);
      const d = G.damageLog.slice(), p = T.st();
      out.ledges.push({ name, startY: y0, peak: +peak.toFixed(3), landedAt: T.pos(), logged: d.map((x) => +x.amount.toFixed(2)), loggedHeight: d.map((x) => +(x.height || 0).toFixed(3)), expectIfFallIs: expectFall, expectDmg: +Math.max(0, (expectFall - 10) * 5).toFixed(2), hp: +p.health.toFixed(2) });
    };
    out.ledges = [];
    const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI;
    ledge('walk off the bed east edge (18 -> floor)', [33, 18, 90], E, { forward: true }, 18);
    ledge('sprint off the bed east edge', [31, 18, 90], E, { forward: true, sprint: true }, 18);
    ledge('jump off the bed east edge (apex adds 1.3825)', [34.2, 18, 90], E, { forward: true, jump: true }, 19.3825);
    ledge('walk off the desk west edge (26 -> floor)', [97, 26, 62], W, { forward: true }, 26);
    ledge('walk off the chair seat west edge onto the floor, crouch-walking (17)', [87, 17, 80], W, { forward: true, crouch: true }, 17);
    ledge('walk off tall shelf L1 north edge (20 -> floor)', [114, 20, 118], N, { forward: true }, 20);
    ledge('walk off tall shelf L3 west edge at z 140 (60 -> stairs below at 7.65)', [110, 60, 140], W, { forward: true }, 60 - 7.647);
    ledge('walk off tower top west edge (7 -> 3.3 wall top or floor)', [68.5, 7, 12], W, { forward: true }, 7);
    ledge('walk off tunnel roof (8)', [77, 8, 90], S, { forward: true }, 8);
    ledge('walk off desk onto chair seat (26 -> 17 = 9, safe)', [96.5, 26, 80], W, { forward: true }, 9);
    ledge('jump off desk onto chair seat (9 + 1.3825 = 10.38)', [95.8, 26, 80], W, { forward: true, jump: true }, 10.3825);

    // ---- C. no damage from stairs / ramps / steps taken at a sprint, including jumping down them ----
    out.descents = [];
    const descent = (name, start, yaw, inp, secs) => {
      fullHealth(); G.clearInput(); G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.3);
      for (let i = 0; i < secs * 60; i++) { if (inp.jump) G.setInput(Object.assign({}, inp, { jump: i % 12 < 6 })); else if (i === 0) G.setInput(inp); G.step(DT); }
      G.clearInput(); land();
      out.descents.push({ name, end: T.pos(), dmg: G.damageLog.map((x) => +x.amount.toFixed(2)), heights: G.damageLog.map((x) => +(x.height || 0).toFixed(2)) });
    };
    descent('sprint down the blanket slope', [26, 18, 47], N, { forward: true, sprint: true }, 4);
    descent('sprint + jump spam down the blanket slope', [26, 18, 47], N, { forward: true, sprint: true, jump: true }, 5);
    descent('sprint down the bed book stairs', [26, 18, 113], S, { forward: true, sprint: true }, 5);
    descent('sprint + jump spam down the bed book stairs', [26, 18, 113], S, { forward: true, sprint: true, jump: true }, 6);
    descent('sprint + jump spam down the tall shelf stairs', [105.7, 20, 120], S, { forward: true, sprint: true, jump: true }, 7);
    descent('sprint + jump spam down the skateboard', [89, 17, 74], N, { forward: true, sprint: true, jump: true }, 5);
    descent('sprint + jump spam down the ruler north then off the seat', [94, 26, 64.3], S, { forward: true, sprint: true, jump: true }, 3);
    descent('walk down the pillow terraces', [9, 19.8, 106], N, { forward: true }, 2);

    // ---- D. death: state right after a lethal fall, with keys held and while crouched ----
    out.death = (() => {
      fullHealth(); G.clearInput();
      G.teleport(100, 0, 120, 1.0, 0.5); G.step(0.2);
      G.teleport(70, 45, 100, 1.0, 0.5);
      G.setInput({ forward: true, crouch: true, sprint: true });
      let tickOfDeath = null, pre = null;
      for (let i = 0; i < 600; i++) { const b = T.st(); G.step(DT); if (G.damageLog.length) { tickOfDeath = i; pre = [b.x, b.y, b.z, b.vy]; break; } }
      const p = T.st();
      const r = { preImpact: pre, log: JSON.parse(JSON.stringify(G.damageLog)), afterTick: { pos: [p.x, p.y, p.z], vel: [p.vx, p.vy, p.vz], yaw: p.yaw, pitch: p.pitch, health: p.health, onGround: p.onGround, crouching: p.crouching, climbing: p.climbing, phase: G.state().phase } };
      G.step(1); r.oneSecondLaterKeysStillHeld = T.pos(); G.clearInput();
      G.render(); r.hud = document.getElementById('healthNum').textContent;
      return r;
    })();
    // lethal landing on the spring pad: must respawn, not launch
    out.deathOnPad = (() => { fullHealth(); G.clearInput(); G.teleport(38, 45, 80); for (let i = 0; i < 600 && !G.damageLog.length; i++) G.step(DT); G.step(0.5); return { pos: T.pos(), hp: T.st().health, vy: T.st().vy, log: G.damageLog.map((d) => +d.amount.toFixed(1)) }; })();
    // non-lethal landing on the pad: damage, then launch
    out.hurtOnPad = (() => { fullHealth(); G.clearInput(); G.teleport(38, 20.4, 80); for (let i = 0; i < 600 && !G.damageLog.length; i++) G.step(DT); const a = { vy: T.st().vy, hp: T.st().health }; land(); return { atImpact: a, log: G.damageLog.map((d) => +d.amount.toFixed(1)), landed: T.pos(), hp: T.st().health }; })();
    // HUD at low health
    out.hudLow = (() => { fullHealth(); G.clearInput(); G.teleport(70, 24.5, 40); land(); G.render(); return { hp: T.st().health, text: document.getElementById('healthNum').textContent, cls: document.getElementById('health').className }; })();
    out.hudFraction = (() => { fullHealth(); G.clearInput(); G.teleport(70, 10.05, 40); land(); G.render(); return { hp: T.st().health, text: document.getElementById('healthNum').textContent }; })();
    return out;
  });
  console.log('CONFIG', JSON.stringify(out.config));
  console.log('A. drops:'); for (const r of out.drops) console.log('  ', r.ok ? 'ok ' : 'BAD', JSON.stringify(r));
  console.log('B. ledges:'); for (const r of out.ledges) console.log('  ', Math.abs((r.logged[0] || 0) - r.expectDmg) < 0.3 ? 'ok ' : '?? ', JSON.stringify(r));
  console.log('C. descents:'); for (const r of out.descents) console.log('  ', r.dmg.length ? '?? ' : 'ok ', JSON.stringify(r));
  console.log('D. death:', JSON.stringify(out.death));
  console.log('   lethal landing on the spring pad:', JSON.stringify(out.deathOnPad));
  console.log('   non-lethal landing on the pad:', JSON.stringify(out.hurtOnPad));
  console.log('   HUD at low health:', JSON.stringify(out.hudLow), ' HUD with 0.25 damage:', JSON.stringify(out.hudFraction));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
