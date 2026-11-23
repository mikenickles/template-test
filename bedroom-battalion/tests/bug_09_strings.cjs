// Check 6: strings. Grab from the bottom / top / mid-air, climb, descend, hold still, let go with jump,
// both ends, every string, every approach direction.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const out = await page.evaluate(() => {
    const G = __game, DT = 1 / 60, out = {};
    const strings = G.colliders.filter((c) => c.kind === 'string');
    const snap = () => { const p = T.st(); return { pos: T.pos(), onGround: p.onGround, climbing: p.climbing, vy: +p.vy.toFixed(2), hp: +p.health.toFixed(1) }; };
    out.list = strings.map((s) => ({ id: s.id, x: s.x, z: s.z, y0: s.y0, y1: s.y1, exit: [s.ex, s.ez] }));

    // ---- A. grab from the bottom from 8 directions, walk and sprint; climb with W; check the top placement ----
    out.bottom = [];
    for (const s of strings) for (let a = 0; a < 8; a++) for (const sprint of [false, true]) {
      const dx = Math.cos(a * Math.PI / 4), dz = Math.sin(a * Math.PI / 4), sx = s.x + dx * 2, sz = s.z + dz * 2;
      G.clearInput(); T.reset(); G.teleport(sx, s.y0 + 0.3, sz, T.yawOf(-dx, -dz), 0);
      if (T.inside({ lift: 0 }).length) continue;
      G.step(0.4);
      const p0 = T.st();
      if (!p0.onGround || Math.abs(p0.y - s.y0) > 0.02) continue;          // no standing room at the string's foot on this side
      G.setInput({ forward: true, sprint });
      let grabbedAt = null, topAt = null, t = 0, grabDist = null;
      for (let i = 0; i < 60 * 14; i++) {
        const before = T.st();
        G.step(DT); t += DT; const p = T.st();
        if (!grabbedAt && p.climbing) { grabbedAt = +t.toFixed(2); grabDist = +Math.hypot(before.x - s.x, before.z - s.z).toFixed(3); }
        if (grabbedAt && !p.climbing) { topAt = +t.toFixed(2); break; }
      }
      const atTop = snap();
      const okTop = topAt !== null && atTop.onGround && Math.abs(atTop.pos[1] - s.y1) < 0.01 && Math.abs(atTop.pos[0] - (s.x + s.ex)) < 0.02 && Math.abs(atTop.pos[2] - (s.z + s.ez)) < 0.02;
      out.bottom.push({ id: s.id, from: a * 45, sprint, grabbedAt, grabDist, climbSecs: topAt && grabbedAt ? +(topAt - grabbedAt).toFixed(2) : null, expectSecs: +((s.y1 - s.y0) / 3.5).toFixed(2), okTop, atTop: atTop.pos, hp: atTop.hp });
    }

    // ---- B. on the string: W up, S down, nothing holds, W+S holds, A/D do nothing, look around is free, Space lets go ----
    out.controls = (() => {
      const s = strings.find((c) => c.id === 'desk.yoyo');
      const on = () => { G.clearInput(); T.reset(); G.teleport(107, 0, 52.5, Math.PI, 0); G.step(0.2); G.setInput({ forward: true }); G.step(2); G.clearInput(); return T.st().y; };
      const r = {};
      let y = on(); G.step(1); r.noKeysHolds = +(T.st().y - y).toFixed(3);
      y = on(); G.setInput({ forward: true }); G.step(1); r.W_perSec = +(T.st().y - y).toFixed(3);
      y = on(); G.setInput({ back: true }); G.step(1); r.S_perSec = +(T.st().y - y).toFixed(3);
      y = on(); G.setInput({ forward: true, back: true }); G.step(1); r.WS_perSec = +(T.st().y - y).toFixed(3);
      y = on(); G.setInput({ left: true }); G.step(1); r.A = { dy: +(T.st().y - y).toFixed(3), pos: T.pos(), climbing: T.st().climbing };
      y = on(); G.setInput({ forward: true, sprint: true }); G.step(1); r.WShift_perSec = +(T.st().y - y).toFixed(3);
      y = on(); G.setInput({ crouch: true, forward: true }); G.step(1); r.WCrouch = { dy: +(T.st().y - y).toFixed(3), crouching: T.st().crouching };
      y = on(); G.look(1.3, 0.4); G.step(0.5); r.lookWhileClimbing = { yaw: T.st().yaw, pitch: T.st().pitch, stillClimbing: T.st().climbing };
      y = on(); G.render(); r.hintShown = getComputedStyle(document.getElementById('hint')).display;
      // let go with jump at a few heights: damage must match (fall from the release height)
      r.letGo = [];
      for (const secs of [0.5, 2, 3.2, 4, 6]) {
        G.clearInput(); T.reset(); G.teleport(107, 0, 52.5, Math.PI, 0); G.step(0.2); G.setInput({ forward: true }); G.step(secs); G.clearInput();
        const y0 = T.st().y;
        G.setInput({ jump: true }); G.step(DT); const vyAfter = T.st().vy, stillClimbing = T.st().climbing; G.clearInput();
        let maxY = y0; for (let i = 0; i < 400 && !T.st().onGround; i++) { G.step(DT); maxY = Math.max(maxY, T.st().y); }
        r.letGo.push({ releaseY: +y0.toFixed(2), vyAfter: +vyAfter.toFixed(2), stillClimbing, maxY: +maxY.toFixed(2), landed: T.pos(), dmg: G.damageLog.map((d) => +d.amount.toFixed(2)), expectDmg: +Math.max(0, (y0 - 10) * 5).toFixed(2) });
      }
      // let go and keep holding W toward the string: re-grab after the cooldown?
      G.clearInput(); T.reset(); G.teleport(107, 0, 52.5, Math.PI, 0); G.step(0.2); G.setInput({ forward: true }); G.step(6); const yRel = T.st().y;
      G.setInput({ jump: true }); G.step(DT); G.setInput({ jump: false });
      let regrabY = null; for (let i = 0; i < 200; i++) { G.step(DT); if (T.st().climbing) { regrabY = T.st().y; break; } if (T.st().onGround) break; }
      r.letGoThenKeepW = { releaseY: +yRel.toFixed(2), regrabbedAtY: regrabY === null ? null : +regrabY.toFixed(2), dmg: G.damageLog.length };
      G.clearInput();
      return r;
    })();

    // ---- C. grab from the top: walk off the surface toward the string, then S all the way down ----
    out.top = [];
    for (const s of strings) for (const sprint of [false, true]) for (const off of [0, 0.35, 0.7]) {
      // stand 2.5 units "inland" along the exit direction, offset sideways, and walk straight at the edge
      const px = s.x + s.ex * 3.5 + s.ez * off, pz = s.z + s.ez * 3.5 + s.ex * off;
      G.clearInput(); T.reset(); G.teleport(px, s.y1 + 0.3, pz, T.yawOf(-s.ex, -s.ez), 0); G.step(0.4);
      const p0 = T.st(); if (!p0.onGround || Math.abs(p0.y - s.y1) > 0.02) { out.top.push({ id: s.id, off, skipped: T.pos() }); continue; }
      G.setInput({ forward: true, sprint });
      let grabbed = false; for (let i = 0; i < 180; i++) { G.step(DT); if (T.st().climbing) { grabbed = true; break; } if (!T.st().onGround && T.st().y < s.y1 - 1) break; }
      const g = snap();
      G.step(1.0); const afterHoldingW = snap();      // W still held after grabbing from the top: must not pop back up or fall
      G.clearInput(); G.setInput({ back: true });
      let t = 0; while (T.st().climbing && t < 12) { G.step(DT); t += DT; }
      G.clearInput(); G.step(0.3);
      const b = snap();
      out.top.push({ id: s.id, sprint, sideOffset: off, grabbed, grabPos: g.pos, afterHoldingW1s: afterHoldingW.climbing ? 'still hanging at y ' + afterHoldingW.pos[1] : 'NOT climbing ' + afterHoldingW.pos, descendSecs: +t.toFixed(2), bottom: b.pos, bottomOnGround: b.onGround, bottomY_ok: Math.abs(b.pos[1] - s.y0) < 0.01, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
    }
    // jump off the top edge over the string (above y1 + 0.05 there is no grab): what happens
    out.jumpOverTop = (() => { G.clearInput(); T.reset(); G.teleport(110, 40, 136, Math.PI / 2, 0); G.step(0.3); G.setInput({ forward: true, sprint: true }); G.step(0.15); G.setInput({ jump: true }); G.step(DT); G.setInput({ jump: false }); for (let i = 0; i < 300 && !T.st().onGround && !T.st().climbing; i++) G.step(DT); G.clearInput(); return { end: snap(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) }; })();

    // ---- D. grab while falling: start above and beside the string, steer into it ----
    out.falling = [];
    for (const [id, drop] of [['desk.yoyo', 3], ['desk.yoyo', 20], ['desk.yoyo', 55], ['s.tall.str.L3a', 5], ['s.tall.str.L3a', 25], ['s.tall.str.L2a', 45]]) {
      const s = strings.find((c) => c.id === id);
      const sx = s.x - s.ex * 0.6, sz = s.z - s.ez * 0.6;      // 0.6 out on the open side
      G.clearInput(); T.reset(); G.teleport(sx, s.y1 + drop, sz, T.yawOf(s.ex, s.ez), 0);
      if (T.inside({ lift: 0 }).length) { out.falling.push({ id, drop, skipped: true }); continue; }
      // fall with no keys; press W (toward the string) only once the feet are inside the string's height range
      let g = null, vyBefore = 0; for (let i = 0; i < 600; i++) { const b = T.st(); if (b.y < s.y1 - 1.5) G.setInput({ forward: true }); G.step(DT); const p = T.st(); if (p.climbing) { g = snap(); vyBefore = b.vy; break; } if (p.onGround) break; }
      const hpAtGrab = T.st().health;
      G.clearInput(); G.setInput({ back: true }); let t = 0; while (T.st().climbing && t < 12) { G.step(DT); t += DT; } G.clearInput(); G.step(0.3);
      out.falling.push({ id, fromAboveTop: drop, grabbed: !!g, grabY: g ? g.pos[1] : null, vyBeforeGrab: +vyBefore.toFixed(1), afterDescending: snap(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) });
    }
    // falling past a string WITHOUT touching a key: no grab expected
    out.fallingNoKeys = (() => { const s = strings.find((c) => c.id === 'desk.yoyo'); G.clearInput(); T.reset(); G.teleport(s.x, s.y1 + 5, s.z - 0.5, 0, 0); let grabbed = false; for (let i = 0; i < 400 && !T.st().onGround; i++) { G.step(DT); if (T.st().climbing) grabbed = true; } return { grabbed, end: snap(), dmg: G.damageLog.map((d) => +d.amount.toFixed(1)) }; })();

    // ---- E. feet range: jump into the foot of a floor string; jump on the shelf at a string top ----
    out.jumpGrab = (() => { G.clearInput(); T.reset(); G.teleport(107, 0, 52.5, Math.PI, 0); G.step(0.2); G.setInput({ forward: true, jump: true }); G.step(DT); G.setInput({ jump: false }); G.step(0.5); const a = snap(); G.clearInput(); return a; })();

    // ---- F. bottom end: S at the bottom steps off; S held keeps walking backward; W at bottom facing away ----
    out.bottomEnd = (() => {
      const r = {};
      G.clearInput(); T.reset(); G.teleport(107, 0, 52.5, Math.PI, 0); G.step(0.2); G.setInput({ forward: true }); G.step(1.5); G.clearInput(); G.setInput({ back: true }); G.step(3); r.afterSHeld3s = snap(); G.clearInput();
      // shelf string bottom (no floor under it): S down from L2 to L1
      G.teleport(110.5, 40, 130, Math.PI / 2, 0); G.step(0.2); G.setInput({ forward: true }); for (let i = 0; i < 200 && !T.st().climbing; i++) G.step(DT); G.clearInput(); G.setInput({ back: true }); G.step(8); r.shelfBottomAfterSHeld8s = snap(); G.clearInput();
      return r;
    })();
    return out;
  });
  console.log('strings:', JSON.stringify(out.list));
  const badBottom = out.bottom.filter((r) => !r.okTop || Math.abs(r.climbSecs - r.expectSecs) > 0.3 || r.hp !== out.bottom[0].hp);
  console.log(`A. grab from the bottom: ${out.bottom.length} approaches, ${badBottom.length} not ending on the top surface 1 unit along the exit`);
  const byId = {}; for (const r of out.bottom) (byId[r.id] = byId[r.id] || []).push(`${r.from}${r.sprint ? 's' : 'w'}:${r.okTop ? 'ok' : 'BAD'}@${r.grabDist}`);
  for (const k in byId) console.log('   ', k, byId[k].join(' '));
  for (const r of badBottom.slice(0, 10)) console.log('    BAD', JSON.stringify(r));
  console.log('B. controls on the string:', JSON.stringify(out.controls, null, 0));
  console.log('C. grab from the top and descend:'); for (const r of out.top) console.log('   ', JSON.stringify(r));
  console.log('   jump off the top over the string:', JSON.stringify(out.jumpOverTop));
  console.log('D. grab while falling:'); for (const r of out.falling) console.log('   ', JSON.stringify(r));
  console.log('   falling past with no keys:', JSON.stringify(out.fallingNoKeys));
  console.log('E. jump into the foot of the string:', JSON.stringify(out.jumpGrab));
  console.log('F. bottom end:', JSON.stringify(out.bottomEnd));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
