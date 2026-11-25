#!/usr/bin/env node
/* Frame renderer: steps src/film.html through headless Chromium and writes PNGs.
 *
 *   node render.cjs <outDir>                 render all 900 frames (4 workers)
 *   node render.cjs <outDir> 30 120 270      render only the listed frame numbers
 *   node render.cjs --audit                  print the title-safe text audit and exit
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PAGE = 'file://' + path.join(__dirname, 'src', 'film.html');
const WORKERS = 4;

async function open() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await page.goto(PAGE);
  await page.waitForFunction('window.READY === true', null, { timeout: 30000 });
  return { browser, page };
}

async function renderList(frames, outDir) {
  const { browser, page } = await open();
  for (const i of frames) {
    const b64 = await page.evaluate((n) => {
      window.renderFrame(n);
      return document.getElementById('c').toDataURL('image/png').slice(22);
    }, i);
    fs.writeFileSync(path.join(outDir, `f_${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
  }
  await browser.close();
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--audit') {
    const { browser, page } = await open();
    const { boxes, safe, fonts } = await page.evaluate(() => ({
      boxes: window.TEXT_BOXES, safe: window.SAFE,
      fonts: ['800 100px "Inter Display"', '500 46px Inter', '500 22px "JetBrains Mono"'].map((f) => [f, document.fonts.check(f)]),
    }));
    let bad = 0;
    for (const b of boxes) {
      const ok = b.l >= safe.l && b.r <= safe.r && b.t >= safe.t && b.b <= safe.b;
      if (!ok) bad++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${b.name.padEnd(28)} x ${b.l.toFixed(0)}–${b.r.toFixed(0)}  y ${b.t.toFixed(0)}–${b.b.toFixed(0)}`);
    }
    console.log(`fonts: ${fonts.map(([f, ok]) => `${f}=${ok}`).join('  ')}`);
    console.log(`title-safe (x ${safe.l}–${safe.r}, y ${safe.t}–${safe.b}): ${boxes.length - bad}/${boxes.length} text boxes inside`);
    await browser.close();
    process.exit(bad ? 1 : 0);
  }
  const outDir = args[0];
  fs.mkdirSync(outDir, { recursive: true });
  let frames = args.slice(1).map(Number);
  if (!frames.length) frames = Array.from({ length: 900 }, (_, i) => i);
  const t0 = Date.now();
  const n = Math.min(WORKERS, frames.length);
  const chunk = Math.ceil(frames.length / n);
  await Promise.all(Array.from({ length: n }, (_, w) => renderList(frames.slice(w * chunk, (w + 1) * chunk), outDir)));
  console.log(`rendered ${frames.length} frame(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${outDir}`);
})();
