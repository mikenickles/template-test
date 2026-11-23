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
