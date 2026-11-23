// Round 2 pass 3, item 4: shader programs created at load vs after the first shot, grenade aim and burst, and render() time of the
// first burst frame vs later bursts. Usage: node builder_r2b_shaders.cjs [path to index.html variant]
const path = require('path'), fs = require('fs'); const { chromium } = require('playwright');
const FILE = process.argv[2] || path.resolve(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = [];
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver|GPU stall|fallback to software/i.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => { window.__programs = 0; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const o = C.prototype.createProgram; C.prototype.createProgram = function () { window.__programs++; return o.apply(this, arguments); }; } });
  await p.route(/three@[\d.]+\/(.*)$/, (r) => { const m = r.request().url().match(/three@[\d.]+\/(.*?)(\?.*)?$/); r.fulfill({ body: fs.readFileSync(path.join(__dirname, 'node_modules/three', m[1])), contentType: 'text/javascript' }); });
  await p.goto('file://' + FILE); await p.waitForFunction(() => window.__game && window.__game.ready);
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const g = __game, o = {}; g.start({ pointerLock: false }); g.setTimeScale(0); g.render(); o.atLoad = __programs;
    const t = (f) => { const a = performance.now(); f(); return +(performance.now() - a).toFixed(1); };
    g.teleport(60, 0, 60, 0, 0); g.step(1); g.render(); o.idleRender = t(() => g.render());
    o.firstShotRender = t(() => { g.fire(); g.render(); }); o.afterShot = __programs;
    g.give('grenade'); g.setInput({ grenade: true }); g.step(0.2); o.firstAimRender = t(() => g.render()); o.afterAim = __programs;
    const burst = () => { g.setInput({ grenade: false }); g.step(1 / 60); let k = 0; while (g.grenades.length && k < 200) { g.step(1 / 60); k++; } return t(() => g.render()); };
    o.firstBurstRender = burst(); o.afterBurst = __programs;
    o.laterBursts = []; for (let i = 0; i < 4; i++) { g.step(1); g.render(); g.give('grenade'); g.setInput({ grenade: true }); g.step(0.2); g.render(); o.laterBursts.push(burst()); }
    g.clearInput(); return o;
  });
  console.log(path.basename(FILE), JSON.stringify(r), 'errors', JSON.stringify(errors)); await b.close();
})();
