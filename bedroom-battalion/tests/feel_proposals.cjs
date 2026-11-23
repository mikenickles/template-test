// Sanity check for the boxes FEEL.md proposes: do they overlap an existing collider, the train envelope, or come within
// a capsule radius (0.4) + 0.1 of any ground-level waypoint edge? (Pure geometry on the live lists; nothing is added to the game.)
const { boot } = require('./feel_lib.cjs');
(async () => {
  const h = await boot();
  const r = await h.page.evaluate(() => {
    const G = __game, N = G.waypoints.nodes, E = G.waypoints.edges;
    const P = {
      'east lane block (79.5..82.5, 44..47, h 3)': { x0: 79.5, x1: 82.5, z0: 44, z1: 47, y0: 0, y1: 3 },
      'west lane car N (33..36, 68.5..73, h 2.2)': { x0: 33, x1: 36, z0: 68.5, z1: 73, y0: 0, y1: 2.2 },
      'west lane car S (33..36, 87..91.5, h 2.2)': { x0: 33, x1: 36, z0: 87, z1: 91.5, y0: 0, y1: 2.2 },
      'west lane domino N (35.2..36.2, 70..74, h 3.2)': { x0: 35.2, x1: 36.2, z0: 70, z1: 74, y0: 0, y1: 3.2 },
      'seat stopper N (92..96, 73..73.6, y 17..18.2)': { x0: 92, x1: 96, z0: 73, z1: 73.6, y0: 17, y1: 18.2 },
      'seat stopper S (92..96, 86.4..87, y 17..18.2)': { x0: 92, x1: 96, z0: 86.4, z1: 87, y0: 17, y1: 18.2 },
      'tunnel roof flap (81.4..84, 68..92, y 6.8..8)': { x0: 81.4, x1: 84, z0: 68, z1: 92, y0: 6.8, y1: 8 },
    };
    const segBox = (a, b, B, pad) => {       // min distance from segment a-b (xz) to rect, sampled
      let best = 1e9; for (let k = 0; k <= 200; k++) { const x = a[0] + (b[0] - a[0]) * k / 200, z = a[2] + (b[2] - a[2]) * k / 200; best = Math.min(best, Math.hypot(Math.max(B.x0 - x, 0, x - B.x1), Math.max(B.z0 - z, 0, z - B.z1))); } return best;
    };
    const out = {};
    for (const n in P) { const B = P[n];
      const hits = G.colliders.filter((c) => c.kind !== 'string' && c.x0 < B.x1 && c.x1 > B.x0 && c.z0 < B.z1 && c.z1 > B.z0 && c.y0 < B.y1 && c.y1 > B.y0).map((c) => c.id);
      const near = [];
      for (const e of E) { const a = N[e.a], b = N[e.b]; const ya = Math.min(a[1], b[1]), yb = Math.max(a[1], b[1]); if (yb + 1.8 < B.y0 || ya > B.y1) continue; if (e.kind === 'climb' || e.kind === 'launch') continue;
        const d = segBox(a, b, B); if (d < 0.5) near.push(e.a + '-' + e.b + ' (' + d.toFixed(2) + ')'); }
      // train envelope: 2 units either side of the oval centre line (straights x = 43, 77 for z 52.5..107.5; curves r 17 about (60,52.5) and (60,107.5))
      let track = 1e9; for (let x = B.x0; x <= B.x1; x += 0.25) for (let z = B.z0; z <= B.z1; z += 0.25) { let d;
        if (z >= 52.5 && z <= 107.5) d = Math.min(Math.abs(x - 43), Math.abs(x - 77)); else d = Math.abs(Math.hypot(x - 60, z - (z < 52.5 ? 52.5 : 107.5)) - 17); track = Math.min(track, d); }
      out[n] = { overlapsColliders: hits, waypointEdgesWithin0_5: near, minDistToTrackCentre: +track.toFixed(2), clearOfTrainEnvelope: B.y0 > 5.5 || track > 2 };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await h.browser.close();
})();
