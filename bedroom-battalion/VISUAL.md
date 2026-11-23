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
