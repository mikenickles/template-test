// Check 9: does the build match DESIGN.md? Collider boxes transcribed by hand from sections 3 to 6,
// waypoint nodes parsed straight out of DESIGN.md section 9, CONFIG values from section 2.
// A piece "matches" if the union of build colliders covers exactly the DESIGN volume (sampled), so a wall
// the builder split in two still matches.
const fs = require('fs');
const path = require('path');
const { boot } = require('./bug_lib.cjs');

// [name, kind, x0, x1, z0, z1, y0, y1]   (kind 'box'); cylinders: [name, 'cyl', x, z, r, y0, y1]
// ramps: [name, 'ramp', x0, x1, z0, z1, axis, hAtLow, hAtHigh, thickness]
const B = (n, x0, x1, z0, z1, y0, y1) => [n, 'box', x0, x1, z0, z1, y0, y1];
const C = (n, x, z, r, y0, y1) => [n, 'cyl', x, z, r, y0, y1];
const R = (n, x0, x1, z0, z1, axis, h0, h1, th) => [n, 'ramp', x0, x1, z0, z1, axis, h0, h1, th];
const M = (list) => list.flatMap((b) => b[1] === 'box' ? [b, ['s.' + b[0], 'box', b[2], b[3], 160 - b[5], 160 - b[4], b[6], b[7]]] : [b]);   // mirror rule z' = 160 - z
const EXPECT = [
  // 4.1 bed
  B('bed slab', 0, 35, 45, 115, 6, 18),
  B('bed leg nw', 0, 3, 45, 48, 0, 6), B('bed leg ne', 32, 35, 45, 48, 0, 6), B('bed leg sw', 0, 3, 112, 115, 0, 6), B('bed leg se', 32, 35, 112, 115, 0, 6),
  R('blanket slope', 20, 32, 25, 45, 'z', 0, 18, Infinity),
  R('ridge R1 up', 4, 31, 56, 60, 'z', 18, 20, Infinity), R('ridge R1 down', 4, 31, 60, 64, 'z', 20, 18, Infinity),
  R('ridge R2 up', 13, 17, 70, 90, 'x', 18, 20.4, Infinity), R('ridge R2 down', 17, 21, 70, 90, 'x', 20.4, 18, Infinity),
  B('pillow P1 t0', 2, 16, 100, 112, 18, 18.6), B('pillow P1 t1', 3.2, 14.8, 101.2, 110.8, 18.6, 19.2), B('pillow P1 t2', 4.4, 13.6, 102.4, 109.6, 19.2, 19.8),
  B('pillow P2 t0', 19, 33, 100, 112, 18, 18.6), B('pillow P2 t1', 20.2, 31.8, 101.2, 110.8, 18.6, 19.2), B('pillow P2 t2', 21.4, 30.6, 102.4, 109.6, 19.2, 19.8),
  B('shoebox', 9, 21, 72, 88, 0, 5), B('sock', 4, 14, 52, 55, 0, 1.6),
  ...[[28, 58], [6, 66], [14, 69], [28, 102], [6, 94], [14, 91], [15, 108], [20, 106]].map(([x, z], i) => C('dust bunny ' + i, x, z, 1.5, 0, 2)),
  B('bear body', 4, 16, 35, 45, 0, 9), B('bear head', 6, 14, 39, 45, 9, 15), B('bear leg w', 4, 9, 28, 35, 0, 3), B('bear leg e', 11, 16, 28, 35, 0, 3),
  B('bucket', 4, 16, 115, 127, 0, 10),
  // 4.2 desk and chair
  B('desk top', 95, 120, 55, 105, 24.5, 26),
  B('desk leg nw', 95, 97.5, 55, 57.5, 0, 24.5), B('desk leg ne', 117.5, 120, 55, 57.5, 0, 24.5), B('desk leg sw', 95, 97.5, 102.5, 105, 0, 24.5), B('desk leg se', 117.5, 120, 102.5, 105, 0, 24.5),
  B('chair seat', 85, 96, 73, 87, 15.8, 17),
  B('chair leg nw', 85, 86.2, 73, 74.2, 0, 15.8), B('chair leg ne', 94.8, 96, 73, 74.2, 0, 15.8), B('chair leg sw', 85, 86.2, 85.8, 87, 0, 15.8), B('chair leg se', 94.8, 96, 85.8, 87, 0, 15.8),
  B('chair back post n', 85, 86.2, 73, 74.2, 17, 33), B('chair back post s', 85, 86.2, 85.8, 87, 17, 33), B('chair back panel', 85, 86.2, 73, 87, 22, 33),
  R('skateboard ramp', 86, 92, 50, 73, 'z', 0, 17, 0.6),
  R('ruler ramp north', 92.5, 95.5, 64, 75, 'z', 26, 17, 0.3), R('ruler ramp south', 92.5, 95.5, 85, 96, 'z', 17, 26, 0.3),
  R('ruler bridge north', 110, 113, 44, 55, 'z', 20, 26, 0.3), R('ruler bridge south', 110, 113, 105, 116, 'z', 26, 20, 0.3),
  C('yo-yo body', 111, 52, 2.2, 0, 1.4), C('lamp base', 115, 63, 3.5, 26, 27.2), C('lamp post', 115, 63, 0.6, 27.2, 40), C('mug', 115, 74, 2.8, 26, 33),
  B('notebook', 99, 111, 74, 86, 26, 26.4),
  B('stacked book 0', 111, 119, 86, 93, 26, 27.2), B('stacked book 1', 111.6, 118.4, 86.6, 92.4, 27.2, 28.4), B('stacked book 2', 112.2, 117.8, 87.2, 91.8, 28.4, 29.6),
  C('pencil cup', 115.5, 98, 2.6, 26, 35), B('eraser n', 104, 108, 66, 68, 0, 1.2), B('eraser s', 104, 108, 92, 94, 0, 1.2), C('paper ball', 108, 80, 2.5, 0, 4.5),
  // 4.3 shelves
  ...[['tall', 116, 156, [20, 40, 60]], ['small', 4, 44, [20, 40]]].flatMap(([n, z0, z1, tops]) => [
    ...tops.map((y, i) => B(`${n} shelf board L${i + 1}`, 108, 120, z0, z1, y - 1, y)),
    B(n + ' post a', 108, 109.2, z0, z0 + 1.2, 0, tops[tops.length - 1]), B(n + ' post b', 118.8, 120, z0, z0 + 1.2, 0, tops[tops.length - 1]),
    B(n + ' post c', 108, 109.2, z1 - 1.2, z1, 0, tops[tops.length - 1]), B(n + ' post d', 118.8, 120, z1 - 1.2, z1, 0, tops[tops.length - 1])]),
  B('tall stairs landing', 103.5, 108, 116, 122.1, 0, 20), B('small stairs landing', 103.5, 108, 37.9, 44, 0, 20),
  B('tall L1 upright books', 114, 119.5, 134, 142, 20, 27), B('tall L1 piggy bank', 112.5, 117.5, 123, 127, 20, 24),
  C('tall L2 globe', 115, 142, 4, 40, 50), B('tall L2 upright books', 114, 119.5, 120, 128, 40, 47),
  C('tall L3 trophy', 115, 128, 2.5, 60, 69), B('tall L3 flat books', 112, 119, 142, 149, 60, 61.2),
  B('small L1 upright books', 114, 119.5, 18, 26, 20, 27), C('small L1 plant pot', 115, 36, 2, 20, 24),
  B('small L2 flat books', 112, 119, 20, 27, 40, 41.2), B('small L2 alarm clock', 113, 118, 34, 37, 40, 44),
  // 5.1 forts (Green; Tan is the mirror)
  ...M([B('fort north wall', 46, 74, 6, 7.5, 0, 3.3), B('fort west wall a', 46, 47.5, 7.5, 15, 0, 3.3), B('fort west wall b', 46, 47.5, 19, 24.5, 0, 3.3),
    B('fort east wall a', 72.5, 74, 13, 15, 0, 3.3), B('fort east wall b', 72.5, 74, 19, 24.5, 0, 3.3),
    B('fort front low w', 46, 57.5, 24.5, 26, 0, 1.15), B('fort front low e', 62.5, 74, 24.5, 26, 0, 1.15), B('fort front high w', 46, 57.5, 24.5, 26, 1.85, 3.3), B('fort front high e', 62.5, 74, 24.5, 26, 1.85, 3.3),
    ...[46, 51, 56, 62.5, 67.5, 72.5].map((x) => B('fort slit pillar x' + x, x, x + 1.5, 24.5, 26, 1.15, 1.85)),
    B('fort tower', 67, 74, 6, 13, 0, 7), B('tower parapet north', 67, 74, 6, 6.5, 7, 8.1), B('tower parapet east', 73.5, 74, 6, 13, 7, 8.1)]),
  R('green tower ramp', 53, 67, 7.5, 10.5, 'x', 0, 7, Infinity), R('tan tower ramp', 53, 67, 149.5, 152.5, 'x', 0, 7, Infinity),
  // 5.2 ruin
  ...[['w', 51, 52.5], ['e', 67.5, 69]].flatMap(([t, a, b]) => [B(`ruin ${t} wall n`, a, b, 73, 78.5, 0, 3.4), B(`ruin ${t} sill`, a, b, 78.5, 81.5, 0, 1.2), B(`ruin ${t} wall s`, a, b, 81.5, 87, 0, 3.4)]),
  B('ruin north stub high', 54, 57, 71, 72.5, 0, 3.4), B('ruin north stub low', 57, 61, 71, 72.5, 0, 1.8), B('ruin south stub high', 63, 66, 87.5, 89, 0, 3.4), B('ruin south stub low', 59, 63, 87.5, 89, 0, 1.8),
  B('ruin platform', 57, 63, 77, 83, 0, 1.2), B('ruin pillar', 59, 61, 79, 81, 1.2, 5),
  // 6 floor cover
  ...M([B('W-a block 1', 37, 40, 28, 31, 0, 3), B('W-a block 2', 37, 40, 31, 34, 0, 6), B('W-a block 3', 34, 37, 31, 34, 0, 3), B('W-b toy car', 33, 36, 56, 62, 0, 2.2),
    B('W-c block', 33, 36, 69, 72, 0, 3), B('C-a jumbo crayon 1', 55.7, 57, 29, 38, 0, 1.3), B('C-a jumbo crayon 2', 63, 64.3, 29, 38, 0, 1.3), B('C-b toy car', 52, 55, 43, 49, 0, 2.2),
    ...[62, 63.9, 65.8, 67.7].map((x) => B('C-e domino x' + x, x, x + 1.6, 63, 63.5, 0, 3.2)),
    B('E-a block 1', 80, 83, 30, 33, 0, 6), B('E-a block 2', 83, 86, 30, 33, 0, 3), B('E-a block 3', 80, 83, 33, 36, 0, 3), B('E-b toy car', 110, 116, 46, 49, 0, 2.2)]),
  B('E-c block', 79.5, 82.5, 44, 47, 0, 3), B('tall stair guard', 108, 108.6, 122.1, 151, 0, 19), B('small stair guard', 108, 108.6, 9, 37.9, 0, 19),
  B('desk apron n', 95, 95.5, 64, 75, 17, 24.5), B('desk apron s', 95, 95.5, 85, 96, 17, 24.5),
  C('seat stopper n', 92.45, 73.3, 0.5, 17, 18), C('seat stopper s', 92.2, 86.7, 0.5, 17, 18),
  B('C-c truck bed', 63, 68, 44, 51, 0, 3.6), B('C-c truck cab', 63, 68, 51, 54, 0, 5), B("C-c' marble ramp", 63, 68, 106, 113, 0, 4), B("C-c' marble tower", 63, 68, 113, 116, 0, 8),
  B('C-d game box', 49, 59, 56, 66, 0, 2.5), C("C-d' ball", 54, 99, 3.4, 0, 8), B('C-f block north', 53, 56, 67, 70, 0, 6), B('C-f block south', 64, 67, 90, 93, 0, 6),
  B('tunnel wall w', 72.6, 73.6, 68, 92, 0, 8), B('tunnel wall e', 80.4, 81.4, 68, 92, 0, 8), B('tunnel roof', 72.6, 81.4, 68, 92, 6.8, 8)
];
// stairs: [name, x0, x1, zFoot, dir, n, rise, depth]
const STAIRS = [['bed book stairs', 22, 30, 142, -1, 30, 0.6, 0.9], ['chair book stairs', 86, 92, 110.2, -1, 29, 17 / 29, 0.8], ['tall shelf stairs', 103.5, 108, 151, -1, 34, 20 / 34, 0.85], ['small shelf stairs', 103.5, 108, 9, 1, 34, 20 / 34, 0.85]];
const STRINGS = [['yo-yo', 107, 54.5, 0, 26, 0, 1], ['shoelace', 107, 105.5, 0, 26, 0, -1], ['tall L2 a', 107.6, 130, 20, 40, 1, 0], ['tall L2 b', 107.6, 146, 20, 40, 1, 0], ['tall L3 a', 107.6, 136, 40, 60, 1, 0], ['tall L3 b', 107.6, 152, 40, 60, 1, 0], ['small L2 a', 107.6, 30, 20, 40, 1, 0], ['small L2 b', 107.6, 14, 20, 40, 1, 0]];

// ---- waypoint nodes parsed from DESIGN.md section 9 ----
function parseNodes() {
  const md = fs.readFileSync(path.resolve(__dirname, '..', 'DESIGN.md'), 'utf8');
  const sec = md.slice(md.indexOf('## 9. Waypoint graph'), md.indexOf('## 10. Named views'));
  const nodes = {};
  for (const line of sec.split('\n')) {
    if (!line.startsWith('|') || /---/.test(line) || /Node \|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const names = cells[i].split('/').map((n) => n.trim().replace(/\s*\(.*\)$/, '')).filter(Boolean);
      const poss = [...cells[i + 1].matchAll(/\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/g)].map((m) => [+m[1], +m[2], +m[3]]);
      names.forEach((n, k) => { if (poss[k]) nodes[n] = poss[k]; });
    }
  }
  // 9.1: the fort table is north only; south is mirrored with prefix s.
  for (const k of Object.keys(nodes)) if (k.startsWith('n.f.')) nodes['s.' + k.slice(2)] = [nodes[k][0], nodes[k][1], 160 - nodes[k][2]];
  return nodes;
}

(async () => {
  const { browser, page, errors } = await boot();
  const designNodes = parseNodes();
  const res = await page.evaluate(({ EXPECT, STAIRS, STRINGS, designNodes }) => {
    const G = __game, cols = G.colliders, out = { missing: [], notExact: [], stairs: [], strings: [], nodes: {}, config: [], unclaimed: [] };
    const eq = (a, b) => Math.abs(a - b) < 1e-6;
    const claimed = new Set();
    // is the point solid in the build (boxes and cylinders only)?
    const solidAt = (x, y, z, ids) => { for (const c of cols) { if (c.kind === 'box' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y > c.y0 && y < c.y1) { if (ids) ids.add(c.id); return true; } if (c.kind === 'cyl' && y > c.y0 && y < c.y1 && Math.hypot(x - c.x, z - c.z) < c.r) { if (ids) ids.add(c.id); return true; } } return false; };
    for (const e of EXPECT) {
      const [name, kind] = e;
      if (kind === 'box') {
        const [, , x0, x1, z0, z1, y0, y1] = e;
        const exact = cols.find((c) => c.kind === 'box' && eq(c.x0, x0) && eq(c.x1, x1) && eq(c.z0, z0) && eq(c.z1, z1) && eq(c.y0, y0) && eq(c.y1, y1));
        if (exact) { claimed.add(exact.id); continue; }
        // not one box: is the volume covered exactly by several? sample inside (must be solid) and just outside each face
        const ids = new Set(); let holes = 0, n = 0;
        for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) for (let k = 0; k < 9; k++) { n++; if (!solidAt(x0 + (x1 - x0) * (i + 0.5) / 9, y0 + (y1 - y0) * (k + 0.5) / 9, z0 + (z1 - z0) * (j + 0.5) / 9, ids)) holes++; }
        if (holes === 0) { out.notExact.push({ name, design: [x0, x1, z0, z1, y0, y1], builtAs: [...ids].map((id) => { const c = cols.find((q) => q.id === id); return `${id} [${c.x0}..${c.x1}, ${c.z0}..${c.z1}, ${c.y0}..${c.y1}]`; }) }); ids.forEach((id) => claimed.add(id)); }
        else out.missing.push({ name, design: [x0, x1, z0, z1, y0, y1], emptyFraction: +(holes / n).toFixed(3), partly: [...ids] });
      } else if (kind === 'cyl') {
        const [, , x, z, r, y0, y1] = e;
        const m = cols.find((c) => c.kind === 'cyl' && eq(c.x, x) && eq(c.z, z) && eq(c.r, r) && eq(c.y0, y0) && eq(c.y1, y1));
        if (m) claimed.add(m.id); else out.missing.push({ name, design: e.slice(2), nearest: cols.filter((c) => c.kind === 'cyl' && Math.hypot(c.x - x, c.z - z) < 3).map((c) => [c.id, c.x, c.z, c.r, c.y0, c.y1]) });
      } else {
        const [, , x0, x1, z0, z1, axis, h0, h1, th] = e;
        const m = cols.find((c) => c.kind === 'ramp' && eq(c.x0, x0) && eq(c.x1, x1) && eq(c.z0, z0) && eq(c.z1, z1) && c.axis === axis && eq(c.h0, h0) && eq(c.h1, h1) && (c.thickness === th || eq(c.thickness, th)));
        if (m) claimed.add(m.id); else out.missing.push({ name, design: e.slice(2), nearest: cols.filter((c) => c.kind === 'ramp' && Math.abs(c.x0 - x0) < 3 && Math.abs(c.z0 - z0) < 3).map((c) => [c.id, c.x0, c.x1, c.z0, c.z1, c.axis, c.h0, c.h1, c.thickness]) });
      }
    }
    for (const [name, x0, x1, zFoot, dir, n, rise, depth] of STAIRS) {
      let bad = 0, found = 0;
      for (let i = 1; i <= n; i++) {
        const za = zFoot + dir * depth * (i - 1), zb = zFoot + dir * depth * i, lo = Math.min(za, zb), hi = Math.max(za, zb);
        const m = cols.find((c) => c.kind === 'box' && eq(c.x0, x0) && eq(c.x1, x1) && Math.abs(c.z0 - lo) < 1e-6 && Math.abs(c.z1 - hi) < 1e-6 && Math.abs(c.y1 - rise * i) < 1e-6);
        if (m) { found++; claimed.add(m.id); } else bad++;
      }
      out.stairs.push({ name, steps: n, found, missing: bad, topZ: +(zFoot + dir * depth * n).toFixed(3), topY: +(rise * n).toFixed(3) });
    }
    for (const [name, x, z, y0, y1, ex, ez] of STRINGS) {
      const m = cols.find((c) => c.kind === 'string' && eq(c.x, x) && eq(c.z, z) && eq(c.y0, y0) && eq(c.y1, y1) && c.ex === ex && c.ez === ez);
      out.strings.push({ name, ok: !!m }); if (m) claimed.add(m.id);
    }
    const pad = cols.find((c) => c.kind === 'pad');
    out.pad = pad ? { bounds: [pad.x0, pad.x1, pad.z0, pad.z1, pad.y0, pad.y1], launch: pad.launch, ok: eq(pad.x0, 36.5) && eq(pad.x1, 39.5) && eq(pad.z0, 78.5) && eq(pad.z1, 81.5) && eq(pad.y0, 0) && eq(pad.y1, 0.4) } : null;
    if (pad) claimed.add(pad.id);
    out.unclaimed = cols.filter((c) => !claimed.has(c.id)).map((c) => `${c.id} ${c.kind} [${c.x0}..${c.x1}, ${c.z0}..${c.z1}, ${c.y0}..${c.y1}]`);
    out.room = cols.filter((c) => c.id.startsWith('room.')).map((c) => `${c.id} [${c.x0}..${c.x1}, ${c.z0}..${c.z1}, ${c.y0}..${c.y1}]`);

    // waypoint nodes
    const N = G.waypoints.nodes, moved = [], missing = [], extra = [];
    for (const k in designNodes) { if (!N[k]) { missing.push(k); continue; } const d = Math.hypot(N[k][0] - designNodes[k][0], N[k][1] - designNodes[k][1], N[k][2] - designNodes[k][2]); if (d > 1e-6) moved.push({ node: k, design: designNodes[k], build: N[k], dist: +d.toFixed(2) }); }
    for (const k in N) if (!designNodes[k]) extra.push(k);
    out.nodes = { designCount: Object.keys(designNodes).length, buildCount: Object.keys(N).length, missing, extra, moved, declaredMoved: G.movedNodes || null };

    // CONFIG against section 2
    const K = G.CONFIG, want = [['player.height', 1.8], ['player.eye', 1.6], ['player.crouchHeight', 1.2], ['player.crouchEye', 1.0], ['player.radius', 0.4], ['move.walk', 5], ['move.sprint', 7], ['move.crouch', 2.5],
      ['move.groundAccelTime', 0.10], ['move.groundStopTime', 0.08], ['move.airControl', 0.12], ['move.gravity', 22], ['move.jumpVel', 7.8], ['move.stepUp', 0.65], ['move.maxSlopeDeg', 50], ['climb.speed', 5.5], ['climb.grabRadius', 0.8],
      ['fall.safe', 10], ['fall.perUnit', 5], ['spring.launchVel', [-4.5, 31, 0]], ['camera.fovVertical', 75], ['camera.near', 0.05], ['camera.far', 400], ['fog.near', 10], ['fog.far', 220], ['sim.hz', 60]];
    for (const [key, v] of want) { const got = key.split('.').reduce((o, k) => o && o[k], K); if (JSON.stringify(got) !== JSON.stringify(v)) out.config.push({ key, design: v, build: got }); }
    out.configChecked = want.length;
    // every route's legs have an edge in the graph, and of what kind
    out.routeEdges = Object.entries(G.routes).map(([id, ids]) => id + ': ' + ids.slice(1).map((b, i) => { const a = ids[i]; const e = G.waypoints.edges.find((q) => (q.a === a && q.b === b) || (!q.oneWay && q.a === b && q.b === a)); return e ? e.kind : 'NO EDGE ' + a + '>' + b; }).join(','));
    return out;
  }, { EXPECT, STAIRS, STRINGS, designNodes });

  console.log(`DESIGN pieces checked: ${EXPECT.length} primitives + ${STAIRS.length} stair flights + ${STRINGS.length} strings + pad`);
  console.log('MISSING or different from DESIGN:', res.missing.length); for (const m of res.missing) console.log('   ', JSON.stringify(m));
  console.log('Same volume, built from different boxes:', res.notExact.length); for (const m of res.notExact) console.log('   ', m.name, JSON.stringify(m.design), '<=', m.builtAs.join(' + '));
  console.log('stairs:', JSON.stringify(res.stairs));
  console.log('strings:', JSON.stringify(res.strings));
  console.log('pad:', JSON.stringify(res.pad));
  console.log('room shell:', res.room.join(' | '));
  console.log('build colliders not matched to anything I transcribed:', res.unclaimed.length); for (const u of res.unclaimed) console.log('   ', u);
  console.log('waypoint nodes:', JSON.stringify(res.nodes));
  console.log('CONFIG mismatches (of ' + res.configChecked + '):', JSON.stringify(res.config));
  console.log('route edges:'); for (const r of res.routeEdges) console.log('   ', r);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e); process.exit(1); });
