// Round 1 re-check after FIXLIST passes 1 and 2: named views, in-page jitter test for z-fighting, clipped-pixel
// census, haze on walls and on mid-distance cover, close-ups of the new geometry.
const { open, shotView, freeCam, grabCanvas, VIEWS } = require('./visual_lib.cjs');
const CLOSE = {
  overview_sw:   [[4, 84, 156], [80, 0, 60]],
  overview_ne:   [[116, 84, 4], [40, 0, 100]],
  bed_top_south: [[30, 23, 48], [14, 18, 110]],
  bed_pillows:   [[17.5, 20.5, 92], [17.5, 18.5, 106]],
  chair_props:   [[80, 24, 62], [93, 20, 76]],
  seat_stoppers: [[89, 19.5, 80], [93, 17.3, 73.5]],
  guard_tall:    [[112, 24, 126], [108, 12, 138]],
  guard_small_floor: [[96, 1.6, 26], [108, 8, 22]],
  desk_laps:     [[104, 31, 80], [100, 26, 66]],
  cover_w_c:     [[42, 1.6, 64], [34.5, 1.5, 70.5]],
  cover_e_c:     [[86, 1.6, 40], [81, 1.5, 45.5]],
  crayons:       [[60, 3, 37], [60, 0.6, 31]],
  strings_from_L3: [[114, 61.6, 144], [107.6, 58, 136]],
};
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const p = h.page;
  for (const v of VIEWS) await shotView(h, v, `round1/visual_re_${v}.png`);
  await p.evaluate(() => __game.clearView());
  for (const [n, [e, t]] of Object.entries(CLOSE)) { await freeCam(h, e, t); await grabCanvas(h, `round1/visual_re_close_${n}.png`); }

  // jitter: two eyes 0.006 apart; count strongly changed pixels and those in a solid 3x3 changed block (thick = blob, not an edge)
  const views = await p.evaluate(() => __game.views);
  const cams = Object.assign({}, CLOSE); for (const v of VIEWS) cams[v] = views[v];
  for (const [n, [e, t]] of Object.entries(cams)) {
    const r = await p.evaluate(([e, t]) => {
      const gl = document.getElementById('view').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const grab = (ex) => { __game.clearView(); __game.teleport(ex[0], ex[1] - 1.6, ex[2]); __game.lookAt(t[0], t[1], t[2]); __game.render(); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      const A = grab(e), B = grab([e[0] + 0.004, e[1] + 0.003, e[2] + 0.004]);
      const m = new Uint8Array(W * H); let strong = 0, clipped = 0, white = 0;
      for (let i = 0; i < W * H; i++) { const k = i * 4; if (Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2])) > 48) { m[i] = 1; strong++; }
        if (A[k] === 255 || A[k + 1] === 255 || A[k + 2] === 255) clipped++; if (A[k] === 255 && A[k + 1] === 255 && A[k + 2] >= 250) white++; }
      let thick = 0;
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let all = 1; for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if (!m[(y + dy) * W + x + dx]) { all = 0; break; } thick += all; }
      return { strong, thickCentres5x5: thick, clippedPct: +(100 * clipped / (W * H)).toFixed(2), whitePct: +(100 * white / (W * H)).toFixed(2) };
    }, [e, t]);
    console.log('jitter/clip', n.padEnd(18), JSON.stringify(r));
  }

  // haze: the same surface from near, mid and far
  const probe = (e, t) => p.evaluate(([e, t]) => { __game.clearView(); __game.teleport(e[0], e[1] - 1.6, e[2]); __game.lookAt(t[0], t[1], t[2]); __game.render();
    const gl = document.getElementById('view').getContext('webgl2'), b = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return '#' + [b[0], b[1], b[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }, [e, t]);
  const H = [
    ['south wall (60,30,160)', [60, 30, 160], [[60, 30, 152], [60, 30, 120], [60, 30, 80], [60, 30, 40], [60, 30, 5]]],
    ['tunnel roof side, cover grey (77,7.4,92)', [77, 7.4, 92], [[77, 7.4, 97], [77, 7.4, 122], [77, 7.4, 152]]],
    ['tan fort tower north face (70.5,5,147)', [70.5, 5, 147], [[70.5, 5, 141], [70.5, 5, 107], [70.5, 5, 67], [70.5, 5, 30]]],
    ['route: tall stairs west face (103.5,4,140)', [103.5, 4, 140], [[97.5, 4, 140], [63.5, 4, 140], [23.5, 4, 140]]],
  ];
  for (const [name, t, eyes] of H) { const out = []; for (const e of eyes) out.push(Math.round(Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2])) + 'u ' + await probe(e, t)); console.log('haze', name, '->', out.join(' | ')); }
  // pillows against the new bed colour
  console.log('pillow top shade', await probe([9, 25, 106], [9, 19.8, 106.01]), 'bed top shade', await probe([8, 24, 75], [8, 18, 75.01]),
    '| pillow top sun', await probe([26, 25, 104], [26, 19.8, 104.01]), 'bed top sun', await probe([27, 24, 75], [27, 18, 75.01]),
    '| pillow side', await probe([17.5, 18.3, 96], [17.5, 18.3, 100]), '| lap on desk', await probe([96.2, 30, 65.5], [96.2, 26.05, 65.51]), 'desk top', await probe([105, 31, 70], [105, 26, 70.01]),
    '| guard', await probe([112, 10, 135], [108.6, 10, 135]), '| W-c top', await probe([34.5, 8, 70.5], [34.5, 3, 70.51]));
  console.log('errors', JSON.stringify(h.errors));
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
