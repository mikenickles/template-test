// Shared headless harness for all testers. Do not edit index.html from tests.
//
//   const { launch } = require('./harness.cjs');
//   const { browser, page, errors, shot } = await launch({ width: 1280, height: 720 });
//   await page.evaluate(() => window.__game.start({ pointerLock: false }));
//   ...
//   await browser.close();
//
// - Serves the pinned Three.js CDN URL from tests/node_modules (the CDN is blocked in this sandbox).
// - Collects console errors, warnings and page errors in `errors` (GL driver noise from
//   software rendering and screenshots is filtered out; it is not the game's fault).
// - Rendering is software (SwiftShader), so measured fps is NOT representative of real hardware.
//   Use draw calls, triangle counts and relative frame cost instead, and say so in reports.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const GAME = path.resolve(__dirname, '..', 'index.html');
const THREE_DIR = path.resolve(__dirname, 'node_modules', 'three');
const NOISE = [/GL Driver Message/i, /GPU stall due to ReadPixels/i, /Automatic fallback to software WebGL/i];

async function launch({ width = 1280, height = 720, file = GAME } = {}) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const blocked = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t !== 'error' && t !== 'warning') return;
    const text = m.text();
    if (NOISE.some((re) => re.test(text))) return;
    errors.push({ type: t, text });
  });
  page.on('pageerror', (e) => errors.push({ type: 'pageerror', text: e.message }));
  // Any request to a three@x.y.z CDN path is answered from the local npm copy.
  await page.route(/https?:\/\/[^/]+\/.*three@[\d.]+\/(.*)$/, (route) => {
    const m = route.request().url().match(/three@[\d.]+\/(.*?)(\?.*)?$/);
    const rel = m ? m[1] : '';
    const local = path.join(THREE_DIR, rel);
    if (rel && fs.existsSync(local)) {
      route.fulfill({ body: fs.readFileSync(local), contentType: 'text/javascript' });
    } else {
      blocked.push(route.request().url());
      route.abort();
    }
  });
  page.on('requestfailed', (r) => { if (!/three@/.test(r.url())) blocked.push(r.url()); });
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  const shot = async (name) => {
    const out = path.resolve(__dirname, '..', 'screenshots', name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    return out;
  };
  return { browser, page, errors, blocked, shot, fileSizeBytes: fs.statSync(file).size };
}

module.exports = { launch, GAME };
