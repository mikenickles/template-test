# FIXLIST.md: round 1, pass 1

Merged from BUGS.md, FEEL.md and VISUAL.md by the lead. At most 5 items. Fix these and nothing else.
DESIGN.md has already been updated to match; where this list and DESIGN.md agree, DESIGN.md has the numbers.

Gate status before this pass: PASS from both gate testers (bug: every route reached, up and down; feel: the
room feels huge, narrowly). There are no blockers. The two major bugs below still have to be fixed and re-checked
before the round is closed.

| # | Kind | Fix | Source | Re-check |
| --- | --- | --- | --- | --- |
| 1 | Major bug | **Strings: topping out re-grabs the string.** Holding forward up any shelf string, or a desk string approached from under the desk, puts you on the surface and hangs you back on the string 0.1 s later. After topping out, ignore forward until it is released and block re-grabbing that string for 0.5 s. Also remove the extra mid-air jump available within 3 ticks of letting go of a string. | BUGS 1, 5 | Bug tester: `teleport(110.5, 20, 130, Math.PI/2, 0); setInput({forward:true}); step(12)` must end standing on L2, not climbing. Same for all 8 strings, and the yo-yo from under the desk |
| 2 | Major bug | **Dead stop on route edges.** (a) In the ground-follow code, a step-up refused for lack of head room cancels the whole move and zeroes velocity; make it act as a wall you slide along. (b) Add the two stair guards (DESIGN 4.3) so the shelf-side edge of both shelf book stairs is closed, which also removes the unguarded drop under L1. (c) Add the two seat stoppers (DESIGN 4.2) so cutting the corner from the skateboard or chair stairs toward a ruler cannot slide you off the seat. | BUGS 2, 3; FEEL 6 | Bug tester: the three repro calls in BUGS 2 must reach the top. Feel tester: `tests/feel_ruler_trap.cjs` must show no falls and no sticking |
| 3 | Feel, pillar 1 | **Haze and light.** Fog near 10, far 220. Hemisphere fill sky `#FFF8EC`, ground `#D8CFC4`, intensity 3.0; sun intensity 3.0. Make `CONFIG.camera` and `CONFIG.fog` live (re-read when changed through the hook). Bed frame colour to `#E9E4DA`. | FEEL 1; VISUAL 1, 2 | Visual tester: walls read blue and the ceiling off-white in screenshots; bed is at least dE 20 from both Tan shades. Feel tester: far wall visibly paler than near |
| 4 | Feel, pillar 3 | **Strings worth using, routes visible from above.** `climb.speed` 5.5. `move.airControl` 0.12. Draw every string 2 units above its top surface, and lap the route colour 1.5 units onto the top surface at every ramp, bridge and stair head (DESIGN 4.4). | FEEL 2, 3, 7 | Feel tester: spawn to desk by yo-yo beats the stairs route; each way down can be picked out in a screenshot from the top surface |
| 5 | Feel, cover | **Cover gaps.** Add block W-c (mirrored) and block E-c (north only); crayons become jumbo crayons 1.3 high (DESIGN 6). Keep `validateWaypoints()` clean; you may move n.ub.e, n.w.5 and their south twins by up to 2 units. | FEEL 5 | Feel tester: no bare stretch over 14 units in the west lane or east lane north side. Bug tester: all 18 routes still pass |

## Conflicts resolved

- Field of view: stays at 75. The feel tester measured wider values shrinking the furniture, which costs pillar 1.
- Sprint speed: stays at 7. Sprinting wall to wall is 22.8 s against a 25 to 30 s target, walking is 31.9 s.
  Gunfire will slow real crossings in round 2; revisit then.
- Ball collider radius (visual wants 3.6, design says 3.4): deferred, see below.

## Deferred (not in this pass; carried into the round 2 brief)

| Item | Source | When |
| --- | --- | --- |
| Camera enters the skirting and door frame; thin the trim to 0.3 | BUGS 7, VISUAL 4 | Round 2 |
| Draw-call counter leaves out the shadow pass (3 shown, 5 real) | VISUAL 5 | Round 2 |
| Stair camera ripple; lower `player.stepSmooth` or collide stairs as ramps | FEEL | Round 2 |
| Esc then click within 30 ms leaves the game paused with the pointer locked | BUGS 4 | Round 3 (menus) |
| `walkPath` drives one-way edges backward and reports ok | BUGS 11 | Round 3 (bots use the graph) |
| Named views `west_lane` and `desk_top` are blocked by nearby geometry | VISUAL, builder | Round 2 |
| Grabbing a string cancels any fall for free | BUGS 8 | Round 2, lead to decide |
| Fort wall tops are walkable from the tower ramp | BUGS 10 | Lead: keep, it is a fun perch; revisit in round 5 |
| Ramps can be mounted from the side 0.45 higher than boxes | BUGS 9 | Round 5 |
| `tunnel_drop` takes 35 hp at crouch speed | BUGS 6 | Round 5 |
| Sun shadows cover only about 4 % of the floor; under the bed is as bright as open floor | VISUAL 3 | Round 4 (lighting) |
| Cardboard colour moved away from Tan in the palette | VISUAL 1 | Round 4 (already in DESIGN) |
| Tan's tall shelf is 20 units higher and sees more of the enemy half | FEEL | Round 5 (balance) |

## Pass 2 (one item)

Pass 1 result by the builder's own runs: items 1, 3, 4, 5 fixed; 2(a) and 2(b) fixed; 2(c) built but
`feel_ruler_trap.cjs` still shows 6 falls and 3 timeouts, because the fall happens off the east side of the
skateboard under the ruler, where a stopper cannot help.

| # | Kind | Fix | Re-check |
| --- | --- | --- | --- |
| 2(c) | Feel, pillar 3 | Add the two ruler props (DESIGN 4.2): solid book stacks under each ruler outside the seat footprint, so there is no gap between the skateboard or chair stairs and the ruler. Keep the stoppers where they are now. Pressing into the ruler's side from the seat is allowed to slide and stop; it must not drop you. | `feel_ruler_trap.cjs`: no falls. All 18 routes and `validateWaypoints()` still clean |

Graph change accepted: edge `w.5 - ub.e` removed on both halves (W-c sits on it).

## Round 1 closed: gate PASSED

Evidence, all on the fixed build:
- Bug tester re-check: bed, desk and tall shelf L3 reached by every route, up and down, walking and sprinting.
  Findings 1, 2, 3 and 5 confirmed fixed. No regressions. No console errors.
- Feel tester re-check: "the room feels huge" passes, more comfortably than before.
- Visual tester re-check: PASS. 5 draw calls with the shadow pass, 10,362 triangles, 85,035 bytes.

### Carried into round 2 (added to the Deferred table above)

| Item | Source |
| --- | --- |
| Jumbo crayons at 1.3 mask the fort firing slits; turn them north-south beside the gate path | FEEL re-check |
| Bed top clips to near white in the sun and the pillows vanish into it; bed underside too bright | VISUAL re-check A, B; FEEL re-check |
| Bed book-stairs head hidden behind pillow P2 from the bed top | FEEL re-check |
| Bear descent costs 25 hp at walk or sprint since `airControl` 0.12 | FEEL re-check |
| W-c funnels bed-side runners onto the spring pad | FEEL re-check |
| Desk side of both rulers is an open drop under the desk top below y 22.7 (up to 62 hp) | BUGS 12 |
| 14.2 bare units outside each fort east door | FEEL re-check |
| Spawn and centre-lane views still read as grey crates at eye level | FEEL re-check |
| Cover grey nearly matches the desk colour; ceiling light invisible against the ceiling | VISUAL D |
