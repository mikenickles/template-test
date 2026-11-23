// Round 4 fix pass, R4-3: offline audio renders (OfflineAudioContext, no speakers). A rifle shot 30 units away at +60 and -60
// degrees from the view direction, left and right channel levels; the same shot straight ahead; both creaks at their loudest;
// a bot footstep at 10 and 30 units (range 25).
const { launch } = require('./harness.cjs');
(async () => {
  const { browser, page, errors } = await launch({ width: 640, height: 360 });
  const r = await page.evaluate(async () => {
    const g = __game; g.start({ pointerLock: false }); g.setTimeScale(0); g.teleport(60, 0, 60); g.look(0, 0); g.render();
    const eye = [60, 1.6, 60], at = (deg, d) => { const a = deg * Math.PI / 180; return [eye[0] + Math.sin(a) * d, eye[1], eye[2] - Math.cos(a) * d]; };   // yaw 0 looks north (-z); +deg to the right
    const out = {};
    out.shotRight60 = await g.audioOffline([{ name: 'shot_rifle', at: at(60, 30) }]);
    out.shotLeft60 = await g.audioOffline([{ name: 'shot_rifle', at: at(-60, 30) }]);
    out.shotAhead = await g.audioOffline([{ name: 'shot_rifle', at: at(0, 30) }]);
    out.creakRoomMax = await g.audioOffline([{ name: 'creak_room', vol: 1.0, pitch: 1.1 }], 2);
    out.creakBedMax = await g.audioOffline([{ name: 'creak_bed', vol: 1.0, pitch: 1.1 }], 2);
    out.step10 = await g.audioOffline([{ name: 'step_wood', at: at(90, 10), vol: 0.6 }], 0.5);
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
