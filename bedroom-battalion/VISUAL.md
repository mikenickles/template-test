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
