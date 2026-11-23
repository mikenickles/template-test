// Round 2 re-check: candidate eyes for desk_top and bed_top (the chair back fills the left third of desk_top).
// Share of the frame taken by geometry nearer than 6 units is measured by raycasts on a 32 x 18 grid.
const { open } = require('./visual_r2_lib.cjs');
const CANDS = [['desk_top', [97.5, 27.6, 66], [20, 8, 80]], ['desk_top_a', [97.5, 27.6, 62], [20, 8, 74]], ['desk_top_b', [99, 27.6, 70], [20, 6, 72]],
  ['bed_top', [31, 19.6, 80], [100, 10, 80]], ['bed_top_a', [31, 19.6, 80], [100, 14, 80]]];
(async () => {
  const h = await open({ width: 1280, height: 720 });
  for (const [name, eye, tg] of CANDS) {
    await h.cam(eye, tg);
    const near = await h.page.evaluate(([e, t]) => { const f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]], L = Math.hypot(...f); f[0] /= L; f[1] /= L; f[2] /= L;
      const r = [-f[2], 0, f[0]], rl = Math.hypot(...r); r[0] /= rl; r[2] /= rl; const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const ty = Math.tan(37.5 * Math.PI / 180), tx = ty * 16 / 9; let n = 0, tot = 0;
      for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) { const sx = ((i + 0.5) / 32 * 2 - 1) * tx, sy = (1 - (j + 0.5) / 18 * 2) * ty;
        const d = [f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy]; const hit = __game.raycast(e, d); tot++; if (hit && hit.distance < 6) n++; }
      return Math.round(100 * n / tot); }, [eye, tg]);
    if (name !== 'desk_top' && name !== 'bed_top') await h.grab(`visual_re_view_${name}.png`);
    console.log(name, JSON.stringify(eye), '->', JSON.stringify(tg), 'frame within 6 units:', near + '%');
  }
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
