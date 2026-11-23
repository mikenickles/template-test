# FIXLIST.md: round 3, pass 1

Merged from the "# Round 3" sections of BUGS.md, FEEL.md and VISUAL.md. At most 5 items. Numbers and rules are in DESIGN.md 16.11.

Gate status: FAIL on all three difficulties. Every match finishes and there are no blockers, but the bug tester's own
position check found 107 to 156 bot periods of 37 s or more without moving per 16 matches, mostly snipers frozen in
`engage` (R3-1) and late-round bots idling at the enemy spawn (R3-2). The game's `stuckLog` missed all of them.
Feel: playable and close to fair, not yet fun (rounds drag, east lane is a fort-to-fort corridor, Recruit too deadly,
bots deaf to being shot from behind). Visual: PASS, 16 draw calls in a full firefight, 307 KB, no leaks.

| # | Kind | Fix | Source | Re-check |
| --- | --- | --- | --- | --- |
| 1 | Gate blocker | **Bots never freeze.** Fix the sniper `engage` freeze (R3-1) and the late-round idle at enemy spawns (R3-2) at their causes, then add the liveness rule and `idleLog` (16.11). Make a seed reproduce a match: reset clock, train, bots and RNG on every match start (R3-3). | BUGS R3-1, R3-2, R3-3 | Bug tester: own position detector on 16 stepped matches per difficulty, 0 frozen periods; `idleLog` empty; same seed three times in one page gives one result |
| 2 | Feel | **Pacing and awareness.** `holdUntil` 20, `huntLast` 60, hunt searches unvisited nodes, react to hits and near-misses in every state, flee visible grenades, per-weapon engage ranges, `lostAfter` 3, `retreatCalm` 5. | FEEL R3 1, 4; pacing notes | Feel tester: share of rounds reaching time (target under 20 %), median round length, reaction to being shot from behind |
| 3 | Feel / map | **Difficulty, east lane, train.** New Recruit preset. East lane toy box and the re-route under the chair (new nodes). Ride chance 0.6 and max wait 8. Two-pitch whistle. | FEEL R3 2, 3; train notes | Feel tester: Recruit and Veteran damage per second at 10 and 30 units; early long-range east-lane kills per round; rides per match. Bug tester: routes and `validateWaypoints()` |
| 4 | Visual | **Spectating and bodies.** Spectate shows the watched bot's viewmodel and hides its own model. Bodies grey-tinted with the gun lying flat. Climbing pose. Train z-fighting and wheels. Burst geometry warmed at load. | VISUAL R3 1, 2, 3, 4, 5; FEEL spectating | Visual tester: spectate, body and train screenshots; first-burst frame time |
| 5 | Rules / polish | **Rules and callouts.** Health-tie rule (R3-4), death camera 1.5 s (R3-5), callout rate limit for every callout (R3-6), callout changes in 16.11. | BUGS R3-4, 5, 6; FEEL R3 5 | Bug tester: forced tie sequence; callout rate. Feel tester: callouts per minute |

Required with the hand-back (not a fix): a balance run of at least 120 seeds with autoplay across the three difficulties,
reporting wins per side, rounds per side, and kills per lane per side. The feel tester measured Green 38 to 22 over 60
matches while the builder measured 22 to 20 over 42, so the map is not changed for balance until a large sample agrees.

## Conflicts resolved

- East lane: the feel tester's box plus re-route over the cheaper "move the hold node" option, because the corridor hurts
  every role that walks the east lane, not only the snipers holding it.
- Bot accuracy (7 to 9 % hits): not raised. Per-weapon engage ranges remove the hopeless long-range shots instead, which
  keeps Recruit beatable (pillar 2: gun feel for the player matters more than bot accuracy).

## Deferred

| Item | Source | When |
| --- | --- | --- |
| North end of the bed top hardly ever contested; possible camping spot | FEEL R3 | Round 5 (balance) |
| West hold nodes only 10 units apart, so the west lane fights start in 5 to 8 s | FEEL R3 | Round 5 unless the balance run says otherwise |
| Bot animation quality at fighting range needs a human to judge | FEEL R3 | User playtest |
| Real browsers refuse a new pointer lock for about 1 s after Esc, so a fast Resume click leaves the game paused | builder | Round 5 (show a "click to resume" prompt) |
| HUD sizes in fixed pixels; two stale section banners in the code; code comments 36 KB | VISUAL R3 | Round 5 tidy |
| Rare 5-tick rifle gap (4 in 1,150) | BUGS R3 notes | Round 5 |
| Bodies sit inside a board for about 3 ticks when descending a string from the top | BUGS R3A-2 | Round 5 |

---

# Round 2, pass 2 fix list (done)

Gate status after pass 1: PASS, narrowly (feel re-check). Bug re-check: all six earlier findings fixed, 0 blocker,
0 major, 3 minor. Visual re-check: PASS, 12 draw calls firing, 146 KB. This short pass widens the SMG margin and
clears what the re-checks found. Numbers and rules are in DESIGN.md 15.7.

| # | Kind | Fix | Source | Re-check |
| --- | --- | --- | --- | --- |
| 1 | Feel gate | `smg.damage` 25. | FEEL re-check 1 | Feel tester: SMG vs rifle time to kill at 10 to 40 units, body and head aim |
| 2 | Visual, pillar 5 | Fog near 20, far 320 (Tan colour stays). | VISUAL re-check | Visual tester: Tan dE at 100 and 150 units in the build. Feel tester: room still feels huge |
| 3 | Feel | Audio gains: SMG 1.3 / 0.75, sniper 0.6 / 0.55. Tracers start at each gun's muzzle; sniper tracer thicker and longer; none through the scope at close range. | FEEL re-check 2, 3; VISUAL re-check 7 | Feel tester |
| 4 | Visual / perf | Compile effect shaders at load so first shot, aim and burst do not hitch. `grenade.hideNear` 2.5, `flashOpacity` 0.4. | VISUAL re-check new findings; FEEL minor | Visual tester: first-burst frame time vs later ones |
| 5 | Minor bug | Desk skirt panel `96..96.5, 73..87, 17..24.5` so sliding along an apron cannot drop you off the seat. | BUGS R2-7 | Bug tester: R2-7 repro and neighbours; routes |

Conflict resolved: the round 1 feel tester asked for near 10 / far 220 for depth (pillar 1); the visual tester
measures the far wall as slightly paler at 20 / 320 with the cool haze than it is now, so depth is kept and Tan
readability (pillar 5) is gained. The feel tester confirms on the build.

Deferred: R2-8 (grenade grazes a raised box corner by 0.1 in 0.2 % of throws), R2-9 (head 7.6 cm into the desk top
for one tick when sprint-jumping up a ruler), jump sound nearly silent, pistol shot mostly hiss, `desk_top` view
partly filled by the chair back, HUD sizes fixed in pixels, no hand or grenade model while aiming. All to round 5
unless the user's notes say otherwise.

## Round 2 closed: gate PASSED

Evidence, all on the final build (148,119 bytes):
- Feel tester re-check 2: every weapon passes. SMG 0.20 s against the rifle's 0.30 s at 10 and 20 units, loses from 30.
  Grenade eliminates within 1.5 units. Shot loudness balanced, nothing clips.
- Bug tester re-check 2: 0 blocker, 0 major, 0 new minor. All earlier findings fixed. No console errors.
- Visual tester re-check 2: PASS. 12 draw calls at worst while firing, shader programs flat from load, pooling holds.
  Tan reads at every distance (0 % of views under dE 15 at 100 and 150 units).

### Carried into round 3

| Item | Source |
| --- | --- |
| Scoped sniper tracer shows as a pale square over the target for 0.2 s; draw no tracer while scoped | FEEL and VISUAL re-check 2 |
| Pistol shot is mostly hiss; jump sound nearly silent (try gain 0.15 to 0.5) | FEEL re-check 2 |
| No hand or grenade model while aiming a grenade | FEEL re-check 2 |
| SMG crouched at 40 units is close to rifle bursts; watch once bots exist | FEEL re-check 2 |
| Turned crayons may reach the train envelope near z 36 and z 124 | builder |
| Remove target dummies when bots arrive; replace test keys 3, 4, 5 with the round-start weapon pick | design |

---

# Round 2, pass 1 fix list (done)

Merged from BUGS.md, FEEL.md and VISUAL.md (their "# Round 2" sections). At most 5 items. Fix these and nothing else.
DESIGN.md is already updated: section 12, the new section 15.6 (numbers and rules), carry-over 8 in 15.5, the
palette (Tan and haze), and three named views in section 10.

Gate status: FAIL. The feel tester passes the rifle, sniper and pistol and fails the SMG and the grenade.
No blockers. Bug tester: 0 blocker, 2 major, 4 minor. Visual tester: PASS on budget (12 draw calls firing, 136 KB).

| # | Kind | Fix | Source | Re-check |
| --- | --- | --- | --- | --- |
| 1 | Major bugs | (a) A grenade thrown while pressed against anything starts inside it and can leave the room: create at the eye, sweep to the release point, never start in a collider, remove any grenade outside the room. Also add the missing 10 degrees of upward throw. (b) Switching weapons skips the sniper bolt (shots every 0.70 s): the bolt timer must keep running across switches. (c) The desk apron blocks the desk-side third of each ruler: move the panels to `95.5..96` (DESIGN 15.5 item 8). | BUGS R2 1, 2, 3, 4 | Bug tester: the three repros; 10,000 random throws with none leaving the room; ruler lanes x 92.6 to 95.4 all reach the desk |
| 2 | Feel gate | **SMG gets a job.** Damage 20, spread 1.0 / 0.20 / 3.5, per-weapon moving multiplier 1.15 (DESIGN 15.6). It must beat the rifle's time to kill at 10 and 20 units standing and strafing, and lose to it by 40 units. Make SMG and pistol viewmodels differ at a glance. Raise the SMG shot gains. | FEEL R2 1, 5; VISUAL R2 | Feel tester: time-to-kill table by range, standing and strafing |
| 3 | Feel gate | **Grenade pays off.** Damage 140. Burst reads at its true 7 unit size (flash sphere, particle ring, light flash, distance-scaled shake). Thicker arc preview. The held grenade must never fill the screen on the throw tick. | FEEL R2 2; VISUAL R2 1 | Feel tester: a centred burst eliminates a full-health dummy; burst visible in a frame from 14 and 40 units. Visual tester: burst and arc screenshots |
| 4 | Feel | **Handling.** `recoilReturn` 0.8. Pistol numbers and falloff. Sniper scope fov 20 and scoped spread 1.5 moving / 4.0 airborne. Automatics dry-click then reload when held through empty. R buffered during draw. Sniper and footstep gains. All in DESIGN 15.6. | FEEL R2 3, 4, 5; BUGS R2 5, 6 | Feel tester: rifle taps at 60 units, pistol vs rifle past 60, held-through-empty behaviour |
| 5 | Visual, pillar 5 | **Readability.** Tan to `#D9A75A` / `#A87C3A` and haze to `#D6DEE8` so Tan reads at range. Wood and fabric impacts recoloured to contrast with their surface. Muzzle flash follows the kicked muzzle and lasts 0.05 s. Damage numbers offset from the crosshair and each other. Dark outline on HUD text. Named views per DESIGN section 10. | VISUAL R2 2, 3, 4, 5 | Visual tester: Tan vs background dE at 10, 60, 100, 150 units against Green; impact dE on wood and fabric |

## Conflicts resolved

- Grenade throw speed stays 18. The feel tester notes it cannot reach any high place; raising it breaks the level
  throw. High places are answered by climbing or the sniper. Revisit in round 5.
- The sniper stays one head shot at any range; that is its job (pillar 3: it rewards climbing).
- Haze colour moves from warm to cool. This costs a little of the warm-afternoon look (style) to gain Tan
  readability at range (pillar 5); the sun and fill light stay warm.

## Deferred

| Item | Source | When |
| --- | --- | --- |
| Grenade stops rolling almost at once; casings bounce at foot height only | builder | Round 5 |
| Decals are identical dark squares that look like tiles at point-blank range | VISUAL R2 | Round 4 |
| Bed book-stairs head hidden behind pillow P2 from the bed top | FEEL | Round 4 (pillows become soft shapes) |
| Tan snipers get clearer targets than Green ones, on top of the taller shelf | VISUAL R2 | Round 5 (balance) |
| Turned crayons may reach into the train envelope near z 36 and z 124 | builder | Round 3 (check when the train exists) |
| Grenade self-damage is on | builder | Lead: keep |
| Dummies do not block the player | builder | Fine; they are removed in round 3 |
| Esc then click within 30 ms; ramps mountable 0.45 higher from the side; `tunnel_drop` at crouch speed | BUGS R1 4, 9, 6 | Rounds 3 and 5 |

---

# Round 1 fix list (closed)

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
