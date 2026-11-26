// End-to-end check at phone size with real two-finger touch: take off, hover, line up and hold the winch,
// drop a toy by letting go early, carry each toy home holding the button, free flight.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const out = join(root, 'media'); mkdirSync(out, { recursive: true });
const d = await launch({ scale: 2, query: 'manual&dpr=2' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (n) => n.toFixed(2);
const L = await d.page.evaluate(() => window.__game.L);
const top = async (name) => { const t = (await d.state()).toys.find((x) => x.name === name); const h = { teddy: 1.98, duck: 1.66, robot: 2.3 }[name]; return [t.pos[0], t.pos[1] + h, t.pos[2]]; };
const toyState = async (name) => (await d.state()).toys.find((x) => x.name === name);

// 1. take-off
let s = await d.state();
const y0 = s.pos[1];
await d.stick(0.6, 0.2); await d.step(90); await d.release(); await d.step(60);
s = await d.state();
check('takes off from the pad on first drag', s.pos[1] > 5.5 && y0 < 1.5, `altitude ${f(y0)} → ${f(s.pos[1])}`);

// 2. release → hover
await d.stick(-1, 0); await d.step(100);
s = await d.state(); const vmax = Math.hypot(s.vel[0], s.vel[2]);
await d.release();
let stopT = null;
for (let i = 0; i < 180; i++) { await d.step(1); const q = await d.state(); if (stopT === null && Math.hypot(q.vel[0], q.vel[2]) < 0.4) stopT = i / 60; }
s = await d.state();
check('lets go → settles into a hover', stopT !== null && stopT < 1.6 && Math.hypot(s.vel[0], s.vel[2]) < 0.15, `from ${f(vmax)} u/s, stopped in ${f(stopT ?? 9)} s`);

/** Line the hook up over the toy, then hold the button and keep making small corrections until it clicks on. */
async function hook(name, maxSecs = 20) {
  const [tx, , tz] = await top(name);
  await d.flyTo(tx, tz, 3);
  for (let i = 0; i < 80; i++) { const e = await d.hover(tx, tz, 3); const q = await d.state(); if (e < 0.2 && Math.hypot(q.vel[0], q.vel[2]) < 0.25) break; }
  await d.holdWinch();
  for (let i = 0; i < maxSecs * 20; i++) { await d.hover(tx, tz, 3); const q = await d.state(); if (q.carrying === name && q.winch === 'idle') break; }
  await d.release();
  return d.state();
}
/** Carry the toy home, keeping the button held the whole way, and let go over the pad. */
async function deliver(name) {
  await d.flyTo(L.pad.x, L.pad.z, 1.6);
  await d.step(30);
  await d.releaseWinch();
  return d.waitFor((q) => q.toys.find((t) => t.name === name).state === 'home', 9);
}

// 3. no auto-connect: hold the button with the hook 1.4 units off the loop
{
  const [tx, ty, tz] = await top('teddy');
  await d.flyTo(tx + 1.4, tz, 3);
  for (let i = 0; i < 80; i++) { const e = await d.hover(tx + 1.4, tz, 3); const q = await d.state(); if (e < 0.15 && Math.hypot(q.vel[0], q.vel[2]) < 0.2) break; }
  await d.release();
  await d.holdWinch(); await d.step(200);
  s = await d.state();
  check('near but not lined up: holding the button does not hook the toy', !s.carrying && s.len > 3 && s.bob[1] < ty, `hook lowered to y=${f(s.bob[1])} beside the loop (y=${f(ty)}), nothing attached`);
  await d.releaseWinch(); await d.step(90);
  s = await d.state();
  check('let go of the button → hook reels back up', s.len < 1, `cable ${f(s.len)} u`);
}

// 4. line up precisely and hold → it clicks on
s = await hook('teddy');
check('teddy: lined up + held → hook clicks on', s.carrying === 'teddy');

// 5. sharp turn with cargo while holding
await d.stick(1, 0); await d.step(70);
let maxSwing = 0, bad = false;
const swing = async (n) => { for (let i = 0; i < n; i++) { await d.step(2); const q = await d.state(); const dx = q.bob[0] - q.pos[0], dz = q.bob[2] - q.pos[2], dy = q.pos[1] - q.bob[1]; maxSwing = Math.max(maxSwing, Math.atan2(Math.hypot(dx, dz), dy) * 57.3); if (![...q.pos, ...q.bob].every(Number.isFinite)) bad = true; } };
await d.stick(0, -1); await swing(25);
await d.stick(-1, 0); await swing(25);
await d.shot(join(out, 'gameplay.png'));
await d.release(); await swing(60);
s = await d.state();
check('sharp turn + reverse with teddy attached stays controllable', !bad && maxSwing > 8 && maxSwing < 45 && s.carrying === 'teddy', `peak swing ${f(maxSwing)}°`);

// 6. let go early → teddy drops and has to be fetched again
await d.stick(1, -0.2); await d.step(40); await d.release();
const dropFrom = (await d.state()).pos;
await d.releaseWinch(); await d.step(2);
s = await d.state();
check('letting go away from the pad drops the toy', !s.carrying && (await toyState('teddy')).state === 'falling');
s = await d.waitFor((q) => q.toys[0].state === 'placed', 4);
const tt = s.toys[0];
check('dropped toy lands softly, is not counted, and can be picked up again', tt.state === 'placed' && !tt.rescued && s.rescued === 0, `landed at y=${f(tt.pos[1])}, ${f(Math.hypot(tt.pos[0] - dropFrom[0], tt.pos[2] - dropFrom[2]))} u from where it was let go; rescued ${s.rescued}/3`);
await d.shot(join(out, 'dropped.png'));

// 7. three real rescues, button held all the way home
s = await hook('teddy'); s = await deliver('teddy');
check('teddy: held all the way to the pad → rescued', s.toys[0].rescued, `rescued ${s.rescued}/3`);
s = await hook('duck'); s = await deliver('duck');
check('duck: rescued off the pond', s.toys[1].rescued, `rescued ${s.rescued}/3`);
{
  const [tx, , tz] = await top('robot');
  await d.flyTo(tx, tz, 3);
  s = await hook('robot');
  check('robot: hooked on top of the play structure', s.carrying === 'robot');
  s = await deliver('robot');
  check('robot: rescued', s.toys[2].rescued, `rescued ${s.rescued}/3`);
}
await d.step(240);
s = await d.state();
check('all three safe → free flight unlocked', s.free && s.rescued === 3);
await d.shot(join(out, 'all-safe.png'));

// 8. free flight: letting go anywhere sets the toy down gently
s = await hook('duck');
await d.flyTo(-6, 14, 2); await d.step(40); await d.releaseWinch();
s = await d.waitFor((q) => !q.carrying && q.winch === 'idle', 8);
const duck = s.toys[1];
check('free flight: carry a toy anywhere and set it down gently', !s.carrying && duck.state === 'placed', `duck at ${f(duck.pos[0])}, ${f(duck.pos[2])}`);

await d.stick(-1, -1); await d.step(600); s = await d.state(); await d.release();
check('cannot leave the yard or get stuck', s.pos[0] > -33 && s.pos[2] > -30 && s.pos.every(Number.isFinite));
check('no script errors', d.errors.length === 0, d.errors.join(' | '));
await d.browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
