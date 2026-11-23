// Round 4: how well an enemy (Tan) soldier stands out, round 3 against round 4B, at 20 / 40 / 60 / 90 u in front of busy backgrounds.
// For each background a target spot and a pattern for what should be behind it; the camera is placed at distance d on a clear line whose
// continuation past the soldier hits that background. Two frames per view (soldier there / soldier hidden below the floor) give the soldier's
// pixel area, local contrast (dE76 against what it covers) and silhouette contrast (its mean colour against the ring around it).
const fs = require('fs');
const { launch } = require('./harness.cjs');
const { execSync } = require('child_process');
const S = '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad';
const BUILDS = { r3: S + '/index_r3.html', r4b: __dirname + '/../snapshots/index_r4b.html' };
const SCENES = [   // name, target feet, background id pattern, camera height above the target's feet (extra rise per unit of distance)
  ['plain floor', [60, 0, 40], '.', 1.6, 0],
  ['letter blocks', [38.5, 0, 124.4], 'W-a|E-a|C-f', 1.6, 0],
  ['books (chair stairs)', [84.6, 0, 95], 'books', 1.6, 0],
  ['quilt (on the bed, seen from above)', [27, 18, 85], 'bed|blanket|pillow|sheet', 1.6, 0.3],
  ['under the bed', [22, 0, 80], '.', 1.6, 0],
  ['sunbeam', [48, 0, 82], '.', 1.6, 0],
];
const D = [20, 40, 60, 90];
(async () => {
  const out = {};
  for (const build in BUILDS) {
    const h = await launch({ file: BUILDS[build] });
    await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r4_lib.js', 'utf8') });
    await h.page.evaluate(() => { window.requestAnimationFrame = () => 0; const G = __game; G.startMatch({ difficulty: 'regular', seed: 1, autoplay: false }); G.setTimeScale(0); G.step(0.5); });
    for (const [name, tgt, pat, eyeH, rise] of SCENES) for (const d of D) {
      const cam = await h.page.evaluate(([tgt, pat, eyeH, rise, d]) => { const G = __game, re = new RegExp(pat);
        for (let a = 0; a < 360; a += 3) { const ca = Math.sin(a * Math.PI / 180), sa = Math.cos(a * Math.PI / 180); const cx = tgt[0] + d * ca, cz = tgt[2] + d * sa, cy = tgt[1] + eyeH + rise * d;
          if (cx < 1 || cx > 119 || cz < 1 || cz > 159 || cy > 88) continue;
          // eye to the soldier's chest and head clear
          let ok = true; for (const hy of [0.9, 1.6]) { const v = [tgt[0] - cx, tgt[1] + hy - cy, tgt[2] - cz], L = Math.hypot(...v); const r = G.raycast([cx, cy, cz], v); if (r && r.distance < L - 0.6) ok = false; }
          if (!ok) continue;
          // the camera itself must not be inside something: a short ray upward and the floor below within reason
          const v = [tgt[0] - cx, tgt[1] + 0.9 - cy, tgt[2] - cz], L = Math.hypot(...v); const beyond = G.raycast([tgt[0] + v[0] / L * 0.8, tgt[1] + 0.9 + v[1] / L * 0.8, tgt[2] + v[2] / L * 0.8], v);
          if (pat !== '.' && !(beyond && re.test(beyond.id) && beyond.distance < 25)) continue;
          return { cam: [cx, cy, cz], behind: beyond ? beyond.id + ' @' + beyond.distance.toFixed(1) : 'none' }; }
        return null; }, [tgt, pat, eyeH, rise, d]);
      const key = name + ' | ' + d + ' u';
      if (!cam) { (out[key] = out[key] || {})[build] = 'no view'; continue; }
      const shots = [];
      for (const show of [true, false]) {
        await h.page.evaluate(([tgt, cam, show]) => { const G = __game; const tan = G.bots.find((b) => b.team === 'tan');
          const yaw = Math.atan2(-(cam[0] - tgt[0]), -(cam[2] - tgt[2]));
          R4.stage(tan.id, show ? tgt : [5, -60, 5], yaw); if (show) { G.step(1 / 60); R4.stage(tan.id, tgt, yaw); }   // no step for the second frame: the train and everything else stay put
          G.teleport(cam[0], cam[1] - 1.6, cam[2]); G.lookAt(tgt[0], tgt[1] + 0.9, tgt[2]); G.render(); }, [tgt, cam.cam, show]);
        shots.push((await h.page.screenshot()).toString('base64'));
        if (show && (d === 20 || d === 60)) fs.writeFileSync(__dirname + `/../screenshots/round4/feel_det_${build}_${name.split(' ')[0]}_${d}u.png`, Buffer.from(shots[0], 'base64'));
      }
      const m = await h.page.evaluate(([a, b, d]) => R4.soldierContrast(a, b, d), shots.concat([d]));
      (out[key] = out[key] || {})[build] = Object.assign({ behind: cam.behind }, m);
    }
    console.log(build, 'errors', JSON.stringify(h.errors));
    await h.browser.close();
  }
  fs.writeFileSync(S + '/feel_r4_contrast.json', JSON.stringify(out));
  console.log('view'.padEnd(46), 'r3: px  local  silhouette  busy        r4b: px  local  silhouette  busy');
  for (const k in out) { const f = (v) => (typeof v === 'string' ? v.padEnd(36) : (String(v.px).padStart(6) + String(v.local).padStart(7) + String(v.silhouette).padStart(11) + String(v.busy).padStart(7)).padEnd(36)); console.log(k.padEnd(46), f(out[k].r3 || 'n/a'), f(out[k].r4b || 'n/a')); }
})();
