// End-to-end check at phone size with real two-finger touch: the whole game, start to sunset,
// then a reload to check progress was saved.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const out = join(root, 'media'); mkdirSync(out, { recursive: true });
const d = await launch({ scale: 2, query: 'manual&dpr=2' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (n) => n.toFixed(2);
const L = await d.page.evaluate(() => window.__game.L);
const minutes = () => d.state().then((s) => s.t / 60);

const loopOf = (st, name) => (name === 'bucket' ? st.bucket.loop : name === 'basket' ? st.basket.loop : st.toys.find((x) => x.name === name).loop);
/** Line the hook up over a target (moving ones are tracked), hold the button, keep correcting until it clicks on. */
async function hook(name, { center = null, secs = 25 } = {}) {
  const tgt = async () => center || loopOf(await d.state(), name);
  let [tx, , tz] = await tgt();
  await d.flyTo(tx, tz, 3);
  let prev = await tgt(), vx = 0, vz = 0;
  const track = async () => { const c = await tgt(); vx = (c[0] - prev[0]) / 0.05; vz = (c[2] - prev[2]) / 0.05; prev = c; return c; };
  for (let i = 0; i < 80; i++) { const c = await track(); const e = await d.hover(c[0], c[2], 3, center ? 0 : vx, center ? 0 : vz); const q = await d.state(); if (e < 0.2 && Math.hypot(q.vel[0] - vx, q.vel[2] - vz) < 0.3) break; }
  await d.holdWinch();
  for (let i = 0; i < secs * 20; i++) { const c = await track(); await d.hover(c[0], c[2], 3, center ? 0 : vx, center ? 0 : vz); const q = await d.state(); if (q.carrying === name && q.winch === 'idle') break; }
  await d.release();
  return d.state();
}
/** Carry a toy home, button held the whole way, and let go over the pad. */
async function deliver(name) {
  await d.flyTo(L.pad.x, L.pad.z, 1.6); await d.step(30); await d.releaseWinch();
  return d.waitFor((q) => q.toys.find((t) => t.name === name).state === 'home', 9);
}
/** Hover what's hanging on the winch over a spot until a condition holds. */
async function hoverUntil(x, z, pred, maxSecs = 9) {
  await d.flyTo(x, z, 3);
  for (let i = 0; i < maxSecs * 20; i++) { await d.hover(x, z, 3); if (pred(await d.state())) break; }
  await d.release();
  return d.state();
}

// ---- 1. flying
let s = await d.state();
const y0 = s.pos[1];
await d.stick(0.6, 0.2); await d.step(90); await d.release(); await d.step(60);
s = await d.state();
check('takes off from the pad on first drag', s.pos[1] > 5.5 && y0 < 1.5, `altitude ${f(y0)} → ${f(s.pos[1])}`);
await d.stick(-1, 0); await d.step(100); await d.release();
let stopT = null;
for (let i = 0; i < 180; i++) { await d.step(1); const q = await d.state(); if (stopT === null && Math.hypot(q.vel[0], q.vel[2]) < 0.4) stopT = i / 60; }
check('lets go → settles into a hover', stopT !== null && stopT < 1.6, `stopped in ${f(stopT ?? 9)} s`);

// ---- 2. winch rules
{
  const [tx, ty, tz] = loopOf(await d.state(), 'teddy');
  await d.flyTo(tx + 1.4, tz, 3);
  for (let i = 0; i < 80; i++) { const e = await d.hover(tx + 1.4, tz, 3); const q = await d.state(); if (e < 0.15 && Math.hypot(q.vel[0], q.vel[2]) < 0.2) break; }
  await d.release(); await d.holdWinch(); await d.step(200);
  s = await d.state();
  check('near but not lined up: holding does not hook the toy', !s.carrying && s.bob[1] < ty, 'hook beside the loop, nothing attached');
  await d.releaseWinch(); await d.step(90);
}
s = await hook('teddy');
check('lined up + held → hook clicks on', s.carrying === 'teddy');
await d.stick(1, -0.2); await d.step(40); await d.release(); await d.releaseWinch(); await d.step(2);
check('letting go away from the pad drops the toy', (await d.state()).toys[0].state === 'falling');
s = await d.waitFor((q) => q.toys[0].state === 'placed', 4);
check('dropped toy lands softly and is not counted', !s.toys[0].rescued && s.rescued === 0);

// ---- 3. round one
for (const name of ['teddy', 'duck', 'robot']) {
  s = await hook(name); s = await deliver(name);
  check(`round 1 — ${name} rescued`, s.toys.find((t) => t.name === name).rescued, `${s.rescued}/7`);
}
await d.step(240);
s = await d.state();
const r2 = s.toys.slice(3);
check('round 2 appears after the first three', s.round === 2 && r2.every((t) => t.state === 'stranded') && !s.free, r2.map((t) => t.name).join(', '));
console.log(`      (${f(await minutes())} game-minutes so far)`);

// ---- 4. round two: each needs a different trick
s = await hook('kite');
check('kite: hooked off the edge of the apple tree', s.carrying === 'kite');
s = await deliver('kite'); check('kite rescued', s.toys[3].rescued);
s = await hook('ball');
check('ball: hooked off the sloping shed roof', s.carrying === 'ball');
s = await deliver('ball'); check('ball rescued', s.toys[4].rescued);
s = await hook('boat');
check('boat: caught while it drifts round the paddling pool', s.carrying === 'boat');
s = await deliver('boat'); check('boat rescued', s.toys[5].rescued);
s = await hook('doll', { center: [L.hammock.x, 0, L.hammock.z] });
check('doll: caught as the hammock swings through', s.carrying === 'doll');
await d.shot(join(out, 'gameplay.png'));
s = await deliver('doll'); check('doll rescued', s.toys[6].rescued);
await d.step(200);
s = await d.state();
check('all seven safe → free flight', s.free && s.rescued === 7);
console.log(`      (${f(await minutes())} game-minutes so far)`);

// ---- 5. garden
const P = s.plants;
s = await hook('bucket');
check('bucket hooks like a toy', s.carrying === 'bucket');
const fill = (spot) => hoverUntil(spot.x, spot.z, (q) => q.bucket.water >= 2.95);
const water = (i) => hoverUntil(P[i].x, P[i].z, (q) => q.plants[i].bloomed || q.bucket.water < 0.01, 7);
s = await fill(L.pond);
check('bucket fills in the pond', s.bucket.water >= 2.95);
for (let i = 0; i < 8; i++) {
  if ((await d.state()).bucket.water < 0.95) await fill(i < 2 ? L.pond : L.pool);
  s = await water(i);
  if (!s.plants[i].bloomed) { await fill(L.pool); s = await water(i); }
  if (i === 0) await d.shot(join(out, 'watering.png'));
}
await d.step(150);
s = await d.state();
check('whole garden watered: 8/8 in bloom', s.plants.every((q) => q.bloomed) && s.gardenDone > 0);
await d.releaseWinch(); await d.step(200);
console.log(`      (${f(await minutes())} game-minutes so far)`);

// ---- 6. apples and the picnic
await d.flyTo(L.apple.x, L.apple.z + 4, 1.5);
for (let i = 0; i < 12; i++) await d.step(60);
s = await d.state();
check('hovering by the apple tree shakes the apples down', s.apples.every((a) => a.state === 'ground'), `${s.apples.filter((a) => a.state === 'ground').length}/8 on the grass`);
await d.shot(join(out, 'apples.png'));
s = await hook('basket');
check('picnic basket hooks off the blanket', s.carrying === 'basket');
for (let k = 0; k < 10 && s.basket.held < 8; k++) {
  const a = s.apples.filter((q) => q.state === 'ground').sort((p, q) => Math.hypot(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]) - Math.hypot(q.pos[0] - s.pos[0], q.pos[2] - s.pos[2]))[0];
  if (!a) break;
  const before = s.basket.held;
  s = await hoverUntil(a.pos[0], a.pos[2], (q) => q.basket.held > before, 8);
  await d.step(30); s = await d.state();
}
check('basket scoops up all 8 apples', s.basket.held === 8, `${s.basket.held}/8`);
await d.flyTo(L.home.x, L.home.z, 1.2); await d.step(30); await d.releaseWinch();
s = await d.waitFor((q) => q.picnic, 9);
check('basket set down on the blanket → picnic', s.picnic);
console.log(`      (${f(await minutes())} game-minutes so far)`);

// ---- 7. golden acorns
for (const a of s.acorns) { if (!(await d.state()).acorns.find((q) => q.pos[0] === a.pos[0] && q.pos[2] === a.pos[2]).got) { await d.flyTo(a.pos[0], a.pos[2], 1.2); await d.step(20); } }
await d.step(60);
s = await d.state();
check('all 9 golden acorns found', s.acorns.every((a) => a.got), `${s.acorns.filter((a) => a.got).length}/9`);
check('paint jobs unlocked along the way; ends up gold', s.paint === 3);
console.log(`      (${f(await minutes())} game-minutes so far)`);

// ---- 8. sunset finale
s = await d.waitFor((q) => q.dusk > 0.95, 15);
check('everything done → the sun sets', s.finale === 'dusk' && s.dusk > 0.95);
await d.flyTo(L.pad.x, L.pad.z, 1.0); await d.step(10);
s = await d.waitFor((q) => q.finale === 'done', 12);
check('hover over the pad → helicopter lands itself, the end', s.finale === 'done' && !s.flying);
await d.step(90);
await d.shot(join(out, 'sunset.png'));
check('no script errors', d.errors.length === 0, d.errors.join(' | '));
console.log(`      (${f(await minutes())} game-minutes for the scripted run)`);

// ---- 9. progress survives closing the app
const bloomedBefore = (await d.state()).plants.map((p) => p.bloomed).join(); // plants slowly get thirsty again, so compare like for like
await d.page.reload(); await d.page.waitForFunction(() => window.__game);
s = await d.state();
const same = { rescues: s.rescued === 7 && s.free && s.toys.every((t) => t.state === 'home'), picnic: s.picnic && s.basket.held === 8, acorns: s.acorns.every((a) => a.got), paint: s.paint === 3, garden: s.gardenDone > 0 && s.plants.map((p) => p.bloomed).join() === bloomedBefore };
check('reopened: rescues, garden, picnic, acorns and paint are remembered', Object.values(same).every(Boolean), Object.entries(same).filter(([, v]) => !v).map(([k]) => 'lost ' + k).join(', '));
await d.page.goto(d.page.url().replace('manual', 'manual&fresh')); await d.page.waitForFunction(() => window.__game);
s = await d.state();
check('?fresh starts over', s.rescued === 0 && s.acorns.every((a) => !a.got));
await d.browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
