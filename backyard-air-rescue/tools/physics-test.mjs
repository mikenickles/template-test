// Checks the physics playground with real two-finger touch at phone size: swing a toy through the
// block tower, bounce things on the trampoline, and catapult the bunny with the seesaw.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
const d = await launch({ scale: 2, query: 'manual&dpr=2&fresh' });
const L = await d.page.evaluate(() => window.__game.L);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (n) => n.toFixed(2);
const struct = async (name) => (await d.state()).physics.find((s) => s.name === name);
const loopOf = (st, name) => st.toys.find((x) => x.name === name)?.loop;
async function hook(name) {
  let [tx, , tz] = loopOf(await d.state(), name);
  await d.flyTo(tx, tz, 3);
  for (let i = 0; i < 80; i++) { const e = await d.hover(tx, tz, 3); const q = await d.state(); if (e < 0.2 && Math.hypot(q.vel[0], q.vel[2]) < 0.3) break; }
  await d.holdWinch();
  for (let i = 0; i < 400; i++) { await d.hover(tx, tz, 3); const q = await d.state(); if (q.carrying === name && q.winch === 'idle') break; }
  await d.release();
  return d.state();
}
let s = await d.state();
check('physics engine is running with all four structures standing', !!s.physics && s.physics.every((x) => x.state === 'standing' && x.displaced === 0), s.physics?.map((x) => `${x.name} ${x.pieces}`).join(', '));
await d.stick(0.3, -0.3); await d.step(90); await d.release();

// 1. swing the teddy through the block tower
s = await hook('teddy');
check('hooked the teddy', s.carrying === 'teddy');
await d.flyTo(L.blocks.x, L.blocks.z + 9, 1.5); await d.step(60);
await d.stick(0, -1); await d.step(40);
await d.shot(join(root, 'media', 'knockdown.png'));
await d.step(30); await d.release(); await d.step(20);
let tw = await struct('tower');
check('swinging a toy through the block tower knocks it over', tw.displaced >= 6, `${tw.displaced}/16 blocks knocked out of place`);
await d.flyTo(L.blocks.x + 10, L.blocks.z + 10, 2);
for (let i = 0; i < 30 && (await struct('tower')).state !== 'standing'; i++) await d.step(30);
tw = await struct('tower');
check('…and it rebuilds itself a few seconds later', tw.state === 'standing' && tw.displaced === 0);

// 2. drop the teddy on the trampoline
await d.flyTo(L.tramp.x, L.tramp.z, 1.5);
for (let i = 0; i < 80; i++) { const e = await d.hover(L.tramp.x, L.tramp.z, 3); const q = await d.state(); if (e < 0.4 && Math.hypot(q.vel[0], q.vel[2]) < 0.3) break; }
await d.release();
const b0 = (await d.state()).trampBounces;
await d.releaseWinch();
let maxY = 0;
for (let i = 0; i < 240; i++) { await d.step(1); const q = await d.state(); const t = q.toys[0]; maxY = Math.max(maxY, t.pos[1]); if (i === 70) await d.shot(join(root, 'media', 'trampoline.png')); }
s = await d.state();
check('dropping a toy on the trampoline bounces it high into the air', s.trampBounces > b0 && maxY > 6, `${s.trampBounces - b0} bounces, peak height ${f(maxY)}`);
await d.step(200);
s = await d.state();
check('…and it comes down somewhere else in the yard', s.toys[0].state === 'placed' && Math.hypot(s.toys[0].pos[0] - L.tramp.x, s.toys[0].pos[2] - L.tramp.z) > 3, `landed ${f(Math.hypot(s.toys[0].pos[0] - L.tramp.x, s.toys[0].pos[2] - L.tramp.z))} u away`);

// 3. the helicopter itself boings on the trampoline
await d.flyTo(L.tramp.x, L.tramp.z, 0.6);
for (let i = 0; i < 360; i++) { await d.step(1); if ((await d.state()).heliBounces >= 2) break; }
s = await d.state();
check('hovering low over the trampoline makes the helicopter bounce', s.heliBounces >= 2, `${s.heliBounces} bounces`);

// 4. seesaw: drop the heavy robot on the empty (raised) end; the bunny flies
s = await d.state();
check('the bunny starts on the seesaw, her end down', s.saw.A === 'bunny' && s.saw.theta > 0.1, `angle ${f(s.saw.theta)}`);
s = await hook('robot');
check('hooked the robot', s.carrying === 'robot');
await d.flyTo(L.seesaw.x + 3.45, L.seesaw.z, 0.5); await d.step(40);
for (let i = 0; i < 60; i++) { const e = await d.hover(L.seesaw.x + 3.45, L.seesaw.z, 3); if (e < 0.3) break; }
await d.release(); await d.releaseWinch();
let launched = null, peak = 0;
for (let i = 0; i < 260; i++) { await d.step(1); const q = await d.state(); if (q.saw.last && !launched) launched = q.saw.last; if (q.bunnyState.state === 'falling') peak = Math.max(peak, q.bunnyState.pos[1]); if (i === 40) await d.shot(join(root, 'media', 'seesaw.png')); }
s = await d.state();
check('dropping the robot on the seesaw catapults the bunny', launched?.flew === 'bunny' && peak > 5, `power ${f(launched?.k ?? 0)}, bunny peaked at ${f(peak)}`);
for (let i = 0; i < 60 && s.bunnyState.seat === null; i++) { await d.step(30); s = await d.state(); }
check('…the bunny hops back to the seesaw by herself', !!s.bunnyState.seat, `seat ${s.bunnyState.seat}`);
check('no script errors', d.errors.length === 0, d.errors.join(' | '));
await d.browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} physics checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
