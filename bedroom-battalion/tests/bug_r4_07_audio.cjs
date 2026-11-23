// Round 4 check 6: audio. The page's AudioContext is instrumented before load (counts of nodes created per type, sources
// started and sources ended). A: no user gesture at all, match through the hook, 40 s real time. B: real click on Play,
// then an autoplay match in real time for 150 s with samples every 10 s of live sources (started - ended), context state
// and node counts; then Esc, wait, Resume, and 20 s more. Also a run with AudioContext missing. Console errors throughout.
// Usage: node bug_r4_07_audio.cjs [build]
const path = require('path');
const { chromium } = require('playwright');
const { launch } = require('./harness.cjs');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const wait = (p, ms) => p.waitForTimeout(ms);
function instrument() {
  const A = (window.__AC = { contexts: 0, created: {}, started: 0, ended: 0, errors: [] });
  const B = window.BaseAudioContext || window.AudioContext; if (!B) return;
  for (const k of Object.getOwnPropertyNames(B.prototype)) {
    if (!/^create/.test(k) || typeof B.prototype[k] !== 'function') continue;
    const orig = B.prototype[k];
    B.prototype[k] = function (...a) {
      const n = orig.apply(this, a); A.created[k] = (A.created[k] || 0) + 1;
      if (n && typeof n.start === 'function' && /BufferSource|Oscillator|ConstantSource/.test(k)) { const s = n.start; n.start = function (...b) { A.started++; n.addEventListener('ended', () => { A.ended++; }); return s.apply(this, b); }; }
      return n;
    };
  }
  const C = window.AudioContext; window.AudioContext = class extends C { constructor(...a) { super(...a); A.contexts++; window.__ACX = this; } };
}
(async () => {
  const out = {};
  // A. no gesture (harness flag lets autoplay run; the game must cope either way)
  {
    const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
    await page.addInitScript(instrument); await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready);
    await page.evaluate(() => __game.startMatch({ difficulty: 'regular', seed: 2, autoplay: true }));
    await wait(page, 40000);
    out.noGesture = await page.evaluate(() => ({ ac: window.__AC, state: window.__ACX && window.__ACX.state, audioLog: __game.audioLog.length, simTime: __game.state().time, phase: __game.state().match.phase })); out.noGesture.errors = errors.slice();
    await browser.close();
  }
  // B. real click, long firefight, pause and resume
  {
    const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
    page.setDefaultTimeout(30000);
    await page.addInitScript(instrument); await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready);
    await page.click('#tPlay'); await wait(page, 500);
    await page.evaluate(() => __game.startMatch({ difficulty: 'veteran', seed: 4, autoplay: true }));
    const samples = [];
    for (let i = 0; i < 15; i++) { await wait(page, 10000); samples.push(await page.evaluate(() => { const A = window.__AC; return { t: +__game.state().time.toFixed(1), phase: __game.state().match.phase, round: __game.state().match.round, state: window.__ACX && window.__ACX.state, started: A.started, ended: A.ended, live: A.started - A.ended, created: Object.values(A.created).reduce((a, b) => a + b, 0), shots: __game.shotLog.length }; })); }
    out.samples = samples;
    await page.keyboard.press('Escape'); await wait(page, 3000); out.paused = await page.evaluate(() => ({ app: __game.state().app, state: window.__ACX && window.__ACX.state, live: window.__AC.started - window.__AC.ended }));
    await page.click('#pResume').catch(() => {}); await wait(page, 20000);
    out.resumed = await page.evaluate(() => ({ app: __game.state().app, state: window.__ACX && window.__ACX.state, started: window.__AC.started, live: window.__AC.started - window.__AC.ended, contexts: window.__AC.contexts }));
    out.createdByType = await page.evaluate(() => window.__AC.created);
    out.errorsB = errors.slice();
    await browser.close();
  }
  // C. AudioContext missing
  {
    const { browser, page, errors } = await launch({ width: 640, height: 360, file: FILE });
    await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
    await page.reload(); await page.waitForFunction(() => window.__game && window.__game.ready);
    await page.click('#tPlay').catch(() => {}); await wait(page, 500);
    await page.evaluate(() => { __game.startMatch({ difficulty: 'regular', seed: 2, autoplay: true }); __game.setTimeScale(0); for (let i = 0; i < 60 * 60; i++) __game.step(1 / 60); __game.render(); });
    out.noAudio = { audioLog: await page.evaluate(() => __game.audioLog.length), errors: errors.slice() };
    await browser.close();
  }
  console.log('no gesture:', JSON.stringify(out.noGesture));
  for (const s of out.samples) console.log('sample', JSON.stringify(s));
  console.log('paused:', JSON.stringify(out.paused), '| resumed 20 s later:', JSON.stringify(out.resumed));
  console.log('nodes created by type:', JSON.stringify(out.createdByType));
  console.log('errors B:', JSON.stringify(out.errorsB), '| AudioContext missing:', JSON.stringify(out.noAudio));
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
