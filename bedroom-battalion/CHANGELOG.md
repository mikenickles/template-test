# CHANGELOG

## Round 1: graybox (builder pass 1)

`index.html` is new: 80 KB, one file, Three.js from the pinned CDN URL only.

### What was built

- **Room at final scale**, flat graybox colours (DESIGN 13): shell with the canvas plank floor, skirting, door,
  window (real hole in the west wall, frame, sill, glazing bars), ceiling light; bed and everything on, under
  and beside it; desk, chair and desk items; both ladder shelves and their items; both forts with firing slits,
  tower, parapet with two crenel gaps and tower ramp; the ruin with 14 loose bricks (two stacks of two,
  rotationally symmetric about (60, 80)); all floor cover in section 6; the tunnel box; the track drawn flat
  (sleepers and rails, no collider).
- **Colliders**: 347 in one list (`box`, `ramp`, `cyl`, `string`, `pad`), each with `id`, `kind`, `surface`,
  `bounds`. Every solid is created by a helper that adds the collider and its visual together. The debug
  wireframes are generated from that same list.
- **Player**: fixed 60 Hz simulation, interpolated rendering. Walk 5, sprint 7 (forward only), crouch 2.5,
  jump, air control, step-up 0.65, slope limit 50 degrees, crouch that cannot stand up under a low ceiling,
  fall damage into `damageLog`, fall-out safety net (logged in `rescueLog`).
- **Climb routes**: solid wedges, thin slab ramps you can walk under, book stairs by step-up, six strings plus
  the yo-yo string and shoelace, the spring pad.
- **Lighting and scale cues**: eye 1.6, vertical fov 75, linear haze 30 to 330, one warm shadow-casting sun
  (2048 map) through the window, hemisphere fill. The walls and ceiling cast the shadow, so the room is in
  fill light and the sun only lands where the window lets it.
- **UI**: title overlay (click to play, pointer lock), crosshair dot, health readout, Esc pauses and releases the
  mouse, click resumes. WASD or arrows, mouse look, Shift, Space, C or Ctrl.
- **Debug overlay** on the backtick key: fps, draw calls, triangles, position, velocity, state, surface;
  collider wireframes; waypoint graph coloured by edge kind.
- **`window.__game`**: everything in DESIGN 11. Extras that are not in the spec: `CONFIG` (live, so the feel
  tester can try numbers), `views`, `movedNodes`, `rescueLog`.
- **Code sections** in the required order. Audio, train, weapons, bots and match rules are labelled stubs.
  The track path function lives in the train section; the waypoint graph and its validator in the bots section.

### Budget

| Item | Value |
| --- | --- |
| File size | 80,336 bytes |
| Draw calls | 3 reported by `renderer.info` (merged static mesh, one InstancedMesh, floor). The shadow pass draws 2 more that Three.js does not count. 5 reported with the debug overlay on. |
| Triangles | 9,990 |
| Shadow lights / map | 1 / 2048 |
| fps | 5 to 10 in the harness. That is software rendering and says nothing about real hardware. |

### What I ran (scripts in `tests/builder_*.cjs`)

| Check | Result |
| --- | --- |
| Page load | `ready` true, `errors` empty, nothing blocked |
| `validateWaypoints()` | `[]` (and it does report `s.ub.1 > s.ub.2` blocked by `bed.dust.7` if the DESIGN positions are put back) |
| `walkPath(routes[id])`, walking | ok for all 18 route ids; end heights bed 18, desk 26, shelf 20 / 40 / 60, tunnel top 8; no damage |
| Same, `{sprint: true}` | ok for all 18 |
| Every graph edge on its own, both directions where two-way (336 walks) | all ok, no damage |
| Green gate to Tan gate, straight line along x = 48, sprinting | 14.9 s (104 units) |
| Green gate to Tan gate along the centre-lane nodes through the ruin, sprinting | 16.9 s |
| Time to walk speed / stop time / stop distance | 0.100 s / 0.067 s / 0.10 units |
| Jump apex / air time | 1.383 / 0.70 s |
| Bed to floor fall | 40 hp, logged |
| Spring pad, five approaches (walking, sprinting, holding into or away from the bed, no input) | all land on the bed at x 29.8 to 30.7, y 18, no damage |
| Random-input walkers from all 138 nodes, 56 simulated minutes | never outside the room, never inside a solid, safety net never needed |
| Real click on the title, real keys, backtick, Esc, click to resume | all work; pointer lock engages in headless Chromium |

### What to test

- Bug tester: walls and furniture edges everywhere; the slab ramps from the side and from underneath (skateboard,
  both rulers, both bridges); standing up while crouched under the low end of a slab; every string up and
  down, grabbing from the top surface, letting go with Space; the spring pad from every side; the chair-back
  gap and the drop to the tunnel roof; jumping onto the ruin sills and platform; the firing slits.
- Feel tester: `__game.CONFIG` is live. Step-up camera smoothing is `player.stepSmooth`; ledge forgiveness in the
  air is `move.airStep`.
- Visual tester: light levels are `CONFIG.light`. Sunlit surfaces run hot on purpose so the sunbeam reads.

### Notes for anyone driving the hook

- The real-time loop keeps running between `page.evaluate` calls. For repeatable tests call
  `__game.setTimeScale(0)` first; `step()` still advances the simulation.
- `walkPath` places the player on the first node if they are not already within 1 unit of it. Everything after
  that is the normal movement code with virtual input. `reached` is the list of node ids reached in order;
  `stuckAt` is the node it failed to reach, or null.
- `walkPath` holds no input while a spring launch is in the air, and counts a pad node as reached the moment the
  pad fires.
- `setView()` hides the HUD while a named view is active.
- Health 0 in round 1 respawns the player at the Green spawn with full health (placeholder until match rules).

### Waypoints moved (all within the 2 unit allowance)

| Node | DESIGN | Built | Why |
| --- | --- | --- | --- |
| `s.ub.1` | (19, 0, 110) | (21, 0, 110) | the leg to `s.ub.2` ran through the dust bunny at (20, 106) |
| `s.ub.2` | (22, 0, 100) | (24, 0, 100) | same leg; both nodes had to move the full 2 units to clear it by 0.2 |
| `m.plat` | (60, 1.2, 80) | (60, 1.2, 78) | the node was inside the ruin's centre pillar (59..61, 79..81) |

Also changed: `n.w.5 > m.pad` and `s.w.5 > m.pad` are flagged `oneWay`, because standing on `m.pad` always launches.
The mirrored `ts2.b - ts2.c` edge is left out, as DESIGN 9.4 says it is replaced by the chain through `ts2.d`.

### DESIGN.md items I could not do as written, and what I did instead

1. **Spring launch clips the bed.** With launchVel (-4.5, 31, 0) from the pad centre the player reaches the bed
   edge at y 14.6, below the top at 18. Instead of changing the number, a launched player slides up the bed
   side and keeps the launch's horizontal speed, so they still land at about (29.8, 18, 80). During a launch,
   air control can steer sideways but cannot cancel the throw, otherwise holding any key while crossing the pad
   dropped you back to the floor for 60 damage.
2. **Capsule.** The player is tested as an upright circle of radius 0.4 over its height (flat ends), with explicit
   step-up, rather than a round-ended capsule. A round bottom would ride up low edges and fight the step-up and
   slope rules.
3. **Ramp `base`.** Blanket ridges R1 and R2 are solid wedges that sit on the bed top, so "Infinity means solid to
   the floor" would have filled the under-bed space. Ramps have a `base` field (18 for the ridges, 0 otherwise).
4. **Marble run "ramp"** (C-c') is a flat-topped box 4 high, the mirror of the dump truck bed, not a sloped collider.
5. **Shelf strings** hang at x 107.6, just outside the boards. Stepping off the bottom of one puts you on the
   board 1 unit along the exit direction (same rule as the top), because there is no floor under the string.
6. **Grabbing a string from the top** while holding forward would climb straight back up. Forward is ignored until
   it is released and pressed again; back descends.

### Known weak spots

- Skirting is visual only (as specified) and 0.6 thick, the player radius is 0.4, so the camera goes inside the
  skirting when you hug a wall and the board vanishes.
- Named view `west_lane` has its eye on the east face of alphabet block W-a (x 40, z 30), so half the frame is
  the block. Named view `desk_top` looks through the chair-back panel, which covers most of the frame.
- Straight-line fort to fort is 14.9 s sprinting, a hair under the 15 to 25 s target.
- Stairs are solid columns to the floor and the strings are plain boxes; no light top edges or chevrons yet.
- The bed frame colour in direct sun reads orange-tan, close to the Tan squad colour.
- Letting go of a shelf string drops you onto the book stairs below, which can be a long fall.
- Below about 4 fps the real-time loop drops simulation time instead of catching up.

## Round 1, pass 2 (FIXLIST.md round 1, pass 1)

`index.html` is now 84,699 bytes, 354 colliders, 168 graph edges, 10,338 triangles, still 3 reported draw calls.
Only the five FIXLIST items were touched. Scripts: `tests/builder_pass2.cjs`, `builder_lanes.cjs`,
`builder_rulertrap.cjs`, plus the pass 1 scripts re-run.

### Item 1: strings (fixed)

- Topping out sets a forward lock (forward is ignored until released) and blocks re-grabbing that string for
  `climb.topRegrab` = 0.5 s. `walkPath` releases forward for one tick after topping out.
- Grabbing and letting go of a string both clear coyote time, so there is no jump in the air after letting go.
- Measured: the BUGS 1 repro ends `climbing: false, onGround: true` at (108.6, 40, 130). Same for all six shelf
  strings (y 40 or 60) and for the yo-yo and shoelace from under the desk and from outside (107, 26, 55.5 / 104.5).
  Releasing, turning east and walking leaves the string behind. Walking back into a string from the top still grabs
  it and S still descends. Second jump press 0 to 5 ticks after letting go: vy stays negative, no height gained.
- Behaviour change to know about: approaching the yo-yo from the north and holding W used to carry you across the
  desk; now you stop where you are placed until W is released, as DESIGN 4.4 now says.

### Item 2: dead stops (a and b fixed, c built but its re-check still fails)

- (a) Ground follow: a refused step-up no longer cancels the move. First the player is pushed out of whatever takes
  the head room, as if already standing on the step; if that does not free the step, the step itself is treated as a
  wall and the velocity slides along it. Position is held (velocity kept) only if both fail.
- (b) Stair guards added exactly as DESIGN 4.3: `s.tall.guard` and `n.small.guard`.
- (c) Seat stoppers added: `chair.stopper.s` at (92.2, 86.7) as DESIGN 4.2, **`chair.stopper.n` at (92.45, 73.3), not
  (92.2, 73.3)**. At 92.2 the skateboard lanes x 92.25 to 92.35 were pushed east round the stopper, off the side of
  the skateboard, and fell for 32.9 hp, and x 92.20 stopped dead against it; that includes the third BUGS 2 repro.
  At 92.45 every skateboard lane that is on the ramp is pushed west onto the seat.
- Measured: the three BUGS 2 repro calls reach the top (6.3 s, 6.3 s, 5.6 s). Lanes every 0.05: tall and small
  stairs x 107.30 to 107.95 all reach L1 walking and sprinting; x 108.00 and above now meet the end of the guard at
  floor level, which is an ordinary wall. Skateboard and chair stairs x 91.00 to 92.35 all end standing on the seat.
  BUGS 3 (aim at the L1 node from the stair foot): reaches L1 at (107.6, 20, 124.1), no damage.
  `tests/bug_05b_stair_trap.cjs`: all 16 cut-corner cases end "on L1", no damage.
- **Not fixed: `tests/feel_ruler_trap.cjs` still shows 6 falls (21 to 32 hp) and 3 timeouts out of 15**, the same
  pattern as before, and identical with the stopper at 92.2 or 92.45 (`builder_rulertrap.cjs` run against both).
  The stoppers cannot change it: aiming at the ruler at z 71 or 68 walks the player back off the seat onto the
  skateboard and then off the skateboard's east side under the ruler, north of the stopper; aiming at z 73.5 presses
  the player against the ruler's side where it is 0.7 to 1.2 above the seat, which no rule lets them mount.
  This needs a design change (for example closing the space under each ruler beside the skateboard and chair
  stairs, or a longer ruler foot), not a builder tweak.
- `tests/bug_05_targeted.cjs` can no longer finish: its section 8 walks lane x 108.2 up the tall stairs in a
  `while` loop, and that lane is now stopped by the guard, so the loop never ends. I covered its sections 1 to 3
  with the same calls in `builder_pass2.cjs` and `builder_lanes.cjs`. The bug tester needs to update that script.

### Item 3: haze and light (fixed)

- Fog 10 / 220; hemisphere `#FFF8EC` / `#D8CFC4` at 3.0; sun 3.0; bed frame `#E9E4DA`.
- `CONFIG.camera` (fov, near, far) and `CONFIG.fog` are re-read on every render.
- Measured from `spawn_green`: near wall pixel (178, 188, 188), far wall (212, 209, 198), ceiling (218, 208, 191).
  Setting fog to 1 / 60 and fov to 40 through the hook changed the same pixels on the next render and restoring
  them restored the pixels exactly. Screenshot looked at: walls pale blue, far wall paler, ceiling off-white.
- Side effect: the off-white bed top in direct sun now clips to near white.

### Item 4: strings and routes (fixed)

- `climb.speed` 5.5, `move.airControl` 0.12. Strings are drawn `climb.drawAbove` = 2 above their top (collider
  unchanged). Route colour is lapped `route.lap` = 1.5 onto the surface at the blanket slope, bed stairs,
  skateboard, chair stairs, both rulers (on the desk), both ends of both bridges and both shelf stair heads.
- Measured, sprinting from the Green spawn through the graph: desk by yo-yo 14.9 s, by small-shelf stairs and
  bridge 17.4 s, by skateboard and ruler 16.0 s. A shelf string takes 4.3 s node to node.

### Item 5: cover (fixed, with one graph change)

- Added `n.W-c`, `s.W-c`, `n.E-c`; crayons are now 1.3 high and 1.3 deep as DESIGN 6.
- **No node was moved. Edge `w.5 - ub.e` was removed on both halves instead.** W-c sits on that leg, and a search of
  every position of `ub.e` and `w.5` within 2 units (0.1 grid) found none that clears W-c without blocking
  `ub.e - m.ub`. `w.5` still reaches `ub.e` through `w.4`. `validateWaypoints()` returns `[]`.

### Re-run after all changes

| Check | Result |
| --- | --- |
| Load | `ready` true, `errors` empty in every script |
| `validateWaypoints()` | `[]` |
| 18 routes, walking and sprinting | all ok, end heights 18 / 26 / 20 / 40 / 60 / 8, no damage |
| Every graph edge, both directions where two-way (332 walks) | all ok |
| Random-input walkers, 56 simulated minutes | never outside the room or inside a solid, safety net never fired |
| Real click, keys, backtick, Esc, resume | work |
| Gate to gate sprint | 14.9 s straight, 16.9 s through the ruin (unchanged) |

### What to re-test

- Bug tester: BUGS 1, 2, 3 and 5; that walking into the guard ends and the stoppers from every side cannot trap
  or drop you; strings downward from the top.
- Feel tester: the ruler corner-cut (still failing, see item 2), the yo-yo against the stairs, haze.
- Visual tester: wall, ceiling and bed colours; the sunlit bed top; route laps and string tops from above.

## Round 1, pass 3 (FIXLIST.md "Pass 2": ruler props)

Only change: two solid wedges under the rulers outside the seat, `desk.ruler.n.prop` (`92.5..95.5, 64..73`) and
`desk.ruler.s.prop` (`92.5..95.5, 87..96`), from the floor up to the ruler underside, cover grey, surface `book`.
The north stopper stays at (92.45, 73.3). `index.html` is 85,035 bytes, 356 colliders, 10,362 triangles.

| Check | Result |
| --- | --- |
| `tests/feel_ruler_trap.cjs` | 0 falls, 0 damage. 6 of 15 reach the desk (aim z 75.5 and 74.5); 9 time out pressed against the ruler side or prop (aim z 73.5, 71, 68) |
| 18 routes, walking and sprinting | all ok, same times and end heights as pass 2, no damage |
| `validateWaypoints()` | `[]` |
| Every graph edge (332 walks) | all ok |
| Skateboard and chair-stair lanes x 91.00 to 92.35, walking and sprinting | all end standing on the seat |
| Console | `errors` empty |

Re-test: feel tester, the corner-cut from both the skateboard and the chair stairs; bug tester, walking into the
props from the floor side and from under the desk.

## Round 2: gunplay (DESIGN.md sections 12 and 15)

`index.html` is now 136,532 bytes. New test scripts: `tests/builder_r2.cjs` (everything below through the hook) and
`tests/builder_r2_input.cjs` (real mouse and keys).

### What was built

- **Four guns** (rifle, SMG, sniper, pistol) from `CONFIG.weapons`: fire rate, magazine, reserve, reload, draw time, spread
  with bloom and recovery, stance multipliers, recoil kick with 60 % return over 0.25 s, damage falloff, headshots x2.
  No firing while sprinting or on a string. Reload cancels on switch. A fire press on an empty magazine gives a dry click
  and starts the reload. Sniper: right-mouse scope (fov 25 in 0.2 s, vignette with a thin cross, sensitivity scaled by fov),
  1.3 s bolt cycle, scope drops for the first 0.5 s.
- **Hitscan** against the collider list (boxes, pads, ramps as convex solids, cylinders) and the dummies' head and body
  volumes. Never the visual meshes. Seeded random spread, so a fresh page repeats exactly.
- **Grenade**: hold G for an arc preview that follows the real bounce physics, release to throw; restitution 0.45, 2 s fuse,
  110 linear to 0 at radius 7, blocked by any collider between burst and target. It also hurts the player. One per life.
- **21 target dummies** (instanced, glossy Phong): 100 hp, damage numbers, tip over rigid with chips, stand up after 3 s.
  They are hit volumes only and do not block the player, because most stand exactly on waypoint nodes.
- **Juice**: a blocky viewmodel per gun (kick, reload dip, draw, sway) in its own pass; 2-frame muzzle flash; tracers;
  casings that bounce once; shake; particles by surface (wood, fabric, plastic, book, card, metal); 64 pooled decals;
  four-tick crosshair that widens with spread; white hit marker, larger red one on a kill.
- **Audio**: every sound in 15.2 synthesized from recipes in `CONFIG.audio.sounds`; the context is created on the first
  click or key. `audioLog` is filled whether or not anything can be heard.
- **HUD**: weapon name (and RELOADING), magazine / reserve, grenade count, health.
- **Hook**: `fire()`, `setInput({fire, scope, grenade, reload})`, `selectWeapon`, `reload`, `throwGrenade`, `give('grenade' |
  'ammo' | 'health')`, `state().weapon`, `state().targets`, `raycast`, `shotLog`, `audioLog`, `resetTargets`. Extras:
  `state().weapon` also has `scope`, `drawing`, `grenades`, `fov`; `raycast` also returns `zone` and `normal`; `grenades` is
  the live grenade list. `fire()` does not advance time; `throwGrenade(hold)` steps the simulation for the hold plus one tick.
- All effects are pooled: one InstancedMesh for particles, casings, decals and grenades, one for tracers, one for dummies.

### Measured (`tests/builder_r2.cjs`, software rendering)

| Check | Result |
| --- | --- |
| Console | `errors` empty, also after a real click created the audio context |
| Fire rate | rifle 10 shots/s (gap 0.100), SMG 15 (0.067), sniper one per 1.300 s, pistol 6 per second at the fastest press (gap 0.183) |
| Magazine and reload | rifle 30 then 2.2 s to 30 / 60; SMG 40, 2.0 s, 40 / 80; sniper 5, 3.0 s, 5 / 10; pistol 12, 1.4 s, 12 / 24. Dry click then reload sound each time |
| Reload cancels on switch | yes for all four (magazine unchanged after switching away and back) |
| Draw time | 0.47 / 0.37 / 0.70 / 0.27 s to the first possible shot |
| Rifle damage body / head | 26 / 52 at 10; 22.15 / 44.26 at 90; 18.2 / 36.4 at 121 |
| SMG | 16 / 32 at 10; 11.68 / 23.29 at 47; 7.2 / 14.4 at 80 |
| Pistol | 30 / 60 at 10; 25.57 / 51.08 at 65; 21 / 42 at 100 |
| Sniper | 90 / 180 at 10 and at 121 |
| Scope | fov 75, 50 half way, 25 scoped; spread 3.0 unscoped, 0.05 scoped; scope gone 0.2 s after the shot, back at 0.72 s; second shot at 1.300 s; bolt sound at 0.42 s |
| Spread | rifle 0.5 rising 0.35 a shot to 3.0, back to 0.5 in 0.43 s; SMG 1.4 to 4.5, 0.45 s; pistol 0.35 to 3.0, 0.57 s |
| Multipliers (rifle) | standing 0.5, crouched 0.3, moving 0.75, crouched and moving 0.45, sprinting 1.25, airborne 1.5; 0 shots while sprinting, 0 on a string |
| Recoil (pistol) | kick 1.4 deg, 0.56 deg left after 0.25 s |
| Cover | aiming at the dummy behind the Tan fort wall hits `s.fort.front.e.low`, dummy untouched; through the slit, a headshot |
| Grenade | pin, four bounces, pop; bursts 120 ticks after the release tick; one per life. Damage 102.14 / 78.57 / 47.14 / 15.71 / 1.57 / 0 at 0.5 / 2 / 4 / 6 / 6.9 / 7.5, matching the formula; 0 behind the fort wall against 46.44 at the same distance in the open |
| Dummies | 21 (10 Green, 11 Tan); all 21 eliminated with one sniper headshot each, 21 kill sounds, all 21 standing at 100 hp afterwards; down for 3.02 s |
| `audioLog` | switch, shot_rifle / smg / sniper / pistol, bolt, dry, reload_*, hit, kill, grenade_pin / bounce / pop, step_wood / fabric / book / card / plastic, jump, land all appear for the matching action |
| Routes and graph | all 18 routes ok walking and sprinting, same times and heights, no damage; `validateWaypoints()` is `[]` |
| Random walkers, 56 simulated minutes | never outside the room or inside a solid |
| Draw calls | 9 idle, 12 at most while firing the rifle, 11 with the grenade arc. These now include the shadow pass |
| Triangles | about 26,000 (the counter now includes the shadow pass, which is why it doubled) |
| Real input | left mouse fires, R reloads, 1 / 2 / 3 / 4 / 5 and the wheel switch, right mouse scopes, G throws |

Screenshots looked at: rifle mid-burst (flash, tracer, damage number, casings, HUD), sniper scoped, grenade arc, pressed
against the east wall (skirting stays visible), `bed_top`.

### Carry-overs (DESIGN 15.5)

1. Skirting and door frame are 0.3 thick. Screenshot against the east wall shows the board.
2. Counters include the shadow pass: 9 idle (was 3).
3. `player.stepSmooth` 9.
4. `west_lane` eye (42, 1.6, 24), `desk_top` eye (97.5, 27.6, 66).
5. Crayons at `55.7..57, 29..38` and `63..64.3, 29..38`, mirrored.
6. Bed top blanket blue, sides `#E9E4DA`, underside `#6F6A63`.
7. Bear head `6..14, 39..45`.
8. Desk aprons added; walking east off the middle of the north ruler is held at x 94.6 with no fall.
9. From 2 above the yo-yo string top it is grabbed at 9.5 u/s; from 34 above it is not grabbed.
10. `walkPath` returns `ok: false` with an error for `m.bed.e > m.pad`, `m.tunnel.top > m.seat` and `m.pad > n.w.5`.

### DESIGN.md items I could not do as written, and what I did instead

1. **Bloom never builds with the recovery rates as written**: rifle adds 0.35 a shot but recovers 0.7 between shots (SMG 0.30
   against 0.6). Recovery now waits for `recoverDelay` after the last shot (rifle 0.16 s, SMG 0.12 s, pistol 0.25 s).
2. **Pistol 0.18 s minimum** is 0.183 s, the next whole tick at 60 Hz.
3. **Dummy height**: body 1.4 plus head 0.45 is 1.85, not 1.8. The body volume is 1.35 including the 0.05 base.
4. **Dummies on the z = 80 midline** alternate Green and Tan.
5. **Sprint spread x2.5** only shows on the crosshair, since firing while sprinting is not allowed.
6. Holding fire on an empty automatic does nothing until the trigger is pressed again ("on a fire press").

### Known weak spots

- Named view `bed_top` has its eye inside the head of the bed dummy at (27, 18, 80).
- By my arithmetic the turned crayons reach into the round 3 train envelope where the track curve crosses x 56 and x 64
  (about z 36 and z 124). Not tested; there is no train yet.
- A grenade stops rolling almost at once after it lands.
- The viewmodels are plain boxes and the sounds have only been checked for names and for not throwing; nobody has
  listened to them.
- Casings bounce at the height of the player's feet, not on whatever is under them.

## Round 2, pass 2 (FIXLIST.md "round 2, pass 1")

Only the five FIXLIST items were touched. `index.html` is now 146,098 bytes (was 136,532). New scripts, all in `tests/`:
`builder_r2b_item1.cjs` (grenade repros, 10,000+ random throws, launch pitch, sniper bolt, ruler lanes), `builder_r2b_ttk.cjs`
(time to kill), `builder_r2b_item3.cjs` (grenade damage, burst, arc, throw tick), `builder_r2b_item4.cjs` (handling),
`builder_r2b_item5.cjs` with `builder_r2b_pixels.py` (colour measurements), `builder_r2b_regress.cjs`, `builder_r2b_smoke.cjs`,
`builder_r2b_vm.cjs`, and two diagnostics (`builder_r2b_loaderr.cjs`, `builder_r2b_arcpath.cjs`). Screenshots are in
`screenshots/round2/builder_r2b_*.png`.

### Item 1: grenade start, sniper bolt, desk apron (fixed)

- (a) The grenade is created at the eye and swept to the release point (0.5 ahead, 0.2 right, 0.15 down). If anything is in the
  way it starts at the contact point, backed off by its 0.16 body. A grenade that leaves the room box (with a 0.16 tolerance) is
  removed without a burst. The missing 10 degrees came from `viewBasis` returning one shared object, so the raised direction
  was overwritten by the plain view direction. It is now read before the second call.
- (b) Each gun keeps its own cooldown (`arsenal.guns[name].cool`). Guns that are not out keep counting down, and switching back
  restores the time left. So the 1.3 s sniper bolt keeps running while another gun is out, and a switch never shortens it.
- (c) Apron panels moved to `95.5..96` (DESIGN 15.5 item 8).
- Measured: the east-wall repro starts at x 119.86 and bursts in the room at (112.68, 0.02, 80.6). The Tan fort repro starts at
  z 133.87 against the wall, bounces back and bursts at z 129.38, and dummy 21 keeps 100 hp. Launch angle is view pitch +10.00
  at -60, -22.9, 0, 22.9, 45 and 70 degrees, speed 18. Sniper, then pistol, then sniper: the next shot comes 1.283 s after the
  first (the `fire()` hook shot is logged one tick early), then every 1.300 s. With rifle or SMG in between it is the same.
  Ruler lanes x 92.6 to 95.4 every 0.1, both rulers, walking and sprinting, each run up the ruler and then east onto the desk:
  116 of 116 reach the desk with 0 damage. 10,078 random throws, 1,298 of them with the old release point inside or touching a
  solid: 0 started inside a solid, 0 entered one, 0 left the room, 0 removed. `bug_r2_04_grenade.cjs` section B: all 20
  pressed-against cases start outside every solid and stay in the room. Section C: 1,200 throws, 0 inside, 0 out (its "disagree"
  rows compare against the old 110 damage). `bug_r2_08_grenade_wall.cjs` agrees.

### Item 2: SMG (fixed)

- SMG damage 20, spread 1.0 / bloom 0.20 / max 3.5. New per-weapon `moveMult` (SMG 1.15) replaces `gun.spreadMult.move` (1.5)
  for that gun only. SMG shot gains 0.9 and 0.5. The SMG viewmodel has a long yellow magazine and a wire stock
  (`builder_r2b_vm_smg_vs_pistol.png`).
- Time to kill, median of 60 trials, held trigger, aim put back on the body centre every tick, real spread and recoil
  (`builder_r2b_ttk.cjs`):

| Range | SMG stand | Rifle stand | SMG strafe | Rifle strafe |
| --- | --- | --- | --- | --- |
| 10 | 0.283 s | 0.317 s | 0.283 s | 0.317 s |
| 20 | 0.283 s | 0.317 s | 0.350 s | 0.417 s |
| 40 | 4.80 s (77 % kill) | 2.12 s (97 %) | 4.87 s (37 %) | 5.22 s (60 %) |
| 60 | 5.33 s (13 %) | 5.22 s (83 %) | 5.80 s (2 %) | 5.22 s (53 %) |

### Item 3: grenade (fixed)

- Damage 140. Burst: an additive sphere that grows to the 7 unit radius in 0.15 s and fades over 0.12 s; a ring of 72 sparks
  that travels at constant speed and stops exactly at the radius; bigger and faster burst particles; one point light that is
  dark until a burst and flashes for 0.18 s. Shake now scales with distance out to 40 units. The thrown grenade is not drawn
  until it is 1.3 units from the eye. There is no held-grenade model in the viewmodel, so the thrown body was what filled the
  screen. The arc preview is now a dotted line of instanced spheres, each 5 px on screen at any distance, with a 14 px landing
  dot and no dots nearer than 2 units. All numbers are in `CONFIG.grenade`.
- Measured: aimed throws from 6, 10 and 14 units burst 0.22, 0.21 and 0.23 from the dummy for 124.3, 123.7 and 123.5 damage, and
  kill it each time. Burst frames from 14 and 40 units: `builder_r2b_burst_14u_t1/t5/t9/t15.png` and `builder_r2b_burst_40u_*.png`.
  Arc: `builder_r2b_arc_floor.png`, `builder_r2b_arc_palewall.png`. Throw tick: `builder_r2b_throwtick_now_t1.png` shows no
  grenade, against `builder_r2b_throwtick_oldDrawing_t1.png` (`hideNear` 0) where it covers about a fifth of the screen.
- Draw calls: the burst adds one call (the sphere) while it shows. 12 at most during flight and burst, 11 while aiming.

### Item 4: handling (fixed)

- `recoilReturn` 0.8. Pistol spread 0.6, bloom 0.6, `recoverDelay` 0.12, falloff [30, 70, 0.5]. Sniper `scopeFov` 20. Scoped
  spread is a set value: 0.05 still or crouched, 1.5 moving, 4.0 airborne (`scopedMove`, `scopedAir`; stance multipliers are not
  applied on top). Sniper shot gains 0.8 / 0.7; fabric, book and card footsteps 0.75.
- Holding fire through empty on an automatic: one dry click and the reload starts, once per empty magazine. With no reserve it is
  one click per hold, not one per tick. R during a draw is buffered (also the `reload()` hook) and starts when the draw ends.
  Switching weapon drops the buffer.
- Measured (`builder_r2b_item4.cjs`): rifle drift 1 s after one tap 0.18 deg (0.36 with 0.6); three taps 0.54 (1.08); full
  magazine 5.4 (10.8). Scoped sniper spread 0.05 still, 0.05 crouched, 1.5 moving, 4.0 airborne; fov 20. Rifle and SMG held through
  empty: 1 dry click, reload 0.100 s / 0.067 s after the last shot, firing resumes when the reload ends. One hold drains all four
  rifle magazines (18.5 s). R tapped for 0.1 s inside the draw: rifle, pistol and sniper all reload when the draw ends.
- Time to kill, standing, 60 trials: at 60 units, rifle taps 0.717 s and paced pistol 1.417 s. At 101 units (from the Green
  tower), rifle taps 3.05 s (97 % kill) and paced pistol 4.68 s (35 % kill). The pistol no longer out-ranges the rifle.

### Item 5: readability (fixed as specified; see the note on Tan)

- Tan `#D9A75A` / `#A87C3A`, haze and page background `#D6DEE8`. Named view `bed_top` eye (31, 19.6, 80).
- Impact colours: wood `#E8C89A`, fabric `#FFFFFF`. On a face whose palette colour is within dE 30 of that colour, the impact
  uses an alternate colour instead: wood `#4A2E1A`, fabric `#5F78B0`. Colliders now carry the colour of their visual (the bed slab
  has separate top, side and bottom colours) so the choice is made per face.
- The muzzle flash is a child of the gun model, at its muzzle, so it follows the kick. It lasts `gun.flashTime` 0.05 s of
  simulation time (3 ticks), not a count of frames.
- Damage numbers start above the target's head. Each frame they are pushed out of a 34 px box round the crosshair and off each
  other (the oldest keeps its place). HUD text (weapon name, ammo, health, hint, damage numbers) has a 1 px dark outline.
- Measured (`builder_r2b_item5.cjs`, `builder_r2b_pixels.py`). Body pixel against the pixels just beside it, CIE76 dE, median
  over views, this build against a copy with the old Tan and haze:

| | 10 u | 60 u | 100 u |
| --- | --- | --- | --- |
| Tan now | 32.6 (8 views) | 37.0 (7) | 21.2 (3) |
| Tan old | 36.2 | 30.7 | 22.1 |
| Green now | 67.1 | 56.7 | 46.1 |

  Impacts, particle pixels against the surface pixels: wood on the floor 46.3 (old colour 6.1); wood on a desk leg 41.2; wood on
  a pale bed leg, alternate colour, 60.4 (old 45.8); fabric on the blanket 63.9 (old 61.0); fabric on the pale bed side,
  alternate, 39.5 (old 12.8); fabric on a pillow, alternate, 59.4 (old 9.0); fabric on the bear 40.8 (old 34.2).
  Flash: on the sniper muzzle tip in `builder_r2b_flash_sniper_tick0..2.png` and gone at tick 3; six renders with no tick between
  them still show it. Damage numbers: 4 shown, 0 overlapping, none over the crosshair, nearest 106 px from centre
  (`builder_r2b_numbers_pale.png`). HUD over the pale skirting: `builder_r2b_hud_palewall.png`.

### Regression (`builder_r2b_regress.cjs`)

All 18 routes ok walking and sprinting, with the same times and end heights as before and no damage. `validateWaypoints()` is
`[]`. Draw calls: 10 idle, 12 firing any gun, 11 aiming a grenade, 12 in grenade flight and burst. 26,014 triangles. 0 rescues.
`errors` is empty in every script. `builder_r2_input.cjs` (real mouse and keys) passes with no errors. `bug_r2_06_input_audio.cjs`:
all six audio variants (no AudioContext, constructor throws, stuck suspended, createGain throws, createBuffer throws, normal)
run with no errors.

### What to re-test

- Bug tester: R2-1 to R2-6, with the 10,000-throw fuzz. Note that `bug_r2_04` and `bug_r2_08` still expect 110 damage.
  Also: the apron from the seat side at x 95.5 to 96, where a lane outside the ruler now stops against the apron's end
  with no fall; holding fire through several magazines; R during a draw; switching mid-bolt.
- Feel tester: SMG against rifle by range, grenade payoff, recoil drift, the pistol at range, and listening to the new gains.
- Visual tester: Tan against backgrounds (see below), burst and arc, impacts on wood and fabric, sniper flash, damage numbers,
  HUD outline, `bed_top`.

### DESIGN.md items I could not do as written, and what I did instead

1. **"Fabric puffs white, at least dE 25 from the surface."** White is within dE 25 of the pale fabrics (bed side `#E9E4DA`,
   pillows `#E8EEF5`). On those faces the puffs use the alternate blue `#5F78B0`, and the same rule gives pale-wood faces (bed legs,
   shelves, ceiling) dark chips. Every measured case is at least dE 39.
2. **Scoped spread "0.05 still or crouched; 1.5 moving; 4.0 airborne"** is applied as set values. The crouch multiplier is not
   applied on top, so crouched and moving is 1.5.
3. **"The held grenade in the viewmodel never fills the screen."** There is no held-grenade model. The thrown grenade is hidden
   until it is 1.3 units from the eye, and the gun drops while aiming, as before.
4. **Holding fire through empty on an automatic** gives one dry click per empty magazine. With no reserve left it clicks once per
   hold, so a held trigger does not click every tick.
5. **Design note on Tan (not a deviation):** with the new Tan and haze, and my view set, Tan reads better at 60 units (37.0 against
   30.7) and about the same at 100 (21.2 against 22.1). At 10 units it is a little worse against the brown floor (32.6 against
   36.2), because the deeper tan is closer to the floor in lightness. Green is 46 to 67 at the same distances. The visual tester's
   larger view set should decide whether more is needed.

## Round 2, pass 3 (FIXLIST.md "round 2, pass 2", DESIGN 15.7)

Only the five items were touched. `index.html` is now 148,119 bytes. New scripts: `tests/builder_r2b_shaders.cjs` (shader
programs and burst frame time), `builder_r2b_skirt.cjs` (R2-7 and the angle sweep), `builder_r2b_tracer.cjs` (tracer
screenshots). `builder_r2b_ttk.cjs` now takes a list of distances.

1. **SMG damage 25 (fixed).** Median time to kill, 60 trials, held trigger, aim put back on the body every tick:

| Range | SMG stand | Rifle stand | SMG strafe | Rifle strafe |
| --- | --- | --- | --- | --- |
| 10 | 0.217 s | 0.317 s | 0.217 s | 0.317 s |
| 20 | 0.217 s | 0.317 s | 0.217 s | 0.417 s |
| 30 | 1.083 s | 0.617 s | 1.950 s | 2.417 s (95 % kill) |
| 40 | 2.417 s (85 % kill) | 2.417 s (95 %) | 4.683 s (62 %) | 5.300 s (58 %) |

   Standing, the SMG loses from 30 units. Strafing, it is still ahead of the rifle at 30 and level at 40.
   DESIGN 15.7 expects it to lose from 30, which holds only for standing.
2. **Fog 20 / 320 (fixed).** Tan is unchanged.
3. **Audio and tracers (fixed).** SMG gains 1.3 / 0.75, sniper 0.6 / 0.55. Tracers start at the current gun's muzzle after
   the kick: the muzzle point in viewmodel space is projected with the viewmodel camera and placed back in the world along the
   same screen ray. Per-weapon `tracerWidth` / `tracerLife` (sniper 0.07 / 0.2 s). Through the scope the tracer starts
   `fx.tracerScopeMin` = 3 units along the shot, and none is drawn if the hit is closer than that. Screenshots:
   `builder_r2b_tracer_rifle.png`, `_sniper.png`, `_sniper_scoped.png`. Seen through the scope almost end-on, the sniper
   tracer shows as a small bright square at the target.
4. **Shaders compiled at load (fixed).** `precompileEffects()` makes the arc, burst sphere, muzzle flash and all gun models
   visible, runs `renderer.compile` on both scenes, and restores them. `hideNear` 2.5, `flashOpacity` 0.4. WebGL
   `createProgram` count: 14 at load, still 14 after the first shot, aim and burst. A copy without the call goes 11 at load,
   13 after the shot, 14 after the aim, 16 after the burst. `render()` time, software rendering (relative only): first burst
   3.5 ms against 1.0 to 1.9 for later ones, and 10.2 ms without the precompile.
5. **Desk skirt (fixed).** `desk.skirt` `96..96.5, 73..87, 17..24.5`. R2-7 repro ends at (95.6, 17, 75.4), no fall, no damage.
   Angles 4 to 16 degrees toward the desk, x 94.6 to 95.4, both rulers, walk and sprint (252 runs): 0 falls. Ruler lanes
   x 92.6 to 95.4: 116 of 116 reach the desk.
   Not in this item: runs angled 12 to 16 degrees away from the desk walk off the ruler's open west side near its top (92 of
   252 runs). That geometry is unchanged.

Regression: all 18 routes ok walking and sprinting with no damage; `validateWaypoints()` `[]`; draw calls 10 idle, 12 firing
any gun, 11 aiming, 12 during a burst; 26,038 triangles; `errors` empty in every script; grenade repros unchanged (east wall
bursts at (112.68, 0.02, 80.6), dummy 21 keeps 100); 245 random throws, 0 started inside a solid, 0 left the room.

Re-test: feel tester, SMG by range (strafing at 30 and 40 especially) and the new gains; visual tester, Tan with the new fog,
first-use hitches, tracers; bug tester, R2-7 and the seat edge, routes.

## Round 3A: train, soldiers and bot movement (DESIGN.md 16.1, 16.2, 16.3, 16.7 3A list, 16.8, 16.9)

`index.html` is now 233,131 bytes (was 148,119). No combat, roles, match rules, weapon pick, HUD or menus yet. New scripts, all in
`tests/`: `builder_r3a_player.cjs` (lap, whistles, boarding, deck and roof laps, tunnel scrape, pushes, wedges),
`builder_r3a_nav.cjs` (30 minute nav test per seed), `builder_r3a_checks.cjs` (bullets, grenade, soldiers, carry-overs, draw calls,
sim cost), `builder_r3a_regress.cjs` (routes, `validateWaypoints`, every edge), `builder_r3a_audio.cjs` (real click, Web Audio
starts), `builder_r3a_stuck.cjs` (stuck ladder, leaving the envelope), `builder_r3a_seed.cjs`, `builder_r3a_range.cjs`,
`builder_r3a_longrender.cjs`, `builder_r3a_smoke.cjs`, `builder_r3a_navquick.cjs`, `builder_r3a_shots.cjs`, `builder_r3a_climbshot.cjs`.
Screenshots: `screenshots/round3/builder_r3a_*.png`.

### What was built

- **Train** (section 7 of the code). Engine, boxcar, flatbed, gondola, caboose. Every car front sits a fixed 13.5 of track behind
  the one ahead and moves at exactly 4 u/s. The rear is the centre-line point exactly 12 behind in a straight line, so front and rear
  are both on the centre line. `s = s0 + 4 * time` (`CONFIG.train.s0` 30), so the timing is learnable and identical every run. The
  train runs whatever the game phase.
  Colliders are oriented boxes (local u along the car, v to its left). Engine: hood (top 5) plus cab (top 6). Boxcar and caboose:
  body (top 5). Flatbed: deck (top 1.2) plus a 3 x 3 x 3 cargo block. Gondola: deck plus walls to 2.4 with a 3-wide door in the middle
  of each side. The parts join the existing wall, ground, ceiling, blocker and ray queries while `TQ.on`. Static-only callers turn it
  off: `validateWaypoints`, `trainClearance` and the push exit tests.
- **Riding.** A soldier standing on a car is carried by the car's motion each tick, before moving, and turns with it (yaw follow).
  On a car the velocity is relative to the car. Stepping or jumping off adds the car's point velocity; landing on a car removes it.
  The interpolation snapshot is taken before the carry, so riders render smoothly.
- **Push, never kill** (`trainPush`). The soldier goes sideways out along the car's v axis toward their side. If static geometry blocks
  that spot or the straight path to it, they go ahead of the car's front. If both stay blocked for 0.3 s, they are placed at the nearest
  free spot outside the swept envelope and logged in `trainRescueLog`. While a soldier is in a blocked push, the wall pass leaves out
  car walls (the push logic owns that overlap), so a car can never shove a soldier through a thin wall.
  No damage from the train in any case. Dead bodies are pushed too, but never logged.
- **Tunnel scrape** comes out of the existing wall pass. A standing roof rider's head band hits the roof's front face at z 68, so they
  slide back along the car and fall into the gap behind it, keeping the train's speed. The next car pushes them sideways into the
  tunnel's side clearance.
- **Bullets** stop at car parts (raycast in car space). Impacts use the car colour; no decals on cars (decals are static).
  **Grenades** bounce in the car's frame and keep its velocity. Tangential speed relative to the car is kept at `train.grenadeGrip`
  0.35, so a side hit picks up about 65 % of the car's speed. A grenade that comes to rest on a car rides with it. A car that drives
  into a grenade knocks it out through the nearest face.
- **Swept envelope.** One car is swept round the oval (step 0.1) into two 0.25 grids: the exact footprint, and the footprint dilated by
  0.6 (a soldier's body plus the cell size). `trainClearance()` sweeps every static collider against the real car rectangles.
  `trainClearance({band: true})` checks DESIGN's nominal band instead (13.5..19.5 round each curve centre, 2 either side of the straights).
- **Train audio.** A looping rumble (low noise and a 46 Hz hum) whose gain follows the nearest car (inverse distance) and whose pitch
  follows doppler (fake sound speed 60). Wheel clacks: when a car's leading axle crosses a rail joint (every 6), that car's four axles
  click in turn: one logged `train_clack` event with four hits, within 45 units of the player. `train_whistle` when the engine's centre
  passes z 80 on either straight. `sfx` now takes volume, pitch and delay (one value or a list).
- **Soldiers.** The dummy blockout (base, body, head) plus a blocky gun in team colour (glossy Phong). One InstancedMesh holds every
  part of every soldier (4 instances each), plus one chevron mesh. Animation: walk bob and sway from distance walked; crouch lowers the
  body and head (code path only, bots never crouch in 3A); the gun pitches with `pitch`; on a string the soldier faces the surface,
  sits flat against the string, gun slung down.
  Death is a rigid tip backwards about the back edge of the base (0.25 s) with plastic chips. Bodies stay and block neither movement
  nor bullets. Hit volumes are oriented head and body boxes, updated each tick with no allocation, and used by bullets and grenades.
  A green chevron over living Green bots within 60 units with line of sight, checked at 10 Hz per bot, staggered.
  The 21 dummies are out of play and hidden; `__game.range(true)` brings them back (hit volumes, drawing, state).
- **Bots** (section 10). Each bot is an actor with the player's fields, moved by the same controller. `tickPlayer` became
  `moveActor(actor, input, dt)`; the player calls it with the real input. Steering is the shared `steerTo` that `walkPath` now also
  uses. A* runs over the waypoint graph with DESIGN costs (length; climb x1.5, ramp x1.2, jump +4, cross +2; launch and drop one way).
  It uses typed arrays and a binary heap; paths without ride edges are cached. Ride edges (one way) are costed as the walking length
  plus the expected deck wait x 5 at the estimated arrival, and skipped when the wait passes 8 s.
  Strings and launches work exactly as in `walkPath`. A cross edge starts only if no car will reach that stretch of track within 3 s
  (track range of the crossing, train span, 2-unit margin). Bots sprint across. A bot inside the dilated envelope that is not riding,
  crossing or climbing walks to the nearest point outside it at once.
- **Ride edges** `ride.w` and `ride.e`, with wait nodes `w.ride.w` (46.5, 0, 104) and `w.ride.e` (73.5, 0, 56), linked by walk edges
  to `s.c.x` and `n.c.y`.
  Phases: wait at the node (leave if the next unclaimed deck is more than 8 s away); board (run for 0.1 s and jump across, timed so
  the deck's ride spot passes the bot: flatbed 3.75 behind the cargo block, gondola centre through the door); ride to the spot; step
  off when the deck centre passes z 58 / 98, toward (46.5, 0, 56) / (74, 0, 100); walk to `n.c.x` / `s.c.y`. One bot per deck car per
  pass (`car.claim`).
- **Stuck ladder** as DESIGN 16.3: 1.5 s jump, 2.5 s strafe 0.5 s, 3.5 s repath from the nearest node reachable in a straight line,
  6 s placed at the last reached node and logged. If a repath leads back onto the edge it stalled on, the time already spent counts,
  so a second stall there goes straight on to the logged placement instead of looping. A spring launch counts as progress.
- **Nav test**: `startNavTest({bots, seed})` spawns bots on random floor nodes, alternating teams. Each task is one of:
  - a timed ride, when the bot would reach a wait node with a deck under 8 s away;
  - the least used route in 4.4, walked node by node;
  - the least used edge direction;
  - a random stop node.

  `navStats()` reports per-edge-direction counts, kind counts, route counts, rides, crossings, waits, stuck and rescue counts, envelope
  seconds, evades, repaths, train contacts and contacts while waiting. Stop nodes exclude the pad and anything in the envelope.
  Bot randomness comes from `seed(n)`: the same seed on two fresh page loads gave identical bot positions after 300 s.
- **Hook** (16.7 3A): `state().train {s, speed, lap, length, whistles, rumble, cars [{type, pos, yaw, vel, sFront, claim}]}`,
  `trainClearance()`, `trainRescueLog`, `state().bots [{id, name, team, pos, hp, state, node, nextNode, edge, edgeKind, path, riding,
  ridePhase, climbing, weapon, stuckTime, dead, crouching, yaw, task, chevron, inEnvelope}]`, `spawnBot(team, nodeId)`, `startNavTest`,
  `navStats`, `stuckLog`, `range(on)`, `seed(n)`, and `state().riding` for the player.
  Extras: `botGoto(id, node, {ride, via})` (`via: 'ride.w'` forces a ride), `removeBots`, `stopNavTest`, `killBot`, `bots`,
  `trainGaps`, `trainStats`, `trainWhistles`, `fxStats`, `inEnvelope`, `trackS`, `trackPoint`, `trainAt(t)`, `deckWait(ride, t)`,
  `astar`, `nav()`, and the test-only `addTestBlock(x0, x1, z0, z1, h)` / `removeTestBlocks()` (collider only) for building wedges.
- **Carry-overs (16.8).**
  1. No tracer at all while scoped.
  2. Pistol shot gains a low body (triangle 230 to 70 Hz, g 0.6; lowpass noise 1100 to 260, g 0.55); jump gain 0.5.
  3. A green hand holding the red firecracker with a yellow fuse rises while a grenade is aimed (the gun still drops).
  4. Crayons shortened: see deviation 1.
  5. Tunnel roof `6.5..8`, walls `0..6.5`.

### Measured

| Check | Result |
| --- | --- |
| Console | `errors` empty on load, through 2 x 30 simulated minutes of nav test, through 5 minutes rendering every 0.5 s, and with a real click (audio running) |
| `trainClearance()` | `[]`. `{band: true}` also `[]` with the crayons at z 33 (four crayons inside the band at DESIGN's z 33.5). Tightest gaps to the swept path: crayons 0.845, `n.E-c` 1.31, tunnel walls 1.40 |
| Lap | 54.217 s measured at 1/60 s resolution (216.814 / 4 = 54.204) |
| Whistles | 5 in 120 s, at 0.87, 27.97, 55.07, 82.17, 109.27 s, alternating west and east: twice a lap |
| Board a flatbed from the floor (forward 0.1 s, jump) | riding `train.2.flatbed.deck`, health 100 |
| Full lap on the deck, no input | still riding at the end, never left the car, yaw turned 1 full turn, damage 0 |
| Jump off a riding deck | world velocity (0, -4) = car velocity |
| Full lap crouched on the boxcar roof (through the tunnel) | still riding, never left, damage 0 |
| Standing on boxcar roof / engine cab / caboose into the tunnel | stopped at z 67.6, scraped off, then (boxcar and engine) pushed sideways to (79.42, 0, 69.73) in the side clearance; caboose rider ends behind the train. Damage 0, no rescue; walked 7.3 units away afterwards |
| On the track ahead of the train | west straight: 1 side push. 1.2 off centre: 1 push to its own side. North curve: 55 side pushes. South curve outer side: 55. In the tunnel: 1 push into the side clearance (x 79.42). Tunnel, 1.5 west: 1 push to x 74.58. All damage 0, no rescues |
| Against each crayon's track-side face | not touched (0 pushes) |
| Wedge: test block right beside the straight | pushed ahead 51 ticks, then out sideways just past the block; damage 0, no rescue |
| Wedge: closed box of test blocks (both sides and ahead blocked) | 99 ahead pushes, then blocked 18 ticks (0.3 s), then 1 `trainRescueLog` entry placing the player outside the envelope. This is the forced fallback case; the real map produced none |
| `trainRescueLog` | 1 entry, from the closed test box only |
| Bullets | rifle shot at a passing boxcar hits `train.1.boxcar.body` at 5.0 and the Tan bot behind keeps 100; after the train passes, the same shot hits the bot for 26 |
| Soldiers | sniper headshot 180, bot down and tipped; the next shot through the body hits the shoebox behind it; a Green bot takes 0 from the player |
| Grenade off a moving boxcar | velocity (-17.99, -4.69, 0) before, (8.1, -1.77, -2.6) after; car (0, -4) |
| Nav test, 10 bots, 30 simulated minutes, seed 1 | kinds: walk 5675, ramp 621, climb 264, drop 208, jump 156, launch 26, cross 322, ride 53. 340 of 340 edge directions used, the least used 6 times. All 18 routes used, 11 to 36 times each. Rides: `ride.w` 23, `ride.e` 30, 0 aborts, 26 give-ups (deck claimed or wait over 8 s). Crossings by edge 18 to 81. Stuck 0. Train rescues 0. Envelope seconds while not riding or crossing 0. Train contacts with bots 0; while waiting 0. Deaths 0. 5.2 s wall time |
| Same, seed 2 | kinds: walk 5757, ramp 579, climb 245, drop 186, jump 137, launch 23, cross 334, ride 61. 340 of 340 directions, least used 6. Routes 12 to 29 each. Rides 30 / 31, 0 aborts, 31 give-ups. Crossings 25 to 80 each. Stuck 0, rescues 0, envelope 0 s, train contacts 0, deaths 0 |
| Stuck ladder (test wall across `n.c.3 > n.c.4`) | jump at 1.5 s, strafe at 2.5, repath at 3.5. Back on the same edge it stalls again; at 6 s total stall it is placed at `n.c.3`, with one `stuckLog` entry |
| Bot put on the west straight (train far) | sprints out the east side in 0.4 s, 0 train contacts |
| Draw calls | 15 with 10 soldiers and the whole train in view; 17 while firing the rifle; 14 at `spawn_green`. 30,902 triangles. Software rendering |
| Sim cost per tick (software headless, relative only) | 0.011 ms with no bots, 0.051 ms with the 10-bot nav test |
| Audio (real click, Web Audio prototypes wrapped) | 157 sources started over one whistle and train pass, 0 thrown errors. Rumble gain 0.35 beside the train, 0.028 at (110, 150); pitch 0.95 to 1.06. Pistol shot starts 4 sources, jump and land 11 |
| Routes | all 18 ok walking and sprinting, same times and end heights as round 2, no damage. `validateWaypoints()` `[]`. All 338 single-edge walks (every non-ride edge in each allowed direction) ok. `walkPath` refuses a ride edge with an error |

Screenshots looked at:
- `builder_r3a_train_floor.png`: engine coming up the west straight (cab and windscreen at the front, yellow stripe, headlight),
  boxcar and flatbed behind.
- `builder_r3a_bot_riding.png`: a Tan bot standing on the flatbed behind the blue cargo block, with the gondola and caboose behind.
- `builder_r3a_bot_group.png`: Green and Tan bots walking up the west lane with guns in hand; small green chevrons over the Green ones only.
- `builder_r3a_roof_into_tunnel.png`: the roof rider's view of the tunnel face.
- `builder_r3a_grenade_hand.png`: the hand and firecracker at the lower right with the arc preview.
- `builder_r3a_soldier_down.png`: a tipped soldier lying rigid.
- `builder_r3a_bot_climbing.png`: a bot on a shelf string.

### Waypoints and DESIGN items done differently, and why

1. **Crayons C-a end at z 33, not 33.5** (mirrored: from z 127). At 33.5 the near corner is at radius 19.24 from the curve centre.
   That is inside the 13.5..19.5 band DESIGN 16.1 says no static collider may sit in, and only 0.35 from the true swept path, narrower
   than a soldier (0.8). Measured at 33.5: two of three soldiers standing there were wedged and logged in `trainRescueLog`. At 33.0
   the corner is at 19.73 and the gap is 0.845: nobody standing there is touched.
2. **New drop edges `m.tunnel.top > m.c.e` and `m.tunnel.top > m.e.w`.** The tunnel top had no way out, so a bot that took
   `tunnel_drop` could never leave. Both drops are 8, under the safe 10.
3. **Wait nodes and ride edges added as DESIGN 16.3** (`w.ride.w`, `w.ride.e`, edges kind `ride`, one way). No existing node moved.
4. **Engine cab at the front** (diesel style). With the taller cab behind the hood, a standing hood rider scraped by the tunnel roof
   would be squeezed between the roof edge and the cab. Cab first, the rider drops from cab to hood and slides off the back.
5. **Gondola end walls** added (same 2.4 height), so a rider cannot walk off the end into the gap. Doors stay 3 wide in each side.
6. **One InstancedMesh for every soldier part**, not one per part: 2 draw calls with shadows instead of 8.
7. **Car spacing is fixed along the track** (fronts 13.5 apart), so every car moves at exactly 4 u/s. The gap is 1.5 on the straights
   and about 1.24 on the curves, where the inner corners of neighbouring cars overlap slightly (visual only).
8. **Push band for airborne soldiers** ignores parts within `move.airStep` of the feet, matching the wall pass that lets an airborne
   soldier mantle a 0.2 ledge. Before this, every boarding bot registered a 0.1 "push" as it rose past the deck edge.
9. **Friendly fire is already off** for the player's bullets and grenades against Green bots (16.4 lists it for 3B). It was one line
   and testing deaths needed a rule.
10. **Clack logging**: one `train_clack` audioLog entry per car per rail joint, only within 45 units. Near the track that is about
    3.3 entries a second, so the 200-entry `audioLog` holds about one minute. Scan it at least once a minute, or count whistles with
    `state().train.whistles` and `__game.trainWhistles`.

### Design problems found (for the lead)

- **Ride edges are never cheaper than walking.** Riding `ride.w` costs about 50 plus the wait x 5; walking the west lane from `s.c.x`
  to `n.c.x` costs about 52. So plain A* (`astar(..., {ride: true})`) picks the ride only when a deck is under about 0.4 s away. The
  nav test forces timed ride tasks. In 3B a role that should ride needs to ask for it (`botGoto(id, node, {via: 'ride.w'})`), or the
  costs need changing.
- **Cross edges block for a long time.** The train spans about 66 of the 217 units of track; add 12 for the 3 s look-ahead and margins,
  and a crossing is closed about 38 % of the time. Bots waited 157 times for 1,571 s in 30 minutes (seed 1), about 10 s per wait.
- **Ride throughput is low.** Two deck cars, one rider each, about 2 rides per lap per edge at most (53 and 61 per 30 minutes with 10 bots).

### Known weak spots

- Soldiers do not collide with each other or with the player; bots walk through each other at shared nodes and wait spots.
- Bots never crouch or sprint (except across the track) in 3A; the crouch animation path has not been seen in a screenshot.
- The gondola boarding is timing-based (run 0.1 s, jump). It boarded 116 times in the two nav runs with 0 misses, but has not been
  tried with lag or with other soldiers in the door.
- Rumble pitch steps when the nearest car changes (0.95 to 1.06 within a pass). Nobody has listened to the train sounds.
- Chevron line of sight is refreshed at 10 Hz, so a chevron can lag a tenth of a second behind a corner.
- `updateSoldierVisuals` allocates a small closure per soldier per rendered frame (render only, not the simulation).
- `addTestBlock` colliders have no visual and exist only for wedge tests.

### What to re-test

- **Bug tester:**
  - push and ride everywhere on the oval, standing, crouching and jumping;
  - the tunnel scrape from every car, the side clearance, and jumping on and off moving cars;
  - grenades on and against cars; bullets through the car gaps;
  - `trainRescueLog` must stay empty on the real map;
  - the nav test on more seeds, including `stuckLog`;
  - the new drop edges; walking into a moving car from the side and the end;
  - dummies only with `range(true)`.
- **Feel tester:**
  - lap timing and whistle as a cue;
  - boarding a deck from the floor (jump timing);
  - riding the curves (yaw follow);
  - the scrape; cross waits from a bot's point of view;
  - pistol body and jump gain.
- **Visual tester:**
  - train palette and readability, car overlap on the curves;
  - soldiers at range (Green against Tan), the tip-over, chevrons;
  - the grenade hand;
  - draw calls with 10 soldiers and the train in view.

## Round 3B: combat, team play, match rules, HUD and menus (DESIGN.md 16.4 to 16.7, 16.9, 16.10)

`index.html` is now 306,871 bytes (was 233,131). New scripts in `tests/`: `builder_r3b_matches.cjs` (runMatch per difficulty and
seed, with full summaries), `builder_r3b_balance.cjs` (many seeds), `builder_r3b_roles.cjs` (kills and deaths per role and team, deaths
by region), `builder_r3b_abtest.cjs` (balance with a live CONFIG override), `builder_r3b_ui.cjs` (real mouse and keys, screenshots),
`builder_r3b_fight.cjs` (firefight draw calls, screenshots, sim cost), `builder_r3b_idle.cjs` (matches without autoplay),
`builder_r3b_raycast.cjs` (R3A-1), `builder_r3b_smoke.cjs`. Screenshots: `screenshots/round3/builder_r3b_*.png`.

### What was built

- **Weapons are per soldier.** Every soldier carries an arsenal (the player's is the old `arsenal`), and every weapon function takes
  the shooter, so bots fire through exactly the player's code: fire rate, magazine, reload, spread, recoil, bolt, grenade throw.
  Player-only effects stay player-only: viewmodel, casings, hit marker, damage numbers, kill tick. Bot shots trace from the bot's gun
  and sound at its position. Each bot's spread is seeded from the match seed.
- **Soldiers can die.** Any soldier, the player included, has head and body hit volumes. `damageSoldier` handles teammates (they stop
  bullets and take no damage; a thrower's own grenade still hurts the thrower), kills, the kill feed and per-soldier stats.
  The player dies in a match (no respawn). Free play (`__game.start()`) still respawns the player as before.
- **Brain** (DESIGN 16.4), on top of the 3A navigation:
  - **Roles:** assigned by a seeded shuffle each round; with four Green bots, Centre is always filled. Primaries come from the role list.
  - **Round plan:** setup to the hold node; hold until 40 s or the team leads in soldiers alive; push along the lane to the enemy fort;
    hunt the team's last known enemy position in the last 30 s.
  - **Perception:** 110° cone, range per difficulty, line of sight to body then head against colliders and the train, at 10 Hz per
    soldier (staggered). Gunshots within 40 and being hit reveal the shooter.
  - **Engage:** reaction time; aim error that settles from acquire to settled, scaled by target speed / 7 and by 1.5 while moving;
    bursts (automatics) or single presses (pistol, sniper) with the difficulty's pause; head aim chance per burst.
  - **Engage details:** no burst while a teammate is in the line of fire. Snipers scope, crouch and stand still, and draw the pistol
    under 12 units. Strafing only onto ground at the same height and never into the envelope.
  - **Cover:** taken when hurt, or when the target is not in the open (only its head shows, or it is crouched). A node within 12 is
    prefiltered by the per-node 8-direction cover bits (precomputed at load) and checked for no line of sight at crouch eye height 1.0.
    At cover the bot crouches and peeks: stands 0.8–1.2 s and fires, crouches 1.0–1.8 s; it leaves after 6 s without contact.
  - **Flank:** when the target has held cover over 6 s, a bot that is not the closest teammate goes through the adjacent lane to the
    last known position.
  - **Retreat:** once per life, below the difficulty's health, to cover near the nearest teammate; it holds there until calm.
  - **Grenades:** at a known enemy behind cover 10–25 away, with the difficulty's chance. The arc is solved by simulating 13 pitches
    with the real grenade physics.
  - **Callouts:** Green bots, at most one per bot per 4 s and three on screen, from the region table in `CONFIG.regions`.
- **16.10 decisions:**
  - **Crossings:** the window is 1.5 s, and A* adds the expected wait at a closed crossing (`astar(..., {cross: true})`, wait x 5 per s).
  - **Centre ride:** in 35 % of rounds the Centre bot takes its team's ride edge when the wait is under 6 s. It holds up to 15 s for
    such a window, then walks.
  - **Flank ride:** a flank uses the team's ride edge when that route, wait included, is within 15 % of walking.
  - **Separation:** soldiers (player included) push apart under 0.9, never into a wall; bodies do not collide.
  - **Crouch:** in cover and while scoped, with a visible pose.
- **Match** (16.5):
  - **Rounds:** first to 5; rounds 2:30; 5 s freeze in which nobody moves or fires (round-end and match-end also freeze everyone).
    Everyone is reset at the fort spawns each round. No respawn. A round ends on elimination, or at 0:00 to the side with more standing.
  - **Replays:** equal at 0:00 is a replay that does not count. After three replays in a row, the next equal round goes to more total
    health remaining (equal health is another replay).
  - **Player death:** the camera tips with the body for 1.5 s, then spectates a living Green bot from its eye; left click cycles.
  - **End screens:** round-end screen 4 s. Match-end screen with winner, score and a kills/deaths table; Enter rematches at the same
    difficulty, Esc goes to the title.
  - **Autoplay:** gives the player brain fields and a role, so the player plays as a Green bot through the same code.
- **HUD and menus** (16.6):
  - **HUD:** round, timer, "GREEN n - n TAN" and five pips per side top centre; kill feed top right (killer, weapon, victim, team
    colours, HEADSHOT, last five, 5 s); callouts left; red damage arcs toward each attacker for 1 s; health and weapon show the
    spectated soldier while spectating; freeze-time picker with countdown; "Spectating Green 3" banner.
  - **Title:** Play, Recruit / Regular / Veteran, sensitivity and volume sliders, controls list.
  - **Pause on Esc:** Resume, sensitivity 0.2–3.0, volume 0–100, Quit to title. Settings, difficulty and the last primary pick persist
    in localStorage (wrapped in try/catch).
  - **Stingers:** round start, round end, win and lose jingles.
- **Esc-click fix (BUGS R1 finding 4):** the pause state follows the real pointer-lock state. Resume only asks for the lock and play
  resumes when it is granted, so a stale "released" event cannot pause a resumed game. The frame loop also resumes if it ever finds
  the game paused with the lock held.
- **Hook** (16.7 3B): `startMatch({difficulty, seed, autoplay})`, `state().match {phase, round, score, timeLeft, alive, difficulty,
  replays, freezeLeft, winner, autoplay, pick, spectating, playerDead, seed, lastRound}`, `runMatch({difficulty, seed, maxSimSeconds,
  autoplay})` (autoplay defaults to on; `errors` are exceptions caught inside the loop), `skipRound(winner)` (`'green'`, `'tan'`,
  `'replay'`, or nothing for the 0:00 rules), `killBot`, `setGodMode`, `botLog`, `killFeed`, `callouts`, `laneUse`, `highGroundTime`.
  Extras: `matchReport`, `spectateNext`, `pickPrimary`, `setSetting`, `settings`, `quitToTitle`, `rematch`, `pause`, `resume`,
  `setRoundTime`, `damagePlayer`; `state().bots` gains role, brainState, mag and kills; `state().player` gains dead and team;
  `state().app`, `state().pointerLocked`.
- **Fix BUGS R3A-1:** `__game.raycast` returns a soldier hit (`kind: 'soldier'`, id, team, zone) instead of throwing.

### Measured

| Check | Result |
| --- | --- |
| Console | `errors` empty in every script: matches, nav tests, UI with real input, page reload |
| runMatch, autoplay, recruit seed 1 / 2 | Green 5-3 in 9 rounds (wall 5.05 s) / Green 5-4 in 9 rounds (4.04 s) |
| runMatch, autoplay, regular seed 1 / 2 | Tan 1-5 in 7 rounds (2.55 s) / Tan 4-5 in 11 rounds (4.55 s) |
| runMatch, autoplay, veteran seed 1 / 2 | Green 5-2 in 9 rounds (4.18 s) / Tan 3-5 in 8 rounds (3.81 s) |
| Those six matches, rounds | 53 rounds: 31 ended by elimination, 16 on time, 6 replays (no health tiebreak). Durations 41 to 150 s; kills per round 4 to 9 |
| Those six matches, logs | `stuckLog` 0 and `trainRescueLog` 0 in every match; envelope seconds 0 |
| Those six matches, combat | Headshot share of kills 16.7 to 27.6 % (of soldier hits 11.5 to 17.6 %). Grenades thrown 2 to 11 per match. Rides 0 to 2 per match (0 to 6 attempts) |
| Lane use | In 5 of 6 matches both teams spent time in every lane (west, centre, east) and on the bed, desk and shelves. In regular seed 1 Tan spent 0 s on the desk and 6 s on the shelves. Full numbers in `builder_r3b_matches.cjs` output |
| Balance, autoplay, seeds 500 to 513 | recruit Green 6 / Tan 8, regular 8 / 6, veteran 8 / 6: 22 to 20 over 42 matches. Rounds 160 to 157, kills 1151 to 1119. 0 stuck, 0 rescues, 0 errors, about 3.8 s wall per match |
| runMatch without autoplay (player idle), regular seeds 31, 32 | Tan 5-3, Tan 5-4; the idle player died every round (0/9, 0/10) and spectated; 0 stuck, 0 rescues |
| Round paths (skipRound and timer) | One Tan killed, timer to 0: Green by "time". Three equal 0:00 rounds: replays 1, 2, 3. Fourth equal round with a Tan bot at 40 hp: Green by "health". The replays did not count (score 2-0) |
| Freeze pick, real input | key 2 SMG, key 3 sniper; locked left click cycles (sniper to rifle); clicking the SMG option with the mouse free picks SMG and equips it |
| Death and spectating, real input | camera tips for 1.5 s, then spectates bot.10; left clicks go to bot.11, then bot.12 |
| Pause and settings, real input | Esc: paused, mouse free. Pause sliders change sensitivity (2.0 to 1.4). Resume: playing, locked |
| Esc-click race | Esc then a click on Resume after 0, 10, 30, 60, 0, 10 ms: 6 of 6 end playing and locked, none paused-and-locked |
| Settings after reload | sensitivity 1.4, volume 40, veteran and pick SMG all survive a page reload |
| Results screens, real input | Match-end screen (Green 5-0, mouse freed). Enter: new match in freeze, locked. Esc on a match-end screen: title, bots removed |
| Draw calls, full live round from the autoplayed player's eye, every 0.25 s (600 frames) | max 17, mean 14.3, max triangles 31,014. Software rendering |
| Sim cost per tick, live veteran match, 10 soldiers | 0.101 ms (software headless, relative only). 3A nav test 10 bots: 0.047 ms |
| Routes | all 18 ok walking and sprinting, no damage, same times as round 2. `validateWaypoints()` `[]`. 338 single-edge walks ok |
| 3A regressions | nav test, 10 bots, 30 minutes, seeds 1 to 3: all 340 edge directions, every kind, route and crossing; 0 stuck, 0 rescues, 0 envelope seconds, 0 train contacts, rides 27 / 36 / 14. Player train tests (laps, scrape, pushes, wedges) and bullet, grenade and carry-over checks unchanged |
| R3A-1 | `raycast([59, 1.6, 60], [0, 0, -1])` with a bot at n.c.3 returns `{id: 'bot.1', kind: 'soldier', team: 'green', zone: 'head', distance: 7.775}` |

Screenshots looked at:
- `builder_r3b_title.png`: title with Play, the difficulty buttons, sliders and controls. The HUD showed through behind it; now hidden
  on the title.
- `builder_r3b_freeze_picker.png`: top bar with round, 2:30, score and pips; the three choices with the selected one in yellow; countdown 5.
- `builder_r3b_firefight.png`: autoplay view from the bed. Kill feed "Green 3 RIFLE Tan 2 HEADSHOT" and "Green 1 SMG Tan 3", three
  callouts on the left, pips 4 and 3. No enemy happens to be in frame.
- `builder_r3b_spectating.png`: from Green 1's eye behind the fort wall, the banner, the bot's SMG ammo in the HUD.
- `builder_r3b_crouched_bot.png`: a crouched Green sniper, body visibly short.
- `builder_r3b_match_end.png`: "GREEN WINS", 5-0, the kills/deaths table, and the Enter and Esc buttons.

### Design items done differently, and why

1. **`__game.start()` stays free play** (no match), because the testers' round 1 to 3A scripts rely on it. The title's Play button
   and `startMatch` start a match.
2. **Bed role setup route goes through the team's own climb** (Green the blanket slope, Tan the book stairs; `roles.bed.*.via`).
   The south stairs are about 38 units longer (foot at z 144.5 and the walk round the pillows), so plain A* sent Tan's Bed bot up the
   west lane to the spring pad. That made the west lane two against one: Tan won 32 of 40 matches. With the route: 22 to 20 over 42.
3. **Separation swirl only head-on.** A sideways push breaks the corridor deadlock that separation alone caused (2 stuck entries in
   the nav test). Applied always, it shifted fights toward Tan (1-5 in both directions against 4-2 without), so it now applies only
   when two soldiers are closing faster than 1 u/s.
4. **Replay rule reading:** three replays in a row are allowed; the fourth equal 0:00 goes to total health, and equal health replays again.
5. **Freeze pick by click:** with the pointer locked, a left click cycles the pick (DOM options cannot be clicked while locked); with
   the mouse free, clicking an option picks it.
6. **No stopping on strings, rides, crossings or the track.** The brain lets the navigation run there and fights only once off.
7. **"Target not in the open"** is read as only the head visible, or the target crouched.
8. **Callouts:** "Enemy at their fort" is the Tan fort (Green callers). "Last one" when Tan is down to one.
9. **Round-end and match-end freeze everyone**, like freeze time.

### Design problems found (for the lead)

- **Rides are rare** even with the 16.10 rule: 0 to 2 per match from 0 to 6 attempts. The Centre bot has to survive to push time, a
  deck must come within 6 s, and a bot that sees an enemy while waiting fights instead of boarding.
- **Many rounds run the full 2:30:** 22 of 53 in the six reported matches (16 on time, 6 replays). Each side holds until 40 s, and
  hit rates are about 8 to 10 % of shots.
- **Tan's longer way onto the bed** (above) is a map asymmetry; with the forced route Tan's Bed bot simply arrives later.
- **The east side is a sniper lane from fort to fort:** in a traced round both High-east snipers hit each other within 10 s of the
  start (about 119 units).

### Known weak spots

- Spectating from a bot's eye shows that bot's own gun box at the bottom of the frame (its head is culled).
- Separation never pushes into a wall, but it does not check for ledges; two soldiers at a desk or shelf edge could nudge one off.
- Bots compensate recoil perfectly (the aim is re-set each tick); their inaccuracy is the designed aim error plus weapon spread.
- Real browsers refuse a new pointer lock for about a second after Esc; a quick Resume click then leaves the game paused with the
  mouse free (the allowed outcome) until clicked again. Headless grants the lock at once, so only that case was run.
- Nobody has listened to the stingers, jingles or bot gun sounds; they were only checked for names and for not throwing.
- HUD sizes are fixed in pixels.

### What to re-test

- **Bug tester:**
  - full matches on each difficulty (`runMatch` and real play);
  - player death into spectating, cycling, the round end with the player dead;
  - replay and tiebreak paths; pause, quit and rematch; settings with storage blocked;
  - the Esc-click race;
  - friendly fire; grenades on teammates and on the thrower;
  - stuckLog and trainRescueLog during matches; R3A-1.
- **Feel tester:**
  - each difficulty against the player: reaction, aim, bursts, how often bots take cover, flank and throw;
  - round length and pace (many full 2:30 rounds); the east sniper lane;
  - freeze pick, callouts and kill feed readability.
- **Visual tester:**
  - HUD, title, pause, picker and results screens, damage arcs, the spectate view;
  - crouch pose and chevrons in a fight;
  - draw calls in the busiest firefights.

## Round 3, pass 2

Builder fix pass on the five FIXLIST items (DESIGN 16.11). Only `index.html` changed in the game; new scripts are
`tests/builder_r3c_*.cjs` (`live`: stepped position detector and pacing numbers; `checks`: R3-1 repro, R3-3, R3-4, R3-5,
R3-6; `balance`: wins, rounds and kills per lane per side; `east`: early east-lane kills on any build; `map`, `rides`, `shots`).
The testers' scripts and `snapshots/` were not edited.

### Changes

1. **Bots never freeze (R3-1, R3-2, R3-3):**
   - **R3-1 (sniper frozen in engage):** snipers now stand and scope to fire and crouch only while cycling or reloading, an
     empty magazine reloads, and every fire, scope or reload marks the bot active. Engage gives up after `lostAfter` 3 s without
     sight and chases the last known position. A bot that has camped for 15 s relocates (below).
   - **R3-2 (push and hunt bots idle at the enemy spawn):** at the end of a push or hunt path the brain had no next goal.
     `brainPathDone` now always moves on: a push hands over to the hunt, and a hunt goes straight to the next search node.
     Search nodes are in the enemy half, the oldest visited per team in `match.visit`, and claimed so two bots don't pick the
     same one. A chase or relocation resumes the plan, and `brainIdle` only lets a hold before push time stand.
   - **Liveness rule (16.11):** a living bot idle for over 5 s (under 0.5 units in 3D) outside allowed stillness gets an `idleLog`
     entry and a forced move. Allowed: freeze time, a hold before push time, active fighting (fired, scoped or reloaded in the last
     2 s), climbing or riding, a crossing or ride wait up to 8 s (a crossing wait over 8 s re-routes around that edge). A bot
     camping within 1 unit for 15 s relocates 4 to 12 units on its own level, or 3 to 20 units on any level from a perch.
     `idleLog` is in the hook and in `matchReport`.
   - **Start choice on a re-plan:** a re-plan no longer picks a start node across a stair lip (`segmentEndY`) or a straight walk
     through the train envelope (`reachableStart`). This removed the last 2 idle entries (an evade loop at the south crayon).
   - **R3-3:** `startMatch` resets the clock, the accumulator, the train pose and cars, live grenades, the bot id sequence and all
     held input before seeding.
2. **Pacing and awareness:**
   - `holdUntil` 20 (push earlier when leading), `huntLast` 60, `lostAfter` 3, `retreatCalm` 5.
   - Hunt searches unvisited nodes.
   - Hits and near misses (a shot passing within 3 units) alert a bot in any state: it looks at the source for 0.7 s, then fights,
     covers or retreats. Heard shots turn the head.
   - Visible live grenades within 8 units are fled (8.5 units).
   - Per-weapon engage ranges (SMG 40, pistol 50, rifle 90, sniper any): beyond range the bot closes in, re-planning every 3 s.
3. **Difficulty, east lane, train:**
   - Recruit preset: reaction 1.0 s, aim error 7.0 to 3.0 settling over 2.0 s, bursts 2 to 3, pause 0.9 s.
   - East lane: a cardboard toy box `m.E-d.toybox` (x 81.4–85, z 78.5–81.5, 2.5 high) blocks the fort-to-fort sightline.
     `m.e.w` was replaced by `m.e.cn` (84, 0, 75), `m.e.u` (89, 0, 80) and `m.e.cs` (84, 0, 85), routing under the chair.
     All three are at the DESIGN positions; none was moved. The tunnel drop now lands on `m.e.u`.
   - `rideChance` 0.6, `rideMaxWait` 8. The wish to ride now survives fights (`rideWanted`) and is re-checked every 2 s until
     the bot reaches the enemy half.
   - Whistle: same sound, pitch ×1.15 on the west straight and ×0.85 on the east.
4. **Visual:**
   - Spectating shows the watched bot's viewmodel and scope and hides its model.
   - Bodies tip and fade toward grey (`bodyTint` 0.5) with the gun lying flat.
   - Climbing: no base, leaning in, arms up, gun slung.
   - Train: underframe, bogies and wheels at `wheelY` 0.68; the engine rear trim and gondola door posts were offset 0.03 to stop
     z-fighting.
   - The grenade burst sphere is rendered once at opacity 0 during load.
5. **Rules and callouts:**
   - R3-4: after three replays an equal 0:00 goes to total health, then to round damage (reason `damage`), else the round is drawn
     ("ROUND DRAWN", no point, replay count reset).
   - R3-5: spectating starts after 1.5 s.
   - R3-6: every callout obeys one per bot per 4 s, and the same "Enemy …" text is not repeated within 8 s by anyone.
   - Lane callouts say "our side" or "their side"; "I'm hit" once per life.

### Measured

| Check | Result |
| --- | --- |
| Position detector (`builder_r3c_live`: living bot under 0.5 units for 37 s in a live round, stepped every tick), 16 matches per difficulty, seeds 1000–1015 | frozen periods recruit 0, regular 0, veteran 0. `idleLog` 0 / 0 / 0, `stuckLog` 0 / 0 / 0, `trainRescueLog` 0 / 0 / 0, errors 0 |
| Bug tester's `bug_r3_01_matches.cjs`, regular seeds 1 and 2 | 0 "stationary over 62 s" entries. stuckLog 0, trainRescues 0, same=true, errors []. Its other categories: 14 "stall >12 s", nearly all in engage with the last shot under 4 s before; 9 "enemy in view 3 s, never fired" at 57–120 units, mostly beyond the engage range; 1 "never left spawn" (Tan 5 in round 6, traced: crossed the map, pushed, hunted and came back to fight at its own spawn); 6 "inside a static solid" on the desk-top climb, the known BUGS line 164 case |
| R3-1 repro, recruit seed 201 autoplay, at 40 s | Tan 2 and Green 3 snipers in engage; in the next 20 s each fired 5 shots and moved 11.9 and 13.4 units |
| R3-3, regular seed 1, three times in one page | identical: Tan 5-2, 7 rounds, 633.5 s, 53 kills, 0 idle |
| Rounds to 0:00 and median length (16 matches each) | recruit 14.6 % (18/123), median 116.7 s; regular 4.0 % (5/124), 80.0 s; veteran 1.7 % (2/118), 80.1 s. Recruit seeds 2000–2039: old 3B build 46.7 % (161/345 time or replay), new 14.8 % (47/318) |
| Damage per second, rifle duel (`feel_r3_duel`, 16 trials) | Recruit 50.8 at 10 units, 13.0 at 30 (3B: 93 and 37); Veteran 135.5 and 49.4 |
| Early (first 20 s) east-lane kills over 50 units, per round | 6 seeds each, 700+: old build recruit 0.34, regular 0.30, veteran 0.12; new 0.05, 0.11, 0.19. 16 matches (seeds 1000+): new 0.057, 0.097, 0.271 |
| Rides per match (16 matches) | recruit 0.44 (7 of 35 tries), regular 0.19 (3/25), veteran 0.19 (3/23) |
| R3-4 forced ties | replay 1, 2, 3, then `draw` with replays back to 0, then replay 1 |
| R3-5 | spectating after 1.517 s |
| R3-6 | 55 callouts in a match, 0 under 4 s apart from one bot, 10 "I'm hit" |
| Routes | all 18 ok walking and sprinting, no damage. `validateWaypoints()` `[]`. 342 single-edge walks ok (the new east edges included) |
| startNavTest, 10 bots, 10 minutes, seeds 1 and 2 | every edge kind, route and crossing used, 344 edge directions, 0 stuck, 0 rescues, 0 envelope seconds, 0 train pushes, rides 10 / 15 |
| Draw calls (`builder_r3b_fight`, 120 frames of a live round) | max 15, mean 14.9, max triangles 31,286. Sim 0.23 ms per tick |
| File size | 326,450 bytes (3B: 306,871) |
| Console errors | `[]` in every script |

**Balance** (`builder_r3c_balance`, autoplay, seeds 2000–2039 per difficulty = 120 matches; kills by victim region):

| Difficulty | Wins G / T | Rounds G / T / none | Kills G / T | Rounds to time or replay |
| --- | --- | --- | --- | --- |
| Recruit | 12 / 28 | 130 / 171 / 17 | 1061 / 1192 | 47 of 318 |
| Regular | 23 / 17 | 161 / 141 / 13 | 1194 / 1123 | 14 of 315 |
| Veteran | 20 / 20 | 150 / 147 / 4 | 1092 / 1092 | 7 of 301 |
| **All 120** | **55 / 65** | **441 / 459** | **3347 / 3407** | |

| Kills per lane | west | centre | east | desk | bed | shelves |
| --- | --- | --- | --- | --- | --- | --- |
| By Green | 1067 | 1035 | 923 | 147 | 142 | 33 |
| By Tan | 1019 | 1074 | 911 | 190 | 185 | 28 |

The Recruit 12–28 was not repeated. On seeds 3000–3039 Recruit went 19 / 21 (rounds 154 / 154). On seeds 2000–2039 the old 3B
build went 20 / 20. So Recruit over 80 matches is 31 / 49 and all 160 matches are 74 / 86. Neither side is clearly ahead and no
lane is lopsided. Tan's 190 desk and 185 bed kills against Green's 147 and 142 are the largest gap.

Screenshots looked at (`screenshots/round3/`):
- `builder_r3c_spectating.png`: "Spectating Green 1" from Green 1's eye. Its rifle is in the viewmodel, the HUD shows its ammo
  (24/90), and no part of its own model is in the frame. The callout reads "Enemy west lane, their side".
- `builder_r3c_body.png`, `builder_r3c_body_close.png`: a Tan body lying flat on the floor next to a living Tan bot. The body is a
  visibly duller, greyer tan. Its gun was not visible in either shot (under the body or behind the viewmodel), so the flat gun was
  not confirmed by eye.
- `builder_r3c_climbing.png`: a Tan bot high on the tall-shelf string, seen from below. It is off the string's line and leaning in.
  From this angle the arm and slung-gun pose cannot be read.
- `builder_r3c_train_wheels.png`: a flatbed from floor level. Red wheels sit on the rails under the deck, with a dark bogie
  between them. Nothing flickers on the visible faces.

### Done differently, and why

- The new east nodes are at the DESIGN positions; none needed moving.
- Snipers stand to fire. Crouching scoped while waiting was the R3-1 freeze.
- A camping bot relocates after 15 s, even in engage. Without this, 13 Recruit perch campers counted as frozen.
- The ride wish persists until the bot reaches the enemy half. Deciding once at push time gave almost no wait-node arrivals.
- The whistle keeps the one sound name `train_whistle` and changes pitch per straight.
- Callouts: "Enemy down" and "I'm down" also obey the 4 s limit. The north fort counts as a lane for "our side" / "their side".

### Design problems (for the lead)

- **Rides are still rare** (0.19 to 0.44 per match). A deck reaches the Centre's wait node within 8 s of push time only about a
  fifth of the time. That wait node is behind the hold, and fights interrupt the walk. Suggestion: let the Centre time its push to
  the next deck.
- **Veteran early east kills did not fall** (0.12 to 0.19 and 0.27 per round on the two samples). The toy box blocks the corridor
  ray, but Veteran snipers still find angles past it from the forts.
- **Recruit rounds are long** (median 117 s against 80 s on the other difficulties). They are within the 20 % time target.

### Known weak spots

- Shot-in-the-back reaction was built but not measured with a script in this pass.
- First-burst frame time was not measured (headless software rendering).
- The tester's "enemy in view, never fired" fires for rifles beyond 90 units and SMGs beyond 40 by design of the engage ranges.

## Round 4A: the world art pass (DESIGN.md 17.1 to 17.4, 17.6, 17.9, 17.10)

The world's visuals were rebuilt; colliders, waypoints and hit volumes were not touched. The 4B items (soldiers, guns,
viewmodels, train, effects, HUD, menus, audio) were not started.

New scripts:
- `tests/builder_r4a_budget.cjs`: hashes, load time, cost per view and in a firefight, main-pass triangles, growth. Runs on any build.
- `tests/builder_r4a_fit.cjs`: the 17.1 fit check in both directions.
- `tests/builder_r4a_shots.cjs`: screenshots.
- `tests/builder_r4a_regress.cjs`: matches plus the hash before and after.

### What was built

- **`__game.colliderHash()`.** An FNV-1a hash of every collider's id, kind, surface, bounds and shape numbers, in list order;
  colours and test blocks are left out. It was added first and gave `ff03369f` on the round 3 build.
- **Shared helpers** (new section 5b, `ART`):
  - **Seeded rng.** Art never touches the match rng.
  - **Canvas tile atlas.** One 2048 canvas holds 100 tiles, packed tallest first. Each tile has a wrapped 8 px margin.
  - **Atlas shader patch.** `atlasMaterial` uses fract() and textureGrad, so a tile repeats inside the atlas without seams.
  - **Mesh builder** (`MB`). Vertex-colour AO and transforms. Its shapes:
    - a 44-triangle chamfered box (`bev`) whose bevel strips can take a joint colour;
    - a cube-sphere rounded box (`soft`);
    - lathes, ellipsoids, hexahedra and oriented quads.
  - **Toon gradient.** 3 steps.
  - **Instancing helper.**
  - **Soft contact-shadow decals.** 9-slice, with fog-aware blending.
- **Materials.** One model per family:
  - Lambert: room, furniture, fabric, books, card.
  - Toon: toys, bricks, routes made of plastic.
  - Basic: the window view and the bulbs.
  - Lambert, separate: the floor, with its own repeating 1024 x 2048 plank texture.
- **17.3 room.**
  - Painted walls with a faint brush texture. Skirting with a rounded bead.
  - A door with six raised panels, a frame and a round knob.
  - The window with frame, sill, glazing bars and a painted warm outside view (sky, sun glow, hill, fence, tree, bushes, flowers).
  - The ceiling light: a cord, a drum shade with a darker rim and a glowing diffuser.
  - Planks in five tones with grain, knots and dark gaps.
- **17.3 bed.**
  - Painted frame and legs; a dark underside.
  - A rounded mattress in the striped sheet.
  - A quilted blanket over the top: diamond quilting, puffed diamonds, small stitches. It has a hem roll, and wavy drapes down the
    east side and the north end.
  - The ridges and the blanket slope in the same fabric.
  - Pillows: three soft terraces each, the top one plump.
  - Under the bed: shoebox with a lid, a striped sock, grey dust bunnies.
  - A rose-pink plush bear (seams, muzzle, button eyes, ears, arms, paw pads).
  - A squarish blue pail on its side, with a rim, a dark opening and a handle lying on the floor.
  - Spare grey statues.
- **17.3 desk, chair, shelves.**
  - Painted wood with soft edges.
  - Lamp: base, post, shade and a glowing bulb.
  - Mug with a band and a handle. Pencil cup with six pencils. Three stacked books. Open notebook with ruled lines.
  - Two-tone erasers. A crumpled paper ball. Push-pin seat stoppers.
  - Shelves:
    - boards and posts;
    - upright books in rows;
    - flat books;
    - a globe on a stand;
    - a chunky gold trophy;
    - a pink piggy bank (snout, ears, legs, slot);
    - a plant pot with leaves;
    - an alarm clock with a face, bells and feet.
- **17.4 toys, forts, routes, cover.**
  - **Forts and ruin.** Brickwork in about 1.1 courses with staggered 2.4 bricks, palette colours (72 % main) with ±5 %
    variation, and dark joints. 235 instanced studs sit on open tops; the slit sills are left plain so the slits read.
  - **Blocks.** Alphabet blocks with a letter on each face (40 letter tiles).
  - **Cars.** Three toy cars, as chunky vans filling their colliders: painted windows, bumpers, wheels. A dump truck with a load.
    A framed marble run with three marbles. A board game box with an abstract lid.
  - **Ball.** Two-tone gores.
  - **Crayons and dominoes.** Rounded-square crayons with wrappers and a short tip. Ivory dominoes with pips.
  - **East-lane crate.** A red painted crate with slats.
  - **Tunnel.** Corrugated card with darker cut ends and flaps.
  - **Track.** Wooden sleepers, steel rails with a head and a foot, and joint plates, all in one InstancedMesh.
  - **Routes:**
    - **Book stairs:** each layer is one long book, so every riser is a spine, with an orange cap on each step edge.
    - **Landings:** stacks of books.
    - **Stair guards:** rows of tall upright books.
    - **Under the rulers:** book stacks topped to the slope.
    - **Rulers and bridges:** markings.
    - **Skateboard:** red deck with grip, trucks and wheels.
    - **Strings:** yellow twisted strings. The shoelace is braided, with aglets. The yo-yo has two halves with its own string on
      the floor.
    - **Spring pad:** a squashed jack-in-the-box spring with a red pad and yellow chevrons.
- **17.6 light and atmosphere.**
  - **Sun.** The room shell no longer casts shadows (`art.shellShadow` false), so the sun lights the whole floor, and furniture,
    forts and toys throw long shadows across it. The shadow camera stays fitted to the room; one 2048 map.
  - **Tone mapping.** Neutral (Khronos), exposure 1, sRGB output, set once in `init`. Fog and the haze colour are unchanged.
  - **Sunbeam.** Not a light: the window prism swept along the sun to the floor. A shader measures how far each view ray
    travels through the beam, with soft edges and the part inside the bed removed, and draws it additively.
  - **Dust.** One Points object of 420 motes; 80 % start in the beam and are brighter there. They drift in the vertex shader.
  - **Fake ambient occlusion.**
    - A dark band at floor contact in the vertex colours, and darker vertices under the bed, the desk and the chair.
    - 1,602 soft decal quads: contact patches under everything on the floor, bed, desk and shelves; a strong patch under the bed
      and a lighter one under the desk; the floor along the walls; the foot of the walls; the four vertical corners.
- **17.10 carry-overs.**
  - **Sun shadows** reach most of the floor.
  - **Under the bed** is darker.
  - **The ceiling light** glows against the ceiling.
  - **Cover colours:** cover objects now have their own toy colours, none like the desk.
  - **The window** is warm.
  - **The bed book stairs:** an orange route ribbon runs over pillow P2 from its north foot to its south foot, with two chevrons
    pointing south. It can be seen from anywhere on the bed.
  - **Stale banners:** the section banners for 5, 7, 10 and 11 are refreshed.
- **Hook.**
  - `renderInfo()`: programs, textures, geometries, calls and triangles, plus the art stats: textures with estimated MB, tiles,
    triangles per mesh and family, load phases.
  - `artGeometry()`: art positions, used by the fit check.
  - `artDebug()`: test only. Hides meshes, sets anisotropy, or toggles the shadow map, for costing.
- **Colours.** All art numbers and colours are in `CONFIG.art` (palette in `CONFIG.art.palette`). Impact colours follow the
  art: `collider.color` is updated per object; this is not part of the hash.

### Measured

| Check | Result |
| --- | --- |
| `colliderHash()` | `ff03369f` on round 3 (HEAD~2) and on this build, before and after four full matches. Same 360 colliders. Waypoint hash `4f69a238` and hit-volume hash `a2308d9c` identical to round 3 |
| Routes | all 18 ok walking and sprinting, same times as round 3, 0 damage. `validateWaypoints()` `[]`. 342 single-edge walks ok |
| startNavTest, 10 bots, 10 minutes, seeds 1 and 2 | every kind, route, crossing and all 344 edge directions used; 0 stuck, 0 rescues, 0 envelope seconds, 0 train pushes, 0 no-path |
| runMatch autoplay: recruit 1, regular 1, regular 2, veteran 2 | Tan 5-3 (8 rounds), Tan 5-2 (7, the same result as round 3's R3-3 check), Green 5-3 (10), Tan 5-3 (8). All finished; stuck 0, idle 0, rescues 0, errors 0 in each |
| Console errors | `[]` in every script |
| File size | 434,951 bytes (round 3: 326,450) |

Budget (17.9). Both builds were measured in the same session, back to back, with SwiftShader at 1280 x 720. The render cost is the
median of 12 frames, each forced to finish with a 1-pixel readPixels.

| View | Draw calls r3 / r4 (shadow pass included) | Triangles, all passes r3 / r4 | Main-pass triangles r4 | Software ms r3 / r4 | Ratio |
| --- | --- | --- | --- | --- | --- |
| spawn_green | 14 / 23 | 31,202 / 167,818 | 95,512 | 151.0 / 275.2 | 1.82 |
| spawn_tan | 14 / 23 | 31,202 / 167,818 | 95,512 | 143.4 / 307.0 | 2.14 |
| bed_top | 14 / 23 | 31,202 / 167,818 | 95,512 | 131.4 / 354.2 | 2.70 |
| desk_top | 14 / 23 | 31,202 / 167,818 | 95,512 | 123.2 / 285.7 | 2.32 |
| shelf_top | 14 / 23 | 31,202 / 167,818 | 95,512 | 131.7 / 310.4 | 2.36 |
| floor_centre | 14 / 23 | 31,202 / 167,818 | 95,512 | 146.4 / 338.4 | 2.31 |
| under_bed | 14 / 23 | 31,202 / 167,818 | 95,512 | 134.5 / 206.1 | 1.53 |
| east_lane | 14 / 23 | 31,202 / 167,818 | 95,512 | 143.1 / 286.1 | 2.00 |
| west_lane | 14 / 23 | 31,202 / 167,818 | 95,512 | 154.1 / 286.0 | 1.86 |
| Firefight, regular seed 21, 120 frames | max 15 / 24, mean 14.9 / 23.9 | max 31,286 / 167,902 | max 95,596 | median 159.0 / 288.1 (p90 175.6 / 324.5) | 1.81 |

Notes on the budget:
- Every mesh is drawn in every view (`frustumCulled` false, as in round 3), so the counts do not change with the view.
- **Shadow casters:** 1 light, 2048 map.
- **Textures** (4 canvas textures and the 3-pixel toon gradient):

  | Texture | Size | Estimated MB with mips |
  | --- | --- | --- |
  | Atlas | 2048 x 2048 | 21.3 |
  | Floor planks | 1024 x 2048 | 10.7 |
  | Contact shadow | 64 x 64 | 0.02 |
  | Total | | 32.0 (limit 64) |

  The largest texture is 2048.
- **Shader programs:** 22 at load and 22 after the firefight frames and a full `runMatch`. All are compiled at load by
  `precompileEffects`.
- **Load time,** navigation start to `__game.ready` (in-page setter, median of 5 reloads): round 3 450 ms, round 4A 1,002 ms.
  - Inside `init`: world plus art 217 ms (art builder 217 ms on its own run), shader compile 384 ms, ready at 680 ms.
- **Growth over three regular matches:** programs 22 and textures 5 throughout. Geometries go 20, 21, 22, 22 as effect meshes are
  first drawn, then stay flat. JS heap 29.8 MB at every reading; Chrome rounds this figure, so it is only a rough check. The art
  adds no per-frame allocation: `updateArt` writes two uniforms.
- **Cost found on the way:** anisotropic filtering on the atlas cost 100 to 200 ms a frame in software rendering, so the atlas uses
  1 (`art.atlasAniso`); the floor keeps 8. Drawing objects before the shell (renderOrder) and the 44-triangle bevel (was 108)
  halved the art's triangles.

**Fit (17.1)**, measured by `builder_r4a_fit.cjs`:
- **Reverse check:** 30,169 points were sampled on every exposed collider face, and a ray along the normal must meet art
  within 0.15. 173 miss (0.6 %):
  - globe 64 of 65 and ball 56 of 65 (see the list below);
  - the four crayons 12 of 125 each, at the corners of the tip-end face, up to 0.54 inside;
  - the two low ruin stubs 2 of 100 each, rays landing exactly on a brick joint line;
  - the paper ball 1 of 65, at 0.16.
- **Forward check:** 2,421 of 32,537 art vertices are more than 0.15 from every collider. Every cluster is listed below.

Visual parts more than 0.15 outside their collider, and why each is harmless:

| Part | Out by | Why harmless |
| --- | --- | --- |
| Desk lamp shade, arm and bulb | up to 6.3 | y 39.8 to 46, 12 to 18 above the desk top: above head height |
| Pencils in the pencil cup | up to 5.6 | y 38 to 40.6 on the desk: above head height |
| Ceiling light (cord, shade, diffuser) | 5.6 | at y 84 to 90 |
| Plant leaves on the small shelf L1 | 4.4 | y 24.6 to 28.4, 4.6 or more above the shelf board: above head height there |
| Shoelace aglet and all string tops | 2 to 3 | strings are drawn 2 above their top surface by design since round 1 (DESIGN 4.4) |
| Tunnel flaps | 2.2 | y 9 to 9.9, on top of an 8-high roof |
| Door frame, panels and knob | 0.32 (knob 2.05 at y 36) | door is visual only since round 1; trim is thinner than the player radius, the knob is above head height |
| Window sill and frame | 1.5 | y 34.5 and up |
| Skirting and its bead | 0.36 | thinner than the player radius (0.4), so the camera never enters it; shots stop on the wall behind |
| Skateboard trucks and wheels | 1.1 | under the deck: at the top end above head height, at the bottom end where the deck is too low to walk under |
| Mug handle | 1.0 | faces the wall, at the desk's back edge |
| Trophy handles | 1.0 | on the top shelf L3, 5 to 7 above the board |
| Bear ears | 0.85 | on top of the head (y 15.3 to 15.9), at its back corners |
| Alarm clock bells | 0.85 | y 44.3 to 44.8, above head height on L2 |
| Marbles on the marble run | 0.84 | on top of the 4 and 8 high blocks, which no route reaches |
| Ball | 0.6 | DESIGN 6 gives a sphere r 4 over a cylinder collider r 3.4, as in rounds 1 to 3. The sphere bulges 0.6 past the cylinder at mid height, and the cylinder's top and bottom rims stand out from the sphere (the 56 reverse misses) |
| Globe | (reverse only) | a sphere on a stand inside a cylinder collider r 4, y 40 to 50, on the tall shelf L2 against the wall |
| Piggy snout | 0.55 | y 24.5 on L1, above head height there |
| Bucket handle and shoelace end on the floor | 0.22 to 0.31 | lying flat on the floor, below the 0.65 step-up; nothing collides with them |
| Track (rails, sleepers, joint plates) | 0.3 | the track has never had a collider (DESIGN 7) |

### Screenshots looked at (`screenshots/round4/builder_r4a_*.png`)

The nine named views:

| View | Reads well | Weak |
| --- | --- | --- |
| spawn_green | Blue and white brick slits frame the lane. Planks with grain and gaps. The red and blue crayons, the train and the toys are distinct down the lane; the bed's quilt and the window view are at the top right | the far ceiling is a flat beige |
| spawn_tan | The red Tan fort with white and grey bricks and dark joints, the purple caboose, the crayons, the bed's sheet and blanket on the left | none noted |
| bed_top | The desk, chair, lamp and pencil cup; both shelves with book stairs, upright books, globe and trophy; strings; the tunnel box | the blanket in the foreground is a large plain blue area |
| desk_top | The window glows warm with tree, fence and flowers; a soft sunbeam falls from it. The quilt and its hem drape, the dark space under the bed, the floor toys and track. Sun shadows on the floor | the chair back fills the left third |
| shelf_top | Window, door with panels and knob, the bed with P2's orange ribbon and the book stairs, the sunbeam | the shelf board in front is very bright in the sun |
| floor_centre | Orange, purple and white ruin bricks with joints, the ball, blocks, the tunnel's card | eye level hides the studs |
| under_bed | Dark floor and a dark underside; dust bunnies, the striped sock, shoebox, bear and blanket slope at the end | the underside's wood grain is still visible |
| east_lane | The skateboard (red sides, grip), the chair's book stairs, the desk legs, a letter block and the yo-yo string | none noted |
| west_lane | Letter blocks, purple and yellow cars with wheels and windows, the quilted blanket slope, the bear's face, the window | none noted |

The extra views:

| View | Reads well | Weak |
| --- | --- | --- |
| Sunbeam with dust (`sunbeam_dust`) | Whole room: the beam shows as a warm shaft from the window, the toys throw shadows east | at 1280 x 720 the dust motes are only faint dots |
| Under the bed (`under_bed_side`) | It is clearly dark compared with the lit floor outside | none noted |
| Desk top (`desk_top_close`) | Lamp, banded mug with handle, three books with spines and pages, notebook | the ruled lines are lost at this grazing angle |
| Fort close up (`fort_close`) | Blue, white and grey stud bricks, studs on the tops, the red crayon | the bricks look soft rather than crisp plastic at this distance |
| Ruin | Bricks, dominoes with pips, the game box lid | none noted |
| Floor toys (`floor_toys`) | Letter blocks, game box, cars, track and ruin bricks | none noted |
| Ceiling light | Reads as a glowing round fitting | the ceiling is a flat beige-grey |
| Tunnel and track (`tunnel_track`) | Corrugated ends and flaps, sleepers and rails, dominoes, a tall book landing | none noted |
| Firefight | A green soldier stands out cleanly against the red crate and the books; nothing in the world is green or tan | none noted |
| Bed pillows | P2's orange ribbon is visible from the middle of the bed, over the pillow | none noted |

### Done differently, and why

- **The sun lights the whole room.** Walls and ceiling do not cast, so the sun is not limited to the window. The beam volume and the
  window carry the "through the window" look. With the walls casting, only about 4 % of the floor could ever be lit.
- **Neutral tone mapping.** The sun now reaches pale surfaces everywhere, so highlights roll off instead of clipping. Mid colours
  are unchanged.
- **Shapes made to fill their box colliders** (17.1):
  - Cars are chunky vans.
  - The tipped bucket is a squarish pail.
  - Crayons are rounded-square with a short blunt tip.
  - The trophy is a chunky barrel cup.
  - The piggy bank is a soft box with a snout, ears and legs.
  - Soft edges keep a radius of 0.36 or less (0.15 from the outline). Soft boxes resting on a surface sink their rounded bottom
    edge below it.
- **Pillows stay three soft terraces** (top one plump). A smooth dome over the stepped collider would miss it by about 0.3.
- **The skateboard's top is red grip, not black.** It keeps the route readable. The deck sides are red.
- **The spare soldiers are rounded grey statues.** 17.3 asks for the 17.5 soldier model, which is round 4B.
- **`soldier.bodyTint` 0.7 is left for 4B.** The coordinator's 4A carry-over list does not include it.
- **The atlas uses anisotropy 1** for the software render cost (above).
- **Graybox visuals are still generated** by the round 1 helpers, then dropped. This keeps `buildWorld`'s collider code
  byte-for-byte as it was.

### Design problems (for the lead)

- **The ball and the globe have cylinder colliders under round shapes** (DESIGN 4.3 and 6). They are the two large misfits
  against 17.1. Changing their colliders is a gameplay change for a later round.
- **The stepped pillow colliders cannot look plump** within 0.15.
- **4B will add the soldier and train art and the effects** on top of 23 to 24 draw calls and 1.5 to 2.7x round 3's software
  render cost. That leaves room under the 3x limit, but not much in the bed_top view (2.70x).

### Known weak spots

- Nothing was measured on real hardware. All costs are SwiftShader numbers.
- The ceiling is a flat colour; the beam is subtle in small screenshots; the dust is faint.
- The forts' bricks read soft (toon shading on bevelled boxes) rather than crisp plastic.
- The paper ball and the crayon tips miss the fit by a little (above).
- The geometry count grows by 2 the first time effects are drawn, then stays flat.

### What to re-test

- **Bug tester:** `colliderHash()` against round 3; routes, nav and matches; shooting the edges of objects; the fit list above.
- **Visual tester:**
  - style consistency across all views;
  - the sunbeam, dust and contact shadows;
  - the window, the ceiling light and the under-bed darkness;
  - P2's ribbon;
  - team colours against the new world;
  - the budget numbers.
- **Feel tester:** whether routes still read at a glance (book stairs, rulers, skateboard, strings, spring pad, P2), and whether
  the busier world hides soldiers.
