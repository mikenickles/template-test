# FEEL.md: round 1 (graybox)

**Gate "the room feels huge": PASS, narrowly.** From the side lanes and from every perch the player-eye pictures read as a toy soldier in a bedroom (desk, chair, shelves, door and bed are recognisable and run off the top of the frame), and crossing takes 20 to 32 s. It is weakest exactly where a round starts: at the spawn and down the centre lane the furniture tops sit only 25 to 29 degrees above the horizon, the haze adds almost no depth, and the middle of the floor reads as "person among grey crates".

How this was judged: headless only, through `window.__game`, with my own scripts (`tests/feel_*.cjs`) and about 100 player-eye screenshots and montages (`screenshots/round1/feel_*.png`, standing eye height 1.6, `teleport` + `lookAt` + `render`). I looked at every base view and route view, and at the field of view and haze montages cited below; variant shots not cited were rendered but not reviewed. I cannot hold a mouse; anything that needs one is listed at the end and is not guessed at.

Tooling note for the lead: `CONFIG.move`, `CONFIG.climb` and `CONFIG.player` are live, but `CONFIG.camera` and `CONFIG.fog` are read once at start-up (checked: same picture before and after changing them, `feel_liveconfig.cjs`). The field of view and haze trials below were therefore rendered from temporary copies of `index.html` in the scratchpad with only the CONFIG text changed. The real file was never touched.

---

## 1. Scale evidence

### What the pictures say

| View | File | Reads as |
| --- | --- | --- |
| Green spawn, looking south | `feel_01_spawn_across.png` | 54 % of the frame is your own blue fort wall. You see the room through the 5-wide gate and over the wall. Desk and bed tops show above the wall. Not a strong first impression. |
| Fort gate, looking south | `feel_02_gate_across.png` | Giant room, moderately. Bed is a long slab on the right, desk and chair on the left, track loop ahead. Far wall is as crisp as the near wall. |
| Gate, level, toward bed / desk | `feel_25_*.png`, `feel_26_*.png` | Giant room. The desk with chair, lamp and skateboard ramp is unmistakably furniture and it looms. |
| Gate, looking up at desk / shelf | `feel_04_*.png`, `feel_05_*.png` | Giant room. Best floor shots of the set. |
| Ceiling | `feel_07_*.png`, `feel_08_*.png` | The ceiling renders mid tan, darker than the walls, so it looks like a brown lid, not a far-away white ceiling. (For the visual tester to confirm; it matters here because a dark ceiling reads lower.) |
| Mid floor, south and north | `feel_15_*.png`, `feel_18_*.png`, `feel_var_fov75_mid_south.png` | **Person among crates.** At (60, 50) about 60 % of the frame is the grey dump truck and game box; inside the ruin it is purple walls twice your height. Only the door (72 tall) in `feel_18` rescues it. |
| Mid floor toward the bed | `feel_16_midfloor_west_bed.png` | Giant room. The slab fills the top half with a dark underside. Strong. |
| Bedside looking up, desk leg looking up | `feel_21_*.png`, `feel_22_*.png` | Giant room. |
| Under the bed | `feel_19_*.png`, `feel_20_underbed_out_east.png` | Low car-park ceiling 4.4 above the eye; looking out east the far desk and shelves are framed by the slot. Good. |
| Bed top across and down | `feel_09_*.png`, `feel_10_*.png` | Good: desk and both shelves stand like buildings; the ruin and cover look like toys. The bed top itself is one flat colour with no scale cue. |
| Desk top (named view position) | `feel_11_desktop_across.png` | Half the frame is the chair back. See finding 11. |
| Top shelf across and down | `feel_13_*.png`, `feel_14_*.png` | Best "I am very high in a bedroom" shots: bed with pillows, window, door, forts as tiny brick shapes. |

What gives the scale away, in order of strength: (1) recognisable furniture silhouettes (desk + chair + lamp, ladder shelves, door with knob, window); (2) the floor planks, 3.2 wide, twice the body height; (3) the 4-tall skirting board; (4) looking down from the perches. What fails to: haze (barely visible), the ceiling tone, and the anonymous grey cover in the centre.

### Measurements

Angular size at 75 deg vertical field of view, looking level (top of frame is +37.5 deg). `feel_angles.cjs`.

| From | Bed | Desk | Small shelf | Tall shelf | Door |
| --- | --- | --- | --- | --- | --- |
| Green spawn (60, 20) | top at 24.9 deg, 37 % of frame height | 26.2 deg, 37 % | 38.7 deg, 54 % | 28.6 deg, 39 % | 70 deg, 98 % |
| Fort gate (60, 28) | 28.5 deg, 42 % | 28.9 deg, 41 % | 38.7 deg, 54 % | 30.2 deg, 42 % | 65 deg, 91 % |
| Mid floor (60, 66) | 33.3 deg, 49 % | 34.9 deg, 50 % | 36.0 deg, 50 % | 40.1 deg, 55 % | 46 deg, 63 % |
| West lane (40, 60) | 73 deg, off frame | 23.9 deg | 28.8 deg | 33.5 deg | 50 deg |
| East lane (83, 60) | 18.9 deg | 63.8 deg, off frame | 52.3 deg, off frame | 43.6 deg, off frame | 45 deg |

So the furniture only leaves the frame from the side lanes. From the centre it sits comfortably inside it.

Travel (sprint 7 / walk 5), `feel_travel.cjs`:

| Trip | Sprint | Walk |
| --- | --- | --- |
| Wall to wall, straight line at x = 42 | 22.8 s | 31.9 s |
| Fort to fort, centre lane (path 141.6 u) | 20.3 s | 28.3 s |
| Fort to fort, west lane | 23.8 s | 33.2 s |
| Fort to fort, east lane | 26.0 s | 36.3 s |
| Spawn to ruin platform | 11.5 s | 15.7 s |

Against the 25 to 30 s target: walking is in it, pure sprint is 10 to 20 % under. The centre path changes direction every 8 to 13 units and passes cover almost all the way (finding 7), so on paper it is a journey and not a corridor. I would not slow the player for this (see finding 13 for the number if the lead wants it).

Field of view, `feel_cmp_fov_gate_desk.png`, `feel_cmp_fov_mid_south.png` (60 / 75 / 90 / 100): at 60 the desk fills and overflows the frame (most looming, but tunnel-like); at 90 and 100 the desk shrinks to a third of the frame height and the room reads as a wide empty hall with small furniture. 75 is the right side of the trade. **Do not go wider than 75.** 75 vertical is already 107 deg horizontal at 16:9.

---

## 2. Findings, most harmful first

### 1. Haze does almost nothing for depth (pillar 1)
- What: at fog 30 / 330 the far wall, 132 units from the gate, is as sharp and as dark as the wall next to you, and the far end of the bed is the same colour as the near end. The room loses its strongest cheap depth cue. The wall colour as rendered is also close to the haze colour, which hides the little gradient there is.
- Evidence: `feel_cmp_fog_gate_across.png` (top left = current, top right = 10 / 220, bottom left = 5 / 160), `feel_cmp_fog_bedtop.png`. At 10 / 220 the far wall and far bed end visibly lift toward the haze colour and the room reads much deeper; at 5 / 160 the far fort starts to wash out.
- Change: `fog.near 30 -> 10`, `fog.far 330 -> 220`. Haze at 60 units goes from 10 % to 24 %, at 120 units (fort to fort) from 30 % to 52 %. Watch target readability at 120 units in round 2; if the far fort is too pale use far 250.

### 2. The scale read is weakest at the spawn and in the centre lane (pillar 1)
- What: the first thing a player sees is their own fort wall (`feel_01`), and the centre lane is 3 to 6 tall grey boxes and purple walls with the furniture hidden behind them (`feel_15`, `feel_var_fov75_mid_south.png`). From the spawn and gate the bed and desk tops are at 25 to 29 deg, 37 to 42 % of the frame height.
- Why it matters: this is where every round starts and where most fights will be.
- Change (no geometry move needed this round): keep `camera.fovVertical` at 75 or try 70 (the 60 trial shows the direction: furniture grows from about 40 % to about 50 % of frame height); apply finding 1; and treat "centre cover must read as toys" as a round 2 gate item (block letters, car wheels, brick studs), because flat grey boxes at eye level are what turn the picture into crates. I am not proposing a layout change for this: cover has to block the view, and I could not find a move that opens the furniture up without thinning the cover. The 70 value is untested; only 60, 75, 90 and 100 were rendered.

### 3. Strings are slow and are never the better choice (pillar 3)
- What: `climb.speed` 3.5 means 7.4 s hanging on the yo-yo string or shoelace (26 units) and 5.7 s per shelf string (20 units), looking at a yellow line, unable to dodge. Running up the blanket slope gains height at 6.3 u/s, nearly twice as fast.
- Evidence (`feel_routes.cjs`, `feel_travel.cjs`): Green spawn to the desk north end is 17.4 s by small-shelf stairs + ruler bridge, 17.6 s by the yo-yo string (`feel_checks.cjs`), 18.3 s by skateboard + ruler to the desk middle. All three are within a second, so the string gives the exposure with no time saved. Tall shelf top needs two strings: 11.4 s of its 29.4 s.
- Change: `climb.speed 3.5 -> 5.5`. Measured live (`feel_tuning.cjs`): floor to desk by the yo-yo drops from 8.8 s to 6.1 s (4.7 s on the string), a shelf string from 5.7 s to 3.6 s. Spawn to desk end by string becomes 14.9 s, so the string is the fast, exposed option (2.5 s quicker than the stairs and bridge), and Tan's top shelf comes down from 29.4 s to 25.3 s (`feel_checks.cjs`).

### 4. From above you cannot see where any route starts (pillar 3)
- What: standing on the desk, the yo-yo string's top is a single yellow dot at the edge (`feel_r12_desk_find_yoyo_down.png`); the ruler bridge to the shelf is invisible until you are on the lip (`feel_r13_desk_find_bridge_s.png`); on shelf L2 the string down is a dot (`feel_r15_shelfL2_find_string_down.png`) while the string up is obvious (`feel_r16`); on the bed the blanket slope cannot be seen from the top (`feel_r17_bedtop_find_ways_down_n.png`). Getting down is guesswork, and a wrong guess is 40 hp (bed), 80 hp (desk) or death (shelf L2 and L3).
- Evidence also in `feel_spring_strings.cjs`: running west off shelf L2 at the string grabs it if you are within 0.8 sideways, and falls 40 units (lethal) at 0.9.
- Change: give every route a marker on the top surface. Strings: draw the string 2 units above its top (yo-yo and shoelace to y 28, shelf strings to y 42 / 62) or lay 1.5 units of yellow on the surface at the exit point (desk `106.7..107.3, 55..56.5` and `106.7..107.3, 103.5..105`; shelves `108..109.5` at each string z). Ramps, bridges and stairs: let the route colour lap 1.5 units onto the top surface (bed `20..32, 45..46.5` and `22..30, 113.5..115`; desk at the ruler and bridge heads).

### 5. Shelf levels 2 and 3 cost a lot and show little more (pillar 3)
- What: share of open floor on which a standing soldier is in line of sight (`feel_perches.cjs`, 3-unit grid): floor level 8 to 22 %; bed east edge 38 %; desk edge at either end 35 to 36 %; shelf L1 edge 36 to 37 % (14.3 s from the home spawn); small shelf L2 41 % (22.2 s); tall shelf L2 42 % (22.2 s); tall shelf L3 45 % (29.4 s). L1 to L3 buys 9 points of view for 15 more seconds.
- Why: the shelves are in the corners, so extra height mostly adds floor that is already far away. What L2 and L3 do buy is safety: 3 units back from the edge you are invisible from the whole floor (0 %).
- Change: finding 3 (faster strings) is the main fix. Nothing else needed in round 1; in round 2 check that a sniper on L3 is not untouchable (only the two strings reach it).

### 6. Cutting the corner from the chair seat onto a ruler ramp drops you 17 units (pillar 3)
- What: the ruler ramps are thin slabs whose low end is at z 75 (north) and z 85 (south). Only the last 0.8 units of each side can be stepped onto; further up, the slab edge is a shin-high wall. A player who arrives up the skateboard or the chair stairs and turns straight toward the visible ruler top slides along that wall and off the rimless seat edge.
- Evidence (`feel_ruler_trap.cjs`): from the skateboard top, steering at the ruler at z 75.5 or 74.5 reaches the desk in 5.5 to 6.1 s; steering at z 73.5 sticks against the slab edge for the full 12 s; steering at z 71 or 68 falls to the floor for 21 to 32 hp in all six tries.
- Change (not testable by me, builder to re-run `feel_ruler_trap.cjs`): put a small round stopper on the seat edge between the ramp head and the ruler, cylinder centre `(92.2, 73.3)` r 0.5, `y 17..19`, mirrored at `(92.2, 86.7)`. A cylinder lets a player who clips it slide round; a box there would snag the east edge of the skateboard.

### 7. Cover gaps (pillars 1 and 5; "a journey, not a sprint across nothing")
Measured along each lane's waypoint path: stretches where the nearest floor cover at least 1.2 tall is more than 4 units away (`feel_cover.cjs`), plus a floor map (`feel_covermap.cjs`).

| Lane | Path length | Longest exposed stretches |
| --- | --- | --- |
| West (beside the bed) | 128.6 | **28.8 u** from (38, 66) to (38, 95), worst point 13 from cover; 11.8 u each side at z 37..49 and 112..123 |
| Centre | 117.6 | **13.5 u** from each gate to (60, 42) / (60, 119), worst point 13.7 from cover; nothing else over 6 |
| East | 150.3 | **28.5 u** from (87, 37) to (83, 64), north side only; 14.2 u at each fort east door; 11.5 u on the south side |

- West lane: the spring pad sits in the middle of the emptiest stretch. Going under the bed is the only refuge and it is not cover from the desk until you are about 15 units in (measured in `feel_checks.cjs`: a soldier under the bed is still in view of the desk edge at x 24 and hidden at x 18; the bed edge is x 35). Suggested: one more W-b style object per side, half under the bed edge, about `33..36, 68.5..73` h 2.2 and its mirror `33..36, 87..91.5`. `feel_proposals.cjs` shows these sit on the `w.5 - ub.e` waypoint edges, so those two edges need moving (or `ub.e` nudged to z 65 / 95). The round 3 train will also pass here, so the lead may prefer to wait.
- Centre, in front of each gate: the crayons are 0.9 tall and a crouching soldier is 1.2, so they hide nobody. Change crayon height `0.9 -> 1.3` (still shootable over when standing, eye 1.6).
- East lane, north side: Tan's side has the solid chair book stairs (`86..92, 87..110`, up to 17 tall) as cover; Green's side has the skateboard, a 0.6 thick slab you can see and later shoot under. Suggested north-only block `79.5..82.5, 44..47` h 3 (checked: overlaps nothing, clear of the train envelope by 1.3, no waypoint edge within 0.5).
- The empty quarters behind the forts (x 0..34 at z 0..24 and 136..160; x 76..100 at z 0..20 and 140..160, up to 26 from cover) are dead ground on the way to the blanket slope and the shelf stairs. Fine for now; they will matter when someone holds the tower.

### 8. Fairness: Green vs Tan
Sprint times from each spawn, `feel_travel.cjs`.

| Target | Green | Tan |
| --- | --- | --- |
| Ruin platform | 11.5 s | 11.4 s |
| Own bed end | 9.0 s (blanket slope) | 10.1 s (book stairs) |
| Bed top middle | 13.7 s | 14.25 s (spring pad is Tan's fastest) |
| Spring pad / under-bed middle | 11.2 / 11.9 s | 11.2 / 11.9 s |
| Chair seat / desk top middle | 13.8 / 18.25 s | 13.8 / 18.2 s |
| Own shelf L1 | 14.3 s | 14.3 s |
| Own shelf L2 | 22.2 s | 22.2 s |
| Highest perch on own side | 22.2 s (small L2, y 40, sees 41 %) | 29.4 s (tall L3, y 60, sees 45 %) |
| Enemy's highest perch | 37.1 s (tall L3) | 29.8 s (small L2) |

Floor and desk are fair to within 0.1 s. Two asymmetries: Green reaches its bed end 1.1 s sooner; Tan owns a perch 20 units higher that sees 37 % of Green's half, while Green's top shelf sees 25 % of Tan's half. No change this round (known watch item); the east-lane cover in finding 7 is the cheaper asymmetry to fix now.

Also for round 2: both bed ends and both desk ends have a clear line down into the roofless fort at 46 and 63 units (`feel_spring_strings.cjs`, sight pairs). Own team gets there first (9 s vs 19 s to the bed end), so it is not a spawn trap yet.

### 9. Air control is "a lot", not "a little" (movement)
- What: `airControl` 0.25 gives 12.5 u/s^2 in the air. A walking jump (0.72 s, 3.58 units) can be cancelled to 0.45 units by pulling back, and you land already moving backwards at 3.75 u/s; a standing jump reaches full walk speed before it lands.
- Evidence: `feel_mechanics.cjs`, `feel_tuning.cjs`. At 0.15 pulling back lands you at 1.7 units with zero speed; at 0.10 at 2.33 units still moving forward at 1.5.
- Change: `move.airControl 0.25 -> 0.12`. Spring flights still steer about 5 units either way along the bed. Whether 0.25 actually feels floaty needs a human; the numbers say it does not match the brief.

### 10. Book stairs make the camera rattle slightly (movement)
- What: speed is fully kept on all four staircases (7.0 u/s on every tick, no snags, glued going down), but the eye rises in pulses. Rebuilt from the game's own smoothing rule (offset minus step, decaying at `stepSmooth` per second): at sprint the eye's vertical speed swings between 1.5 and 9.9 u/s every 0.13 s (7.8 Hz) around a mean of 4.7; the eye is never more than 0.12 units off a straight line. No jolt, but a steady shudder that will show on the near treads.
- Evidence: `feel_routes.cjs`, `feel_tuning.cjs`. `stepSmooth` 16: ripple +/-90 %, residual 0.051 rms. 10: +/-59 %, 0.033. 8: +/-48 %, 0.027, camera sags at most 0.96 below the true eye. The solid ramps (blanket, skateboard, rulers) are perfectly smooth (0 ripple).
- Change: quick, `player.stepSmooth 16 -> 9`. Better, collide each book staircase as one `ramp` (slopes 33.7, 36.2 and 34.7 deg, all under the 50 deg limit) and keep the steps as visuals; that also removes 127 box colliders.

### 11. Desk middle is the worst place on the desk to look from (pillar 3, low)
- What: from `m.desk` and the `desk_top` named view the chair back (panel `y 22..33`) fills half the frame (`feel_11_desktop_across.png`). View: 18 % of the floor from `m.desk`, 26 % from the west edge at z 80, 35 to 36 % from the west edge at z 60 or 100.
- This is acceptable as design (a shielded middle, open ends). If the lead wants the middle open, raising the panel bottom `22 -> 26` lifts the mid-edge view from 26 % to 35 % (`feel_chairback.cjs`). Either way, do not judge the desk by the `desk_top` named view.

### 12. Tunnel drop is blind and misses at slow speed (pillar 3, low)
- What: from the seat the tunnel roof cannot be seen at all (`feel_r11_seat_look_tunnel_drop.png`); it is 9 down and starts 3.6 out from the seat edge. Sprinting lands at x 78.3 and walking at x 80.0 (roof ends at 81.4), but crouch-walking off lands on the floor for 35 hp (`feel_tuning.cjs`).
- Change: extend the roof east as a flap, `81.4..84, 68..92, y 6.8..8`. It then sits under the seat edge, is visible when you look down, and catches any speed. Checked: overlaps nothing, walking clearance underneath is 6.8.

### 13. Crossing time is a little under target on pure sprint (pillar 1, low)
- 20.3 s fort to fort, 22.8 s wall to wall. `move.sprint` 6.5 gives 24.5 s wall to wall and 6.2 gives 25.7 s (`feel_ruler_trap.cjs`, last three lines). I would leave 7: sprint is only 40 % over walk already, and round 2 gunfire will slow real crossings. Lead's call.

### 14. Smaller things
- Spring pad placement: any straight run down the bed side with x between 36.5 and 39.5 launches you (`feel_spring_strings.cjs`, "accidental"); the pad takes 3 of the 6.5 units between the bed and the train envelope. Fine if intended as "the bed-side path is the pad"; otherwise narrow it to `37..39`. From the floor it is a flat 0.4-tall tile (`feel_r03_westlane_to_spring.png`): visible at 18 units, easy to miss from an angle. It wants something vertical in round 2.
- Shelf strings are climbed with your back to the shelf (you walk west off the board to grab them), and at the top you are placed 1 unit behind you in a single tick. The yo-yo and shoelace place you forward, which is natural. The backward hop cannot be judged without a human; if it feels bad, ease the placement over 0.15 s.
- Jumping off a string drops you straight down with no push; from 12.6 up that is 13 hp. Players usually expect jump to kick away from the wall. Human check.
- Crouch: the eye drops 0.6 in 0.086 s (`eyeLerp` 7). Speed changes in 0.10 s. Probably too abrupt on screen; try `eyeLerp 7 -> 4` (0.15 s). Human check.
- The crayon in front of the west firing slit hides the lower half of the slit view (`feel_f01_slit_standing.png`). Probably intended; it gets worse if the crayons go to 1.3 (finding 7), so move that crayon 3 units further out if so.

---

## 3. What already feels right (do not break)

- Ground movement matches "snappy, no sliding": full speed in 0.10 s (walk, sprint and crouch), stop in 0.07 to 0.08 s over 0.10 units (walk) or 0.22 (sprint), W to S reversal 0.2 s with 0.21 overshoot, strafe = walk speed, sprint forward only (7 with a diagonal, 5 backwards or sideways), no bunny hop when jump is held.
- Jump: apex 1.383, 0.70 s in the air, 3.6 units at a walk and 5.0 at a sprint. Getting onto the 1.2 ruin platform is forgiving: every jump timing in the last 2.4 units lands, and so does standing against the face.
- Ramps: horizontal speed constant up and down, perfectly smooth eye path, no hop at the lips (3 % airborne ticks at the skateboard top only).
- Stairs: no speed loss, no snags, glued on the way down.
- Spring pad: 72 of 72 launches from eight approach lines, three speeds and three air inputs landed on the bed with no damage; 2.03 s flight, apex 22.2, landing x 29.8 to 30.7, z steerable 68.9 to 91.1. The view at the top is good (`feel_r22_*.png`, `feel_r23_*.png`).
- Strings: grab works from a straight run up to 0.75 off-centre, from the far side and while strafing; you hang with no keys; you can look anywhere while climbing; from the top, walking at a string hangs you on it instead of off the edge, and S takes you down; the on-string prompt is there (`feel_r21_on_yoyo_string_lookout.png`). The view while climbing is a nice reward.
- Routes read from the floor at a glance: blanket slope and book stairs from the fort west doors (`feel_r01`, `feel_r02`), skateboard, chair stairs and shelf stairs from the east doors (`feel_r04` to `feel_r07`), strings as yellow lines against the wall (`feel_r08`, `feel_r14`). Montages: `feel_cmp_routes_a.png` to `_d.png`.
- Every high place has a damage-free way down in 3.7 to 6.5 s: bed by bear head and body (4.2 s), by bucket (3.7 s), by slope (3.8 s) or stairs (4.6 s); desk by seat, tunnel roof, floor (6.5 s) or ruler and skateboard (6.3 s).
- Height pays: floor level sees 8 to 22 % of the floor, the cheap perches 35 to 38 %. Bed top in 9 to 14 s, desk in 18 s, against 11.5 s to the centre: a real choice.
- The under-bed space, the bed seen from mid floor, and the view from the top shelf are the three strongest scale moments. Keep the plank size and the skirting board.
- Gate to gate and slit to slit sightlines are blocked by the ruin; tower to tower is blocked at chest height by the parapets.

## 4. Only a human with a mouse can judge

- Whether 7 u/s feels fast or slow at this eye height. The plank gaps run north-south, the same way as most travel, so they give little sense of speed in that direction.
- Whether the air control, the crouch snap, the stair shudder and the backward hop off shelf strings are actually unpleasant.
- How it feels to hold a line up a 3-wide ruler with no rails while turning the view.
- Whether the spring launch feels good. It is reliable; there is no camera or sound feedback yet.
- Mouse sensitivity (0.0022) and the 88 degree pitch limit.

## 5. Scripts

All in `tests/`, run with `node name.cjs`: `feel_scale_shots`, `feel_angles`, `feel_variants` (field of view and fog copies), `feel_mechanics`, `feel_travel`, `feel_routes`, `feel_route_shots`, `feel_cover`, `feel_covermap`, `feel_perches`, `feel_spring_strings`, `feel_tuning`, `feel_ruler_trap`, `feel_chairback`, `feel_proposals`, `feel_checks`, `feel_fort_shots`, `feel_liveconfig`. `feel_dump` and `feel_ids` only list colliders and routes. Helpers: `feel_lib.cjs`, `feel_drive.js`, `feel_los.js`. No console errors or warnings in any run.

---

# Re-check after FIXLIST passes 1 and 2

**Gate "the room feels huge": PASS, more comfortably than before.** The haze now does its job: from the gate the far wall and the far end of the bed fade toward the haze colour, the walls read blue and the ceiling off-white, and the room reads clearly deeper. The spawn and centre-lane read is slightly better for the same reason, but still the weakest part: the same grey boxes fill the frame.

Method as before: fresh player-eye shots (`screenshots/round1/feel_re_*.png`, 37 views plus montages `feel_re_cmp_*.png`; all reviewed except `feel_re_04` and `feel_re_16`, which were rendered but not looked at), and the same scripts re-run on the fixed build. New scripts: `feel_re_shots`, `feel_re_more`, `feel_re_ruler`, `feel_re_ruler2`, `feel_re_bear`, `feel_re_bear2`. No console errors in any run. `index.html` not touched.

## Items asked for

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Gate; spawn and centre read | **Pass. Slightly better, not fixed.** | `feel_re_cmp_gate.png`, `feel_re_cmp_gate2.png` (old left, new right). Depth is much better. Spawn view is still 54 % own wall; (60, 50) and the ruin are still crates. |
| 2 | Far wall paler than near | **Fixed.** | `feel_re_02_gate_across.png`: near east wall is blue-grey, far wall and far bed end are visibly washed toward haze. `CONFIG.camera` and `CONFIG.fog` are now live (`feel_liveconfig.cjs`: picture changes). |
| 3 | Yo-yo faster than stairs | **Fixed.** | Green spawn to desk north end: 14.9 s by yo-yo against 17.4 s by stairs and bridge (was 17.6 against 17.4). String time 4.7 s (26 u) and 3.65 s (20 u). |
| 4 | Ways down visible from on top | **Partly.** | Fixed for all eight strings (stubs stand above the surface: `feel_re_d01`, `d02`, `d07`, `d08`, `d09`), both ruler bridges (`d03`, `d04`), both rulers from the desk (`d05`), blanket slope head (`d11`). Not fixed for the bed book stairs: the head strip is behind pillow P2 and cannot be seen from the bed until you stand on the pillow (`feel_re_d16_bed_south_from_mid.png` against `feel_re_d17_bed_south_on_pillow.png`). The blanket strip is also hidden behind ridge R1 from the bed middle (`feel_re_d13`), visible once past it. |
| 5 | Ruler trap | **Fixed (no falls); the leftover is acceptable.** | `feel_ruler_trap.cjs`: 0 falls, 0 damage in 15 runs; the 9 corner-cutting runs slide and stop. `feel_re_ruler.cjs`: they stop on the seat against the ruler side, or on the skateboard edge against the prop at y 13 to 15.5. Steering one unit west and round reaches the desk 3.0 s later (`feel_re_ruler2.cjs`). Stoppers do not snag normal climbs: straight runs up the skateboard and chair stairs at x 90.5 to 91.9 lose at most 0.15 s. One leftover: from against the prop, steering straight at the ruler foot pins you behind the stopper until you step west. No damage, so not a trap. |
| 6 | Cover gaps | **Fixed for west and centre, partly for east.** | `feel_cover.cjs`. West lane: longest bare stretch 28.8 -> 11.8 u (9.3 u at the pad), worst point 13 -> 8.2 from cover. Centre: gate stretch 13.5 u -> none over 6. East lane north: 28.5 -> 13.8 u (worst point 10.4 from cover), but the 14.2 u stretch outside each fort east door is unchanged and is just over the 14 u line. |
| 7 | Made worse | See below. | |

## Times to each high point (sprint, fixed build)

| Target | Green | Tan |
| --- | --- | --- |
| Ruin platform | 11.6 s | 11.5 s |
| Own bed end / bed middle | 9.0 / 13.7 s | 10.1 / 14.25 s |
| Chair seat / desk middle (ramps) | 13.8 / 18.25 s | 13.8 / 18.2 s |
| Desk end by string | 14.9 s | 14.9 s |
| Own shelf L1 / L2 | 14.3 / 20.1 s | 14.3 / 20.1 s |
| Tall shelf L3 | 33.0 s | 25.3 s |
| Small shelf L2 | 20.1 s | 27.8 s |

Unchanged fairness picture: equal except Green's 1.1 s lead to its bed end and Tan's taller shelf. Fort to fort is still 20.3 s. All 17 route walks in `feel_routes.cjs` still pass with no speed loss; spring pad 72 of 72 on the bed.

## What the changes made worse

1. **Jumbo crayons mask the firing slits and the gate view.** At 1.3 high and 5 units in front of the wall they cover most of what a standing defender sees through either slit (`feel_re_c04_slit_standing.png`, `feel_re_s01_slit_east_standing.png`: only a strip above the crayon is left), and from the gate two grey slabs fill the bottom third of the frame (`feel_re_02`). They do work as crouch cover (`feel_re_c06`). Suggested: turn them to lie north-south beside the gate path instead of across the slits, about `55.7..57, 29..38` and `63..64.3, 29..38` h 1.3, mirrored. Untested.
2. **The bed is now pale and its top is blown out.** With the new bed colour and fill light the bed top renders near white; pillows, sheet and the bed surface are hard to tell apart (`feel_re_09_bedtop_across.png`, `feel_re_d16`, `feel_re_d18`), and from the gate the pale slab blends into the hazed wall behind it, so its silhouette is weaker than the old brown one (`feel_re_cmp_gate.png`, top row). Scale cost is small; readability on the bed top is the real loss. For the visual tester and round 2 art: the blanket colour on the bed top should fix it.
3. **The free way down the bear now costs 25 hp at walking or sprinting speed.** The body ledge under the head is 2 units deep and 6 down; with `airControl` 0.12 you cannot brake onto it, so you overshoot to the floor (`feel_re_bear.cjs`: 25 hp in all six runs; it was free before). It still works at crouch speed or with a short tap (`feel_re_bear2.cjs`). Suggested: pull the bear head back to `6..14, 39..45` so the ledge is 4 deep. The bucket, slope, stairs and both desk ways down are still free.
4. Smaller: W-c closes the strip between the bed and the spring pad, so a run down the bed side now always ends on the pad unless you step out to x 40 (`feel_spring_strings.cjs`, "accidental": x 35.5 and 36 now launch too). Spring steering along the bed is narrower (z 70 to 90, was 69 to 91), as expected.

## Top remaining issues

1. Spawn and centre-lane scale read: unchanged grey crates at eye level; needs the round 2 art pass on centre cover, and the jumbo crayons moved off the gate and slit sightlines.
2. Bed: top is blown out and the book-stairs head is hidden behind pillow P2, so the south way down still cannot be found from the bed; move the lap strip or mark the pillow's south edge.
3. Bear descent now takes 25 hp unless crouch-walked (head to `6..14, 39..45`); plus the deferred stair camera ripple (`stepSmooth` 16).
