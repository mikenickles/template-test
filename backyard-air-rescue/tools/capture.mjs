// Records real gameplay (frame-stepped, real pointer input) to media/: a winch clip and a screenshot.
//   node tools/capture.mjs [teddy|duck|robot]
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const who = process.argv[2] || 'teddy';
const media = join(root, 'media'), frames = join(root, 'media/.frames-' + who);
rmSync(frames, { recursive: true, force: true });
const d = await launch({ scale: 1, query: 'manual&dpr=1.5' });
const L = await d.page.evaluate(() => window.__game.L);
const toy = (await d.state()).toys.find((t) => t.name === who);
// take off and get most of the way there before the camera rolls
await d.stick(0.5, 0.5); await d.step(100);
await d.flyTo(toy.pos[0], toy.pos[2], 11);
d.record(frames);
await d.flyTo(toy.pos[0], toy.pos[2], 3.2);
const tx = toy.pos[0], tz = toy.pos[2];
// line up the hook, then hold the button and keep it lined up until it clicks on
for (let i = 0; i < 60; i++) { const e = await d.hover(tx, tz, 3); const q = await d.state(); if (e < 0.2 && Math.hypot(q.vel[0], q.vel[2]) < 0.25) break; }
await d.holdWinch();
let shotTaken = false;
for (let i = 0; i < 300; i++) {
  await d.hover(tx, tz, 3); const q = await d.state();
  if (!shotTaken && q.len > 2.2) { await d.shot(join(media, 'lining-up.png')); shotTaken = true; }
  if (q.carrying === who && q.winch === 'idle') break;
}
await d.release(); await d.step(20);
// still holding: show off the cable (accelerate, stop, reverse, sharp turn), then home to the pad
const away = Math.sign(L.pad.x - toy.pos[0]) || 1;
await d.stick(away, 0); await d.step(55);
await d.release(); await d.step(50);
await d.stick(-away, 0.2); await d.step(40);
await d.stick(0, -1); await d.step(35);
await d.flyTo(L.pad.x, L.pad.z, 1.6);
await d.step(25);
await d.releaseWinch();
await d.waitFor((q) => q.toys.find((t) => t.name === who).state === 'home', 9);
await d.step(70);
d.record(null);
console.log('frames', d.frames, 'errors', d.errors.length);
await d.browser.close();
const out = join(media, `winch-${who}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(frames, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
rmSync(frames, { recursive: true, force: true });
console.log('wrote', out);
