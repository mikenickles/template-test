// Records media/physics.mp4 from real gameplay: a toy swung through the block tower,
// a bounce on the trampoline, and the robot catapulting the bunny off the seesaw.
import { launch, root } from './driver.mjs';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const frames = join(root, 'media/.frames-physics');
rmSync(frames, { recursive: true, force: true });
const d = await launch({ scale: 1, query: 'manual&dpr=1.5&fresh' });
const L = await d.page.evaluate(() => window.__game.L);
const loopOf = (st, name) => st.toys.find((x) => x.name === name).loop;
async function hook(name) {
  const [tx, , tz] = loopOf(await d.state(), name);
  await d.flyTo(tx, tz, 3);
  for (let i = 0; i < 80; i++) { const e = await d.hover(tx, tz, 3); const q = await d.state(); if (e < 0.2 && Math.hypot(q.vel[0], q.vel[2]) < 0.3) break; }
  await d.holdWinch();
  for (let i = 0; i < 400; i++) { await d.hover(tx, tz, 3); const q = await d.state(); if (q.carrying === name && q.winch === 'idle') break; }
  await d.release();
}
await d.stick(0.3, -0.3); await d.step(90); await d.release();
// 1. the robot (heavy) through the block tower
await hook('robot');
await d.flyTo(L.blocks.x + 11, L.blocks.z, 1.0);
for (let i = 0; i < 40; i++) { const e = await d.hover(L.blocks.x + 11, L.blocks.z, 3); if (e < 0.3) break; }
d.record(frames);
await d.stick(-0.75, 0); await d.step(75); await d.release(); await d.step(70);
// 2. robot onto the raised end of the seesaw: the bunny flies
d.record(null);
await d.flyTo(L.seesaw.x + 10, L.seesaw.z, 1.2);
d.record(frames);
await d.flyTo(L.seesaw.x + 3.45, L.seesaw.z, 0.6);
for (let i = 0; i < 30; i++) { const e = await d.hover(L.seesaw.x + 3.45, L.seesaw.z, 2); if (e < 0.3) break; }
await d.release(); await d.releaseWinch(); await d.step(110);
// 3. the helicopter bounces on the trampoline
d.record(null);
await d.flyTo(L.tramp.x, L.tramp.z + 6, 1.5);
d.record(frames);
await d.flyTo(L.tramp.x, L.tramp.z, 0.6); await d.step(150);
d.record(null);
console.log('frames', d.frames, 'errors', d.errors.length);
await d.browser.close();
const out = join(root, 'media', 'physics.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(frames, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
rmSync(frames, { recursive: true, force: true });
console.log('wrote', out);
