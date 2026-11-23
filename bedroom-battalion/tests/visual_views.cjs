// Screenshots of every named view (DESIGN.md section 10), plain and with the debug overlay, plus title and HUD.
const { open, shotView, VIEWS } = require('./visual_lib.cjs');

(async () => {
  // ---- 1280x720: all views, plain and debug ----
  let h = await open({ width: 1280, height: 720, start: false });
  await h.page.waitForTimeout(300);
  await h.shot('round1/visual_title_720.png');
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.render(); });
  await h.page.waitForTimeout(200);
  await h.shot('round1/visual_hud_720.png');
  await h.page.evaluate(() => { __game.setDebug(true); __game.render(); });
  await h.page.waitForTimeout(400);
  await h.shot('round1/visual_hud_debug_720.png');
  const dbgText = await h.page.evaluate(() => document.getElementById('debug').textContent);
  console.log('debug text (player view):\n' + dbgText);
  for (const v of VIEWS) {
    await shotView(h, v, `round1/visual_${v}.png`);
    await shotView(h, v, `round1/visual_${v}_debug.png`, { debug: true });
    const info = await h.page.evaluate(() => ({ s: __game.state(), hud: getComputedStyle(document.getElementById('hud')).visibility, dbg: getComputedStyle(document.getElementById('debug')).display }));
    console.log(v, 'debug-on draw calls', info.s.drawCalls, 'tris', info.s.triangles, 'hud visibility', info.hud, 'debug display', info.dbg);
  }
  // HUD layout numbers
  const rects = await h.page.evaluate(() => {
    __game.clearView(); __game.setDebug(false); __game.render();
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((n) => +n.toFixed(1)); };
    return { crosshair: r('crosshair'), health: r('health'), w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  });
  console.log('HUD rects 720', JSON.stringify(rects));
  console.log('errors 720', JSON.stringify(h.errors), 'blocked', JSON.stringify(h.blocked));
  await h.browser.close();

  // ---- 1920x1080: title, HUD, two views ----
  h = await open({ width: 1920, height: 1080, start: false });
  await h.page.waitForTimeout(300);
  await h.shot('round1/visual_title_1080.png');
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.render(); });
  await h.page.waitForTimeout(200);
  await h.shot('round1/visual_hud_1080.png');
  await h.page.evaluate(() => { __game.setDebug(true); __game.render(); });
  await h.page.waitForTimeout(400);
  await h.shot('round1/visual_hud_debug_1080.png');
  await shotView(h, 'spawn_green', 'round1/visual_spawn_green_1080.png');
  await shotView(h, 'shelf_top', 'round1/visual_shelf_top_1080.png');
  const rects2 = await h.page.evaluate(() => {
    __game.clearView(); __game.setDebug(false); __game.render();
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((n) => +n.toFixed(1)); };
    return { crosshair: r('crosshair'), health: r('health'), w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  });
  console.log('HUD rects 1080', JSON.stringify(rects2));
  console.log('errors 1080', JSON.stringify(h.errors), 'blocked', JSON.stringify(h.blocked));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
