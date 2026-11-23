# Round 3 (match)

**Verdict: PASS.** A full firefight with all ten soldiers and the train in view costs at most 17 real draw calls,
counting the shadow pass, against a target of 40. No new shader compiles during play. Three matches in a row leak
nothing. Green and Tan are always told apart (dE 51 to 61 between the two teams at every distance). Tan soldiers read
at every distance against what is behind them, with no view under dE 15 out to 150 units. There are no blockers. Four
medium look problems need fixing before round 4 art:
- bodies keep full team colour, so a body is told from a living soldier only by its pose;
- dead soldiers' guns stand upright out of the body;
- the spectating view draws the spectated bot's own world model;
- there is z-fighting on two train trim pieces.

Scripts are `tests/visual_r3_*.cjs` (shared helpers in `visual_r3_lib.cjs`). Screenshots are
`screenshots/round3/visual_*.png` (16 files). `index.html` was not edited. Rendering is software (SwiftShader). This
round the machine was shared with the other testers' match runs, so **milliseconds show relative cost only and are
noisy**: every timing comparison below is made within one page and one run. Soldier positions come from real seeded
autoplay matches with god mode on. The camera is a custom named view (`__game.views.probe`), so the match is never
disturbed.

## Budget (`visual_r3_perf.cjs`, `visual_r3_burst.cjs`)

| Item | Round 3 | Limit / target |
| --- | --- | --- |
| Draw calls, full firefight, overview camera holding the room, all soldiers and the train (WebGL level) | **16** (11 main + 5 shadow) | under 40 (16.9), under 200 |
| Draw calls, same firefight from the soldier's own eye (viewmodel pass included) | **17** (12 + 5) | |
| Triangles at peak, both passes | **31,650** | none set |
| Shadow lights / map | 1 / 2048 (hemisphere, sun, burst point light) | 1 / 2048 or less |
| Shader programs at load / after first death, first burst, three matches | **15 / 15 / 15 / 15** | |
| First grenade burst on a fresh page | **+24 %** frame time (194 against 157 ms, and 193 against 154 ms on a second page); later bursts within 3 % | |
| `index.html` | **306,871 bytes** (95,006 gzipped) | under 400 KB |
| Console errors / blocked requests | 0 / 0 in every script | 0 |

- **What the calls are.** Static mesh, instanced boxes, floor, effects pool, tracers, soldiers (one instanced mesh of 44
  parts for all eleven bodies), chevrons, train boxes (62 instances), train wheels (40), and the viewmodel. The shadow
  pass repeats the static mesh, instanced boxes, soldiers, train boxes and wheels. The arc, burst sphere and the 21 range
  dummies are hidden in a match.
- **Shader compiles.** None occur during play: 15 programs at load and still 15 after the first train view, first death,
  first grenade burst, round-end screens and three full matches. The first death frame (163 ms against a 142 ms baseline)
  is within the noise.
- **First burst still costs one upload.** Geometries go from 9 to 10 on the first burst, which is the burst sphere's
  first upload; `renderer.compile` compiles shaders but does not upload geometry. Rendering the sphere once at load (opacity 0) would
  remove it. Minor.
- **Pooling across three matches with rematch** (render every 2 s of sim):

| | Load | After match 1 | After match 2 | After match 3 |
| --- | --- | --- | --- | --- |
| Scene objects | 24 | 24 | 24 | 24 |
| Geometries | 9 | 13 | 14 | 14 (first uploads, then flat) |
| Textures / programs | 2 / 15 | 2 / 15 | 2 / 15 | 2 / 15 |
| DOM nodes | 150 | 196 | 196 | 201 (the match-end table plus one feed line) |
| JS heap | 15.4 MB | 15.4 | 15.4 | 15.4 |

  `shotLog` stays at 200. `botLog` is cleared at each match start (875, 1,044 and 691 entries at match end).
- **File size (307 KB).** What takes the space:
  - by code section, in KB: bots 82, weapons 41, world build 29, config 25, train 25, main loop and hook 19, HUD and menus
    18, colliders 16, player 14, match 14, CSS 8, audio 6, input 5;
  - comments are 36 KB and leading indentation is 13 KB.

  **Headroom for round 4: 93 KB.** Canvas-drawn textures and soft shapes from code should fit in 30 to 60 KB. If art
  needs more, stripping comments or moving the long comment banners to `CHANGELOG.md` frees about 36 KB without touching
  behaviour.

## Team readability with real soldiers (`visual_r3_teams.cjs`, `visual_r3_cover.cjs`)

Real autoplay matches with seeds 11 and 21: 4,098 views of 270 soldier samples. Every 0.5 s of sim the match was
frozen and soldiers were sampled by state (moving, still, crouched, dead, climbing) and by place (floor, bed, desk,
shelves). The camera looked at each body from 10, 30, 60, 100 and 150 units, in 8 directions (16 at 100 and 150), at
body height and 12 units up. Measure (pass 2): **dE of the body pixel against the same pixel re-rendered with that
soldier hidden**, which is what is actually behind it. The rounds 1 and 2 side-pixel measure breaks down here, because
bodies lie sideways and squads stand shoulder to shoulder. 123 views whose centre pixel was another soldier were
dropped. Pass 1 used the old side-pixel measure, for comparison.

| Team, state | 10 u | 30 u | 60 u | 100 u | 150 u |
| --- | --- | --- | --- | --- | --- |
| Green, living: median / 10th pct (under 15) | 67 / 61 (0 %) | 67 / 61 (2 %) | 61 / 50 (1 %) | 53 / 42 (5 %) | no view fitted |
| Tan, living | 48 / 32 (0 %) | 43 / 33 (0 %) | 46 / 34 (0 %) | 39 / 21 (0 %) | 28 / 27 (0 %, n 18) |
| Tan crouched | 48 (0 %) | 37 (0 %) | 49 (0 %) | 40 (0 %) | |
| Green crouched (pass 1, side measure) | 115 | 89 | 107 | 55 | |
| Tan climbing (on string routes) | 51 | 51 | 46 | 39 | 30 |
| Green, dead body | 62 | 64 | 60 | 50 | |
| Green vs Tan body colours | dE 61 | 61 | 59 | 51 | |

- **Green is always told from Tan.** The two teams' rendered body colours differ by dE 51 to 61 at every distance,
  moving, crouched or dead. By background (60 units or less), the medians are: Tan on floor 34, wall 49, bed 49, shelf
  43, desk 53; Green 62 or more everywhere. The 100 and 150 unit Tan numbers match the round 2 re-check 2 numbers on the
  dummies, as they should.
- **Weakest real cases.**
  - Green's few views under 15 are almost all against another Green soldier (squads bunched at the fort at round
    start). That is still a soldier, so it is not a readability failure.
  - The worst Tan view is a still soldier at 30 units seen from 12 units up against the floor (dE 14.2).
- **Sun and shade.** Every pass 2 sample happened to be in shade; the sun patch is small (round 4 lighting). In pass 1,
  sunlit soldiers read far better than shaded ones (Green 125, Tan 97).
- **Train.**
  - No soldier was riding when sampled in these matches.
  - In the nav test, riders were caught on the flatbed and gondola (`visual_soldier_ride.png`). A Tan rider on the yellow
    flatbed deck renders `#C5924A` on `#EDB92B`, dE 31: the lowest contrast any surface gives Tan, but readable.
  - Flat palette: Tan is dE 29 from both the flatbed yellow `#F2C230` and the gondola orange `#F08A2A`; Green is 70 and
    89. Keep this in mind for round 4 car colours.
- **Crouched in cover.**
  - Twenty crouched bots in or beside their fort were found in real play and seen from the enemy side at 30 and 60
    units. All 20 were visible at 30 units (about 250 px, 19 x 20 px box for Tan) and 19 of 20 at 60 units (about 60 px,
    8 x 10 px).
  - Tan crouched outside its fort's east door reads clearly against the cream wall and the red fort
    (`visual_cover_crouched.png`, first row).
  - A Green bot crouched behind a grey cover block is fully hidden from that side (second row). That is correct cover.
  - *Not tested:* no bot crouched beside the jumbo crayons in these matches, so crouching behind a crayon was not seen.
    The silhouette pixel counts include the soldier's shadow, so they overstate visibility slightly.

## Findings, most severe first

### 1. Medium (pillar 5): a body looks like a living soldier in the same colour
- Bodies keep the full team colours. Medians of the living vs body colour at 10 to 60 units are dE 0 to 16: a body is
  only darker when its unlit top face is what you see. The only cue is the pose.
- At 30 units the silhouettes overlap. Standing soldiers are about 18 x 30 px (height / width 1.4 to 1.7). Crouched
  soldiers are 21 to 24 x 20 px (0.8 to 0.95). Bodies are 16 to 30 x 22 px (0.7 to 1.4, depending on which way they
  fell). These counts include the shadow; pass 1 and pass 2 of `visual_r3_teams.cjs`.
- At range a crouched enemy and a body are the same small blob in the same colour. Players will waste shots on bodies
  and miss crouched enemies.
- **Fix:** tint bodies about 50 % toward a neutral grey (for example Green body `#5E7A63`, Tan body `#9C8C74`) when they
  tip, or drop them to the spare-soldier grey `#B9BEC6` blended 40 %. Either way the team stays readable up close, and a
  body is grey at a glance. Re-check: living vs body dE of 25 or more at 30 units.

### 2. Medium: dead soldiers' guns stand straight up out of the body
- In the tip-over sequence the body falls flat in 0.25 s, but the gun ends vertical and pokes up out of the body for
  the rest of the round (`visual_soldier_tip.png`, frames 5 to 8). It reads as a flag on every body.
- **Fix:** when `tip > 0`, place the gun with the body rotation only (no aim pitch), or lay it beside the body. Bodies
  then lie flat.

### 3. Medium: the spectating view draws the spectated bot's own world model
- After the player dies, the camera sits at a Green bot's eye, but that bot's own instances are still drawn. Its
  world-model gun, a long grey box, comes up from the bottom centre, and the edge of its base plate shows at bottom
  left. Hiding its four instances in the test changes 2 % of the frame, all of it in the bottom 30 %
  (`visual_hud_spectate_own_model_720.png`).
- When the bot is close to teammates, their bodies at arm's length fill a third of the view
  (`visual_hud_spectate_720.png`, left and bottom green blocks).
- **Judgement on the builder's note:** the gun at the bottom is not acceptable as it is. It is the world model seen from
  inside, with no muzzle flash, sway or recoil, and it does not match the HUD's weapon name.
- **Fix:** while spectating, hide the spectated bot's own instances (as is already done for the player's own slot), and
  draw the normal viewmodel of the bot's current weapon with its kick and flash. Optionally push the near plane out to
  about 0.3 while spectating, so teammates at arm's length are cut rather than filling the screen.

### 4. Minor: z-fighting on the engine's rear trim and the gondola door posts
- Two renders with the eye moved 0.004 units give filled difference blobs, not just edge lines: a solid triangle on
  the engine's rear yellow trim panel, and slivers on the gondola door posts (`visual_train_zfight.png`: frame then
  difference x4, rows baseline, engine rear square-on, engine rear oblique, door posts, door posts oblique). The baseline
  with no camera move changes 0 px.
- Cause, from `trainVisualBoxes`:
  - the engine's rear trim box spans `-hl..-hl+0.04`, so its rear face is coplanar with the car body's rear face;
  - each gondola door post starts exactly at the wall end (`-d-0.3..-d` against the wall ending at `-d`), so their
    end faces are coplanar.
- **Fix:** move the rear trim to `-hl-0.04..-hl` (outside, like the side stripes), and start the door posts 0.02 out
  from the wall ends.

### 5. Minor: train wheels hide in the bogies and sit in the rails
- The red wheels (radius 0.38, centred at y 0.38 on the rail line ±1.6) are almost entirely inside the dark bogie
  boxes (±1.85 wide, y 0.25 to 0.62). From the floor they show only as red specks (`visual_train_close.png`, second and
  third frames). Their bottoms reach y 0, so they pass through the rails (top at 0.3); the bogie bottoms (0.25) also
  dip into the rails.
- The palette's red wheels are part of what makes it a toy train.
- **Fix:** put wheel centres at y 0.68 (sitting on the rail top), keep them at ±1.6, and narrow the bogies to ±1.4 so
  the wheels show outside them. Or shrink the bogies' height to 0.45 to 0.62.

### 6. Minor: the climbing pose reads as standing in mid-air beside the string
- On a string the soldier stays fully upright, with the base plate under its feet and the gun hidden. It sits beside the
  yellow string rather than against it (`visual_soldier_climb.png`, 8 frames up the tall-shelf string).
- **Fix:** hide the base plate while climbing, tilt the body 10 to 15 degrees into the string, and centre the string
  in front of the body.

### 7. Minor: first-burst geometry upload
See the budget section. **Fix:** draw the burst sphere once at load at opacity 0.

### 8. Notes
- **Section banners are stale.** "11. MATCH RULES (stub: ... arrive in round 3)" and "10. BOTS (round 1 ... Bot AI
  arrives in round 3)" no longer describe the code. The sections are in the required order.

## The train (`visual_r3_train.cjs`, `visual_r3_train2.cjs`, nav test in `visual_r3_soldiers.cjs`)

- **Reads as a chunky toy train.** Blue engine with a yellow stripe, cab windows and headlight; red boxcar with a dark
  door; yellow flatbed with a blue 3-unit cargo block; orange gondola with yellow door posts; purple caboose with a roof
  walkway (`visual_train_close.png`, first frame, which shows the flatbed and cargo with the rest of the consist behind;
  also `visual_train_zfight.png`). Every car type is a different colour and silhouette.
- **As cover from the floor.**
  - From under the bed 25 units away the whole consist is a solid band of strong colours against the brown floor and
    grey cover (`visual_train_close.png`, fourth frame).
  - From the east side of the room at 60 units it is mostly hidden behind the desk and cover (fifth frame). It reads
    as cover wherever it can be seen.
  - Couplings are 1.5 gaps with a dark coupler bar, and you see through them as gaps, as intended.
- **Tunnel.** Oriented car boxes were checked against the tunnel colliders over a full lap, 180 car-in-tunnel samples.
  The tightest point is the engine cab, 0.5 under the roof underside; the walls clear by 1.4 each side. Nothing clips.
- **Riders.** 322 riding samples in the nav test, 214 on the flatbed and 108 on the gondola. Feet were exactly at deck
  height (1.2) every time (worst deviation 0.000): no floating or sinking. The rider moves with the car
  (`visual_soldier_ride.png`, 4 frames).

## Soldiers (`visual_r3_soldiers.cjs`)

- **Poses** (frame sequences):
  - walk (`visual_soldier_walk.png`): a slight bob and roll, gun held forward;
  - climb (finding 6);
  - aim and crouch (`visual_soldier_pose.png`): Green with an SMG engaging, then Tan crouched. The crouch is clearly
    shorter (body 0.7), with the gun at chest height;
  - tip-over (`visual_soldier_tip.png`): rigid, 0.25 s, plastic chips, but see finding 2.
- **Guns in hand.** The gun was inside a static collider in 0 of 10,010 checks.
- **Clipping.** In the nav test the body circle (radius 0.4) never entered a wall, the bed frame, a desk leg or a fort
  wall. The only overlaps reported were sloped ramps, strings and the blanket ridges, which an axis-aligned box check
  counts falsely.
- **Ground contact.** The raycast below the feet of 7,892 grounded samples found no sinking. It found up to 0.08 to
  0.18 of floating on the blanket ridge ramps (2 samples). Other flagged samples were rays passing through seat and
  platform colliders, a limit of the test.
- **Bodies stay put.** 5 bodies were tracked from 1 s after death to the end of the round, and none moved.
- **Chevrons** (non-autoplay match, 6,714 checks at 5 Hz):
  - shown 168 times, all over living Green teammates;
  - 0 over Tan, 0 over bodies, 0 beyond 60 units;
  - 0 hidden when a teammate was within 58 units with line of sight;
  - 1 shown without line of sight, a one-frame lag of the 10 Hz check (Green 3 at 47 units behind the blanket edge).

## HUD and menus (`visual_r3_hud.cjs`, `visual_r3_hud2.cjs`)

| Check | 720 | 1080 | Evidence |
| --- | --- | --- | --- |
| Overlaps between HUD blocks (top bar, feed, callouts, picker, banner, ammo, health) | none | none | element rectangles in every state |
| Off screen or clipped text | none | none | |
| Title: name, Play, difficulty, sliders, controls | legible | legible | `visual_hud_title_720.png` |
| Freeze picker with countdown | centred under the crosshair, clear of the top bar | same | `visual_hud_freeze_1080.png` |
| Top bar: round, timer, score in team colours, 5 pips a side | legible | small (fixed 174 px wide on 1920) | all HUD shots |
| Kill feed: team colours, HEADSHOT tag, last five | legible on its 45 % dark plate | same | `visual_hud_spectate_720.png` (top right) |
| Feed text on its plate, worst case over pure white / over the window / over the dark floor | Green dE 77 / 80 / 96; Tan 51 / 56 / 74; white 39 / 46 / 87 | same | computed from the CSS colours |
| Callouts: green bar, bot name in green | legible | legible | `visual_hud_spectate_720.png` |
| Damage arcs point at the attacker | **correct**: 6 hits from Tan 1 and Tan 3, arc angle within 0.5 degrees of the attacker's real bearing. Turning 90 degrees right moved every arc 90 degrees left | same | `visual_hud_arcs_720.png` |
| Spectating banner | legible, bottom centre | same | finding 3 |
| Round end: winner, how, score | legible | legible | `visual_hud_roundend_720.png` |
| Match end: winner, score, kills and deaths table, Enter / Esc | legible, team-coloured names | legible | `visual_hud_matchend_720.png` |
| Pause: Resume, sliders, Quit | legible over a darkened frame | | `visual_hud_pause_720.png` |

- Up to six damage arcs stack on the same side when one attacker fires a burst
  (`visual_hud_arcs_720.png`, one thick red arc). That reads fine.
- HUD sizes are still fixed pixels (carried from round 2). At 1080p everything is legible but small.
- In the first HUD run, `pause()` straight after `rematch()` did not show the menu (the app phase was not `playing`).
  In a fresh match it works. This is noted for the bug tester, not confirmed as a bug.

---

# Round 2 (gunplay)

**Verdict: PASS.** Every required piece of juice is drawn, pooled and inside the budget (12 real draw calls at
worst while firing, of 200), the HUD is legible at both sizes, and Green dummies read at every distance the room
allows. The pass comes with three look problems to fix: the grenade burst is close to invisible, Tan reads
markedly worse than Green at range, and wood and fabric impacts cannot be seen on their own surfaces.

Scripts are `tests/visual_r2_*.cjs`, screenshots are `screenshots/round2/visual_*.png` (66 files). Rendering is
software (SwiftShader), so **milliseconds are relative cost only**. `index.html` was not edited. Where a test
changed a `CONFIG` value to isolate something, it says so and the value was restored.

## Budget

| Item | Round 1 | Round 2 | Limit |
| --- | --- | --- | --- |
| Draw calls, idle with a gun up (WebGL level) | 5 | **10** (7 main + 3 shadow) | under 200 |
| Draw calls, full-auto fire | | **12** at worst | |
| Draw calls, grenade aim / burst | | 11 / 10 | |
| Draw calls, all 21 dummies down | | 10 | |
| Draw calls, named view (no viewmodel) | 5 | 9 | |
| Game's own counter vs WebGL count | 3 vs 5 | **equal in every state** (10, 12, 9) | |
| Triangles, main pass / with shadow pass | 10,362 / 20,722 | 14,922 / **26,062** | none set |
| Shadow lights / map | 1 / 2048 | 1 / 2048 | 1 / 2048 or less |
| Textures / shader programs | 2 / 7 | 2 / 14 | |
| `index.html` | 85,035 bytes | **136,532 bytes** | under 400 KB |
| External requests / console errors | 1 / 0 | 1 / 0 | 1 / 0 |
| `render()` at 1280x720, idle at spawn | 122 ms | 138 ms | relative only |
| `render()` during full-auto fire | | 124 ms (no extra cost) | |
| `step(1/60)` idle / firing | 0.005 ms | 0.005 / 0.077 ms | |

- What the 10 calls are: static mesh, instanced boxes, floor, effects pool (284 instances), tracer pool (24),
  dummies (63 instances), viewmodel; the shadow pass repeats static, instanced and dummies. Firing adds the
  muzzle flash; aiming a grenade adds the arc line.
- Draw calls and triangles do not move with the number of live particles, casings or decals, because every
  pooled instance is always drawn.
- **Pooling holds.** Across 500 shots with all four guns, with grenades thrown throughout: scene objects 17 to 17, textures 2 to
  2, programs 14 to 14, DOM nodes 73 to 73, JS heap 9.5 to 9.5 MB, no live grenades left. Geometries went 9 to 11
  only because two gun models were drawn for the first time. `shotLog` and `audioLog` stay capped at 200.
- Caps: decals 64 live after 64, 65 and 100 wall shots. Casings peaked at 21 of 24 with the SMG, and all were
  gone 2 s after firing stopped. Particles peaked at 22 of 192 in full-auto fire.
- Cost split at the spawn (pieces hidden in the test): dummies about 3 %, effects pools about 3 %. Shadows are
  still the dominant cost, as in round 1.

### Headroom for round 3

190 draw calls are free today. If the 10 soldiers go into the dummies' instanced mesh (or one like it) they add
0 to 2 calls; ten separate meshes add 20; ten soldiers of six loose limbs add 120. The train as instanced boxes
adds 2, as five merged cars 10. A sensible round 3 lands between 14 and 45 calls. File size grew 51 KB this
round; 263 KB is left for two more rounds.

## Findings, most severe first

### 1. Major: the grenade burst is close to invisible, and the thrown grenade blocks the view
- From 14 units the burst is a handful of 3 px dots for about 10 ticks and nothing on the burst tick itself
  (`visual_fx_grenade_flight_burst.png`, lower row). It is 58 particles of 0.09 to 0.1 units and no flash.
- On the throw tick the grenade body is a red block about a fifth of the screen high, in front of the gun, and
  it stays large for 3 ticks (same file, first three frames).
- **Fix:** add a burst flash (one additive instance scaled to 2 to 3 units for 3 to 4 ticks, from the tracer
  pool) and make the burst particles 0.25 to 0.3 units. Start the grenade 1.2 units in front of the eye
  rather than 0.5, or do not draw it for its first 3 ticks. Not tried.

### 2. Major: Tan reads much worse than Green, and stops reading near 100 units against pale backgrounds
569 views with a clear line to a dummy, camera aimed at the body, body colour compared with the pixels just
beside it (`visual_r2_teams.cjs`). "Under 15" means hard to pick out at a glance.

| Team | Distance | Views | Body size, px | dE to background, median | 10th percentile | Views under dE 15 |
| --- | --- | --- | --- | --- | --- | --- |
| Green | 10 | 85 | 23 x 84 | 64.9 | 60.9 | 0 % |
| Green | 30 | 121 | 8 x 28 | 65.6 | 60.0 | 0 % |
| Green | 60 | 64 | 4 x 14 | 57.2 | 53.2 | 0 % |
| Green | 100 | 20 | 2.3 x 8 | 39.9 | 38.4 | 0 % |
| Green | 150 | 2 | 1.6 x 6 | 17.4 | 16.3 | 0 % |
| Tan | 10 | 79 | 23 x 84 | 39.8 | 30.8 | 0 % |
| Tan | 30 | 113 | 8 x 28 | 37.8 | 30.2 | 1 % |
| Tan | 60 | 63 | 4 x 14 | 32.8 | 26.4 | 2 % |
| Tan | 100 | 20 | 2.3 x 8 | 22.8 | 11.4 | 10 % |
| Tan | 150 | 2 | 1.6 x 6 | 9.0 | 9.0 | 100 % |

- Green never stops reading by colour. It is limited by size: under 3 px wide beyond 100 units unscoped.
- Tan reads to 60 units, is unreliable at 100 (a quarter of the views against walls and shelves are under 15)
  and is gone at 150. Worst cases at 60 units or less: Tan on tall shelf L1 against the wall and the yellow
  string (dE 10.2), Tan on the tunnel roof against the bed side (dE 14.4).
- By background, up to 60 units: Tan on shelf 30.8, on bed 29.6, on wall 34.1, on floor 36.8, on desk 39.6,
  in front of its own red fort 56.9. Green is 60 or more on everything.
- Sun: a sunlit Tan body renders `#FFD57D` (red channel clipped) against `#CBA86A` in shade. Green goes from
  `#2A933C` to `#3ABA48`. Neither loses contrast in the beam.
- Haze: the same Green body is `#2A933C` at 10 units, `#459D51` at 60 and `#73B074` at 100. Tan goes `#CBA86A`,
  `#CFB078`, `#D6BD90`, which is drifting straight toward the haze colour `#E6DCCB` and the pale walls.
- Evidence: `visual_team_green_floor_b.png` and `visual_team_tan_floor_b.png` (10, 30, 60 units, enlarged).
- **Fix (lead):** Tan needs a darker or more saturated value to survive the haze, for example `#D9A441` with
  shadow `#A87A2C`, or a dark outline or helmet band on both teams. Not tried.

**Shelf sniping is workable; haze is not the limit.** From the tall shelf L3 edge the five visible Green dummies
are 102 to 127 units away, dE 31 to 46, and 2 x 7 px unscoped but 7 x 25 px in the scope
(`visual_team_shelf_view_unscoped.png`, `visual_team_shelf_view_scoped.png`). From Green's small shelf the Tan
dummies at 108 to 138 units are only dE 19 to 21, so Tan's snipers get clearer targets than Green's. That adds
to the known tall-shelf advantage.

### 3. Medium: wood and fabric impacts cannot be seen on their own surfaces
Pistol shot from 2 to 7 units with kick, shake, flash and tracer switched off in the test, so only the
particles and the decal change the frame (`visual_r2_fx.cjs`):

| Surface | Particles vs background | dE while particles live | Read as |
| --- | --- | --- | --- |
| wood (floor) | `#6E4A2D` on `#754928` | 4 to 5 | invisible; only the decal shows |
| fabric (bed side) | `#EBE5DA` on `#D4C8B6` | 7 to 11 | faint |
| card (tunnel) | `#B0A286` on `#8C8F90` | 15 to 21 | visible, tan flecks |
| metal (mug) | white on `#8C8F90` | 15 to 21 | visible but 4 specks for 0.16 s |
| plastic (fort) | `#9A997A` on `#2A61AD` | 47 to 67 | clear yellow sparks |
| book (stairs) | `#DACEBC` on `#E87918` | 61 to 69 | clear pale flecks |

- The six surfaces differ in colour, speed and life as specified, but on screen four of them are "a few small
  squares". Only plastic (wide, fast, yellow) and book (pale on orange) are told apart at a glance. Strips:
  `visual_fx_impact_wood.png` and the five others.
- **Fix:** wood chips to a light splinter colour such as `#D9B98A`, fabric puffs larger (0.2) and whiter, metal
  sparks 8 instead of 4 with life 0.25. Not tried.

### 4. Medium: muzzle flash problems
- The sniper's flash sits well below the muzzle (`visual_fx_flash_sniper.png`, `visual_vm_sniper_flash.png`).
  The gun model rotates up with its kick but the flash is placed without that rotation. Rifle, SMG and pistol
  flashes are on the muzzle (`visual_fx_flash_rifle.png`).
- The flash lasts 2 rendered frames, not a time: it is counted down in `renderViewmodel`. That is 33 ms at
  60 fps and 14 ms at 144 fps. Measured: visible on 2 successive renders with no sim tick between.
- **Fix:** make the flash a child of the gun mesh, and time it in sim ticks or seconds.

### 5. Medium: HUD details
What works (`visual_hud_idle_720.png`, `visual_hud_idle_1080.png` and the others):
- Crosshair ticks are centred and widen with spread. Gap in px at 720p, still / after a burst / walking / in
  the air: rifle 4 / 18 / 6 / 12, SMG 12 / 31 / 17 / 35, sniper unscoped 25 / 25 / 37 / 74, pistol 3 / 3 / 4 / 9.
  At 1080p the gaps scale by 1.5.
- Hit marker is a white X, kill marker is red and larger (30 px bars against 18). Both show while scoped.
- Weapon name, magazine / reserve, grenade count and health sit in the corners at both sizes and do not
  overlap the viewmodel. `RELOADING` is appended to the name.
- Scope: dark vignette with a thin cross, health and ammo still readable (`visual_hud_scope_720.png`).

What does not:
- The yellow weapon name is weak on pale backgrounds: `RIFLE` over the wall in `visual_hud_bright_window_720.png`
  and `SNIPER` over the shelf in `visual_team_shelf_view_unscoped.png`. White with the existing shadow would do.
- Damage numbers spawn on the hit point, so they sit on top of the crosshair and on each other: `26` covers the
  hit marker in `visual_hud_hit_720.png`, and `32`, `32`, `15` pile up in `visual_hud_bloom_smg_720.png`.
  Offset them 20 px up and give each a small sideways drift.
- The grenade arc is a 1 px line, 358 pixels in the whole frame, yellow on cream walls
  (`visual_fx_arc_pale.png`, `visual_hud_grenade_aim_720.png`). WebGL lines cannot be widened; draw it as dots
  from the effects pool or add a landing marker.
- HUD sizes are still fixed pixels (carried from round 1).

### 6. Minor: `bed_top` has its eye inside a dummy
- Confirmed. The eye (27, 19.6, 80) is inside the head of `target.12` at (27, 18, 80), whose head spans y 19.35
  to 19.8. The lower third of `visual_bed_top.png` is the inside of the dummy.
- **Proposed eye: (31, 19.6, 80)**, same target. It is the `m.bed.e` node at the bed edge, the dummy is behind
  the camera, and the floor, chair, desk and both shelves are in frame (`visual_bed_top_proposed_a.png`).
- `desk_top` and `west_lane` use the new eyes from 15.5 and are no longer blocked (`visual_desk_top.png`,
  `visual_west_lane.png`). The table in DESIGN section 10 still lists the old eyes.

### 7. Minor items
- **Decals** are 0.13-unit dark squares, identical on every surface. At point-blank range one is a black tile
  (`visual_vm_sniper_flash.png`). No z-fighting from 12, 30 or 60 units in the two-eye test, and none at a
  grazing angle (`visual_fx_decals_grazing.png`). Suggest 0.08 and a surface-tinted colour.
- **Tracer** is 0.035 wide and starts beside the eye, so in the scope it is a thick pale beam across the lower
  right (`visual_hud_kill_720.png`). Hide or thin it while scoped.
- **SMG and pistol viewmodels** look alike from the first-person angle: a dark block with a yellow tip
  (`visual_vm_smg.png`, `visual_vm_pistol.png`). The rifle (yellow magazine, wood stock) and sniper (scope block,
  long barrel) are distinct at a glance. Give the SMG a visible magazine or a different accent colour.
- **Viewmodels do not clip.** They are drawn in their own pass after a depth clear, so pressing into a wall
  changes nothing (`visual_vm_rifle_wall.png`, `visual_vm_sniper_wall.png`). They are unlit with baked face
  shades and are not fogged, which is correct for something at arm's length.
- **Kill sequence** works: the dummy tips in 0.25 s, lies flat, stands again at 3 s (`visual_fx_kill.png`). The
  8 plastic chips are too small to notice at 6 units.
- **Casings** are bright and easy to see in flight (`visual_fx_rifle_auto.png`); they vanish at 1.4 s rather
  than fading.

## Carry-overs from round 1

| Item | Result | Evidence |
| --- | --- | --- |
| Skirting and door frame 0.3 thick | Fixed | Touching the wall, skirting, frame and door all still render (`visual_carry_skirting_touch.png`, `visual_carry_door_yaw06.png`) |
| Counters include the shadow pass | Fixed | Reported equals WebGL count in every state measured |
| Named views `west_lane`, `desk_top` | Fixed | Finding 6 |
| Crayons turned north-south | Fixed | Colliders `55.7..57` and `63..64.3` by `29..38`, mirrored; slits clear (`visual_carry_crayons_fort.png`) |
| Bed top blue, pillows visible, underside darker | Fixed | Bed top `#3C558A` shade, `#4E6A9F` sun, no clipping. Pillow vs bed dE 64 (was 9). Underside `#5B5349`, dE 25 from the floor (`visual_carry_bed_top.png`, `visual_under_bed.png`) |
| Desk apron panels | Present | Colliders `desk.apron.n` and `.s` at `95..95.5`, y 17 to 24.5 (`visual_carry_apron.png`) |

Hard rules rechecked: one file, one URL in the source and one external request, no other asset or library.

## Round 2 re-check

**Verdict: PASS.** The budget is unchanged: 10 real draw calls idle, 12 at most while firing or during a grenade burst, of 200.
File size is 146 KB. Pooling holds over 500 shots and 20 grenades. Four of the five first-pass findings are fixed: the
grenade burst, impacts, muzzle flash and HUD. **Tan is only partly fixed.** It gained dE 4 to 8 at every distance, but
it still reads at about 70 % of Green's contrast and still fails at 150 units. It passes because Tan reads reliably to
60 units and mostly to 100. The measured fix is fog 20 / 320 (see the Tan section).

New scripts: `tests/visual_r2b_teams.cjs`, `_perf.cjs`, `_fx.cjs`, `_hud.cjs`, `_altviews.cjs` and `_fog.cjs`.
Screenshots: `screenshots/round2/visual_re_*.png`. Rendering is software (SwiftShader), so **milliseconds show relative
cost only**. `index.html` was not edited. Candidate fixes were applied to the live scene through `page.evaluate`
(instance colours, an extra hull mesh, `CONFIG.fog`). Any `CONFIG` value a test changed was put back.

### Budget (`visual_r2b_perf.cjs`)

| Item | First pass | Re-check | Limit |
| --- | --- | --- | --- |
| Draw calls idle, rifle up (WebGL level) | 10 | **10** (7 main + 3 shadow) | under 200 |
| Full-auto rifle / SMG, worst frame | 12 | **12 / 12** | |
| Grenade aim / burst (sphere, ring, light) | 11 / 10 | **11 / 12** | |
| Named views, scoped | 9 | 9 | |
| Game counter vs WebGL count | equal | equal in every state | |
| Triangles idle, main / with shadow | 14,922 / 26,062 | 14,922 / **26,062** | none set |
| Triangles aiming (arc of 61 icosahedra) / burst | | 19,802 main / 26,702 total | |
| Shadow pass during a burst | | **still 3 calls**: the burst light casts no shadow | |
| Lights / shadow lights / map | 1 shadow light / 2048 | 3 lights, **1** casting / 2048 (hemisphere, sun, burst point light) | 1 shadow light, 2048 or less |
| `index.html` | 136,532 | **146,098 bytes** | under 400 KB |
| Console errors / blocked requests | 0 / 0 | 0 / 0 | |
| `render()` idle / full auto / burst | 138 / 124 ms | 112 to 142 / 110 to 121 / 115 to 135 ms (median), relative only | |
| **First burst** frame vs later bursts | | **157 ms** vs 111 to 125 ms (programs 14 to 16) | |
| **First grenade aim** frame vs later | | **149 ms** vs 116 to 134 ms (programs 13 to 14) | |

- **The burst light is not a second shadow caster and does not force a recompile on its own.** The point light is
  always in the scene (intensity 0, parked at y -50), so the number of lights never changes. Removing it in the test
  cost a 304 ms recompile frame. That hitch is the one the always-present light avoids. Its idle cost is
  within the noise: 118 ms without it, 124 ms after it was added back.
- **The first burst still hitches** (new finding 1). Two programs compile on the first burst (the additive sphere and
  the ring) and one on the first aim (the arc dots). Shader programs grow from 11 at load to 22 once every effect has been
  seen once. Later bursts show no spike.
- **Pooling across 500 shots (all four guns) and 20 grenades:** scene objects 19 to 19, textures 2 to 2,
  programs 22 to 22, lights 3 to 3 (1 casting), DOM nodes 73 to 73, JS heap 13.6 to 13.6 MB, live grenades 0.
  Geometries 11 to 12: one geometry uploaded for the first time, not growth per shot. `shotLog` and `audioLog` stay at 200.
- **Headroom for round 3:** 188 calls free. The first-pass estimate still holds: 10 soldiers in an instanced mesh
  add 0 to 2 calls (10 more if each casts a separate shadow), the train adds 2 to 10, and round 3 lands between 14 and
  45 calls. File size grew 9.6 KB this pass, so 254 KB is left.

### Earlier findings

| # | First-pass finding | Status | Evidence |
| --- | --- | --- | --- |
| 1a | Grenade burst nearly invisible | **Fixed** | A yellow dome grows to the 7 unit radius and is visible from the burst tick (`visual_re_burst_14u.png`, `visual_re_burst_40u.png`, ticks 0, 1, 3, 5, 8, 12, 18). From 40 units it changes a 222 x 70 px area on tick 0 and 144 x 88 px at its peak, against a projected 7 unit radius of 82 px. That matches a half-buried dome, and it fades by tick 15. From 14 units the dome and ring fill the expected 233 px radius, and the shake moves the whole frame for 14 ticks. The flash is pale yellow, near white at its peak against the pale wall. Particle ring and sparks are visible |
| 1b | Thrown grenade blocks the view on the throw tick | **Partly** | No longer drawn on ticks 1 and 2 (`hideNear` 1.3). It then pops in on tick 3 at 1.4 units as a red block of 15,257 px, about 120 px or 17 % of the screen height, then 9,926 px on tick 4 and 7,020 px on tick 5 (`visual_re_throw_ticks.png`, frames aim, 1, 2, 3, 6). Smaller than before but not by much; see new finding 2 |
| 1c | Arc preview a 1 px line | **Fixed** | 5 px dots and a larger landing dot. Dot vs background dE 65 on the pale haze and wall, 75 on the dark floor under the bed, 108 on the blue blanket (`visual_re_arc_pale.png`, `_dark.png`, `_bedwall.png`). 254 to 384 arc px in the frame |
| 2 | Tan reads much worse than Green | **Partly** | Tan section below |
| 3 | Wood and fabric impacts invisible on their own surface | **Fixed** | Every surface is at least dE 25 (table below, `visual_re_impacts.png`) |
| 4 | Sniper flash below the muzzle; flash counted in frames | **Fixed** | The flash is a child of the gun mesh and sits on the kicked muzzle of all four guns, the sniper included (`visual_re_flash.png`). Visible on sim ticks 0, 1, 2 and gone on tick 3, which is 0.05 s. Three renders with no tick between all show it, so the duration no longer depends on frame rate |
| 5a | Yellow weapon name weak on pale walls | **Fixed** | The dark outline reads over the sunlit window wall and the pale shelf at both sizes (`visual_re_hud_window_720.png`, `visual_re_hud_paleshelf_1080.png`). The name is still yellow, which is fine with the outline |
| 5b | Damage numbers on the crosshair and on each other | **Fixed** | Measured from element rectangles: SMG burst at 8 units gives 3 numbers, 0 on the crosshair, 0 overlapping, nearest 70 px from the centre (111 px at 1080). Rifle at 3 units: 2 numbers, 0 / 0, 97 px. Scoped sniper kill: 34 px (38 at 1080). Numbers stack upward over the target (`visual_re_hud_numbers_720.png`) |
| 5c | Hit vs kill marker; scope | Still good | White X on a hit, larger red X on a kill, both while scoped. Scope fov reads 20 (`visual_re_hud_hit_720.png`, `visual_re_hud_kill_720.png`, `visual_re_hud_scope_1080.png`) |
| 5d | HUD sizes are fixed pixels | Not changed (carried) | At 1080 the 14 px weapon name is small but legible (`visual_re_hud_paleshelf_1080.png`) |
| 6 | `bed_top` eye inside a dummy | **Fixed** | Eye (31, 19.6, 80). The blanket edge fills the lower third of the frame (33 % of the frame is within 6 units), but floor, desk, chair and both shelves are in view (`visual_re_view_bed_top.png`) |
| 7 | SMG and pistol viewmodels alike | **Fixed** | The SMG has a long yellow magazine and a longer body; the pistol is a short block with a dark grip (`visual_re_viewmodels.png`, SMG, pistol, rifle, sniper) |
| 7 | Tracer is a thick beam in the scope | **Not fixed** (was minor, not on the fix list) | White beam across the lower right of the scope on a kill (`visual_re_hud_kill_720.png`) |
| 7 | Decals, casings | Deferred / unchanged | Not re-checked beyond the screenshots |

**Impacts on their own surfaces.** Pistol shot from 2 to 7 units. The test switched off kick, shake, flash, tracer and
the decal, so only the particles change the frame. Colour difference at tick 4, with the full range over ticks 2 to 14:

| Surface (hit collider) | Particles on surface | dE now | First pass |
| --- | --- | --- | --- |
| wood (`room.floor`) | `#D9B88B` on `#774A29` | **42** (39 to 44) | 4 to 5 |
| fabric, bed side (`bed.slab`) | `#6C81B1` on `#D4C8B6` (blue alt colour) | **47** (45 to 48) | 7 to 11 |
| fabric, blanket top (`bed.slab`) | `#F5F7FA` on `#4E6A9F` | **61** (59 to 61) | |
| plastic (fort) | `#CDD0A9` on `#2A61AD` | 79 (60 to 86) | 47 to 67 |
| book (book stairs) | `#F3E2CB` on `#E87918` | 69 (64 to 69) | 61 to 69 |
| card (tunnel) | `#D2C2A1` on `#8C8F90` | **28** (27 to 28) | 15 to 21 |
| metal (mug) | `#ECEDED` on `#8C8F90` | **35** (34 to 36) | 15 to 21 |

The metal spark is still 4 specks that live 0.16 s (gone by tick 14). It is readable, but metal is the weakest impact
by size.

### Tan readability (`visual_r2b_teams.cjs`)

The method is the same as the first pass: 569 views with a clear line to a dummy, which is the same view set. The body
centre is compared with the pixels just beside the body, using the worst side. Each view is tagged sun or shade by
re-rendering it with the sun off; only 16 of 569 views have the sun on the visible face, because the sun patch is small
(round 4). "Under 15" means hard to pick out at a glance.

| Team | Distance | Body px wide | Median dE (first pass) | 10th pct | Under 15 | Median body colour |
| --- | --- | --- | --- | --- | --- | --- |
| Green | 10 | 23 | 65.8 (64.9) | 60.9 | 0 % | `#2A933C` |
| Green | 30 | 8 | 65.2 (65.6) | 60.4 | 0 % | `#2E9541` |
| Green | 60 | 4 | 57.4 (57.2) | 53.6 | 0 % | `#429E55` |
| Green | 100 | 2.3 | 39.8 (39.9) | 38.4 | 0 % | `#6DB07F` |
| Green | 150 | 1.6 | 17.9 (17.4) | 17.4 | 0 % | `#A9CBBB` |
| Tan | 10 | 23 | **47.7** (39.8) | 31.9 | 0 % | `#C5924A` |
| Tan | 30 | 8 | **41.4** (37.8) | 30.1 | 1 % | `#C6944E` |
| Tan | 60 | 4 | **40.8** (32.8) | 27.3 | 0 % | `#C79D60` |
| Tan | 100 | 2.3 | **27.9** (22.8) | 13.6 | **10 %** (10 %) | `#CCB088` |
| Tan | 150 | 1.6 | **11.4** (9.0) | 10.9 | **100 %** (100 %) | `#D2CABF` |

- **Where each team stops reading.** Green reads by colour at every distance. Its limit is size: under 3 px wide
  beyond 100 units unscoped. Tan reads reliably to 60 units, mostly at 100 (median 28, but 1 view in 10 is under 15,
  against shelves and walls), and **not at 150** (11, every view under 15). The haze still drives Tan toward
  `#D2CABF`, close to the wall and haze colour.
- **Sun vs shade.** In the sun both teams gain (Tan 54 to 55 and Green 76 and up at 10 to 30 units); neither loses
  contrast in the beam. All 100 and 150 unit views are in shade.
- **By background**, median dE at 10 / 30 / 60 / 100 units: floor 35 / 32 / 29 / 19, wall 51 / 49 / 43 / 28, desk
  48 / 52 / 45 / 30, fort 48 / 48 / 43 / 31, shelf 43 / 41 / 37 / 28, cover 48 / 47 / 41, bed 45 / 42 (3 views each).
  Green is 55 to 115 on all of them. **The builder's sample is confirmed**: the new Tan is a little worse on the brown
  floor at short range (35 at 10 units, against 36.8 on the floor in the first pass) and better everywhere else.
- **Worst Tan views at 60 units or less:** the tunnel-top dummy against the orange ruler ramp and desk (dE 13.9 at
  30 units, 15.9 at 60) and the tall-shelf L1 dummy against the wall (16.0).

**Candidates**, measured over the same 569 views on the live scene. All figures are Tan median dE, with the share
under 15 in brackets.

| Candidate | 10 u | 30 u | 60 u | 100 u | 150 u | Tan on floor, 30 u or less | Worst view, 60 u or less | Green 100 / 150 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Now (`#D9A75A`, fog 10 / 220) | 47.7 | 41.4 (1 %) | 40.8 | 27.9 (10 %) | 11.4 (100 %) | 33.1 | 13.9 | 39.8 / 17.9 |
| Tan `#C98A35` / `#8F5F22` | 53.2 | 50.3 (1 %) | 45.9 (3 %) | 31.6 (0 %) | 13.1 (100 %) | 30.4 | **10.3** (orange book stairs) | same |
| Tan `#C4822A` / `#86561A` | 56.3 | 53.3 (1 %) | 47.8 (3 %) | 33.1 (0 %) | 13.6 (100 %) | 30.5 | **10.3** | same |
| Tan `#B87A2E` / `#7E521C` | 52.1 (1 %) | 50.4 (3 %) | 43.8 (2 %) | 30.2 | 12.3 (100 %) | **24.4** | | same |
| Dark outline hull 0.06 / 0.10 on every soldier | centre dE unchanged; edge dE 51 / 47 to 51 at 10 to 30 u, **nothing at 100 or more** (sub-pixel) | | | | | 33.1 | 13.9 | same |
| Fog 10 / 300 | 47.7 | 42.0 | 43.8 | 35.8 (5 %) | 24.0 (0 %) | 33.3 | | 50.3 / 35.1 |
| **Fog 20 / 320** | 47.7 | 42.5 | 45.8 | **38.9 (0 %)** | **27.2 (0 %)** | 33.4 | 13.4 | 53.3 / 39.9 |
| Tan `#C98A35` + fog 20 / 320 | 53.2 | 50.4 | 50.7 | 44.2 (0 %) | 31.1 (0 %) | 30.6 | **10.1** | 53.3 / 39.9 |

- **A darker Tan alone does not fix range.** 150 units stays at 13 to 14, every view under 15. It also moves Tan toward
  the orange climb routes and books: flat dE to the route orange `#FF8A1F` falls from 37 to 28, and to the book orange
  `#E67E22` from 31 to 20. The worst view drops to dE 10 against the orange book stairs. The darkest candidate also
  loses ground on the floor (24).
- **An outline does not help where Tan fails.** At 100 to 150 units the body is 1.6 to 2.3 px wide, so a 0.06 to 0.10
  unit hull is under a pixel. It adds a little edge contrast at 10 to 30 units, where Tan already reads. It also costs one
  draw call.
- **Fog distances are the limit, for both teams.** At 150 units the current fog is 67 % haze. Fog 20 / 320 is 43 %.
  That lifts Tan at 100 and 150 units to 0 % under 15 and lifts Green at 150 from 18 to 40, with no worst case made
  worse. The room still hazes: the far wall is dE 14.2 paler and bluer than the near wall, against 13.5 now, and
  spawn_green and floor_centre look almost the same (`visual_re_fog_now_vs_20_320.png`, left now, right 20 / 320).
- Strips: `visual_re_team_strips.png`. Rows: Green now, Tan now, Tan `#C98A35`, Tan `#C98A35` with fog 20 / 320.
  Columns are 10, 30 and 60 units, enlarged 2x.

**Recommendation (lead): set `CONFIG.fog` to near 20, far 320 and keep the Tan colour.** Tan's median dE goes from
27.9 to 38.9 at 100 units and from 11.4 to 27.2 at 150, with no view under 15 at any distance; Green improves too.
The feel tester should confirm that the room still feels huge, because haze is a pillar 1 cue. If the fog cannot
change, the next best is Tan `#C98A35` / `#8F5F22`: 100 units reaches 0 % under 15, but 150 units still fails and Tan
gets close to the orange routes. In that case also move the graybox route orange further from Tan. Do not add an
outline for readability.

### Has the cooler haze cost the warm look? (named views vs the first pass)

Same pixels in the same named views, first pass compared with now:

| Where | First pass | Now | dE |
| --- | --- | --- | --- |
| Window panes (scene background through the window), `desk_top` | `#E6DCCB` | `#D6DEE8` | 15.4 |
| Far haze, `west_lane` centre | `#D2D0C5` | `#C7D1D8` | 10.3 |
| Walls, `desk_top` | `#BEC3BF` | `#B9C4C8` | 4.7 to 5.4 |
| Bed side / blanket / far floor, `desk_top` | `#D7CBB9` / `#68789B` / `#8C694C` | `#D4CCBE` / `#6479A2` / `#896953` | 2.6 / 4.1 / 4.6 |
| Near floor and cover, `west_lane` | | | 0.0 |
| Green dummy at 10 units | `#2A933C` | `#2A933C` | 0 |

- Warmth, measured as the frame's mean red minus blue over the upper half (walls and far room), drops in every named
  view: spawn_green -27 to -39, shelf_top 25 to 9, desk_top -2 to -13, east_lane 6 to -4, floor_centre -5 to -12.
- **What it cost.** The walls moved from neutral greige to a cool grey-blue, and the window now looks like pale sky
  rather than warm light. The floor, bed, blanket, shelves and all near colours are unchanged, and Green is not hurt
  (its median dE is the same or higher at every distance). The room still reads warm at soldier height, where the floor
  fills the frame. This is the trade the lead accepted; no change is needed now. The window colour can be restored in
  round 4, for example with a warm emissive window pane, without touching the haze.

### Named views (DESIGN section 10)

All nine are in `visual_re_view_*.png`. The new eyes are confirmed: `bed_top` (31, 19.6, 80), `desk_top`
(97.5, 27.6, 66) and `west_lane` (42, 1.6, 24).
- `west_lane` (`visual_re_view_west_lane.png`) is clear down the lane to the far fort, with a cover block in the right
  foreground.
- `bed_top` is described in finding 6 above.
- `desk_top` (`visual_re_view_desk_top.png`) is the same frame as the first pass. The chair back fills the left third
  (32 % of the frame is within 6 units). New finding 3.

### New findings

1. **Medium: shader compile hitch on the first grenade burst and the first grenade aim.** The first burst frame took
   157 ms against 111 to 125 ms for the first frame of bursts 2 to 4, while two programs compiled (14 to 16). The first
   aim frame took 149 ms against 116 to 134 ms (13 to 14 programs). In software rendering that is +30 to +40 %. On real
   hardware a first-use compile is typically a visible hitch on the first grenade of a match. Programs grow lazily from
   11 at load to 22. **Fix:** at load, after building the effects, make `fx.sphere`, `fx.arc`, `vm.flash` and the
   tracer instance visible once, call `renderer.compile(scene, camera)` and `renderer.compile(vm.scene, vm.cam)`, then
   hide them again. Re-check: the first burst frame within 10 % of later bursts and programs constant from load.
2. **Minor: the thrown grenade pops in at 1.4 units as a block 17 % of the screen high** on the third tick
   (`visual_re_throw_ticks.png`). **Fix:** `grenade.hideNear` 2.5 (at 2.3 units it is already down to 5,210 px, about
   72 px), or draw the thrown body at its true 0.16 radius rather than 1.6x for its first 0.2 s.
3. **Minor (lead): `desk_top` is a third chair back** (`visual_re_view_desk_top.png`). Moving the eye to
   (97.5, 27.6, 62) looking at (20, 8, 74) only takes the near share from 32 % to 29 %, so this is a choice for the lead,
   not a builder fix.
4. **Note for round 4:** any darker Tan must keep dE 25 or more from the route and book oranges; the candidates above
   fall to 18 to 20.

## Round 2 re-check 2

**Verdict: PASS.** On the build itself, Tan now reads at every distance (0 % of views under dE 15 at 100 and 150 units).
The budget is unchanged at 10 draw calls idle and 12 while firing or in a burst. All shaders are compiled at load. The
thrown grenade no longer pops in large. One minor defect: the scoped sniper tracer seen end-on is a white square over
the target (finding A).

New scripts: `tests/visual_r2b2_extra.cjs` and `tests/visual_r2b2_tracers.cjs`. I re-ran these with a `now` /
`PFX=visual_re2_` switch: `visual_r2b_teams.cjs now`, `visual_r2b_fx.cjs`, `visual_r2b_fog.cjs`, `visual_r2b_perf.cjs`.
Screenshots: `screenshots/round2/visual_re2_*.png` (10 files). Software rendering, so milliseconds show relative cost
only. `index.html` was not edited.

### Budget

| Item | Re-check 1 | Re-check 2 | Limit |
| --- | --- | --- | --- |
| Draw calls idle (WebGL level, including shadow) | 10 | **10** (7 + 3) | under 200 |
| Full-auto rifle / SMG | 12 / 12 | **12 / 12** | |
| Grenade aim / burst | 11 / 12 | **11 / 12**; shadow pass stays 3 (burst light casts none) | |
| Triangles idle, with shadow | 26,062 | **26,086** (+24: the desk skirt box in both passes) | |
| Shadow lights / map | 1 / 2048 | 1 / 2048 | 1 / 2048 or less |
| Shader programs at load / after first shot, all guns, first aim, four bursts | 11, rising to 22 | **14 / 14 / 14 / 14 / 14** | |
| `index.html` | 146,098 | **148,119 bytes** | under 400 KB |
| Console errors / blocked requests | 0 / 0 | 0 / 0 | |
| Pooling, 500 shots + 20 grenades | flat | flat: scene objects 19, textures 2, programs, lights 3 (1 casting), DOM 73, heap 16.3 MB; geometries 11 to 12 (one first upload) | |

Headroom is unchanged: 188 calls free and 252 KB of file left.

### Items

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Tan reads at every distance (fog 20 / 320 in the build) | **Fixed** | Table below; identical to the live-scene prediction. Strip `visual_re2_team_strips.png`: top row Green, bottom row Tan, at 10, 30, 60, 100 and 150 units |
| 1 | Any worst case worse? | **No, within 0.5** | The single Tan view under 15 is the tunnel-top dummy against the orange ruler ramp from 30 units: dE 13.4, against 13.9 before. Every other worst case improved (the tall-shelf L1 dummy against the wall went from 16.0 to 18.2). Floor at 10 units is 35.2, against 35.0 |
| 2 | Far wall paler than near | **Yes** | From the Green spawn the far south wall is `#BDC8CC` and the near north wall `#DCD2C1`, dE 14.2 (13.5 at the old fog) |
| 2 | Named views | **Look right** | `visual_re2_views.png` (all nine, in section 10 order). Nothing new is blocking; `desk_top` still has the chair back (deferred) |
| 3 | Shaders compiled at load | **Fixed** | 14 programs at load and still 14 after the first shot of every gun, the first aim and four bursts (re-check 1: 11 rising to 22). The first aim frame is within noise of the frame before it |
| 3 | First-burst frame time | **Fixed (residual within noise)** | Burst tick frame 160 ms against 129 to 136 ms for the next five frames, and 161 / 129 / 133 ms on bursts 2 to 4. A second run gave 176 ms against 143 to 149 ms, then 134 / 125 / 128 ms. That is +20 % with no program compiling, down from +35 % with two. Random single frames in the same runs reach 183 to 205 ms, so this is at the noise floor of software rendering. If it shows on real hardware, render one frame at load with the sphere visible at opacity 0: `renderer.compile` compiles programs but does not upload the sphere's geometry |
| 3 | Nothing stray on the first frame | **Clean** | `visual_re2_first_frame.png`: the first canvas frame after load (behind the title overlay) is the spawn view with the rifle. The visible-mesh list holds only the world, the effects pools, the dummies and the rifle. The sphere, arc and muzzle flash are hidden again after the compile |
| 4 | Thrown grenade first visible frame | **Fixed** | Hidden for ticks 1 to 6, first drawn on tick 7 at 2.57 units: 3,899 px, about 62 px or 9 % of the screen height (was 15,257 px, 17 %). Then 3,144 and 2,579 px (`visual_re2_throw_ticks.png`, frames aim, 1, 2, 3, 6, 8) |
| 4 | Dome at opacity 0.4 | **Still reads** | From 40 units the changed area is 222 x 70 px on tick 0 and 144 x 88 px at peak, the same as at 0.55, and it lasts to tick 14. From 14 units the dome still fills its 233 px radius. Objects inside are now seen through it (`visual_re2_burst_40u.png`, `visual_re2_burst_14u.png`) |
| 5 | Tracers per gun | **Fixed** | Down a long lane the rifle, SMG and pistol tracers leave their own muzzle tips. The sniper tracer is a thicker wedge from just ahead of its kicked muzzle (`visual_re2_tracers.png`, top row the shot tick, bottom row 2 ticks later). Visible for 4 ticks (rifle, SMG, pistol) and 12 ticks (sniper, 0.2 s). The tracer is first drawn on the tick after the shot, which is fine |
| 5 | Scoped sniper tracer | **Minor defect** | Finding A |
| 6 | Desk skirt panel | **Fixed, correct colour** | Collider `desk.skirt` at `96..96.5, 73..87, 17..24.5`, surface wood, in line with the aprons at `95.5..96`. It is drawn in the desk colour `#8FA3B5` (shaded face `#818F96`, same as the aprons and desk underside), so it follows the graybox rule of big furniture in its palette colour. No gap or z-fight at its joints with the aprons in `visual_re2_desk_skirt.png` (from the seat, from the seat corner, from the floor) |
| 7 | Budget | **PASS** | Table above |

**Tan and Green in the build** (569 views, same method):

| Team | 10 u | 30 u | 60 u | 100 u | 150 u |
| --- | --- | --- | --- | --- | --- |
| Green median dE (under 15) | 66.5 | 66.9 | 63.8 | 53.3 | 39.9 (0 %) |
| Tan median dE (under 15) | 47.7 (0 %) | 42.5 (1 %, one view) | 45.8 (0 %) | **38.9 (0 %)** | **27.2 (0 %)** |
| Tan, re-check 1 | 47.7 | 41.4 | 40.8 | 27.9 (10 %) | 11.4 (100 %) |
| Tan 10th percentile | 32.0 | 31.6 | 30.8 | 18.4 | 27.0 |

Tan still trails Green by about a third of its contrast, but it no longer drops out. It is limited by size, as Green is:
2.3 px wide at 100 units and 1.6 px at 150 unscoped.

### New findings

A. **Minor: the scoped sniper tracer is a bright square over the target.** Seen end-on, the 0.07-wide box shows its
   near end, 3 units out, as a near-white square at the crosshair. Shooting at a wall 9 to 41 units away: 45 x 45 px
   (2,025 to 2,114 near-white px) on the first tick after the shot, 39 px on tick 2 and 33 px on tick 3. After the scope
   drops it is still about 14 px until tick 12 (`visual_re2_scope_tracer.png`: before, shot tick, tick 3, tick 8).
   A head at 100 units is 9 px in the scope, so the square covers the target, the hit and the start of the tip-over for
   0.1 to 0.2 s. I count this as a defect, not as acceptable. **Fix:** draw no tracer while scoped, since the scoped
   shooter sees the impact and the damage number. Or, if a tracer is wanted, start it at 60 % of the hit distance so
   that its near end is far away and small.

---

# VISUAL.md: round 1 (graybox)

**Verdict: PASS.** Every object in DESIGN.md sections 3 to 7 is drawn in its graybox category colour, with no
z-fighting, gaps or render failures in any named view, and the build sits far inside the budget (5 real draw calls
of 200, one 2048 shadow light, 80 KB of 400 KB). The pass comes with two things to settle before soldiers arrive:
the bed (and round 4 cardboard) is Tan-coloured, and the warm fill light turns the blue walls khaki and the white
ceiling tan.

All numbers below come from scripts in `tests/visual_*.cjs`, run through `tests/harness.cjs`. Rendering is
software (SwiftShader), so **milliseconds and fps are not real-hardware numbers**. Use them only as relative cost.
`index.html` was not edited. Where a fix was tried, it was applied to the live scene inside the test only.

## Budget

| Item | Measured | Limit |
| --- | --- | --- |
| Draw calls per frame, counted at the WebGL level | **5** (3 main pass + 2 shadow pass). 7 with the debug overlay | under 200 |
| Draw calls as `__game.state()` and the overlay report them | 3 (5 with debug). The shadow pass is not counted, see finding 5 | |
| Triangles | 9,990 main pass (4,312 merged static + 5,676 instanced + 2 floor). 19,978 with the shadow pass | no limit set |
| Shadow-casting lights | 1 directional (plus 1 hemisphere fill, no shadow) | 1 |
| Shadow map | 2048 x 2048, PCF soft, redrawn every frame, 0.089 units per texel | 2048 or less |
| Textures | 2: plank canvas 512 x 1024 (mipmapped), shadow map target | |
| Meshes / shader programs | 3 meshes (static, instanced x473, floor) / 7 programs | |
| `index.html` | **80,336 bytes** | under 400 KB |
| External requests | 1 (the pinned Three.js module) | exactly 1 |
| Console errors or warnings | 0 in every session | 0 |
| `__game.render()` at 1280x720, software | 107 ms (bed_top) to 171 ms (west_lane) | relative only |
| `__game.step(1/60)` | 0.002 to 0.006 ms per tick | |

Static geometry is merged into one mesh with vertex colours. Repeated boxes are one `InstancedMesh`: 127 stair
steps, 14 ruin bricks, 8 dominoes, 108 sleepers, 216 rail pieces.

### Relative frame cost (software renderer)

| View | ms | vs cheapest | Fragments shaded per pixel |
| --- | --- | --- | --- |
| bed_top | 107 | 1.00 | 1.24 |
| desk_top | 122 | 1.14 | 1.46 |
| spawn_green / shelf_top | 126 | 1.18 | 1.55 / 1.50 |
| spawn_tan | 128 | 1.20 | 1.55 |
| under_bed | 131 | 1.23 | 1.65 |
| floor_centre | 135 | 1.26 | 1.70 |
| east_lane | 148 | 1.38 | 1.51 |
| west_lane | 171 | 1.60 | 2.10 |

- Cost follows overdraw (`visual_overdraw.cjs`). west_lane is the dearest because the camera sits against a
  cover block that was built last, so the walls, bed and floor behind it are all shaded first and then covered.
- Cost follows pixel count: west_lane is 69 ms at 640x360, 157 to 171 ms at 1280x720, 286 ms at 1920x1080.
  The frame is fill-bound, not triangle-bound.
- **Most expensive effect: sampling the shadow map in the lit materials.** With shadow sampling off, west_lane
  drops from 157 to 59 ms (62 % of the frame). The shadow depth pass is another 17 % (157 to 131 ms with the map
  frozen). With shadows fully off the frame is 37 ms (west_lane) and 19 ms (bed_top), so shadows are 76 to 81 %
  of frame time here. PCF instead of PCF soft saves nothing (142 vs 138 ms). Fog is about 8 %. The debug overlay
  adds about 6 %.
- Simulation cost is negligible: under 0.4 ms per second of game time.

### Headroom for rounds 2 to 4

About 195 draw calls are free. Every shadow-casting mesh costs two (main and shadow pass). Rough estimate:

| Addition | If merged or instanced | If built from loose parts |
| --- | --- | --- |
| Final art (static mesh split by material) | 6 to 10 | 24 (12 materials x 2) |
| Train, engine + 4 cars | 10 to 14 | 30+ |
| 10 soldiers | 4 (instanced per team) to 20 (one mesh each) | 120 (6 limbs each, with shadows) |
| Weapons, tracers, grenade, decals | 6 to 10 | 20 |
| **Total with today's 5** | **about 35 to 60** | **about 200, over the limit** |

The risk is soldiers made of separate limb meshes. One mesh per soldier (or one instanced mesh per team) keeps
the whole game under 80. File size has 320 KB left.

## Findings, most severe first

### 1. Major (before round 3): the bed is Tan-coloured, and so is round 4 cardboard
- Probe colours (`visual_colours.cjs`, camera 5 units from each surface, centre pixels read from the GL buffer):
  bed top in shade `#CE9751`, bed side `#B27C3F`, bed top in sun `#F6B15C`.
- A Tan soldier's shadow-side colour `#B8975A` under the same light renders `#BF934D` (top), `#A4793C` (side),
  `#E4AD58` (sun). Distance from the bed: dE 5.5, 5.6 and 6.9. Under 10 is hard to tell apart at a glance.
  Against the main Tan `#E0C080` the bed is dE 12 to 20.
- This is in the palette, not the lighting: bed frame `#C79A5E` vs Tan shadow `#B8975A` is dE 5.7 as plain hex,
  and it stayed at dE 5 to 6 under every lighting variant tried.
- Same problem waiting in round 4: cardboard `#C9A26B` (tunnel, shoebox) vs Tan shadow is dE 6.1, vs Tan dE 11.3.
- Seen in `visual_bed_top.png` (44 % of the frame is one tan-orange surface) and `visual_close_overview_sw.png`.
- **Fix (lead, palette):** move the bed frame and cardboard away from Tan, for example bed frame to a redder,
  darker wood near `#8A5A3C` and cardboard to a greyer `#B0A090` (example values, not tried), or shift Tan itself. In graybox, the builder
  could colour the bed slab top with the sheet colour `#E8EEF5` so only the frame sides carry the wood colour.

### 2. Major (look): the warm fill light overrides the palette. Walls are khaki, the ceiling is tan
- Walls: palette `#BFD3E0`, rendered `#AAAA9B` on all four walls (hue 60, saturation 9 %). No blue is left.
- Ceiling: palette `#F5F2EA`, rendered `#AF8A64`. That is dE 15 from a Tan soldier's shadow side, over the
  whole ceiling. Shelf undersides render `#AB855E`, desk underside `#655B4C`.
- Skirting, door and shelf posts (palette near-white) render `#D8C1A0`. Sunlit pillows clip to `#FFFFF1`.
- Cause: hemisphere fill at intensity 3.4 with ground colour `#B08D6A`. Measured light factor on vertical faces
  is (0.77, 0.62, 0.44) in linear RGB, on down-facing faces (0.47, 0.29, 0.16).
- Seen in `visual_spawn_green.png`, `visual_close_ceiling_light.png`, `visual_east_lane.png`.
- **Fix, tried in `visual_suggest.cjs`:** sky `#FFF8EC`, ground `#D8CFC4`, hemisphere 3.0, sun 3.0. Walls become
  `#ADB9BB` (dE to palette 21.8 down to 11.1), ceiling `#CBC0B0` (dE to Tan shadow side 15 up to 34), and the
  sunbeam reads better (lit vs shaded floor dE 9.7 up to 13.2). Before and after: `visual_spawn_green.png` vs
  `visual_suggest_A_spawn_green.png`, `visual_shelf_top.png` vs `visual_suggest_A_shelf_top.png`. These are the
  lead's palette values (section 13), so the lead decides; the builder then changes four numbers in `CONFIG`.

### 3. Medium: sun shadows cover about 4 % of the floor, and the rest of the room has no shading cues
- The sunlit floor patch is x 55 to 72, z 67 to 111 (floor scan in `visual_clip.cjs`), about 3.9 % of the floor,
  plus roughly 30 % of the bed top (by geometry). DESIGN section 3 expects x 38 to 72, z 70 to 95. The bed slab and the window's
  glazing bar catch everything west of x 55. A point DESIGN calls sunlit, (52.8, 0, 102), renders as shade.
- Everywhere else the walls and ceiling block the sun, so nothing casts a shadow: both forts, both lanes, the
  desk, the shelves (`visual_close_fort_tan_outside.png`, `visual_close_bucket_spares.png`,
  `visual_close_track_north_curve.png`). Objects look pasted on the floor.
- Under the bed is as bright as the open floor: both read `#7F4C27` (dE 0). The bed's underside `#8D5624` is
  dE 8 from the floor, so `visual_under_bed.png` is brown above and brown below.
- So the effect that takes 76 to 81 % of frame time is visible on about 4 % of the floor.
- **Fix (builder, no extra light, not tried):** darken the under-bed and under-desk zones with baked vertex colour
  (multiply the bed underside and legs by about 0.6) and one dark transparent quad on the floor under each
  (2 draw calls). From round 3 add blob shadows under soldiers as one instanced mesh (1 draw call).
  **Lead:** correct the sunbeam footprint in section 3, or steepen the sun if the beam must reach x 38.

### 4. Medium: the camera enters visual-only geometry, which then disappears
The player was walked into each surface with normal movement (`visual_clip.cjs`):
- Skirting (0.6 thick, player radius 0.4): touching any wall, the skirting on that wall is not drawn.
  `visual_clip_skirting_down.png` shows bare wall; `visual_clip_skirting_down_ref.png` (1.4 back) shows the board.
- Door slab (0.35 thick, so 0.05 from the eye, exactly the near plane): turn 0.6 rad while touching it and the
  right part of the door is cut away to the wall behind (`visual_clip_door_yaw06.png`).
- Door frame (0.7 thick): invisible when touched (`visual_clip_doorframe_straight.png`).
- Ball: drawn as a sphere of radius 4, collider is a cylinder of radius 3.4 (as DESIGN says). Jump while pushing
  into it and the eye gets 3.934 from the centre, inside the sphere, and the whole ball vanishes
  (`visual_clip_ball_jump.png`).
- **Fix:** skirting 0.3 thick, door slab 0.2, door frame 0.3 (all under radius minus near plane), or give them
  colliders. Ball collider radius 3.6 (a DESIGN section 6 change for the lead).

### 5. Medium: the draw-call counter leaves out the shadow pass
- `state().drawCalls` and the overlay say 3. A WebGL-level count says 5 (`visual_perf.cjs`). Three.js resets
  `renderer.info` after the shadow pass, so those calls are lost.
- Today the gap is 2. In round 3 every shadow-casting soldier and train car adds one uncounted call, so the
  number checked against the 200 budget could be low by nearly half.
- **Fix:** in `renderFrame`, set `renderer.info.autoReset = false` once and call `renderer.info.reset()` before
  `renderer.render(...)`.

### 6. Minor: the debug text panel is hidden in every named view
- `setView` hides `#hud`, and `#debug` is inside it. Wireframes and the waypoint graph show, but fps, draw calls,
  triangles and position do not (`visual_spawn_green_debug.png` and the eight other `_debug.png` view shots).
  The panel does show in player view (`visual_hud_debug_720.png`).
- **Fix:** move `#debug` out of `#hud`, or hide only the crosshair and health in a named view.

### 7. Minor (lead): three named views are mostly blocked by nearby geometry
- west_lane: the eye (40, 1.6, 30) lies on the east face of block W-a (`37..40, 28..31`). 62 % of
  `visual_west_lane.png` is one grey face. Suggest eye (42, 1.6, 24), the `n.w.1` node, same target: tried in
  `visual_suggest_west_lane_eye.png`, largest single surface 20 %, and it shows cover, slope, bed and track.
- desk_top: the chair back is 11 units in front of the eye. Chair back plus desk top fill 59 % of
  `visual_desk_top.png`, and the bed it looks toward is hidden.
- floor_centre: the ruin's north stub (1.8 high) is above eye height 5 units ahead (`visual_floor_centre.png`).
- The build matches section 10 exactly (pixel-identical to a free camera at the listed eye). Only the table
  needs changing.

### 8. Minor: shadow map resolution shows at soldier scale
- One texel is 0.089 x 0.085 units, so a 0.8-wide soldier is about 9 texels.
- A 0.2-unit strip of light between the bed's shadow and the glazing-bar shadow renders as a dotted line along
  x 53 (`visual_shadow_strip_topdown.png`, `visual_shadow_window_bars_floor.png`).
- Shadows of thin objects wash out: the 0.5-thick dominoes leave only a faint smudge.
- No acne, no peter-panning (floor is in shadow right at the block's base), no cut-off: the shadow frustum
  covers the whole room.
- **Fix:** none needed for graybox. Recheck in round 3 with real soldiers before touching bias or radius.

### 9. Minor: cover grey and the desk and chair colour are nearly the same
- Rendered sides: cover `#898377`, desk leg `#7F837D`, dE 5.4. Tops: dE 6.0. Palette hex: dE 5.7.
- On the floor, cover reads fine against brown planks, and routes read instantly (orange vs anything is dE 30+).
  On the desk top the mug, books and pencil cup barely separate from the desk (`visual_close_desk_items.png`).
- Spare soldiers `#A59989` vs cover sides is dE 9.4, so they read as cover.
- **Fix (lead):** a darker graybox cover grey, for example `#6F7985` (not tried), would separate cover from furniture and walls.

### 10. Minor items
- **Ceiling light is invisible:** fitting `#AD8962` vs ceiling `#AF8A64`, dE 0.8 (`visual_close_ceiling_light.png`).
  Finding 2's fix helps; in round 4 give it an unlit warm white.
- **Haze is a weak distance cue on walls:** the same wall point is `#AAAA9B` from 8 units and `#C1BDAD` from 155,
  dE 7.5 (1.6 at 80 units). Fog is working at the specified numbers; the lit wall is simply close to the haze
  colour. Scale reads from planks and furniture size instead. Finding 2's bluer walls also help here.
- **Ruler ramps hang beside the desk:** they span x 92.5 to 95.5 and the desk starts at x 95, so only a 0.5 strip
  touches and the upper end floats in the air (`visual_close_ruler_desk_join_side.png`). These are DESIGN 4.2
  numbers. Suggest x 94 to 97 for final art.
- **HUD and title:** crosshair is centred (640,360 and 960,540) and health sits at 24 px from the left, 20 px
  from the bottom at both sizes; all text is legible (`visual_hud_720.png`, `visual_hud_1080.png`,
  `visual_title_720.png`, `visual_title_1080.png`). Sizes are fixed pixels, so at 1080p the key list is 15 px and
  the crosshair is a 6 px dot. The health readout shows through the title overlay. Suggest `clamp()` sizes and
  hiding `#hud` until play starts.
- **Plank texture repeat:** the joint pattern repeats every 12.8 x 25.6 units and is visible from above
  (`visual_close_overview_top.png`). Plank size is right: 3.2 units measured in `visual_close_planks_topdown.png`.
- **Pixel ratio is capped at 2 with 4x MSAA.** The frame is fill-bound, so a high-DPI laptop with an integrated
  GPU pays 4x the pixels. Suggest a cap of 1.5 in `CONFIG`.

## Checked and clean

- **Z-fighting and flicker:** each named view and three wide views rendered from two eye positions 0.006 units
  apart; no blob of changed pixels anywhere (`visual_analyse.py jitter`, images `visual_jitterdiff_*.png`).
  A geometric check of all 9,988 drawn triangles found no coplanar same-facing overlap between different colours that
  is visible (the only hits are skirting hidden inside bed legs, desk legs and shelf posts).
- **Colliders vs visuals** (`visual_geometry.cjs`): 345 of 347 colliders have drawn geometry at their exact
  corners. The two others are the floor (drawn as the plank plane) and the ball (finding 4). Visual-only pieces
  are exactly the ones DESIGN calls visual: skirting, door, frame, knob, window frame, sill and bars, ceiling
  light, lamp shade, string end tabs, track. Wireframes line up in every `_debug.png` shot, and the waypoint
  graph is drawn (through walls, by design).
- **Nothing floats or sinks** except the chair back panel (held by its posts, as designed) and the ruler ramps
  above. Only the shelf posts pass through the shelf boards, same colour, not visible.
- **Routes:** every route part in section 4.4 is orange and every string is yellow: blanket slope, bed, chair and
  shelf book stairs with both landings, spring pad, skateboard, two ruler ramps, two ruler bridges, 8 strings.
  Strings show as about 3 to 5 px of yellow from the spawns and the bed, 11 px in east_lane.
- **Nothing near Green:** the closest any probed surface gets to a Green soldier colour, lit or shaded, is dE 36
  (the dark desk underside). Walls are dE 56, the floor dE 54.
- **Hard rules:** one file; the only URL in the source is the pinned Three.js module; the network log shows that
  single request; no other import, asset, font, image, data URI or library; no brand or trademarked toy name in
  the source or on screen (a scan for 92 brand and franchise names matched only a substring of the element id `titleGo`).

### Section 3 to 7 checklist (seen in `visual_close_overview_top.png`, `_ne.png`, `_sw.png` and the close-ups)

| Section | Seen |
| --- | --- |
| 3 Room | walls, plank floor, ceiling, skirting on four walls broken at the door, door with frame and knob, window with frame, sill and glazing bars, ceiling light (present but see finding 10) |
| 4.1 Bed | slab, 4 legs, blanket slope, book stairs, spring pad, ridges R1 and R2, pillows P1 and P2 with three terraces, shoebox, sock, 8 dust bunnies, bear (body, head, 2 legs), bucket, 6 lying and 2 standing spare soldiers |
| 4.2 Desk | top, 4 legs, chair seat, 4 legs, back posts and panel with the open gap, skateboard ramp, chair stairs, 2 ruler ramps, yo-yo string and body, shoelace, 2 ruler bridges, lamp, mug, notebook, 3 stacked books, pencil cup, 2 erasers, paper ball |
| 4.3 Shelves | tall shelf with 3 boards, small shelf with 2, posts, both stairs and landings, 6 strings, all 10 shelf items |
| 5 Forts and ruin | both forts with slits, pillars, gate and door gaps, tower, parapet with 2 crenels, tower ramp; ruin walls with sills, both stubs, platform, pillar, 14 loose bricks |
| 6 Floor cover | W-a, W-b, C-a, C-b, E-a, E-b on both halves; dump truck and game box north; marble run and ball south; both domino rows; both C-f blocks; tunnel |
| 7 Track | full oval, rails and sleepers, passing through the tunnel |

## Screenshots (all in `screenshots/round1/`)

- Named views: `visual_<view>.png` and `visual_<view>_debug.png` for spawn_green, spawn_tan, bed_top, desk_top,
  shelf_top, floor_centre, under_bed, east_lane, west_lane (1280x720).
- 1920x1080: `visual_spawn_green_1080.png`, `visual_shelf_top_1080.png`, `visual_title_1080.png`,
  `visual_hud_1080.png`, `visual_hud_debug_1080.png`.
- Title and HUD at 720: `visual_title_720.png`, `visual_hud_720.png`, `visual_hud_debug_720.png`.
- Close-ups `visual_close_*.png` (41), shadows `visual_shadow_*.png` (14), clipping `visual_clip_*.png` (9),
  trials of suggested fixes `visual_suggest_*.png` (11), jitter pairs and diffs `visual_jitter*.png`.

## Scripts (run from `tests/` with `node name.cjs`)

| Script | What it measures |
| --- | --- |
| `visual_views.cjs` | named views, debug, title, HUD at both sizes |
| `visual_perf.cjs` | GL-level draw calls per pass, triangles, lights, textures, frame cost per view, cost breakdown, sim cost |
| `visual_overdraw.cjs` | fragments shaded per pixel in each view |
| `visual_geometry.cjs` | colliders vs drawn geometry, coplanar overlaps, floating and interpenetrating parts |
| `visual_colours.cjs` | rendered colour of 49 surfaces vs palette and vs team colours under the same light, fog |
| `visual_closeups.cjs`, `visual_shadows.cjs` | checklist close-ups, shadow close-ups, jitter pairs |
| `visual_clip.cjs` | camera clipping at skirting, door, frame and ball; sunbeam footprint scan |
| `visual_suggest.cjs` | lighting variants and shadow filter cost, applied in the test only |
| `visual_analyse.py jitter` | compares the jitter pairs |

---

# Re-check (round 1, after FIXLIST passes 1 and 2)

**Verdict: PASS.** The lighting and bed-colour fixes worked as intended, the new geometry is drawn cleanly, and
the budget is unchanged in draw calls. One new look issue: the sunlit bed top clips to near white and the pillows
no longer separate from the bed.

Scripts rerun on the fixed build: `visual_colours.cjs`, `visual_geometry.cjs`, `visual_perf.cjs`, plus the new
`visual_recheck.cjs`. Software rendering again, so milliseconds are relative only. `index.html` was not edited.
Deferred items (skirting clipping, draw-call counter, blocked views, sun shadow coverage) were not re-tested.

## Budget

| Item | First run | Now | Limit |
| --- | --- | --- | --- |
| Draw calls per frame, WebGL level | 5 | **5** (3 main + 2 shadow); 7 with debug | under 200 |
| Draw calls as `state()` reports | 3 | 3 (deferred) | |
| Triangles, main pass | 9,990 | **10,362** (4,684 static + 5,676 instanced + 2 floor) | none set |
| Triangles with shadow pass | 19,978 | 20,722 | |
| Shadow lights / map | 1 / 2048 | 1 / 2048 | 1 / 2048 or less |
| Textures / meshes / programs | 2 / 3 / 7 | 2 / 3 / 7 | |
| `index.html` | 80,336 bytes | **85,035 bytes** | under 400 KB |
| External requests / console errors | 1 / 0 | 1 / 0 | 1 / 0 |
| `render()` at 1280x720, software | 107 to 171 ms | 100 to 157 ms (bed_top to west_lane) | relative only |
| `step(1/60)` | 0.002 to 0.006 ms | 0.005 to 0.008 ms | |

Colliders went from 347 to 356. The new pieces all went into the merged static mesh, so no draw call was added.

## Checks

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Walls blue, ceiling off-white | **Fixed** | Walls `#AAAA9B` to `#ADB9BB` (hue 189). Ceiling `#AF8A64` to `#CBC0B0` (saturation 43 % to 13 %). `visual_re_spawn_green.png`, `visual_re_east_lane.png` |
| 2 | Bed at least dE 20 from both Tan shades; no drift toward Green or Tan | **Fixed** | Bed vs Tan under the same light: top 30.8, side 28.7, sunlit 36.0. Vs Tan shadow side: 38.0, 35.4, 45.4. Closest any surface gets to a Tan shade is the sunlit plank floor at dE 18.8 (dark brown `#995C30`, saturation 69 %); everything else is 24 or more. Closest to Green is dE 45 |
| 3 | Blown-out surfaces | **Not clean, new finding A** | Bed top in sun `#FFFFE3` (red and green at 255), sunlit pillow `#FFFFFF`. 44 % of `visual_re_bed_top.png` is clipped. No other view clips more than 1.3 % |
| 4 | Haze | **Fixed** | Same wall point: `#ADB9BB` at 8 units, `#BCC2BF` at 80, `#D9D4C7` at 155 (near vs far dE 7.5 to 14.6). Cover grey at 60 units is `#989A98`, dE 4.5 from close up and dE 14.6 from the wall behind it. The red fort at 117 units is `#D48A7A`, still dE 36 from the wall. `visual_re_spawn_green.png`, `visual_re_spawn_tan.png` |
| 5 | New geometry drawn, graybox colours, no z-fighting or gaps | **Fixed** | See below |
| 6 | Budget | **Within budget** | Table above |

### Check 5 detail

- Drawn and collider-matched (`visual_geometry.cjs`): both stair guards, both ruler props, both seat stoppers,
  W-c on both halves, E-c north, four jumbo crayons at 1.3 high. All are cover grey `#9AA3AD`
  (rendered `#8C8F90` sides, `#979B9C` tops). Seen in `visual_re_close_guard_tall.png`,
  `visual_re_close_guard_small_floor.png`, `visual_re_close_chair_props.png`, `visual_re_close_seat_stoppers.png`,
  `visual_re_close_cover_w_c.png`, `visual_re_close_cover_e_c.png`, `visual_re_close_crayons.png`.
- Route laps: 12 orange strips (`#FA831B` rendered), 0.05 above the surface, at every ramp, bridge and stair
  head. Visual only. Seen from the top surface in `visual_re_close_desk_laps.png`.
- Strings now run 2 units above their top surface and show from above (`visual_re_close_strings_from_L3.png`).
- Z-fighting: all 9 named views and 13 close-ups rendered from two eyes 0.006 units apart. No view has a single
  solid 5x5 block of changed pixels, so only edges moved. The geometric check found no visible coplanar overlap
  between different colours; the new hits are undersides of laps, props and stoppers resting on the seat.
- The ruler upper ends now rest on the props (gap 0.3, the ruler's thickness), so the "ruler floating beside the
  desk" note from the first run is closed. The props overlap the stoppers by 0.2 to 0.45 units, same colour, not
  visible.

## New findings

- **A. Minor: the sunlit bed top clips and the pillows disappear into the bed.** Bed top in sun is `#FFFFE3`
  and the pillow on it `#FFFFFF` (dE 14). In shade they are `#E4D9C6` and `#E3E3DE` (dE 8.9). In
  `visual_re_bed_top.png` 44 % of the frame is one clipped pale-yellow surface, and in
  `visual_re_close_bed_pillows.png` the pillow terraces barely read. The bed top also matches the skirting and
  door (dE 2.6). Suggest drawing the graybox bed top in the blanket colour `#3D5A99` (it is the blanket in
  round 4 anyway) and keeping `#E9E4DA` for the frame sides, or dropping sun intensity to about 2.4. Not tried.
- **B. Minor: the bed underside is now much lighter than the floor** (`#C1B5A4` against `#774A29`), so under the
  bed reads as a bright room (`visual_re_under_bed.png`). This belongs with the deferred under-bed darkening.
- **C. Note: haze is strong at overview distances.** From a ceiling corner the far half of the room is heavily
  washed (`visual_re_close_overview_ne.png`, `visual_re_close_overview_sw.png`). Player views top out near 150
  units and stay readable, so this only matters for the tall-shelf sniper sightline in later rounds.
- **D. Carried, unchanged:** cover grey vs desk and chair is still dE 5.3, and the ceiling light fitting is still
  invisible against the ceiling (dE 0.9).

Screenshots for this re-check: 22 files, `screenshots/round1/visual_re_*.png` (9 named views, 13 close-ups).
