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
