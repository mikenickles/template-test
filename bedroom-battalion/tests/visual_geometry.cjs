// Compares what is DRAWN (vertex buffers read from the live scene) with __game.colliders:
//   1. colliders with no visual, visuals with no collider
//   2. coplanar overlapping faces that face the same way (z-fighting candidates), by colour
//   3. floating or sunken colliders, and colliders that interpenetrate
// Reads the scene through the three.js devtools 'observe' event; changes nothing in the game.
const fs = require('fs');
const path = require('path');
const { launch } = require('./harness.cjs');

function captureThree() {
  const t = new EventTarget();
  window.__three = { renderer: null, scene: null };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) window.__three.scene = o; else if (o && o.shadowMap) window.__three.renderer = o; });
  window.__THREE_DEVTOOLS__ = t;
}
const EPS = 0.011;
const hex = (c) => '#' + c.map((v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(s * 255).toString(16).padStart(2, '0'); }).join('').toUpperCase();

(async () => {
  const h = await launch({ width: 640, height: 360 });
  await h.page.addInitScript(captureThree);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  const data = await h.page.evaluate(() => {
    const out = { static: null, inst: [], colliders: [] };
    window.__three.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) out.inst.push({ m: Array.from(o.instanceMatrix.array.slice(i * 16, i * 16 + 16)), c: Array.from(o.instanceColor.array.slice(i * 3, i * 3 + 3)) });
      } else if (!o.material.map) {
        const g = o.geometry;
        out.static = { pos: Array.from(g.attributes.position.array), nor: Array.from(g.attributes.normal.array), col: Array.from(g.attributes.color.array) };
      }
    });
    for (const c of __game.colliders) {
      const o = {}; for (const k in c) if (typeof c[k] !== 'object' && typeof c[k] !== 'function') o[k] = c[k];
      if (c.thickness === Infinity) o.thickness = 'inf';
      out.colliders.push(o);
    }
    return out;
  });
  await h.browser.close();

  const C = data.colliders;
  // ---------- triangles: static mesh + instanced boxes expanded to world space ----------
  const tris = [];     // {p:[[x,y,z]x3], n:[x,y,z], col:hex, src}
  const S = data.static;
  for (let i = 0; i < S.pos.length; i += 9) {
    const p = [S.pos.slice(i, i + 3), S.pos.slice(i + 3, i + 6), S.pos.slice(i + 6, i + 9)];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n); n = n.map((x) => x / l);
    tris.push({ p, n, area: l / 2, col: hex(S.col.slice(i, i + 3)), src: 'static', smooth: Math.abs(S.nor[i] - S.nor[i + 3]) + Math.abs(S.nor[i + 2] - S.nor[i + 5]) > 1e-4 });
  }
  const instBoxes = [];
  const UNIT = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [-.5, .5, -.5], [.5, .5, -.5], [.5, .5, .5], [-.5, .5, .5]];
  const FACES = [[0, 1, 2, 3, [0, -1, 0]], [4, 5, 6, 7, [0, 1, 0]], [0, 1, 5, 4, [0, 0, -1]], [1, 2, 6, 5, [1, 0, 0]], [2, 3, 7, 6, [0, 0, 1]], [3, 0, 4, 7, [-1, 0, 0]]];
  data.inst.forEach((I, idx) => {
    const m = I.m, tp = (q) => [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]];
    const P = UNIT.map(tp), col = hex(I.c);
    const bb = { x0: Math.min(...P.map((q) => q[0])), x1: Math.max(...P.map((q) => q[0])), y0: Math.min(...P.map((q) => q[1])), y1: Math.max(...P.map((q) => q[1])), z0: Math.min(...P.map((q) => q[2])), z1: Math.max(...P.map((q) => q[2])) };
    const rotated = Math.abs(m[2]) > 1e-6 && Math.abs(m[0]) > 1e-6;
    instBoxes.push({ idx, bb, col, rotated });
    for (const f of FACES) {
      const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
      const d = f[4], n = [(m[0] / sx) * d[0] + (m[4] / sy) * d[1] + (m[8] / sz) * d[2], (m[1] / sx) * d[0] + (m[5] / sy) * d[1] + (m[9] / sz) * d[2], (m[2] / sx) * d[0] + (m[6] / sy) * d[1] + (m[10] / sz) * d[2]];
      tris.push({ p: [P[f[0]], P[f[1]], P[f[2]]], n, col, src: 'inst' + idx }); tris.push({ p: [P[f[0]], P[f[2]], P[f[3]]], n, col, src: 'inst' + idx });
    }
  });

  // ---------- 1a. every collider has a visual ----------
  const verts = [];
  for (const t of tris) for (const q of t.p) verts.push(q);
  const hasVert = (x, y, z) => verts.some((q) => Math.abs(q[0] - x) < EPS && Math.abs(q[1] - y) < EPS && Math.abs(q[2] - z) < EPS);
  const noVisual = [];
  for (const c of C) {
    let pts = [];
    if (c.kind === 'box' || c.kind === 'pad') pts = [[c.x0, c.y1, c.z0], [c.x1, c.y1, c.z0], [c.x0, c.y1, c.z1], [c.x1, c.y1, c.z1], [c.x0, c.y0, c.z0], [c.x1, c.y0, c.z1]];
    else if (c.kind === 'ramp') pts = c.axis === 'z' ? [[c.x0, c.h0, c.z0], [c.x1, c.h0, c.z0], [c.x0, c.h1, c.z1], [c.x1, c.h1, c.z1]] : [[c.x0, c.h0, c.z0], [c.x0, c.h0, c.z1], [c.x1, c.h1, c.z0], [c.x1, c.h1, c.z1]];
    else if (c.kind === 'cyl') pts = [[c.x + c.r, c.y0, c.z], [c.x + c.r, c.y1, c.z], [c.x - c.r, c.y1, c.z]];
    else if (c.kind === 'string') pts = [[c.x0, c.y0, c.z0], [c.x1, c.y1, c.z1]];
    const missing = pts.filter((q) => !hasVert(q[0], q[1], q[2])).length;
    if (missing) noVisual.push({ id: c.id, kind: c.kind, missingCorners: missing + '/' + pts.length, bounds: [c.x0, c.x1, c.z0, c.z1, c.y0, c.y1] });
  }

  // ---------- 1b. every visual triangle belongs to a collider ----------
  const inside = (q, c) => q[0] >= c.x0 - EPS && q[0] <= c.x1 + EPS && q[1] >= c.y0 - EPS && q[1] <= c.y1 + EPS && q[2] >= c.z0 - EPS && q[2] <= c.z1 + EPS;
  const orphan = [];
  for (const t of tris) {
    if (t.src !== 'static') continue;
    if (!C.some((c) => t.p.every((q) => inside(q, c)))) orphan.push(t);
  }
  // cluster orphan triangles by touching/overlapping bounds and colour
  const clusters = [];
  for (const t of orphan) {
    const bb = { x0: Math.min(...t.p.map((q) => q[0])), x1: Math.max(...t.p.map((q) => q[0])), y0: Math.min(...t.p.map((q) => q[1])), y1: Math.max(...t.p.map((q) => q[1])), z0: Math.min(...t.p.map((q) => q[2])), z1: Math.max(...t.p.map((q) => q[2])), col: t.col, n: 1 };
    let hit = clusters.filter((k) => k.col === bb.col && k.x0 <= bb.x1 + EPS && k.x1 >= bb.x0 - EPS && k.y0 <= bb.y1 + EPS && k.y1 >= bb.y0 - EPS && k.z0 <= bb.z1 + EPS && k.z1 >= bb.z0 - EPS);
    for (const k of hit) { bb.x0 = Math.min(bb.x0, k.x0); bb.x1 = Math.max(bb.x1, k.x1); bb.y0 = Math.min(bb.y0, k.y0); bb.y1 = Math.max(bb.y1, k.y1); bb.z0 = Math.min(bb.z0, k.z0); bb.z1 = Math.max(bb.z1, k.z1); bb.n += k.n; clusters.splice(clusters.indexOf(k), 1); }
    clusters.push(bb);
  }
  const r2 = (v) => +v.toFixed(2);
  const visualOnly = clusters.map((k) => ({ col: k.col, tris: k.n, x: [r2(k.x0), r2(k.x1)], z: [r2(k.z0), r2(k.z1)], y: [r2(k.y0), r2(k.y1)] }));
  const instNoCollider = instBoxes.filter((b) => !C.some((c) => c.kind === 'box' && Math.abs(c.x0 - b.bb.x0) < EPS && Math.abs(c.x1 - b.bb.x1) < EPS && Math.abs(c.y0 - b.bb.y0) < EPS && Math.abs(c.y1 - b.bb.y1) < EPS && Math.abs(c.z0 - b.bb.z0) < EPS && Math.abs(c.z1 - b.bb.z1) < EPS));
  const instNoColByColour = {};
  for (const b of instNoCollider) instNoColByColour[b.col] = (instNoColByColour[b.col] || 0) + 1;

  // ---------- 2. coplanar, same-facing, overlapping faces (z-fighting candidates) ----------
  const planes = new Map();
  for (const t of tris) {
    if (t.smooth) continue;
    const ax = [0, 1, 2].sort((a, b) => Math.abs(t.n[b]) - Math.abs(t.n[a]))[0];
    if (Math.abs(t.n[ax]) < 0.999) continue;                      // axis-aligned faces only (all boxes); slopes handled by looking
    const key = ax + (t.n[ax] > 0 ? '+' : '-') + Math.round(t.p[0][ax] * 500);
    (planes.get(key) || planes.set(key, []).get(key)).push({ t, ax });
  }
  const clip = (poly, a, b) => {                                  // Sutherland-Hodgman against edge a->b (2D)
    const out = [], side = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
    return out;
  };
  const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length]; s += P[0] * Q[1] - P[1] * Q[0]; } return Math.abs(s) / 2; };
  const zf = [];
  for (const [key, list] of planes) {
    if (list.length < 2) continue;
    const ax = list[0].ax, u = (ax + 1) % 3, v = (ax + 2) % 3;
    const P2 = list.map((e) => { let q = e.t.p.map((p) => [p[u], p[v]]); const s = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]); if (s < 0) q = [q[0], q[2], q[1]]; return q; });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = P2[i], B = P2[j];
      if (Math.max(...A.map((q) => q[0])) <= Math.min(...B.map((q) => q[0])) + 1e-6 || Math.max(...B.map((q) => q[0])) <= Math.min(...A.map((q) => q[0])) + 1e-6) continue;
      if (Math.max(...A.map((q) => q[1])) <= Math.min(...B.map((q) => q[1])) + 1e-6 || Math.max(...B.map((q) => q[1])) <= Math.min(...A.map((q) => q[1])) + 1e-6) continue;
      let poly = A.slice();
      for (let k = 0; k < 3 && poly.length; k++) poly = clip(poly, B[k], B[(k + 1) % 3]);
      const ar = poly.length >= 3 ? area(poly) : 0;
      if (ar > 1e-3) {
        const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
        const pt = [0, 0, 0]; pt[ax] = list[i].t.p[0][ax]; pt[u] = cx; pt[v] = cy;
        zf.push({ plane: 'xyz'[ax] + '=' + r2(pt[ax]) + (key[1] === '+' ? ' facing +' : ' facing -'), area: +ar.toFixed(3), at: pt.map(r2), colA: list[i].t.col, colB: list[j].t.col, srcA: list[i].t.src, srcB: list[j].t.src });
      }
    }
  }
  const zfDiff = zf.filter((z) => z.colA !== z.colB), zfSame = zf.filter((z) => z.colA === z.colB);
  const group = (arr) => { const g = {}; for (const z of arr) { const k = z.plane + ' ' + z.colA + '/' + z.colB + ' ' + (z.srcA.startsWith('inst') ? 'inst' : 'static') + '/' + (z.srcB.startsWith('inst') ? 'inst' : 'static'); (g[k] = g[k] || { pairs: 0, area: 0, example: z.at }); g[k].pairs++; g[k].area = +(g[k].area + z.area).toFixed(2); } return g; };

  // ---------- 3. floating / sunken / interpenetrating colliders ----------
  const solids = C.filter((c) => !c.id.startsWith('room.') && c.kind !== 'string');
  const topAt = (s, x, z) => { if (s.kind !== 'ramp') return s.y1; const a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1, t = Math.min(1, Math.max(0, ((s.axis === 'x' ? x : z) - a0) / (a1 - a0))); return s.h0 + (s.h1 - s.h0) * t; };
  const floating = [], sunken = [];
  for (const c of solids) {
    const thin = c.kind === 'ramp' && c.thickness !== 'inf';
    if (c.y0 < -1e-6) sunken.push({ id: c.id, y0: r2(c.y0) });
    if (thin) continue;
    if (Math.abs(c.y0) < 1e-6) continue;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const sup = solids.some((s) => s !== c && s.x0 <= c.x1 - EPS && s.x1 >= c.x0 + EPS && s.z0 <= c.z1 - EPS && s.z1 >= c.z0 + EPS && (Math.abs(s.y1 - c.y0) < 0.02 || (s.kind === 'ramp' && Math.abs(topAt(s, cx, cz) - c.y0) < 0.5) || (s.y0 < c.y0 && s.y1 > c.y0)));
    if (!sup) floating.push({ id: c.id, kind: c.kind, y0: r2(c.y0), bounds: [c.x0, c.x1, c.z0, c.z1] });
  }
  // thin ramps: both ends must rest on something (floor or a collider top) within 0.35
  const rampEnds = [];
  for (const c of solids.filter((c) => c.kind === 'ramp' && c.thickness !== 'inf')) {
    for (const [end, hgt] of [[0, c.h0], [1, c.h1]]) {
      const x = c.axis === 'x' ? (end ? c.x1 : c.x0) : (c.x0 + c.x1) / 2, z = c.axis === 'z' ? (end ? c.z1 : c.z0) : (c.z0 + c.z1) / 2;
      const near = solids.filter((s) => s !== c && x >= s.x0 - 0.3 && x <= s.x1 + 0.3 && z >= s.z0 - 0.3 && z <= s.z1 + 0.3).map((s) => ({ id: s.id, gap: r2(hgt - s.y1) })).filter((s) => Math.abs(s.gap) < 0.35);
      rampEnds.push({ id: c.id, end: end ? 'high-coordinate' : 'low-coordinate', at: [r2(x), r2(hgt), r2(z)], restsOn: Math.abs(hgt) < 1e-6 ? 'floor' : near.length ? near.map((s) => s.id + ' (gap ' + s.gap + ')').join(', ') : 'NOTHING' });
    }
  }
  const overlaps = [];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (a.kind === 'pad' || b.kind === 'pad') continue;
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (ox > 0.02 && oy > 0.02 && oz > 0.02) {
      if (a.kind === 'ramp' || b.kind === 'ramp') {       // AABB of a ramp is loose: test real surfaces at the overlap centre
        const rp = a.kind === 'ramp' ? a : b, ot = rp === a ? b : a;
        const x = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, z = (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2;
        const top = topAt(rp, x, z), bot = rp.thickness === 'inf' ? rp.base : top - rp.thickness;
        if (Math.min(top, ot.y1) - Math.max(bot, ot.y0) < 0.02) continue;
      }
      overlaps.push({ a: a.id, b: b.id, overlap: [r2(ox), r2(oy), r2(oz)] });
    }
  }
  const stairPrefix = (id) => id.replace(/\.\d+$/, '');
  const overlapsReal = overlaps.filter((o) => !(stairPrefix(o.a) === stairPrefix(o.b) && /books/.test(o.a)));

  // ---------- summary ----------
  const byKind = {}; for (const c of C) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  const colourUse = {}; for (const t of tris) colourUse[t.col] = (colourUse[t.col] || 0) + 1;
  const out = { colliders: C.length, byKind, staticTris: S.pos.length / 9, instances: data.inst.length,
    instancesWithCollider: data.inst.length - instNoCollider.length, instancesNoCollider: instNoColByColour,
    collidersWithNoVisual: noVisual, visualOnlyClusters: visualOnly,
    zFightDifferentColour: group(zfDiff), zFightSameColourPairs: zfSame.length, zFightSameColour: group(zfSame),
    floating, sunken, thinRampEnds: rampEnds, interpenetrating: overlapsReal, colourUse };
  fs.writeFileSync(path.resolve(__dirname, 'visual_geometry_result.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
