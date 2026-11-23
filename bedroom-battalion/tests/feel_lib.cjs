// Feel tester helpers. Not a test by itself.
const path = require('path');
const fs = require('fs');
const { launch, GAME } = require('./harness.cjs');

// boot the game, frozen real-time clock, deterministic stepping
async function boot(opts = {}) {
  const h = await launch(opts);
  await h.page.evaluate(() => { __game.start({ pointerLock: false }); __game.setTimeScale(0); __game.clearInput(); });
  // player-eye screenshot: stand at feet (x,y,z), look at target, render, save
  h.eyeShot = async (name, pos, target, extra) => {
    await h.page.evaluate(([pos, target, extra]) => {
      __game.clearView(); __game.clearInput();
      __game.teleport(pos[0], pos[1], pos[2]);
      if (extra && extra.crouch) { __game.setInput({ crouch: true }); __game.step(0.5); }
      else __game.step(1 / 60);
      __game.lookAt(target[0], target[1], target[2]);
      __game.render();
    }, [pos, target, extra || null]);
    return h.shot('round1/' + name);
  };
  return h;
}

// make a temporary copy of index.html with CONFIG text replacements (never touches the real file)
function variant(tag, replacements) {
  let src = fs.readFileSync(GAME, 'utf8');
  for (const [from, to] of replacements) {
    if (!src.includes(from)) throw new Error('variant: text not found: ' + from);
    src = src.replace(from, to);
  }
  const dir = process.env.FEEL_TMP || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad';
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'feel_variant_' + tag + '.html');
  fs.writeFileSync(out, src);
  return out;
}
module.exports = { boot, variant };
