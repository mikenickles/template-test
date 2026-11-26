// End-to-end check at phone size: take off, rescue all three toys, sharp turns with cargo, hover on release, free flight.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const out = join(root, 'media'); mkdirSync(out, { recursive: true });
const d = await launch({ scale: 2, query: 'manual&dpr=2' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (n) => n.toFixed(2);
const L = await d.page.evaluate(() => window.__game.L);

// 1. take-off
let s = await d.state();
const y0 = s.pos[1];
await d.stick(0.6, 0.2); await d.step(90); await d.release(); await d.step(60);
s = await d.state();
check('takes off from the pad on first drag', s.pos[1] > 5.5 && y0 < 1.5, `altitude ${f(y0)} → ${f(s.pos[1])}`);

// 2. release → hover
await d.stick(-1, 0); await d.step(100);
s = await d.state(); const vmax = Math.hypot(s.vel[0], s.vel[2]), p0 = s.pos;
await d.release();
let stopT = null, maxBack = 0;
for (let i = 0; i < 180; i++) { await d.step(1); const q = await d.state(); const sp = Math.hypot(q.vel[0], q.vel[2]); if (stopT === null && sp < 0.4) stopT = i / 60; if (q.vel[0] > maxBack) maxBack = q.vel[0]; }
s = await d.state();
check('lets go → settles into a hover', stopT !== null && stopT < 1.6 && maxBack > 0.05 && maxBack < 1.5 && Math.hypot(s.vel[0], s.vel[2]) < 0.15, `from ${f(vmax)} u/s, stopped in ${f(stopT ?? 9)} s over ${f(Math.abs(s.pos[0] - p0[0]))} u, soft bounce-back ${f(maxBack)} u/s`);

async function rescue(name, shot) {
  const toy = (await d.state()).toys.find((t) => t.name === name);
  await d.flyTo(toy.pos[0], toy.pos[2], 3.5);           // sloppy on purpose: stop 3.5 away
  const ready = await d.page.evaluate(() => document.getElementById('winch').classList.contains('ready'));
  await d.tapWinch();
  s = await d.waitFor((q) => q.carrying === name && q.winch === 'idle', 8);
  check(`${name}: one tap from ${f(3.5)} u away hooks it`, s.carrying === name, `button was pulsing: ${ready}`);
  if (shot) await d.shot(join(out, shot));
  return s;
}
async function deliver(name) {
  await d.flyTo(L.pad.x, L.pad.z, 4.0);
  await d.tapWinch();
  s = await d.waitFor((q) => q.toys.find((t) => t.name === name).state === 'home', 9);
  check(`${name}: set down on the pad and counted`, s.toys.find((t) => t.name === name).rescued, `rescued ${s.rescued}/3`);
}

// 3. teddy + sharp turn with cargo
await rescue('teddy');
await d.stick(1, 0); await d.step(70);
let maxSwing = 0, minAlt = 99, bad = false;
const swing = async (n) => { for (let i = 0; i < n; i++) { await d.step(2); const q = await d.state(); const dx = q.bob[0] - q.pos[0], dz = q.bob[2] - q.pos[2], dy = q.pos[1] - q.bob[1]; maxSwing = Math.max(maxSwing, Math.atan2(Math.hypot(dx, dz), dy) * 57.3); minAlt = Math.min(minAlt, q.pos[1]); if (![...q.pos, ...q.bob].every(Number.isFinite)) bad = true; } };
await d.stick(0, -1); await swing(25);      // hard 90° turn
await d.stick(-1, 0); await swing(25);      // and reverse
await d.shot(join(out, 'gameplay.png'));
await d.release(); await swing(60);
s = await d.state();
check('sharp turn + reverse with teddy attached stays controllable', !bad && maxSwing > 8 && maxSwing < 45 && s.carrying === 'teddy', `peak swing ${f(maxSwing)}°, still carrying`);
await deliver('teddy');

// 4. duck (stretchy cable) and robot (heavy)
await rescue('duck');
await deliver('duck');
await d.flyTo((await d.state()).toys[2].pos[0], (await d.state()).toys[2].pos[2], 3.0);
await d.tapWinch();
let dip = 0, liftAlt = null;
for (let i = 0; i < 300; i++) { await d.step(1); const q = await d.state(); if (q.carrying === 'robot') { liftAlt ??= q.pos[1]; dip = Math.max(dip, liftAlt - q.pos[1]); } }
s = await d.state();
check('robot: hooks from the play structure', s.carrying === 'robot');
check('robot: heavy load dips the helicopter, then it recovers', dip > 0.1 && dip < 1.5 && s.pos[1] > liftAlt, `dipped ${f(dip)} u as it took the weight, then climbed from ${f(liftAlt)} to ${f(s.pos[1])}`);
await deliver('robot');
await d.step(240);
s = await d.state();
check('all three safe → free flight unlocked', s.free && s.rescued === 3);
await d.shot(join(out, 'all-safe.png'));

// 5. free flight: toys can go for joyrides
await d.flyTo(-10, 12, 2, 10); await d.step(60);
const toy = (await d.state()).toys[0];
await d.flyTo(toy.pos[0], toy.pos[2], 3);
await d.tapWinch();
s = await d.waitFor((q) => q.carrying && q.winch === 'idle', 8);
check('free flight: can pick a toy back up for a ride', !!s.carrying, `carrying ${s.carrying}`);
await d.flyTo(-8, 14, 2); await d.tapWinch(); s = await d.waitFor((q) => !q.carrying && q.winch === 'idle', 8);
check('free flight: sets the toy down anywhere', !s.carrying);

// 6. edges are soft
await d.stick(-1, -1); await d.step(600); s = await d.state(); await d.release();
check('cannot leave the yard or get stuck', s.pos[0] > -33 && s.pos[2] > -30 && s.pos.every(Number.isFinite), `parked at ${f(s.pos[0])}, ${f(s.pos[2])}`);
check('no script errors', d.errors.length === 0, d.errors.join(' | '));
console.log(JSON.stringify(await d.page.evaluate(() => window.__game.info())));
await d.browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
