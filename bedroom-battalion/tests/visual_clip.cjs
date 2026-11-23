// 1. Camera clipping where visual-only geometry sticks out of a collider (skirting 0.6, door 0.35, door frame 0.7,
//    ball sphere r 4 vs collider r 3.4): the player is WALKED into the wall with the normal movement code.
// 2. Sunbeam footprint on the floor: where is the floor actually sunlit? (DESIGN 3 says about x 38..72, z 70..95.)
const { open, grabCanvas } = require('./visual_lib.cjs');

(async () => {
  const h = await open({ width: 1280, height: 720 });
  const p = h.page;
  const walkInto = (x, z, yaw, secs = 2) => p.evaluate(([x, z, yaw, secs]) => {
    __game.clearView(); __game.setTimeScale(0); __game.clearInput();
    __game.teleport(x, 0, z, yaw, 0); __game.setInput({ forward: true }); __game.step(secs); __game.clearInput(); __game.step(0.3);
    const s = __game.state().player; return { x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3) };
  }, [x, z, yaw, secs]);
  const look = (yaw, pitch) => p.evaluate(([y, pt]) => { __game.look(y, pt); __game.render(); }, [yaw, pitch]);
  const centre = () => p.evaluate(() => {
    __game.render();
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(4);
    const at = (fx, fy) => { gl.readPixels(Math.floor(W * fx), Math.floor(H * (1 - fy)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return '#' + [b[0], b[1], b[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
    return { centre: at(0.5, 0.5), left: at(0.15, 0.5), right: at(0.85, 0.5), low: at(0.5, 0.9), lowLeft: at(0.15, 0.9), lowRight: at(0.85, 0.9) };
  });

  // ---- door: walk north into the door slab at x = 30 ----
  console.log('player rests at (door)', JSON.stringify(await walkInto(30, 3, 0)));
  await look(0, 0); console.log(' door straight on', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_door_straight.png');
  await look(0.6, 0); console.log(' door yaw 0.6   ', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_door_yaw06.png');
  await look(1.2, -0.2); console.log(' door yaw 1.2   ', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_door_yaw12.png');
  // ---- door frame: walk north into the frame post at x = 44.75 ----
  console.log('player rests at (door frame)', JSON.stringify(await walkInto(44.75, 3, 0)));
  await look(0, 0); console.log(' frame straight ', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_doorframe_straight.png');
  // ---- skirting: walk west into the west wall at z = 130, then look down at where the skirting should be ----
  console.log('player rests at (west wall)', JSON.stringify(await walkInto(3, 130, Math.PI / 2)));
  await look(Math.PI / 2, -0.9); console.log(' skirting, facing wall, looking down', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_skirting_down.png');
  await look(Math.PI, -0.3); console.log(' skirting, looking south along wall  ', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_skirting_along.png');
  // same two looks from 1 unit off the wall, for comparison
  await p.evaluate(() => __game.teleport(1.4, 0, 130, Math.PI / 2, -0.9));
  await look(Math.PI / 2, -0.9); console.log(' 1.4 from wall, looking down         ', JSON.stringify(await centre())); await grabCanvas(h, 'round1/visual_clip_skirting_down_ref.png');
  await look(Math.PI, -0.3); await grabCanvas(h, 'round1/visual_clip_skirting_along_ref.png');

  // ---- ball: push into it and jump; is the eye ever inside the drawn sphere (centre 54,4,99 r 4)? ----
  const ball = await p.evaluate(() => {
    __game.clearView(); __game.clearInput(); __game.teleport(54, 0, 106, 0, 0);            // south of the ball, facing north into it
    __game.setInput({ forward: true }); __game.step(1.5);
    const s0 = __game.state().player; let worst = Infinity, at = null;
    __game.setInput({ forward: true, jump: true });
    for (let i = 0; i < 80; i++) {
      __game.step(1 / 60);
      const s = __game.state().player, eye = s.y + __game.CONFIG.player.eye, d = Math.hypot(s.x - 54, eye - 4, s.z - 99);
      if (d < worst) { worst = d; at = { x: +s.x.toFixed(2), eyeY: +eye.toFixed(2), z: +s.z.toFixed(2) }; }
    }
    __game.clearInput();
    return { restAt: [+s0.x.toFixed(2), +s0.z.toFixed(2)], minEyeDistToBallCentre: +worst.toFixed(3), at, sphereRadius: 4, near: __game.CONFIG.camera.near };
  });
  console.log('ball jump test', JSON.stringify(ball));
  // reproduce the worst eye position as a frozen frame
  await p.evaluate((a) => { __game.teleport(a.x, a.eyeY - 1.6, a.z, 0, 0); __game.render(); }, ball.at);
  await grabCanvas(h, 'round1/visual_clip_ball_jump.png');
  console.log(' ball at jump apex', JSON.stringify(await centre()));

  // ---- sunbeam footprint: scan the floor from straight above, 5x5 centre median, red channel ----
  const scan = await p.evaluate(() => {
    const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, b = new Uint8Array(4 * 25);
    const read = (x, z) => {
      __game.teleport(x, 5 - 1.6, z, 0, -1.54); __game.render();
      gl.readPixels((W >> 1) - 2, (H >> 1) - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, b);
      const r = [], g = [], bl = []; for (let i = 0; i < 25; i++) { r.push(b[i * 4]); g.push(b[i * 4 + 1]); bl.push(b[i * 4 + 2]); }
      r.sort((a, c) => a - c); g.sort((a, c) => a - c); bl.sort((a, c) => a - c); return [r[12], g[12], bl[12]];
    };
    const out = { alongX_z100: [], alongX_z75: [], alongZ_x65: [], alongZ_x58: [] };
    for (let x = 34.5; x <= 82; x += 0.5) { out.alongX_z100.push([x, ...read(x, 100)]); out.alongX_z75.push([x, ...read(x, 75.3)]); }
    for (let z = 56; z <= 120; z += 0.5) { out.alongZ_x65.push([z, ...read(65.6, z)]); out.alongZ_x58.push([z, ...read(58.4, z)]); }
    return out;
  });
  // floor-coloured and bright = sunlit floor. Floor in shade has R about 0x72..0x89 depending on the plank tint; sunlit is 0x8C+ with G > 0x50.
  const isFloor = (c) => c[1] > c[3] * 1.5 && c[1] > 90 && c[1] < 190 && c[2] < c[1] * 0.72;
  const runs = (arr) => { const lit = arr.filter((c) => isFloor(c) && c[1] >= 0x90).map((c) => c[0]); const r = []; for (const v of lit) { if (r.length && v - r[r.length - 1][1] <= 0.5) r[r.length - 1][1] = v; else r.push([v, v]); } return r; };
  for (const k in scan) console.log('sunlit floor runs', k, JSON.stringify(runs(scan[k])), ' sample values', JSON.stringify(scan[k].filter((_, i) => i % 8 === 0).map((c) => [c[0], '#' + c.slice(1).map((v) => v.toString(16).padStart(2, '0')).join('')])));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
