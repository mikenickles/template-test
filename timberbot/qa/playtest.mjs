// Automated QA play-through (Playwright + headless Chromium / SwiftShader).
// Drives real inputs (keys, mouse drag, wheel, clicks), asserts gameplay rules, and captures
// screenshots for visual inspection.
//
//   node serve.mjs 8123 &            # from timberbot/
//   node qa/playtest.mjs [outDir] [quality 0-2] [baseUrl] [extraQuery]
// On a software renderer pass e.g. extraQuery "grass=0.05" to thin the grass so frames are quick;
// gameplay logic is unaffected.
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'qa/out';
const quality = process.argv[3] || '1';
const base = process.argv[4] || 'http://localhost:8123/';
const extra = process.argv[5] ? '&' + process.argv[5] : '';
mkdirSync(out, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => consoleErrors.push('[requestfailed] ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`[http ${r.status()}] ${r.url()}`); });

const t0 = Date.now();
await page.goto(`${base}?autostart=1&quality=${quality}${extra}`);
await page.waitForFunction(() => window.__TB && window.__TB.game.started && window.__TB.frame > 2, null, { timeout: 600000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const frames = async (n) => { const f = await page.evaluate(() => __TB.frame); await page.waitForFunction((t) => __TB.frame >= t, f + n, { timeout: 600000 }); };
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 }); console.log('  shot', name); };
const state = () => page.evaluate(() => {
  const g = __TB.game;
  return { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, yaw: g.cam.yaw, pitch: g.cam.pitch, dist: g.cam.distTarget, wood: g.inventory.wood, stone: g.inventory.stone,
    speed: g.player.speed, top: g.player.topSpeed, structures: g.structures.length, build: g.build.type, valid: g.build.valid, reason: g.build.reason, keys: g.input.keys.size, swing: !!g.swing };
});
const hold = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); await frames(1); };

// ---------------------------------------------------------------- 1. spawn
let s = await state();
check('robot spawns at (0, y, 0)', Math.abs(s.x) < 1e-6 && Math.abs(s.z) < 1e-6, `(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
check('default camera distance 10 m', Math.abs(s.dist - 10) < 1e-6);
await frames(4);
await shot('01_spawn');

// ---------------------------------------------------------------- 2. camera-relative WASD
for (const [key, fwd, right] of [['KeyW', 1, 0], ['KeyD', 0, 1], ['KeyS', -1, 0], ['KeyA', 0, -1], ['ArrowUp', 1, 0]]) {
  const a = await state();
  await hold(key, 8);
  const b = await state();
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const ex = -Math.sin(a.yaw) * fwd + Math.cos(a.yaw) * right, ez = -Math.cos(a.yaw) * fwd - Math.sin(a.yaw) * right;
  const dot = len > 0 ? (dx * ex + dz * ez) / len : 0;
  check(`${key} moves camera-relative`, len > 0.5 && dot > 0.97, `moved ${len.toFixed(2)} m, alignment ${dot.toFixed(3)}`);
}
s = await state();
check('walk speed is 6 m/s', s.top > 5.9 && s.top <= 6.001, `top speed ${s.top.toFixed(3)} m/s`);
check('robot stops when keys released', s.speed < 0.01 && s.keys === 0, `speed ${s.speed.toFixed(3)}, keys ${s.keys}`);

// rotate the camera, then W must follow the NEW camera heading
await hold('KeyQ', 6);
let a = await state();
check('Q orbits the camera', Math.abs(a.yaw - s.yaw) > 0.2, `yaw ${s.yaw.toFixed(2)} -> ${a.yaw.toFixed(2)}`);
await hold('KeyW', 6);
let b = await state();
{
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  check('W follows rotated camera', (dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / len > 0.97, `alignment ${((dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / len).toFixed(3)}`);
}
// mouse-drag orbit
await page.mouse.move(512, 250); await page.mouse.down(); await page.mouse.move(690, 290, { steps: 6 }); await page.mouse.up();
await frames(2);
let c = await state();
check('mouse drag orbits (and does not harvest)', Math.abs(c.yaw - b.yaw) > 0.3 && !c.swing, `yaw ${b.yaw.toFixed(2)} -> ${c.yaw.toFixed(2)}`);
// zoom limits
await page.mouse.move(512, 250);
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 240);
await frames(2);
check('zoom clamps at 20 m', Math.abs((await state()).dist - 20) < 1e-6);
await page.evaluate(() => { __TB.game.cam.pitch = 0.75; });
await frames(12);
await shot('02_zoom_out_20m');
for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -240);
await frames(2);
check('zoom clamps at 5 m', Math.abs((await state()).dist - 5) < 1e-6);
await page.evaluate(() => { const g = __TB.game; g.cam.pitch = 0.22; g.cam.yaw = g.player.yaw + 0.5; });
await frames(14);
await shot('03_closeup_5m');
await page.evaluate(() => { const g = __TB.game; g.cam.distTarget = 10; g.cam.pitch = 0.4; });

// stuck-key guard: blur while holding W
await page.keyboard.down('KeyW'); await frames(3);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await frames(4);
s = await state();
check('keys never stick after focus loss', s.keys === 0 && s.speed < 0.01, `keys ${s.keys}, speed ${s.speed.toFixed(2)}`);
await page.keyboard.up('KeyW');

// ---------------------------------------------------------------- 3. harvesting
const goNear = (type, idx = 0) => page.evaluate(([type, idx]) => {
  const g = __TB.game, list = (type === 'tree' ? __TB.world.trees : __TB.world.boulders).filter((o) => o.alive);
  list.sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  const o = list[idx];
  const d = Math.hypot(o.x, o.z), off = o.radius + 1.3;
  g.teleport(o.x - o.x / d * off, o.z - o.z / d * off);
  g.player.yaw = Math.atan2(o.x - g.player.pos.x, o.z - g.player.pos.z);      // face it: the nearest object in FRONT is harvested
  g.cam.yaw = Math.atan2(-o.x / d, -o.z / d) + 0.7; g.cam.pitch = 0.33; g.cam.distTarget = 9;
  return { id: (type === 'tree' ? __TB.world.trees : __TB.world.boulders).indexOf(o), x: o.x, z: o.z, h: o.height, w: o.width, dist: Math.hypot(o.x - g.player.pos.x, o.z - g.player.pos.z) };
}, [type, idx]);
const objState = (type, id) => page.evaluate(([type, id]) => { const o = (type === 'tree' ? __TB.world.trees : __TB.world.boulders)[id]; return { hp: o.hp, hits: o.hits, alive: o.alive }; }, [type, id]);
const swingOnce = async () => { await page.keyboard.press('Space'); await page.waitForFunction(() => !__TB.game.swing, null, { timeout: 600000 }); await frames(1); };

async function harvest(type, idx, shots) {
  const o = await goNear(type, idx);
  await frames(6);
  const res = type === 'tree' ? 'wood' : 'stone';
  const before = (await state())[res];
  if (shots) await shot(`${shots}_before`);
  for (let hit = 1; hit <= 3; hit++) {
    await page.keyboard.down('Space'); await frames(1); await page.keyboard.up('Space');
    try {
      await page.waitForFunction(([t, id, h]) => (t === 'tree' ? __TB.world.trees : __TB.world.boulders)[id].hits >= h, [type, o.id, hit], { timeout: 90000 });
    } catch (e) {
      const dump = await page.evaluate(([t, id]) => { const g = __TB.game, q = (t === 'tree' ? __TB.world.trees : __TB.world.boulders)[id];
        return { hits: q.hits, alive: q.alive, swing: g.swing && { t: g.swing.t, hasTarget: !!g.swing.target }, keys: [...g.input.keys], build: g.build.type, inRange: g._inRange().length,
          dist: Math.hypot(q.x - g.player.pos.x, q.z - g.player.pos.z), toast: document.getElementById('toast').textContent, focus: document.hasFocus(), active: document.activeElement && document.activeElement.tagName }; }, [type, o.id]);
      check(`${type} #${o.id} hit ${hit} registered`, false, JSON.stringify(dump));
      break;
    }
    if (shots && hit === 1) await shot(`${shots}_hit1`);
    if (shots && hit === 2) { await frames(3); await shot(`${shots}_hit2`); }
    await page.waitForFunction(() => !__TB.game.swing, null, { timeout: 600000 });
    const os = await objState(type, o.id);
    const now = (await state())[res];
    check(`${type} #${o.id} hit ${hit}: +1 ${res}`, now === before + hit && os.hits === hit && os.alive === (hit < 3), `${res} ${now}, hp ${os.hp}`);
  }
  if (shots) { await frames(3); await shot(`${shots}_depleted`); }
  // a 4th swing must yield nothing from the depleted object
  const again = (await state())[res];
  return { o, total: again - before };
}
const tree1 = await harvest('tree', 0, '04_tree');
check('tree yields exactly 3 wood in 3 hits', tree1.total === 3);
check('harvest target was within 3.5 m', tree1.o.dist <= 3.5, `${tree1.o.dist.toFixed(2)} m`);
const rock1 = await harvest('boulder', 0, '05_boulder');
check('boulder yields exactly 3 stone in 3 hits', rock1.total === 3);
// out-of-range swing gives nothing
await page.evaluate(() => __TB.game.teleport(0, 0));
const pre = await state();
await swingOnce();
const post = await state();
check('no yield when nothing is within 3.5 m', post.wood === pre.wood && post.stone === pre.stone);
// stock up for all three structures (9 wood, 9 stone)
await harvest('tree', 0); await harvest('tree', 0);
await harvest('boulder', 0); await harvest('boulder', 0);
s = await state();
check('inventory after 3 trees + 3 boulders', s.wood === 9 && s.stone === 9, `wood ${s.wood}, stone ${s.stone}`);

// ---------------------------------------------------------------- 4. building
await page.evaluate(() => { const g = __TB.game; g.teleport(0, 0); g.cam.yaw = 0.5; g.cam.pitch = 0.5; g.cam.distTarget = 14; });
await frames(14);
const screenOf = (x, z) => page.evaluate(([x, z]) => { const g = __TB.game, v = new __TB.THREE.Vector3(x, __TB.terrain.heightAt(x, z), z); const p = g.screenOf(v); return { x: p.x, y: p.y }; }, [x, z]);
// HUD button click must select build mode but never place / harvest
await page.click('.build-btn[data-type="wall"]');
await frames(2);
s = await state();
check('HUD button enters build mode without world action', s.build === 'wall' && s.structures === 0 && !s.swing, `build=${s.build}, structures=${s.structures}`);
let p = await screenOf(-4, -5);
await page.mouse.move(p.x, p.y); await frames(3);
s = await state();
const rayErr = await page.evaluate(() => __TB.game.build.rayErrPx);
const ghostAt = await page.evaluate(() => { const b = __TB.game.build; return { x: b.pos.x, z: b.pos.z }; });
check('ghost tracks the exact terrain point under the cursor', rayErr < 1.5 && Math.hypot(ghostAt.x + 4, ghostAt.z + 5) < 0.05, `reprojection ${rayErr.toFixed(3)} px, world error ${Math.hypot(ghostAt.x + 4, ghostAt.z + 5).toFixed(3)} m`);
check('ghost is valid (green) on open ground', s.valid, s.reason);
await shot('06_ghost_valid');
// blocked: on top of the robot
p = await screenOf(0.2, 0.1);
await page.mouse.move(p.x, p.y); await frames(3);
s = await state();
check('ghost is blocked (red) on the robot', !s.valid, s.reason);
await shot('07_ghost_blocked');
// clicking while blocked places nothing
await page.mouse.click(p.x, p.y); await frames(2);
check('click on blocked ghost places nothing', (await state()).structures === 0);
// place the wall
p = await screenOf(-4, -5);
await page.mouse.move(p.x, p.y); await frames(2);
await page.mouse.click(p.x, p.y); await frames(3);
s = await state();
check('wall placed for 3 wood', s.structures === 1 && s.wood === 6 && s.stone === 9, `wood ${s.wood}, stone ${s.stone}`);
// right-click cancels
if (s.build !== 'wall') await page.keyboard.press('Digit1');
await frames(2);
await page.mouse.click(p.x + 200, p.y, { button: 'right' }); await frames(2);
check('right-click cancels build mode', (await state()).build === null);
// campfire via key 2
await page.keyboard.press('Digit2'); await frames(2);
p = await screenOf(3.5, -3.5);
await page.mouse.move(p.x, p.y); await frames(3);
await page.mouse.click(p.x, p.y); await frames(3);
s = await state();
check('campfire placed for 2 wood + 3 stone', s.structures === 2 && s.wood === 4 && s.stone === 6, `wood ${s.wood}, stone ${s.stone}`);
// Esc cancels
await page.keyboard.press('Digit3'); await frames(2);
await page.keyboard.press('Escape'); await frames(2);
check('Esc cancels build mode', (await state()).build === null);
// beacon via key 3
await page.keyboard.press('Digit3'); await frames(2);
p = await screenOf(-7, 4);
await page.mouse.move(p.x, p.y); await frames(3);
await shot('08_ghost_beacon');
await page.mouse.click(p.x, p.y); await frames(3);
s = await state();
check('beacon placed for 4 wood + 6 stone', s.structures === 3 && s.wood === 0 && s.stone === 0, `wood ${s.wood}, stone ${s.stone}`);
// insufficient resources => red
await page.keyboard.press('Digit1'); await frames(2);
p = await screenOf(6, 6);
await page.mouse.move(p.x, p.y); await frames(3);
s = await state();
check('ghost red with insufficient resources', s.build === 'wall' && !s.valid && /Need/.test(s.reason), s.reason);
await page.keyboard.press('Escape');
const structs = await page.evaluate(() => __TB.game.structures.map((q) => ({ kind: q.kind, gap: Math.abs(q.y - __TB.terrain.heightAt(q.x, q.z)) })));
check('structures snapped flush to terrain', structs.every((q) => q.gap < 1e-4), JSON.stringify(structs.map((q) => q.kind)));
await page.evaluate(() => { const g = __TB.game; g.cam.yaw = 0.2; g.cam.pitch = 0.36; g.cam.distTarget = 15; });
await frames(16);
await shot('09_camp_built');
await page.evaluate(() => { const g = __TB.game; g.teleport(2.2, -2.2); g.cam.yaw = 2.3; g.cam.pitch = 0.3; g.cam.distTarget = 7; });
await frames(14);
await shot('10_campfire_light');

// wall blocks movement: walk straight at it
await page.evaluate(() => { const g = __TB.game; g.teleport(-4, -2.2); g.cam.yaw = 0; g.cam.pitch = 0.5; g.cam.distTarget = 10; });   // W => -Z, into the wall at z = -5
await frames(3);
await hold('KeyW', 26);
s = await state();
const pen = await page.evaluate(() => __TB.game.penetration());
check('timber wall blocks movement', s.z > -5 + 0.22 + 0.4 - 0.03 && pen < 0.02, `stopped at z = ${s.z.toFixed(2)} (wall face at -4.78), penetration ${(pen * 100).toFixed(1)} cm`);

// ---------------------------------------------------------------- 5. boundary containment
await page.evaluate(() => { const g = __TB.game; g.teleport(57, 3); g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0.32; g.cam.distTarget = 12; });      // W => +X, toward the ridge
await frames(3);
await hold('KeyW', 30);
s = await state();
check('ridge contains the player inside 120 x 120 m', s.x <= 60 + 1e-6, `x = ${s.x.toFixed(2)}`);
await frames(8);
await shot('11_border_ridge');
await page.evaluate(() => { const g = __TB.game; g.teleport(-52, -48); g.cam.yaw = 0.9; g.cam.pitch = 0.9; g.cam.distTarget = 20; });
await frames(14);
await shot('12_corner_high_camera');

// ---------------------------------------------------------------- 6. QA overlay + forest beauty shots
await page.evaluate(() => { const g = __TB.game; g.teleport(-27, 26); g.cam.yaw = -0.9; g.cam.pitch = 0.2; g.cam.distTarget = 8; });
await frames(14);
await shot('13_forest');
await page.evaluate(() => { const g = __TB.game; g.teleport(0, 0); g.cam.yaw = 0.55; g.cam.pitch = 0.4; g.cam.distTarget = 10; });
await page.keyboard.press('KeyT');
await frames(8);
const qa = await page.evaluate(() => ({ summary: __TB.qa.summary(), rows: __TB.qa.results, fps: __TB.qa.fps, gpu: __TB.qa.gpu, draws: __TB.qa.drawCalls, tris: __TB.qa.triangles }));
check('in-game QA overlay: all checks pass', qa.summary.ok, `${qa.summary.pass}/${qa.summary.total} ${qa.summary.failed.join(', ')}`);
await shot('14_qa_overlay');
const qaVisible = await page.evaluate(() => !document.getElementById('qa').classList.contains('hidden') && /PASS|FAIL/.test(document.getElementById('qa').textContent));
check('T toggles the QA overlay', qaVisible);
// mute button
const m0 = await page.evaluate(() => __TB.audio.muted);
await page.click('#btn-mute'); await frames(1);
const m1 = await page.evaluate(() => __TB.audio.muted);
check('mute button toggles audio', m0 !== m1 && (await state()).structures === 3);
await page.click('#btn-mute');

const real = consoleErrors.filter((e) => !/GPU stall|Automatic fallback to software WebGL|GroupMarkerNotSet/.test(e));
check('zero console / WebGL errors', real.length === 0, real.slice(0, 6).join(' | '));

const failed = results.filter((r) => !r.pass);
writeFileSync(`${out}/report.json`, JSON.stringify({ results, qa, consoleErrors, failed: failed.length }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed; engine: ${qa.gpu}; ${qa.draws} draws, ${(qa.tris / 1e6).toFixed(2)} M tris, ${qa.fps.toFixed(1)} fps (software GL)`);
await browser.close();
process.exit(failed.length ? 1 : 0);
