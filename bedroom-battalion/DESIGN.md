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
| fog (linear) near / far | 10 / 220 | colour = haze colour (was 30 / 330, which added no depth). Read live from CONFIG |
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
| Seat stoppers (2) | cylinders r 0.5, `y 17..18`, at (92.2, 73.3) and (92.2, 86.7). They close the seat edge between each ramp head and ruler foot so cutting the corner cannot drop you off the seat |
| Under desk | eraser `104..108, 66..68, 0..1.2` (mirrored); paper ball cylinder (108, 80) r 2.5, h 4.5 |

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
| Tunnel | cardboard box over the east straight | walls `72.6..73.6` and `80.4..81.4`, `z 68..92`, `y 0..8`; roof `72.6..81.4, 68..92, 6.8..8` | centred |

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
- Falling out of the room must be impossible: if the player leaves the room box or drops below y -5,
  put them back at their last grounded position.

## 9. Waypoint graph

Nodes are `(x, y, z)`. Edge kinds: `walk`, `ramp` (walk on a slope or stairs), `jump`, `climb` (string),
`launch` (spring pad, one way), `cross` (crosses the track; bots check for the train in round 3),
`drop` (one way down).

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
| m.e.w | (83.2, 0, 80) | m.e | (100, 0, 80) |
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
e.5-m.e, e.2-ss.app, ss.app-ss.foot, ss.foot-ss.top (ramp), ss.top-ss1.a, ss1.a-ss1.s, ss1.a-ss1.b,
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
| bed_top | (27, 19.6, 80) | (100, 10, 80) |
| desk_top | (97.5, 27.6, 80) | (20, 8, 80) |
| shelf_top | (110.5, 61.6, 136) | (30, 0, 50) |
| floor_centre | (60, 1.6, 66) | (60, 3, 110) |
| under_bed | (28, 1.6, 80) | (28, 2, 50) |
| east_lane | (83.2, 1.6, 40) | (90, 12, 80) |
| west_lane | (40, 1.6, 30) | (30, 10, 70) |

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
| SMG | 16 | 900 rpm auto | 40 | 2.0 s | wide spread past 25 units |
| Sniper | 90 | bolt, 1.3 s cycle | 5 | 3.0 s | right-click scope, 25 deg fov scoped |
| Pistol | 30 | semi, 0.18 s min | 12 | 1.4 s | accurate |
| Grenade | 110 max, radius 7 | one per round | - | - | 2 s fuse, arc preview |

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
| Tan squad | `#E0C080` (shadow side `#B8975A`) |
| Spare soldiers (neutral) | `#B9BEC6` |
| Sun light | `#FFE2B0` |
| Hemisphere fill sky / ground | `#FFF1D6` / `#B08D6A` |
| Haze and fog | `#E6DCCB` |
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
