// Visual QA helper: snaps the camera to named presets and saves screenshots.
//   node qa/screenshots.mjs <outDir> [view,view,...] [quality 0-2] [baseUrl]
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'qa/out';
const quality = process.argv[4] || '2';
const base = process.argv[5] || 'http://localhost:8123/';
mkdirSync(out, { recursive: true });
const which = (process.argv[3] || '').split(',').filter(Boolean);
const VIEWS = {
  spawn: { p: [0, 0], yaw: 0.55, pitch: 0.4, dist: 10 },
  close: { p: [0, 0], yaw: 0.35, pitch: 0.16, dist: 5, face: 0.9 },
  back: { p: [0, 0], yaw: 3.4, pitch: 0.3, dist: 6 },
  wide: { p: [0, 0], yaw: 2.2, pitch: 0.7, dist: 20 },
  forest: { p: [-27, 26], yaw: -0.9, pitch: 0.18, dist: 8 },
  forest2: { p: [30, -24], yaw: 1.9, pitch: 0.25, dist: 9 },
  sunward: { p: [8, 30], yaw: 1.5, pitch: 0.12, dist: 7 },
  ridge: { p: [57, 3], yaw: -1.57, pitch: 0.3, dist: 12 },
  corner: { p: [-52, -48], yaw: 0.9, pitch: 0.9, dist: 20 },
  rock: { rock: 1, yaw: 0.6, pitch: 0.25, dist: 6 },
  // the three views below first build a small camp (visual QA only: resources are credited directly)
  camp: { camp: 1, p: [0.5, 1.5], yaw: 0.25, pitch: 0.3, dist: 15 },
  fire: { camp: 1, p: [2.0, -1.6], yaw: 2.5, pitch: 0.24, dist: 6, face: 0.9 },
  beacon: { camp: 1, p: [-3.5, 7.5], yaw: 0.9, pitch: 0.12, dist: 11 },
  wall: { camp: 1, p: [-3.2, -2.6], yaw: 0.5, pitch: 0.22, dist: 6.5, face: 2.6 },
  qa: { p: [0, 0], yaw: 0.55, pitch: 0.4, dist: 10, qa: 1 },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (!/GPU stall/.test(t) && m.type() !== 'log') console.log(`[${m.type()}]`, t.slice(0, 1200)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}?autostart=1&quality=${quality}`);
await page.waitForFunction(() => window.__TB && window.__TB.frame > 2, null, { timeout: 400000 });
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); });
for (const name of which.length ? which : Object.keys(VIEWS)) {
  const v = VIEWS[name];
  await page.evaluate((v) => {
    const g = __TB.game;
    let [x, z] = v.p || [0, 0];
    if (v.rock) { const b = __TB.world.boulders.filter((o) => o.alive).sort((a, c) => c.width - a.width)[2]; x = b.x + b.radius + 1.2; z = b.z + 0.6; }
    g.cam.yaw = v.yaw; g.cam.pitch = v.pitch; g.cam.dist = g.cam.distTarget = v.dist;
    if (v.face !== undefined) g.player.yaw = v.face;
    if (v.qa && document.getElementById('qa').classList.contains('hidden')) __TB.hud.toggleQA();
    if (v.camp && !g.structures.length) {
      g.inventory.wood += 9; g.inventory.stone += 9; g.ledger.gained.wood += 9; g.ledger.gained.stone += 9; g.ledger.hits += 18;
      for (const [type, bx, bz, rot] of [['wall', -4, -5, 0.3], ['campfire', 3.5, -3.5, 0], ['beacon', -7, 4, 0.5]]) {
        g.build.type = type; g.build.rot = rot; g.build.hit = true;
        g.build.pos.set(bx, __TB.terrain.heightAt(bx, bz), bz);
        if (!g.placeStructure()) console.warn('could not place', type, g.validate(type, bx, bz, rot).reason);
      }
      g.cancelBuild(true);
    }
    g.teleport(x, z);
  }, v);
  const f = await page.evaluate(() => __TB.frame);
  await page.waitForFunction((t) => __TB.frame >= t, f + (v.camp ? 12 : 2), { timeout: 900000 });
  await page.screenshot({ path: `${out}/v_${name}.png`, timeout: 300000 });
  console.log('shot', name);
}
await browser.close();
