# Round 2 (gunplay)

**Nothing blocks the feel gate: all four guns fire, reload and hit exactly to the numbers in DESIGN 12 and 15.1.**
Findings: 0 blocker, 2 major, 4 minor. Both majors are exploits (a grenade through walls, a sniper that skips its bolt),
not broken guns. The Round 1 gate still passes: all 18 routes, up and down, walk and sprint.

Build tested: `index.html` 136,532 bytes, unchanged during testing. Console errors and warnings in every run: none,
including real-time heavy firing after a real click and five ways of breaking audio.

## Findings

### R2-1. MAJOR: a grenade thrown while pressed against anything starts inside it and flies through

The grenade is created 0.54 units in front of the eye; the player stops 0.4 from a wall. A ray that starts inside
a solid does not hit that solid, so the grenade carries on out the far side.

```js
// out of the room
__game.give('grenade'); __game.teleport(119.6, 0, 80.5, -Math.PI / 2, 0); __game.step(0.3);
__game.setInput({ grenade: true }); __game.step(0.1); __game.setInput({ grenade: false }); __game.step(1 / 60);
__game.grenades[0]   // x 120.4: inside the east wall. 0.5 s later (129.4, -1.6, 80.7), bursts at (156, -43, 81)

// through cover: crouched against the outside of the Tan fort front wall (z 134..135.5), dummy 21 is behind it
__game.teleport(66, 0, 133.6, 0, 0); __game.setInput({ crouch: true }); __game.step(0.5); __game.look(Math.PI, -0.2);
__game.setInput({ crouch: true, grenade: true }); __game.step(0.1); __game.setInput({ crouch: true, grenade: false }); __game.step(2.1);
// grenade starts at z 134.38 (inside the low wall), bursts at z 142.0 inside the fort: target.21 takes 29.75
// control, same throw from z 132.9: starts at z 133.68, bounces back off the wall, bursts at z 130.3, 0 damage
```

- Also reproduced through: north wall, room corner, tunnel wall (1 thick), bed leg, desk leg, shelf post, stair guard,
  alphabet block W-c, the ball. 9 of the 20 pressed-against cases in `bug_r2_04_grenade.cjs` section B pass through.
- In random play (`bug_r2_07_fuzz_regress.cjs`, 3 seeds, 10,771 throws): 37 grenades left the room, and about 1.7 %
  of throws were born inside a solid. Once a grenade starts in free space it never entered a solid (0 in 10,771 plus
  2,700 targeted throws), so the bounce code itself is sound.
- Expected: blocked by the wall in front of you. Sweeping from the eye to the start point, and starting at the hit
  if there is one, would close it. Scripts: `bug_r2_04_grenade.cjs`, `bug_r2_08_grenade_wall.cjs`.

### R2-2. MAJOR: switching weapons skips the sniper's bolt cycle

```js
__game.selectWeapon('sniper'); __game.step(1.5); __game.fire();
__game.selectWeapon('pistol'); __game.selectWeapon('sniper');      // keys 2 then 5, or two wheel notches
// press fire every other tick: the next shot comes 0.70 s after the first, then every 0.70 s
```

- Expected (15.1): "After each shot the bolt cycles for 1.3 s". Actual: the switch clears the cooldown and only the
  0.7 s draw remains, so the sniper fires 86 rpm instead of 46.
- Same mechanism on the pistol and rifle, where it is slower than firing normally (0.27 s and 0.47 s), so only the
  sniper gains. Script: `bug_r2_02_falloff_state.cjs` (QUICK-SWITCH rows).

### R2-3. MINOR: the grenade is not thrown 10 degrees above the view

`teleport(60, 0, 100, 0, pitch)`, hold and release G, read the first-tick velocity: launch angle equals the view pitch
exactly at 0, +22.9 and -22.9 degrees; speed 18 is right. DESIGN 15.1 says "view direction plus 10 degrees up".
From reading the code, the raised direction and the plain view direction share one scratch object, so the second
overwrites the first. The arc preview uses the same function, so preview and throw agree with each other.
Script: `bug_r2_08_grenade_wall.cjs`.

### R2-4. MINOR: the new desk apron (carry-over 8) blocks the desk-side third of each ruler

The apron fixes Round 1 finding 12 (all three repros now end on the desk, no damage). But starting up either ruler:

| Start x (ruler is 92.5 to 95.5) | Round 1 | Now |
| --- | --- | --- |
| 94.0 to 95.0 | top | top |
| 95.1 to 95.5 | pushed to 94.6, top | dead stop at the ruler foot, head-on against the apron's end |
| 95.6 to 96.0 | pushed to 94.6, top | slid along the outside of the apron and off the north edge of the seat, 35 hp |

Repro: `teleport(95.3, 17, 78, 0, 0); setInput({forward:true}); step(4)` stops at (95.3, 17, 75.4);
`teleport(95.8, 17, 78, 0, 0)` ends on the floor with a 17-unit fall. Same on ruler south. Walk and sprint alike.
Script: `bug_r2_07_fuzz_regress.cjs` (apron lanes), `bug_03_routes_manual.cjs`.

### R2-5. MINOR (design question): a scoped sniper barely cares about moving or jumping

Scoped spread is 0.05 degrees and the stance multipliers scale that: 0.075 moving, 0.15 airborne (measured from
`state().weapon.spread` and from 200 shots at the far wall). Unscoped it is 3.0, 4.5 and 9.0. So a scoped jump shot is
20 times tighter than an unscoped standing one. To the letter of 15.1, but probably not the intent.

### R2-6. MINOR: R pressed during a weapon draw is ignored

`selectWeapon('rifle')` with a part-used magazine, tap `reload` for 0.1 s inside the 0.45 s draw: no reload starts
afterwards. A fire press in the last 0.15 s of the draw is buffered and fires, so the two keys behave differently.

## What was checked and matched

| Area | Result |
| --- | --- |
| Hook (15.4) | All nine new members present. `fire()` returns the shot record or null, `raycast` normalises its direction and returns null for a zero vector, `shotLog` and `audioLog` cap at 200, `give` handles `grenade`, `ammo`, `health` and returns false otherwise, `resetTargets()` clears down timers |
| Fire rate | Rifle 6 ticks (600 rpm), SMG 4 ticks (900 rpm), sniper 78 ticks (1.3 s), pistol 11 ticks (0.183 s) |
| Magazine / reserve | 30/90, 40/120, 5/15, 12/36. Reload takes what the magazine needs from the reserve. Never negative or over capacity in 240,000 ticks of random abuse plus 2 million fuzz ticks |
| Reload time | 2.2, 2.0, 3.0, 1.4 s (measured to the tick). R on a full magazine does nothing. Reload cancels on switch and does not resume; the magazine keeps its count |
| Empty | Fire press on empty: dry click and auto-reload. Holding fire through empty on an automatic does nothing until the next press. With no reserve: dry click on every press, no reload |
| Damage and falloff | Exact at 15 distances from 5 to 136 units for all four guns (e.g. rifle 18.2 at 120+, SMG 7.2 from 70, pistol 21 from 90, sniper 90 everywhere). Headshots exactly x2 |
| Spread | Base 0.5 / 1.4 / 3.0 (0.05 scoped) / 0.35; crouch x0.6, moving x1.5, sprint x2.5, air x3.0; bloom per shot and caps as specified; measured cones never exceed the reported value |
| Recoil | Kick up 0.9 / 0.55 / 3.5 / 1.4 degrees, side within the table's range, 60 % returned at exactly 0.25 s |
| Draw | First shot at 0.467, 0.367, 0.700, 0.267 s after the switch (one tick over the table) |
| Blocked | No shot while sprinting, on a string, drawing, reloading or aiming a grenade. Shift held while standing still does not block |
| Sniper | Scoped at 0.2 s, fov 25, overlay shown and crosshair hidden; scope drops on the shot and is back 0.7 s later; mouse sensitivity scoped is one third of unscoped |
| State abuse | Fire + reload + scope + grenade on one tick, switch mid-bolt / mid-reload / mid-draw, scope while reloading (refused), jumping, falling, climbing (refused), through death and respawn, 60 wheel notches, fire held through three switches, grenade held through death (not thrown, count back to 1): no bad state |
| Hitscan | 5,584 random rays against my own ray march: 0 shots through a solid. 1,910 rays aimed at every collider from each side: agree (59 differ only because my origin sat exactly on a neighbouring face). Bed, desk top, shelf boards, floors, walls, window, stair guards, ruler props, apron, slabs, cylinders and the pad all stop bullets. Slit, gate, door gap, chair-back gap, crenels and over the parapet let them through. Crouched behind the slit you hit the low wall |
| Dummy zones | Head and body correct from the front, sides, back, straight above, 45 degrees above and below; y 1.35 is body; just over the head misses |
| Grenade | Fuse 2.000 s in 2,700 of 2,700 throws, also after holding 4 s. Speed 18, restitution 0.454. One per life; `give` restocks to 1, never 2. Blast damage matches 110 x (1 - d / 7) to the cent at 7 distances; 0 disagreements with my own line-of-sight test in 2,700 bursts. Blocked by the bed, the tunnel roof, the truck and a ruin brick; through the slit it is not. At your own feet: 96.5 hp |
| Dummies | 21 at the DESIGN positions, none floating or inside a solid, Green north and Tan south. Each: 4 pistol shots 100 > 70 > 40 > 10 > 0, down, shots pass through while down, up at 100 hp after 3.0 s. Partial damage persists. Damage number and hit marker appear |
| Real input | Left mouse (auto and semi), right mouse (scope, sniper only), wheel, R, G hold and release, 1 to 5, Esc while firing, resume click: all work. Neither the start click nor the resume click fires a shot. G key auto-repeat does not throw early |
| Audio | All 24 sounds in 15.2 are logged at the right moments. No errors with `AudioContext` missing, throwing, stuck suspended, or failing mid-game; `audioLog` fills either way |
| Regression | `walkPath` all routes and 34 chained journeys ok; raw-input gate 82 of 82 legs ok; collision sweep 20,928 runs clean; fuzz while firing and throwing, 3 seeds, 2.0 million ticks, 67,615 shots: player never out of the room, 0 rescues, 0 NaN |

## Carry-overs (15.5)

| # | Result |
| --- | --- |
| 1 Trim 0.3 | Fixed: pressed against a wall and in a corner the skirting stays drawn (`screenshots/round2/bug_r2_skirting_*.png`) |
| 2 Counters | Fixed: 10 to 12 draw calls and about 26,000 triangles reported at the spawn (was 3 and 9,990) |
| 3 `stepSmooth` | 9 |
| 4 Views | `west_lane` eye (42, 1.6, 24), `desk_top` eye (97.5, 27.6, 66); neither eye is inside a solid. Nearest thing along `west_lane` is block W-a at 8 units |
| 5 Crayons | At `55.7..57, 29..38` and `63..64.3, 29..38`, mirrored. No crayon is the first thing seen from any slit |
| 6 Bed colours | Top blue, sides and pillows pale, underside dark (`bug_r2_view_desk_top.png`, `bug_r2_bed_from_floor.png`). Exact hex is the visual tester's call |
| 7 Bear | Head at `6..14, 39..45`. Walking off the bed above it lands at 15, 9, 0 with no damage |
| 8 Desk apron | Built to DESIGN; finding 12 fixed; see R2-4 for the side effect |
| 9 String grab speed | Grabbed at 8.8 and 10.6 u/s, refused from 2 units above the top onward (over 12 u/s) |
| 10 `walkPath` one-way | Both backward calls return `ok: false` with a clear error and do not move the player; forward still works |

## Notes

- `state().weapon.fov` only changes after a `render()`; `scoped` and `spread` are right immediately.
- `raycast()` from a point exactly on or inside a solid ignores that solid. Bullets start at the eye, which is never
  there; the grenade is (R2-1).
- A knocked-down dummy has no hit volume at all, where it stood or where it lies.
- Emptying a rifle magazine while looking straight up ends 1.35 degrees lower than it started: the kick is clamped
  at the pitch limit but its 60 % return still applies.
- Deferred Round 1 findings 4 and 9 were not re-run this round; finding 6 (tunnel_drop at crouch speed) was, and is unchanged.

## Scripts

`tests/bug_r2_01_hook_weapons.cjs`, `bug_r2_02_falloff_state.cjs`, `bug_r2_03_hitscan.cjs`, `bug_r2_04_grenade.cjs`,
`bug_r2_05_dummies_carryovers.cjs`, `bug_r2_06_input_audio.cjs`, `bug_r2_07_fuzz_regress.cjs`,
`bug_r2_08_grenade_wall.cjs`, helper `bug_r2_lib.cjs`. Every loop has a tick limit. The Round 1 scripts were re-run
unchanged apart from `bug_12_design_match.cjs`, which now carries the 15.5 geometry (0 mismatches).

## Round 2 re-check

**Nothing blocks the feel gate: every gun fires, reloads and hits to the 15.6 numbers, and the grenade bursts for 140.**
Findings: 0 blocker, 0 major, 3 minor (R2-7 to R2-9; small, none in gunplay). All six first-pass findings are fixed.

Build tested: `index.html` 146,098 bytes (commit 3585064), unchanged during testing. Console errors and warnings:
none in any run, including five ways of breaking audio. The checks for R2-1 to R2-4 were also run on the first-pass
build (136,532 bytes, commit 3e65f0c), where they fail, so the scripts are known to catch the old bugs.

### Earlier findings

| # | Status | Evidence |
| --- | --- | --- |
| R2-1 grenade starts inside what you press against | **Fixed** | 35 pressed-against cases (all four walls, four room corners, floor standing and crouched, ceiling with the head at y 90, fort walls high and low, tunnel wall, bed/desk legs, parapet, stair guard, under the skateboard, bed and desk, ball, shelf post, W-c, chair back, apron): none starts in a solid, none leaves the room. Every box face in the room (313 boxes, 3,880 throws, player walked into the face first, 5 pitches): 0 born inside, 0 entered a solid, 0 left the room (first-pass build: 2,518 born inside, 16 left). Random throws, 4 seeds, 10,343 throws, half after walking into something, a fifth at steep pitch, moving, jumping and crouched: 0 born inside, 0 entered, 0 left, fuse 2.000 s every time, 0 blast results that disagree with my own line of sight. A live grenade moved outside the room box on any side is gone on the next tick with no burst; one moved to a point inside stays |
| R2-2 switching skips the sniper bolt | **Fixed** | Shot, switch away and back, then press fire every other tick; 83 trials: hook `selectWeapon`, keys 2>1, keys 3>5, key 5 again, wheel two notches (real wheel, pointer locked), grenade hold and throw (hook and real G key), 20 switches in 0.33 s, away for 0.05 to 2 s, switch at 0 to 1.6 s after the shot. Every next shot is at max(shot + 1.3, back + 0.7 draw), equal to the no-switch control to the tick. Mid-reload switch (4 cases): reload cancelled, magazine kept, bolt still respected. First-pass build in the same script: 17 failures, next shot 0.73 s after the first |
| R2-3 throw not 10 degrees above the view | **Fixed** | Launch angle = view + 10.00 degrees at -80, -45, -22.9, -10, 0, 10, 22.9, 45, 70; at 80 it is 88.8 (straight up caps it). Speed 18.000 |
| R2-4 apron blocks the desk-side third of each ruler | **Fixed** | Both rulers, walk and sprint, start x 91.6 to 96.4 in 0.1 steps, then turn onto the desk: x 92.2 to 95.4 all reach the ruler top and stand on the desk at y 26 with no damage. x 95.5 to 96.0 stop against the apron end without falling (first-pass build: 95.1 to 95.5 stopped, 95.6 to 96.0 fell). x 91.6 to 92.1 go down the skateboard or chair stairs beside the prop, no damage. Round 1 finding 12's three repros still end on the desk with no damage. See R2-7 for the angled case |
| R2-5 scoped sniper ignores moving and jumping | **Fixed** | Scoped spread 0.05 still, 0.05 crouched, 1.5 walking, strafing and crouch-walking, 4.0 airborne. Measured cones (150 shots each at the west wall from L3): 0.0 / 1.50 / 3.96 degrees |
| R2-6 R ignored during a draw | **Fixed** | All four guns, R by 1-tick input and by `reload()`, at 0 / 25 / 50 / 75 / 95 % of the draw: the reload starts on the tick the draw ends (0.467 / 0.367 / 0.700 / 0.267 s). R during a draw with a full magazine does nothing; R then a switch to another gun inside the draw reloads nothing |

### Changed numbers (DESIGN 12, 15.6)

| Check | Result |
| --- | --- |
| Damage and falloff | Real shots at 13 ranges from 5 to 136 units, crouched, on clear lines found with `raycast`: every hit matches to the cent. Rifle 26, 70 % at 120+. SMG 20, full to 25, 18.72 at 30.2, 13.9 at 50, 9.0 from 70. Pistol 30, full to 30, 26.27 at 40, 15.0 from 70. Sniper 90 everywhere. Head x2 |
| Spread by stance (reported) | Rifle 0.5 / crouch 0.3 / walk and strafe 0.75 / sprint 1.25 / air 1.5. SMG 1.0 / 0.6 / **1.15** / 2.5 / 3.0. Pistol 0.6 / 0.36 / 0.9 / 1.5 / 1.8. Sniper 3.0 / 1.8 / 4.5 / 7.5 / 9.0. Only the SMG uses 1.15 for moving. Crouch and moving multiply (rifle 0.45, SMG 0.69) |
| Measured cones | 150 shots each; the widest shot is within the reported spread to my measuring error (0.015 degrees): rifle 0.49, SMG 1.005 still and 1.14 strafing, pistol 0.60 and 0.91, sniper 2.99 |
| Bloom | SMG +0.20 per shot, capped at 3.5 on shot 13; rifle +0.35, cap 3.0; pistol +0.6 per shot, and clicking as fast as it fires reaches only 1.8 by shot 10. Recovery waits 0.12 s on the SMG and pistol, 0.16 s on the rifle |
| Recoil return | One shot of each gun: 80 % of the kick is back at 0.25 s and the rest stays (rifle 0.18, SMG 0.11, pistol 0.28, sniper 0.70 degrees left over). Ten paced rifle taps leave the view 1.8 degrees higher, which is what 0.8 means; feel tester's call |
| Scope | fov 47.5 at 0.1 s, 20 at 0.25 s, 75 on release. Scoping a pistol does nothing |
| Grenade damage | 140 x (1 - d / 7) at 7 distances from 1.0 to 3.6 units to the dummy's chest (119.6, 117.9, 93.7, 91.4, 76.4, 76.0, 68.2); a burst within 2.0 of the chest kills a full-health dummy. Cover: the Tan front wall, the truck, the bed (burst underneath, dummy on top) and the tunnel roof all block; inside the fort and on the bed beside the dummy it hits; every cover result agrees with my own line of sight |

### New rules (15.6)

- Held fire through empty, rifle and SMG with reserve: the last round, then one dry click one interval later, the reload
  starts on that tick with no new press, and with fire still held it fires again the tick the reload ends. With zero
  reserve: one dry click in 4.5 s of holding, no reload, nothing repeats; a fresh press gives one more dry click.
  The pistol and sniper fire once per press as before. Random abuse: at most 1 dry click in any second.
- R buffered during a draw: see R2-6.
- A grenade outside the room box is removed: see R2-1.

### State machine

- Five actions (fire, reload, switch, scope, grenade press or release, through both the hook and input) in every order,
  on one tick and on consecutive ticks, from each of four guns: 2,880 combinations. No ammo below 0 or over capacity,
  no scope on a non-sniper or while reloading, never more than one held grenade, and the gun fires again afterwards
  every time.
- Death in the middle of a reload, a draw, a scoped bolt, a grenade aim, held fire on an empty SMG, a buffered R and with
  a live grenade at the feet: respawn at (60, 0, 20) with full ammo, no reload or draw carried over, grenade count 1,
  and the gun fires afterwards. With scope still held after respawn the sniper scopes again, which is right.
- Scope state after a switch mid-bolt: drops on the switch, the pistol never scopes, back on the sniper it stays down
  through the 0.7 s draw and comes back 0.2 s later if right mouse is still held.
- 150,000 ticks of random abuse: no invariant broken.

### Hitscan and regression

- Hitscan: 5,584 random rays against my own ray march, 0 through a solid (same two "stopped in thin air" rays on the
  first-pass build, at the tall landing and the bucket, where my march grid is coarse). 1,910 rays aimed at every
  collider: same 59 face-touching disagreements as before. Slit, gate, door gap, chair-back gap, crenels still pass shots.
- Routes: `validateWaypoints()` returns `[]`. All 18 routes in `__game.routes`, up and down, walk and sprint, through
  `walkPath` with my own end check (within 0.8 and 0.35 of the last node, on the ground, no damage, no rescue): 68 of
  68 legs ok, and the two one-way routes (`bed_spring`, `tunnel_drop`) refuse to be driven down. The raw-input gate
  (`bug_04_gate_manual.cjs`) is 82 of 82, including both one-way routes walked down by hand. `bug_03_routes_manual.cjs`
  flags 54 of 443 lanes against 62 on the first-pass build; the differences are the eight ruler lanes R2-4 fixed (two
  other rows only changed from stuck to timeout or back).
- Fuzz with movement, firing, scoping, switching and throwing: 7 seeds, 5.7 million ticks, 30,474 grenades. Player never
  out of the room, 0 rescues, 0 NaN, ammo always in range, no grenade outside the room, born in or entering a solid.
  Four of the seven seeds showed one tick with the head inside the desk top: new finding R2-9.
- Real input (mouse buttons, wheel, R, G, 1 to 5, Esc, resume) and the 24 sounds in 15.2: all as in the first pass.

### New findings

#### R2-7. MINOR: angled into the apron's end from the ruler's desk side, you slide off the seat (35 hp)

```js
__game.teleport(95.3, 17, 78, -8 * Math.PI / 180, 0); __game.step(0.2);   // on the seat, inside the ruler lane, 8 deg toward the desk
__game.setInput({ forward: true }); __game.step(4);
// slides east along the south end of desk.apron.n (z 75.4, x 95.5 -> 96.4), off the seat's east edge: floor, damageLog [35]
```

- Starting x 95.1 to 95.4 (inside the ruler footprint) at 8 degrees toward the desk falls; at 2 degrees only x 95.4
  falls, at 12 degrees x 94.9 and up. Same on ruler south (mirrored), walk and sprint.
- Lanes starting x 96.1 to 96.4 (centre already past the seat edge at x 96) fall straight ahead.
- Not new: on the first-pass build the same 8-degree run fell from x 94.6 up; moving the apron narrowed it.
  The seat's east edge is an open drop anyway (`teleport(90, 17, 80, -Math.PI / 2, 0)` and walk east: 35 hp), but here
  the apron's end steers a player who aimed at the ruler into it.
- Expected (lead's brief): beside the rulers you may stop against the apron but must not fall. Closing the seat's east
  edge beside the apron's end, like the two seat stoppers, would do it.
  Script: `tests/bug_r2b_03_ruler_lanes.cjs`.

#### R2-8. MINOR: a grenade thrown down beside an overhang edge can cut through the edge by about 0.1

```js
__game.give('grenade'); __game.teleport(55.935, 0, 75.218, 3.045, 0); __game.step(0.3); __game.look(3.045, -0.53);
__game.setInput({ grenade: true }); __game.step(0.1); __game.setInput({ grenade: false }); __game.step(1 / 60);
__game.grenades[0]   // starts at (55.667, 1.087, 75.908): below ruin.brick.1 (55.7..58.1, y 1.2..2.4, z 75.7..76.9)
```

- The eye (55.935, 1.6, 75.218) is outside the brick, the start point is outside it, but the straight line between them
  passes through the brick's lower near corner (my march enters it at 0.63 of the way). The same in 28 of 3,880
  face throws, all looking 34 degrees down while level with the bottom edge of the bed slab, desk top, chair seat,
  chair back or apron (for example falling past the bed side at `teleport(35.45, 6, 80, Math.PI / 2, 0)`, walk 0.25 s,
  `look(Math.PI / 2, -0.6)`, hold G 3 ticks: the grenade starts under the bed slab), and 1 of 10,343 random throws.
- Never starts inside a solid and never leaves the room, so it cannot reach anything a player could not. 15.6 says it
  is "swept to its release point; if anything is in the way it starts at the contact point". Script:
  `tests/bug_r2b_01_grenade.cjs` (section C prints each case).

#### R2-9. MINOR (cosmetic): sprint-jumping up a ruler beside the apron puts the head 7.6 cm into the desk top for one tick

```js
__game.teleport(95.1, 17, 78, 0, 0); __game.step(0.2);
// hold forward + sprint, jump held 2 ticks in every 20, for 5 s: one tick on the ruler at (95.1, 22.776, 67.94), head at
// 24.576 while the capsule still overlaps the desk top (x >= 95, underside 24.5); the next tick it is pushed to x 94.6
```

- 1 tick per run at x 95.1 to 95.45 on both rulers, sprint plus jump (once walking with jumps at x 95.45, 1.2 cm). The
  eye is 0.2 lower, so the camera never enters. New: the first-pass apron (x 95 to 95.5) kept you at x 94.6 there.
  Seen four times in 5.7 million fuzz ticks. Script: `node tests/bug_r2b_06_apron_drop.cjs head`.

### Scripts

`tests/bug_r2b_01_grenade.cjs` (launch angle, pressed cases, every box face, random throws, removal, damage and
cover; `node bug_r2b_01_grenade.cjs <seed> <throws> <sections>`), `bug_r2b_02_sniper_bolt.cjs`,
`bug_r2b_03_ruler_lanes.cjs`, `bug_r2b_04_numbers.cjs`, `bug_r2b_05_rules_state.cjs`, `bug_r2b_06_apron_drop.cjs`,
`bug_r2b_07_regress.cjs`. Re-run unchanged: `bug_02`, `bug_03`, `bug_04`, `bug_r2_03`, `bug_r2_05`, `bug_r2_06`,
`bug_r2_07` (seeds 21 to 23). `bug_r2_04` and `bug_r2_08` still expect the old numbers (110 damage, no 10 degrees) and
are replaced by `bug_r2b_01`. Every loop has a tick limit.

---

# BUGS.md: round 1 (graybox)

**Gate: PASS, with two route defects to fix.** I reached the bed top (y 18), the desk top (y 26) and the top
shelf (tall shelf L3, y 60) by every route in DESIGN 4.4, up and down, walking and sprinting, both through
`walkPath` and with raw `setInput` + `step` + `lookAt`, with the end position and height checked by my own
code, and never got stuck when driving down the middle of a route. The pass is narrower than it sounds: on
the six shelf strings holding W leaves you hanging at the top instead of standing on the shelf (finding 1),
and the shelf-side edge of both shelf stairs is a dead stop (finding 2). Neither stopped me finishing a
route, both will catch players.

Build tested: `index.html` 80,336 bytes, unchanged during testing. Console errors and warnings in every run: none.

Findings: 0 blocker, 2 major, 9 minor.

## Routes as measured

"walkPath" is `__game.walkPath(__game.routes[id], {sprint})` from a teleport to the first node; times are walk / sprint.
"Raw input" is my own driver (`tests/bug_04_gate_manual.cjs`): `lookAt` a target, `setInput({forward})`, `step(1/60)`,
with my own targets from DESIGN geometry. "Lanes" are straight runs with a fixed yaw and W held, spread across the
full width of the ramp or stair including the overhang at both edges (`tests/bug_03_routes_manual.cjs`), walk and sprint.
All "down" results had 0 damage unless stated.

| Route | Up, walkPath | Up, raw input | Up, lanes reaching the top | Down |
| --- | --- | --- | --- | --- |
| bed_blanket | ok, 12.1 s / 8.7 s, ends (26, 18, 67.9) | ok | 18 of 18 | ok both ways of driving; lanes 14 of 14 |
| bed_books | ok, 9.3 s / 6.7 s, ends (17.6, 18, 113.5) | ok | 18 of 18 | ok; lanes 14 of 14 |
| bed_spring | ok, 4.1 s / 3.6 s, ends (27.2, 18, 80) | ok | 36 of 36 pad approaches (7 directions, 4 edges, a corner, from under the bed, jump onto it, crouch onto it, 8 key sets held in flight). Lands x 29.6 to 30.7, never short | one way. Stepping off the bed's east edge costs 40 hp (matches CONFIG) |
| desk_skate | ok, 13.5 s / 9.8 s, ends (97.5, 26, 80) | ok | skateboard 12 of 18: x 85.7 and 86.05 stop at the chair-back post (a real wall), x 92.3 dead-stops under the ruler (finding 2). Ruler north 20 of 20 | ok; skateboard 12 of 12, ruler 10 of 10 |
| desk_stairs | ok, 13.5 s / 9.8 s | ok | chair stairs 14 of 18: x 85.7 and 86.05 stop at the chair-back post. Ruler south 20 of 20 | ok; 12 of 12, 10 of 10 |
| desk_yoyo | ok, 9.7 s / 9.1 s, ends (107, 26, 57.3) | ok | grabbed and topped out from all 8 approach directions, walk and sprint | ok: grab from the desk top, S for 7.43 s, stand at (107, 0, 54.5) |
| desk_lace | ok, 9.7 s / 9.1 s | ok | same, 16 of 16 | ok, same |
| tall_stairs | ok, 8.6 s / 6.2 s, ends (110.3, 20, 120) | ok | 14 of 20: x 107.7, 107.95, 108.3 dead-stop at y 17.06 (finding 2) | ok; lanes 12 of 14 (the x 107.95 lane rides the L1 rim into string L2_a and climbs, as designed) |
| tall_bridge | ok, 4.25 s / 3.07 s | ok | 14 of 14 | ok, 14 of 14 |
| tall_L2_a, tall_L2_b | ok, 6.57 s / 6.37 s, ends (110.3, 40, z) | ok only because my driver releases W and turns east at the top. W held: left hanging (finding 1) | 6 of 6 approaches reach the top placement (108.6, 40, z) | ok: S for 5.72 s, placed at (108.6, 20, z) |
| tall_L3_a, tall_L3_b | ok, 6.57 s / 6.37 s, ends (110.3, 60, z) | same as above | 6 of 6 | ok: placed at (108.6, 40, z) |
| small_stairs | ok, 8.6 s / 6.2 s | ok | 14 of 20, same three lanes dead-stop (finding 2) | ok; 12 of 14, same note |
| small_bridge | ok, 4.25 s / 3.07 s | ok | 14 of 14 | ok, 14 of 14 |
| small_L2_a, small_L2_b | ok, 6.57 s / 6.37 s | same as the tall strings | 6 of 6 | ok |
| tunnel_drop | ok, 4.0 s / 2.9 s, ends (77.1, 8, 80) | ok | walk 7 of 7, sprint 7 of 7, crouch-walk 0 of 7 (finding 6) | one way. Stepping off the roof (8) costs 0 hp |

Whole climbs from the Green spawn with no teleport, raw input: bed via blanket 20.0 s; desk via skateboard 22.3 s;
top shelf via yo-yo, desk, tall_bridge, L2_a, L3_a and then all the way back down by strings and stairs 82.7 s;
top shelf via tall_stairs, L2_b, L3_b 58.8 s. All ended on the right surface at the right height with 0 damage.
The same journeys through `walkPath` chained over the waypoint graph (17 journeys, walk and sprint): all ok.

## Findings

### 1. MAJOR: on every shelf string, holding W leaves you hanging at the top, not standing on the shelf

Repro (tall_L2_a; identical on tall_L3_a at `(110.5, 40, 136)` and small_L2_a at `(110.5, 20, 30)`):

```js
__game.setTimeScale(0);
__game.teleport(110.5, 20, 130, Math.PI / 2, 0);   // on L1, facing the string (the only side you can reach it from)
__game.setInput({ forward: true }); __game.step(12);
__game.state().player   // climbing: true, onGround: false, pos (107.6, 40, 130)
```

Timeline: grabbed at 0.47 s, placed on L2 at (108.6, 40, 130) at 6.18 s, grabbed again at 6.28 s.
Then `clearInput(); step(0.2); setInput({forward:true}); step(0.6)` four times in a row: still hanging every time.
Only `look(-Math.PI / 2, 0)` (turn to face the wall) and then W puts you on the shelf.
The floor strings do the same when approached from under the desk: `teleport(107, 0, 58, 0, 0)`, W for 12 s, ends hanging at (107, 26, 54.5).
Approached from outside (yo-yo from the north, shoelace from the south) they work: W for 12 s walks you across the desk.

- Expected (DESIGN 4.4): "At the top you are placed on the surface 1 unit along the exit direction", and you stay there.
- Actual: you are placed, but W is still down and you still face the string, so 6 ticks later you walk back into it
  and are hung on it again, with W ignored until released. Tapping W again repeats the cycle. The HUD hint offers
  "Space let go", which from here is a 25 to 60 unit fall.
- Why it matters: the shelf strings can only be grabbed while facing away from their exit, so every natural
  climb to L2 and to the top shelf ends this way.
- Script: `tests/bug_05_targeted.cjs` section 2.

### 2. MAJOR: dead stop on the shelf-side edge of both shelf book stairs (and at the east edge of the skateboard top)

```js
__game.teleport(107.9, 0, 154, 0, 0);              // foot of the tall shelf stairs, 0.1 from their east edge
__game.setInput({ forward: true }); __game.step(8);
__game.state().player   // pos (107.9, 17.059, 126.75), velocity 0, onGround: step 29 of 34
```

From that state, 4 more seconds of each of these leaves the position unchanged: W, W+Shift, W+Space, W+A, W+D.
W+C climbs one more step (y 17.647) and stops again. What frees you: A alone for 0.3 s, or S.
Start x from 107.65 to 108.35 stops (scanned every 0.05); x 107.60 and below reaches the top. The stairs are x 103.5 to 108.
Small shelf: `teleport(107.9, 0, 6, Math.PI, 0)`, W for 9 s, stops at (107.9, 17.059, 33.25).
Skateboard: `teleport(92.3, 0, 47, Math.PI, 0)`, W for 9 s, stops at (92.157, 16.703, 72.598), 0.3 below the seat, under the low end of ruler north.

- Expected: the L1 board edge (underside y 19) pushes you sideways and you keep climbing, the way the desk edge
  does on the ruler ramps (ruler lanes x 94.7 to 95.8 are pushed to x 94.6 and reach the top).
- Actual: no movement at all, no slide, and strafing while still holding W does not help.
- Likely cause (from reading the ground-follow code, so treat as a pointer): the "no head room on the step" branch
  cancels the whole move and zeroes velocity; the wall pass cannot help because on step 29 the head is still 0.14 below the board.
- Scripts: `tests/bug_05_targeted.cjs` section 1, `tests/bug_05b_stair_trap.cjs`, `tests/bug_03_routes_manual.cjs`.

### 3. MINOR: the shelf stairs have an unguarded drop into the shelf bay on the side you are heading for

```js
__game.teleport(105.7, 0, 152.5); __game.lookAt(110.5, 21.6, 120);   // stair foot, looking at the L1 node s.ts1.a
__game.setInput({ forward: true }); __game.step(10);
// ends on the floor under the shelf at (112.98, 0, 114.4); damageLog: one fall of 11.76 units, 8.8 hp
```

Walking up the middle and turning toward L1 at z 135: falls from step 29, 35.3 hp. Turning at z 130 or later: reaches L1.
- Expected: heading for L1 from the stairs gets you to L1 or is blocked.
- Actual: below step 30 you walk off the east side of the stairs under the L1 board and fall up to 17 units.
- This follows from DESIGN (open shelf, no side panels), so it is the lead's call. Script: `tests/bug_05b_stair_trap.cjs`.

### 4. MINOR: Esc then a click within about 30 ms leaves the game paused with the pointer locked

Real key and mouse events, fresh page each time: click to start, `page.keyboard.press('Escape')`, wait, `page.mouse.click(320, 180)`.
Waits of 0, 10 and 30 ms end as phase `paused`, overlay "Paused. Click to resume", `document.pointerLockElement` set.
Waits of 60 ms and more resume normally.
In the bad state three more clicks do nothing (they are delivered to the canvas, not the overlay), W does nothing, and
in headless Chromium Esc does nothing either. A real browser would release the lock on Esc, after which a click works.
- Event order seen: click on overlay, lock released, lock granted. The stale "released" event pauses the game the click just resumed.
- Expected: playing, or paused with the mouse free. Script: `tests/bug_15_pause_race.cjs`.

### 5. MINOR: a second jump in mid-air right after letting go of a string

```js
__game.teleport(107, 0, 52, Math.PI, 0); __game.setInput({ forward: true }); __game.step(3);   // on the yo-yo string at y 9.1
__game.clearInput(); __game.setInput({ jump: true }); __game.step(1 / 60);                     // let go: vy 0
__game.setInput({ jump: false }); __game.step(1 / 60);
__game.setInput({ jump: true }); __game.step(1 / 60);
__game.state().player.vy   // 7.43: a full jump in mid-air, peak y 10.48
```

Works when the second press comes 1 to 3 ticks after letting go, not at 4 or more, and only if the string was grabbed
from the ground. A second press during a normal jump does nothing (control: vy 0.47).
- Expected: no jump while airborne. Script: `tests/bug_05_targeted.cjs` section 3.

### 6. MINOR: tunnel_drop fails at crouch speed

`teleport(91, 17, 80, Math.PI / 2, 0); setInput({forward:true, crouch:true})`: lands on the floor at (81.8, 0, 80), 35 hp.
7 of 7 crouch lanes miss; walking, sprinting, and walking from a standstill at the edge all land on the roof.
The gap from the seat edge (x 85) to the roof (x 81.4) needs about 3.1 u/s and crouch is 2.5.
Script: `tests/bug_05_targeted.cjs` section 5.

### 7. MINOR: the camera goes inside the skirting board and the door frame

Both are visual only and thicker (0.6 and 0.7) than the player radius (0.4). Pressed against any wall
(`teleport(119.6, 0, 68, 0, -0.25)`) the skirting board is not drawn at all; one step back (`x 119.0`) it is.
In a room corner (`teleport(119.6, 0, 0.4, Math.PI * 0.75, -0.3)`) the end face of the other wall's board fills half the screen.
- Screenshots (regenerate with `node bug_13_misc.cjs`): `screenshots/round1/bug_skirting_1_against_east_wall_look_north.png`,
  `bug_skirting_2_one_unit_off_wall_look_north.png`, `bug_skirting_4_room_corner_ne.png`, `bug_doorframe_1_against_frame_look_east.png`.
- Expected: the board stays visible from the room side. Giving the walls' colliders the skirting depth near the floor would do it.

### 8. MINOR (design question): grabbing a string cancels any fall, at any speed, for free

`teleport(107, 81, 53.9, Math.PI, 0)`, fall with no keys, press W below y 24.5: grabbed at y 24.48 while falling at 49.9 u/s,
0 hp lost; the same 81-unit fall without the grab is lethal. Same on the shelf strings from 25 and 45 above their tops.
DESIGN does not say either way. Script: `tests/bug_09_strings.cjs` section D.

### 9. MINOR: ramps can be mounted from the side 0.45 higher than boxes

Sprint-jumping at the side of the skateboard gets you on wherever its surface is 2.0 or lower (blocked from 2.1);
boxes and cylinders stop at about 1.58 (ruin sill 1.2 and yo-yo body 1.4 mounted, lost sock 1.6 and ruin low stub 1.8 blocked).
In the air a ramp is caught with the full 0.65 step-up, also while still rising; boxes get 0.2. Script: `tests/bug_14_misc2.cjs`.

### 10. MINOR (design question): the fort wall tops are walkable from the tower ramp

`teleport(51.5, 0, 9, -Math.PI / 2, 0)`, W until x 60.6 (y 3.82), `look(0, 0)` W 0.35 s, `look(Math.PI / 2, 0)` W 2.2 s:
standing on top of the north wall at (49.75, 3.3, 7.35), surface `plastic`. The Tan fort does the same (the tower sweep in
`bug_07_special_collision.cjs` ends on its wall top at y 3.3).
The ramp runs flush along a 3.3-high wall, so above ramp height 2.65 it is one step sideways. DESIGN does not mention
wall walks and no waypoint covers them. Script: `tests/bug_05b_stair_trap.cjs`.

### 11. MINOR (test hook): `walkPath` drives one-way edges backward and reports ok

`walkPath(['m.bed', 'm.bed.e', 'm.pad', 'n.w.5'])` returns `ok: true` after walking off the bed, landing on the pad
(38 hp), being launched back up, and walking off again (40 hp). `walkPath(['m.tunnel.top', 'm.seat', 'n.seat'])` walks
off the tunnel roof and reports `stuckAt: 'm.seat'`. Refusing a one-way edge in reverse would make it safer to build on
in round 3. Script: `tests/bug_02_routes_walkpath.cjs`.

## Notes that are not counted as findings

- **DESIGN data:** nodes `n.rul.top` and `s.rul.top` are given as y 26 at z 64.3 / 95.7, but the rulers reach 26 at z 64 / 96.
  Dropping onto either node lands at y 25.755. Within `walkPath`'s tolerance, so harmless today.
- **Test hook only:** `teleport(13.3, 4.205, 70.7)` (head 5 mm into the bed slab) ejects the player 13.7 units sideways
  through the west wall on the next tick; the safety net then puts them back (`rescueLog` has the entry). The fuzz hit
  this once, from a random start position, and never from movement (10.5 million ticks), so this is a note about
  `teleport`, not the game.
- You can stand with your centre 0.396 past any ledge (bed, desk, shelf, tower all measured the same).
- Walking along a shelf's west rim with W held grabs a string you pass within 0.8 and carries you up a level. As designed.
- `step()` advances the simulation on the title screen and while paused (phase stays `title` / `paused`).
- After Esc and resume, a key still physically held needs a fresh press. After death the player always respawns at the
  Green spawn at 100 hp facing south, crouch cleared, held keys still held.

## Checked and clean

| Area | What ran | Result |
| --- | --- | --- |
| Load and hook | `bug_01_load_hook.cjs`: all 22 members of DESIGN 11, each exercised | all present and behave as described; `validateWaypoints()` returns `[]` |
| Collision, generic | `bug_06_collision.cjs`: every box and cylinder from 3 points on each face at 3 angles plus 4 corners, walk / sprint / sprint-jump / crouch: 20,132 runs, 2.6 million ticks, my own overlap test every tick | no tunnelling, nothing mounted that is taller than a step or a jump, no jitter. Deepest overlap seen: 2 cm, airborne, in the 0.7 gap between a ruin brick and a ruin stub |
| Room walls and corners | same script: every 2.5 units of all four walls at 3 angles, 4 corners at 5 angles, 4 modes: 2,720 runs | never closer than 0.4 to a wall, 0 rescues |
| Fort slits, gate, tower | `bug_07_special_collision.cjs`: 2,460 runs along both front walls from both sides; 360 runs on both tower tops | no crossing, never on the low wall under the slit. Crenel gaps (1.2) let you walk off the tower, parapet (1.1) can be jumped: both as built to DESIGN |
| Low ceilings | same: under the bed (563 jump runs incl. jumping in across the slab edge), under the skateboard, under ruler north on the seat rim | head never above the underside. Standing stops at z 53.65 under the skateboard, crouching at 52.84; releasing crouch there keeps you crouched until you back out |
| Slab ramps | same: 3,288 drops onto the 5 slabs from 0.3 to 55 above, on a grid including the outer edges, with 3 key sets | 0 fell through. From the side: step on where the surface is low, blocked where clearance is under 1.8, pass under from 1.8 |
| Stair sides | same: 7,890 runs into the sides of all four flights | no penetration |
| Random and adversarial | `bug_08_fuzz.cjs`, seeds 1 to 8: 22,482 episodes, 10.5 million ticks, starts on every surface, in corners, dropped from random heights, over collider edges, on the pad, around strings | 0 out of room, 0 below the floor, 0 NaN, 0 wedged, 0 wrong fall damage. 1 rescue, caused by a start position (see the `teleport` note above), 0 from movement |
| Big time steps | `bug_13_misc.cjs`: `step(600)` sprint-jumping into a corner; time scale 4, 20, 200 in real time; W held onto the pad for 300 s | stays in the room; the real-time loop caps at 15 ticks per frame |
| Strings | `bug_09_strings.cjs`: 68 bottom grabs, 48 top grabs with descent, 6 grabs while falling, controls on the string | W 3.5 u/s up, S 3.5 down, nothing holds, A/D ignored, Space lets go with vy 0, top and bottom placements exact |
| Fall damage | `bug_10_fall_damage.cjs`: 19 drop heights, 11 real ledges, 8 sprint and jump-spam descents | exact: 0 at 10.00, 0.05 at 10.01, 40 from the bed, 99.95 at 29.99, death at 30.00. No damage from stairs or ramps taken at speed |
| Controls | `bug_11_keys.cjs`, real events: click to start, WASD, arrows, both Shifts, Space, C, both Ctrls, backtick, Esc, click to resume, blur | all work; Space held jumps once; backtick ignores auto-repeat; keys ignored on the title and while paused; mouse look maths, pitch clamp and yaw wrap correct with synthetic `mousemove` |
| DESIGN match | `bug_12_design_match.cjs`: 177 primitives, 4 stair flights (127 steps), 8 strings, the pad, 138 waypoint nodes parsed from DESIGN.md, 26 CONFIG values | 0 mismatches. 7 pieces are built from different boxes with the same volume. 3 nodes moved by exactly 2.0 (`s.ub.1`, `s.ub.2`, `m.plat`), all declared in `__game.movedNodes` |

## Could not test headless

- Ctrl is a crouch key, and Ctrl+W closes a browser tab. Headless Chromium has no tab UI, so I could not see whether crouch-walking forward with Ctrl does that.
- Real browsers refuse a new pointer lock for about a second after the user leaves one with Esc. Headless grants it at once, so resuming quickly after Esc is untested beyond finding 4.
- Real mouse movement under pointer lock: Playwright's moves arrive as cancelling pairs, so mouse look was only checked with synthetic `mousemove` events.

## Scripts

All in `tests/`, run with `node name.cjs` from that folder. `bug_lib.cjs` holds the shared helpers and my independent
overlap test. `bug_03_routes_manual.cjs` also prints fixed-yaw diagonal runs; most of those that are flagged walk off
the side of a ramp by construction and are not findings.

---

# Re-check (round 1, after fix passes 1 and 2)

**Gate: PASS.** Bed top, desk top and tall shelf L3 reached by every route in 4.4, up and down, walking and
sprinting, through `walkPath` and with raw input, end positions checked by my own code. Findings 1, 2, 3 and 5 are
all confirmed fixed. No regressions. One new minor finding (12), which was already in the first build.

Build tested: `index.html` 85,035 bytes, 356 colliders (was 347). Console errors and warnings in every run: none.
`validateWaypoints()` returns `[]`. All 138 nodes sit where DESIGN puts them (apart from the three declared moves),
and the new pieces match DESIGN (stair guards, seat stoppers, W-c both halves, E-c, jumbo crayons, `climb.speed` 5.5,
`airControl` 0.12, fog 10 / 220): 0 mismatches in `bug_12_design_match.cjs`, updated to the new tables. The two ruler
props are wedges on `92.5..95.5, 64..73` and `87..96` whose tops are the rulers' undersides, as DESIGN asks.

## The four fixes

| Finding | Result | What I ran (`tests/bug_16_recheck.cjs` unless stated) |
| --- | --- | --- |
| 1. Strings re-grab at the top | **Fixed** | W held for 12 s on all 8 strings from every side with standing room: 34 of 34 end standing on the top surface, 0 re-grabs. That includes both desk strings from under the desk. The original call `teleport(110.5, 20, 130, Math.PI/2, 0); setInput({forward:true}); step(12)` ends on the ground at (108.6, 40, 130). Releasing W and walking back into the string still grabs it, and S takes you down to (108.6, 20, 130), so downward use still works |
| 2. Dead stop on route edges | **Fixed** | The three original calls now reach the top. Lanes with W and with W+Shift at x 107.3 to 107.99 on both shelf stairs, and x 91.5 to 92.3 on the skateboard and the chair stairs: 40 of 40 reach the top with no damage. In the full lane set the only stops left are real walls: the chair-back posts (x 85.7, 86.05) and the south end of each stair guard at floor level (start x 108.0 and above, which is beside the stairs, not on them) |
| 3. Drop into the shelf bay | **Fixed** | Aiming at the L1 node from the stair foot and from five points up each flight, walk and sprint, both shelves: 24 of 24 end on L1 with no damage. The guard slides you along to the landing |
| 5. Mid-air jump after letting go | **Fixed** | Second Space 1 to 6 ticks after letting go, both floor strings: vy stays negative (-0.73 to -2.57), no jump |

## The gate again

- `bug_02_routes_walkpath.cjs`: all 18 routes up, walk and sprint, ok with the end on the last node; all two-way routes
  down ok; 34 of 34 chained journeys from the Green spawn ok with 0 damage. Strings are quicker as intended
  (desk_yoyo 7.0 s / 6.4 s, was 9.7 / 9.1; each shelf string 4.5 s / 4.3 s, was 6.6 / 6.4). The rest are unchanged.
- `bug_04_gate_manual.cjs` (raw `setInput` + `step` + `lookAt`): 82 of 82 legs ok, every route up and down, walk and
  sprint. Whole climbs with no teleport: bed 20.0 s, desk 22.3 s, top shelf by yo-yo, desk, bridge and strings and back
  down to the floor 71.7 s (was 82.7), top shelf by the tall stairs 57.3 s.
- `bug_03_routes_manual.cjs`: lanes reaching the top are now tall and small stairs 18 of 20 each (the two that stop
  start beside the stairs, against the guard's end), skateboard 14 of 18 and chair stairs 14 of 18 (chair-back posts only).
  Everything else as in the first table. tunnel_drop at crouch speed still misses (finding 6, deferred).

## New geometry

- **Generic sweep** (`bug_06_collision.cjs`, 20,848 runs, now including W-c, E-c, the jumbo crayons, the guards and the
  stoppers): no tunnelling, nothing mounted that should not be, no jitter, 0 rescues. Room walls 2,720 runs clean.
- **Props, stoppers, guards** (`bug_16_recheck.cjs`, 2,096 runs, walk / sprint / sprint-jump / crouch): off both rulers
  sideways along their whole length, into each stopper and ruler foot from 16 directions on the seat, into the props at
  floor level from every side and from under the seat, corner-cuts from the skateboard and chair-stair heads toward the
  rulers, into the guards from the stairs, from the floor under L1 and off the L1 rim above them. 0 wedged, 0 rescues,
  nobody stuck in the 0.5 slot between a ramp and its prop.
- **Deepest overlap seen:** 4.6 cm of head into the desk top for one tick, sprint-jumping on a ruler under the desk
  edge, then pushed clear. The 2 cm ruin brick / stub pinch from before is unchanged.
- **Other suites, unchanged results:** `bug_07_special_collision.cjs` (slits, stair sides, under the bed, slabs: 0 fell
  through in 3,261 drops), `bug_09_strings.cjs` (68 bottom grabs, 48 top grabs, 6 falling grabs, climb now 5.5 u/s),
  `bug_10_fall_damage.cjs` (exact), `bug_11_keys.cjs` (all keys), `bug_13_misc.cjs`, `bug_14_misc2.cjs`.

## Fuzz

`bug_08_fuzz.cjs` seeds 11, 12, 13: 5,994 episodes, 2.8 million ticks. 0 out of room, 0 below the floor, 0 rescues,
0 NaN, 0 wedged, 0 wrong fall damage.

## New finding

### 12. MINOR: the desk side of both rulers is an open drop under the desk top

```js
__game.teleport(93.31, 17, 76.66); __game.lookAt(94, 18.6, 75);   // on the seat, heading for the ruler foot at an angle
__game.setInput({ forward: true }); __game.step(4);
// walks up ruler north diagonally, off its east side under the desk, falls 20.7 units to the floor: 53.6 hp
```

Same from `teleport(92.5, 17, 77); lookAt(95.2, 18.6, 70)` (62.6 hp) and on ruler south from
`teleport(92.5, 17, 83); lookAt(95.2, 18.6, 90)` (62.6 hp).

Below y 22.7 your head fits under the desk top (underside 24.5), so the ruler's east edge (x 95.5) is open and the
drop is up to 22.5 units. Going straight up the ruler anywhere across its width is fine
(20 of 20 lanes each), and above y 22.7 the desk edge pushes you back on. This was the same in the first build; I
missed it then because my ruler runs were all straight. It is the ruler version of finding 3. A stack under the desk
edge beside each ruler, like the stair guards, would close it. Script: `tests/bug_16_recheck.cjs` ("seat toward (94,75)" runs).

## Still open from the first report

Findings 4, 6, 7, 8, 9, 10 and 11 are deferred in FIXLIST.md and behave as first reported (4, 6 and 9 re-run and
confirmed unchanged).

## Script changes

`bug_05_targeted.cjs`, `bug_05b_stair_trap.cjs` and `bug_07_special_collision.cjs` had position-based `while` loops
with no limit; each now stops after 1,500 ticks. `bug_05_targeted.cjs` runs to completion on this build. Its section 1
"escape" rows and section 8 describe the old stuck spot and no longer mean anything; use `bug_16_recheck.cjs` instead.
`bug_09_strings.cjs` and `bug_12_design_match.cjs` now read the new climb speed and the new DESIGN tables.
