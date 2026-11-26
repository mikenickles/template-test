// Drives the real game in headless Chromium with real pointer events at phone size.
// The game clock is stepped manually (?manual) so results don't depend on this machine's speed.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function launch({ width = 844, height = 390, scale = 1, query = 'manual&dpr=1' } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + join(root, 'www/index.html') + '?' + query);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const base = { x: Math.round(width * 0.2), y: Math.round(height * 0.7) }, R = Math.min(90, Math.max(44, Math.min(width, height) * 0.17));
  let held = false, frameDir = null, frameNo = 0, sub = 0;
  const d = {
    page, browser, errors,
    async shot(path) { await page.evaluate(() => window.__game.draw()); await page.screenshot({ path }); },
    state: () => page.evaluate(() => window.__game.state()),
    record(dir) { frameDir = dir; if (dir) mkdirSync(dir, { recursive: true }); },
    get frames() { return frameNo; },
    // advance the game n frames at 60 Hz; when recording, save every other frame (30 fps)
    async step(n = 1) {
      if (!frameDir) return page.evaluate((n) => window.__game.advance(1 / 60, n, false), n);
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => window.__game.advance(1 / 60, 1));
        if (sub++ % 2 === 0) await page.screenshot({ path: join(frameDir, `f${String(frameNo++).padStart(5, '0')}.png`) });
      }
    },
    async stick(x, y) {
      if (!held) { await page.mouse.move(base.x, base.y); await page.mouse.down(); held = true; }
      await page.mouse.move(base.x + x * R, base.y + y * R, { steps: 2 });
    },
    async release() { if (held) { await page.mouse.up(); held = false; } },
    async tapWinch() {
      await d.release();
      const b = await page.locator('#winch').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await d.step(3); await page.mouse.up();
    },
    // fly like a child would: push toward the target, let go when close
    async flyTo(x, z, near = 2.0, maxSecs = 14) {
      for (let i = 0; i < maxSecs * 10; i++) {
        const s = await d.state(), dx = x - s.pos[0], dz = z - s.pos[2], dist = Math.hypot(dx, dz);
        if (dist < near) break;
        const m = Math.min(1, dist / 5 + 0.25);
        await d.stick((dx / dist) * m, (dz / dist) * m); await d.step(6);
      }
      await d.release();
    },
    async waitFor(pred, maxSecs = 8) {
      for (let i = 0; i < maxSecs * 10; i++) { const s = await d.state(); if (pred(s)) return s; await d.step(6); }
      return d.state();
    },
  };
  return d;
}
