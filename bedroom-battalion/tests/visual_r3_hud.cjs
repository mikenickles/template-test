// Round 3 HUD and menus at 1280x720 and 1920x1080: title, freeze picker, live top bar / kill feed / callouts, damage
// arcs checked against the attacker's real bearing, kill feed over bright and dark backgrounds, spectating banner,
// round-end, match-end, pause. Element rectangles are checked for overlaps and for leaving the screen.
const { open, dE, hex } = require('./visual_r3_lib.cjs');
const IDS = ['mbar', 'feed', 'callouts', 'picker', 'spect', 'ammo', 'health', 'crosshair', 'roundEnd', 'matchEnd', 'pause', 'title'];
const rects = (p) => p.evaluate((IDS) => { const out = {}; for (const id of IDS) { const e = document.getElementById(id); if (!e) continue; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
  let el = e; if (id === 'roundEnd' || id === 'matchEnd') el = e.querySelector('.box'); const b = el.getBoundingClientRect(); if (b.width && b.height) out[id] = [b.left, b.top, b.width, b.height].map(Math.round); }
  const over = []; const ks = Object.keys(out).filter((k) => !['roundEnd', 'matchEnd', 'pause', 'title', 'crosshair'].includes(k));
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = out[ks[i]], b = out[ks[j]]; if (!(a[0] >= b[0] + b[2] || b[0] >= a[0] + a[2] || a[1] >= b[1] + b[3] || b[1] >= a[1] + a[3])) over.push(ks[i] + '/' + ks[j]); }
  const off = Object.entries(out).filter(([k, a]) => a[0] < 0 || a[1] < 0 || a[0] + a[2] > innerWidth || a[1] + a[3] > innerHeight).map(([k]) => k);
  // text clipped inside its box
  const clipped = [...document.querySelectorAll('#hud *, .overlay *, #title *')].filter((e) => e.offsetParent && e.children.length === 0 && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).overflow !== 'visible').map((e) => e.id || e.className || e.tagName);
  return { rects: out, overlaps: over, offscreen: off, clipped }; }, IDS);
async function run(tag, W, H) {
  const h = await open({ width: W, height: H }); const p = h.page; const log = (...a) => console.log(tag, ...a);
  // title (open() started free play; quit to title for the menu)
  await p.evaluate(() => { __game.quitToTitle(); __game.render(); });
  await h.snap(`visual_hud_title_${tag}.png`); log('title', JSON.stringify(await rects(p)));
  // freeze picker
  await p.evaluate(() => { __game.startMatch({ difficulty: 'regular', seed: 5 }); __game.setTimeScale(0); __game.step(1.5); __game.render(); });
  await h.snap(`visual_hud_freeze_${tag}.png`); log('freeze', JSON.stringify(await rects(p)), JSON.stringify(await p.evaluate(() => __game.state().match)));
  // live: player stands in the open centre lane, kept alive with give('health'); arcs vs real attacker bearing
  const arcs = await p.evaluate(() => {
    // stand in the open just outside the Tan fort, where the Tan squad engages at once
    __game.step(3.7); __game.teleport(60, 0, 124, Math.PI, 0); const out = [];
    for (let i = 0; i < 3000 && out.length < 12; i++) {
      const n0 = __game.damageLog.length; __game.step(1 / 30); __game.give('health');
      let s = __game.state();
      if (s.player.dead || s.match.phase !== 'live') { if (s.match.phase === 'live') __game.skipRound('green'); let k = 0; while (__game.state().match.phase !== 'freeze' && k++ < 40) __game.step(0.5);
        __game.step(5.2); __game.teleport(60, 0, 124, Math.PI, 0); continue; }
      const nd = __game.damageLog.slice(n0).filter((d) => d.attacker);
      if (!nd.length) continue;
      __game.render();
      const atk = s.bots.find((b) => b.id === nd[nd.length - 1].attacker); if (!atk) continue;
      const pl = s.player, bearing = Math.atan2(-(atk.pos[0] - pl.x), -(atk.pos[2] - pl.z)), rel = Math.atan2(Math.sin(bearing - pl.yaw), Math.cos(bearing - pl.yaw));
      const shown = [...document.querySelectorAll('#arcs i')].filter((e) => e.style.display === 'block').map((e) => +(e.style.transform.match(/-?[\d.]+/) || [0])[0]);
      const expectDeg = -rel * 180 / Math.PI, err = Math.min(...shown.map((d) => Math.abs(((d - expectDeg + 540) % 360) - 180)));
      // the screen direction the arc points to: CSS rotate clockwise from straight up
      out.push({ attacker: atk.name, relDegLeftPositive: +(rel * 180 / Math.PI).toFixed(1), arcCssDeg: shown, errDeg: +err.toFixed(1) });
      if (out.length >= 6) break;
    }
    return out;
  });
  log('arcs vs attacker bearing', JSON.stringify(arcs));
  await h.snap(`visual_hud_arcs_${tag}.png`);
  // turn the player 90 degrees to the right and check the arc turns 90 degrees to the left in the same frame
  const turn = await p.evaluate(() => { const s = __game.state(); const before = [...document.querySelectorAll('#arcs i')].filter((e) => e.style.display === 'block').map((e) => +(e.style.transform.match(/-?[\d.]+/) || [0])[0]);
    __game.look(s.player.yaw - Math.PI / 2, 0); __game.render(); const after = [...document.querySelectorAll('#arcs i')].filter((e) => e.style.display === 'block').map((e) => +(e.style.transform.match(/-?[\d.]+/) || [0])[0]); return { before, after }; });
  log('arc after turning 90 deg right (expect CSS angle -90):', JSON.stringify(turn));
  // live HUD with feed and callouts: run until the feed has 3+ entries, then bright (window) and dark (under the bed) backgrounds
  const fc = await p.evaluate(() => { for (let i = 0; i < 2400; i++) { __game.step(1 / 10); __game.give('health'); const s = __game.state(); if (s.match.phase === 'freeze') { __game.step(5); }
      if (document.querySelectorAll('#feed div').length >= 3 && document.querySelectorAll('#callouts div').length >= 1) break; __game.render(); }
    __game.render(); return { feed: [...document.querySelectorAll('#feed div')].map((d) => d.innerHTML), callouts: [...document.querySelectorAll('#callouts div')].map((d) => d.textContent), killFeed: __game.state().match }; });
  log('feed', JSON.stringify(fc.feed), 'callouts', JSON.stringify(fc.callouts));
  await p.evaluate(() => { __game.setGodMode(true); __game.teleport(26, 18, 80, 0, 0); __game.lookAt(-2, 60, 60); __game.render(); });
  await h.snap(`visual_hud_live_bright_${tag}.png`); log('live', JSON.stringify(await rects(p)));
  await p.evaluate(() => { __game.teleport(20, 0, 95, 0, 0); __game.lookAt(20, 3, 60); __game.render(); });
  await h.snap(`visual_hud_live_dark_${tag}.png`);
  // feed text contrast: team colour against its 45 % dark plate over white (worst bright) and over the window colour
  const plate = (bg) => bg.map((v, i) => Math.round(v * 0.55 + [20, 17, 14][i] * 0.45));
  for (const [name, col] of [['green', [0x3F, 0xCF, 0x5E]], ['tan', [0xF0, 0xBE, 0x6E]], ['white', [255, 255, 255]]]) log('feed text', name, 'on plate over white dE', dE(col, plate([255, 255, 255])), '| over window #D6DEE8', dE(col, plate([0xD6, 0xDE, 0xE8])), '| over dark floor #4A2E1A', dE(col, plate([0x4A, 0x2E, 0x1A])));
  // spectating: the player dies, camera tips, then follows a living Green bot
  const sp = await p.evaluate(() => { __game.setGodMode(false); let k = 0; while (__game.state().match.phase !== 'live' && k++ < 100) __game.step(0.5); __game.damagePlayer(500); __game.step(0.4); __game.render(); const mid = __game.state().match.spectating; __game.step(1.6); __game.render();
    return { spectating: __game.state().match.spectating, banner: document.getElementById('spect').textContent, mid, phase: __game.state().match.phase }; });
  log('spectate', JSON.stringify(sp)); await h.snap(`visual_hud_spectate_${tag}.png`); log('spectate rects', JSON.stringify(await rects(p)));
  // round end and match end
  await p.evaluate(() => { __game.setGodMode(true); __game.skipRound('tan'); __game.step(0.3); __game.render(); });
  await h.snap(`visual_hud_roundend_${tag}.png`); log('round end', JSON.stringify(await rects(p)), JSON.stringify(await p.evaluate(() => ({ t: document.getElementById('reTitle').textContent, how: document.getElementById('reHow').textContent, sc: document.getElementById('reScore').textContent }))));
  await p.evaluate(() => { for (let i = 0; i < 12 && __game.state().match.phase !== 'matchEnd'; i++) { __game.skipRound(i % 3 ? 'green' : 'tan'); __game.step(6); } __game.render(); });
  await h.snap(`visual_hud_matchend_${tag}.png`); log('match end', JSON.stringify(await rects(p)), JSON.stringify(await p.evaluate(() => ({ t: document.getElementById('meTitle').textContent, rows: document.querySelectorAll('#meTable tr').length, phase: __game.state().match.phase }))));
  await p.evaluate(() => { __game.rematch(); __game.step(1); __game.pause(); __game.render(); });
  await h.snap(`visual_hud_pause_${tag}.png`); log('pause', JSON.stringify(await rects(p)));
  log('errors', JSON.stringify(h.errors));
  await h.browser.close();
}
(async () => { await run('720', 1280, 720); await run('1080', 1920, 1080); })().catch((e) => { console.error(e); process.exit(1); });
