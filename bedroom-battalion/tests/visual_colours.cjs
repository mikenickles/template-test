// Colour probes: put the camera a few units from a known surface, render, and read the centre pixels straight
// from the WebGL buffer. Reports rendered colour vs the palette hex, the lighting factor per face orientation,
// what the reserved team colours would render as under the same light, and how close the environment gets to them.
const fs = require('fs');
const path = require('path');
const { open } = require('./visual_lib.cjs');

// [name, eye, target-on-surface, palette hex of that surface, condition]
// condition: top/side/under + shade/sun (sun = inside the window beam, checked by hand against the beam footprint)
const P = [
  ['wall north', [80, 30, 8], [80, 30, 0], '#BFD3E0', 'side shade'],
  ['wall east', [112, 50, 50], [120, 50, 50], '#BFD3E0', 'side shade'],
  ['wall south', [60, 30, 152], [60, 30, 160], '#BFD3E0', 'side shade'],
  ['wall west', [8, 20, 20], [0, 20, 20], '#BFD3E0', 'side shade'],
  ['ceiling', [30, 82, 30], [30, 90, 30.01], '#F5F2EA', 'under shade'],
  ['ceiling light fitting', [60, 80, 80], [60, 86, 80.01], '#F2EFE6', 'under shade'],
  ['skirting', [80, 2, 5], [80, 2, 0.6], '#F2EFE6', 'side shade'],
  ['door', [30, 30, 6], [30, 30, 0.35], '#F2EFE6', 'side shade'],
  ['window pane (background)', [10, 62, 70], [-5, 62, 70], '#E6DCCB', 'none'],
  ['floor shade', [91.2, 6, 20], [91.2, 0, 20.01], '#7A4E2E', 'top shade'],
  ['floor sun', [65.6, 6, 102], [65.6, 0, 102.01], '#7A4E2E', 'top sun'],
  ['floor west of ruin (DESIGN says sunbeam)', [52.8, 6, 102], [52.8, 0, 102.01], '#7A4E2E', 'top shade'],
  ['floor under bed', [14.4, 3, 96], [14.4, 0, 96.01], '#7A4E2E', 'top shade'],
  ['bed underside', [20, 1.6, 95], [20, 6, 95.01], '#C79A5E', 'under shade'],
  ['bed top shade', [8, 24, 75], [8, 18, 75.01], '#C79A5E', 'top shade'],
  ['bed top sun', [27, 24, 75], [27, 18, 75.01], '#C79A5E', 'top sun'],
  ['bed side east', [41, 12, 60], [35, 12, 60], '#C79A5E', 'side shade'],
  ['pillow top sun', [26, 25, 104], [26, 19.8, 104.01], '#E8EEF5', 'top sun'],
  ['pillow top shade', [9, 25, 106], [9, 19.8, 106.01], '#E8EEF5', 'top shade'],
  ['blanket ridge shade', [10, 24, 55], [10, 19, 58], '#3D5A99', 'top shade'],
  ['desk top', [105, 31, 70], [105, 26, 70.01], '#8FA3B5', 'top shade'],
  ['desk leg west face', [89, 12, 56.25], [95, 12, 56.25], '#8FA3B5', 'side shade'],
  ['desk underside', [105, 20, 70], [105, 24.5, 70.01], '#8FA3B5', 'under shade'],
  ['shelf board top', [114, 25, 10], [114, 20, 10.01], '#EFE9DD', 'top shade'],
  ['shelf board underside', [114, 14, 10], [114, 19, 10.01], '#EFE9DD', 'under shade'],
  ['shelf post west face', [102, 10, 155.4], [108, 10, 155.4], '#EFE9DD', 'side shade'],
  ['cover top shade (game box)', [54, 8, 61], [54, 2.5, 61.01], '#9AA3AD', 'top shade'],
  ['cover side shade (game box)', [54, 1.25, 50.5], [54, 1.25, 56], '#9AA3AD', 'side shade'],
  ['cover top sun (marble ramp)', [65.5, 10, 109], [65.5, 4, 109.01], '#9AA3AD', 'top sun'],
  ['cover west face sun (C-f block)', [58, 3, 91.5], [64, 3, 91.5], '#9AA3AD', 'west sun'],
  ['route top shade (landing)', [105.75, 25, 119], [105.75, 20, 119.01], '#FF8A1F', 'top shade'],
  ['route side shade (stairs)', [97.5, 4, 140], [103.5, 4, 140], '#FF8A1F', 'side shade'],
  ['route top (spring pad, in bed shadow)', [38, 5, 80], [38, 0.4, 80.01], '#FF8A1F', 'top shade'],
  ['route underside (skate ramp)', [89, 3, 62], [89, 8, 62.01], '#FF8A1F', 'under shade'],
  ['string (yo-yo) west face', [105.5, 10, 54.5], [106.89, 10, 54.5], '#FFD21F', 'side shade'],
  ['green fort top', [50, 7, 6.75], [50, 3.3, 6.76], '#2F6FD0', 'top shade'],
  ['green fort front face', [48.5, 0.6, 31], [48.5, 0.6, 26], '#2F6FD0', 'side shade'],
  ['tan fort top', [50, 7, 153.25], [50, 3.3, 153.26], '#D43C2E', 'top shade'],
  ['tan fort front face', [48.5, 0.6, 129], [48.5, 0.6, 134], '#D43C2E', 'side shade'],
  ['ruin top sun (platform)', [58, 6, 82], [58, 1.2, 82.01], '#7B4BB5', 'top sun'],
  ['ruin side shade', [71.5, 2, 76], [69, 2, 76], '#7B4BB5', 'side shade'],
  ['spare soldier side', [10.2, 0.9, 132.4], [8.8, 0.9, 132.4], '#B9BEC6', 'side shade'],
  ['track rail top', [44.6, 2, 60], [44.6, 0.3, 60.01], '#4B5058', 'top shade'],
  ['chair seat top', [90.5, 22, 80], [90.5, 17, 80.01], '#8FA3B5', 'top shade'],
  // fog: the same south wall point from further and further away
  ['fog: south wall from 8', [60, 30, 152], [60, 30, 160], '#BFD3E0', 'fog'],
  ['fog: south wall from 40', [60, 30, 120], [60, 30, 160], '#BFD3E0', 'fog'],
  ['fog: south wall from 80', [60, 30, 80], [60, 30, 160], '#BFD3E0', 'fog'],
  ['fog: south wall from 120', [60, 30, 40], [60, 30, 160], '#BFD3E0', 'fog'],
  ['fog: south wall from 155', [60, 30, 5], [60, 30, 160], '#BFD3E0', 'fog'],
];

const hexrgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const tohex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const l2s = (v) => { v = Math.min(1, Math.max(0, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
const lab = (rgb) => {
  const [r, g, b] = rgb.map(s2l);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const hsv = (c) => { const [r, g, b] = c.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [Math.round((h * 60 + 360) % 360), Math.round(mx ? (d / mx) * 100 : 0), Math.round(mx * 100)]; };

(async () => {
  const h = await open({ width: 640, height: 360 });
  const rows = [];
  for (const [name, eye, target, hex, cond] of P) {
    const px = await h.page.evaluate(([e, t]) => {
      __game.clearView(); __game.setTimeScale(0);
      __game.teleport(e[0], e[1] - __game.CONFIG.player.eye, e[2]); __game.lookAt(t[0], t[1], t[2]);
      __game.render();
      const gl = document.getElementById('view').getContext('webgl2');
      const n = 21, buf = new Uint8Array(n * n * 4);
      gl.readPixels((gl.drawingBufferWidth - n) >> 1, (gl.drawingBufferHeight - n) >> 1, n, n, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const ch = [[], [], []];
      for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) ch[k].push(buf[i * 4 + k]);
      return ch.map((a) => { a.sort((x, y) => x - y); return [a[a.length >> 1], a[0], a[a.length - 1]]; });
    }, [eye, target]);
    const rgb = px.map((c) => c[0]), spread = Math.max(...px.map((c) => c[2] - c[1]));
    rows.push({ name, cond, palette: hex, rendered: tohex(rgb), rgb, spread, hsv: hsv(rgb), dEfromPalette: +dE(rgb, hexrgb(hex)).toFixed(1) });
  }
  await h.browser.close();

  // lighting factor per condition, measured from the mid-grey cover colour (and the wall for 'side')
  const factor = {};
  const fOf = (row) => row.rgb.map((v, i) => s2l(v) / s2l(hexrgb(row.palette)[i]));
  const get = (n) => rows.find((r) => r.name === n);
  factor['top shade'] = fOf(get('cover top shade (game box)'));
  factor['side shade'] = fOf(get('cover side shade (game box)'));
  factor['top sun'] = fOf(get('cover top sun (marble ramp)'));
  factor['west sun'] = fOf(get('cover west face sun (C-f block)'));
  factor['under shade'] = fOf(get('desk underside'));
  const TEAM = { 'Green #2FA84A': '#2FA84A', 'Green shadow #1F7A36': '#1F7A36', 'Tan #E0C080': '#E0C080', 'Tan shadow #B8975A': '#B8975A' };
  const predicted = {};
  for (const [tn, th] of Object.entries(TEAM)) for (const [cn, f] of Object.entries(factor)) predicted[tn + ' | ' + cn] = hexrgb(th).map((v, i) => l2s(s2l(v) * f[i]));

  // closeness of each environment sample to the team colours: (a) raw hex, (b) as they would render under any condition
  const near = [];
  for (const r of rows) {
    if (r.cond === 'fog') continue;
    let bestRaw = null, bestPred = null;
    for (const [tn, th] of Object.entries(TEAM)) { const d = dE(r.rgb, hexrgb(th)); if (!bestRaw || d < bestRaw.d) bestRaw = { d: +d.toFixed(1), team: tn }; }
    for (const [pn, pc] of Object.entries(predicted)) { const d = dE(r.rgb, pc); if (!bestPred || d < bestPred.d) bestPred = { d: +d.toFixed(1), as: pn, colour: tohex(pc) }; }
    near.push({ name: r.name, rendered: r.rendered, nearestRawTeam: bestRaw, nearestRenderedTeam: bestPred });
  }
  near.sort((a, b) => a.nearestRenderedTeam.d - b.nearestRenderedTeam.d);

  const pair = (env, team) => ({ env, envColour: get(env).rendered, team, teamColour: tohex(predicted[team]), dE: +dE(get(env).rgb, predicted[team]).toFixed(1) });
  const pairs = [pair('bed top shade', 'Tan #E0C080 | top shade'), pair('bed top shade', 'Tan shadow #B8975A | top shade'), pair('bed top sun', 'Tan #E0C080 | top sun'), pair('bed top sun', 'Tan shadow #B8975A | top sun'),
    pair('bed side east', 'Tan #E0C080 | side shade'), pair('bed side east', 'Tan shadow #B8975A | side shade'), pair('ceiling', 'Tan #E0C080 | side shade'), pair('ceiling', 'Tan shadow #B8975A | side shade'),
    pair('shelf board underside', 'Tan shadow #B8975A | side shade'), pair('shelf post west face', 'Tan #E0C080 | side shade'), pair('skirting', 'Tan #E0C080 | side shade'), pair('shelf board top', 'Tan #E0C080 | top shade'),
    pair('wall north', 'Tan #E0C080 | side shade'), pair('wall north', 'Green #2FA84A | side shade'), pair('floor shade', 'Tan shadow #B8975A | side shade'), pair('floor shade', 'Green shadow #1F7A36 | side shade'),
    pair('cover side shade (game box)', 'Tan shadow #B8975A | side shade'), pair('route side shade (stairs)', 'Tan #E0C080 | side shade'), pair('string (yo-yo) west face', 'Tan #E0C080 | side shade')];
  const cmp = (a, b) => ({ a, b, dE: +dE(get(a).rgb, get(b).rgb).toFixed(1) });
  const contrasts = [cmp('fog: south wall from 8', 'fog: south wall from 155'), cmp('fog: south wall from 8', 'fog: south wall from 80'), cmp('ceiling', 'ceiling light fitting'), cmp('floor shade', 'floor sun'), cmp('floor shade', 'floor under bed'),
    cmp('floor under bed', 'bed underside'), cmp('route side shade (stairs)', 'string (yo-yo) west face'), cmp('route top shade (landing)', 'bed top sun'), cmp('route side shade (stairs)', 'bed side east'), cmp('wall north', 'cover side shade (game box)'),
    cmp('wall north', 'desk leg west face'), cmp('cover side shade (game box)', 'desk leg west face'), cmp('cover top shade (game box)', 'desk top'), cmp('spare soldier side', 'cover side shade (game box)'), cmp('skirting', 'shelf post west face'), cmp('bed top shade', 'bed top sun')];
  const out = { rows, pairs, contrasts, factor: Object.fromEntries(Object.entries(factor).map(([k, v]) => [k, v.map((x) => +x.toFixed(3))])),
    predictedTeam: Object.fromEntries(Object.entries(predicted).map(([k, v]) => [k, tohex(v)])), nearTeam: near };
  fs.writeFileSync(path.resolve(__dirname, 'visual_colours_result.json'), JSON.stringify(out, null, 1));
  for (const r of rows) console.log(r.name.padEnd(34), r.cond.padEnd(12), 'palette', r.palette, '-> rendered', r.rendered, 'hsv', JSON.stringify(r.hsv), 'dE', r.dEfromPalette, r.spread > 6 ? '(spread ' + r.spread + ')' : '');
  console.log('\nlight factor (linear rendered / linear albedo):', JSON.stringify(out.factor));
  console.log('\npredicted team colours:'); for (const [k, v] of Object.entries(out.predictedTeam)) console.log('  ', k.padEnd(40), v);
  console.log('\nenvironment samples closest to a team colour (dE76; under 10 is hard to tell apart at a glance, under 20 is close):');
  console.log('\nspecific pairs (environment vs team colour under the same light):'); for (const q of pairs) console.log('  ', q.env.padEnd(30), q.envColour, 'vs', q.team.padEnd(36), q.teamColour, 'dE', q.dE);
  console.log('\ncontrast between pairs of environment samples:'); for (const q of contrasts) console.log('  ', (q.a + '  <->  ' + q.b).padEnd(76), 'dE', q.dE);
  for (const n of near.slice(0, 16)) console.log('  ', n.name.padEnd(34), n.rendered, ' vs rendered team: dE', String(n.nearestRenderedTeam.d).padEnd(5), n.nearestRenderedTeam.as, n.nearestRenderedTeam.colour, ' | vs raw hex: dE', n.nearestRawTeam.d, n.nearestRawTeam.team);
})().catch((e) => { console.error(e); process.exit(1); });
