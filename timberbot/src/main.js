import * as THREE from 'three';
import { CFG, OPTS } from './config.js';
import { Terrain } from './terrain.js';
import { loadAssets, buildMaterials, instantiate, shared } from './assets.js';
import { World, SplatMap } from './world.js';
import { createEnvironment } from './env.js';
import { FX } from './fx.js';
import { Robot } from './robot.js';
import { Game } from './game.js';
import { GameAudio } from './audio.js';
import { Hud } from './hud.js';
import { QA } from './qa.js';

const params = new URLSearchParams(location.search);
if (params.has('grass')) OPTS.grassDensity = Math.min(2, Math.max(0, parseFloat(params.get('grass')) || 0));   // ?grass=0.1 for slow software renderers
const $ = (id) => document.getElementById(id);
const earlyErrors = [];
let qa = null;
const note = (m) => { if (qa) qa.noteError(m); else earlyErrors.push(m); };
addEventListener('error', (e) => note(e.message || 'error'));
addEventListener('unhandledrejection', (e) => note((e.reason && e.reason.message) || 'unhandled rejection'));
const origError = console.error.bind(console);
console.error = (...a) => { note(a.map(String).join(' ')); origError(...a); };

function fail(msg) {
  $('load-status').textContent = msg;
  $('loading').classList.add('failed');
}

async function boot() {
  const canvas = $('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) { fail('WebGL 2 is required to run Timberbot.'); return; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  let shaderErrors = 0;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    shaderErrors++;
    if (qa) qa.shaderErrors = shaderErrors;
    console.error('[shader]', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.25, 900);

  $('load-status').textContent = 'Loading models & textures…';
  const assets = await loadAssets(renderer, (p) => { $('load-bar').style.width = `${Math.round(p * 82)}%`; });

  $('load-status').textContent = 'Growing the forest…';
  await new Promise((r) => setTimeout(r, 30));
  const terrain = new Terrain();
  const splat = new SplatMap(terrain);
  const mats = buildMaterials(assets.T, splat.texture);
  scene.add(terrain.buildMeshes(mats.Terrain));
  const world = new World({ scene, terrain, assets, mats, splat }).build();
  $('load-bar').style.width = '90%';

  const env = createEnvironment(renderer, scene, camera);
  const fx = new FX(scene, terrain, assets.T, camera);
  const robot = new Robot(scene, assets, mats);
  const audio = new GameAudio();
  const hud = new Hud();
  const game = new Game({ scene, camera, renderer, terrain, world, robot, fx, audio, hud, assets, mats, splat });

  // ---------------------------------------------------------------- quality management
  const quality = { level: 2, locked: params.has('quality'), shadowEvery: 1 };
  const applyQuality = (lvl) => {
    quality.level = lvl;
    const dpr = window.devicePixelRatio || 1;
    quality.pixelRatio = lvl === 2 ? Math.min(dpr, 1.5) : lvl === 1 ? Math.min(dpr, 1) : Math.min(dpr, 1) * 0.72;
    quality.shadowEvery = lvl === 2 ? 1 : lvl === 1 ? 2 : 3;
    env.bloom.enabled = lvl > 0;
    world.grassUniforms.uFade.value = lvl === 2 ? 40 : lvl === 1 ? 30 : 22;
    resize();
  };
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(w, h);
    env.resize(w, h, quality.pixelRatio);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fx.setViewport(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
  }
  addEventListener('resize', resize);
  applyQuality(quality.locked ? THREE.MathUtils.clamp(parseInt(params.get('quality'), 10) || 0, 0, 2) : 2);

  qa = new QA({ renderer, terrain, world, game, robot, env, assets, quality });
  qa.shaderErrors = shaderErrors;
  earlyErrors.forEach((m) => qa.noteError(m));
  hud.bind(game, audio, qa);

  // ---------------------------------------------------------------- warm-up: compile every program once
  $('load-status').textContent = 'Compiling shaders…';
  await new Promise((r) => setTimeout(r, 30));
  const warm = [];
  for (const def of Object.values(CFG.BUILD)) { const o = instantiate(assets.M[def.model], mats); o.position.set(0, -400, 0); scene.add(o); warm.push(o); }
  for (const g of Object.values(game.ghosts)) g.visible = true;
  env.update(camera);
  try { renderer.compile(scene, camera); } catch (e) { console.error(e); }
  env.composer.render(0.016);
  for (const o of warm) scene.remove(o);
  for (const g of Object.values(game.ghosts)) g.visible = false;
  $('load-bar').style.width = '100%';

  // ---------------------------------------------------------------- main loop
  let last = performance.now(), frameNo = 0, slowT = 0, warmT = 0;
  renderer.shadowMap.autoUpdate = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);        // rAF timestamps can precede performance.now()
    frameNo++;
    if (window.__TB) window.__TB.frame = frameNo;
    shared.uTime.value += dt;
    game.update(dt);
    world.update(dt, camera);
    fx.update(dt, shared.uTime.value, game.player.pos);
    env.update(camera);
    let fireDist;
    for (const fr of fx.fires) if (fr.kind === 'campfire' && (fireDist === undefined || fr.d < fireDist)) fireDist = fr.d;
    audio.update(dt, fireDist);
    // embers breathe
    const tt = shared.uTime.value, glow = 0.75 + 0.25 * Math.sin(tt * 7.3) * Math.sin(tt * 4.1) + 0.1 * Math.sin(tt * 19);
    mats.Fire_Log.emissiveIntensity = 2.4 * glow;
    mats.Fire_Ash.emissiveIntensity = 1.0 * glow;
    mats.Beacon_Glow.emissiveIntensity = 6.5 * (0.85 + 0.15 * glow);
    renderer.shadowMap.needsUpdate = frameNo % quality.shadowEvery === 0;
    renderer.info.reset();
    env.composer.render(dt);
    qa.drawCalls = renderer.info.render.calls;
    qa.triangles = renderer.info.render.triangles;
    qa.frame(rawDt);
    // adaptive quality: step down if the frame rate stays low
    if (!quality.locked && game.started) {
      warmT += rawDt;
      if (warmT > 3) {
        slowT = qa.fps < 30 ? slowT + rawDt : Math.max(0, slowT - rawDt * 2);
        if (slowT > 2.5 && quality.level > 0) { applyQuality(quality.level - 1); slowT = 0; warmT = 0; hud.toast(`Adjusting graphics quality (${['low', 'medium', 'high'][quality.level]})`, 1800); }
      }
    }
  }

  const start = (withAudio) => {
    if (game.started) return;
    game.started = true;
    $('loading').classList.add('done');
    document.body.classList.add('playing');
    if (withAudio) audio.start();
    setTimeout(() => { $('loading').style.display = 'none'; }, 900);
  };
  $('load-status').textContent = 'Ready';
  $('start').classList.remove('hidden');
  $('start').addEventListener('click', () => start(true));
  addEventListener('pointerdown', () => { if (game.started) audio.start(); }, { capture: true });
  addEventListener('keydown', (e) => { if (!game.started && (e.code === 'Enter' || e.code === 'Space')) start(true); else if (game.started) audio.start(); }, { capture: true });
  if (params.has('autostart')) start(false);
  if (params.has('qa')) hud.toggleQA();

  window.__TB = { THREE, CFG, scene, camera, renderer, terrain, world, game, robot, fx, env, qa, hud, audio, quality, shared, mats };
  requestAnimationFrame(frame);
}

boot().catch((e) => { console.error(e); fail('Failed to start: ' + (e && e.message ? e.message : e)); });
