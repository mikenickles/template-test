// Drives the real game in headless Chromium at phone size with real multi-touch events
// (one finger on the joystick, another holding the winch button).
// The game clock is stepped manually (?manual) so results don't depend on this machine's speed.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function launch({ width = 844, height = 390, scale = 1, query = 'manual&dpr=1' } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + join(root, 'www/index.html') + '?' + query);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const cdp = await ctx.newCDPSession(page);
  const btn = await page.locator('#winch').boundingBox();
  const base = { x: Math.round(width * 0.2), y: Math.round(height * 0.7) }, R = Math.min(90, Math.max(44, Math.min(width, height) * 0.17));
  const fingers = new Map(); // id -> {x, y}
  const pts = (ids) => ids.map((id) => ({ id, x: fingers.get(id).x, y: fingers.get(id).y }));
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts([...fingers.keys()]) });
  // touchEnd releases exactly the points it lists, so lift one finger at a time
  const lift = async (id) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts([id]) }); fingers.delete(id); };
  let frameDir = null, frameNo = 0, sub = 0;
  const d = {
    page, browser, errors,
    state: () => page.evaluate(() => window.__game.state()),
    async shot(path) { await page.evaluate(() => window.__game.draw()); await page.screenshot({ path }); },
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
    /** Joystick with finger 1. (x, y) is the intended stick deflection 0..1 (dead zone compensated). */
    async stick(x, y) {
      const m = Math.hypot(x, y), raw = m < 0.004 ? 0 : 0.1 + 0.9 * Math.min(1, m), k = m ? raw / m : 0;
      const p = { x: base.x + x * k * R, y: base.y + y * k * R };
      if (!fingers.has(1)) { fingers.set(1, { ...base }); await send('touchStart'); }
      fingers.set(1, p); await send('touchMove');
    },
    async release() { if (fingers.has(1)) await lift(1); },
    /** Finger 2 on the winch button. */
    async holdWinch() { if (!fingers.has(2)) { fingers.set(2, { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 }); await send('touchStart'); } },
    async releaseWinch() { if (fingers.has(2)) await lift(2); },
    /** Tap an on-screen button with a third finger. */
    async tap(selector) {
      const b = await page.locator(selector).boundingBox();
      fingers.set(3, { x: b.x + b.width / 2, y: b.y + b.height / 2 }); await send('touchStart'); await d.step(2); await lift(3);
    },
    async tapWinch() { await d.holdWinch(); await d.step(4); await d.releaseWinch(); },
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
    /** Careful flying: ease the ship so that the hook (not the ship) is over (x, z). */
    async hover(x, z, frames, tvx = 0, tvz = 0) {
      const s = await d.state();
      const ex = x - s.bob[0], ez = z - s.bob[2];
      // proportional on the hook's error, plus the target's own velocity for moving targets
      const vx = Math.max(-4, Math.min(4, ex * 1.6)) + tvx - (s.vel[0] - tvx) * 0.35, vz = Math.max(-4, Math.min(4, ez * 1.6)) + tvz - (s.vel[2] - tvz) * 0.35;
      await d.stick(vx / 10.5, vz / 10.5); await d.step(frames);
      return Math.hypot(ex, ez);
    },
    async waitFor(pred, maxSecs = 8) {
      for (let i = 0; i < maxSecs * 10; i++) { const s = await d.state(); if (pred(s)) return s; await d.step(6); }
      return d.state();
    },
  };
  return d;
}
