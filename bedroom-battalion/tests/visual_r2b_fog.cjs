// Round 2 re-check: what the recommended fog distances (20 / 320, live CONFIG.fog, index.html not edited) do to the
// room. Side-by-side of spawn_green and floor_centre, now vs proposed, and the far-wall vs near-wall colour.
const fs = require('fs'); const path = require('path');
const { open, dE, hex, SHOTS } = require('./visual_r2_lib.cjs');
const PFX = process.env.PFX || 'visual_re_';      // re-check 2 runs with PFX=visual_re2_
(async () => {
  const h = await open({ width: 1280, height: 720 });
  const r = await h.page.evaluate(() => {
    const c = document.getElementById('view'), o = document.createElement('canvas'); o.width = 1284; o.height = 724; const g = o.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, o.width, o.height);
    const gl = c.getContext('webgl2'); const px = (fx, fy) => { const b = new Uint8Array(4); gl.readPixels(Math.round(1280 * fx), Math.round(720 * (1 - fy)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]]; };
    const F = __game.CONFIG.fog, keep = [F.near, F.far], out = {};
    [['spawn_green', 0], ['floor_centre', 1]].forEach(([v, row]) => [[keep, 0], [[20, 320], 1]].forEach(([f, col]) => {
      F.near = f[0]; F.far = f[1]; __game.setView(v); __game.render(); g.drawImage(c, 0, 0, 1280, 720, col * 642, row * 362, 640, 360);
      out[v + ' ' + f.join('/')] = { centreFar: px(0.5, 0.55), upperLeft: px(0.1, 0.8), upperRight: px(0.9, 0.8) };
    }));
    // far south wall (140 units away) vs near north wall (20 units) from the Green spawn, same wall colour
    for (const f of [keep, [20, 320]]) { F.near = f[0]; F.far = f[1]; __game.clearView();
      __game.teleport(60, 0, 20, 0, 0); __game.lookAt(20, 30, 0.2); __game.render(); const nearW = px(0.5, 0.5);
      __game.lookAt(20, 30, 159.8); __game.render(); const farW = px(0.5, 0.5); out['walls ' + f.join('/')] = { near: nearW, far: farW }; }
    F.near = keep[0]; F.far = keep[1]; __game.render();
    return { url: o.toDataURL('image/png'), out };
  });
  fs.writeFileSync(path.resolve(SHOTS, 'visual_re_fog_now_vs_20_320.png'.replace('visual_re_', PFX)), Buffer.from(r.url.split(',')[1], 'base64'));
  for (const [k, v] of Object.entries(r.out)) console.log(k.padEnd(24), Object.entries(v).map(([a, b]) => a + ' ' + hex(b)).join('  '), v.near ? 'near-far dE ' + dE(v.near, v.far) : '');
  await h.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
