# Bedroom Battalion: DESIGN.md

Owner: Lead. This is the single source of truth for layout, numbers and style.
The builder transcribes it; testers check the build against it. If the build
and this file disagree, this file wins until the lead changes it.

## 0. Conventions

- Units: 1 unit = 1 m at soldier scale (about 35x real size, so 1 unit is about 2.86 cm real).
- Axes: x runs west (0) to east (120). z runs north (0) to south (160). y is up (0 floor, 90 ceiling).
  This is right-handed and matches Three.js directly (east x up = south).
- Boxes are written `x0..x1, z0..z1, y0..y1`. `h N` means `y 0..N` unless a base is given.
- Mirror rule: "mirrored" means the same object also exists at `z' = 160 - z` (north-south mirror).
  Green owns the north half, Tan the south half.
- Node ids: `n.` north half, `s.` south half, `m.` on the z = 80 midline.
- Yaw: radians, 0 faces north (-z), positive turns left (toward west). Pitch: radians, positive looks up.

## 1. Pillars (priority order)

1. SCALE  2. GUN FEEL  3. VERTICAL PLAY  4. THE TRAIN  5. READABILITY.
If two goals conflict, the higher pillar wins.

## 2. CONFIG starting values

All of these live in one `CONFIG` object at the top of index.html.

| Key | Value | Note |
| --- | --- | --- |
| player.height / eye | 1.8 / 1.6 | crouch 1.2 / 1.0 |
| player.radius | 0.4 | capsule |
| move.walk / sprint / crouch | 5 / 7 / 2.5 u/s | sprint only forward |
| move.groundAccelTime | 0.10 s to full speed | snappy |
| move.groundStopTime | 0.08 s | no sliding |
| move.airControl | 0.12 | fraction of ground accel (was 0.25; a jump could be fully reversed in the air) |
| move.gravity | 22 u/s^2 | |
| move.jumpVel | 7.8 u/s | apex about 1.38 |
| move.stepUp | 0.65 | auto step, used by all book stairs |
| move.maxSlopeDeg | 50 | steeper counts as a wall |
| move.slopeSpeedKeep | horizontal speed constant on ramps | no slowdown uphill |
| climb.speed | 5.5 u/s | strings (was 3.5; strings were never the faster choice) |
| climb.grabRadius | 0.8 | horizontal distance to string |
| fall.safe / perUnit | 10 units / 5 hp per unit above | bed to floor = 40 hp |
| spring.launchVel | (-4.5, 31, 0) | lands about (29, 18, 80) |
| camera.fovVertical | 75 deg | feel tester confirmed 75; wider shrinks the furniture. Read live from CONFIG |
| camera.near / far | 0.05 / 400 | |
| fog (linear) near / far | 20 / 320 (round 2: with the cool haze colour this keeps the far wall pale and lets Tan read at 150 units; was 10 / 220) | colour = haze colour (was 30 / 330, which added no depth). Read live from CONFIG |
| light.hemi sky / ground / intensity | `#FFF8EC` / `#D8CFC4` / 3.0 | the fill must not tint walls khaki or the ceiling tan |
| light.sun intensity | 3.0 | |
| sim.hz | 60 fixed, render interpolated | |

Weapon, bot and match numbers are added in rounds 2 and 3 (section 12 lists them).

## 3. Room shell

- Room: `0..120, 0..160, 0..90`. Four walls, floor, ceiling. Walls are colliders.
- Floor: wood planks running north-south, each plank 3.2 wide with a dark 0.12 gap line (canvas texture).
- Skirting board: 4 tall, 0.6 thick, all four walls (visual; the wall is the collider).
- Door: north wall, `x 14..44`, `y 0..72`, closed, with a frame 1.5 wide and a knob at y 36. Visual only.
- Window: west wall above the bed, `z 58..102`, `y 36..74`, with a sill sticking out 1.5.
- Sun: one directional light entering through the window, direction about `(1, -1, 0.15)` normalised,
  so the sunbeam lands on the centre of the floor (about x 38..72 at z 70..95).
- Ceiling light: a round fitting at `(60, 86, 80)`, radius 6. Visual only.

## 4. Furniture

### 4.1 Bed (west wall)

| Part | Box / shape |
| --- | --- |
| Bed slab (frame + mattress) | `0..35, 45..115, 6..18` (top y 18) |
| Legs (4) | 3 x 3, `y 0..6`, at the four corners of the slab |
| Under-bed space | `y 0..6` under the slab, open on north, east and south sides |
| Blanket slope (route) | solid wedge `x 20..32`, rising from `z 25, y 0` to `z 45, y 18` (42 deg) |
| Book stairs, south (route) | `x 22..30`, 30 steps, each 0.6 high and 0.9 deep, top at `z 115, y 18`, foot at `z 142` |
| Spring pad (route) | `36.5..39.5, 78.5..81.5, 0..0.4`, launches with spring.launchVel onto the bed |
| Blanket ridge R1 | on bed top, `x 4..31`: ramp up `z 56..60` (0 to 2), ramp down `z 60..64` |
| Blanket ridge R2 | on bed top, `z 70..90`: ramp up `x 13..17` (0 to 2.4), ramp down `x 17..21` |
| Pillow P1 | `2..16, 100..112`, three terraces 0.6 high each, each inset 1.2 |
| Pillow P2 | `19..33, 100..112`, same |
| Shoebox (under bed) | `9..21, 72..88, 0..5` |
| Lost sock (under bed) | `4..14, 52..55, 0..1.6` |
| Dust bunnies (under bed) | cylinders r 1.5, h 2 at (28,58) (6,66) (14,69) (28,102) (6,94) (14,91) (15,108) (20,106) |
| Stuffed bear (north end) | body `4..16, 35..45, 0..9`; head `6..14, 37..45, 9..15`; legs `4..9, 28..35, 0..3` and `11..16, 28..35, 0..3` |
| Tipped bucket (south end) | `4..16, 115..127, 0..10` |
| Spare soldiers by bucket | pale grey statues, never Green or Tan. 6 lying (`1.8 x 0.6`, h 0.5) and 2 standing (`0.8 x 0.8`, h 1.8) within `x 3..15, z 128..136` |

No headboard (it would block the south route).

### 4.2 Desk and chair (east wall)

| Part | Box / shape |
| --- | --- |
| Desk top | `95..120, 55..105, 24.5..26` (top y 26) |
| Desk legs (4) | 2.5 x 2.5, `y 0..24.5`, at the four corners |
| Chair seat | `85..96, 73..87, 15.8..17` (top y 17) |
| Chair legs (4) | 1.2 x 1.2, `y 0..15.8`, at the seat corners |
| Chair back | posts `85..86.2` at `z 73..74.2` and `z 85.8..87`, `y 17..33`; panel `85..86.2, 73..87, 22..33` (gap y 17..22 is open) |
| Skateboard ramp (route) | slab `x 86..92`, rising from `z 50, y 0` to `z 73, y 17`, thickness 0.6 |
| Chair book stairs (route) | `x 86..92`, 29 steps (rise 17/29, depth 0.8), top at `z 87, y 17`, foot at `z 110.2` |
| Ruler ramp north (route) | slab `x 92.5..95.5`, rising from `z 75, y 17` to `z 64, y 26`, thickness 0.3 |
| Ruler ramp south (route) | slab `x 92.5..95.5`, rising from `z 85, y 17` to `z 96, y 26`, thickness 0.3 |
| Yo-yo string (route) | vertical string at `(107, 54.5)`, `y 0..26`, exit direction +z onto the desk |
| Yo-yo body | cylinder at (111, 52), r 2.2, h 1.4 |
| Shoelace (route) | vertical string at `(107, 105.5)`, `y 0..26`, exit direction -z onto the desk |
| Ruler bridge north (route) | slab `x 110..113`, from `z 55, y 26` down to `z 44, y 20`, thickness 0.3 |
| Ruler bridge south (route) | slab `x 110..113`, from `z 105, y 26` down to `z 116, y 20`, thickness 0.3 |
| Lamp | base cylinder (115, 63) r 3.5, `y 26..27.2`; post r 0.6 to y 40; shade above (visual) |
| Mug | cylinder (115, 74) r 2.8, `y 26..33` |
| Open notebook | `99..111, 74..86, 26..26.4` (walkable) |
| Stacked books | `111..119, 86..93`, three books 1.2 high each, each inset 0.6 (`y 26..29.6`) |
| Pencil cup | cylinder (115.5, 98) r 2.6, `y 26..35` |
| Ruler props (2) | stacks of books filling the space under each ruler outside the seat: north `92.5..95.5, 64..73`, south `92.5..95.5, 87..96`, solid from the floor up to the ruler's underside (stepped boxes or one wedge). With these there is no gap to fall into beside the skateboard or the chair stairs |
| Seat stoppers (2) | cylinders r 0.5, `y 17..18`, at (92.45, 73.3) and (92.2, 86.7) (north one moved by the builder so it does not push skateboard lanes off the board). They close the seat edge between each ramp head and ruler foot so cutting the corner cannot drop you off the seat |
| Under desk | eraser `104..108, 66..68, 0..1.2` (mirrored); paper ball cylinder (114, 92) r 2.5, h 4.5 (round 5: moved from (108, 80), out of the chicane); round 5 chicane: two toy chests h 3, `96..107, 76..78.5` (north, blue) and `105..120, 81.5..84` (south, purple), staggered so there is no straight sight line along z 80 under the desk |

Slab ramps are thin: solid only from the walking surface down by `thickness`. You can pass underneath
wherever there is 1.9 or more of clearance.

### 4.3 Shelves (east wall corners)

Both are open ladder shelves: four corner posts 1.2 x 1.2 and horizontal boards 1 thick. No side panels.

| Part | Tall shelf (south-east, Tan side) | Small shelf (north-east, Green side) |
| --- | --- | --- |
| Footprint | `108..120, 116..156` | `108..120, 4..44` |
| Board tops | y 20 (L1), 40 (L2), 60 (L3, top) | y 20 (L1), 40 (L2, top) |
| Posts | to y 60 | to y 40 |
| Book stairs floor to L1 | `x 103.5..108`, 34 steps (rise 20/34, depth 0.85), foot at `z 151`, top at `z 122.1`, landing `103.5..108, 116..122.1, 0..20` | mirrored: foot at `z 9`, top at `z 37.9`, landing `z 37.9..44` |
| Ruler bridge from desk | arrives on L1 at `z 116` | arrives on L1 at `z 44` |
| Strings L1 to L2 | at `(107.6, 130)` and `(107.6, 146)`, `y 20..40`, exit +x | at `(107.6, 30)` and `(107.6, 14)`, `y 20..40`, exit +x |
| Strings L2 to L3 | at `(107.6, 136)` and `(107.6, 152)`, `y 40..60`, exit +x | none |
| L1 items | upright books `114..119.5, 134..142`, h 7; piggy bank `112.5..117.5, 123..127`, h 4 | upright books `114..119.5, 18..26`, h 7; plant pot cylinder (115, 36) r 2, h 4 |
| L2 items | globe cylinder (115, 142) r 4, h 10; upright books `114..119.5, 120..128`, h 7 | flat books `112..119, 20..27`, h 1.2; alarm clock `113..118, 34..37`, h 4 |
| Stair guard | row of tall upright books under L1 beside the stairs: `108..108.6, 122.1..151, 0..19` | mirrored: `108..108.6, 9..37.9, 0..19` |
| L3 items | trophy cylinder (115, 128) r 2.5, h 9; flat books `112..119, 142..149`, h 1.2 | - |

The spec asks for a smaller shelf opposite the tall one, so Tan's corner is 20 units taller.
This is a known balance watch item for round 5.

### 4.4 Route summary (every one must work in round 1)

| Route id | From to | Parts |
| --- | --- | --- |
| bed_blanket | floor to bed (north end) | blanket slope |
| bed_books | floor to bed (south end) | book stairs |
| bed_spring | floor to bed (east side, middle) | spring pad |
| desk_skate | floor to desk | skateboard ramp, chair seat, ruler ramp north |
| desk_stairs | floor to desk | chair book stairs, chair seat, ruler ramp south |
| desk_yoyo | floor to desk (north end) | yo-yo string |
| desk_lace | floor to desk (south end) | shoelace |
| tall_stairs | floor to tall shelf L1 | book stairs |
| tall_bridge | desk to tall shelf L1 | ruler bridge south |
| tall_L2_a / tall_L2_b | L1 to L2 | strings at z 130 / z 146 |
| tall_L3_a / tall_L3_b | L2 to L3 | strings at z 136 / z 152 |
| small_stairs | floor to small shelf L1 | book stairs |
| small_bridge | desk to small shelf L1 | ruler bridge north |
| small_L2_a / small_L2_b | L1 to L2 | strings at z 30 / z 14 |
| tunnel_drop | chair seat to tunnel box top | drop of 9 through the chair-back gap |

String rules: walk into a string within grabRadius while your feet are between its bottom and top to grab it.
Forward climbs, back descends, jump lets go. At the top you are placed on the surface 1 unit along the exit direction.
At the bottom you step off. Strings can be used downward by walking into them from the top surface.
After topping out, forward input is ignored until it is released and that string cannot be re-grabbed for 0.5 s,
so holding forward leaves you standing on the surface. Letting go of a string never grants an extra mid-air jump.

Seeing routes from above: every string is drawn 2 units higher than its top surface, and every ramp, bridge and
stair head laps its route colour 1.5 units onto the top surface it reaches, so the way down is visible from on top.

Blocked step-ups: when a step up is refused for lack of head room, the obstacle acts as a wall and the player
slides along it. It never cancels the whole move.

## 5. Forts and ruin

### 5.1 Green fort (north). Tan fort is the mirror.

| Part | Box / shape |
| --- | --- |
| Footprint | `46..74, 6..26`. Walls 1.5 thick, 3.3 tall |
| North wall | `46..74, 6..7.5, 0..3.3` |
| West wall | `46..47.5`, `z 7.5..15` and `z 19..24.5` (door gap z 15..19) |
| East wall | `72.5..74`, `z 13..15` and `z 19..24.5` (door gap z 15..19) |
| South wall (front) | `z 24.5..26`, segments `x 46..57.5` and `x 62.5..74` (gate gap x 57.5..62.5) |
| Firing slits (front wall) | lower wall `y 0..1.15`, open slit `y 1.15..1.85`, upper wall `y 1.85..3.3`; solid pillars 1.5 wide at x 46, 51, 56 and x 62.5, 67.5, 72.5 |
| Tower | solid `67..74, 6..13, 0..7`; parapet 0.5 thick, 1.1 high on the north, east and south edges, two 1.2 crenel gaps on the south edge |
| Tower ramp | solid wedge `z 7.5..10.5`, rising from `x 53, y 0` to `x 67, y 7` |
| Spawns | player (60, 20); bots (52, 13) (56, 20) (64, 20) (68, 18); all face south |

Standing eye height (1.6) sees through the slit; crouching (1.0) is fully hidden.

### 5.2 Neutral ruin (centre, inside the track loop)

Rotationally symmetric about (60, 80), so neither side gains.

| Part | Box |
| --- | --- |
| West wall | `51..52.5`: `z 73..78.5` h 3.4, `z 78.5..81.5` h 1.2 (sill), `z 81.5..87` h 3.4 |
| East wall | `67.5..69`: same three segments |
| North stub | `z 71..72.5`: `x 54..57` h 3.4, `x 57..61` h 1.8 |
| South stub | `z 87.5..89`: `x 63..66` h 3.4, `x 59..63` h 1.8 |
| Centre platform | `57..63, 77..83, 0..1.2` (jump up) |
| Centre pillar | `59..61, 79..81, 1.2..5` |
| Loose bricks | 14 bricks, each `2.4 x 1.2`, h 1.2, some stacked two high, scattered within `53..67, 73..87` but not on the paths in section 9; instanced |

Openings: north-east (`x 61..67.5` at z 71..72.5) and south-west (`x 52.5..59` at z 87.5..89).

## 6. Floor cover

All of these are colliders. "Mirrored" objects also exist at z' = 160 - z.

| Id | Object | Box / shape | Mirrored |
| --- | --- | --- | --- |
| W-a | alphabet blocks (3 x 3 x 3 each) | `37..40, 28..31` h 3; `37..40, 31..34` h 6; `34..37, 31..34` h 3 | yes |
| W-b | toy car | `33..36, 56..62` h 2.2 (half under the bed edge) | yes |
| W-c | alphabet block | `33..36, 69..72` h 3 (half under the bed edge; fills the 29 unit gap around the spring pad) | yes |
| C-a | jumbo crayons (crouch cover) | `50..59, 30..31.3` h 1.3; `62..71, 31.5..32.8` h 1.3 | yes |
| C-b | toy car | `52..55, 43..49` h 2.2 | yes |
| C-c | dump truck (north only) | bed `63..68, 44..51` h 3.6; cab `63..68, 51..54` h 5 | no |
| C-c' | marble run (south only) | ramp `63..68, 106..113` h 4; tower `63..68, 113..116` h 8 | no |
| C-d | board game box (north only) | `49..59, 56..66` h 2.5 | no |
| C-d' | ball (south only) | sphere centre (54, 4, 99) r 4; collider cylinder r 3.4, h 8 | no |
| C-e | domino row (4 dominoes side by side) | each 1.6 wide (x), `z 63..63.5`, h 3.2, at x 62, 63.9, 65.8, 67.7 | yes |
| C-f | alphabet blocks | `53..56, 67..70` h 6 (north); `64..67, 90..93` h 6 (south, rotated copy) | no |
| E-a | alphabet blocks | `80..83, 30..33` h 6; `83..86, 30..33` h 3; `80..83, 33..36` h 3 | yes |
| E-b | toy car | `110..116, 46..49` h 2.2 | yes |
| E-c | alphabet block (north only) | `79.5..82.5, 44..47` h 3 (Tan's side already has the solid chair stairs here) | no |
| Tunnel | cardboard box over the east straight | walls `72.6..73.6` and `80.4..81.4`, `z 68..92`, `y 0..8`; roof `72.6..81.4, 68..92, 6.5..8` (round 3: lowered so a rider standing on a car roof is scraped off; crouch to ride through) | centred |

Lanes: west (x 0..41, by and under the bed), centre (x 45..75, inside the track loop), east (x 79..120, by the desk legs).

## 7. Train track (track in round 1, train in round 3)

- Oval, centre (60, 80). Straights at x = 43 (west) and x = 77 (east), both `z 52.5..107.5`.
  Semicircles radius 17, centres (60, 52.5) and (60, 107.5). Length 216.8, lap about 54 s at 4 u/s.
- Direction: north along the west straight, east across the north curve, south along the east straight,
  west across the south curve. `s = 0` at (43, 107.5).
- Rails: gauge 3.2, sleepers every 2 units, total height 0.3. Visual only in round 1 (no collider, no bumps).
- Train envelope: 2 units either side of the centre line. Static cover stays out of it.
- The tunnel sits on the middle of the east straight instead of at one end, so it is fair to both sides.
- Round 3 train: engine plus 4 cars, each 12 long, 4 wide, 5 tall, 1.5 gaps. Cars are oriented boxes
  that follow the track tangent. Car types: engine (top 5, cab 6), boxcar (5), flatbed (deck 1.2 with a
  3 x 3 x 3 cargo block), gondola (deck 1.2, side walls to 2.4 with a 3 wide door gap each side), caboose (5).
  Decks at 1.2 are how you board from the floor. Whistle when the engine passes z = 80 on either straight.

## 8. Colliders

Primitives: `box` (axis-aligned), `ramp` (axis-aligned footprint, linear height along x or z, with a
`thickness`; Infinity means solid to the floor), `cyl` (vertical cylinder), `string` (climb line),
`pad` (spring trigger). Every collider has an `id`, a `kind` and a `surface`
(`wood`, `fabric`, `plastic`, `book`, `card`, `metal`) for later footsteps and impacts.

- Player: capsule (radius 0.4, height 1.8) against these primitives, with step-up and slope limit.
- Hitscan (round 2) raycasts the same collider list, never the visual meshes.
- Round 3 adds oriented boxes for the train cars only.
- Round 5 adds the under-desk chicane (`m.desk.chicane.n`, `m.desk.chicane.s`, section 4.2) and moves the paper ball, so
  `colliderHash()` changes from `ff03369f` (rounds 3 and 4) to `e2904076`.
- Round 9 adds the eight zip line posts, `zip.<line>.post.top` and `zip.<line>.post.bottom` (small cylinders, section 21.3),
  so `colliderHash()` changes from `e2904076` to **`cb059ceb`**. This is set by design, not run. A standalone script built the
  collider list from the collider-building code copied out of `index.html`, without loading the game, and computed the hash.
  The same script gives `e2904076` for the round 8 list.
- Falling out of the room must be impossible: if the player leaves the room box or drops below y -5,
  put them back at their last grounded position.

## 9. Waypoint graph

Nodes are `(x, y, z)`. Edge kinds: `walk`, `ramp` (walk on a slope or stairs), `jump`, `climb` (string),
`launch` (spring pad, one way), `cross` (crosses the track; bots check for the train in round 3),
`drop` (one way down), and from round 9 `zip` (one way, a zip line from its top node to its bottom node; section 21.4).

The builder may move a node by up to 2 units to clear geometry, and must list every moved node in CHANGELOG.md.
`__game.validateWaypoints()` sweeps the player capsule along every walk edge and reports blocked ones.

### 9.1 Fort (north; south is mirrored with prefix `s.`)

| Node | Position |
| --- | --- |
| n.f.spawn | (60, 0, 16) |
| n.f.gate | (60, 0, 28) |
| n.f.inw / n.f.wdoor | (50, 0, 17) / (44.5, 0, 17) |
| n.f.ine / n.f.edoor | (70, 0, 17) / (75.5, 0, 17) |
| n.f.rampfoot / n.f.tower | (51.5, 0, 9) / (70.5, 7, 9.5) |

Edges: spawn-gate, spawn-inw, inw-wdoor, spawn-ine, ine-edoor, inw-rampfoot, rampfoot-tower (ramp).

### 9.2 West lane and bed

| Node | Position | Node | Position |
| --- | --- | --- | --- |
| n.w.1 | (42, 0, 24) | s.w.1 | (42, 0, 138) |
| n.w.ramp | (26, 0, 23.5) | s.bs.app | (33, 0, 145) |
| n.w.rampw | (18, 0, 23.5) | s.bs.foot | (26, 0, 144.5) |
| n.ub.n | (18, 0, 46) | s.bs.wfoot | (19, 0, 144.5) |
| n.ub.1 | (18, 0, 50) | s.ub.app | (19, 0, 131) |
| n.ub.2 | (22, 0, 60) | s.ub.n | (19, 0, 114) |
| n.ub.e | (33, 0, 67) | s.ub.1 | (21, 0, 110) |
| n.w.2 | (42.5, 0, 37) | s.ub.2 | (24, 0, 100) |
| n.w.3 | (38.5, 0, 50) | s.ub.e | (33, 0, 93) |
| n.w.x | (39, 0, 54) | s.w.2 | (42.5, 0, 123) |
| n.w.4 | (37.5, 0, 64) | s.w.3 | (38.5, 0, 110) |
| n.w.5 | (38, 0, 75) | s.w.x | (39, 0, 106) |
| m.pad | (38, 0, 80) | s.w.4 | (37.5, 0, 96) |
| m.ub | (28, 0, 80) | s.w.5 | (38, 0, 85) |
| n.bed.end | (26, 18, 47) | s.bed.c | (17.5, 18, 97) |
| n.bed.b | (26, 18, 68) | s.bed.d | (17.5, 18, 113.5) |
| m.bed | (27, 18, 80) | s.bed.end | (26, 18, 113.8) |
| m.bed.e | (31, 18, 80) | s.bed.b | (26, 18, 92) |

Edges (north): f.wdoor-w.1, w.1-w.ramp, w.ramp-w.rampw, w.ramp-bed.end (ramp), w.rampw-ub.n, ub.n-ub.1,
ub.1-ub.2, ub.2-ub.e, ub.2-m.ub, ub.e-m.ub, ub.e-w.4, w.1-w.2, w.2-w.3, w.3-w.x, w.x-w.4, w.4-w.5,
w.5 to m.pad (one way), w.5-ub.e, bed.end-bed.b, bed.b-m.bed, m.bed-m.bed.e, m.pad to m.bed.e (launch).
If W-c blocks an edge here, move n.ub.e, n.w.5 and their south twins by up to 2 units.

Edges (south): f.wdoor-w.1, w.1-bs.app, bs.app-bs.foot, bs.foot-bed.end (ramp), bs.foot-bs.wfoot,
bs.wfoot-ub.app, ub.app-ub.n, ub.n-ub.1, ub.1-ub.2, ub.2-ub.e, ub.2-m.ub, ub.e-m.ub, ub.e-w.4, w.1-w.2,
w.2-w.3, w.3-w.x, w.x-w.4, w.4-w.5, w.5-m.pad, w.5-ub.e, bed.end-bed.d, bed.d-bed.c, bed.c-bed.b,
bed.b-m.bed.

### 9.3 Centre lane and ruin

| Node | Position | Node | Position |
| --- | --- | --- | --- |
| n.c.2 | (60, 0, 41) | s.c.2 | (60, 0, 119) |
| n.c.3 | (59, 0, 52) | s.c.3 | (59, 0, 108) |
| n.c.4 | (60.5, 0, 61) | s.c.4 | (60.5, 0, 99) |
| n.c.5 | (61.5, 0, 68.5) | s.c.5 | (58.5, 0, 91.5) |
| n.c.x | (47.3, 0, 54) | s.c.x | (47.3, 0, 106) |
| n.c.w | (47.5, 0, 68) | s.c.w | (47.5, 0, 92) |
| n.c.y | (72, 0, 59.5) | s.c.y | (72, 0, 100.5) |
| n.c.e | (71, 0, 67) | s.c.e | (71, 0, 93) |
| m.c.w | (48, 0, 80) | m.c.e | (70.8, 0, 80) |
| n.r.ne | (64.5, 0, 70.5) | s.r.sw | (55.5, 0, 89.5) |
| n.r.n | (64.5, 0, 74.8) | s.r.s | (55.5, 0, 85.2) |
| n.r.nw | (54.8, 0, 74.8) | s.r.se | (65.2, 0, 85.2) |
| m.r.w | (54.8, 0, 80) | m.r.e | (65.2, 0, 80) |
| m.plat | (60, 1.2, 78) | | |

Edges (north): f.gate-c.2 (cross), c.2-c.3, c.3-c.4, c.4-c.5, c.5-r.ne, c.3-c.x, c.x-c.w, c.w-m.c.w,
c.4-c.y, c.y-c.e, c.e-m.c.e, w.x-c.x (cross), e.x-c.y (cross).
Edges (south): the mirror, except c.5-r.sw replaces c.5-r.ne.
Ruin: r.ne-r.n, r.n-r.nw, r.nw-m.r.w, m.r.w-r.s, r.n-m.r.e, m.r.e-r.se, r.se-r.s, r.s-r.sw,
m.r.w-m.plat (jump), m.r.e-m.plat (jump), m.c.w-m.r.w (jump over sill), m.c.e-m.r.e (jump over sill).

### 9.4 East lane, chair, desk and shelves

| Node | Position | Node | Position |
| --- | --- | --- | --- |
| n.e.1 | (78, 0, 24) | s.e.1 | (78, 0, 136) |
| n.e.2 | (90, 0, 26) | s.e.2 | (90, 0, 134) |
| n.e.3w | (84, 0, 48.5) | s.e.3w | (84, 0, 111.7) |
| n.e.3 (skate foot) | (89, 0, 48.5) | s.e.3 (stairs foot) | (89, 0, 111.7) |
| n.e.x | (81, 0, 59.5) | s.e.x | (81, 0, 100.5) |
| n.e.6 | (83.2, 0, 66) | s.e.6 | (83.2, 0, 94) |
| m.e.w | (83.2, 0, 80) | m.e | (102.5, 0, 80) (round 5: was (100, 0, 80)) |
| n.e.dn (round 5) | (111, 0, 74) | s.e.ds (round 5) | (101.5, 0, 87) |
| | | m.e.de (round 5) | (110.5, 0, 80) |
| n.e.4 | (100, 0, 48) | s.e.4 | (100, 0, 112) |
| n.e.5 | (100, 0, 66) | s.e.5 | (100, 0, 94) |
| n.seat | (89, 17, 74.5) | s.seat | (89, 17, 85.5) |
| m.seat | (91, 17, 80) | m.tunnel.top | (77, 8, 80) |
| n.rul.foot | (94, 17, 76.5) | s.rul.foot | (94, 17, 83.5) |
| n.rul.top | (94, 26, 64.3) | s.rul.top | (94, 26, 95.7) |
| n.desk.w | (97, 26, 64.3) | s.desk.w | (97, 26, 95.7) |
| n.desk.1 | (104, 26, 66) | s.desk.1 | (104, 26, 94) |
| m.desk | (97.5, 26, 80) | | |
| n.yy.foot | (107, 0, 53.3) | s.sl.foot | (107, 0, 106.7) |
| n.desk.n | (107, 26, 57.5) | s.desk.s | (107, 26, 102.5) |
| n.desk.br | (111.5, 26, 56.5) | s.desk.br | (111.5, 26, 103.5) |
| n.ss.app | (100, 0, 7) | s.ts.app | (100, 0, 153) |
| n.ss.foot | (105.7, 0, 7.5) | s.ts.foot | (105.7, 0, 152.5) |
| n.ss.top | (105.7, 20, 40) | s.ts.top | (105.7, 20, 120) |
| n.ss1.a | (110.5, 20, 40) | s.ts1.a | (110.5, 20, 120) |
| n.ss1.s | (111.5, 20, 42.5) | s.ts1.n | (111.5, 20, 117.5) |
| n.ss1.b / n.ss2.b | (110.5, 20, 30) / (110.5, 40, 30) | s.ts1.b / s.ts2.b | (110.5, 20, 130) / (110.5, 40, 130) |
| n.ss1.c / n.ss2.c | (110.5, 20, 14) / (110.5, 40, 14) | s.ts1.c / s.ts2.c | (110.5, 20, 146) / (110.5, 40, 146) |
| | | s.ts2.d / s.ts3.d | (110.5, 40, 136) / (110.5, 60, 136) |
| | | s.ts2.e / s.ts3.e | (110.5, 40, 152) / (110.5, 60, 152) |

Edges (north): f.edoor-e.1, e.1-e.2, e.2-e.3w, e.3w-e.3, e.3w-e.x, e.x-e.6, e.6-m.e.w, e.2-e.4, e.4-e.5,
e.5-m.e (round 5: replaced by the chicane path n.e.5 - n.e.dn - m.e.de - m.e - s.e.ds - s.e.5), e.2-ss.app, ss.app-ss.foot, ss.foot-ss.top (ramp), ss.top-ss1.a, ss1.a-ss1.s, ss1.a-ss1.b,
ss1.b-ss1.c, ss1.b-ss2.b (climb), ss1.c-ss2.c (climb), ss2.b-ss2.c, e.3-seat (ramp), seat-m.seat,
seat-rul.foot, m.seat-rul.foot, rul.foot-rul.top (ramp), rul.top-desk.w, desk.w-desk.1, desk.w-m.desk,
desk.1-desk.n, desk.n-desk.br, e.4-yy.foot, yy.foot-desk.n (climb), desk.br-ss1.s (ramp),
m.seat to m.tunnel.top (drop).

Edges (south): the mirror, with the chair book stairs in place of the skateboard (e.3-seat is still a ramp
edge), the shoelace in place of the yo-yo, and the tall shelf adding ts1.b-ts2.b, ts1.c-ts2.c,
ts2.d-ts3.d, ts2.e-ts3.e (all climb), ts2.b-ts2.d, ts2.d-ts2.c, ts2.c-ts2.e, ts3.d-ts3.e.

## 10. Named views (for screenshots)

`__game.setView(name)` puts the camera here with no player input.

| Name | Eye position | Looks toward |
| --- | --- | --- |
| spawn_green | (60, 1.6, 20) | (60, 1.6, 80) |
| spawn_tan | (60, 1.6, 140) | (60, 1.6, 80) |
| bed_top | (31, 19.6, 80) | (100, 10, 80) |
| desk_top | (97.5, 27.6, 66) | (20, 8, 80) |
| shelf_top | (110.5, 61.6, 136) | (30, 0, 50) |
| floor_centre | (60, 1.6, 66) | (60, 3, 110) |
| under_bed | (28, 1.6, 80) | (28, 2, 50) |
| east_lane | (83.2, 1.6, 40) | (90, 12, 80) |
| west_lane | (42, 1.6, 24) | (30, 10, 70) |

## 11. Test hook: `window.__game`

Must work headless with no pointer lock and no user gesture.

| Member | Purpose |
| --- | --- |
| `ready` | true once the world is built |
| `start({pointerLock:false})` | leave the title overlay and begin play without pointer lock |
| `state()` | plain object: `phase`, `time`, `player {x,y,z,vx,vy,vz,yaw,pitch,onGround,crouching,climbing,health,surface}`, `fps`, `drawCalls`, `triangles` |
| `teleport(x, y, z, yaw?, pitch?)` | place the player (feet at y) and zero the velocity |
| `look(yaw, pitch)` / `lookAt(x, y, z)` | set the view direction |
| `setInput({forward,back,left,right,jump,sprint,crouch})` / `clearInput()` | virtual keys that stay held until changed |
| `step(seconds)` | advance the simulation synchronously in fixed steps, no rendering needed |
| `render()` | draw one frame now |
| `setView(name)` / `clearView()` | camera to a named view from section 10 |
| `setDebug(bool)` | toggle the debug overlay |
| `colliders` | the collider list (id, kind, surface, bounds) |
| `waypoints` | `{nodes: {id: [x,y,z]}, edges: [{a, b, kind, oneWay}]}` |
| `routes` | `{routeId: [nodeId, ...]}` for every route in section 4.4 |
| `walkPath(nodeIds, {sprint, timeout})` | drive the player along nodes using the normal movement code and virtual input (forward, jump for jump edges, hold forward on strings). Runs synchronously. Returns `{ok, time, reached, stuckAt, pos}` |
| `validateWaypoints()` | capsule sweep of every walk edge; returns the blocked edges |
| `spawnBot()`, `skipRound()`, `setTimeScale(n)` | present from round 1; `setTimeScale` works, the other two return false until round 3 |
| `damageLog` | array of `{amount, cause}` for fall damage in round 1 |

## 12. Later-round numbers (starting points; set when the round begins)

| Weapon | Damage | Fire rate | Mag | Reload | Notes |
| --- | --- | --- | --- | --- | --- |
| Rifle | 26 | 600 rpm auto | 30 | 2.2 s | medium recoil and spread |
| SMG | 25 | 900 rpm auto | 40 | 2.0 s | the close-range winner; wide spread past 25 units |
| Sniper | 90 | bolt, 1.3 s cycle | 5 | 3.0 s | right-click scope, 20 deg fov scoped |
| Pistol | 30 | semi, 0.18 s min | 12 | 1.4 s | accurate |
| Grenade | 140 max, radius 7 | one per round | - | - | 2 s fuse, arc preview |

Headshots x2. Health 100. Match: first to 5, rounds 2:30, 5 s freeze.

## 13. Style guide

### Shading rules

- Stylised low-poly. `flatShading` on faceted toys, smooth only on spheres and cylinders.
- Lambert or toon materials only. No PBR, no environment maps, no normal maps.
- Soldiers are the only glossy thing: Phong with a small tight highlight (plastic sheen).
- One shadow-casting directional light (the sun, warm) plus a hemisphere fill. Shadow map 2048 or less.
- Textures are canvas-drawn and flat: plank lines, weave, stitching, block letters. No photo noise.
- Team colours are reserved. Nothing in the environment uses saturated green or tan/khaki.
- Climb routes carry an accent so they read at a glance: strings are bright yellow, the spring pad has
  red and yellow chevrons, ramps and stairs have a light top edge.

### Palette

| Use | Hex |
| --- | --- |
| Green squad | `#2FA84A` (shadow side `#1F7A36`) |
| Tan squad | `#D9A75A` (shadow side `#A87C3A`); deepened in round 2 because the paler tan vanished into the haze and walls at range |
| Spare soldiers (neutral) | `#B9BEC6` |
| Sun light | `#FFE2B0` |
| Hemisphere fill sky / ground | `#FFF1D6` / `#B08D6A` |
| Haze and fog | `#D6DEE8` (cool, so Tan stays visible through it) |
| Walls | `#BFD3E0` |
| Skirting, door, window frame | `#F2EFE6` |
| Ceiling | `#F5F2EA` |
| Floor planks / gaps | `#7A4E2E` / `#4A2E1A` |
| Bed frame | `#E9E4DA` (painted; the old pine `#C79A5E` was too close to Tan) |
| Blanket / stitching | `#3D5A99` / `#9DB4E8` |
| Sheet and pillows | `#E8EEF5` with `#8FA9D6` stripes |
| Desk and chair | `#8FA3B5` |
| Shelves | `#EFE9DD` |
| Green fort bricks | `#2F6FD0`, `#F0F0F0`, `#8C97A6` |
| Tan fort bricks | `#D43C2E`, `#F0F0F0`, `#8C97A6` |
| Ruin bricks | `#F08A2A`, `#7B4BB5`, `#F0F0F0` |
| Alphabet blocks | `#D43C2E`, `#2F6FD0`, `#F2C230`, `#7B4BB5`, `#F08A2A` with white letters |
| Train | engine `#1F4FA8`, trim `#F2C230`, wheels `#D43C2E`, cars `#D43C2E`, `#F2C230`, `#F08A2A`, `#7B4BB5` |
| Track | rails `#6B7480`, sleepers `#5A3B22` |
| Cardboard | `#8F6B47` with `#6E4F33` edges (darker kraft, kept clear of Tan) |
| Books | `#C0392B`, `#2E6DB4`, `#8E44AD`, `#E67E22`, `#34495E`, pages `#F4EFE2` |
| Strings (routes) | `#FFD21F` |
| Spring pad | `#E0281F` with `#FFD21F` chevrons |
| Rulers / skateboard | `#F2C230` / `#E0281F` deck with `#34495E` wheels |
| HUD text / accent / danger | `#FFFFFF` / `#FFD21F` / `#E0281F` |

### Graybox (round 1) colours

Round 1 uses flat single colours by category, not the final palette: floor and walls as above (the plank
texture is in from round 1 because it sells scale), big furniture in its palette colour, forts in their
main brick colour, all climb routes in orange `#FF8A1F` with strings yellow, cover objects mid grey
`#9AA3AD`, the ruin purple, the track dark grey.

## 14. Scope guard

Anything not in the build prompt goes to LATER.md, not the game.

## 15. Round 2: gunplay spec

Section 12 has damage, fire rate, magazine and reload. These are the rest of the starting numbers; all go in CONFIG.

### 15.1 Weapon handling

| | Rifle | SMG | Sniper | Pistol |
| --- | --- | --- | --- | --- |
| Base spread (deg, standing still) | 0.5 | 1.4 | 3.0 unscoped, 0.05 scoped | 0.35 |
| Spread added per shot / max | 0.35 / 3.0 | 0.30 / 4.5 | - | 0.9 / 3.0 |
| Spread recovery (deg per s) | 7 | 9 | - | 8 |
| Recoil kick up / side (deg per shot) | 0.9 / 0.25 | 0.55 / 0.35 | 3.5 / 0.4 | 1.4 / 0.2 |
| Recoil recovery | view returns 60 % of the kick over 0.25 s | same | same | same |
| Damage falloff | full to 60, down to 70 % at 120 | full to 25, down to 45 % at 70 | none | full to 40, down to 70 % at 90 |
| Draw time | 0.45 s | 0.35 s | 0.7 s | 0.25 s |
| Screen shake per shot | small | small | strong | small |
| Reserve ammo | 90 | 120 | 15 | 36 |

- Spread multipliers: crouched 0.6, moving 1.5, sprinting 2.5, airborne 3.0. Cannot fire while sprinting or on a string.
- Sniper: right mouse holds the scope (fov 25, 0.2 s in, dark vignette with a thin cross). Scoped mouse sensitivity scales with fov. After each shot the bolt cycles for 1.3 s and the scope drops for the first 0.5 s of it.
- Headshots x2. Hitscan against the collider list plus target hit volumes. Bullets stop at the first collider.
- Reload cancels when you switch weapon. Empty magazine auto-reloads on a fire press.
- Keys: 1 primary, 2 pistol, G grenade (hold to aim with arc preview, release to throw), R reload, mouse wheel cycles, left mouse fires, right mouse scopes. Keys 3, 4, 5 pick Rifle, SMG, Sniper as the primary while testing (round 3 replaces this with the round-start pick).
- Grenade: toy firecracker. Throw speed 18 at the view direction plus 10 degrees up, gravity as the player, bounces with 0.45 restitution, 2 s fuse from release, 110 damage at the centre falling linearly to 0 at radius 7, blocked by colliders (line of sight from the burst to the target). One per life; `__game.give('grenade')` restocks for tests.

### 15.2 Juice (required)

- Viewmodel: a simple blocky toy gun per weapon in the lower right, with kick-back and return per shot, a reload dip, and sway while moving.
- Muzzle flash (2 frames), a tracer line that fades in 0.08 s, an ejected shell casing that bounces once (pooled, instanced), slight screen shake.
- Crosshair: four ticks that widen with the current spread. Hit marker X on hit (white), larger and red on a kill.
- Impacts by surface: wood chips (brown), fabric puffs (soft, slow, pale), plastic sparks (bright, fast), book and card (paper flecks), metal (spark). A small decal dot at the impact, pooled, max 64.
- Sound (Web Audio, synthesized, starts on the first user gesture; no errors if audio is unavailable): a distinct shot per weapon (rifle mid crack, SMG light rapid tap, sniper deep boom with a tail, pistol sharp pop), dry click when empty, reload per weapon, bolt cycle, weapon switch, plastic "tick" on hit and a sharper one on a kill, grenade pin, bounce and pop, footsteps by surface, jump and land. Master volume in CONFIG.
- HUD: weapon name, magazine / reserve, grenade count, health.

### 15.3 Target dummies

Static toy-soldier blockouts: body `0.8 x 0.5`, 1.4 tall, head `0.45` cube on top (total 1.8), on a flat base. Tan-coloured
ones on the south half, Green on the north, so team readability can be judged. 100 hp, show damage numbers, go
rigid and tip over when eliminated with a few plastic chips, stand back up after 3 s.

Positions (feet): floor (60, 0, 34) (60, 0, 50) (48, 0, 80) (70.8, 0, 80) (60, 0, 110) (60, 0, 126) (38, 0, 64) (100, 0, 66)
(100, 0, 94) (38, 0, 96); ruin platform (60, 1.2, 78); bed (27, 18, 80) (26, 18, 50); desk (104, 26, 66) (104, 26, 94);
tall shelf L1 (112, 20, 131), L3 (112, 60, 139); small shelf L2 (112, 40, 16); tunnel top (77, 8, 80);
Tan tower (70.5, 7, 150.5); behind the Tan fort slit (66, 0, 137).

### 15.4 Test hook additions

`fire()`, `setInput({fire, scope})`, `selectWeapon(name)`, `reload()`, `throwGrenade(holdSeconds)`, `give(what)`,
`state().weapon {name, mag, reserve, spread, reloading, scoped}`, `state().targets [{id, hp, down, pos}]`,
`raycast(origin, dir)` returning `{id, kind, surface, distance, point}`, `shotLog` (last 200 shots: weapon, hit id,
zone, damage, distance), `audioLog` (last 200 sound events by name, logged even when audio is muted or unavailable),
`resetTargets()`.

### 15.5 Round 1 carry-overs to fix in this build

1. Skirting and door frame trim thinned to 0.3 so the camera cannot enter them.
2. Draw-call and triangle counters include the shadow pass (`renderer.info.autoReset = false`, manual reset per frame).
3. `player.stepSmooth` lowered to 9 to calm the camera on book stairs.
4. Named views: `west_lane` eye (42, 1.6, 24); `desk_top` eye (97.5, 27.6, 66).
5. Jumbo crayons C-a turned north-south so they stop masking the firing slits: `55.7..57, 28..33` and `63..64.3, 28..33`, h 1.3, mirrored (round 3: shortened from z 29..38 so they clear the train's swept path on the curve with a 0.85 gap).
6. Graybox bed top drawn in blanket blue `#3D5A99` (sides stay `#E9E4DA`), pillows keep their pale colour; bed underside darkened.
7. Bear head pulled back to `6..14, 39..45` so the body gives a 4-deep ledge on the way down.
8. Desk apron: panels `95.5..96, 64..75, 17..24.5` and `95.5..96, 85..96, 17..24.5` close the drop under the desk top beside each ruler. They sit outside the ruler footprint (`92.5..95.5`) so every ruler lane still reaches the top.
9. A string cannot be grabbed while falling faster than 12 u/s.
10. `walkPath` refuses to drive a one-way edge backward.

### 15.6 Round 2 tuning after the first test pass (these override 15.1 and 15.2 where they differ)

| Key | Was | Now | Why |
| --- | --- | --- | --- |
| smg.damage | 16 | 20 | SMG killed slower than the rifle at every range |
| smg base spread / per shot / max | 1.4 / 0.30 / 4.5 | 1.0 / 0.20 / 3.5 | |
| smg moving spread multiplier | 1.5 (global) | 1.15 (per weapon) | the SMG is the run-and-gun weapon; other guns keep 1.5 |
| gun.recoilReturn | 0.6 | 0.8 | taps drifted 0.36 deg each and never came back |
| pistol base spread / per shot | 0.35 / 0.9 | 0.6 / 0.6 | fast clicking hit full bloom by shot 4 |
| pistol.recoverDelay | 0.25 s | 0.12 s | |
| pistol falloff | full to 40, 70 % at 90 | full to 30, 50 % at 70 | paced pistol out-ranged the rifle |
| sniper.scopeFov | 25 | 20 | far targets were 10 x 22 px |
| sniper scoped spread | 0.05 always | 0.05 still or crouched; 1.5 moving; 4.0 airborne | no running or jumping scoped shots |
| grenade.damage | 110 | 140 | could not eliminate a full-health target |
| grenade throw | view pitch | view pitch + 10 deg up (as 15.1 already said) | was not implemented |
| audio gains | | SMG shot layers 0.55 to 0.9 and 0.3 to 0.5; sniper 1.0 to 0.8 and 0.9 to 0.7; fabric, book and card footsteps to about 0.75 | SMG was 10 dB under the rifle; sniper could clip |

Rules added:
- The sniper bolt timer belongs to the weapon and keeps running while another weapon is out. Switching never shortens it.
- A grenade is created at the eye and swept to its release point; if anything is in the way it starts at the contact
  point. It can never start inside a collider or outside the room, and a grenade that leaves the room box is removed.
- Holding fire through an empty magazine on an automatic gives one dry click and then starts the reload without a new press.
- R pressed during a weapon draw is buffered, like fire.
- Grenade burst reads at its true size: a flash sphere expanding to the 7 unit radius over 0.15 s, a ring of
  particles to that radius, a brief light flash, and screen shake scaled by distance. The held grenade in the
  viewmodel never fills the screen. The arc preview is a dotted line of small spheres or a ribbon at least 3 px wide.
- Impact effects contrast with their own surface: wood chips pale `#E8C89A`, fabric puffs white, each at least dE 25
  from the surface it comes from.
- Muzzle flash is parented to the muzzle after kick and lasts a set 0.05 s, not a number of frames.
- Damage numbers rise from above the target and are offset so they never cover the crosshair or each other.
- HUD text (weapon name, ammo) has a dark outline so it reads on pale walls.
- SMG and pistol viewmodels must differ at a glance (the SMG gets a stock and a long magazine).

### 15.7 Round 2, pass 2 (overrides 15.6 where they differ)

| Key | Was | Now | Why |
| --- | --- | --- | --- |
| smg.damage | 20 | 25 | the close-range lead over the rifle was 33 ms, too small to feel; 25 gives 0.20 s against 0.30 s and still loses from 30 units |
| fog near / far | 10 / 220 | 20 / 320 | Tan was unreadable at 150 units; measured to fix it with the far wall still paler than the near |
| SMG shot gains | 0.9 / 0.5 | 1.3 / 0.75 | still 4 to 5 dB under the rifle |
| sniper shot gains | 0.8 / 0.7 | 0.6 / 0.55 | sniper plus kill tone peaked at 0.97 of full scale |
| grenade.hideNear | 1.3 | 2.5 | the thrown grenade popped in at 17 % of screen height |
| grenade flashOpacity | 0.55 | 0.4 | the dome hid everything inside it |

Rules added:
- Tracers start at the current weapon's muzzle (after kick), not a shared point. The sniper tracer is thicker and
  longer lived (width 0.07, life 0.2 s); no tracer is drawn through the scope view closer than 3 units.
- Effect shaders are compiled at load (`renderer.compile` with the burst sphere, arc, muzzle flash, tracer and
  particles briefly visible), so the first shot, first grenade aim and first burst do not hitch.
- Desk skirt: panel `96..96.5, 73..87, 17..24.5` closes the chair seat's east edge under the desk, so sliding along
  an apron can stop you but never drop you.

## 16. Round 3: match spec

Round 3 is built in two halves. **3A**: the train, soldier models, and bot movement (navigation, climbing, train riding,
safe crossing, stuck handling) with no combat. **3B**: bot combat, match rules, weapon pick, HUD, menus, spectating.
Gate: the bug tester completes a full match start to finish on each difficulty with no blocker bugs and no stuck bots.

### 16.1 Train (3A)

Section 7 holds the track, consist and car types. Additions:

- Moves at a constant 4 u/s along the oval forever, also during freeze time and between rounds; never stops or reverses.
  `s` (distance along the track) is deterministic from match time so the timing is learnable.
- Each car is an oriented box collider (plus its cab, cargo block or gondola walls) following the track tangent, with
  front and rear on the centre line. The swept envelope is therefore wider on the curves: radius 13.5 to 19.5 around
  each curve centre, and 2 either side of the straights. No static collider may sit in it.
  `__game.trainClearance()` returns any static collider that does.
- Bullets stop at train colliders. Grenades bounce off them and pick up the car's velocity.
- Standing on a car (roof, deck, cargo block) carries you: position follows the car, and the yaw turns with it on the curves.
  Jumping off keeps the train's velocity. Decks at 1.2 are boarded with a jump from the floor.
- Push, never kill: a soldier overlapping a car is pushed out along the car's sideways axis, toward the side they are on.
  If that is blocked by static geometry, they are pushed ahead of the car along the track until a sideways exit opens.
  If both stay blocked for 0.3 s, place them at the nearest free spot outside the envelope and log it in `trainRescueLog`
  (a tester counts every entry as a bug). No damage from the train, ever.
- Tunnel: the roof underside is 6.5. A soldier standing on a 5-high car roof (head 6.8) hits the roof's front edge and
  is scraped back off the car into the gap between cars, then pushed aside into the tunnel's side clearance (1.4 each side).
  Crouched roof riders, and anyone on a deck, ride through.
- Audio: a low rumble with distance attenuation and a slight doppler, wheel clacks timed to each car's wheels passing rail
  joints every 6 units, and a whistle each time the engine passes z = 80 on either straight (twice a lap).

### 16.2 Soldiers (3A)

- Same blockout as the target dummies (body, head, flat base) plus a blocky gun in hand, in team colour
  (Green `#2FA84A`, Tan `#D9A75A`). Instanced: one InstancedMesh per part shared by all ten soldiers, so ten soldiers
  cost a handful of draw calls including shadows.
- Hit volumes: head and body, as the dummies. Bullets and grenades use them, never the visual mesh.
- Simple animation: walk bob, crouch lowers the body, aim pitch tilts the gun, climbing poses flat against the string.
- Death: goes rigid and tips over as one piece with a few plastic chips (reuse the dummy tip-over). Bodies stay for the
  round and do not block movement or bullets.
- A small team-colour chevron floats above living teammates only, within 60 units and only with line of sight.
- The 21 target dummies are removed from play. They stay reachable through `__game.range(true)` for testing only.

### 16.3 Bot movement (3A)

- Bots drive the same movement controller as the player through virtual input (the code `walkPath` already uses).
  They never teleport except through the logged rescue below.
- Pathing: A* over the waypoint graph. Edge cost = length, x1.5 for `climb`, x1.2 for `ramp`, +4 for `jump`.
  `cross` edges cost +2 and are only started when no car will reach the crossing point within 3 s (or until the
  train has passed). `launch` and `drop` edges are one way.
- `ride` edges (new, one way, in the train's direction of travel):

| Edge | Wait at | Board | Ride until | Step off to |
| --- | --- | --- | --- | --- |
| ride.w (west straight, northbound) | (46.5, 0, 104) | a flatbed or gondola deck whose centre is within 2 of z 104 | the deck centre passes z 58 | (46.5, 0, 56), then node n.c.x |
| ride.e (east straight, southbound) | (73.5, 0, 56) | a deck centre within 2 of z 56 | the deck centre passes z 98 | (74.0, 0, 100), then node s.c.y |

  Wait nodes are added to the graph as `w.ride.w` and `w.ride.e`, linked by walk edges to s.c.x and n.c.y respectively.
  The edge cost includes the expected wait for the next deck car. A bot leaves the wait node if the wait would exceed 8 s.
  ride.w carries Tan toward Green and ride.e carries Green toward Tan, so the train is fair to both sides.
- Strings: a bot walks into the string, holds forward to the top (or back to descend), and steps off at the exit.
- Never on the track: a bot inside the envelope that is not riding or mid-crossing leaves it by the shortest way at once.
  Bots never choose a node inside the envelope as a place to stop.
- Stuck handling: if a bot makes less than 0.5 units of progress toward its next node in 1.5 s, it jumps; after 2.5 s it
  strafes left or right for 0.5 s; after 3.5 s it repaths from its nearest reachable node; after 6 s it is placed at its
  last reached node and logged in `stuckLog` with position, node and edge. Every `stuckLog` entry is a bug for the tester.
- Nav test mode (3A only, kept for testing): `__game.startNavTest({bots: 10, seed})` spawns bots that endlessly walk
  between random nodes chosen so that every edge kind, every route in 4.4, both ride edges and every cross edge get used.
  `__game.navStats()` returns per-edge use counts, rides completed, crossings, stuck and rescue counts, and time spent
  inside the envelope while not riding or crossing.

### 16.4 Bot combat and team play (3B)

Squads: Green is the player plus 4 bots; Tan is 5 bots. Names "Green 1" to "Green 4" and "Tan 1" to "Tan 5"; the player is "You".

Roles, assigned at each round start from a seeded random shuffle, mirrored per team:

| Role | Route | Hold at (Green / Tan) | Primary |
| --- | --- | --- | --- |
| West | west lane floor | n.w.5 / s.w.5 | rifle or SMG |
| Bed | blanket slope or book stairs onto the bed | n.bed.b / s.bed.b | sniper or rifle |
| Centre | centre lane, ruin, may use the ride edge | n.r.n / s.r.s | SMG or rifle |
| High east | desk (skate, stairs or string) or own shelf | n.desk.1, or n.ss2.b / s.desk.1, or s.ts3.d | sniper |
| East | east lane floor | n.e.6 / s.e.6 | rifle or SMG |

The player takes no role; Green's four bots take four of the five roles (Centre is always filled).

Round flow for bots: go to the hold node by the role route (setup), hold and watch the lane until 40 s into the round or
until their team leads in soldiers alive, then push into the enemy half in the same lane, then toward the enemy fort.
In the last 30 s all living bots hunt toward the last known enemy position.

States: `advance`, `hold`, `engage`, `cover`, `flank`, `retreat`, `hunt`, plus movement sub-states `climb` and `ride`.
- Perception: a 110 degree view cone, range per difficulty, line of sight raycast to the target's head and body against
  colliders and the train, checked at 10 Hz per bot (staggered). A gunshot within 40 units reveals the shooter's position.
  Being hit reveals the attacker's direction.
- Engage: after the reaction time, aim and fire in bursts with the aim error below, using the real weapon code
  (fire rate, magazine, reload, spread). Snipers scope and stand still to fire.
- Cover: when engaged and the target is not in the open, or after taking damage, move to a node within 12 units with
  no line of sight from the threat at crouch eye height (1.0). Crouch there and peek (stand, fire a burst, crouch).
  Precompute, per node, which of 8 directions have cover within 3 units at 1.2 high.
- Flank: when a target holds cover for over 6 s, a bot other than the closest one routes through an adjacent lane.
- Retreat: below the retreat health, break contact toward cover and the nearest teammate.
- Grenades: thrown at a known enemy behind cover at 10 to 25 units when the arc solves, with the per-difficulty chance.
- Friendly fire is off: teammates stop bullets but take no damage. Grenades never hurt teammates (self-damage stays on).

Difficulty presets (all in CONFIG):

| | Recruit | Regular | Veteran |
| --- | --- | --- | --- |
| Reaction time to first shot | 0.70 s | 0.45 s | 0.28 s |
| Aim error at acquire / settled (deg) | 5.0 / 2.0 | 3.2 / 1.1 | 2.0 / 0.55 |
| Time to settle | 1.6 s | 1.1 s | 0.7 s |
| Head aim chance | 0 % | 10 % | 25 % |
| Burst length (automatics) | 3 to 4 | 4 to 6 | 5 to 8 |
| Pause between bursts | 0.55 s | 0.35 s | 0.22 s |
| Vision range | 90 | 120 | 140 |
| Strafe while engaging | never | half the time | always |
| Grenade chance when suitable | 10 % | 30 % | 50 % |
| Retreat below health | 25 | 35 | 40 |
| Grenade dodge chance (round 5) | 30 % | 60 % | 90 % |
| Grenade reaction delay (round 5) | 0.6 s | 0.45 s | 0.3 s |

Aim error is multiplied by (1 + target speed / 7) and by 1.5 while the bot itself moves.

Callouts: Green bots post short text pings in the HUD, at most one per bot per 6 s (round 5; was 4 s) and three on screen, from a region table:
"Enemy on the bed", "Enemy under the bed", "Enemy on the desk", "Enemy on the chair", "Enemy on the tall shelf",
"Enemy on the small shelf", "Enemy on the train", "Enemy at the ruin", "Enemy at their fort", "Enemy west lane",
"Enemy centre", "Enemy east lane", plus "I'm hit", "I'm down", "Last one" ("Enemy down" is dropped in round 5). Regions are boxes in CONFIG.

### 16.5 Match rules (3B)

- Five rounds to win. Rounds last 2:30. Sides never swap.
- Each round: everyone is placed at their fort spawns (section 5.1 and mirror), health 100, one grenade, magazines full.
- Freeze time 5 s: nobody can move or fire; the player picks a primary (rifle, SMG, sniper) with keys 1 to 3 or a click.
  The last pick is remembered; the default is rifle. The pistol is always carried. Keys 3 to 5 no longer pick weapons.
- No respawn during a round. A round ends when one squad has nobody standing, or at 0:00 when the side with more
  soldiers standing wins. Equal at 0:00 is a replay that does not count. After three replays in a row the side with
  more total health remaining wins.
- After the player dies, the camera tips with the body for 1.5 s, then spectates a living Green bot from its eye.
  Left click cycles. If no Green is alive the round is over.
- Round-end screen 4 s (winner, how, score), then the next freeze. Match-end screen: winner, final score, a table of kills
  and deaths per soldier. Enter starts a rematch at once at the same difficulty; Esc returns to the title.

### 16.6 HUD and menus (3B)

- HUD: round timer and score top centre ("GREEN 2 - 1 TAN") with five pips per side showing who is alive; kill feed top
  right (killer, weapon, victim, in team colours, headshot mark, last five, 5 s each); callouts left; damage direction
  as red arcs around the crosshair pointing at the attacker for 1 s; health bottom left; weapon, ammo and grenade bottom
  right; freeze-time weapon picker centre with a countdown; "Spectating Green 3" banner bottom centre.
- Title screen: "Bedroom Battalion", Play, difficulty (Recruit, Regular, Veteran), controls list, settings.
- Pause on Esc (releases the mouse and stops the simulation): Resume, mouse sensitivity (0.2 to 3.0), master volume
  (0 to 100), Quit to title. Settings and difficulty persist in localStorage (wrapped in try/catch; the game works without it).
- Fix BUGS R1 finding 4: Esc then a click within about 30 ms must never leave the game paused with the pointer locked.
  The pause state follows the actual pointer-lock state.
- Round start and round end stingers, a short win and lose jingle at match end.

### 16.7 Test hook additions

3A: `state().train {s, speed, cars:[{type, pos, yaw}]}`, `trainClearance()`, `trainRescueLog`, `state().bots
[{id, name, team, pos, hp, state, node, nextNode, edge, path, riding, climbing, weapon, stuckTime}]`,
`spawnBot(team, nodeId)` returning an id, `startNavTest({bots, seed})`, `navStats()`, `stuckLog`, `range(on)`, `seed(n)`.

3B: `startMatch({difficulty, seed, autoplay})` (autoplay makes the player a Green bot with a role, so a match plays itself),
`state().match {phase: 'title'|'freeze'|'live'|'roundEnd'|'matchEnd', round, score {green, tan}, timeLeft,
alive {green, tan}, difficulty}`, `runMatch({difficulty, seed, maxSimSeconds})` (synchronous, steps the simulation without
rendering until the match ends and returns `{winner, score, rounds:[{winner, reason, duration, kills}], stuckLog,
trainRescueLog, laneUse, highGroundTime, errors}`), `skipRound(winner)`, `killBot(id)`, `setGodMode(bool)`,
`botLog` (state changes), `killFeed`, `callouts`.
`laneUse` reports, per team, the seconds bots spent in each of the west, centre and east lanes and on the bed, desk and
shelves. All bot randomness comes from the seeded generator so a seed reproduces a match.

### 16.8 Round 2 carry-overs to fix in 3A

1. No tracer while scoped.
2. Pistol shot: add a low body under the high crack so it is not mostly hiss. Jump sound gain 0.15 to 0.5.
3. A simple hand with a grenade drawn while aiming a grenade.
4. Crayons C-a shortened (section 15.5 item 5).
5. Tunnel roof underside 6.5 (section 6).

### 16.9 Performance

Ten soldiers and the train must stay inside the budget: target under 40 draw calls including shadows during a full
firefight. Bot logic must cost little: line-of-sight raycasts throttled and staggered, paths cached, no per-tick allocation.
`runMatch` on a full match must finish in a few minutes headless.

### 16.10 Lead decisions after 3A (override 16.1 to 16.4 where they differ)

1. Crayons end at z 33.0 (and 127.0 mirrored), as the builder chose: 33.5 left a 0.35 gap to the swept path and caused rescues.
2. The tunnel top gets two one-way `drop` edges to m.c.e and m.e.w (8 units, within safe fall height), as the builder added.
3. Riding is a tactic, not a shortcut: at the given speeds it is never faster than walking. In 3B a Centre-role bot takes its
   team's ride edge (ride.e for Green, ride.w for Tan) in about 35 % of rounds when the expected wait is under 6 s, as moving
   cover into the enemy half. Other bots ride only as a flank when the route cost including the wait is within 15 % of walking.
4. Crossing window: a bot starts a `cross` edge when no car will reach the crossing point within 1.5 s (was 3 s), which is the
   time to cross the 4-unit envelope plus margin. A* adds the expected wait at a closed crossing to the edge cost, so a bot
   that would wait long picks another lane.
5. Soldiers get soft separation: soldiers (including the player) push apart gently when closer than 0.9, never through walls,
   so bots do not stack on one node. Bodies of eliminated soldiers do not collide.
6. Bots crouch in cover and while scoped as snipers (16.4 already says so); the crouch pose must be visible.

### 16.11 Round 3 fix pass (overrides 16.1 to 16.10 where they differ)

Bot liveness (a living bot must always be doing something):
- A bot may stand still only while: in `hold` before push time; in `cover` for at most `ai.retreatCalm` (5 s) without a
  visible target; in `engage` while it has fired, scoped, reloaded or re-aimed at a visible target within the last 2 s;
  waiting at a ride or crossing for at most 6 s (round 5; was 8 s: then another route, or a relocate if there is none); or during freeze time. Anything else stationary for more than 5 s is logged
  in a new `idleLog` (bot, state, position, seconds) and the bot is forced back to `advance` or `hunt`. Every `idleLog`
  entry is a bug for the tester, like `stuckLog`.
- `engage` without line of sight from the bot's current eye for `ai.lostAfter` (3 s) moves to the last known position
  (or the nearest peek spot that sees it). Snipers stand to fire and crouch only between shots.
- `hunt` searches: it visits enemy-half nodes it has not seen recently, covering every lane and every high place, never
  stopping at an enemy spawn. A bot reaching its hunt target with nothing found picks the next unvisited node at once.

Awareness and pacing:
- `ai.holdUntil` 20 s (was 40). `ai.huntLast` 60 s (was 30).
- In every state, being hit or a shot passing within 3 units turns the bot toward the source and starts `engage` (or
  `cover` if below retreat health). A gunshot within 40 units turns bots that have no target.
- A bot within 8 units of a live grenade it can see sprints away from it, out of its radius if possible. Round 5: the grenade
  must be in its view cone (or within 2 units), and the dodge is a per-difficulty chance after a reaction delay (16.4 table).
- Engage ranges per weapon: bots do not open fire beyond SMG 40, pistol 50, rifle 90, sniper unlimited. Beyond that they close in or hold.

Difficulty: Recruit preset becomes reaction 1.0 s, aim error 7.0 / 3.0 deg, settle 2.0 s, burst 2 to 3, pause 0.9 s.
Regular and Veteran stay as in 16.4.

Map: east lane cover box (toy box, cardboard colour) `81.4..85, 78.5..81.5`, h 2.5. Node m.e.w (83.2, 0, 80) is removed and the
lane re-routes under the chair seat through three new nodes, m.e.cn (84, 0, 75), m.e.u (89, 0, 80), m.e.cs (84, 0, 85),
linked n.e.6 - m.e.cn - m.e.u - m.e.cs - s.e.6 and m.e.cn - m.e.cs is not linked (the box sits between them). The builder
may move these by up to 2 units to clear the chair legs, and must keep `validateWaypoints()` clean.

Train: `ai.rideChance` 0.6, `ai.rideMaxWait` 8 s. The whistle has two pitches: higher when the engine passes z 80 on the
west straight, lower on the east straight, so it tells you where the train is.

Rules: a tie on total health after three replays goes to the side that dealt more damage that round; if that is also equal,
the round is awarded to neither and the next round starts as a normal round (the replay counter resets).
Death camera lasts 1.5 s. Every callout, including "I'm down", obeys one per bot per 6 s (round 5; was 4 s).
Callouts: "I'm hit" once per life, and not within 4 s of any other callout (round 5); lane callouts say "our side" or "their side"; the same region is not called twice within
8 s; at most 2 on screen.

Round 5 AI numbers (`CONFIG.ai`):
- `coverMin` 3 s and `coverPeeks` 2: a bot that reaches cover stays at least 3 s and peeks twice before it may leave.
- `engageQuiet` 6 s: a bot with a visible target that has not fired for 6 s (no clear shot) relocates, except while holding
  before push time.
- `highQuiet` 10 s, `highQuietRange` 80: the High role holds fire at targets beyond 80 units for the first 10 s of a round.
- `rideSetupWait` 8 s: the Centre bot boards straight from the spawn in setup when a deck is due within 8 s of arriving at
  the wait node; otherwise it rides at push time as before.

Determinism: `startMatch`, `runMatch`, rematch and Quit-then-Play reset the match clock, the train position, all bot state
and the random generator, so the same seed gives the same match every time in one page.

Looks: bodies tint 50 % toward grey `#8C8C8C` as they tip over; a body's gun rotates with it and loses the aim pitch;
spectating hides the watched bot's own model and shows the normal first-person viewmodel for its weapon; the climbing pose
puts the soldier flat against the string with arms up; z-fighting on the engine rear trim and gondola door posts fixed by
offsetting faces 0.03 outward; train wheel centres at y 0.68 with narrower bogies so the red wheels show; the grenade burst
geometry is uploaded at load like the effect shaders.

## 17. Round 4: art pass

The user lifted the 400 KB file-size goal (2026-11-23). There is no file-size limit. Everything is still made in code:
geometry from primitives, extrusions and merged buffers; textures drawn on canvas; sound from Web Audio. No embedded image
files or base64 assets, no web fonts, no other libraries.

Round 4 is built in two halves. **4A**: the world (room shell, furniture, every toy and cover piece, routes, forts, ruin,
tunnel, track), surface detail, lighting, sunbeam, dust and fake ambient occlusion. **4B**: soldiers, guns and viewmodels,
the train, death and impact effects, HUD and menus, and the remaining audio.
Gate: the visual tester signs off on style consistency and the build holds the performance budget in 17.9.

### 17.1 Rules that do not change

- **Colliders, waypoints and hit volumes do not change.** Art replaces visual meshes only. Every visual sits within 0.15
  of its collider's outline on the walkable and shootable faces, so what you see is what you stand on, hide behind and
  hit. Decorative parts that stick out further (a lamp shade, pencils, a teddy's ear, a car mirror) must be above head
  height or have no gameplay meaning, and are listed in the changelog. `__game.colliderHash()` returns a hash of the
  collider list so testers can prove it is unchanged from round 3.
- Readability (pillar 5) beats decoration: Green and Tan stay the only saturated green and tan things; cover reads as
  solid; climb routes keep a clear accent (yellow strings, orange-capped route parts, red and yellow spring pad).
- Graybox colours from section 13 are replaced by the full palette in section 13.

### 17.2 Art direction

- Stylised low-poly toys in warm afternoon light: chunky proportions, rounded or bevelled edges on every toy (small bevel,
  about 3 % of the size), bright flat paint, no realism, no photo textures, no PBR or environment maps.
- Materials: Lambert or toon (`MeshToonMaterial` with a 3-step gradient) for the world and toys; Phong with a tight
  highlight only for soldiers and glossy plastic toys. Pick one shading model per material family and use it everywhere.
- Surface detail is drawn on canvas at the room's scale: wood grain and plank gaps on the floor, paint and wood grain on
  furniture, fabric weave and big stitching on the blanket and sheet, printed letters on blocks, ruler markings, book
  spines with coloured bands (no readable titles), domino pips, a notebook's ruled lines, crayon wrappers.
- Everything is generic and original. No logos, no real brands, no characters. The trophy, board game box, books and
  globe carry only abstract shapes.

### 17.3 Room shell and furniture (4A)

- Floor: planks 3.2 wide with varied tones, grain and dark gaps; a few knots. Skirting with a moulded top edge. Walls
  painted with a faint vertical texture. Door with raised panels, frame and a round knob. Window with frame, sill, glass
  and a painted outside view (soft sky gradient, a tree and garden shapes) that glows warm. The ceiling light as a round
  shade with a cord, far overhead.
- Bed: wooden frame and legs, mattress with rounded edges, a sheet, the rumpled blanket with weave and stitching
  following the ridges, the hanging blanket corner as a draped fabric slope, two soft pillows (rounded, plump; they must
  not hide the head of the south book stairs from the bed top), and the under-bed space visibly dark and dusty with grey
  fluffy dust bunnies, a striped lost sock and the shoebox.
- Desk and chair: painted wood with grain, rounded corners. Lamp with base, arm, shade and a warm glowing bulb (emissive,
  no extra shadow light; at most one cheap non-shadow point light if it clearly helps). Pencil cup with pencils, stacked
  books, open notebook with ruled lines, mug with a handle, eraser and paper ball under the desk.
- Shelves: painted boards and posts; books upright and flat with coloured spines; globe on a stand with abstract
  continents; a plain trophy cup; a round pink piggy bank; plant pot with leaves; alarm clock with a face.
- Stuffed bear: soft rounded body, head with ears and button eyes, stitched seams; generic.
- Tipped bucket with a handle, spare soldiers as neutral grey statues using the same model as 17.5.

### 17.4 Toys, forts, routes and cover (4A)

- Bricks: stud bricks with real studs (instanced low-poly studs), colour per the palette, slight colour variation, firing
  slits and crenellations; the ruin with loose and stacked bricks.
- Alphabet blocks: bevelled cubes with a printed letter on each face (canvas letter atlas) in contrasting colours.
- Toy cars and dump truck: body, cabin, windows, round wheels, simple bumpers; generic shapes. Crayons: wrapped
  cylinders with a cone tip. Dominoes: pips. Marble run: tower and ramps with a few marbles. Ball: two-tone panels.
  Board game box: lid with an abstract pattern. Toy box (east lane): a painted wooden crate.
- Routes: book stairs as stacked books in varied colours with the orange route cap on each step edge; rulers with
  markings; skateboard with deck, trucks and wheels; yo-yo with two discs and its bright yellow string; shoelace braided
  with aglets; the spring pad as a jack-in-the-box spring with a padded top and red and yellow chevrons; the blanket slope
  as part of the blanket.
- Tunnel: corrugated cardboard box with flaps, cut openings and darker edges. Track: rails on sleepers, joined sections.

### 17.5 Soldiers, guns and train (4B)

- Soldiers: a proper plastic army man shape (helmet, head, torso with belt and straps, legs, arms holding the gun),
  single-colour moulded plastic (Green `#2FA84A`, Tan `#D9A75A`) with a slight sheen and a visible mould seam line.
  A flat base under the feet when standing still; while moving the base is hidden and the soldier moves with a small
  toy-like hop. Poses: standing aim, kneeling crouch, climbing (flat against the string), sniper scoped. Same hit volumes.
- Death: goes rigid and tips over as one piece with a few plastic chips, tinting toward grey (`soldier.bodyTint` 0.7).
- Guns: toy-styled world models and first-person viewmodels per weapon, with moulded plastic hands in the player's team
  colour; the grenade is a toy firecracker with a fuse. Viewmodels stay clear and distinct at a glance.
- Train: chunky toy engine with boiler, chimney, cab, buffers and red wheels with visible rods; cars with the palette
  colours; couplings; the caboose with a small cupola. Same colliders.

### 17.6 Light and atmosphere (4A)

- One warm sun through the window with shadows that fall across a large part of the floor (fit the shadow camera to the
  room; the round 1 sun reached only about 4 % of the floor). Hemisphere fill as now. Tone mapping and colour output set
  once and kept consistent.
- A visible sunbeam from the window to the floor (an additive soft-edged volume, not a second light) with dust motes
  drifting in it (one Points object, a few hundred motes, brighter inside the beam).
- Fake ambient occlusion: soft dark contact patches under furniture legs, toys and forts, darker corners, and a clearly
  darker space under the bed and the desk.
- Keep fog near 20 / far 320 and the cool haze colour unless the visual tester measures a need to change it; the window
  view and the sunbeam carry the warmth.

### 17.7 Effects, HUD and menus (4B)

- Impact decals vary by surface (a splinter mark on wood, a dent on plastic, a scuff on fabric) and never look like
  black tiles at point-blank range. Plastic chips on death in the soldier's colour.
- HUD and menus restyled in one consistent toy look using CSS only (rounded panels, chunky system-font type, brick and
  crayon accents), scaled to the window size rather than fixed pixels. The title screen shows the 3D room behind it
  with the camera slowly drifting. Pause, round-end and match-end screens match.

### 17.8 Audio (4B)

- A room reverb send (a convolver with a synthesized impulse) on big sounds: train rumble, grenade, sniper, round stingers.
- A deep, slow occasional creak of the room or the bed, and a soft room tone, to sell the giant space.
- Plastic clatter when a soldier tips over, and impact sounds per surface (wood knock, fabric thump, plastic tick,
  book slap, card thud).
- UI clicks for menus.

### 17.9 Performance budget

The user removed the file-size limit; the runtime budget stays. Target: 60 fps on a mid-range laptop with integrated
graphics at 1080p.

| Item | Limit |
| --- | --- |
| Draw calls in the worst view, full firefight, shadow pass included | under 200 (aim for under 120) |
| Triangles in the worst view, main pass | under 350,000 |
| Shadow-casting lights / shadow map | 1 / 2048 or less |
| Texture size / total canvas texture memory (estimated, with mipmaps) | 2048 max / under 64 MB |
| Shader programs after a full match | under 40, all compiled at load |
| Render cost in software rendering, same named views and firefight as round 3 | at most 3x round 3 |
| Per-frame allocation and growth over three matches | none |

Use merged static geometry, InstancedMesh for repeats (studs, bricks, books, blocks, dominoes, pencils, dust), and shared
materials. Load time must stay short: report the time from page load to `__game.ready` against round 3.

### 17.10 Carry-overs

From round 1 and 2: sun shadows reaching most of the floor; under the bed darker; the ceiling light visible against the
ceiling; cover colour distinct from the desk colour; the window warm again; the bed book-stairs head not hidden by pillow
P2; decals not like tiles. From round 3: `soldier.bodyTint` 0.7; refresh the two stale code section banners.

### 17.11 Lead decisions after 4A (2026-11-23)
- Ball, globe and pillow colliders stay as they are (colliders are frozen this round). These three are accepted exceptions to the 0.15 visual-fit rule. Possible collider reshape → LATER.md, round 5 at the earliest.
- bed_top render cost is 2.70x of the 3x limit. 4B art must leave room there: soldiers instanced or merged per team, small effects pooled. If the worst view goes over 3x, the builder cuts a 4A detail before a 4B one.
- 4A weak spots (flat ceiling, soft fort bricks, faint dust, hot shelf board, cushion-like pillows) wait for the visual tester's 4A notes and are fixed together with the 4B list.

### 17.12 Lead decisions after 4B (2026-11-23)
- The train engine runs cab-forward. Its colliders are frozen and the engine reads as a toy, so this is accepted.
- No aim-down-sights for rifle, SMG or pistol. This holds the round 2 design (only the sniper scopes); viewmodels stay at hip.
- Yellow letter blocks (`#F2C230`) are the closest room colour to Tan. In the fix pass, recolour them away from Tan, keeping red/blue/green primaries and no yellow or orange. No cover or floor surface may be within dE 25 of Tan `#D9A75A`.
- There is no carpet in the room, so "carpet" in the impact list means fabric (the blanket and the rug, if any).

### 17.13 Lead decisions after the Round 4 test pass (2026-11-23)
- The Tan-distance rule (17.12) applies to colours as rendered in sun and in shade, not only to palette values. Yellow and orange leave all cover, toys and lane props. Orange stays only as the narrow route-accent strips.
- Soldiers get a thin dark team-shade outline (visual only; hit volumes frozen).
- Held guns and arms are decoration and are exempt from the 0.15 fit rule, as they were in round 3. The body, head, legs and base are not exempt.
- Dead soldiers tint toward cool grey `#7E8288`.
- Sound is stereo-panned; enemy footsteps are audible within 25 units.
- Heap: the bug tester measured the JS heap flat at about 9 MB, while the visual tester saw about 150 MB of process memory. Both are flat. The visual tester reports process memory in the re-check.

## 18. Round 6: animated-film polish (user request, 2026-11-24)

User request: guns look more real; the environment looks more real, like an animated feature film (Pixar was named
as the style reference); more posters and kids' decor; a moving ceiling fan; a more real outside; "etc".
User instruction: no tests and no tester passes. The user plays it after the build. The only check allowed is a static
syntax parse of the module script (no running the game).

Style reference only. Copy nothing from any film or brand: no characters, logos, named toys, signature props, or
iconic wallpapers. In particular, no blue-sky cloud wallpaper and no cowboy or space-ranger toys. All poster
content is invented.

### 18.1 Rules that still hold
- Gameplay frozen at commit 86e1a0c: collider hash `e2904076`, the current waypoint and hit-volume hashes, and every
  CONFIG gameplay section. All new decor is either out of reach (walls above reachable heights, the ceiling, outside
  the window) or flat (no more than 0.1 proud of the surface it sits on). Add no new colliders.
- Readability (17.12 and 17.13) beats looks. Soldier outline stays. No surface that soldiers are seen against within
  dE 25 of Tan `#D9A75A` or Green as rendered, sun or shade. Post effects (bloom, AO, grade) must not wash out or
  darken soldiers. Clipping to white stays under 2 % in every named view.
- One shadow-casting light. Everything procedural; the only external code is three@0.170.0 from jsDelivr
  (`build/` plus `examples/jsm/` addons through an import map).
- No file-size limit.

### 18.2 Rendering: the animated-film look
- **Materials:** physically based throughout (MeshStandard or MeshPhysical), replacing the 17.2 toon and Lambert look.
  - Plastic toys: glossy, roughness 0.25 to 0.4, clearcoat on hero toys.
  - Wood: satin, with grain in the normal and roughness maps.
  - Fabric: sheen (quilt, curtains, pillows, rug).
  - Paper: matte.
  - Painted walls: eggshell.
  - Metal: blued or brushed.
- **Maps:** procedural normal and roughness maps from canvas height maps, in an atlas like 4A's.
- **Soft wear:** rounded edges, soft wear on corners, slightly saturated colours, nothing pure black or pure white.
- **Environment light:** a PMREM environment built from a small scene with the room's own colours, giving soft ambient
  and reflections. Add a hemisphere fill and a warm bounce fill from the sunlit floor (no shadow).
- **Sun and lamps:** the sun stays the one shadow light, with soft PCF or VSM shadows. The fan light kit is a soft
  emissive glow, with an unshadowed point light if it is cheap.
- **Post:** an EffectComposer chain.
  - Outside pass (18.5), then room pass.
  - GTAO on High.
  - Bloom with a high threshold, so only the window, sun, bulbs and muzzle flash glow.
  - A grade and vignette pass: warm highlights, soft lifted shadows, gentle vignette.
  - AgX or ACES tone mapping.
  - SMAA on High, FXAA on Medium.
  - Title screen only: shallow depth of field.
- **Quality presets** (pause and options menu):
  - **Low:** no post, half-resolution shadow map, no normal maps.
  - **Medium:** bloom, grade and FXAA.
  - **High:** adds GTAO and SMAA.
  - **Auto (default):** dynamic resolution from 0.6 to 1.0 of the window, steered by frame time, to hold 60 fps.
- **Shader compile:** every material is compiled during loading (compileAsync), behind a loading bar. No new programs
  mid-match.

### 18.3 Guns: more real
- **Real proportions and detail** (generic, unnamed designs). Gameplay numbers are unchanged.
  - **Rifle:** a semi-auto battle rifle with a wood stock and handguard, a steel receiver, and a front sight post.
  - **SMG:** compact, stick magazine, folding wire stock.
  - **Sniper:** bolt action, wood stock, scope with lens glint.
  - **Pistol:** steel semi-auto with a moving slide.
  - **Grenade:** a frag grenade with a spoon and a ring pin. It replaces the firecracker.
- **Materials:** blued steel (metalness about 0.9, roughness 0.35, darker in recesses, worn bright edges), wood with
  grain, polymer grips with stipple normal.
- **Animation:**
  - The bolt or slide cycles on every shot.
  - Shell casings eject: brass, pooled, bounce and roll, with a tink per surface.
  - Reload swaps the magazine: the mag drops out and a new one goes in. The sniper reloads by working its bolt.
  - Iron sights line up at hip on the rifle and pistol.
  - Muzzle flash: a star-shaped flash sprite, a brief light, a smoke puff.
- **Soldier models:** the guns on soldiers use the same design as a low-detail merged version.
- **Hands:** they stay green moulded plastic, because the player is a plastic soldier.
- **Screen coverage:** the viewmodel covers no more than about 8 % of the screen.

### 18.4 Room and decor
- **Walls:**
  - Painted with a soft brushed normal.
  - A wallpaper border band at about y 60: an invented pattern of rockets and stars, not clouds.
  - A light switch, outlets with a plug-in nightlight, and a heating vent.
- **Posters**, all invented, each a 1024 canvas, paper with a slight curl, taped or pinned. A loose corner flutters
  in the fan breeze. Put them on walls above reachable surfaces where a lane looks at them, and keep their colours
  under the 18.1 rule:
  1. A retro rocket over a ringed planet, "BLAST OFF!".
  2. A dinosaur chart, "Dinosaurs of Long Ago", with generic silhouettes.
  3. The solar system in a row.
  4. An alphabet chart, A to Z, with simple icons.
  5. A stylised world map.
  6. Two crayon drawings, taped crooked: one of a family, a house and the sun; one of a green and tan army-men battle.
  7. A felt pennant for an invented team, "Maple Street Rockets".
  8. A door sign: "KEEP OUT - BATTALION HQ", hand-lettered.
  9. A height chart on the door frame, with pencil marks, a name and ages.
  10. A cork board with pinned drawings, a "1st" ribbon, polaroids of abstract scenes, and a school timetable.
- **Ceiling:**
  - Glow-in-the-dark stars and a moon (pale yellow-green, a faint glow).
  - A hanging planet mobile and a model plane on fishing line, both turning slowly in the fan breeze.
- **Lights and bunting:** warm fairy lights along the top of one wall (bulbs bloom), and paper bunting across a corner.
- **Window:**
  - Curtains with tie-backs that sway gently.
  - A potted plant and a jar of marbles on the sill. The sill may hold visuals only above the soldiers' reach; if
    a soldier can reach it, those props stay flat.
  - Glass with a faint reflection and a little dirt at the edges.
- **Rug:** a soft play rug in cool blues and greys. It must not be green or tan. Flat, 0.08 tall, visual only. The
  footstep sound may change on the rug by a visual-region lookup, not a collider surface.

### 18.5 Outside the window
- **Rendering:** the outside is a separate scene with its own camera, using the same position and rotation, near 1 and
  far 30000. It is drawn first; the room pass then clears only depth. It is seen only through the window, so cull and
  scissor to the window's screen rectangle when you can.
- **Scale:** 1 room unit is about 3 cm, so the yard is at real scale.
- **Sky:**
  - Gradient sky dome with soft drifting clouds (an fbm shader).
  - A sun disk and glow placed along the room's sun direction.
  - Birds that fly across sometimes.
- **Yard:**
  - A lawn with mowing stripes and colour variation.
  - A wooden picket fence.
  - 4 to 6 lush trees with puffy clustered foliage, swaying in the wind (vertex shader).
  - Bushes and flowers.
  - A swing set that sways slightly.
  - A neighbour's house with a roof, windows and a chimney.
  - Distant rolling hills and a tree line with aerial haze. Room fog does not apply.
- **Light:** the outside is brighter than the room, and the window blooms softly.

### 18.6 Ceiling fan
- **Placement:** it replaces the ceiling light at `(60, 90 → about 80, 80)`. A downrod, a motor housing, 5 wood blades
  with about 20 units of reach, and a frosted bowl light kit. Two pull chains swing with the wobble.
- **Motion:** turns at about 1.5 revolutions per second, with a very slight wobble. A faint translucent motion disc
  sits at blade height.
- **Shadow:** the fan casts in the sun shadow, so blade shadows sweep where the sun puts them, but only if those
  shadows don't fall on a lane at play height. If they would, the fan doesn't cast.
- **Breeze:** curtains, poster corners, bunting, the mobile, the plane and the dust motes all move with the breeze.
- **Height:** the blades must sit above every reachable surface plus jump height. This is visual only.

### 18.7 Audio (part of "etc")
- **Fan:** a quiet hum with a slow tick.
- **Outside:** birdsong and leaf rustle through the window, panned to the window and louder near it.
- **Weapons:** casing tinks per surface, magazine-swap clicks, bolt and slide sounds.
- **Room:** new sounds stay under the 17.13 rule. A rifle at 30 units stays louder than any ambient sound.

### 18.8 Performance
There is no measuring this round (18 intro), so design for it:
- Merge or instance all decor into the 4A spatial chunks.
- Keep posters in one atlas.
- Pool everything.
- No per-frame allocation.
- Draw-call target under 300 on High.
- Textures under 192 MB.
- Every program compiled at load.

### 18.9 Round 6 build notes (where the build differs from, or fills in, 18.1 to 18.8)
- **Auto preset:** Medium's chain (bloom, grade, FXAA) at a drawing-buffer scale of 0.6 to 1.0. The scale steps down by 0.05
  below 55 fps and steps back up after 3 s above 59 fps.
- **Post order:** the viewmodel is drawn after GTAO, so room AO never darkens the gun.
  - Transparent volumes and hulls are hidden from GTAO's and the depth of field's depth passes: the sunbeam, contact
    shadows, decals, tracers, the soldier outlines and chevrons, the glass, the marble jar and the fan disc.
- **Tone mapping:** ACES, `CONFIG.render.exposure` 0.72, unmeasured. AgX is one setting away (`CONFIG.render.toneMapping`).
- **Fan shadow:** the fan does not cast. The walls do not cast either (17.6), so the sun lights the whole floor and the
  blade shadows would land on lanes at play height.
- **Soldier guns:** unchanged from round 4B. The new gun designs are on the viewmodels only.
- **Sheen:** fabric sheen is on the room fabrics (quilt, pillows, sheet, socks, plush). The curtains and rug use the
  decor material, without it.
- **Outside greens:** blue-greens (`CONFIG.outside.leaf`), kept at least dE 25 from Green and its dark shade as palette
  values.


## 19. Round 7: phones and tablets (user request, 2026-11-26)

User request: "make this game work really well with phone". Touch is input only: gameplay, bots and colliders are
unchanged (collider hash `e2904076`). No tests run, as in round 6 (the user plays it); a static parse is the only check.

### 19.1 Detection and page
- **Touch UI:** shown when the primary pointer is coarse or the first input is a touch. It hides on the first mouse
  move or key press, and comes back on the next touch. Mouse and keyboard keep working exactly as before.
- **Landscape only:** in portrait, show a "Turn your phone sideways" card and pause the game.
- **Fullscreen:** Play requests fullscreen, plus `screen.orientation.lock('landscape')` where supported (Android).
  - On iOS, add the home-screen web-app meta tags.
  - Show a one-time hint: "Add to Home Screen for full screen".
- **Viewport and gestures:**
  - Viewport meta: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
  - Size with `100dvh`.
  - Set `touch-action: none` and `user-select: none` on the game, and `overscroll-behavior: none`.
  - Block the context menu, iOS `gesturestart`, double-tap zoom and long-press callouts.
  - Pad the HUD and controls by `env(safe-area-inset-*)`.
- **No pointer lock on touch.** Pause and resume use the on-screen pause button.
- **Lifecycle:**
  - Pause on `visibilitychange` (hidden) and `pagehide`.
  - Resume the AudioContext on the first touch.
  - Handle `webglcontextlost` and `webglcontextrestored`: pause, rebuild GPU resources, and resume without a
    reload.

### 19.2 Touch controls (right-handed default; "Left-handed" swaps sides)
- **Move:** a floating stick on the left half. It appears where the thumb lands, radius about 60 CSS px, with a 12 %
  dead zone and analogue walk. Pushing past 90 % of the radius sprints, shown by the stick ring turning orange.
  Pushing forward on a climbable climbs, as W does.
- **Look:** drag anywhere on the right half that is not a button.
  - Touch sensitivity slider, with a mild acceleration curve.
  - Scoped sensitivity is 0.4x.
  - A drag that starts on FIRE also looks while firing.
- **Buttons** (at least 56 CSS px, in a thumb arc on the right, semi-transparent, with a pressed state):
  - FIRE (largest);
  - JUMP;
  - CROUCH (toggle);
  - RELOAD;
  - GRENADE;
  - SCOPE (shown only with the sniper).
- **Weapon switch:** tap a weapon icon in the HUD bar.
- **Pause and scores:** pause button top-left, inside the safe area. Tap the score to see the scoreboard.
- **Aim assist** (touch and gamepad only, default on, toggle in options):
  - Look speed slows to 0.5x while the crosshair is within about 3 degrees of a visible enemy.
  - No snap and no pull. Bots are unaffected.
- **Auto-fire** (off by default, accessibility option): fires while the crosshair is on a visible enemy.
- **Haptics** (`navigator.vibrate`, toggle): short pulses on a hit given, on damage taken, and a double pulse on a kill.
- **Options:** touch sensitivity, aim assist, auto-fire, haptics, left-handed, button size (S, M, L), button opacity,
  and frame cap (60, or 30 as battery saver). Saved with the other settings.

### 19.3 Menus and HUD on small screens
- **Tap targets:** every control is at least 48 CSS px.
- **Weapon pick:** the freeze-time pick becomes a row of large tap cards.
- **HUD layout:** the HUD is laid out so that none of it sits under the thumbs or the controls.
- **Text:** at least 12 CSS px, and nothing overlaps at a 640x360 CSS viewport.
- **Title screen:** a large PLAY button. The difficulty and graphics rows are tap-sized.

### 19.4 Phone performance
- **Mobile preset:** graphics Auto picks it on touch or mobile devices. It can also be chosen by hand.
  - Pixel ratio min(devicePixelRatio, 1.5), times a dynamic scale from 0.5 to 1.0.
  - Post: FXAA only. No GTAO, no SMAA, and no bloom, or bloom at half resolution if cheap.
  - 1024 shadow map, and no normal maps.
  - Atlases downscaled to 1024, and the poster atlas to 2048.
  - Half the dust motes. The outside drops to 3 trees and half the flowers.
  - The fan lamp is emissive only, with no point light.
  - Casing pool 12, decal pool 32.
- **Targets:** 60 fps on a mid-range 2022 phone, with the 30 fps cap as a fallback. Texture memory under 96 MB, so
  iOS Safari does not kill the tab.
- **Shader compile:** the Mobile preset's programs are compiled at load like the others.

### 19.5 Gamepad (cheap, and it helps phones and tablets with a controller)
- **API:** the Gamepad API, standard mapping.
- **Mapping:**
  - Left stick: move; click it to sprint.
  - Right stick: look.
  - RT: fire.
  - LT: scope.
  - A: jump.
  - B: crouch.
  - X: reload.
  - RB: grenade.
  - Y or D-pad: switch weapon.
  - Start: pause.
- **Look and menus:** aim assist as for touch. The D-pad and A navigate the menus.
- **Hot-plug:** a controller can be connected or disconnected at any time.

### 19.6 Round 7 build notes (deviations and choices; numbers in `CONFIG.touch` and `CONFIG.pad`)
- **Analogue walk:**
  - A stick sets the digital flags (for strings and the sprint rule) and an analogue direction and magnitude.
  - The player's walk speed scales with the magnitude. Sprint, past 90 %, is full speed.
  - The keyboard and bots never set the analogue fields.
- **Scoped look:** 0.4x replaces the fov ratio only in a scope (`scopeFov`). Otherwise touch and controller look use the
  fov ratio, as the mouse does.
- **Auto-fire:**
  - It is a touch option only; the controller has its triggers.
  - Splash weapons hold fire by a generic `splash` check, ready for 20.2.
- **Frame cap:** "60" leaves the display's own rate; "30" caps.
- **Pausing:**
  - Hidden-page pause applies to touch and controller play.
  - Mouse play already pauses when the page loses the pointer lock.
- **Mobile preset:**
  - Smaller textures, fewer trees and fewer flowers are decided at load. Choosing MOBILE by hand later changes the passes,
    shadow map, normal maps, dust, pools and fan light, but texture sizes only after a reload.
  - Bloom and the grade pass are off ("FXAA only").
- **Controller:**
  - B toggles crouch, matching the touch CROUCH button.
  - Back opens a mid-match scoreboard, which is new: touch opens it by tapping the top bar, and there is no keyboard
    binding.
  - Sliders are not reachable from the controller.
- **Room for round 8:**
  - The `scope` input is the single ADS action.
  - The SCOPE button and the double tap check `scopeFov || adsFov`.
  - Picker cards flex for more primaries.
  - The touch HUD keeps the top centre for a mode-specific bar.

### 19.7 User changes to round 7 (2026-11-26, override 19.2)
- **Auto-fire is ON by default on touch.** The user likes it: the gun fires while the crosshair is on a visible enemy.
  - It stays an option in the settings.
  - Grenades never auto-fire.
  - The bazooka (20.2) does not auto-fire at a target within 1.5x its splash radius.
- **Double-tap aims down sights.** A double tap on the look area (two taps within 300 ms, each under 200 ms and moving
  under 10 px) toggles ADS. A single tap while in ADS exits it. Drags never count as taps.
  - In round 7 this drives the existing sniper scope.
  - Round 8 (20.1) gives every gun ADS, and the same control works for all of them.
  - The on-screen SCOPE button stays as an alternative.

## 20. Round 8: ADS for every gun, new weapons, capture the flag (user request, 2026-11-26)

User request: tap twice to aim down sights, tap again to exit; add a bazooka and a rubber band gun; add capture the
flag with each team's flag in its base. The flag carrier must stand out *much* more, so everyone goes after them.

This round is a gameplay change. The colliders stay frozen (hash `e2904076`): flags, stands and pickup zones are
visual plus distance checks, not colliders. The elimination mode plays exactly as before, apart from ADS and the two
new primaries. No tests, as in rounds 6 and 7.

### 20.1 Aim down sights on every gun
- **Controls:** right mouse (hold), touch double-tap toggle (19.7), gamepad LT. The sniper keeps its scope (scopeFov 20).
- **Effect:** ADS lerps the camera fov and brings the viewmodel's sights to the centre. Look sensitivity already scales
  with fov.
- **Kick:** recoil kick is 0.7x while in ADS. ADS breaks on sprint, reload, climb and grenade, as the scope does now.

| Gun | ADS fov | Spread x | Move speed x | Time in (s) |
| --- | --- | --- | --- | --- |
| Rifle | 50 | 0.35 | 0.65 | 0.18 |
| SMG | 58 | 0.6 | 0.8 | 0.14 |
| Pistol | 60 | 0.5 | 0.85 | 0.12 |
| Bazooka | 50 | 0.15 | 0.6 | 0.25 |
| Band gun | 58 | 0.5 | 0.8 | 0.15 |
| Sniper | 20 (scope, unchanged) | as now | as now | as now |

Bots don't use ADS. Their aim model is unchanged.

### 20.2 New primaries (realistic look per 18.3; picked at freeze like the others)
- **Bazooka:**
  - **Look:** a shoulder-fired steel tube with a sight, grips and a rocket.
  - **Rocket:**
    - Speed 80 u/s, no gravity, 4 s life.
    - Direct hit 150 damage.
    - Splash radius 8: 110 at the centre, falling linearly to 15 at the edge. Line of sight from the blast centre is
      required, as for the grenade.
    - Self-damage 0.5x.
  - **Firing:**
    - Mag 1, reserve 4, reload 2.6 s, draw 0.8 s.
    - Spread: 1.5 degrees hip, 0.2 degrees ADS.
    - Kick up 4.
    - Move speed 0.85x while it is equipped.
  - **Effects:** smoke trail, back-blast puff, a big burst with a scorch decal, and shake in a 45 radius.
- **Rubber band gun (label BAND GUN):**
  - **Look:** a real wooden ratchet band gun: a wooden frame, a clothes-peg trigger, and a band wheel that turns.
  - **Firing:**
    - Semi-auto, interval 0.3 s.
    - Mag 10, reserve 40, reload 1.6 s (bands loaded onto the wheel).
    - Spread 0.4 degrees.
  - **Band:**
    - A projectile: speed 160 u/s, gravity 30 u/s².
    - Damage 34; headMult applies.
    - Bounces once off any surface, at 0.7x damage after the bounce.
  - **Quiet:** its shot alerts bots within 25 units only.
  - **Leftovers:** spent bands lie where they land (pool 24, fade after 20 s).
  - **Sound:** a twang and a snap.
- **Bots:**
  - Bazooka: the anchor or defender role picks it 1 time in 5. Bots aim at the feet and lead the target, and never fire
    with the target within 10, or with a teammate within the splash radius of the predicted impact.
  - Band gun: the flank role picks it 1 time in 4, leading the target.
  - Difficulty aim error applies as for the other guns.

### 20.3 Capture the flag
- **Mode select:** a MODE row on the title card offers ELIMINATION or CAPTURE THE FLAG, saved with the settings.
  Difficulty applies to both modes.
- **Flags:**
  - Green's stand is at `(55, 0, 11)`, inside the Green fort near the back wall. Tan's mirror is at `(55, 0, 149)`.
  - Each stand has a flat base plate (at most 0.1 proud), a pole about 6 tall, and a waving cloth in the team colour.
  - Pickup and capture use a 1.5 radius distance check on the soldier's position.
- **Scoring:**
  - **Win:** first to 3 captures, or the most captures after 10:00. A tie goes to sudden-death overtime of up to 3:00,
    where the next capture wins. If still tied, the match is a draw.
  - **Capture:** you capture by carrying the enemy flag to your own stand while your own flag is at home.
- **Respawn:**
  - 5 s after death, at your team's spawn point farthest from any visible enemy.
  - 2 s of spawn protection, which firing ends.
  - The weapon pick shows during the wait and defaults to the last pick.
  - The match starts with the usual 5 s freeze.
- **Dropped flag:**
  - When the carrier dies, the flag drops where they died and settles onto the surface below.
  - An enemy of the flag picks it up by touching it; the owner team returns it home by touching it.
  - It returns home on its own after 20 s.
  - It returns at once if it lands more than 6 from any waypoint, or on the train.

### 20.4 The flag carrier stands out MUCH more
- **On the body:**
  - A big flag on a pole on their back, about twice soldier height, waving.
  - A pulsing, emissive outline in the flag's colour, twice the normal outline width, that blooms.
- **Beam:** a light beam in the flag's colour, from the carrier up to the ceiling, additive and seen from anywhere in
  the room.
- **Through walls:**
  - A flag icon with the distance, over the carrier, shown on every screen at all times.
  - An arrow at the screen edge when the carrier is off-screen.
  - A faint see-through silhouette (depth test off).
- **Speed:** the carrier moves at 0.9x speed and can still sprint and shoot.
- **Sound:**
  - A looping flag flap near the carrier, heard within 30.
  - Stings with banners and callouts: "Flag taken!", "Flag dropped", "Flag returned", "Flag captured!".
- **Bots:**
  - Every bot always knows where both carriers are.
  - For enemy bots, a visible carrier is the top target, and their engage ranges are 1.5x against the carrier.
  - Three of the five enemy bots switch to hunting the carrier, pathing to cut them off on the way to their stand.
  - Two friendly bots escort the carrier within 8.

### 20.5 CTF bots
- **Roles per team:**
  - 2 attackers, who take the flag by different lanes;
  - 1 midfield, at the ruin or centre;
  - 1 defender, at its own stand;
  - 1 high or sniper, on overwatch.
- **Own flag taken:** the defender, the midfield and one attacker chase the carrier, as in 20.4.
- **Own flag dropped:** the nearest bot goes to return it.
- **Bot carrying the flag:** it paths home by its route. If its own flag is not home, it holds at its stand while the
  others recover the flag.
- **Liveness:** the 16.11 rule applies. Respawned bots pick their role again.

### 20.6 CTF HUD
- **Top bar:** captures for Green and Tan, a flag status icon for each team (home, taken, or dropped with its
  countdown), and the match timer.
- **Markers:** both flags, or their carriers, always have an on-screen marker with the distance.
- **Banners and timers:** "YOU HAVE THE FLAG - RETURN TO BASE", with an arrow to your own stand, and a respawn
  countdown.
- **Layout:** it all fits the phone layout (19.3).

### 20.7 Round 8 build notes (deviations and choices; numbers in `CONFIG.weapons`, `CONFIG.ai` and `CONFIG.ctf`)
- **ADS:**
  - Sprint now also breaks the sniper scope, so every gun follows one rule.
  - Draw breaks ADS too, as it did the scope.
  - The bazooka uses the table's 0.15x spread in ADS (1.5 to 0.225 degrees). The text's "0.2 degrees" is the same
    thing, rounded.
- **Elimination roles for the new guns.** "Anchor or defender" is the Centre role (bazooka, 1 in 5); "flank" is the
  West and East roles (band gun, 1 in 4).
- **Rocket:**
  - A direct hit gives 150 to the soldier hit, who takes no splash on top.
  - At the end of its 4 s life, or on leaving the room, it is gone without a burst.
- **Bands:**
  - A band that hits a soldier drops below the hit point.
  - Leftovers settle onto the surface below and are never left on the train.
- **Spawn protection** ends on firing or on throwing a grenade. Falls still hurt.
- **Respawn points.** The team's elimination spawn points (the player's and the bots'). The one whose nearest enemy
  with a line of sight to it is farthest wins, with a small random tie-break.
- **"Every bot always knows where both carriers are."** This drives movement: chasers and escorts path to the
  carrier's true position. Shooting the carrier still needs line of sight, through the normal perception.
- **Bot carriers don't stop to fight.** They skip engage, retreat and turning to a hit, and only run. Bots face where
  they walk, so they can't shoot while running. A human carrier can sprint and shoot as written.
- **Cut-off.** A chaser farther than 18 from the carrier paths to the point halfway between the carrier and the
  carrier's stand. Closer than that, it paths straight at the carrier.
- **Escorts.** Exactly the two nearest teammates escort. An attacker that is not escorting holds midfield while its
  team has the flag, rather than walking to the empty stand.
- **Guards** (defender, midfield, high, and a carrier waiting at its stand) patrol between the nodes of their post,
  with 1.2 to 2.6 s look rounds, rather than standing still. This keeps the 16.11 liveness rule.
- **Replans and the last metres:**
  - Periodic replans keep a path already heading to the same node, so a bot does not turn back to a node behind it.
  - The last metres to a flag or stand are walked straight, for up to 4 s. A spot the bot fails to reach is skipped
    for 5 s, and the bot patrols in the meantime.
- **Respawned bots** take the first role their team is missing, and re-roll the special primary.
- **HUD:**
  - Flag status shows as text chips (HOME, TAKEN, DROPPED with its countdown), not icons.
  - Distances read in "m", one room unit to the metre.
  - The marker for the flag on your own back is hidden; the banner says it.
  - Markers also show during the freeze.
- **First person.** The carried flag and the beam are hidden in the carrier's own first-person view, since the camera
  is inside the beam. Everyone else sees both.
- **Draw.** The match-end card reads DRAW, with the losing jingle.
- **Stands.** The base plate has a radius of 1.6, about the pickup zone. Green's overlaps the low end of the fort ramp,
  0.5 from the stand (visual only); Tan's mirrors it.
- **Soldier guns.** The third-person models of the bazooka and band gun are low detail. The viewmodels are the
  detailed ones.
- **Controls.** The touch SCOPE button now reads AIM. On a controller, Y cycles the pick while waiting to respawn.

## 21. Round 9: zip lines (user request, 2026-11-27)

User request: zip lines from tall areas that take you down into the centre. This changes the map and the waypoints,
so the collider hash changes. Record the new hash in section 8. As before, nothing runs (the user tests). The builder
may check the lines' clearance by hand, or with a standalone script over the collider numbers, without running the
game.

### 21.1 The four lines (one-way, top to bottom)
Points are where the rider's feet start and land. The line itself runs 2.4 above the feet. The builder may move an
end by up to 8 units to clear the furniture, but each pair must stay mirrored.

| Line | From (top) | To (landing) | Notes |
| --- | --- | --- | --- |
| zip.bed | bed top `(31, 18, 79)` | ruin centre platform `(57.5, 1.2, 79)` | neutral; passes the ruin's west sill gap |
| zip.desk | desk top `(96, 26, 81)` | ruin centre platform `(62.5, 1.2, 81)` | neutral; must clear the chair back |
| zip.green | small shelf L2 `(110, 40, 40)` | floor `(64, 0, 69)` | Green's corner |
| zip.tan | tall shelf L2 `(110, 40, 120)` | floor `(64, 0, 91)` | Tan's corner, mirroring zip.green. Not from L3, which would give Tan more height |

**Clearance:** a hanging rider (the body box hung below the line) clears every collider by at least 0.3 along the
whole ride. Where a line crosses the track, the rider's feet must be at least 1 above the train's highest part. Fix a
clash by moving the end.

### 21.2 Riding
- **Grab:** stand within 2 of a line's top anchor and press JUMP. Space, the touch JUMP button and controller A all
  work; while in range, the touch JUMP button shows a zip icon. The HUD shows "JUMP to zip".
- **Ride:** the soldier hangs from a handle below the line.
  - Speed starts at 8 u/s and grows by g·sin(slope), capped at 28 u/s. Rides last about 2 to 3 s.
  - You can look anywhere and fire your current gun at the air spread. ADS is off during the ride; reload is
    allowed.
- **Let go:** press JUMP again to let go early, keeping your momentum and falling normally. Fall damage is the same as
  any other fall.
- **Finish:** at the bottom you let go on your own, with a little forward momentum, and land.
- **Taking fire:**
  - The rider's hit volume is the normal body box, hung below the line.
  - A rider can be shot and killed; the body falls.
  - A grenade or bazooka blast that hits a rider knocks them off.
- **Riders:** any number can share a line; riders do not collide with each other.
- **CTF:** a flag carrier can ride, keeping the glow and beam.

### 21.3 Look and sound
- **The line:** a taut white-and-orange striped cord, clearly different from the yellow climbing strings, with a
  small sag drawn in.
- **Top anchor:** a pencil post taped to the furniture, with a plastic spool-and-bottle-cap trolley hanging ready.
- **Bottom anchor:** a pencil in a lump of modelling clay. The posts get small cylinder colliders and the clay is
  flat.
- **Route accents:** an orange route cap at each top so the start can be read from across the room, and the
  trolley reads at 60 units.
- **Sound:**
  - a clack on grab;
  - a whirr whose pitch rises with speed;
  - a clack when letting go.
  
  Other soldiers hear it from the rider's position.

### 21.4 Bots
- **Waypoint edges:** a new edge kind `zip`, one-way from top node to bottom node. Its cost is the ride time. Add top
  and bottom nodes next to the existing graph and link them with walk edges. validateWaypoints must still pass,
  but by design, not by running it.
- **When bots ride:**
  - Bots grab with the same virtual JUMP input as the player.
  - Bots on the bed, desk or shelves use a line when it is on their best path. They do so with a chance of 0.7 per
    plan, so not everyone rides.
- **Riding:** bots shoot a visible target while riding, with air aim error.
- **CTF:** attackers and carriers may route by zip.
- **Liveness:** the 16.11 rule holds; a bot never waits at a zip top.

### 21.5 Round 9 build notes (deviations and choices; numbers in `CONFIG.zip`)
- **Ends moved** (all within 8; the shelf pair is still mirrored in z, and the two ruin landings in the point mirror):

  | Line | From | To | Why |
  | --- | --- | --- | --- |
  | zip.bed | `(35.7, 18, 79)` (was x 31) | `(57.85, 1.2, 79)` (was x 57.5) | The start was 4 inside the bed edge, so the descending body cut through the bed's edge. It now starts 0.7 past the edge, and a grab snaps the rider there in 0.12 s. The landing moved so the body is 0.3 above the platform's edge on touchdown. |
  | zip.desk | `(94.3, 26, 81)` (was x 96) | `(62.15, 1.2, 81)` (was x 62.5) | As for the bed. The line still passes under the chair back, through the gap above the seat. |
  | zip.green | `(107.3, 40, 40)` (was x 110) | `(66.5, 0, 61.5)` (was `(64, 0, 69)`, a move of 7.9) | The start had the same edge problem as the bed. The old landing put the bottom post on the n.c.5 to n.r.ne walk edge. |
  | zip.tan | `(107.3, 40, 120)` | `(66.5, 0, 98.5)` | The mirror of zip.green. The old landing `(64, 0, 91)` was inside `s.C-f.block` (64..67, 90..93), which is not mirrored on the Green side. |
- **Clearance** (a standalone node script over the collider list copied out of `index.html`, sampling the ride every 0.02
  units; body box 0.8 x 1.8 x 0.8 hung from the line, sag included). The landing surface is skipped only while the body is
  wholly over its top.
  - zip.bed: closest 0.300, to the bed slab at the start and to its own bottom post at the end.
    - Ruin west wall north part 1.04, west sill 2.83, platform edge 0.32, pillar 0.75.
    - Over the track, the feet are 3.87 above the train's top.
  - zip.desk: closest 0.300, to the desk top at the start.
    - Chair back 0.34, chair seat 0.93, tunnel roof 0.49, ruin east wall 1.14, platform edge 0.33, pillar 0.75.
    - Over the track, the feet are 4.05 above the train.
  - zip.green and zip.tan: closest 0.300, to their own shelf's L2 board at the start.
    - Desk top and desk legs 7.00, ruler bridges 14.41, ruler ramps 14.39, skateboard 9.17, tunnel 8.05.
    - Over the track, the feet are 1.21 above the train's top. This is the tightest margin against the 1 required.
- **Line height and sag.** The ride follows the drawn sag (0.4 at the middle) so the trolley stays on the cord. The cord
  goes on straight to each post.
- **Posts:**
  - The top pencil stands 1.05 behind the start in plan; the bottom one stands 1.05 beyond the landing, or 0.85 for the two
    ruin lines, so it clears the pillar.
  - Both are `cyl` colliders of radius 0.15. The clay is visual only.
  - The orange route cap is the top pencil's big eraser.
  - A player launched from the north strip of the spring pad (z 78.5 to 79.55) can graze the zip.bed top pencil at
    `(34.65, 79)` on the way over the bed edge. Bots launch from the pad's centre (z 80), 1.0 from the pencil.
- **Ride times** (from `v0` 8, growing by g sin(slope) with g 22, capped at 28; the 0.12 s grab snap included):
  - zip.bed 1.65 s, which is under the "2 to 3 s" of 21.2 because the line is short;
  - zip.desk 2.10 s;
  - the shelf lines 2.80 s.
- **Grab:**
  - Within 2 (in 3D) of the start, standing on the ground, with no grab cooldown.
  - JUMP then grabs instead of jumping.
  - After letting go, a line can't be grabbed for 0.6 s.
- **Letting go:**
  - **Early:** JUMP, a blast, death, or anything in the body's way (a `volumeFree` test every tick). The rider keeps the
    line's velocity and falls, with normal fall damage from the height where they let go.
  - **At the end:** the rider is put on the landing with a push of 2.5 along the line.
- **Blast knock-off.** There was no blast knock-off to reuse. It is new, in `damageSoldier`: any blast damage to a rider
  lets go. Teammates' blasts do no damage, so they don't knock riders off.
- **On the line:**
  - Crouch is ignored and ADS is off.
  - Firing uses the air spread (the existing `!onGround` rule); reloading and switching weapons work.
  - Grenades are allowed. 21.2 lists only the gun, but does not forbid them.
- **Bots:**
  - The 0.7 chance is rolled per plan in `pathFromHere`, only for a bot with a brain standing 15 or more up (bed, desk,
    chair seat, shelves). Bots on the floor never consider lines, so their plans and the seeded random sequence are as
    before.
  - A zip edge costs its ride time times walk speed. That is less than its straight-line distance, so A* may miss the
    very best route through a line, but it always finds a path.
  - **At a top:** a bot presses JUMP only when this line's grab is available. With no grab within 1.2 s it repaths
    without lines and leaves lines alone for 20 s, so it never waits at a top.
  - **Riding:** a bot perceives and shoots a visible target in range with the normal aim error. Its own movement raises
    that error, which gives the air aim error. A flag carrier only rides.
  - **Afterwards:** at the bottom the zip edge counts as reached. After an early let-go, the bot repaths from where it
    lands.
- **New nodes:** `z.<line>.top` beside each start (1.56 to 1.73 from it), `z.<line>.bot` at each landing, and
  `z.bed.plat` / `z.desk.plat` on the platform.
  - **Walk links:** `z.bed.top`-`m.bed.e`, `z.desk.top`-`m.desk`, `z.green.top`-`n.ss2.b`, `z.tan.top`-`s.ts2.b`,
    `z.bed.bot`-`z.bed.plat`-`m.plat`, `z.desk.bot`-`z.desk.plat`-`m.plat`, `z.green.bot`-`n.c.y`, `z.tan.bot`-`s.c.y`.
  - **Checks:** the script swept all ten new walk links as `validateWaypoints` does: the standing capsule, ground under
    every 0.1 step, no blocker between step height and head height. All pass. It also checked every older walk and cross
    edge against the new posts; none comes near.
  - **The sweep itself:** run over the 149 older edges, it flags none, which agrees with the game's validator.
- **Sound:**
  - Clacks on grab and on letting go, heard from the rider's position.
  - One whirr voice follows the rider nearest the listener, with pitch rising with speed.
  - The grab's clack also tells enemy bots within 25 where the rider is, as a quiet gunshot does.
- **HUD:** "JUMP to zip" in range, and "JUMP to let go" while riding.
- **Touch:** the JUMP button shows a striped-line icon with ZIP in range, and reads LET GO while riding.
- **Match stats:** `matchReport()` stats gain `zips` per team.
- **Test hook:** `__game.zipLines()` lists the lines, with their lengths and ride times.

## 22. Round 10: health regen and "feeling powerful" (user request, 2026-11-27)

The user asked for health regen after 10 s, plus every item from the "feeling powerful" list:
- kill streaks;
- a slow-motion final-kill replay;
- blasts that launch soldiers;
- breakable cover.

This is a gameplay change. Nothing runs, as before: `node --check` and ESLint only.

### 22.1 Health regen
- **Rule:** after 10 s without taking damage, health regenerates at 15 HP/s up to 100. Taking any damage restarts the
  10 s wait.
- **Who:** the player and every bot, in both modes.
- **HUD:** the health bar glows softly while it regenerates. The low-health effects (if they exist) fade as health
  returns.
- **Bots:** a bot under 50 HP with no visible enemy prefers to hold cover until regen completes. This is a wait with
  a purpose, so the 16.11 liveness clock pauses while the bot is regenerating, with a cap of 10 s.

### 22.2 Kill streaks
- **Earning:** kills in a row without dying. Assists don't count. The count resets on death; in elimination it
  carries across rounds while you survive.
- **Ready rewards:** a reward is banked at the moment you reach its count, and you can hold one of each.
- **Use:** Q, the touch STREAK button (it appears when a reward is ready), or the controller D-pad up. Each use fires
  the most recently earned reward.
- **HUD:** ready rewards show as icons by the weapon bar. Banners announce "SCOUT PLANE READY" and the like. Both
  teams hear stings when a reward is used.

| Streak | Reward | What it does |
| --- | --- | --- |
| 3 | **Paper-plane scout** | A folded paper plane glides across the room from your team's side. For 10 s every enemy shows as a red marker through walls on your team's HUDs. Shooting the plane (HP 60) ends it early. |
| 5 | **RC car bomb** | A toy RC car drives off from your feet. You drive it (move and look as normal, camera behind the car, max 22 u/s) while your soldier stands still and can be shot. Fire detonates it, and so does contact with an enemy or the end of its 15 s. Blast: 150 at the centre, radius 9, the bazooka's line-of-sight rule. If your soldier is hit, control snaps back and the car blows up where it is. Floor and ramps only, no climbing. |
| 7 | **Rubber-band barrage** | You aim at a spot in sight within 120 and fire to mark it. After 2 s, 24 bands rain over 3 s within radius 10 of the mark, 40 damage each, visible arcing from your team's shelf. Enemies see the marked circle on the floor, so they have about 2 s to run. |

- **Bots** earn streaks too:
  - They launch the scout at once.
  - They drive the RC car along floor walk edges to the nearest reachable enemy and detonate within 3. If no enemy is
    reachable on the floor, they keep the car.
  - They aim the barrage at the largest enemy group they have seen in the last 5 s.
- **CTF:** the flag carrier can't drive an RC car, because the carrier has to keep moving.

### 22.3 Slow-motion final kill
- **When it plays:**
  - in elimination, after the kill that ends a round;
  - in CTF, after the winning capture, and after a flag-carrier kill that stops a capture within 5 of the stand.
- **Recording:** a preallocated ring buffer records the last 4 s of every soldier's transform and pose, plus
  projectiles, the flags, the train and effects triggers, at 30 Hz. It is interpolated on playback, with no per-frame
  allocation.
- **Replay:** 3 s of slow motion at 0.3x, ending 0.5 s after the kill.
  - **Camera:** a cinematic orbit that starts behind the killer, swings to frame both the killer and the victim, and
    holds on the victim's tumble.
  - **Look:** letterbox bars, a "FINAL KILL" title with the killer's name, the depth of field from the title screen,
    and slowed, pitched-down audio.
- **Skip and timing:** tap, click or any key skips it. The replay runs during the existing gap between rounds and
  does not lengthen the match clock.

### 22.4 Blasts launch soldiers (rigid plastic, not floppy ragdolls)
- **Dead soldiers become rigid bodies:**
  - a box approximating the figure and its base;
  - position, velocity and angular velocity, with gravity;
  - they bounce off colliders (restitution 0.35, friction 0.6);
  - they settle and sleep under 0.3 u/s.
- **Launch:**
  - Bullets give a small push of 2 u/s.
  - Blasts (grenade, bazooka, RC car) launch bodies away from the centre at up to 30 u/s with a strong spin.
  - Bodies clatter on every bounce, with sound per surface. At most 10 bodies are live, then they are pooled.
- **Living soldiers:** a blast pushes them back. The impulse is 0.15 x damage taken (u/s), capped at 14, plus 4 upward.
  - It knocks riders off zip lines (21.2).
  - It knocks soldiers off ledges: being blasted off the bed is intended.
  - Bots recover through the usual off-graph return to the nearest node.

### 22.5 Breakable cover (explosives only)
- **Damage:** grenades, the bazooka, the RC car and barrage bands damage these pieces; bullets only leave decals.
  - **Letter blocks**, HP 200: they topple into 2 or 3 tumbling block bodies, as in 22.4.
  - **Floor book stacks used as cover**, HP 200: the books spill flat.
  - **Fort wall segments** between the pillars (not the pillars or the tower), HP 300: they chip in two stages, first
    the top half, then down to rubble.
  - Other floor cover pieces may be breakable if they meet the rules below.
- **Rules that keep navigation sound:**
  - Breaking only removes or lowers colliders, never adds them.
  - Rubble is walkable: no more than the step-up height, or visual only.
  - Debris is visual only.
  - Nothing that is part of a route or supports a waypoint edge can break: book stairs, strings, ruler bridges, ramps,
    zip anchors, fort towers, the ruin platform, and anything a waypoint stands on.
  - Bots treat broken cover as gone: they drop cover points on it and replan.
- **Reset:** everything rebuilds at each round start in elimination. In CTF a piece rebuilds 45 s after it breaks,
  but only once no soldier is standing in it.
- **Collider hash:** `colliderHash()` reports the intact map. A new `__game.brokenCover()` lists the broken pieces.

### 22.6 Round 10 build notes (deviations and choices; numbers in `CONFIG.regen`, `.bodies`, `.push`, `.streaks`, `.replay`, `.cover`)
- **Regen:**
  - Any damage restarts the 10 s wait, falls and train hits included. God mode doesn't.
  - The low-health effect is the existing `.low` health brick (30 HP or less), which clears as health comes back. The
    regen glow is a pulsing green ring on the health brick.
- **Bot regen wait:**
  - It starts at most once per life: under 50 HP, no visible enemy, 1.5 s after the last hit.
  - The bot walks to cover from its last known threat (within 12, as `goCover` does) or crouches where it is.
  - It ends at full health, after 10 s, or when an enemy shows. Liveness counts it as active for those 10 s at most.
- **Streak counting:**
  - Kills by the RC car and barrage bands count toward streaks.
  - Banked rewards survive death; only the count resets.
  - "Most recent" is the order earned. Bots follow the same rule, so a held RC car with no floor target also holds back
    any older reward.
- **Barrage mark (player):** Q enters marking mode, with a prompt and a white preview ring where the crosshair meets
  the room (within 120, dropped to the ground). Fire marks, and Q again cancels. While marking, the trigger doesn't fire
  the gun.
- **Scout plane:**
  - It weaves across the room at y 58 sinking to 50, from the team's back wall to the far one.
  - Red markers sit over every enemy on the user's screen when Green's plane is up, on screen only (no edge arrows).
  - Bots of that team get the nearest enemy in their shared team memory twice a second.
  - Hitscan, bands and blasts can hit it (a 1.6 sphere); teammates can't.
- **RC car:**
  - It is a small mover of its own rather than the soldier controller, so it can have a 0.5 step limit: book stairs
    and strings stop it, ramps don't.
  - It drives at 22 with an acceleration of 40. The camera sits behind it along the look direction and is pulled in
    where something is in the way.
  - **What sets it off:** fire, an enemy within 1.2, 15 s, leaving the room, or a hit on its driver. The driver case
    goes off on the next tick, so blasts are never nested.
  - **Damage:** the spec gives only the centre value, so it falls from 150 to 20 at the radius of 9.
  - The car itself can't be shot. The pool holds 4 cars.
- **RC car bots:**
  - They path on floor walk edges only (a new `floor` option of `astar`) to the nearest enemy standing on the floor.
  - They go off within 3 of any enemy, or when stuck for 1.5 s.
  - A carrier never deploys one.
- **Barrage:**
  - The bands arc from above the green small shelf (L2) or the tan tall shelf (L3), with 2.2 to 2.6 s flights.
  - They are ordinary band projectiles at 40 damage, with the bounce and head multiplier. The projectile pool grew from
    16 to 40.
  - The scatter uses a seeded random generator, seeded per match, so seeded matches repeat.
- **Barrage bots:**
  - Enemy bots inside a marked circle run straight out of it.
  - A bot calls a barrage on the densest group (within 10) of enemies any teammate saw in the last 5 s. It fires at 2
    or more enemies, or at 1 after holding the reward 15 s.
- **Stings and banners:** both teams hear every sting. Banners show your own READY rewards and FRIENDLY or ENEMY
  launches, and the callout list names the team.
- **Replay titles:** FINAL KILL for kills, CAPTURE STOPPED for a carrier killed within 5 of their own stand, and WINNING
  CAPTURE for the last capture.
- **Replay timing:**
  - Elimination plays it in the round-end gap: it starts 0.5 s after the kill and ends 3.5 s in, inside the 4 s gap.
  - A winning capture plays it before the match-end card.
  - CTF has no gap, so the mid-match CAPTURE STOPPED replay pauses the simulation for its 3 s. The match clock doesn't
    move.
- **Replay recording:**
  - It covers soldier position, yaw, pitch, tip, dead, crouch, weapon, flag carried and the rigid-body orientation;
    projectiles; flags; and shot and blast triggers. The train is posed from the recorded time.
  - Zip trolleys, RC cars, scout planes and barrage rings show as they are live.
  - Recording pauses while a replay plays.
- **Replay sound:** a master low-pass falls to 700 Hz, and the replayed shots and blasts play at 0.55 pitch. Live sounds
  are only low-passed, not slowed.
- **Replay depth of field:** the post-processing bokeh pass, focused on the subject, so not on presets without post.
- **Rigid bodies:**
  - Box half-extents are 0.45 x 0.9 x 0.32, mass 1.
  - Each corner is pushed out through the collider's shallowest face, with impulse, restitution and friction. There are
    1 to 3 substeps by speed.
  - Train cars are not static colliders, so a car that reaches a body throws it clear.
  - Bodies and debris never block soldiers or bullets.
  - The dead soldier's position follows its body, so the death camera and spectating follow it.
- **Blast push:** any soldier a blast damages and does not kill is pushed, the thrower included. The push carries
  through the air the way a spring launch does, and bots repath from where they land.
- **Breakable pieces** (21 in all):
  - The 17 letter-block colliders (`W-a.*`, `W-c`, `C-f.block`, `E-a.*`, `n.E-c`).
  - The 4 fort front walls above the slits (`n.fort.front.w.high`, `n.fort.front.e.high` and their tan pair).
  - There are no floor book stacks among the colliders, so none break. No other floor cover breaks.
  - "Between the pillars" became the wall above the slits. The slit pillars and the low wall below are separate
    colliders and stay; splitting the walls would have added colliders.
- **How walls break:**
  - At half HP the top half is lowered.
  - At 0 the box settles as a 0.02 rubble slab on the low wall (1.15 to 1.17). The slits then open into gaps you can
    jump through.
- **How blocks break:** a block becomes a 0.02 slab and throws 2 or 3 debris cubes, as rigid bodies of their own.
- **Cover art:**
  - The breakable walls lost their top studs, which would float once broken.
  - Each piece has its own mesh, plus a half-height mesh for the walls.
  - Decals on a removed part are cleared.
- **Cover damage:**
  - It follows the blast's own falloff, if the blast reaches the piece (a ray from the centre to the piece's nearest
    point).
  - Only barrage bands, not the band gun's, damage cover.
- **Cover bots:** after a break or rebuild, nearby cover bits are recomputed and bots in cover there replan.
- **CTF rebuild:** a damaged piece rebuilds 45 s after its last damage (half-broken walls too), once no living soldier
  overlaps it.
- **Navigation:**
  - The standalone script confirms no waypoint stands on a piece and no edge runs over one.
  - `colliderHash()` hashes the intact heights, so it stays `cb059ceb`.
- **Controls:**
  - Q, the touch STREAK button (shown only while a reward is ready) and the controller's D-pad up.
  - While driving, move and look steer the car and fire sets it off.
  - Any key, click, tap or controller button skips the replay.
