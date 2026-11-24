// Single source of truth for every gameplay / world measurement (1 unit = 1 metre).
export const CFG = Object.freeze({
  SEED: 20261124,
  MAP_SIZE: 150,           // X,Z in [-75, +75]
  HALF: 75,
  PLAY_HALF: 60,           // inner 120 x 120 m playable area
  BORDER: 15,              // 60..75 m ridge band
  CLEAR_RADIUS: 20,        // spawn clearing, no trees / boulders
  CLEAR_MAX_ELEV: 1.5,
  ELEV_MIN: 0,
  ELEV_MAX: 8,
  TERRAIN_STEP: 0.5,       // heightfield resolution (m)

  TREE_COUNT: 136,         // spec: 120-150
  TREE_HEIGHT: [6, 14],
  BOULDER_COUNT: 50,       // spec: 40-60
  BOULDER_WIDTH: [1, 3],
  LOG_COUNT: 14,
  FERN_COUNT: 520,
  BUSH_COUNT: 70,
  POLLEN_COUNT: 1400,

  ROBOT_HEIGHT: 1.6,
  ROBOT_RADIUS: 0.42,
  WALK_SPEED: 6,           // m/s
  CAM_DIST: 10,
  CAM_MIN: 5,
  CAM_MAX: 20,

  HARVEST_RANGE: 3.5,
  HITS_TO_DEPLETE: 3,
  YIELD_PER_HIT: 1,

  BUILD: {
    wall:     { key: '1', name: 'Timber Wall',   width: 3.0, height: 2.5, depth: 0.44, cost: { wood: 3, stone: 0 }, model: 'palisade', maxSlope: 0.9 },
    campfire: { key: '2', name: 'Campfire',      diameter: 1.5, height: 0.6,           cost: { wood: 2, stone: 3 }, model: 'campfire', maxSlope: 0.4 },
    beacon:   { key: '3', name: 'Stone Beacon',  width: 3.0, depth: 3.0, height: 7.0,  cost: { wood: 4, stone: 6 }, model: 'beacon',   maxSlope: 1.1 },
  },

  SUN_ELEVATION_DEG: 34,
  SUN_AZIMUTH_DEG: 188,    // nearly axis aligned => tight shadow frustum over the whole map
  FOG_DENSITY: 0.0088,
});

// Runtime options (set from the URL before the world is built)
export const OPTS = { grassDensity: 1 };

// Deterministic PRNG (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
