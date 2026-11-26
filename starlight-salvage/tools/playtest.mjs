// End-to-end check of the prototype at phone size with real two-finger touch:
// winch a panel, swing it, spacewalk for a coil inside the wreck, lean on the tether,
// dock, do the repair, then reload to check the save.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const out = join(root, 'media'); mkdirSync(out, { recursive: true });
let d = await launch({ scale: 2, query: 'manual&dpr=2&fresh' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (n) => n.toFixed(2);
const hd = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Line the hook up over item i, hold the button until it clicks on. Returns the state while still holding. */
async function hook(i) {
  const tgt = async () => (await d.state()).items[i].loop;
  let c = await tgt();
  await d.flyTo(c[0], c[2], 3);
  for (let k = 0; k < 80; k++) { c = await tgt(); const e = await d.hover(c[0], c[2], 3); if (e < 0.5) break; }
  await d.holdWinch();
  for (let k = 0; k < 400; k++) { c = await tgt(); await d.hover(c[0], c[2], 3); const q = await d.state(); if (q.carrying && q.winch === 'idle') break; }
  await d.release();
  return d.state();
}

let s = await d.state();
check('boots with 12 items and an empty hold', s.items.length === 12 && s.cargo.metal === 0 && s.tier === 1, `${s.items.length} items`);
await d.step(30); await d.shot(join(out, 'start.png'));

// --- ship flight: same handling as the helicopter
await d.stick(1, 0); await d.step(90); s = await d.state();
check('ship reaches cruising speed', s.vel[0] > 8.5, `vx=${f(s.vel[0])}`);
await d.release(); await d.step(120); s = await d.state();
check('ship brakes into a hover when the stick is released', Math.hypot(s.vel[0], s.vel[2]) < 0.6, `speed=${f(Math.hypot(s.vel[0], s.vel[2]))}`);

// --- winch: drop, attach, swing, reel in
s = await hook(0);
check('winch hook attaches to a hull panel', s.carrying === 'panel', `carrying=${s.carrying}`);
await d.shot(join(out, 'winch.png'));
await d.stick(1, 0); let swing = 0;
for (let k = 0; k < 30; k++) { await d.step(3); const q = await d.state(); swing = Math.max(swing, hd(q.bob, q.anchor)); }
await d.release();
check('the load swings behind the ship like a pendulum', swing > 0.4, `max offset=${f(swing)}`);
await d.releaseWinch();
s = await d.waitFor((q) => q.cargo.metal >= 2, 8);
check('letting go reels the panel into the hold', s.cargo.metal === 2 && s.items[0].state === 'gone', `metal=${s.cargo.metal}`);

// --- the wreck keeps the ship out
const L = await d.page.evaluate(() => window.__game.L);
await d.flyTo(L.wreck.x + 12, L.wreck.z + 1, 2);
await d.stick(-1, 0); await d.step(80); await d.release(); await d.step(90); s = await d.state();
check('ship is eased away from the wreck', hd(s.ship, [L.wreck.x, 0, L.wreck.z]) > L.wreck.r - 0.6, `dist=${f(hd(s.ship, [L.wreck.x, 0, L.wreck.z]))}`);

// --- spacewalk
await d.tap('#eva'); await d.step(40); s = await d.state();
check('EVA button puts the astronaut outside', s.mode === 'eva');
const GIVES = { gear: 'metal', coil: 'wire', cell: 'power' };
const coil = s.items.map((it, i) => ({ i, d: it.small && it.state === 'loose' ? hd(it.pos, s.ship) : 1e9 })).sort((a, b) => a.d - b.d)[0].i;
const mat = GIVES[s.items[coil].kind], before = s.cargo[mat]; let c = s.items[coil].pos;
console.log(`      nearest small item: ${s.items[coil].kind}, ${f(hd(c, s.ship))} from the ship`);
await d.stick(-1, 0); await d.step(30); s = await d.state();
const evaSpeedEarly = Math.hypot(s.vel[0], s.vel[2]);
check('spacewalk is slower and floatier than the ship', evaSpeedEarly < 3.5, `speed after 0.5s=${f(evaSpeedEarly)}`);
await d.flyTo(c[0], c[2], 1.2, 20); await d.step(20);
await d.shot(join(out, 'eva.png'));
await d.tapWinch(); await d.step(20); s = await d.state();
check('hand grapple picks up a small item', s.evaHeld === 1 && s.items[coil].state === 'held', `held=${s.evaHeld}`);
// lean on the tether: push straight away from the ship for a while
let away = [s.pos[0] - s.ship[0], s.pos[2] - s.ship[2]]; let al = Math.hypot(...away); away = [away[0] / al, away[1] / al];
let maxD = 0;
for (let k = 0; k < 60; k++) { await d.stick(away[0], away[1]); await d.step(10); const q = await d.state(); maxD = Math.max(maxD, hd(q.pos, q.ship)); if (q.mode !== 'eva') break; }
s = await d.state();
check('tether is soft: you can stretch past the radius', maxD > s.tetherR + 0.3, `max=${f(maxD)} radius=${s.tetherR}`);
check('...but not far', maxD < s.tetherR + 5, `max=${f(maxD)}`);
await d.shot(join(out, 'tether.png'));
await d.release(); await d.step(360); s = await d.state();
check('letting go, the tether brings you back inside', hd(s.pos, s.ship) < s.tetherR + 0.3 && s.mode === 'eva', `dist=${f(hd(s.pos, s.ship))}`);
await d.tap('#eva');
s = await d.waitFor((q) => q.mode === 'ship' && q.cargo[mat] > before, 25);
check('returning to the airlock docks and stows what you carried', s.mode === 'ship' && s.cargo[mat] === before + 1, `mode=${s.mode} ${mat}=${s.cargo[mat]}`);
await d.page.evaluate(() => window.__game.give({ wire: 1 }));

// --- repair
s = await hook(3); await d.releaseWinch();
const m0 = (await d.state()).cargo.metal;
s = await d.waitFor((q) => q.cargo.metal >= m0 + 4, 8);
check('fuel tank is worth 4 metal', s.cargo.metal === m0 + 4, `metal=${s.cargo.metal}`);
await d.tap('#shopBtn'); await d.step(30); s = await d.state(); const base = s.cargo;
check('workshop opens at the ship', s.shop);
await d.shot(join(out, 'workshop.png'));
await d.tap('#shop [data-act="repair"]'); await d.step(30); s = await d.state();
check('repair spends salvage and unlocks the scanner', s.repairs.scanner === true && s.scanner && s.cargo.metal === base.metal - 4 && s.cargo.wire === base.wire - 1, JSON.stringify(s.cargo));
await d.tap('#shop [data-act="close"]'); await d.step(60);
await d.shot(join(out, 'scanner.png'));

// --- tether tier 2 is pure data: give the salvage and install it
await d.page.evaluate(() => window.__game.give({ metal: 8, wire: 2, power: 1 }));
await d.tap('#shopBtn'); await d.step(20); await d.tap('#shop [data-act="tier"]'); await d.step(20); s = await d.state();
check('tether upgrade installs from the workshop', s.tier === 2 && s.tetherR === 15, `tier=${s.tier} r=${s.tetherR}`);

// --- save and load
const errors1 = d.errors.slice();
const saved = await d.page.evaluate(() => localStorage.getItem('starlight-salvage-v1'));
await d.page.goto(d.page.url().replace('&fresh', '')); await d.page.waitForFunction(() => window.__game);
s = await d.state();
check('progress survives a reload', s.tier === 2 && s.repairs.scanner === true && s.cargo.metal === 2 && s.cargo.wire === 0, saved);
check('no console errors', errors1.length === 0 && d.errors.length === 0, [...errors1, ...d.errors].join(' | '));
const info = await d.page.evaluate(() => window.__game.info());
console.log('render:', JSON.stringify(info));
await d.browser.close();
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
