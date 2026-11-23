# Round 3 (match: train, bots, rules)

**Verdict (feel; the gate belongs to the bug tester): a full match is playable and mostly fair, but not yet fun.** Nobody got stuck and the train never needed a rescue in 60 matches. The bots spread over every lane and the perches, take cover, flank and retreat, and the train really is moving cover. Five things hold it back:
1. Rounds drag: 42 % run the full 2:30 and 10 % end in a replay.
2. Both sides walk into a long, open east-lane corridor and trade shots there in the first 20 s.
3. Recruit is about as deadly as Veteran at close range.
4. A bot that is shot in the back while it walks its route usually keeps walking.
5. Callouts are frequent and vague.

Each of these has a CONFIG or design change below; three were tried live.

How this was judged: headless through `window.__game` with fixed stepping. That covers 60 instrumented autoplay matches (20 per difficulty, seeds 100 to 119, 510 rounds, about 2,900 kills) sampled at 2 Hz for sightlines and behaviour. It also covers 18 extra `runMatch` games for state changes, 432 one-bot duels against the player, 168 rounds of the player standing at typical spots, live CONFIG trials over 48 matches, train boarding and tunnel trials, and frame sequences. Scripts are `tests/feel_r3_*.cjs` with helper `feel_r3_lib.js`; pictures are `screenshots/round3/feel_*.png`. No console errors in any run. `index.html` was not touched. Other testers' files were not read. I cannot hold a mouse: the duels measure what a bot does to a player who stands, crouches or strafes, not what a person does back.

## Summary for the fix list

| # | Problem | Evidence (short) | Change | Tried live |
| --- | --- | --- | --- | --- |
| 1 | Rounds drag; replays | 42 % of rounds reach 0:00, 10 % are replays, median round 140 s; 15 % of rounds have 40 s or more with no shot at all | `ai.holdUntil 40 -> 20`, `ai.huntLast 30 -> 60` | Yes: to-time 43 % -> 16 %, median 141 -> 104 s, replays 6 -> 2 per 96 rounds, 40 s silences 17 -> 11 |
| 2 | East-lane corridor trades in the first 20 s | 153 of 593 kills in the first 20 s are floor-to-floor east-side kills at over 50 u. Mostly rifles (73) and snipers (52), down the corridor x 81.4 to 85 between the tunnel wall and the chair legs. | Block the corridor at mid-lane: a toy box `81.4..85, 78.5..81.5`, h 2.5, routing the lane under the chair (new nodes about (84, 0, 75), (89, 0, 80), (84, 0, 85) replacing m.e.w) | Partly: a test collider cut these kills from 0.29 to 0.10 to 0.13 per round, but bots got stuck on the old edges (the nodes cannot be added live) |
| 3 | Recruit is too deadly up close | A Recruit rifle bot does 93 damage per second at 10 u (96 % of shots hit) and first hits 0.72 s after seeing you. That is about 1.8 s to kill a standing player. | `difficulty.recruit`: reaction 1.0, aimAcquire 7, aimSettled 3, settle 2.0, burst [2, 3], burstPause 0.9 | Yes: 51 dps at 10 u, 13 at 30 u, first hit at 1.0 s |
| 4 | Bots ignore being shot from behind while moving | Shot in the back from 15 u while advancing: only 3, 3 and 2 of 10 bots (Recruit / Regular / Veteran) turned on the player within 5 s; the rest kept walking. Gunfire behind: 4, 1, 2 of 10. Bots do not react to grenades at all. | In advance, push, flank and hunt, being hit or hearing a shot within 15 u should turn the bot to `heard` and start engage (or cover if low). Add a grenade dodge: a bot within the radius of a live grenade sprints away. | No (logic change) |
| 5 | Callouts are spammy and vague | 9.5 callouts per live minute. 17 % are "I'm hit", 14 % "Enemy down" and 13 % "I'm down". "Enemy east lane / west lane / centre" make up 35 % and do not say which half. | Drop "I'm hit" (the damage arcs and pips show it) or allow it once per life; add "near" / "far" (our half / their half) to lane callouts; `match.calloutGap 4 -> 6` for repeated sightings of the same enemy | No |

Also: Green won 38 of 60 matches (more below); spectating shows the spectated bot's own body; bots fire rifles and SMGs at ranges where they cannot hit.

## 1. Bots as opponents

### One bot against the player (`feel_r3_duel.cjs`, 16 trials per cell, rifle bot held at its spot, player not shooting)

Damage per second over an 8 s window, and the bot's own hit rate. The first hit came about one reaction time after the bot saw the player: Recruit 0.70 s, Regular 0.48 s, Veteran 0.47 s.

| | 10 u stand | 10 u strafe | 30 u stand | 30 u strafe | 30 u crouch | 60 u stand | 60 u strafe | 60 u crouch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recruit | 93 dps (96 %) | 84 (85 %) | 37 (35 %) | 14 (17 %) | 27 (23 %) | 11 (13 %) | 5 (6 %) | 0 |
| Regular | 106 (95 %) | 100 (90 %) | 52 (45 %) | 29 (27 %) | 44 (35 %) | 18 (17 %) | 12 (10 %) | 0 |
| Veteran | 136 (88 %) | 132 (85 %) | 48 (31 %) | 48 (39 %) | 38 (22 %) | 11 (9 %) | 14 (10 %) | 0 |
| Recruit, proposed | 51 (88 %) | 40 (64 %) | 13 (20 %) | 6 (14 %) | 11 (15 %) | | | |

- Recruit: a standing beginner dies in about 1.8 s at 10 u and 3.4 s at 30 u. A new player needs about 0.5 s to react, 0.5 s to put the crosshair on and 0.3 to 0.6 s to kill, so close fights are a coin toss. That is not "beatable by a beginner". With the proposed values it is about 3 s at 10 u.
- Veteran: 1.2 s to kill at 10 u and about 2.6 s at 30 u, with 31 to 39 % of shots hitting at 30 u. That is a real challenge without looking like an aimbot. Keep it.
- Regular sits in between, and at 30 u it is slightly deadlier than Veteran standing (52 against 48 dps). Veteran always strafes, and its own movement multiplies its aim error by 1.5. That is fine, but it means the presets differ less than the table suggests. Consider `ai.movingMult 1.5 -> 1.3`.
- Crouching at 60 u was never hit on any difficulty: only the head shows, and the bot switches to cover. Strafing halves the damage at 30 u on Recruit and Regular, so the player has real tools.
- 100 u: no clear floor line of that length was found, so long range is covered by the match data below (17 % of kills are at 80 u or more, mostly snipers).

### Player standing at typical spots from live start, not shooting (`feel_r3_exposure.cjs`, 4 seeds per cell)

Median seconds to the first hit, and in how many of the 4 rounds the player was hit within 60 s.

| Spot | Recruit | Regular | Veteran |
| --- | --- | --- | --- |
| West lane (40, 60) | 8.2 s, 4 of 4 | 7.5 s, 4 of 4 | 5.0 s, 4 of 4 |
| East lane (83, 60) | 10.8 s, 4 of 4 | 10.6 s, 4 of 4 | 11.4 s, 4 of 4 |
| Ruin top | 35 s, 4 of 4 (heaviest damage) | 12 s, 3 of 4 | 34 s, 4 of 4 |
| Desk north | 19 s, 3 of 4 | 28 s, 1 of 4 | 45 s, 1 of 4 |
| Small shelf L2 | 34 s, 3 of 4 | 16 s, 4 of 4 | 18 s, 4 of 4 |
| Fort gate | 51 s, 2 of 4 | 47 s, 4 of 4 | 39 s, 2 of 4 |
| Bed top north (27, 18, 60) | never | never | 58 s, 1 of 4 |

- Contact comes quickly: in the west lane within 5 to 8 s of live, because the west holds n.w.5 and s.w.5 are only 10 units apart, and the east holds are 28 units apart with a clear line.
- The north end of the bed top is close to untouchable: the player was hit once in 12 rounds. Whether the player can do damage from there was not measured. Watch it as a camping spot.

### Reactions (`feel_r3_duel.cjs`, bot 15 u away facing away from the player, only trials where it had not seen the player)

| Out of 10 | Shot in the back: turned on the player within 5 s | Gunfire behind (missed shot) | Grenade landing behind |
| --- | --- | --- | --- |
| Recruit | 3 (3 hit back, median 3.2 s) | 4 | 3 |
| Regular | 3 (3, 3.0 s) | 1 | 1 |
| Veteran | 2 (1, 2.7 s) | 2 | 2 |

All 90 bots kept moving along their route. In the code a hit sets the bot's `heard` and `threat`, but only the hold and retreat states look at `heard`. Against a human this will read as dumb: you can follow a bot and shoot it twice before it turns. See fix 4.

## 2. Do bots look robotic?

State changes per round per difficulty (`feel_r3_states.cjs`, 18 matches, from `botLog`):

| Per round | engage | advance | hold | flank | cover | hunt | retreat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recruit | 33 | 26 | 8 | 7.7 | 7.2 | 5.5 | 1.9 |
| Regular | 44 | 40 | 9 | 8.3 | 5.8 | 4.9 | 2.6 |
| Veteran | 52 | 48 | 9 | 8.5 | 5.5 | 4.9 | 2.1 |

- Good: every tactic in the spec is used: cover with peeking, flanks (about 8 per round), retreats and hunts. In the samples, bots spend 14 to 24 % of their time on the bed, desk or shelves and 14 to 19 % crouched. Lanes are spread: west 22 to 25 %, centre 38 to 39 %, east 18 to 22 %, high ground 18 %. There were no stuck entries and no train rescues.
- Robotic tells:
  - **Engage and advance flip back and forth.** The median spell in advance between engagements is 1.2 to 2.1 s, and a bot drops its target after 1.5 s out of sight (`ai.lostAfter`). On screen that is stop, fire, walk, stop. Try `ai.lostAfter 1.5 -> 3` with a short walk toward the last seen position.
  - **Retreats are long.** The median is 22 to 24 s crouched in one spot (`retreatCalm` 8 s with no damage, and the timer resets on every hit). Try `ai.retreatCalm 8 -> 5`.
  - **Bots fire far beyond their weapon's useful range.** Shots hit only 7 to 9 % of the time, and 61 % of kills happen at 40 u or more. An SMG bot holding the trigger at 60 u looks like a bot. Suggested per-weapon engage limit: SMG 40, pistol 50, rifle 90. Beyond it the bot advances to cover instead of firing. Untested.
- Frames (`feel_cmp_fight_*.png`, `feel_cmp_watch_*.png`): at the ranges fights happen, soldiers are about 15 to 25 px tall. I could see Tan soldiers rise over the ruin walls to fire and drop again, and tracer streams, but not judge walk or crouch animation quality. A human should watch a few rounds at Regular in spectate mode.

## 3. Pacing (60 matches, 510 rounds; `feel_r3_matches.cjs`, `feel_r3_analyse.cjs`)

| | Recruit | Regular | Veteran |
| --- | --- | --- | --- |
| Rounds ending at 0:00 (time or replay) | 49 % | 39 % | 37 % |
| Replays | 16 of 172 | 17 of 166 | 17 of 172 |
| Median round length | 150 s | 138 s | 130 s |
| First engagement / first kill (median) | 6.4 / 15.9 s | 3.4 / 13.2 s | 2.9 / 14.3 s |
| Rounds with a 40 s+ stretch without a single shot | 11 % | 20 % | 12 % |
| Hit rate (all shots) | 7 % | 9 % | 9 % |
| Kills per match by grenade / rides per match | 0.4 / 0.8 | 2.1 / 0.6 | 2.4 / 0.5 |

Kills by time into the round (all difficulties): 0 to 15 s 325; 15 to 30 s 700; 30 to 40 s 449; 40 to 60 s 608; 60 to 90 s 411; 90 to 120 s 163; 120 to 150 s 235. Fights are front-loaded: after 60 s the survivors lose each other, and only the 30 s hunt brings them back. In rounds that ran to time, 49 of 212 had no kill after 60 s, and the median last kill was at 92 s.

Tried live, Regular, same 12 seeds (`feel_r3_trials.cjs`):

| Variant | Rounds | Median length | To time | Replays | First kill | 40 s+ silences |
| --- | --- | --- | --- | --- | --- | --- |
| Now | 96 | 141 s | 43 % | 6 | 14.5 s | 17 |
| `holdUntil 20`, `huntLast 60` | 92 | 104 s | 16 % | 2 | 14.7 s | 11 |

- Change: `ai.holdUntil 40 -> 20`, `ai.huntLast 30 -> 60`. Rounds then mostly end by elimination in under two minutes. If replays still annoy, decide an equal count at 0:00 by total health at once instead of replaying (16.5 already does that after three replays).
- The low hit rate is mostly range, not aim: the median kill distance is 48 u. I would not raise bot accuracy; the engage-range limit in section 2 and the earlier push will shorten fights more honestly.

## 4. The train as a feature

- **It is real moving cover.** In 1.03 million enemy-pair samples within 120 u, 81 % were blocked by static geometry, 11 % were clear and 8 % were blocked by the train. Of the lines that no static geometry blocks, the train blocks 43 % (33 % on Recruit, 54 % on Veteran). In `feel_cmp_watch_gate.png` the train closes the whole gate-to-ruin view for several seconds each lap. 17 % of kills happen with the killer or victim within 9 u of a car.
- **Bots almost never ride.** 0.6 rides per match from 2.6 attempts; riding bots were 0 % of samples. Fine as a tactic, but nobody will learn from the bots that riding exists. Raise `ai.rideChance 0.35 -> 0.6` for Centre and let a bot also take the ride when its wait is under 8 s (`ai.rideMaxWait 6 -> 8`). Untested.
- **Boarding for the player** (`feel_r3_ride.cjs`): running at the track from 2.5 u off the rail centre and jumping, the flatbed was boarded at 13 of 17 timing offsets, a window of about 3 s, so it is learnable. The gondola worked at 3 of 17 (about 0.75 s, through the door gap). From 4.5 u out the jump never reaches the deck. That is the trap a player will hit: standing back from the train feels safe. A deck stripe or a short "step" plate along the straights would show where to jump from (round 4 art).
- **Tunnel:** standing on a boxcar roof you are scraped off 3 s in and land on the floor at x 79.4 with no damage. Crouched on the boxcar or caboose roof, or on a deck, you ride through. It matches the spec and is fair. Whether the scrape is a surprise needs a human; a low "duck" sign on the tunnel mouth would help.
- **Riding view** (`feel_cmp_ride.png`): on the gondola you see mostly the car walls and the cargo ahead, a covered ride with a view over the side, which is good. There is little to shoot from it at the deck's eye height.
- **Whistle:** it blows every 27.1 s, alternating west and east straight, when the engine passes z 80. It is a reliable rhythm (the train is deterministic), but both whistles sound the same, so it does not tell you which side the train is on. Suggested: a lower pitch on the east straight, or pan it. I cannot judge loudness in the room.

## 5. Map fairness with bots

- Matches: Green 38, Tan 22 over 60 (Recruit 14 to 6, Regular 14 to 6, Veteran 10 to 10). Rounds: Green 253, Tan 207 (elimination rounds 167 to 131, time-decided 86 to 76). On seeds 100 to 111 at Regular the baseline was 11 to 1. This is not only the autoplayed player: Green bots average 5.7 to 5.9 kills per match against Tan's 5.2 on Recruit and Regular. A 38 to 22 split has about a 3 % chance under an even map, so it needs a check on 100+ seeds before blaming the map. The builder measured 22 to 20.
- By lane (kills by the victim's lane, Green kills / Tan kills): west 452 / 368 (Green's lane), centre 437 / 419, east 404 / 387, bed 92 / 112 (Tan's), desk 41 / 68 (Tan's), shelves 68 / 43 (Green's). Tan's Centre and East roles kill more (348 and 330 against 261 and 248), but Green wins the west by a wider margin.
- **East-side long lane, confirmed, but it is a floor corridor more than a sniper lane.** Of kills in the first 20 s, 153 of 593 are floor-to-floor kills on the east side at over 50 u (rifle 73, sniper 52, SMG 28; Tan 91, Green 62). Shooters and victims stand at x 81 to 100, 94 % on the floor. Typical pairs are (84, 0, 114) to (85, 0, 46) and (92, 0, 129) to (92, 0, 31). The line runs between the tunnel's east wall (x 80.4 to 81.4, z 68 to 92) and the chair legs (x 85), which leave a 3.6-wide corridor open from fort to fort. The skateboard (z 50 to 73) and the chair book stairs (z 87 to 100) close everything east of x 86.
  - Fix: close the corridor at the midline with a toy box `81.4..85, 78.5..81.5`, h 2.5, and route the lane under the chair seat (open between the legs at z 74.2 to 85.8). Add nodes at about (84, 0, 75), (89, 0, 80) and (84, 0, 85) to replace m.e.w (83.2, 0, 80).
  - Tried as a test collider with m.e.w moved to x 88.5: early long east kills dropped from 0.29 to 0.10 to 0.13 per round. But 462 stuck entries appeared, because the two old edges now clip chair leg 0 and the book stairs (`validateWaypoints` flags both). So the result is indicative; the builder must add the nodes.
  - Cheaper alternative: give the East and High roles a hold node out of the corridor line (n.e.5 (100, 0, 66) / s.e.5) and make the High role path to the desk avoid the x 81 to 85 floor.

## 6. Round flow (`feel_cmp_flow.png`)

- **Freeze (5 s):** the picker is clear: three boxes with 1 / 2 / 3, a one-word role ("all-round", "close range", "long range") and a big countdown. Five seconds is enough to choose; spawn view is your own fort wall, which is fine here.
- **Death:** the camera tips with the body to the floor with "Eliminated", clear and short (1.5 s).
- **Spectating has a bug that matters for feel:** the spectated bot's own body is drawn in front of the camera. A tall green slab fills a third of the screen and the green base covers the bottom (`feel_flow_03_spectate.png`). Hide the spectated soldier's own model. The HUD then shows that bot's ammo (once "0 / 0" for a rifle, `feel_flow_04_roundend.png`), which is right if it is out of ammo but looks like a bug. Label it as the bot's.
- **Round end (4 s):** "TAN WINS THE ROUND / More soldiers standing at 0:00 / GREEN 0 - 1 TAN" is clear and gives the reason.
- **Match end:** winner, score and a kills / deaths table for all ten soldiers, with Enter rematch and Esc title. Clear. Rematch speed was not timed.
- **Spawn:** the first deaths can come within 15 s (see section 3), so nobody is killed before they can move. There is no spawn trap.

## 7. Callouts (`feel_r3_analyse.cjs`, 9,865 callouts)

- **Correct:** the region named matched a living Tan's real position in 100 % of enemy callouts, except 6 posted just as the enemy moved or died.
- **Not very useful:**
  - "Enemy east lane", "Enemy west lane" and "Enemy centre" are 35 % of all callouts. They cover a whole lane from fort to fort, so they do not say near or far.
  - "I'm hit" is the single most common callout (1,679). Together with "I'm down" and "Enemy down", status messages are 44 %.
  - At 9.5 per live minute, the list is rarely empty.
  - From the bed top, three callouts at once were common in the first 20 s (`feel_cmp_watch_bedtop.png`).
- Changes:
  - Drop "I'm hit", or allow it once per life.
  - Lane callouts get "our side" / "their side" from z: for example "Enemy east lane, our side".
  - The same bot does not repeat the same region within 8 s.
  - `calloutMax 3 -> 2`.

## 8. Only a human can confirm

- Whether a bot fight is readable and fair under a mouse: who shot you, from where, and whether the damage arcs are enough.
- Whether bots look natural moving and peeking at normal range; my frames show them too small to judge.
- Whether the tunnel scrape and the whistle are learnable without being told.
- How the north end of the bed top plays as a camping spot.

---

# Round 2 (gunplay)

**Gate "every weapon is satisfying within 10 seconds and clearly different": FAIL.** Rifle, sniper and pistol pass on the evidence; the SMG and the grenade do not. The SMG has no range at which it beats the rifle, and the grenade cannot kill a full-health target and bursts as a puff about one unit wide for a seven-unit blast. Both are number-and-effect fixes, not redesigns.

| Weapon | Verdict | Why |
| --- | --- | --- |
| Rifle | **PASS** | Clear cadence, strong feedback, rewards bursts and taps. Too good up close (it is also the best close-range gun). |
| SMG | **FAIL** | Slower to kill than the rifle at 10 units (0.40 s against 0.30 s) and at every range beyond; useless past 20. Its shot is also the quietest sound in the fight. |
| Sniper | **PASS** | Unmistakably different: one scoped head shot at any range, 1.3 s bolt rhythm, big kick, and climbing pays. Targets get small and pale past 120 units. |
| Pistol | **PASS, with a flaw** | A proper sidearm at 10 to 30 units. But fired at a steady pace it out-ranges the rifle past about 110 units. |
| Grenade | **FAIL** | Arc preview is accurate and the fuse is fair, but the best measured hit was 87 damage, the burst is tiny, and it cannot reach any perch. |

How this was judged: headless through `window.__game` with fixed stepping; over 10,000 scripted engagements against the dummies with the game's own spread and recoil; frame-by-frame captures; every sound rendered offline from the game's own layer table and measured. Scripts are `tests/feel_r2_*.cjs`, pictures `screenshots/round2/feel_*.png`. No console errors in any run. `index.html` was not touched. Other testers' files were not read.

Two things the numbers below cannot settle: whether the shots have punch (needs ears), and whether the recoil is pleasant to control (needs a mouse). Both are flagged where they matter.

## 1. Time to kill

Median seconds from first shot to the dummy tipping over, 30 trials per cell, perfect aim put back on the target every tick, so recoil control is assumed and spread is real (`feel_r2_ttk.cjs`, `feel_r2_long.cjs`). "--" means no kill inside 6 s. Long-range rows are from perches.

Body shots, standing:

| | 10 u | 30 u | 60 u | 86 to 99 u | 121 to 138 u |
| --- | --- | --- | --- | --- | --- |
| Rifle, held | 0.30 | 0.60 | 2.40 (40 % kill) | | |
| Rifle, 3-shot bursts | 0.53 | 0.63 | 0.73 | 1.7 to 2.8 | 3.4 to 4.3 (75 % kill) |
| Rifle, taps | 0.70 | 0.70 | 0.70 | 1.4 to 2.1 | 2.3 to 3.5 |
| SMG, held | 0.40 | 2.33 (20 % kill) | -- | | |
| SMG, 5-shot bursts | 0.65 | 1.82 | -- | -- | -- |
| Pistol, fastest clicking | 0.55 | 3.43 | 3.45 (53 % kill) | | |
| Pistol, paced | 1.20 | 1.20 | 1.20 | 1.6 to 2.0 | 2.0 to 2.4 |
| Sniper, scoped | 1.30 | 1.30 | 1.30 | 1.30 | 1.30 |
| Sniper, unscoped | 1.30 | 3.90 (7 % kill) | 2.60 (10 % kill) | | |

Other stances and zones:

- Head shots: scoped sniper kills in one shot at every range tested (10 to 138 units, 100 %). Rifle taps to the head 0.23 s at 10 and 30 units, 1.17 s at 60. Paced pistol 0.40 s at 10 and 30, 0.80 s at 60. SMG held 0.27 s at 10, 7 % kills at 30.
- Crouching (spread x0.6) is a large help: rifle held at 60 units goes from 40 % to 100 % kills in 0.40 s; SMG bursts at 30 go from 1.82 s to 1.23 s.
- Strafing (spread x1.5): rifle held at 10 units is unchanged at 0.30 s; SMG held at 10 gets worse, 0.60 s with 69 % of shots hitting. Rifle taps still kill at 60 units in 0.93 s. SMG held cannot kill at 30 while moving (5-shot bursts: 60 % kills, 3.0 s).
- No recoil control at all (aim once, hold): everything still kills at 10 units; at 30 units the rifle manages 47 %, pistol 17 %, SMG 0 %.

Who is best where:

| Range | Clearly best | Clearly wrong |
| --- | --- | --- |
| 0 to 15 u | Rifle (should be the SMG) | Unscoped sniper for anyone who misses the first shot |
| 15 to 60 u | Rifle, in bursts or taps | SMG |
| 60 to 100 u | Sniper for heads; rifle taps for bodies | SMG, pistol spam |
| 100 u and beyond | Sniper | SMG; and the rifle is slower here than the paced pistol |

## 2. Findings, most harmful first

### 1. The SMG has no job (gate)
- Evidence: table above. 16 damage at 900 rpm is 240 damage per second against the rifle's 260, with nearly three times the base spread (1.4 against 0.5 degrees), faster bloom to a wider maximum, and falloff starting at 25 units. Standing or strafing, at 10 or 20 units, the rifle kills sooner (`feel_r2_trials.cjs`, block A: rifle 0.30 s at 10 and 20 units, moving or not; SMG 0.40 / 0.53 s at 10 and 1.00 / 1.47 s at 20).
- Tried live through `__game.CONFIG`:

| SMG setting | 10 u stand | 10 u strafe | 20 u stand | 20 u strafe | 30 u bursts |
| --- | --- | --- | --- | --- | --- |
| Now | 0.40 | 0.53 | 1.00 | 1.47 (57 % kill) | 1.95 |
| damage 20 | 0.27 | 0.27 | 0.33 | 1.20 | 1.43 |
| damage 20, spread 1.0, bloom 0.20, spreadMax 3.5 | 0.27 | 0.27 | 0.27 | 0.47 | 1.13 |
| Rifle for reference | 0.30 | 0.30 | 0.30 | 0.30 | 0.63 |

- Change: `weapons.smg.damage 16 -> 20`, `spread 1.4 -> 1.0`, `bloom 0.30 -> 0.20`, `spreadMax 4.5 -> 3.5`. That makes it the fastest gun to 20 units standing and still clearly wrong at 30 and beyond. It is still behind the rifle while strafing at 20 units because the moving multiplier (1.5) is shared; to give the SMG its natural role, add a per-weapon moving multiplier (SMG 1.1, rifle 1.8, sniper 2.0) in place of the single `gun.spreadMult.move`. The second half is a small code change and is untested.

### 2. The grenade does not pay off (gate)
- It cannot kill a full-health target on level ground. Damage is 110 x (1 - distance / 7) measured to a point 0.9 above the target's feet from 0.1 above the burst, so the ceiling is 97. Measured: thrown level from 12 and 15 units it burst 1.8 and 1.2 units from the dummy for 79 and 87 damage; 4.2 to 4.8 units away gave 43 and 33 (`feel_r2_grenade.cjs`).
- The burst is far smaller than the blast. Seen from 9 units to the side it is a scatter of dots about one unit across that is gone in a quarter of a second (`feel_cmp_burst.png`); the damage radius is 7. A player cannot learn the radius from what they see, and it does not look like the strongest thing in the game.
- The arc preview is accurate (the line ends where the grenade comes to rest and bursts: `feel_cmp_grenade_level.png`, `_bounce_wall.png`, `_at_dummy.png`) but it is a one-pixel line with no landing marker, hard to pick out against the floor.
- It cannot reach high ground. At speed 18 the highest it rises is 8.7 units (75 degree lob); the tunnel top is 8, the chair 17, the bed 18, the desk 26. Every lob at the bed, desk, chair and tunnel top landed back on the floor. Tried `grenade.speed` 24 and 30: 24 still misses the tunnel top, 30 reaches it but overshoots the level throw (0 damage at 12 and 15 units) (`feel_r2_misc.cjs`).
- What works: fuse 1.98 s from release, holding does not cook it; three bounces with a sound each, at rest about 1.1 s after a level throw; level carry 13.8 units, 25.4 at 35 degrees; a wall blocks the blast (dummy behind the Tan slit took 0); self-damage is real (88 at your feet, 62 off a wall 2 units ahead, 68 straight up, 0 for a normal throw); you can fire 0.03 s after throwing.
- Change: `grenade.damage 110 -> 140` (tried live: 100 and 111 at those same two throws, so a good throw kills and a near miss does 55 to 70). Make the burst read at its real size: a flash or ring that expands to about half the radius, and at least `burstParticles 44 -> 90` with particle speed about 18 instead of the 9 in code. Draw the arc thicker with a dot where it ends. Leave the speed at 18 and accept that grenades are a floor and downhill tool; that is a design choice for the lead, and it makes perches safer than they already are.

### 3. Recoil never comes all the way back (gun feel)
- What: each shot kicks the view up and only 60 % returns. A single rifle tap leaves the aim 0.36 degrees high, a 3-round burst 1.08 degrees, a full magazine 10.8 degrees after resting (12.1 at the last shot). SMG 8.8 degrees after a magazine, pistol 6.7 after 12 shots, sniper 1.4 per shot (`feel_r2_handling.cjs`).
- Why it hurts: tapping is the right way to use the rifle at range, and the game walks the aim off the target between taps. At 60 units the third uncorrected tap is already over the dummy's head. Measured with no correction by the player (`feel_r2_trials.cjs`, block B): rifle taps at 60 units kill 43 % of the time, 3-round bursts at 30 units 83 %.
- Tried live: `gun.recoilReturn` 0.8 gives 93 % and 100 % for those two; 1.0 gives 100 % and 100 %.
- Change: `gun.recoilReturn 0.6 -> 0.8`. Sustained fire still climbs (the kick is unchanged), bursts and taps come back near where they started. Whether the remaining climb feels good needs a mouse.

### 4. The pistol out-ranges the rifle, and punishes its own fire rate (gun feel)
- Out-ranging: pistol base spread 0.35 degrees is tighter than the rifle's 0.5 and its falloff floor is the same 70 %. Paced pistol against rifle taps, body shots from perches: 2.0 s against 1.4 s at 96 units, 2.0 s against 2.3 s at 121, 2.0 s against 3.5 s at 135, 2.4 s against 3.5 s at 138, with twice the hit rate (61 to 72 % against 31 to 39 %).
- Fire rate: bloom is 0.9 per shot with a 0.25 s recovery delay, and the minimum interval is 0.18 s, so clicking fast never lets it recover: spread is 2.15 degrees on the third shot and at the 3.0 maximum from the fourth. Fast clicking hits 28 % at 30 units. The useful pace is one shot every 0.4 s, less than half the advertised rate.
- Tried live (`feel_r2_trials.cjs`, block C): `spread 0.6, bloom 0.6, recoverDelay 0.12, falloff [30, 70, 0.5]` gives fast clicking 0.73 s at 30 units (78 % hits), paced 0.70 s at 30 and 1.40 s at 60 against the rifle's 0.70 s at 60.
- Change: those four pistol values. It stays the best thing to pull out when the primary is empty and stops being a long gun.

### 5. Sound levels: the SMG is nearly silent, the sniper can clip, some footsteps are inaudible (gate, needs ears)
All four shots are measurably different, rendered offline from `CONFIG.audio.sounds` with the same graph the game builds (`feel_r2_audio.cjs`):

| Shot | Length | Loudness (50 ms rms) | Peak | Spectral centre | Below 300 Hz | Above 3 kHz |
| --- | --- | --- | --- | --- | --- | --- |
| Rifle | 86 ms | 0.169 | 0.83 | 1.5 kHz | 37 % | 14 % |
| SMG | 36 ms | 0.056 | 0.40 | 1.9 kHz | 16 % | 23 % |
| Sniper | 439 ms | 0.557 | 1.96 | 120 Hz | 96 % | 0 % |
| Pistol | 46 ms | 0.163 | 1.06 | 9.7 kHz | 4 % | 79 % |

- SMG: about 10 dB under the rifle and quieter than the hit tick that plays on the same tick (0.067). On a hit, the tick is the louder sound. Change: SMG layer gains `0.55 -> 0.9` and `0.3 -> 0.5`.
- Sniper: raw peak 1.96 is 0.98 after the 0.5 master, and a kill tone (0.34 raw) on the same tick takes it over full scale with nothing to limit it. Change: sniper layer gains `1.0 -> 0.8` and `0.9 -> 0.7`, or put a compressor before the output.
- Pistol: 79 % of its energy is above 3 kHz and 4 % below 300 Hz. On paper that is a hiss with no body. Suggested: add a short low layer (square 180 to 70 Hz, 0.05 s, gain 0.4). A human ear has to decide.
- Footsteps: wood 0.043, metal 0.036, plastic 0.018, card 0.009, book 0.008, fabric 0.004; jump 0.007. Fabric, book and card steps are 13 to 20 dB under wood and will not be heard, which matters on the bed, stairs and tunnel. Change: fabric gain `0.2 -> 0.8`, book `0.22 -> 0.7`, card `0.25 -> 0.7`, jump `0.15 -> 0.5`.
- Order and timing are right: every shot has its sound on the same tick; hit or kill follows on that tick; shot gaps are 0.100, 0.067, 0.183 and 1.300 s; bolt at 0.42 s after each sniper shot; dry click and reload start together; wood steps every 0.35 s at a sprint.

### 6. Holding the trigger through an empty magazine does nothing (gun feel)
- With the rifle, holding fire past the 30th shot gives no click and no reload; it stays silent until the button is released and pressed again (`feel_r2_handling.cjs`, "holdThroughEmpty rifle": never resumed in 7 s). The pistol reloads because it is clicked. This is the spec as written ("on a fire press") but it will read as a jam.
- Change: on an automatic weapon, play the dry click and start the reload on the tick the magazine empties while fire is held.

### 7. Sniper at extreme range: small, pale targets (pillar 5)
- Climbing does pay: from the fort gate 2 of 21 dummies are in view; from the desk edges 11 and 12, bed east edge 14, tall shelf top 11 (eight of them beyond 80 units), small shelf top 12, fort tower 11 (`feel_r2_long.cjs`). Scoped shots from all of them killed 100 % of the time, body in 1.3 s, head at once.
- At 135 units through the 25 degree scope a dummy is about 10 by 22 pixels at 720p and washed toward the haze colour (`feel_long_tallshelf_135u_scoped.png`); at 99 units a Tan dummy against the floor is readable but small (`feel_long_tower_99u_scoped.png`). Green holds up better against the haze than Tan will.
- Tried `scopeFov` 18: the same dummy is about 40 % larger and easier to pick out (`feel_cmp_scope_fov.png`).
- Change: `weapons.sniper.scopeFov 25 -> 20`. Scoped sensitivity scales with it automatically.

### 8. Smaller things
- Tracers start at one fixed point ahead of the eye for every gun. It lines up with the rifle's muzzle; for the SMG, pistol and sniper the tracer begins away from the muzzle flash (`feel_cmp_flash.png`).
- All four tracers look the same. A thicker, longer-lived sniper tracer (width 0.035 to 0.07, life 0.08 to 0.2) would help it read as the heavy shot.
- Wood chips are brown on a brown floor and nearly invisible (`feel_cmp_impacts.png`, first frame); fabric, book, card, plastic and metal read fine.
- The rifle is at full spread (3.0 degrees) by the eighth shot of a spray and the pistol by its fourth. That is what makes bursts matter and is fine for the rifle; see finding 4 for the pistol.
- Round 1 item still open: the head of the bed book stairs is still hidden behind pillow P2 from the bed (`feel_cmp_r1_leftovers.png`, bottom middle).

## 3. What already works (do not break)

- Cadence is exact: 600, 900 and 327 rpm and a 1.3 s bolt, to the tick.
- The crosshair gap is the true spread radius in pixels in every stance (rifle 4.1 px standing, 3 crouched, 6.1 moving, 12.3 in the air, 24.6 at full bloom; SMG 11.5 to 36.9). Shots land inside it by construction.
- The hit is unmistakable at 10 units: white X on the crosshair, a damage number over the target, plastic sparks, and a tick. The kill is distinct: larger red X, red number, chips, a different longer tone, and the dummy tips flat within a quarter of a second (`feel_cmp_closeups.png`, `feel_cmp_kill.png`).
- Muzzle flash is there for two drawn frames on all four guns, with a casing and a tracer (`feel_cmp_flash.png`). Note for anyone capturing it headless: the page's own draw loop uses up the two frames between hook calls, so `feel_r2_flash.cjs` stops that loop on the test side to see them.
- The four guns are distinct in the hand: long rifle with a yellow magazine, stubby SMG with a yellow muzzle, long sniper with a scope block, small pistol (`feel_cmp_viewmodels.png`). The sniper's view kick is visibly the largest (`feel_cmp_shot_sniper.png`).
- Movement interplay is snappy: firing is blocked while sprinting and on a string, and the first shot comes one tick (0.017 s) after letting go of sprint, at moving spread. Switch to first shot: pistol 0.27 s, SMG 0.37 s, rifle 0.47 s, sniper 0.70 s. Reloads 2.2, 2.0, 1.4 and 3.0 s as specified; switching cancels a reload; a full magazine ignores R.
- Sniper handling: scope in 0.2 s and out 0.2 s; after a shot the scope is half down by 0.1 s and fully back at 0.7 s; next shot at 1.28 s, scoped; scoped spread 0.05 degrees; scoped sensitivity is one third of normal, matching the zoom.
- Round 1 leftovers: the crayons no longer mask the firing slits (both slits show the lane and its dummies); the bed top is blanket blue with the pillows clearly separate; the bear descent is free again at a walk and at a sprint (0 damage, 4.6 and 5.2 s) (`feel_cmp_r1_leftovers.png`, `feel_r2_misc.cjs`).

## 4. Only a human can confirm

- Punch: whether each shot sounds and feels strong. The measurements say distinct, not good.
- Recoil under the hand: the test players either correct perfectly or not at all. Real control sits between, so real times to kill sit between the two sets of numbers.
- Whether the screen shake (rifle 0.004, sniper 0.022) and viewmodel kick are felt or just seen.
- Scoped tracking at one-third sensitivity, and whether the 0.5 s scope drop after each shot is rhythm or annoyance.
- Whether 0.30 s to kill at close range is too fast to react to once bots shoot back.

## Round 2 re-check

**Gate "every weapon is satisfying within 10 seconds and clearly different": PASS, narrowly.** The grenade now pays off and reads at its true size, recoil comes back, the pistol is a sidearm again and the automatics reload when held through empty. The narrow part is the SMG: it now beats the rifle at 10 and 20 units, standing and strafing, as the fix list asked, but only by one or two ticks (0.27 s against 0.30 s), and the rifle still wins with head aim. It is clearly different in the hand and on screen. It is not yet clearly the better pick. One CONFIG number fixes that (finding 1).

| Weapon | Verdict | Why |
| --- | --- | --- |
| Rifle | **PASS** | Best from 30 to 120 units. Taps now stay on target: no-correction taps at 60 u kill 88 % (was 43 %). Still the best gun with head aim at close range (0.10 s). |
| SMG | **PASS, narrowly** | Fastest body kill at 10 and 20 u, standing (0.27 against 0.30 s) and strafing (0.27 / 0.33 against 0.30 / 0.40 s). Loses from 30 u on and is useless past 40. The lead is 33 ms, too small to feel. |
| Sniper | **PASS** | Scoped 0.05 degrees still or crouched, 1.5 moving, 4.0 in the air (hit rate at 60 u: 100 / 25 / 3 %). Fov 20. Bolt 1.28 to 1.30 s and switching does not shorten it. One head shot at any range from every perch. |
| Pistol | **PASS** | Fast clicking at 30 u kills in 0.73 s (was 3.43 s). Past 85 u it takes 4.2 to 5.6 s against the rifle's 1.2 to 3.5 s, so it no longer out-ranges the rifle. |
| Grenade | **PASS** | A burst within about 1.8 units of a dummy kills it (up to 123 damage). A near miss does 50 to 100. The flash dome grows to the blast radius, is clear at 14 and 40 units, and the arc preview is a thick dotted line with a landing dot that ends where the grenade stops. |

How this was judged: headless through `window.__game` with fixed stepping and the game's own seeded spread and recoil. About 9,000 scripted engagements (40 trials per cell for time to kill, 30 per long-range cell, 825 real grenade throws), every first-pass measurement re-run, frame captures of every weapon and the grenade, and every sound rendered offline from `CONFIG.audio.sounds`, alone and in same-tick mixes. Scripts are `tests/feel_r2b_*.cjs` (`ttk`, `trials`, `handling`, `extras`, `long`, `sniper`, `grenade`, `frames`, `flash`, `audio`, `mix`; helper `feel_r2b_lib.js`). Pictures are `screenshots/round2/feel_re_*.png`. No console errors in any run. `index.html` was not touched.

### First-pass findings: status

| # | First-pass finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | SMG has no job | **Partly fixed** | Wins at 10 and 20 u by 0.03 to 0.07 s and loses from 30 u on. Rifle head aim still wins at 10 u (0.10 against 0.13 s). |
| 2 | Grenade cannot kill; burst tiny; thin arc | **Fixed** | 145 of 825 throws killed; best throws 123 damage; dome reaches the radius (`feel_re_cmp_burst_14u.png`, `_40u.png`, `_dummy.png`); arc shown as dots plus a landing dot (`feel_re_cmp_grenade_*.png`). Throws still cannot reach high ground (lead's decision, not re-tested). |
| 3 | Recoil never comes back | **Fixed** | After one rifle tap the aim settles 0.18 degrees high (was 0.36), after a 3-round burst 0.54 (was 1.08), after a full magazine 5.4 (was 10.8). SMG magazine 4.4, pistol 12 shots 3.4. |
| 4 | Pistol out-ranges rifle; fast clicking useless | **Fixed** | See the table above. Bloom is 1.33 degrees after 12 fast shots (was at 3.0 from shot 4). |
| 5 | Sound levels | **Partly fixed** | SMG -5.5 dB under the rifle on one shot and -4 dB over a second of fire (was -10 dB). Sniper plus kill peaks at 0.97 of full scale, so it does not clip but has 0.3 dB of headroom. Fabric steps are -9 dB under wood (was -20). Pistol still 79 % above 3 kHz; jump still 0.007. |
| 6 | Hold through empty does nothing | **Fixed** | Rifle and SMG play one `dry` and the reload on the tick after the last round, then fire again with fire still held (rifle 2.30 s, SMG 2.07 s). |
| 7 | Small, pale far targets | **Fixed** (scope fov 20) | `feel_re_long_tallshelf_135u_scoped.png`: the green dummy at 135 u is small but picks out. The Tan dummy at 96 u reads well against the fort (`feel_re_long_desk_96u_scoped.png`). |
| 8a | Tracers start at one fixed point | **Not fixed** (not on the fix list) | `feel_re_cmp_shot_sniper.png`: the sniper tracer starts below and left of its muzzle flash and crosses in front of the barrel. |
| 8b | All tracers look the same | **Not fixed** (not on the fix list) | Same width and life for all four guns. |
| 8c | Wood chips invisible on the floor | **Fixed** | Pale chips show clearly on the planks (`feel_re_cmp_impacts.png`, top left). |
| 8d | Muzzle flash detached from the muzzle | **Fixed** | The flash sits on each gun's own muzzle for 3 ticks (`feel_re_cmp_flash.png`). |

### Time to kill (body, 100 hp, median s, 40 trials; `feel_r2b_ttk.cjs`)

Perfect re-aim every tick (recoil fully controlled, spread real). Each cell is the median, with kill % added where it is under 100.

| Standing | 10 u | 20 u | 30 u | 40 u | 60 u |
| --- | --- | --- | --- | --- | --- |
| Rifle held | 0.30 | 0.30 | 0.60 | 1.40 (88 %) | 2.30 (88 %) |
| Rifle 3-shot bursts | 0.53 | 0.53 | 0.63 | 1.07 | 1.07 |
| Rifle taps | 0.70 | 0.70 | 0.70 | 0.93 | 0.70 |
| SMG held | **0.27** | **0.27** | 1.60 | 5.25 (55 %) | (10 %) |
| SMG 5-shot bursts | **0.27** | **0.27** | 1.07 | 2.13 | 3.27 (63 %) |
| Pistol fastest clicking | 0.55 | 0.55 | 0.73 | 0.92 | 3.43 |
| Pistol paced | 0.70 | 0.70 | 0.70 | 0.93 | 1.63 |

| Strafing | 10 u | 20 u | 30 u | 40 u | 60 u |
| --- | --- | --- | --- | --- | --- |
| Rifle held / bursts / taps | 0.30 / 0.53 / 0.70 | 0.40 / 0.53 / 0.70 | 2.40 / 1.07 / 0.93 | 5.28 (53 %) / 1.27 / 1.17 | 2.60 (50 %) / 1.60 / 1.17 |
| SMG held / bursts | **0.27 / 0.27** | **0.33 / 0.27** | 2.60 / 1.27 | (33 %) / 2.40 | (5 %) / 3.27 (60 %) |
| Pistol clicking / paced | 0.55 / 0.70 | 0.55 / 0.70 | 1.10 / 1.17 | 1.47 / 1.40 | 4.37 (53 %) / 2.57 |

No correction at all (aim once, hold), standing: at 20 u the SMG is 0.27 s against the rifle's 0.30. At 30 u the rifle in bursts kills every time in 0.63 s; the SMG held kills 43 % of the time. Rifle taps at 60 u kill 88 % of the time (43 % in the first pass). Head aim at 10 u: rifle 0.10 s, SMG 0.13, pistol 0.18.

Who is best where now: 0 to 20 u, the SMG by a hair (the rifle wins with head aim); 20 to 30 u, even, with the rifle ahead in bursts; 30 to 120 u, the rifle, in taps or bursts; 60 u and beyond, the scoped sniper. Neither the SMG nor the rifle is dominant everywhere. The rifle is still the safest single pick because it gives up at most 0.03 s up close.

### Findings, most important first

#### 1. The SMG's lead is too small to feel (gate, narrow)
- Evidence: 20 damage means five body hits, four gaps of 0.067 s, so 0.267 s. The rifle needs four hits, three gaps of 0.1 s, so 0.30 s. The difference is two ticks, and with head aim the rifle wins (two 52-damage hits in 0.10 s against three SMG hits in 0.13 s).
- Tried live (`feel_r2b_trials.cjs`, 40 trials per cell, median s):

| | 10 u stand | 10 u strafe | 10 u head | 20 u stand | 20 u strafe | 30 u stand, bursts | 30 u strafe, bursts | 40 u stand, bursts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rifle (reference) | 0.30 | 0.30 | 0.10 | 0.30 | 0.40 | 0.63 | 1.07 | 1.07 |
| SMG now (20 damage) | 0.27 | 0.27 | 0.13 | 0.27 | 0.33 | 1.07 | 1.20 | 1.80 |
| **SMG damage 25** | **0.20** | **0.20** | **0.07** | **0.20** | **0.27** | 0.80 | 1.07 | 1.60 |
| SMG 1100 rpm | 0.23 | 0.23 | 0.12 | 0.23 | 0.28 | 1.00 | 1.50 | 1.62 (95 %) |
| SMG damage 25, falloff 20 / 60 / 0.4 | 0.20 | 0.20 | 0.07 | 0.20 | 0.20 | 0.80 | 1.07 | 1.80 |

- Change: `weapons.smg.damage 20 -> 25`. Four body hits kill only inside the 25 unit falloff start, so the SMG gets a sharp, learnable edge. Up close it is a third faster than the rifle (0.20 against 0.30 s) and wins head shots. Past 25 units a fifth hit is needed, and it still clearly loses at 30 and 40. Keep the falloff as it is.

#### 2. Sniper at the clipping line, SMG still quieter than the rifle (sound, needs ears)
- Same-tick mixes rendered after the 0.5 master (`feel_r2b_mix.cjs`, worst of 12 noise seeds): sniper plus kill peaks at 0.97, sniper alone 0.86, grenade pop plus two kill tones 0.86. Nothing clips now, but a sniper kill during a grenade pop would.
- SMG: one shot is 0.044 rms against the rifle's 0.088 (-6 dB); one second held is 0.039 against 0.062 (-4 dB). It is now louder than the hit tick (it was quieter).
- Tried offline: SMG gains `0.9 / 0.5 -> 1.3 / 0.75` gives 0.067 single (-2.4 dB) and 0.055 held (-1 dB), peak 0.71. Sniper gains `0.8 / 0.7 -> 0.6 / 0.55` gives a sniper-plus-kill peak of 0.79.
- Change: those two gain pairs, or a `DynamicsCompressor` (threshold -6 dB) before `audio.out`. Footsteps: fabric is still 9 dB under wood. Try `step_fabric` gain `0.75 -> 1.2`. `jump` is still 0.007 rms, about 16 dB under a wood step; try `jump` gain `0.15 -> 0.5` (from the first pass, not done).

#### 3. Tracers still start from one point for every gun (gun feel, visible)
- `feel_re_cmp_shot_sniper.png`, `feel_re_cmp_flash.png`: the flash now sits on each muzzle, which makes the mismatch more visible. The sniper tracer begins below and left of the flash, about a third of the way down the barrel. The SMG and pistol tracers begin just behind their flashes.
- Change: start the tracer at the same kicked-muzzle point the flash now uses. For the sniper's heavier read, use a thicker, longer-lived tracer: `tracerWidth 0.035 -> 0.07`, `tracerLife 0.08 -> 0.2`, per weapon. Code change, untested.

#### 4. Grenade: kill window and burst picture (works; two small notes)
- Damage against how far the burst lands from the dummy, horizontally (825 throws from 10 to 18 units, `feel_r2b_grenade.cjs`):

| Miss distance (u) | 0 to 0.5 | 0.5 to 1 | 1 to 1.5 | 1.5 to 2 | 2 to 3 | 3 to 4 | 4 to 5 | 5 to 6 | 6 to 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mean damage | 123 | 118 | 111 | 101 | 88 | 68 | 49 | 29 | 9 |
| Kill % | 100 | 100 | 100 | 64 | 0 | 0 | 0 | 0 | 0 |

- Best throws: from 12 u at -12 degrees pitch, 114 damage (kill); from 14, 16 and 18 u, within 0.23 to 0.34 u for 123 damage (kill). From 10 u a level throw flies past and the best was 78. A throw at your own feet rolls about 4 units forward before it stops, so it cannot be "dropped" at a corner.
- Burst frames (`feel_re_cmp_burst_14u.png`, `_40u.png`, `_dummy.png`): from 14 u the dome grows to the radius in about 0.15 s and fills a third of the screen width, with a ring of sparks and a warm light on the wall. From 40 u it is still plainly visible over the cover. It reads as the biggest thing in the game. At its peak (ticks 3 to 9) it is close to opaque white, so for about 0.15 s nothing inside or behind it can be seen. Suggested `grenade.flashOpacity 0.55 -> 0.4` so a target inside stays visible. A human should judge it in motion.
- Arc preview: dots about 5 px with a 14 px landing dot. It ends where the grenade comes to rest, level, lobbed 30 degrees, thrown down and off a wall. Dots behind a dummy are hidden by it, even though the grenade flies through dummies. The throw tick and the next tick show only the rifle coming back up, so nothing fills the screen. While aiming, no grenade or hand is drawn at all and the crosshair is hidden. That reads as "empty hands". A human check; a small grenade in the lower right would fit the rest of the juice.

#### 5. Pistol beats the SMG from 30 units (balance note, not a gate item)
- Standing at 30 / 40 u: pistol clicking 0.73 / 0.92 s against SMG bursts 1.07 / 2.13. Crouched at 40 u the clicking pistol (0.55) is about level with the rifle held (0.50). The sidearm being the better gun than a primary at mid range is fine for a pistol, and finding 1 does not change it. Watch it when bots exist.

#### 6. Smaller
- Scoped crouch-walking gives the moving value (1.5). That matches "still or crouched" read as "crouched and still". Fine.
- Recoil after a full rifle magazine still leaves the aim 5.4 degrees high. That is intended, because sustained fire climbs.
- The pistol shot is still 79 % above 3 kHz with 4 % below 300 Hz. Ears needed; the first-pass low layer suggestion stands.

### What the changes made worse
- Nothing measured got worse in time to kill, handling or sound order. Cadence, reload, draw and switch times, sprint-to-fire, string blocking and audio ordering are unchanged from the first pass (`feel_r2b_handling.cjs`, `feel_r2b_audio.cjs`).
- Two small new effects: the near-opaque grenade dome (finding 4), and the tracer and muzzle mismatch is easier to see now that the flash is on the muzzle (finding 3).

### Only a human can confirm
- Whether a 0.03 s SMG lead (or 0.10 s with damage 25) feels like "the close-range gun" under a real mouse.
- Punch of each shot, especially the SMG at its new level and the pistol's thin top end.
- Whether the remaining 0.18 degree per tap drift is noticed, and whether the white dome flash is exciting or blinding.
- The empty-handed grenade aim.

## Round 2 re-check 2

**Gate "every weapon is satisfying within 10 seconds and clearly different": PASS.** At 25 damage the SMG is the clear close-range pick: 0.20 s against the rifle's 0.30 at 10 and 20 units, standing or strafing. It still loses to the rifle from 30 units, so it is not the best gun overall. Nothing measured got worse in handling, cadence or grenade damage. The wider haze costs a little depth, but the room still reads as huge.

| Weapon | Verdict | Why |
| --- | --- | --- |
| Rifle | **PASS** | Best from 30 to 120 units in taps and bursts. It still wins head aim at 20 units (0.10 s). Unchanged from re-check 1. |
| SMG | **PASS** | Body aim: 0.20 s at 10 and 20 u standing and strafing, against the rifle's 0.30 / 0.30 standing and 0.30 / 0.30 strafing. Head aim at 10 u: 0.07 against 0.10. From 30 u it loses standing and is even or behind strafing. |
| Sniper | **PASS** | Unchanged: scoped hit at 60 u is 100 % still, 25 % strafing, 3 % in the air; bolt 1.28 s, not shortened by switching. The new tracer is thick and starts at the muzzle. |
| Pistol | **PASS** | Unchanged numbers; still beats the SMG standing at 30 to 40 u, but not while strafing. |
| Grenade | **PASS** | Same kill window (all bursts within 1.5 u kill, 64 % at 1.5 to 2 u; 123 damage best). The dome is now see-through: the dummy, cover and walls inside and behind it stay visible through the whole burst. |

Method as before, on this build: `feel_r2b_ttk.cjs` (40 trials per cell, 10 to 60 u, five stances and aims), `feel_r2b_extras.cjs`, `feel_r2b_handling.cjs`, `feel_r2b_sniper.cjs`, `feel_r2b_audio.cjs`, `feel_r2b_mix.cjs`. New scripts: `feel_r2b_re2_frames.cjs`, `_flash.cjs`, `_grenade.cjs` (copies writing `feel_re2_*` pictures), `feel_r2b_re2_dome.cjs` and `feel_r2b_re2_haze.cjs`. No console errors in any run. `index.html` was not touched.

### Items asked for

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Gate | **PASS** | Table above. |
| 2 | SMG clearly the close-range pick, not dominant | **Fixed** | Table below. The SMG kills a third faster than the rifle at 10 and 20 u, body or head at 10. It loses at 30 u standing (bursts 0.80 against the rifle's 0.63 / 0.70). Strafing at 30 u it is even with rifle bursts and behind rifle taps (1.07 against 1.07 / 0.93). At 40 u it is well behind. I do not measure it ahead while strafing at 30 u; either way it is not dominant. |
| 2b | Pistol against SMG at 30 to 40 u | **Acceptable** | Standing: pistol clicking 0.73 / 0.92 s against SMG bursts 0.80 / 1.60. Strafing: pistol 1.10 / 2.02 against SMG 1.07 / 1.27. So the pistol wins standing still at mid range and the SMG wins on the move. |
| 3 | Wider haze, 20 / 320 | **Acceptable trade: the room still feels huge, with slightly less depth** | `feel_re2_cmp_haze.png` shows six player-eye views; in each pair the left is the build (20 / 320) and the right is 10 / 220. The difference is small in every view because the walls are already close to the cool haze colour, so the far wall reads pale and far in both. The build is a touch crisper at 60 to 120 u: orange ramps, desk and shelves keep more colour from the bed top and mid floor. Haze at fort-to-fort range (120 u) is 33 % against 52 %; that is close to the round 1 value of 30 / 330 that added no depth, but the cool haze and pale walls now carry the depth instead. Spawn and centre lane read exactly as before; their weakness is the grey cover, not the haze. |
| 4 | Loudness of the four shots, peak with a kill tone | **Fixed** | Loudest 50 ms after the 0.5 master: rifle 0.088, SMG 0.064 (-2.8 dB), pistol about 0.085 (-0.3 dB), sniper 0.174 (+5.9 dB). One second held: SMG 0.056 against rifle 0.062 (-0.9 dB). Peaks: sniper plus kill 0.81, grenade pop plus two kill tones 0.86, pistol plus kill 0.77. Nothing clips. The sniper is the loud one, which is right. |
| 5 | Tracers per gun | **Fixed, with one new oddity** | `feel_re2_cmp_flash.png`: every tracer now starts at its own gun's muzzle, and the sniper's is a thick, bright, longer-lived wedge that reads as the heavy shot. Through the scope (`feel_re2_cmp_shot_sniper_scoped.png`) the tracer is seen end-on from 3 units out, as a pale square about 25 px across on the target. It stays for the whole 0.2 s life, like a sticker. |
| 6 | Dome no longer hides what is inside | **Fixed** | `feel_re2_cmp_dome.png`: a dummy killed by a burst 0.2 u away, seen from 14 u. The dummy tipping, the cover block, the ruin wall and the desk behind all stay visible through the dome at every tick. `feel_re2_cmp_burst_14u.png` and `_40u.png` still read at full size. The thrown grenade no longer appears near the eye (`feel_re2_cmp_grenade_*.png`, throw-tick frames). |
| 7 | Made worse | **Only the scoped tracer square** | Handling, cadence, reload, draw, bolt, held-through-empty (rifle 2.30 s, SMG 2.07 s), R during a draw, scoped spread and grenade damage are identical to re-check 1. |

### SMG against rifle (median s to kill, 40 trials, perfect re-aim; `feel_r2b_ttk.cjs`)

| | 10 u | 20 u | 30 u | 40 u | 60 u |
| --- | --- | --- | --- | --- | --- |
| SMG body, standing (held / 5-shot bursts) | **0.20** / **0.20** | **0.20** / **0.20** | 1.53 / 0.80 | 4.67 (83 %) / 1.60 | (35 %) / 2.20 (88 %) |
| Rifle body, standing (held / 3-shot bursts / taps) | 0.30 / 0.53 / 0.70 | 0.30 / 0.53 / 0.70 | 0.80 / 0.63 / 0.70 | 2.50 (90 %) / 0.73 / 0.70 | 5.20 (85 %) / 1.07 / 0.70 |
| SMG body, strafing (held / bursts) | **0.20** / **0.20** | **0.20** / **0.20** | 1.60 (95 %) / 1.07 | (68 %) / 1.27 (98 %) | (15 %) / 2.73 (73 %) |
| Rifle body, strafing (held / bursts / taps) | 0.30 / 0.53 / 0.70 | 0.30 / 0.53 / 0.70 | 1.80 (93 %) / 1.07 / 0.93 | (60 %) / 1.60 / 1.17 | (45 %) / 1.60 / 1.17 |
| SMG head, standing (held / bursts) | **0.07** / **0.07** | 0.20 / 0.13 | 1.60 / 1.07 | 4.67 (80 %) / 1.67 | |
| Rifle head, standing (held / bursts / taps) | 0.10 / 0.10 / 0.23 | **0.10** / 0.10 / 0.23 | 0.30 / 0.53 / 0.23 | 2.50 / 0.53 / 0.47 | |

With no correction at all (aim once, hold) the SMG is still 0.20 s at 10 and 20 u. At 30 u it kills 75 % held and 100 % in bursts (1.07 s); the rifle in bursts kills 100 % in 0.63 s. Crouched at 40 u the SMG in bursts (0.67) is nearly level with rifle bursts (0.63); a crouching SMG player is competitive at mid range. Watch this with bots, but it is not dominant.

### Remaining issues (not gate items)
1. **The scoped sniper tracer shows as a pale square on the target for 0.2 s.** Change `fx.tracerScopeMin 3 -> 20`, or draw no tracer while scoped. Untested.
2. **Pistol shot is still mostly hiss (79 % above 3 kHz) and the jump sound is still nearly silent (0.007 rms).** Both are deferred to round 5. Ears needed for the pistol; `jump` gain `0.15 -> 0.5` stands.
3. **No grenade or hand is drawn while aiming one** (deferred). Also the haze trade: if the lead wants more depth back without losing Tan, 15 / 270 sits between the two (haze 40 % at 120 u). Untested for Tan readability, which is the visual tester's measure.

### Only a human can confirm
- Whether 0.20 against 0.30 s now feels like a different gun under a mouse. The numbers say a third faster.
- The SMG's new loudness and the sniper's lower boom: the measurements say balanced, not good.

---

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
