import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Uniforms shared by every patched material (wind, sun, time).
export const shared = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector3(0.82, 0, 0.57) },
  uWindStrength: { value: 1.0 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
  uPlayerView: { value: new THREE.Vector3(0, 0, -10) },   // robot chest in view space
};

const TEXTURES = {
  // name: [file, srgb]
  bark_pine_albedo: 1, bark_pine_normal: 0, bark_pine_arh: 0,
  bark_oak_albedo: 1, bark_oak_normal: 0, bark_oak_arh: 0,
  bark_birch_albedo: 1, bark_birch_normal: 0, bark_birch_arh: 0,
  ground_grass_albedo: 1, ground_grass_normal: 0, ground_grass_arh: 0,
  ground_forest_albedo: 1, ground_forest_normal: 0, ground_forest_arh: 0,
  rock_cliff_albedo: 1, rock_cliff_normal: 0, rock_cliff_arh: 0,
  stone_masonry_albedo: 1, stone_masonry_normal: 0, stone_masonry_arh: 0,
  roof_shingles_albedo: 1, roof_shingles_normal: 0, roof_shingles_arh: 0,
  wood_cut_albedo: 1, wood_cut_normal: 0, wood_cut_arh: 0,
  wood_beam_albedo: 1, wood_beam_normal: 0, wood_beam_arh: 0,
  charcoal_albedo: 1, charcoal_normal: 0, charcoal_arh: 0, charcoal_emissive: 1,
  foliage_leaf_albedo: 1, foliage_leaf_normal: 0,
  foliage_pine_albedo: 1, foliage_pine_normal: 0,
  foliage_fern_albedo: 1, foliage_fern_normal: 0,
  boulder_a_albedo: 1, boulder_a_normal: 0, boulder_a_orm: 0,
  boulder_b_albedo: 1, boulder_b_normal: 0, boulder_b_orm: 0,
  boulder_c_albedo: 1, boulder_c_normal: 0, boulder_c_orm: 0,
  robot_albedo: 1, robot_normal: 0, robot_orm: 0,
  smoke: 1, dot: 1,
};

const MODELS = ['pine_a', 'pine_b', 'pine_c', 'oak_a', 'oak_b', 'birch_a', 'bush_a', 'fern_a', 'log_a',
  'boulder_a', 'boulder_b', 'boulder_c', 'timberbot', 'palisade', 'campfire', 'beacon'];

export async function loadAssets(renderer, onProgress) {
  const base = new URL('../assets/', import.meta.url).href;
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  const T = {}, M = {};
  const total = Object.keys(TEXTURES).length + MODELS.length + 1;
  let done = 0;
  const tick = () => onProgress && onProgress(++done / total);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const jobs = [];
  for (const [name, srgb] of Object.entries(TEXTURES)) {
    jobs.push(tl.loadAsync(`${base}textures/${name}.webp`).then((t) => {
      t.flipY = false;                      // glTF UV convention everywhere
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.name = name;
      T[name] = t; tick();
    }));
  }
  for (const name of MODELS) {
    jobs.push(gl.loadAsync(`${base}models/${name}.glb`).then((g) => { M[name] = g.scene; g.scene.name = name; tick(); }));
  }
  let vegInfo = {};
  jobs.push(fetch(`${base}models/vegetation.json`).then((r) => r.json()).then((j) => { vegInfo = j; tick(); }));
  await Promise.all(jobs);
  return { T, M, vegInfo };
}

// ----------------------------------------------------------------------------------------
// shader patches
const WIND_VERT_PARS = /* glsl */`
attribute vec4 aWind;            // r: baked AO, g: flex weight, b: phase
uniform float uTime;
uniform vec3 uWindDir;
uniform float uWindStrength;
varying float vAo;
vec3 tbWind(vec3 p, vec4 w) {
  #ifdef USE_INSTANCING
    vec3 ipos = instanceMatrix[3].xyz;
    vec3 ldir = normalize(uWindDir * mat3(instanceMatrix));
  #else
    vec3 ipos = modelMatrix[3].xyz;
    vec3 ldir = uWindDir;
  #endif
  float ph = dot(ipos.xz, vec2(0.21, 0.17)) + w.b * 6.2831;
  float gust = sin(uTime * 0.8 + ph) * 0.55 + sin(uTime * 1.9 + ph * 1.7) * 0.3 + 0.3;
  float flut = sin(uTime * 5.5 + w.b * 31.0 + p.y * 2.0);
  vec3 side = cross(ldir, vec3(0.0, 1.0, 0.0));
  vec3 off = ldir * (gust * w.g * w.g * 0.24) + vec3(0.0, flut * 0.03 * w.g, 0.0) + side * (flut * 0.025 * w.g);
  return p + off * uWindStrength;
}
`;

function patchWind(mat, { foliage = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWindDir = shared.uWindDir;
    sh.uniforms.uWindStrength = shared.uWindStrength;
    sh.uniforms.uSunDirView = shared.uSunDirView;
    sh.uniforms.uSunColor = shared.uSunColor;
    sh.uniforms.uPlayerView = shared.uPlayerView;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = tbWind(transformed, aWind);\n vAo = aWind.r;');
    if (sh.fragmentShader.includes('#include <color_fragment>')) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAo;\nuniform vec3 uSunDirView;\nuniform vec3 uSunColor;\nuniform vec3 uPlayerView;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.34, 1.0, vAo);');
      if (foliage) {
        // card normals are authored to point out of the canopy: keep them on back faces too
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;');
        // keep the robot readable: dither away canopy that sits between the camera and Timberbot
        sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', /* glsl */`
          {
            vec3 fv = -vViewPosition;
            float pl = length(uPlayerView);
            vec3 pd = uPlayerView / pl;
            float along = dot(fv, pd);
            float perp = length(fv - pd * along);
            float open = (1.0 - smoothstep(1.0, 2.3, perp)) * (1.0 - smoothstep(pl - 1.6, pl - 0.4, along));
            open = max(open, 1.0 - smoothstep(2.2, 3.0, length(fv)));        // never let a leaf card sit on the lens
            float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            open = smoothstep(0.08, 0.5, open);                  // decisive cut-out: no sparse screen-door residue
            if (open > dn) discard;
          }
          #include <alphatest_fragment>`);
        // cheap leaf translucency: sunlight bleeding through when looking toward the sun
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          {
            float back = pow(clamp(dot(-normalize(vViewPosition), uSunDirView), 0.0, 1.0), 2.5);
            totalEmissiveRadiance += diffuseColor.rgb * uSunColor * (back * 0.22 * vAo);
          }`);
      }
    }
  };
  mat.customProgramCacheKey = () => 'tbwind' + (foliage ? 'F' : 'B');
  return mat;
}

/** Depth / distance materials so alpha-tested, wind-animated foliage casts correct shadows. */
function shadowMaterials(map) {
  const depth = patchWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: map ? 0.3 : 0 }));
  const dist = patchWind(new THREE.MeshDistanceMaterial({ map, alphaTest: map ? 0.3 : 0 }));
  return { depth, dist };
}

const TERRAIN_FRAG_PARS = /* glsl */`
uniform sampler2D tGrassA; uniform sampler2D tGrassN; uniform sampler2D tGrassR;
uniform sampler2D tForestA; uniform sampler2D tForestN; uniform sampler2D tForestR;
uniform sampler2D tRockA; uniform sampler2D tRockN; uniform sampler2D tRockR;
uniform sampler2D tSplat;
varying vec3 vWPos;
varying vec3 vWNrm;
vec3 tbNormalTS;
float tbRough;
`;

const TERRAIN_MAP = /* glsl */`
{
  vec3 wn = normalize(vWNrm);
  vec2 suv = (vWPos.xz + 75.0) / 150.0;
  vec4 splat = texture2D(tSplat, suv);              // r: forest floor, g: contact AO, b: sun-bleach
  vec2 uvG = vWPos.xz / 3.1;
  vec2 uvF = vWPos.xz / 3.7 + 0.37;
  vec3 gA = texture2D(tGrassA, uvG).rgb;
  vec3 gR = texture2D(tGrassR, uvG).rgb;
  vec3 gN = texture2D(tGrassN, uvG).xyz * 2.0 - 1.0;
  vec3 fA = texture2D(tForestA, uvF).rgb;
  vec3 fR = texture2D(tForestR, uvF).rgb;
  vec3 fN = texture2D(tForestN, uvF).xyz * 2.0 - 1.0;
  // macro variation hides texture repetition
  float macro = texture2D(tGrassR, vWPos.xz / 43.0).b * 0.6 + texture2D(tGrassR, vWPos.xz / 17.0 + 0.5).b * 0.4;
  gA *= mix(0.62, 1.3, macro);
  gA = mix(gA, gA * vec3(1.22, 1.06, 0.66), splat.b * 0.7);
  fA *= mix(0.75, 1.2, macro);
  float fw = smoothstep(0.3, 0.7, splat.r + (fR.b - gR.b) * 0.4);
  vec3 alb = mix(gA, fA, fw);
  vec3 arh = mix(gR, fR, fw);
  vec3 nts = mix(gN, fN, fw);
  // cliffs: bi-planar projected rock so steep faces do not stretch
  float slope = 1.0 - wn.y;
  if (slope > 0.12) {
    vec3 bw = abs(wn);
    float bx = bw.x / (bw.x + bw.z + 1e-4);
    vec2 uvX = vWPos.zy / 4.6;
    vec2 uvZ = vWPos.xy / 4.6;
    vec3 rA = mix(texture2D(tRockA, uvZ).rgb, texture2D(tRockA, uvX).rgb, bx);
    vec3 rR = mix(texture2D(tRockR, uvZ).rgb, texture2D(tRockR, uvX).rgb, bx);
    vec3 rN = mix(texture2D(tRockN, uvZ).xyz, texture2D(tRockN, uvX).xyz, bx) * 2.0 - 1.0;
    float rw = smoothstep(0.2, 0.4, slope + (rR.b - 0.5) * 0.22);
    alb = mix(alb, rA * 0.9, rw);
    arh = mix(arh, rR, rw);
    nts = mix(nts, rN, rw);
  }
  tbNormalTS = nts;
  tbRough = arh.g;
  float ao = arh.r * splat.g;
  diffuseColor.rgb = alb * mix(0.42, 1.0, ao);
}
`;

const TERRAIN_NORMAL = /* glsl */`
{
  vec3 Tv = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  Tv = normalize(Tv - normal * dot(Tv, normal));
  vec3 Bv = cross(Tv, normal);
  normal = normalize(mat3(Tv, Bv, normal) * vec3(tbNormalTS.xy * 1.1, tbNormalTS.z));
}
`;

function terrainMaterial(T, splat) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrassA: { value: T.ground_grass_albedo }, tGrassN: { value: T.ground_grass_normal }, tGrassR: { value: T.ground_grass_arh },
      tForestA: { value: T.ground_forest_albedo }, tForestN: { value: T.ground_forest_normal }, tForestR: { value: T.ground_forest_arh },
      tRockA: { value: T.rock_cliff_albedo }, tRockN: { value: T.rock_cliff_normal }, tRockR: { value: T.rock_cliff_arh },
      tSplat: { value: splat },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(position, 1.0)).xyz;\n vWNrm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_PARS)
      .replace('#include <map_fragment>', TERRAIN_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tbRough;')
      .replace('#include <normal_fragment_maps>', TERRAIN_NORMAL);
  };
  mat.customProgramCacheKey = () => 'tbterrain';
  return mat;
}

/** Moss creeping over up-facing surfaces (fallen logs, ridge rocks). */
function patchMoss(mat, T, amount = 0.75) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tMoss = { value: T.ground_grass_albedo };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMossP;\nvarying vec3 vMossN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 mm = modelMatrix * instanceMatrix;
        #else
          mat4 mm = modelMatrix;
        #endif
        vMossP = (mm * vec4(position, 1.0)).xyz;
        vMossN = normalize(mat3(mm) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMoss;\nvarying vec3 vMossP;\nvarying vec3 vMossN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 mossC = texture2D(tMoss, vMossP.xz / 1.7).rgb * vec3(0.8, 1.0, 0.7);
          float brk = texture2D(tMoss, vMossP.xz / 6.3 + vMossP.y * 0.21).g;
          float mm_ = smoothstep(0.25, 0.75, normalize(vMossN).y + (brk - 0.35) * 1.6) * ${amount.toFixed(2)};
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC, mm_);
        }`);
  };
  mat.customProgramCacheKey = () => 'tbmoss' + amount;
  return mat;
}

// ----------------------------------------------------------------------------------------
export function buildMaterials(T, splatTexture) {
  const std = (set, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: T[set + '_albedo'], normalMap: T[set + '_normal'], roughnessMap: T[set + '_arh'], aoMap: T[set + '_arh'],
      roughness: 1, metalness: 0, ...o,
    });
    m.userData.nrm = 'row';          // numpy-authored normal: +Y follows image rows
    return m;
  };
  const baked = (set, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: T[set + '_albedo'], normalMap: T[set + '_normal'], roughnessMap: T[set + '_orm'], aoMap: T[set + '_orm'],
      roughness: 1, metalness: 0, ...o,
    });
    m.userData.nrm = 'gl';           // Blender-baked normal: OpenGL convention
    return m;
  };
  const foliage = (set, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: T[set + '_albedo'], normalMap: T[set + '_normal'], alphaTest: 0.3, side: THREE.DoubleSide,
      roughness: 0.74, metalness: 0, alphaToCoverage: true, shadowSide: THREE.DoubleSide, ...o,
    });
    m.userData.nrm = 'gl';
    m.userData.foliage = true;
    patchWind(m, { foliage: true });
    m.userData.shadow = shadowMaterials(T[set + '_albedo']);
    return m;
  };
  const bark = (set, o = {}) => {
    const m = patchWind(std(set, o));
    m.userData.shadow = shadowMaterials(null);
    m.userData.wind = true;
    return m;
  };

  const mats = {
    Terrain: terrainMaterial(T, splatTexture),
    Bark_Pine: bark('bark_pine'),
    Bark_Oak: bark('bark_oak'),
    Bark_Birch: bark('bark_birch'),
    Foliage_Pine: foliage('foliage_pine', { color: 0xdfe8d8 }),
    Foliage_Oak: foliage('foliage_leaf', { color: 0xdde0c0 }),
    Foliage_Birch: foliage('foliage_leaf', { color: 0xf2e9a6 }),
    Foliage_Bush: foliage('foliage_leaf', { color: 0xc4d2b0 }),
    Foliage_Fern: foliage('foliage_fern', { color: 0xd8e6c0 }),
    Log_Bark: patchMoss(std('bark_oak'), T, 0.85),
    Log_End: std('wood_cut', { color: 0xb9a58c }),
    Boulder_A: baked('boulder_a', { color: new THREE.Color(1.55, 1.5, 1.45) }),
    Boulder_B: baked('boulder_b', { color: new THREE.Color(1.55, 1.5, 1.45) }),
    Boulder_C: baked('boulder_c', { color: new THREE.Color(1.55, 1.5, 1.45) }),
    Robot_Body: baked('robot', { metalness: 1, metalnessMap: T.robot_orm, envMapIntensity: 1.15 }),
    Robot_Visor: new THREE.MeshStandardMaterial({ color: 0x06242c, emissive: 0x35e8ff, emissiveIntensity: 5.0, roughness: 0.25, metalness: 0.2 }),
    Robot_Lamp: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff9a2e, emissiveIntensity: 4.0, roughness: 0.4 }),
    Wood_Bark: std('bark_pine', { color: 0xb2c0c6 }),          // cooler tint: weathered, less red than living bark
    Wood_Cut: std('wood_cut'),
    Wood_Beam: std('wood_beam'),
    Stone_Masonry: std('stone_masonry', { color: new THREE.Color(1.22, 1.2, 1.17) }),
    Roof_Shingles: std('roof_shingles', { side: THREE.DoubleSide }),
    Rope: new THREE.MeshStandardMaterial({ color: 0x8a6c42, roughness: 0.95, normalMap: T.wood_beam_normal }),
    Iron_Dark: new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.55, metalness: 0.85, normalMap: T.charcoal_normal }),
    Dark_Void: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    Fire_Log: std('charcoal', { emissiveMap: T.charcoal_emissive, emissive: 0xffffff, emissiveIntensity: 2.2 }),
    Fire_Ash: std('charcoal', { color: 0xbdb6ae, emissiveMap: T.charcoal_emissive, emissive: 0xffffff, emissiveIntensity: 0.9 }),
    Beacon_Glow: new THREE.MeshStandardMaterial({ color: 0x1a0800, emissive: 0xff7a18, emissiveIntensity: 6.0, roughness: 0.8 }),
  };
  mats.Rope.userData.nrm = 'row';
  mats.Iron_Dark.userData.nrm = 'row';
  for (const [k, m] of Object.entries(mats)) m.name = k;
  return mats;
}

/**
 * Pick the material variant whose normal-map handedness matches the geometry:
 * Blender bakes need a flipped green channel when three.js derives the tangent frame from
 * (V-flipped) glTF UVs; procedurally authored maps need it when real tangents are present.
 */
export function resolveMaterial(mats, name, geometry) {
  const key = (name || '').split('.')[0];
  const mat = mats[key];
  if (!mat) { console.warn('[assets] no material for', name); return new THREE.MeshStandardMaterial({ color: 0xff00ff }); }
  if (!mat.normalMap) return mat;
  const hasTan = !!geometry.attributes.tangent;
  const flip = (mat.userData.nrm === 'gl' && !hasTan) || (mat.userData.nrm === 'row' && hasTan);
  if (!flip) return mat;
  if (!mat.userData._flip) {
    const c = mat.clone();
    c.onBeforeCompile = mat.onBeforeCompile;
    c.customProgramCacheKey = mat.customProgramCacheKey;
    c.userData = { ...mat.userData, _flip: null };
    c.normalScale = new THREE.Vector2(mat.normalScale.x, -mat.normalScale.y);
    c.name = mat.name;
    mat.userData._flip = c;
  }
  return mat.userData._flip;
}

/** Flatten a loaded GLB into [{geometry, material}] with node transforms baked in (for instancing). */
export function extractParts(scene, mats) {
  const parts = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (g.attributes.color) { g.setAttribute('aWind', g.attributes.color); g.deleteAttribute('color'); }
    const material = resolveMaterial(mats, o.material.name, g);
    if ((material.userData.wind || material.userData.foliage) && !g.attributes.aWind) {
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { a[i * 4] = 1; a[i * 4 + 3] = 1; }
      g.setAttribute('aWind', new THREE.BufferAttribute(a, 4));
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    parts.push({ geometry: g, material });
  });
  return parts;
}

/** Clone a structure / character scene and swap in library materials by name. */
export function instantiate(scene, mats) {
  const root = scene.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry.attributes.color) o.geometry.deleteAttribute('color');
    o.material = resolveMaterial(mats, o.material.name, o.geometry);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}
