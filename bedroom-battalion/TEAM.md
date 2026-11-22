# Bedroom Battalion: team rules

Five roles. Only the BUILDER edits `index.html`. Everyone reads `DESIGN.md` first.

## Files and who writes them

| File | Writer |
| --- | --- |
| `DESIGN.md`, `FIXLIST.md`, `LATER.md`, `TEAM.md` | Lead |
| `index.html`, `CHANGELOG.md` | Builder |
| `BUGS.md`, `tests/bug_*.cjs` | Bug tester |
| `FEEL.md`, `tests/feel_*.cjs` | Feel tester |
| `VISUAL.md`, `tests/visual_*.cjs`, `screenshots/` | Visual and performance tester |

Testers never edit `index.html`, never read another tester's report, and never edit another tester's files.

## Hard rules for the game

- One file: `index.html`, all HTML, CSS and JavaScript inline.
- Three.js as an ES module from `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`. No other library.
- No external assets. Models from code, textures drawn on canvas, sound from Web Audio.
- Runs by opening the file in desktop Chrome, Edge or Firefox.
- Original and generic. No characters, logos, names or designs from any film, show or real toy brand.
  Stud bricks are "bricks".
- No blood or gore.
- No console errors or warnings in normal play.
- Code sections in this order: config and tuning constants, utilities, audio, input, world build, colliders,
  train, player, weapons, bots, match rules, HUD and menus, main loop. All tuning numbers in one `CONFIG`.

## Running the game headless

The CDN is blocked in this sandbox. `tests/harness.cjs` opens `index.html` in headless Chromium and answers
the CDN request from a local copy, so the game file itself must keep the real CDN URL.

```js
const { launch } = require('./harness.cjs');   // run scripts from the tests/ folder with: node name.cjs
const { browser, page, errors, shot, fileSizeBytes } = await launch({ width: 1280, height: 720 });
await page.evaluate(() => window.__game.start({ pointerLock: false }));
const s = await page.evaluate(() => { __game.step(1); return __game.state(); });
await shot('round1/spawn_green.png');           // saved under screenshots/
await browser.close();
```

- `errors` holds console errors, warnings and page errors. It must be empty after a normal session.
- Rendering is software, so fps numbers are not real-hardware numbers. Report draw calls, triangles and
  relative cost, and say plainly that fps is from software rendering.
- Pointer lock does not exist headless. Drive everything through `window.__game` (DESIGN.md section 11).
- Reading the code is not a test. A claim that something works needs a script run or a screenshot behind it.

## Role instructions

### Builder
- Build what the current round asks for, then fix exactly what is in `FIXLIST.md`, nothing more.
- Write `CHANGELOG.md` each pass: what changed, what to re-test, any waypoint you moved, anything in
  DESIGN.md you could not do and the closest alternative you chose.
- Never rewrite working systems without the lead's say-so.
- Before handing over, run the game through the harness yourself and confirm it loads with no errors.

### Bug tester
- Drive the game in the headless browser through `window.__game`.
- Check: loads with no errors, every key binding that exists this round, walking into every wall and
  furniture edge, falling out of the room, every climb route up and down, getting stuck, and from round 3
  train push and ride, wedging, weapons, grenades, bots, round and match state, pause and rematch.
- Report to `BUGS.md`: severity (blocker, major, minor), exact repro steps (the hook calls you made),
  expected vs actual.

### Feel tester
- Judge only how it plays, against pillars 1 to 4. Measure where you can: travel times, time to full
  speed, stop distance, jump height, climb times, how much of the view the furniture fills from the spawn.
- Look at screenshots from the player's eye, not just numbers.
- Report to `FEEL.md`: what feels wrong, why, and a specific suggested `CONFIG` number change where possible.

### Visual and performance tester
- Screenshot every named view in DESIGN.md section 10 into `screenshots/roundN/`.
- Check against the style guide: palette, shading, Green vs Tan readable, cover readable, scale cues,
  no flicker, no gaps in geometry, HUD legible.
- Measure draw calls, triangles, file size and frame cost against the budget (under 200 draw calls, one
  shadow light, shadow map 2048 or less, file under 400 KB). Name the costliest object or effect.
- Report to `VISUAL.md` with screenshots referenced by file name.

## Report format (all testers)

Start with a one-line verdict on this round's gate: PASS or FAIL, and why. Then findings, most severe first.
Every finding states how it was observed.
