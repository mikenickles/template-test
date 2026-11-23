// Round 3: many autoplayed matches per difficulty, instrumented tick by tick (feel_r3_lib.js). Writes a JSON summary to the scratchpad.
// Usage: node feel_r3_matches.cjs [matchesPerDifficulty] [firstSeed]
const fs = require('fs');
const { boot } = require('./feel_lib.cjs');
const N = +(process.argv[2] || 10), S0 = +(process.argv[3] || 100);
const OUT = (process.env.FEEL_OUT || '/tmp/claude-0/-home-user-template-test/e5a0a630-57da-5f97-8c6a-e45409a74c34/scratchpad') + '/feel_r3_matches.json';
(async () => {
  const h = await boot();
  await h.page.addScriptTag({ content: fs.readFileSync(__dirname + '/feel_r3_lib.js', 'utf8') });
  const all = [];
  for (const diff of ['recruit', 'regular', 'veteran']) for (let i = 0; i < N; i++) {
    const r = await h.page.evaluate(([d, s]) => R3.play({ difficulty: d, seed: s, sample: 2 }), [diff, S0 + i]);
    r.difficulty = diff; r.seed = S0 + i; all.push(r); process.stdout.write(diff[0] + (r.rep.winner || '?')[0] + ' ');
  }
  fs.writeFileSync(OUT, JSON.stringify(all));
  console.log('\nsaved', OUT, 'errors', JSON.stringify(h.errors));
  await h.browser.close();
})();
