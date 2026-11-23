// Round 3 check 6: menus and input with the real mouse and keyboard (real time, pointer lock). Title, difficulty, sliders,
// persistence across reload, localStorage throwing, Play, Esc pause and resume, the Esc-then-click race, quit to title
// mid-match and a fresh match after it, Enter rematch and Esc to title from the end screen.
// Usage: node bug_r3_06_menus.cjs. Loops are bounded.
const path = require('path');
const { launch } = require('./harness.cjs');
const GAME = path.resolve(__dirname, '..', 'index.html');
const wait = (p, ms) => p.waitForTimeout(ms);
const S = (page) => page.evaluate(() => { const s = __game.state(); const st = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e).display !== 'none' && e.offsetParent !== null : null; }; return { app: s.app, phase: s.phase, match: s.match && { phase: s.match.phase, round: s.match.round, score: s.match.score, alive: s.match.alive, difficulty: s.match.difficulty }, locked: !!document.pointerLockElement, time: +s.time.toFixed(2), settings: __game.settings(), title: st('title'), pause: st('pause'), matchEnd: st('matchEnd'), hp: s.player.health, kf: __game.killFeed.length, callouts: __game.callouts.length, bots: s.bots.length, botsDead: s.bots.filter((b) => b.dead).length }; });
async function setRange(page, sel, frac) { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + 2 + (b.width - 4) * frac, b.y + b.height / 2); }

(async () => {
  const out = {};
  // ---- 1. title, difficulty, sliders, persistence ----
  {
    const { browser, page, errors } = await launch({ width: 960, height: 540 });
    out.fresh = await S(page);
    await page.click('#tDiff [data-d="veteran"]'); await setRange(page, '#tSens', 0.8); await setRange(page, '#tVol', 0.25); await wait(page, 100);
    out.afterTitleChanges = await S(page);
    await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready); await wait(page, 200);
    out.afterReload = await S(page);
    out.afterReloadDom = await page.evaluate(() => ({ sel: document.querySelector('#tDiff .sel') && document.querySelector('#tDiff .sel').dataset.d, sens: document.querySelector('#tSens').value, vol: document.querySelector('#tVol').value }));
    // ---- 2. Play, Esc pause, resume, sim stops while paused ----
    await page.click('#tPlay'); await wait(page, 600);
    out.afterPlay = await S(page);
    await page.keyboard.press('Escape'); await wait(page, 300);
    const p1 = await S(page); await wait(page, 800); const p2 = await S(page);
    out.paused = { state: p1, simTimeAdvancedWhilePaused: +(p2.time - p1.time).toFixed(2) };
    await setRange(page, '#pSens', 0.3); await wait(page, 100); out.pauseSens = (await S(page)).settings;
    await page.click('#pResume'); await wait(page, 400); out.resumed = await S(page);
    // ---- 3. Esc then click race, 16 tries at 0 to 60 ms ----
    out.race = [];
    for (const ms of [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 0, 10, 20, 30, 45]) {
      await page.keyboard.press('Escape'); if (ms) await wait(page, ms); await page.mouse.click(480, 300); await wait(page, 350);
      const s = await S(page); const bad = (s.phase === 'paused' && s.locked) || (s.phase === 'playing' && !s.locked);
      out.race.push(`${ms}ms:${s.phase}/${s.locked ? 'L' : 'u'}${bad ? '!!' : ''}`);
      if (s.phase === 'paused') { await page.click('#pResume'); await wait(page, 300); }
    }
    // ---- 4. quit to title mid-match, then a new match: fully reset ----
    await page.evaluate(() => { __game.setTimeScale(1); }); await wait(page, 1500);
    await page.evaluate(() => { const G = __game; G.setTimeScale(0); G.setGodMode(false); for (let i = 0; i < 60 * 40; i++) G.step(1 / 60); G.setTimeScale(1); });
    out.midMatch = await S(page);
    await page.keyboard.press('Escape'); await wait(page, 300); await page.click('#pQuit'); await wait(page, 400);
    out.afterQuit = await S(page);
    await page.click('#tPlay'); await wait(page, 500);
    out.newMatch = await S(page);
    // ---- 5. end screen: Enter rematch, then Esc to title ----
    await page.evaluate(() => { const G = __game; G.setTimeScale(0); for (let k = 0; k < 5; k++) { G.skipRound('green'); for (let i = 0; i < 60 * 12 && !['freeze', 'matchEnd'].includes(G.state().match.phase); i++) G.step(1 / 60); } G.setTimeScale(1); });
    out.endScreen = await S(page);
    await page.keyboard.press('Enter'); await wait(page, 400); out.afterEnter = await S(page);
    await page.evaluate(() => { const G = __game; G.setTimeScale(0); for (let k = 0; k < 5; k++) { G.skipRound('tan'); for (let i = 0; i < 60 * 12 && !['freeze', 'matchEnd'].includes(G.state().match.phase); i++) G.step(1 / 60); } G.setTimeScale(1); });
    await page.keyboard.press('Escape'); await wait(page, 400); out.afterEscOnEnd = await S(page);
    out.errors = errors.slice();
    await browser.close();
  }
  // ---- 6. localStorage throwing ----
  {
    const { chromium } = require('playwright');
    const { browser, page, errors } = await launch({ width: 960, height: 540, file: GAME });
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
    await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
    await page.click('#tDiff [data-d="recruit"]'); await setRange(page, '#tSens', 0.5); await page.click('#tPlay'); await wait(page, 800);
    out.noStorage = { state: await S(page), errors: errors.slice() };
    await page.keyboard.press('Escape'); await wait(page, 300); await setRange(page, '#pVol', 0.9); await page.click('#pResume'); await wait(page, 300);
    out.noStorage.after = await S(page); out.noStorage.errors2 = errors.slice();
    await browser.close();
  }
  for (const k in out) console.log(k, JSON.stringify(out[k]));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
