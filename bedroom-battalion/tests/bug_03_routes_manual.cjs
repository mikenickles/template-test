// Check 2 (part B): the routes driven the way a player would, with raw setInput + step + look/lookAt only.
// "Lane" tests: aim once along the route, hold W (optionally Shift), and see whether the top is reached.
// Lanes cover the whole width of every ramp / stair, including the edges where the capsule overhangs.
// Usage: node bug_03_routes_manual.cjs [filter]
const { boot } = require('./bug_lib.cjs');
const filter = process.argv[2] || '';

(async () => {
  const { browser, page, errors } = await boot();
  const res = await page.evaluate((filter) => {
    const G = __game, out = [];
    const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    // lane: hold `input` with a fixed yaw from `start` until success(p) / stuck / timeout
    const lane = (name, start, yaw, success, o = {}) => {
      if (filter && !name.includes(filter)) return;
      T.reset();
      G.teleport(start[0], start[1], start[2], yaw, 0); G.step(0.25);
      const p0 = T.st();
      const input = Object.assign({ forward: true, sprint: !!o.sprint }, o.input || {});
      G.setInput(input);
      const max = Math.round((o.secs || 12) * 60);
      let still = 0, result = 'timeout', t = 0, fell = false, lastGroundY = p0.y;
      for (let i = 0; i < max; i++) {
        G.step(1 / 60); t = (i + 1) / 60;
        const p = T.st();
        if (o.onTick) o.onTick(p, i);
        if (success(p)) { result = 'ok'; break; }
        if (p.onGround && Math.hypot(p.vx, p.vz) < 0.05 || (p.onGround && Math.hypot(p.x - (lane._px || 0), p.z - (lane._pz || 0)) < 1e-4)) still++; else still = 0;
        lane._px = p.x; lane._pz = p.z;
        if (o.fail && o.fail(p)) { result = 'fail'; break; }
        if (still > 60) { result = 'STUCK'; break; }
      }
      G.clearInput(); G.step(0.3);
      const p = T.st();
      out.push({ name, sprint: !!o.sprint, result, t: +t.toFixed(2), start, startOnGround: p0.onGround, end: T.pos(), hp: p.health, dmg: G.damageLog.map((d) => +d.amount.toFixed(1)), rescues: G.rescueLog.length, inside: T.inside() });
    };
    const both = (fn) => { fn(false); fn(true); };

    // ---------------- bed_blanket: wedge x 20..32, z 25 (y0) to z 45 (y18) ----------------
    both((sp) => {
      for (const x of [19.7, 20.05, 20.5, 23, 26, 29, 31.5, 31.95, 32.3])
        lane(`bed_blanket up lane x=${x}`, [x, 0, 22], YAW.s, (p) => p.onGround && p.y > 17.99 && p.z > 46, { sprint: sp });
      for (const x of [20.05, 20.5, 23, 26, 29, 31.5, 31.95])
        lane(`bed_blanket down lane x=${x}`, [x, 18, 48], YAW.n, (p) => p.onGround && p.y < 0.01 && p.z < 24.5, { sprint: sp });
      // diagonal approaches across the slope
      for (const [sx, sz, tx, tz] of [[20.6, 22, 31.4, 46], [31.4, 22, 20.6, 46], [15, 20, 26, 47], [37, 20, 26, 47], [26, 15, 21, 47], [26, 15, 31, 47]])
        lane(`bed_blanket up diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 0, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 17.99 && p.z > 45.5, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[21, 48, 31, 23], [31, 48, 21, 23], [10, 50, 26, 30], [34, 50, 26, 30]])
        lane(`bed_blanket down diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 18, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y < 0.01, { sprint: sp });
    });

    // ---------------- bed_books: stairs x 22..30, foot z 142, top z 115 (y 18) ----------------
    both((sp) => {
      for (const x of [21.7, 22.05, 22.5, 24, 26, 28, 29.5, 29.95, 30.3])
        lane(`bed_books up lane x=${x}`, [x, 0, 145], YAW.n, (p) => p.onGround && p.y > 17.99 && p.z < 114.5, { sprint: sp });
      for (const x of [22.05, 22.5, 24, 26, 28, 29.5, 29.95])
        lane(`bed_books down lane x=${x}`, [x, 18, 112], YAW.s, (p) => p.onGround && p.y < 0.01 && p.z > 142.4, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[22.6, 145, 29.4, 113], [29.4, 145, 22.6, 113], [17, 147, 26, 114], [35, 147, 26, 114], [26, 150, 23, 112], [26, 150, 29, 112]])
        lane(`bed_books up diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 0, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 17.99 && p.z < 114.8, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[23, 112, 29, 144], [29, 112, 23, 144], [12, 110, 26, 135], [33, 110, 26, 135]])
        lane(`bed_books down diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 18, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y < 0.01, { sprint: sp });
    });

    // ---------------- bed_spring: pad 36.5..39.5, 78.5..81.5 ----------------
    both((sp) => {
      for (let a = 0; a < 360; a += 30) {
        const sx = 38 + 5 * Math.cos(a * Math.PI / 180), sz = 80 + 5 * Math.sin(a * Math.PI / 180);
        if (sx < 35.6) continue;      // that start would be under the bed slab edge
        lane(`bed_spring walk onto pad from ${a}deg, keep holding W`, [sx, 0, sz], T.yawOf(38 - sx, 80 - sz), (p) => p.onGround && p.y > 17.99, { sprint: sp, secs: 6, fail: (p) => p.onGround && p.x < 34 && p.y < 1 });
      }
      // from under the bed, walking east onto the pad
      lane('bed_spring from under the bed (x=31) walking east, keep holding W', [31, 0, 80], YAW.e, (p) => p.onGround && p.y > 17.99, { sprint: sp, secs: 8 });
      // clip the corners / edges of the pad
      for (const [sx, sz, yaw, tag] of [[42, 78.2, YAW.w, 'north edge z=78.2'], [42, 81.8, YAW.w, 'south edge z=81.8'], [39.8, 75, YAW.s, 'east edge x=39.8'], [36.2, 75, YAW.s, 'west edge x=36.2'], [41, 77, T.yawOf(-1, 1), 'NE corner diagonal']])
        lane(`bed_spring clip pad ${tag}`, [sx, 0, sz], yaw, (p) => p.onGround && p.y > 17.99, { sprint: sp, secs: 6 });
    });
    // pad with other keys held during the flight
    for (const [tag, inp] of [['no keys in flight', {}], ['back', { back: true }], ['left', { left: true }], ['right', { right: true }], ['forward+left', { forward: true, left: true }], ['jump held', { jump: true }], ['crouch held', { crouch: true }], ['back+sprint', { back: true, sprint: true }]]) {
      let launched = false;
      lane(`bed_spring flight holding: ${tag}`, [43, 0, 80], YAW.w, (p) => launched && p.onGround, { secs: 6, input: {}, onTick: (p) => { if (!launched && p.vy > 20) { launched = true; G.clearInput(); G.setInput(inp); } } });
    }
    // jump onto the pad, sprint-jump over it, crouch-walk onto it
    lane('bed_spring jump onto the pad (land on it)', [41.2, 0, 80], YAW.w, (p) => p.onGround && p.y > 17.99, { secs: 6, input: { forward: true, jump: true } });
    lane('bed_spring crouch-walk onto the pad', [42, 0, 80], YAW.w, (p) => p.onGround && p.y > 17.99, { secs: 8, input: { forward: true, crouch: true } });

    // ---------------- desk_skate part 1: skateboard x 86..92, z 50 (y0) to z 73 (y17) ----------------
    both((sp) => {
      for (const x of [85.7, 86.05, 86.5, 87.5, 89, 90.5, 91.5, 91.95, 92.3])
        lane(`skateboard up lane x=${x}`, [x, 0, 47], YAW.s, (p) => p.onGround && p.y > 16.99 && p.z > 73.6, { sprint: sp });
      for (const x of [86.7, 87.5, 89, 90.5, 91.5, 91.95])
        lane(`skateboard down lane x=${x}`, [x, 17, 75], YAW.n, (p) => p.onGround && p.y < 0.01 && p.z < 49.5, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[86.6, 47, 91.4, 74], [91.4, 47, 86.6, 74], [82, 45, 89, 60], [96, 45, 89, 60]])
        lane(`skateboard up diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 0, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 16.99 && p.z > 73.4, { sprint: sp });
    });
    // ---------------- desk_skate part 2: ruler north x 92.5..95.5, z 75 (y17) up to z 64 (y26) ----------------
    both((sp) => {
      for (const x of [92.2, 92.55, 93, 93.5, 94, 94.5, 94.7, 95, 95.45, 95.8])
        lane(`ruler north up lane x=${x}`, [x, 17, 78], YAW.n, (p) => p.onGround && p.y > 25.99 && p.z < 64.6, { sprint: sp });
      for (const x of [92.55, 93, 94, 94.5, 94.59])
        lane(`ruler north down lane x=${x}`, [x, 26, 64.2], YAW.s, (p) => p.onGround && p.y < 17.01 && p.z > 75.5, { sprint: sp });
      // natural: stand in the middle of the seat, aim at the desk corner at the top of the ruler
      for (const [sx, sz, tx, tz] of [[91, 80, 95, 64], [89, 78, 96, 64], [93, 79, 95.3, 66], [95.5, 80, 93, 64]])
        lane(`ruler north up diagonal from seat (${sx},${sz}) toward (${tx},${tz})`, [sx, 17, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 25.99, { sprint: sp });
    });

    // ---------------- desk_stairs part 1: chair stairs x 86..92, foot z 110.2, top z 87 (y17) ----------------
    both((sp) => {
      for (const x of [85.7, 86.05, 86.5, 87.5, 89, 90.5, 91.5, 91.95, 92.3])
        lane(`chair stairs up lane x=${x}`, [x, 0, 113], YAW.n, (p) => p.onGround && p.y > 16.99 && p.z < 86.4, { sprint: sp });
      for (const x of [86.7, 87.5, 89, 90.5, 91.5, 91.95])
        lane(`chair stairs down lane x=${x}`, [x, 17, 85], YAW.s, (p) => p.onGround && p.y < 0.01 && p.z > 110.6, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[86.6, 113, 91.4, 86], [91.4, 113, 86.6, 86], [82, 115, 89, 100], [96, 115, 89, 100]])
        lane(`chair stairs up diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 0, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 16.99 && p.z < 86.6, { sprint: sp });
    });
    // ---------------- desk_stairs part 2: ruler south x 92.5..95.5, z 85 (y17) up to z 96 (y26) ----------------
    both((sp) => {
      for (const x of [92.2, 92.55, 93, 93.5, 94, 94.5, 94.7, 95, 95.45, 95.8])
        lane(`ruler south up lane x=${x}`, [x, 17, 82], YAW.s, (p) => p.onGround && p.y > 25.99 && p.z > 95.4, { sprint: sp });
      for (const x of [92.55, 93, 94, 94.5, 94.59])
        lane(`ruler south down lane x=${x}`, [x, 26, 95.8], YAW.n, (p) => p.onGround && p.y < 17.01 && p.z < 84.5, { sprint: sp });
    });

    // ---------------- tall_stairs: x 103.5..108, foot z 151, top z 122.1 (y 20), landing to z 116 ----------------
    both((sp) => {
      for (const x of [103.2, 103.55, 104, 105, 105.75, 106.5, 107.5, 107.7, 107.95, 108.3])
        lane(`tall stairs up lane x=${x}`, [x, 0, 154], YAW.n, (p) => p.onGround && p.y > 19.99 && p.z < 121.5, { sprint: sp });
      for (const x of [103.55, 104, 105, 105.75, 106.5, 107.5, 107.95])
        lane(`tall stairs down lane x=${x}`, [x, 20, 119], YAW.s, (p) => p.onGround && p.y < 0.01 && p.z > 151.4, { sprint: sp });
      for (const [sx, sz, tx, tz] of [[104, 154, 107.5, 121], [107.5, 154, 104, 121], [99, 156, 105.75, 140], [105.75, 158, 107.9, 130]])
        lane(`tall stairs up diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 0, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && p.y > 19.99, { sprint: sp });
    });
    // ---------------- small_stairs: mirror. foot z 9, top z 37.9, landing to z 44 ----------------
    both((sp) => {
      for (const x of [103.2, 103.55, 104, 105, 105.75, 106.5, 107.5, 107.7, 107.95, 108.3])
        lane(`small stairs up lane x=${x}`, [x, 0, 6], YAW.s, (p) => p.onGround && p.y > 19.99 && p.z > 38.5, { sprint: sp });
      for (const x of [103.55, 104, 105, 105.75, 106.5, 107.5, 107.95])
        lane(`small stairs down lane x=${x}`, [x, 20, 41], YAW.n, (p) => p.onGround && p.y < 0.01 && p.z < 8.6, { sprint: sp });
    });
    // ---------------- bridges: x 110..113. south z 105 (y26) to z 116 (y20); north z 55 (y26) to z 44 (y20) ----------------
    both((sp) => {
      for (const x of [109.7, 110.05, 110.5, 111.5, 112.5, 112.95, 113.3]) {
        lane(`tall bridge desk>L1 lane x=${x}`, [x, 26, 103], YAW.s, (p) => p.onGround && Math.abs(p.y - 20) < 0.01 && p.z > 117, { sprint: sp });
        lane(`tall bridge L1>desk lane x=${x}`, [x, 20, 118], YAW.n, (p) => p.onGround && Math.abs(p.y - 26) < 0.01 && p.z < 104, { sprint: sp });
        lane(`small bridge desk>L1 lane x=${x}`, [x, 26, 57], YAW.n, (p) => p.onGround && Math.abs(p.y - 20) < 0.01 && p.z < 43, { sprint: sp });
        lane(`small bridge L1>desk lane x=${x}`, [x, 20, 42], YAW.s, (p) => p.onGround && Math.abs(p.y - 26) < 0.01 && p.z > 56, { sprint: sp });
      }
      for (const [sx, sz, tx, tz] of [[107, 100, 112.9, 117], [116, 100, 110.1, 117], [110.3, 104, 112.7, 116]])
        lane(`tall bridge desk>L1 diagonal from (${sx},${sz}) toward (${tx},${tz})`, [sx, 26, sz], T.yawOf(tx - sx, tz - sz), (p) => p.onGround && Math.abs(p.y - 20) < 0.01 && p.z > 116.5, { sprint: sp });
    });
    // ---------------- tunnel_drop: seat -> west through the chair-back gap -> tunnel roof (y 8) ----------------
    for (const [tag, inp] of [['walk', { forward: true }], ['sprint', { forward: true, sprint: true }], ['crouch', { forward: true, crouch: true }]])
      for (const z of [74.3, 74.65, 76, 80, 84, 85.35, 85.7])
        lane(`tunnel_drop ${tag} lane z=${z}`, [91, 17, z], YAW.w, (p) => p.onGround && Math.abs(p.y - 8) < 0.01, { secs: 8, input: inp, fail: (p) => p.onGround && p.y < 1 });
    return out;
  }, filter);

  let bad = 0;
  for (const r of res) {
    const flag = r.result !== 'ok' || r.dmg.length || r.rescues || r.inside.length;
    if (flag) bad++;
    console.log(`${flag ? '!!' : '  '} ${r.result.padEnd(7)} ${r.sprint ? 'sprint' : 'walk  '} ${r.name}  t=${r.t} end=${JSON.stringify(r.end)}${r.dmg.length ? ' dmg=' + JSON.stringify(r.dmg) + ' hp=' + r.hp : ''}${r.rescues ? ' RESCUES=' + r.rescues : ''}${r.inside.length ? ' INSIDE=' + r.inside : ''}${r.startOnGround ? '' : ' (start in air)'}`);
  }
  console.log(`\n${res.length} lanes, ${bad} flagged`);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
