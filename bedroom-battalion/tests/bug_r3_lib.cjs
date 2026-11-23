// Round 3 (3B) bug-tester helpers: boots index.html (the live build) with T, R2 and R3 page helpers.
const path = require('path');
const { launch } = require('./harness.cjs');
const { installPageHelpers } = require('./bug_lib.cjs');
const { installR2 } = require('./bug_r2_lib.cjs');
const { installR3 } = require('./bug_r3a_lib.cjs');
const GAMEFILE = path.resolve(__dirname, '..', 'index.html');
async function boot(opts = {}) {
  const h = await launch({ width: opts.width || 640, height: opts.height || 360, file: opts.file || GAMEFILE });
  if (opts.start === 'free') await h.page.evaluate(() => { window.__game.start({ pointerLock: false }); window.__game.setTimeScale(0); });
  await h.page.evaluate(installPageHelpers);
  await h.page.evaluate(installR2);
  await h.page.evaluate(installR3);
  return h;
}
module.exports = { boot, GAMEFILE };
