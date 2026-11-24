// Phone-control QA: emulates a 390 x 844 touchscreen and drives touch pointer gestures
// (thumb-stick walk, look drag, pinch zoom, tap harvest, drag-and-lift building).
//   node serve.mjs 8123 &
//   node qa/touchtest.mjs [outDir] [baseUrl]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }

const out = process.argv[2] || 'qa/out';
const base = process.argv[3] || 'http://localhost:8123/';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|swiftshader/i.test(m.text()))) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));

await page.goto(`${base}?quality=0&grass=0.05`);
await page.waitForSelector('#start:not(.hidden)', { timeout: 600000 });
check('start button says "Tap to start"', (await page.textContent('#start')) === 'Tap to start');
await page.tap('#start', { timeout: 300000 });
await page.waitForFunction(() => window.__TB && __TB.game.started && __TB.frame > 2, null, { timeout: 600000 });

const frames = async (n) => { const f = await page.evaluate(() => __TB.frame); await page.waitForFunction((t) => __TB.frame >= t, f + n, { timeout: 600000 }); };
const touch = (type, id, x, y) => page.evaluate(([type, id, x, y]) => {
  const c = document.getElementById('game');
  c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
}, [type, id, x, y]);
const tapAt = (id, x, y) => page.evaluate(([id, x, y]) => {        // down + up in one task, like a real quick tap
  const c = document.getElementById('game');
  for (const type of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
}, [id, x, y]);
const st = () => page.evaluate(() => { const g = __TB.game; return { x: g.player.pos.x, z: g.player.pos.z, yaw: g.cam.yaw, dist: g.cam.distTarget, speed: g.player.speed, wood: g.inventory.wood, structures: g.structures.length, build: g.build.type, stickOn: document.getElementById('stick').classList.contains('on') }; });

const layout = await page.evaluate(() => ({
  touch: document.body.classList.contains('touch'),
  help: getComputedStyle(document.getElementById('help')).display,
  btn: document.querySelector('.build-btn').getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth > innerWidth,
}));
check('touch mode switches on for a touchscreen', layout.touch);
check('keyboard help card is hidden', layout.help === 'none');
check('build icons are compact', layout.btn <= 56, `${layout.btn}px`);
check('no horizontal overflow at 390 px', !layout.overflow);
await frames(2);
await page.screenshot({ path: `${out}/t1_idle.png`, timeout: 300000 });

// thumb-stick: full push forward
await page.evaluate(() => { __TB.game.cam.yaw = 0.4; });
let a = await st();
await touch('pointerdown', 1, 90, 700);
await touch('pointermove', 1, 90, 660);
await touch('pointermove', 1, 90, 630);
await frames(6);
let b = await st();
await page.screenshot({ path: `${out}/t2_stick.png`, timeout: 300000 });
{
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const al = (dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / len;
  check('stick push walks camera-forward', len > 0.5 && al > 0.97, `moved ${len.toFixed(2)} m, alignment ${al.toFixed(3)}`);
  check('full push = 6 m/s', Math.abs(b.speed - 6) < 0.05, `${b.speed.toFixed(2)} m/s`);
  check('stick visible while held', b.stickOn);
}
// half push: analog speed
const oy = await page.evaluate(() => __TB.game.touch.stick.oy);
await touch('pointermove', 1, 90, oy - 30);
await frames(6);
b = await st();
check('half push walks slower (analog)', b.speed > 2 && b.speed < 4.5, `${b.speed.toFixed(2)} m/s`);
await touch('pointerup', 1, 90, oy - 30);
await frames(4);
b = await st();
check('release stops and hides the stick', b.speed < 0.01 && !b.stickOn, `speed ${b.speed.toFixed(2)}`);

// look drag on the right side
a = await st();
await touch('pointerdown', 2, 300, 400);
for (let i = 1; i <= 4; i++) await touch('pointermove', 2, 300 - i * 30, 400);
await touch('pointerup', 2, 180, 400);
await frames(2);
b = await st();
check('right-side drag turns the camera', Math.abs(b.yaw - a.yaw) > 0.4 && b.wood === a.wood, `yaw ${a.yaw.toFixed(2)} -> ${b.yaw.toFixed(2)}`);

// pinch: fingers move together => zoom out
a = await st();
await touch('pointerdown', 3, 230, 300); await touch('pointerdown', 4, 330, 500);
for (let i = 1; i <= 4; i++) { await touch('pointermove', 3, 230 + i * 10, 300 + i * 20); await touch('pointermove', 4, 330 - i * 10, 500 - i * 20); }
await touch('pointerup', 3, 270, 380); await touch('pointerup', 4, 290, 420);
await frames(2);
b = await st();
check('pinch zooms within 5-20 m', b.dist > a.dist + 2 && b.dist <= 20, `${a.dist.toFixed(1)} -> ${b.dist.toFixed(1)} m`);

// tap to harvest
await page.evaluate(() => {
  const g = __TB.game, o = __TB.world.trees.filter((t) => t.alive).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
  const d = Math.hypot(o.x, o.z), off = o.radius + 1.3;
  g.teleport(o.x - o.x / d * off, o.z - o.z / d * off);
  g.player.yaw = Math.atan2(o.x - g.player.pos.x, o.z - g.player.pos.z);
  g.cam.distTarget = 9;
});
await frames(3);
const prompt = await page.textContent('#prompt');
check('prompt says Tap on touch', /^Tap/.test(prompt.trim()), prompt.trim().slice(0, 30));
a = await st();
await tapAt(5, 280, 380);
await page.waitForFunction(() => __TB.game.inventory.wood > 0, null, { timeout: 300000 });
await page.waitForFunction(() => !__TB.game.swing, null, { timeout: 300000 });
b = await st();
check('tap harvests +1 wood', b.wood === a.wood + 1, `wood ${b.wood}`);

// build: tap the wall icon, drag to aim, lift to place
await page.evaluate(() => { const g = __TB.game; g.inventory.wood += 3; g.ledger.gained.wood += 3; g.ledger.hits += 3; g.teleport(0, 0); g.cam.yaw = 0.3; g.cam.pitch = 0.6; g.cam.distTarget = 14; });
await frames(4);
await page.tap('.build-btn[data-type="wall"]', { timeout: 300000 });
await frames(1);
b = await st();
check('build icon tap enters build mode only', b.build === 'wall' && b.structures === 0);
const target = await page.evaluate(() => { const g = __TB.game; const p = g.screenOf(new __TB.THREE.Vector3(-3, __TB.terrain.heightAt(-3, -6), -6)); return { x: p.x, y: p.y + 72 }; });
await touch('pointerdown', 6, target.x + 40, target.y + 30);
await touch('pointermove', 6, target.x + 20, target.y + 15);
await touch('pointermove', 6, target.x, target.y);
await frames(3);
const aim = await page.evaluate(() => ({ valid: __TB.game.build.valid, reason: __TB.game.build.reason, x: __TB.game.build.pos.x, z: __TB.game.build.pos.z }));
check('ghost sits above the fingertip on the aimed ground', Math.hypot(aim.x + 3, aim.z + 6) < 0.2 && aim.valid, `${aim.reason} (${aim.x.toFixed(2)}, ${aim.z.toFixed(2)})`);
await page.screenshot({ path: `${out}/t3_aim.png`, timeout: 300000 });
await touch('pointerup', 6, target.x, target.y);
await frames(3);
b = await st();
check('lifting the finger places the wall', b.structures === 1, `structures ${b.structures}, build ${b.build}`);
await page.waitForFunction(() => __TB.frame > 0, null);
await page.screenshot({ path: `${out}/t4_built.png`, timeout: 300000 });

check('zero console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} touch checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
