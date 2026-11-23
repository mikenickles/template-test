// Round 2 re-check: named views (DESIGN section 10) and HUD at 1280x720 and 1920x1080: weapon name and ammo over
// pale walls, damage numbers vs the crosshair and each other (element rectangles), hit vs kill marker, scope at fov 20.
const { open } = require('./visual_r2_lib.cjs');
const VIEWS = ['spawn_green', 'spawn_tan', 'bed_top', 'desk_top', 'shelf_top', 'floor_centre', 'under_bed', 'east_lane', 'west_lane'];
const rectsOf = (p) => p.evaluate(() => { const cx = innerWidth / 2, cy = innerHeight / 2;
  const nums = [...document.querySelectorAll('.dmg')].filter((d) => d.style.display === 'block').map((d) => { const b = d.getBoundingClientRect(); return { t: d.textContent, cls: d.className, r: [b.left, b.top, b.width, b.height].map(Math.round) }; });
  const hit = (a) => !(a[0] > cx + 12 || a[0] + a[2] < cx - 12 || a[1] > cy + 12 || a[1] + a[3] < cy - 12);
  let overl = 0; for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) { const a = nums[i].r, b = nums[j].r; if (!(a[0] >= b[0] + b[2] || b[0] >= a[0] + a[2] || a[1] >= b[1] + b[3] || b[1] >= a[1] + a[3])) overl++; }
  const minD = nums.length ? Math.min(...nums.map((n) => Math.hypot(Math.max(n.r[0] - cx, 0, cx - n.r[0] - n.r[2]), Math.max(n.r[1] - cy, 0, cy - n.r[1] - n.r[3])))) : null;
  return { n: nums.length, onCrosshair: nums.filter((n) => hit(n.r)).length, overlaps: overl, minDistToCentrePx: minD && Math.round(minD), nums: nums.map((n) => n.t + '@' + n.r.join(',')), hitm: document.getElementById('hitm').className + ':' + getComputedStyle(document.getElementById('hitm')).display }; });

async function hud(h, tag) {
  const p = h.page;
  const reset = () => p.evaluate(() => { __game.clearView(); __game.clearInput(); __game.resetTargets(); __game.give('ammo'); __game.give('grenade'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 20, Math.PI, 0); __game.step(1); });
  // pale backgrounds: the south wall behind the Tan fort from the bed top, the sunlit window, the pale shelf
  await reset();
  await p.evaluate(() => { __game.teleport(26, 18, 80, 0, 0); __game.lookAt(-2, 55, 80); __game.step(0.3); });
  await h.snap(`visual_re_hud_window_${tag}.png`);
  await p.evaluate(() => { __game.selectWeapon('sniper'); __game.teleport(108.6, 40, 22, 0, 0); __game.step(1); __game.lookAt(119, 52, 26); });
  await h.snap(`visual_re_hud_paleshelf_${tag}.png`);
  // SMG burst into the Green dummy at (60,0,50) from 8 units: numbers vs crosshair and each other
  await reset();
  await p.evaluate(() => { __game.selectWeapon('smg'); __game.teleport(60, 0, 42, Math.PI, 0); __game.step(1); __game.lookAt(60, 0.9, 50); __game.setInput({ fire: true }); __game.step(0.2); __game.render(); });
  const smg = await rectsOf(p); await h.snap(`visual_re_hud_numbers_${tag}.png`);
  await p.evaluate(() => { __game.clearInput(); __game.step(2); });
  // close range 3 units, numbers would sit right on the crosshair if not offset
  await p.evaluate(() => { __game.resetTargets(); __game.give('ammo'); __game.selectWeapon('rifle'); __game.teleport(60, 0, 47, Math.PI, 0); __game.step(1); __game.lookAt(60, 1.7, 50); __game.setInput({ fire: true }); __game.step(0.25); __game.render(); });
  const close = await rectsOf(p); await p.evaluate(() => { __game.clearInput(); __game.step(2); });
  // hit vs kill: rifle body tap, then sniper head shot scoped
  await reset();
  await p.evaluate(() => { __game.teleport(60, 0, 42, Math.PI, 0); __game.step(0.2); __game.lookAt(60, 0.9, 50); __game.fire(); __game.render(); });
  const hit = await rectsOf(p); await h.snap(`visual_re_hud_hit_${tag}.png`);
  await p.evaluate(() => { __game.step(1); __game.resetTargets(); __game.selectWeapon('sniper'); __game.step(1); __game.lookAt(60, 1.6, 50); __game.setInput({ scope: true }); __game.step(0.4); __game.lookAt(60, 1.6, 50); });
  const fov = await p.evaluate(() => __game.state().weapon.fov);
  await h.snap(`visual_re_hud_scope_${tag}.png`);
  await p.evaluate(() => { __game.fire(); __game.step(1 / 60); __game.render(); });
  const kill = await rectsOf(p); await h.snap(`visual_re_hud_kill_${tag}.png`);
  await p.evaluate(() => { __game.clearInput(); __game.step(2); });
  console.log(tag, 'smg burst 8u', JSON.stringify(smg)); console.log(tag, 'rifle burst 3u', JSON.stringify(close));
  console.log(tag, 'hit', JSON.stringify(hit)); console.log(tag, 'scope fov', fov, 'kill', JSON.stringify(kill));
}
(async () => {
  let h = await open({ width: 1280, height: 720 });
  for (const v of VIEWS) { await h.page.evaluate((v) => { __game.setView(v); __game.render(); }, v); await h.grab(`visual_re_view_${v}.png`); }
  console.log('views', JSON.stringify(await h.page.evaluate(() => ({ bed_top: __game.views.bed_top, desk_top: __game.views.desk_top, west_lane: __game.views.west_lane }))));
  await hud(h, '720'); console.log('errors 720', JSON.stringify(h.errors)); await h.browser.close();
  h = await open({ width: 1920, height: 1080 });
  await hud(h, '1080'); console.log('errors 1080', JSON.stringify(h.errors)); await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
