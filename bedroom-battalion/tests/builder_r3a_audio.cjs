// Round 3A audio: real click unlocks audio; train whistle, clacks and rumble actually start nodes with no thrown errors;
// rumble follows distance and doppler; pistol and jump carry-overs play.
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 960, height: 540 });
  await page.evaluate(() => {
    window._au = { starts: 0, throws: [] };
    for (const P of [OscillatorNode.prototype, AudioBufferSourceNode.prototype]) { const f = P.start; P.start = function (...a) { window._au.starts++; return f.apply(this, a); }; }
    for (const name of ['setValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
      const f = AudioParam.prototype[name];
      AudioParam.prototype[name] = function (...a) { try { return f.apply(this, a); } catch (e) { window._au.throws.push(name + ': ' + e.message); throw e; } };
    }
  });
  await page.click('#title');
  const r = await page.evaluate(() => {
    const g = __game, out = {}, st = () => g.state(), car = (t) => st().train.cars.find((c) => c.type === t);
    g.setTimeScale(0);
    const ctxState = () => { try { return document.querySelector('canvas') && window._au; } catch (e) { return null; } };
    // whistle: stand by the west straight at z 80 and wait for the engine to pass
    g.teleport(47, 0, 80, Math.PI / 2, 0);
    let n = 0; while (!(car('engine').pos[0] < 43.05 && car('engine').pos[2] > 83 && car('engine').pos[2] < 86) && n < 7000) { g.step(1 / 60); n++; }
    const s0 = window._au.starts, a0 = g.audioLog.length, w0 = st().train.whistles;
    const rum = [];
    for (let i = 0; i < 60 * 6; i++) { g.step(1 / 60); if (i % 10 === 0) { g.render(); const t = st().train.rumble; rum.push([+st().time.toFixed(2), t.gain, t.rate, car('engine').pos[2]]); } }
    const names = {}; for (const e of g.audioLog.slice(-60)) names[e.name] = (names[e.name] || 0) + 1;
    out.trainSounds = { whistles: st().train.whistles - w0, sourcesStarted: window._au.starts - s0, recentLogNames: names, throws: window._au.throws.slice() };
    out.rumbleNearPass = rum.filter((x, i) => i % 3 === 0);
    // rumble far away
    g.teleport(110, 0, 150); g.step(0.5); g.render(); out.rumbleFar = st().train.rumble;
    // carry-overs: pistol shot and jump play their layers
    g.teleport(60, 0, 40, 0, 0); g.selectWeapon('pistol'); g.step(0.5);
    const p0 = window._au.starts; g.fire(); const pistolStarts = window._au.starts - p0;
    g.step(0.5); const j0 = window._au.starts; g.setInput({ jump: true }); g.step(1 / 60); g.setInput({ jump: false }); g.step(1); const jumpStarts = window._au.starts - j0;
    out.carryAudio = { pistolSourcesStarted: pistolStarts, jumpAndLandSourcesStarted: jumpStarts, lastNames: g.audioLog.slice(-4).map((e) => e.name) };
    out.throwsTotal = window._au.throws.length; out.phase = st().phase;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
