// THE GATE, driven by hand: raw setInput + step + lookAt only (no walkPath, no teleport between legs
// except to put the player at the foot of the route). Targets are my own, taken from DESIGN.md geometry.
// Every route in section 4.4, up and down, walk and sprint. Prints one row per route/direction/gait.
const { boot } = require('./bug_lib.cjs');

(async () => {
  const { browser, page, errors } = await boot();
  const rows = await page.evaluate(() => {
    const G = __game, rows = [];
    // drive: list of steps. ['go', x, z, yExpected] | ['grab', x, z] | ['climb', yTop] | ['descend', yBottom] | ['wait'] | ['off', x, z, yLand]
    const drive = (steps, sprint) => {
      const log = [];
      for (const s of steps) {
        const kind = s[0];
        let r;
        if (kind === 'go') {
          r = T.goTo(s[1], s[2], { sprint, timeout: 25, anyY: true });
          const p = T.st();
          r.good = r.ok && p.onGround && Math.abs(p.y - s[3]) < (s[4] || 0.02);   // s[4]: looser height tolerance for targets on a slope
        } else if (kind === 'grab') {          // walk into a string until the game says we are climbing
          r = T.goTo(s[1], s[2], { sprint, timeout: 8, tol: 0.01, stopIf: (p) => p.climbing });
          r.good = T.st().climbing;
        } else if (kind === 'climb' || kind === 'descend') {
          G.clearInput(); G.step(1 / 60);       // release W first (a string grabbed from the top needs a fresh press to exit)
          G.setInput(kind === 'climb' ? { forward: true } : { back: true });
          let t = 0; while (T.st().climbing && t < 15) { G.step(1 / 60); t += 1 / 60; }
          G.clearInput(); G.step(0.2);
          const p = T.st();
          r = { ok: !p.climbing, t: +t.toFixed(2), pos: T.pos() };
          r.good = !p.climbing && p.onGround && Math.abs(p.y - s[1]) < 0.02;
        } else if (kind === 'wait') {           // ride the spring pad
          let t = 0; G.clearInput(); G.step(0.1); while (!T.st().onGround && t < 6) { G.step(1 / 60); t += 1 / 60; }
          const p = T.st(); r = { ok: true, t: +t.toFixed(2), pos: T.pos() }; r.good = p.onGround && Math.abs(p.y - s[1]) < 0.02;
        } else if (kind === 'off') {            // walk off an edge toward (x, z) and land at yLand
          G.lookAt(s[1], T.st().y + 1.6, s[2]); G.setInput({ forward: true, sprint });
          let t = 0, left = false; while (t < 8) { G.step(1 / 60); t += 1 / 60; const p = T.st(); if (!p.onGround) left = true; if (left && p.onGround) break; }
          G.clearInput(); G.step(0.2);
          const p = T.st(); r = { ok: true, t: +t.toFixed(2), pos: T.pos() }; r.good = p.onGround && Math.abs(p.y - s[3]) < 0.02;
        }
        log.push({ step: s.join(','), good: r.good, why: r.why, t: r.t, pos: r.pos });
        if (!r.good) break;
      }
      return log;
    };
    const run = (route, dir, start, steps) => {
      for (const sprint of [false, true]) {
        T.reset();
        G.teleport(start[0], start[1], start[2], 0, 0); G.step(0.3);
        const log = drive(steps, sprint);
        const p = T.st(), ok = log.every((l) => l.good);
        rows.push({ route, dir, sprint, ok, end: T.pos(), hp: p.health, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), rescues: G.rescueLog.length,
          time: +log.reduce((a, l) => a + (l.t || 0), 0).toFixed(1), failedAt: ok ? null : log[log.length - 1] });
      }
    };

    // ---- bed ----
    run('bed_blanket', 'up', [42, 0, 24], [['go', 26, 23.5, 0], ['go', 26, 47, 18], ['go', 26, 68, 18]]);
    run('bed_blanket', 'down', [26, 18, 68], [['go', 26, 47, 18], ['go', 26, 23.5, 0], ['go', 42, 24, 0]]);
    run('bed_books', 'up', [33, 0, 145], [['go', 26, 144.5, 0], ['go', 26, 113.8, 18], ['go', 17.5, 113.5, 18]]);
    run('bed_books', 'down', [17.5, 18, 113.5], [['go', 26, 113.8, 18], ['go', 26, 144.5, 0], ['go', 33, 145, 0]]);
    run('bed_spring', 'up', [38, 0, 75], [['off', 38, 80, 18], ['go', 27, 80, 18]]);
    run('bed_spring', 'down (step off the east edge, 40 hp expected)', [27, 18, 84], [['off', 45, 84, 0]]);
    run('bed top', 'down (step off the north end beside the slope, 40 hp expected)', [18, 18, 50], [['off', 18, 30, 0]]);

    // ---- desk ----
    const skateUp = [['go', 89, 48.5, 0], ['go', 89, 74.5, 17], ['go', 94, 76.5, 17], ['go', 94, 64.3, 26, 0.5], ['go', 97, 64.3, 26], ['go', 97.5, 80, 26]];
    run('desk_skate', 'up', [84, 0, 48.5], skateUp);
    run('desk_skate', 'down', [97.5, 26, 80], [['go', 97, 64.3, 26], ['go', 94, 64.3, 26, 0.5], ['go', 94, 76.5, 17], ['go', 89, 74.5, 17], ['go', 89, 48.5, 0], ['go', 84, 48.5, 0]]);
    run('desk_stairs', 'up', [84, 0, 111.7], [['go', 89, 111.7, 0], ['go', 89, 85.5, 17], ['go', 94, 83.5, 17], ['go', 94, 95.7, 26, 0.5], ['go', 97, 95.7, 26], ['go', 97.5, 80, 26]]);
    run('desk_stairs', 'down', [97.5, 26, 80], [['go', 97, 95.7, 26], ['go', 94, 95.7, 26, 0.5], ['go', 94, 83.5, 17], ['go', 89, 85.5, 17], ['go', 89, 111.7, 0], ['go', 84, 111.7, 0]]);
    run('desk_yoyo', 'up', [100, 0, 48], [['go', 107, 52, 0], ['grab', 107, 54.5], ['climb', 26], ['go', 107, 57.5, 26]]);
    run('desk_yoyo', 'down', [107, 26, 60], [['grab', 107, 54.5], ['descend', 0], ['go', 100, 48, 0]]);
    run('desk_lace', 'up', [100, 0, 112], [['go', 107, 108, 0], ['grab', 107, 105.5], ['climb', 26], ['go', 107, 102.5, 26]]);
    run('desk_lace', 'down', [107, 26, 100], [['grab', 107, 105.5], ['descend', 0], ['go', 100, 112, 0]]);

    // ---- tall shelf ----
    run('tall_stairs', 'up', [100, 0, 153], [['go', 105.7, 152.5, 0], ['go', 105.7, 120, 20], ['go', 110.5, 120, 20]]);
    run('tall_stairs', 'down', [110.5, 20, 120], [['go', 105.7, 120, 20], ['go', 105.7, 152.5, 0], ['go', 100, 153, 0]]);
    run('tall_bridge', 'up (desk to L1)', [107, 26, 102.5], [['go', 111.5, 103.5, 26], ['go', 111.5, 117.5, 20], ['go', 110.5, 120, 20]]);
    run('tall_bridge', 'down (L1 to desk)', [110.5, 20, 120], [['go', 111.5, 117.5, 20], ['go', 111.5, 103.5, 26], ['go', 107, 102.5, 26]]);
    for (const [id, z, y0, y1] of [['tall_L2_a', 130, 20, 40], ['tall_L2_b', 146, 20, 40], ['tall_L3_a', 136, 40, 60], ['tall_L3_b', 152, 40, 60], ['small_L2_a', 30, 20, 40], ['small_L2_b', 14, 20, 40]]) {
      run(id, 'up', [110.5, y0, z], [['grab', 107.6, z], ['climb', y1], ['go', 110.5, z, y1]]);
      run(id, 'down', [110.5, y1, z], [['grab', 107.6, z], ['descend', y0], ['go', 110.5, z, y0]]);
    }
    // ---- small shelf ----
    run('small_stairs', 'up', [100, 0, 7], [['go', 105.7, 7.5, 0], ['go', 105.7, 40, 20], ['go', 110.5, 40, 20]]);
    run('small_stairs', 'down', [110.5, 20, 40], [['go', 105.7, 40, 20], ['go', 105.7, 7.5, 0], ['go', 100, 7, 0]]);
    run('small_bridge', 'up (desk to L1)', [107, 26, 57.5], [['go', 111.5, 56.5, 26], ['go', 111.5, 42.5, 20], ['go', 110.5, 40, 20]]);
    run('small_bridge', 'down (L1 to desk)', [110.5, 20, 40], [['go', 111.5, 42.5, 20], ['go', 111.5, 56.5, 26], ['go', 107, 57.5, 26]]);
    // ---- tunnel drop ----
    run('tunnel_drop', 'down (one way)', [89, 17, 74.5], [['go', 91, 80, 17], ['off', 77, 80, 8]]);
    run('tunnel roof', 'down (step off the roof to the floor)', [77, 8, 80], [['off', 77, 100, 0]]);

    // ---- whole climbs from the Green spawn point, one continuous drive, no teleports ----
    const whole = (name, steps) => run(name, 'spawn to top', [60, 0, 20], steps);
    whole('WHOLE bed via blanket', [['go', 60, 28, 0], ['go', 42, 24, 0], ['go', 26, 23.5, 0], ['go', 26, 47, 18], ['go', 27, 80, 18]]);
    whole('WHOLE desk via skateboard', [['go', 60, 28, 0], ['go', 78, 30, 0], ['go', 89, 48.5, 0], ['go', 89, 74.5, 17], ['go', 94, 76.5, 17], ['go', 94, 64.3, 26, 0.5], ['go', 97, 64.3, 26], ['go', 97.5, 80, 26]]);
    whole('WHOLE top shelf via desk_yoyo, desk, tall_bridge, L2_a, L3_a, then all the way back down by strings and stairs',
      [['go', 60, 28, 0], ['go', 78, 30, 0], ['go', 100, 46, 0], ['go', 107, 52, 0], ['grab', 107, 54.5], ['climb', 26], ['go', 104, 66, 26], ['go', 104, 94, 26], ['go', 107, 102.5, 26],
        ['go', 111.5, 103.5, 26], ['go', 111.5, 117.5, 20], ['go', 110.5, 130, 20], ['grab', 107.6, 130], ['climb', 40], ['go', 110.5, 130, 40], ['go', 110.5, 136, 40], ['grab', 107.6, 136], ['climb', 60], ['go', 110.5, 136, 60],
        ['go', 110.5, 152, 60], ['grab', 107.6, 152], ['descend', 40], ['go', 110.5, 146, 40], ['grab', 107.6, 146], ['descend', 20], ['go', 110.5, 120, 20], ['go', 105.7, 120, 20], ['go', 105.7, 152.5, 0], ['go', 100, 153, 0]]);
    whole('WHOLE top shelf via tall_stairs, L2_b, L3_b',
      [['go', 60, 28, 0], ['go', 78, 30, 0], ['go', 84, 60, 0], ['go', 83.2, 100, 0], ['go', 90, 134, 0], ['go', 100, 153, 0], ['go', 105.7, 152.5, 0], ['go', 105.7, 120, 20], ['go', 110.5, 120, 20], ['go', 110.5, 146, 20],
        ['grab', 107.6, 146], ['climb', 40], ['go', 110.5, 146, 40], ['go', 110.5, 152, 40], ['grab', 107.6, 152], ['climb', 60], ['go', 110.5, 152, 60]]);
    return rows;
  });
  for (const r of rows) {
    console.log(`${r.ok ? '  ' : '!!'} ${r.ok ? 'ok  ' : 'FAIL'} ${r.sprint ? 'sprint' : 'walk  '} ${r.route} | ${r.dir} | t=${r.time}s end=${JSON.stringify(r.end)} hp=${r.hp} dmg=${JSON.stringify(r.dmg)} rescues=${r.rescues}${r.failedAt ? ' FAILED AT ' + JSON.stringify(r.failedAt) : ''}`);
  }
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
