// Quick look: node tools/shot.mjs out.png [seconds] [ix,iy] [teleport x,z]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'shot.png', secs = '1', inp = '0,0', tp = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() !== 'log') console.log('[' + m.type() + ']', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + join(root, 'www/index.html') + '?manual&dpr=2');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const [ix, iy] = inp.split(',').map(Number);
await page.evaluate(({ secs, ix, iy, tp }) => {
  const g = window.__game;
  if (tp) { const [x, z] = tp.split(',').map(Number); g.heli.flying = true; g.heli.pos.x = x; g.heli.pos.z = z; g.heli.pos.y = 6; g.advance(1 / 60, 240); }
  g.script(ix, iy); g.advance(1 / 60, Math.round(secs * 60)); 
}, { secs: +secs, ix, iy, tp });
console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__game.state(), info: window.__game.info() })), (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
await page.screenshot({ path: out });
await browser.close();
