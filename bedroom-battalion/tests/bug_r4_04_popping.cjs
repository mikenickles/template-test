// Round 4 check 4 (culling, popping): render consecutive frames while (a) the camera turns in small steps at several
// standing spots and (b) the camera stays still while the train passes. Frames are saved; bug_r4_04_popping.py aligns
// each frame with the previous one (best shift of a few pixels) and reports frames where a large block of pixels changes
// at once, which is what an object popping in or out looks like. Usage: node bug_r4_04_popping.cjs <outdir> [build]
const path = require('path');
const fs = require('fs');
const { launch } = require('./harness.cjs');
const OUT = path.resolve(process.argv[2]);
const FILE = path.resolve(process.argv[3] || path.join(__dirname, '..', 'snapshots', 'index_r4b.html'));
const SPOTS = [['spawn_green', [60, 0, 22], 0], ['west_lane', [40, 0, 70], 0], ['bed_top', [26, 18, 80], 0], ['desk_top', [104, 26, 80], 0], ['tall_L3', [112, 60, 140], 0], ['centre_ruin', [60, 1.2, 80], 0], ['under_bed', [18, 0, 80], 0]];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await launch({ width: 320, height: 180, file: FILE });
  await page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.removeBots(); });
  const index = [];
  // (a) turns: 1 degree steps through 360 degrees at pitch 0 and -0.3, with the train frozen (time not stepped)
  for (const [name, p] of SPOTS) for (const pitch of [0, -0.3]) {
    for (let k = 0; k < 360; k++) {
      const yaw = k * Math.PI / 180;
      await page.evaluate(([p, yaw, pitch]) => { __game.teleport(p[0], p[1], p[2], yaw, pitch); __game.look(yaw, pitch); __game.render(); }, [p, yaw, pitch]);
      const f = `${name}_p${pitch}_${String(k).padStart(3, '0')}.png`; await page.screenshot({ path: path.join(OUT, f) }); index.push(f);
    }
  }
  // (b) the train passing a still camera: west straight from the west lane, east straight from beside the tunnel, a curve
  for (const [name, p, look] of [['train_west', [38, 0, 80], [43, 1.5, 70]], ['train_east', [84, 0, 66], [77, 2, 80]], ['train_curve', [60, 0, 42], [50, 2, 40]]]) {
    await page.evaluate(([p, look]) => { __game.teleport(p[0], p[1], p[2]); __game.lookAt(look[0], look[1], look[2]); }, [p, look]);
    for (let k = 0; k < 900; k++) {
      await page.evaluate(([p, look]) => { __game.step(1 / 60); __game.teleport(p[0], p[1], p[2]); __game.lookAt(look[0], look[1], look[2]); __game.render(); }, [p, look]);
      const f = `${name}_${String(k).padStart(3, '0')}.png`; await page.screenshot({ path: path.join(OUT, f) }); index.push(f);
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  console.log('frames', index.length, 'ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
