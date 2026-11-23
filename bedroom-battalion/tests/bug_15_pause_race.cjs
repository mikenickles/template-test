// Esc then click-to-resume in quick succession, with real key and mouse events.
// A fresh page per delay, so one bad state cannot contaminate the next row.
// For each delay between Esc and the click: what state does the game end in, and does a further click resume?
const { launch } = require('./harness.cjs');

(async () => {
  const allErrors = [];
  for (const delay of [0, 10, 30, 60, 100, 200, 500]) {
    const { browser, page, errors } = await launch({ width: 640, height: 360 });
    const st = () => page.evaluate(() => ({ phase: __game.state().phase, lock: !!document.pointerLockElement, title: getComputedStyle(document.getElementById('title')).display, text: document.getElementById('titleGo').textContent }));
    const tag = (s) => s.phase + (s.lock ? '+locked' : '+unlocked');
    await page.evaluate(() => {
      window.__ev = [];
      document.addEventListener('pointerlockchange', () => window.__ev.push((document.pointerLockElement ? 'lock granted' : 'lock released') + ' (phase ' + __game.state().phase + ')'));
      document.addEventListener('pointerlockerror', () => window.__ev.push('lock error'));
      document.getElementById('title').addEventListener('click', () => window.__ev.push('click on overlay'));
      document.getElementById('view').addEventListener('click', () => window.__ev.push('click on canvas'));
    });
    await page.mouse.click(320, 180); await page.waitForTimeout(600);
    const s0 = await st();
    await page.evaluate(() => { window.__ev.length = 0; });
    await page.keyboard.press('Escape');
    if (delay) await page.waitForTimeout(delay);
    await page.mouse.click(320, 180);
    await page.waitForTimeout(800);
    const a = await st();
    const ev = await page.evaluate(() => window.__ev.slice());
    let line = `start ${tag(s0)} | Esc, ${delay} ms, click -> ${tag(a)}, overlay ${a.title === 'none' ? 'hidden' : 'shown "' + a.text + '"'} | events: ${ev.join(' > ')}`;
    if (a.phase !== 'playing') {
      // the overlay says "Click to resume": click three more times
      const clicks = [];
      for (let k = 0; k < 3; k++) { await page.mouse.click(320, 180); await page.waitForTimeout(400); clicks.push(tag(await st())); }
      const z0 = await page.evaluate(() => __game.state().player.z);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
      const z1 = await page.evaluate(() => __game.state().player.z);
      await page.keyboard.press('Escape'); await page.waitForTimeout(500); const e1 = await st();
      await page.mouse.click(320, 180); await page.waitForTimeout(600); const e2 = await st();
      line += ` | 3 more clicks -> ${clicks.join(' / ')} | W moves: ${Math.abs(z1 - z0) > 0.5} | Esc again -> ${tag(e1)} | click -> ${tag(e2)}`;
    }
    console.log(line);
    allErrors.push(...errors);
    await browser.close();
  }
  console.log('ERRORS', JSON.stringify(allErrors));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
