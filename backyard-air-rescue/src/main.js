import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, smoothstep, blobShadow } from './util.js';
import { L, PUSHERS, buildWorld, cruiseAlt, restHeight, inPond } from './world.js';
import { makeHeli, makeTeddy, makeDuck, makeRobot, makeKite, makeBall, makeBoat, makeDoll, makeBunny, makeAcorn, makeHook, makeMarker } from './models.js';
import { initPhysics } from './physics.js';
import { buildPlayground } from './playground.js';
import { makeBasket, buildApples, buildHammock, APPLES } from './picnic.js';
import { buildLife } from './life.js';
import { buildBirds } from './birds.js';
import { buildGarden, makeBucket } from './garden.js';
import { makeAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const MANUAL = params.has('manual');           // test harness drives the clock
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- tuning
const FLY = {
  maxSpeed: 10.5,   // yard units / s
  accel: 17,        // at full lean
  gain: 3.3,        // how eagerly it chases the stick
  leanW: 8.5,       // lean spring frequency: lean first, then go
  leanZ: 0.45,      // <1 gives the soft bounce when braking
  drag: 0.25,
  maxLean: 0.4,     // radians shown on the model
  yawRate: 4.5,
};
const G = 16;                 // cable gravity for the empty hook; each toy brings its own (heavier = calmer swing)
const STOW = 0.42;
const PICK_R = 3.5;           // close enough that the button starts pulsing
const CATCH_R = 0.45;         // the hook must be this close to the toy's loop to click on
const CATCH_SPEED = 2.6;      // ...and not swinging faster than this
const MAX_LEN = 9;            // longest the cable reels out
const PAD_R = 6.5;            // edge pointer / pad marker range
const PAD_DROP_R = 4.0;       // let go with the toy this close to the pad centre and it is set down gently
const CAM_OFF = new THREE.Vector3(0, 6.6, 12.6);

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: MANUAL });
const dprSteps = [Math.min(window.devicePixelRatio || 1, 2), 1.5, 1.25, 1, 0.8].filter((v, i, a) => i === 0 || v < a[0]);
let dprIndex = 0;
renderer.setPixelRatio(params.has('dpr') ? +params.get('dpr') : dprSteps[0]);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 2, 0.5, 600);
camera.position.copy(CAM_OFF); camera.lookAt(0, -1.0, 0);
const camQuat = camera.quaternion.clone();   // the camera never rotates

const uniforms = { uTime: { value: 0 }, uHeli: { value: new THREE.Vector3() }, uWash: { value: 0 }, uPondWash: { value: 0 } };
const lowEnd = params.get('q') === 'low' || (navigator.hardwareConcurrency || 4) <= 4 && (navigator.deviceMemory || 4) <= 2;
const world = buildWorld(scene, renderer, uniforms, { grass: lowEnd ? 27000 : 52000 });
world.lights.sun.shadow.mapSize.setScalar(lowEnd ? 1024 : 2048);
const life = buildLife(scene);
const garden = buildGarden(scene);
const orchard = buildApples(scene);
const hammock = buildHammock(scene);
const audio = makeAudio();
const birds = buildBirds(scene, audio);
life.setFlowers(world.flowerHeads());
world.setCamera(camera);

// ---------------------------------------------------------------- helicopter
const H = makeHeli();
scene.add(H.root);
const heli = {
  pos: new THREE.Vector3(L.pad.x, L.pad.y + H.skidY * 0.92, L.pad.z),
  vel: new THREE.Vector3(), tilt: new THREE.Vector2(), tiltVel: new THREE.Vector2(),
  yaw: 0.85, yVel: 0, hang: 0.7, squash: 0, squashV: 0, flying: false, rotor: 0.12, comp: 0, loadF: 0, react: new THREE.Vector2(),
};
const heliShadow = blobShadow(1.5, 0.38); scene.add(heliShadow);
const toyShadow = blobShadow(0.95, 0.4); scene.add(toyShadow); toyShadow.visible = false;
const hookShadow = blobShadow(0.32, 0.55); scene.add(hookShadow);

// ---------------------------------------------------------------- toys
const MAKERS = [makeTeddy, makeDuck, makeRobot, makeKite, makeBall, makeBoat, makeDoll];
const ROUND1 = 3;
const blanketC = new THREE.Vector3(L.home.x, 0.1, L.home.z);
const toys = MAKERS.map((mk, i) => {
  const t = mk(); scene.add(t.group);
  // picnic places: round one in front of the basket, round two behind it
  const home = i < ROUND1 ? new THREE.Vector3(L.home.x - 2.0 + i * 2.0, 0.11, L.home.z + 1.5) : new THREE.Vector3(L.home.x - 2.7 + (i - ROUND1) * 1.8, 0.11, L.home.z - 1.5);
  return Object.assign(t, { state: i < ROUND1 ? 'stranded' : 'hidden', rescued: false, yaw: 0, sq: 0, sqV: 0, wiggle: 0, hopT: 0, hopFrom: new THREE.Vector3(), happy: 0, rest: 0, floaty: false, appear: 1, home, isToy: true });
});
const [teddy, duck, robot, kite, ball, boat, doll] = toys;
teddy.group.position.set(L.bed.x, 0.3, L.bed.z); teddy.rest = 0.3;
duck.group.position.set(L.pond.x - 0.4, 0.02, L.pond.z + 0.2); duck.rest = 0.02; duck.floaty = true; duck.yaw = -0.5;
robot.group.position.set(L.tower.x, L.tower.platY, L.tower.z + 0.3); robot.rest = L.tower.platY;
// round two: each one needs a different trick
const KITE_AT = new THREE.Vector3(L.apple.x + 0.3, 7.7, L.apple.z + 3.75);
kite.rest = KITE_AT.y;
kite.idle = (t) => { kite.group.position.copy(KITE_AT); kite.group.rotation.set(-0.35 + Math.sin(t * 2.3) * 0.03, 0.25, 0.18 + Math.sin(t * 1.7) * 0.03); };
ball.group.position.set(L.shed.x - 1.5, 6.05, L.shed.z + 0.6); ball.rest = 6.05;
boat.rest = L.pool.y - 0.1;
boat.idle = (t) => {
  const a = t * 0.32, r = 1.7;
  boat.group.position.set(L.pool.x + Math.cos(a) * r, L.pool.y - 0.12 + Math.sin(t * 2.1) * 0.04, L.pool.z + Math.sin(a) * r);
  boat.group.rotation.set(Math.sin(t * 1.8) * 0.05, Math.atan2(-Math.sin(a), Math.cos(a)), Math.cos(t * 1.5) * 0.06);
};
doll.rest = L.hammock.pivotY - L.hammock.drop;
doll.idle = () => { hammock.seat(doll.group.position); doll.group.rotation.set(hammock.st.a * 0.3, 0.15, 0); };
// the bucket rides the winch like a toy, but its job is watering
const extra = () => ({ state: 'stranded', rescued: false, yaw: 0.4, sq: 0, sqV: 0, wiggle: 0, hopT: 0, hopFrom: new THREE.Vector3(), happy: 0, rest: 0, floaty: false, appear: 1, home: new THREE.Vector3() });
const bucket = Object.assign(makeBucket(), extra());
bucket.group.position.set(L.bucket.x, 0, L.bucket.z); scene.add(bucket.group);
// the picnic basket waits on the blanket
const basket = Object.assign(makeBasket(), extra(), { state: 'placed', rest: 0.1, yaw: 0 });
basket.group.position.copy(blanketC); scene.add(basket.group);
// the seesaw's passenger: a plush bunny who always hops back to her seat
const bunny = Object.assign(makeBunny(), extra(), { state: 'placed', isBunny: true, yaw: 0 });
bunny.group.position.set(L.seesaw.x - 3.4, 2, L.seesaw.z); scene.add(bunny.group);
const things = [...toys, bucket, basket, bunny];
const playground = buildPlayground(scene, audio, life, { landingSpot });
// real rigid-body physics (blocks, dominoes, cans) starts up asynchronously; the game waits for it before the first frame
let phys = null;
const physReady = initPhysics(scene, audio, life).then((p) => { phys = p; }).catch((e) => console.warn('physics unavailable', e));
teddy.group.position.set(L.bed.x, 0.3, L.bed.z); teddy.rest = 0.3;
duck.group.position.set(L.pond.x - 0.4, 0.02, L.pond.z + 0.2); duck.rest = 0.02; duck.floaty = true; duck.yaw = -0.5;
robot.group.position.set(L.tower.x, L.tower.platY, L.tower.z + 0.3); robot.rest = L.tower.platY;

// ---------------------------------------------------------------- winch
const hook = makeHook(); scene.add(hook);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1, 6), new THREE.MeshStandardMaterial({ color: 0xfaf6ea, roughness: 0.6 }));
cable.castShadow = true; scene.add(cable);
const winch = { state: 'idle', len: STOW, bob: heli.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), vel: new THREE.Vector3(), toy: null, target: null, timer: 0, hold: null, rest: 0, moving: 0, tension: 0, liftAt: -9, floor: 0, held: false, bumped: false, lastTink: -9 };
const anchor = new THREE.Vector3();

const BLUE = 0x2f9bff;
const RED = 0xff5a4a, ORANGE = 0xffa81f;
const markerColor = (t) => (t.isBucket ? BLUE : t.isBasket ? RED : ORANGE);
const markers = things.map((t) => makeMarker(markerColor(t)));
const padMarker = makeMarker(0x35d07f);
const waterSpots = [{ x: L.pond.x, y: 0.1, z: L.pond.z, s: 4 }, { x: L.pool.x, y: L.pool.y + 0.05, z: L.pool.z, s: 2.6 }];
const waterMarkers = waterSpots.map(() => makeMarker(BLUE));
const plantMarkers = garden.plants.map(() => makeMarker(BLUE));
const treeMarker = makeMarker(RED), blanketMarker = makeMarker(0x35d07f), finaleMarker = makeMarker(0x35d07f);
const appleMarkers = orchard.apples.map(() => makeMarker(RED));
appleMarkers.forEach((m) => { m.arrow.visible = false; m.ring.scale.setScalar(1.1); });
treeMarker.g.position.set(L.apple.x, 0.05, L.apple.z + 2.6); blanketMarker.g.position.copy(blanketC); finaleMarker.g.position.set(L.pad.x, L.pad.y + 0.03, L.pad.z);
[...markers, padMarker, ...waterMarkers, ...plantMarkers, treeMarker, blanketMarker, finaleMarker, ...appleMarkers].forEach((m) => scene.add(m.g));
waterMarkers.forEach((m, i) => m.g.position.set(waterSpots[i].x, waterSpots[i].y, waterSpots[i].z));
plantMarkers.forEach((m, i) => { const p = garden.plants[i]; m.g.position.set(p.x, p.y + 0.05, p.z); m.arrow.scale.setScalar(0.75); });
padMarker.g.position.set(L.pad.x, L.pad.y + 0.03, L.pad.z);

const timers = [];
const later = (sec, fn) => timers.push({ at: game.time + sec, fn });
const game = { time: 0, rescued: 0, free: false, celebrate: -1, usedWinch: false, delivered: false, heliBounces: 0, gardenDone: 0, pourTick: 0, round: 1, picnic: false, finale: null, tod: 0, todTarget: 0, acorns: 0, paint: 0, shakeT: 0 };

// ---------------------------------------------------------------- HUD
const hud = { joy: $('joy'), knob: $('knob'), btn: $('winch'), slots: [...document.querySelectorAll('.slot')], edge: $('edge'), hintMove: $('hintMove'), hintTap: $('hintTap'), star: $('star'), pips: [...document.querySelectorAll('#garden .pip')], counter: $('counter'), acornPips: [...document.querySelectorAll('#acorns i')], swatches: [...document.querySelectorAll('#paints .sw')], applebar: $('applebar'), ap: [...document.querySelectorAll('#applebar i')], bigstar: $('bigstar'), tod: $('tod'), grade: [...document.querySelectorAll('#grade > div')], gstar: $('gstar'), water: $('water'), wd: [...document.querySelectorAll('#water i')] };
function makeThumbs() {
  // Render each toy once into its counter slot so the HUD matches the 3D toys exactly.
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(160, 160); r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 2.2));
  const d = new THREE.DirectionalLight(0xfff0d0, 2.5); d.position.set(2, 4, 5); s.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  MAKERS.forEach((mk, i) => {
    const t = mk(); t.anim(0.4, 'happy'); t.group.rotation.y = 0.45; s.add(t.group);
    cam.position.set(0, t.height * 0.62, t.height * 2.45); cam.lookAt(0, t.height * 0.5, 0);
    r.render(s, cam);
    hud.slots[i].querySelector('img').src = r.domElement.toDataURL('image/png');
    s.remove(t.group);
  });
  r.dispose(); r.forceContextLoss();
}
try { makeThumbs(); } catch (e) { /* counter still works without pictures */ }

// ---------------------------------------------------------------- input
const input = { x: 0, y: 0 };
const joy = { id: null, bx: 0, by: 0 };
const keys = {};
let scripted = null;
const joyR = () => clamp(Math.min(innerWidth, innerHeight) * 0.17, 44, 90);
function setJoy(dx, dy) {
  const R = joyR(), len = Math.hypot(dx, dy);
  if (len > R) { // the base trails the thumb so it never gets "lost"
    joy.bx += (dx / len) * (len - R); joy.by += (dy / len) * (len - R); dx *= R / len; dy *= R / len;
  }
  let m = Math.min(1, Math.hypot(dx, dy) / R);
  const dead = 0.1; m = m < dead ? 0 : (m - dead) / (1 - dead);
  const a = Math.atan2(dy, dx);
  input.x = Math.cos(a) * m; input.y = Math.sin(a) * m;
  hud.joy.style.transform = `translate(${joy.bx}px,${joy.by}px)`;
  hud.knob.style.transform = `translate(${dx}px,${dy}px)`;
}
addEventListener('pointerdown', (e) => {
  audio.start();
  if (e.target.closest('#winch, #paints, #counter, #tod')) return;
  if (joy.id === null && e.clientX < innerWidth * 0.6) {
    joy.id = e.pointerId; joy.bx = e.clientX; joy.by = e.clientY;
    hud.joy.classList.add('on'); setJoy(0, 0);
  }
});
addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) setJoy(e.clientX - joy.bx, e.clientY - joy.by); });
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.id = null; input.x = input.y = 0; hud.joy.classList.remove('on'); } };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);
let winchPointer = null;
hud.btn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio.start();
  winchPointer = e.pointerId; try { hud.btn.setPointerCapture(e.pointerId); } catch (_) {}
  pressWinch();
});
const endWinch = (e) => { if (e.pointerId === winchPointer) { winchPointer = null; winch.held = false; } };
hud.btn.addEventListener('pointerup', endWinch); hud.btn.addEventListener('pointercancel', endWinch);
addEventListener('blur', () => { winchPointer = null; winch.held = false; });
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { audio.start(); pressWinch(); } keys[e.code] = true; });
addEventListener('keyup', (e) => { if (e.code === 'Space') winch.held = false; keys[e.code] = false; });
for (const n of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'dblclick']) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
function readInput() {
  if (scripted) return scripted;
  if (joy.id !== null) return input;
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  const m = Math.hypot(kx, ky) || 1;
  input.x = kx / m; input.y = ky / m;
  return input;
}

// ---------------------------------------------------------------- winch logic
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pickable = (t) => (t.isBasket ? !game.picnic : true) && (t.state === 'stranded' || t.state === 'placed' || (t.state === 'home' && game.free)) && (game.free || !t.rescued);
function nearestToy() {
  let best = null, bd = PICK_R;
  for (const t of things) { if (!pickable(t)) continue; const d = hdist(heli.pos, t.group.position); if (d < bd) { bd = d; best = t; } }
  return best;
}
function hookFloor(x, z) {
  { const f = playground.floor(x, z); if (f !== undefined) return f; }
  if (Math.abs(x - L.tower.x) < 2.7 && Math.abs(z - L.tower.z) < 2.7) return L.tower.platY + 0.15;
  const hw = L.shed.w / 2 + 0.9;
  if (Math.abs(x - L.shed.x) < hw && Math.abs(z - L.shed.z) < L.shed.d / 2 + 0.8) return L.shed.h + 0.3 + 3.0 * (1 - Math.abs(x - L.shed.x) / hw);
  { // apple tree canopy: the hook rests on the leaves
    const r = Math.hypot(x - L.apple.x, z - L.apple.z), r3 = Math.hypot(x - L.apple.x - 0.4, z - L.apple.z - 2.3);
    let f = 0;
    if (r < 3.6) f = 7.6 + 2.95 * Math.sqrt(1 - (r / 3.6) ** 2) - 0.25;
    if (r3 < 2.2) f = Math.max(f, 6.4 + 1.8 * Math.sqrt(1 - (r3 / 2.2) ** 2) - 0.2);
    if (f > 0) return f;
  }
  if (Math.abs(x - L.hammock.x) < 2.6 && Math.abs(z - L.hammock.z) < 0.9) return L.hammock.pivotY - L.hammock.drop + 0.1;
  if (Math.hypot(x - L.pad.x, z - L.pad.z) < L.pad.r) return L.pad.y + 0.15;
  return 0.15;
}
function toyTop(t, out) {
  if (t.state === 'stranded' && t.idle) { t.group.updateMatrixWorld(); return t.group.localToWorld(out.set(0, t.height, 0)); } return out.copy(t.group.position).setY(t.group.position.y + t.height); }
const tmpTop = new THREE.Vector3();

function pressWinch() {
  winch.held = true;
  if (!heli.flying) heli.flying = true;
}

/** Where a dropped toy ends up: straight below, or the nearest spot it can rest on. */
function landingSpot(x, z) {
  const ok = (px, pz) => px > -32 && px < L.east - 3 && pz > -30 && pz < 26 && restHeight(px, pz) !== null;
  if (ok(x, z)) return [x, z];
  for (let r = 0.5; r < 10; r += 0.5) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (ok(px, pz)) return [px, pz];
  }
  return [L.pad.x + 5, L.pad.z + 3];
}

function dropToy(t) {
  // let go too early: the toy tumbles down and has to be fetched again
  const p = t.group.position, v = winch.vel;
  // straight down onto the seesaw or trampoline if it's right underneath; otherwise carried forward a little by the swing
  const [sx, sz] = playground.catches(p.x, p.z) ? [p.x, p.z] : landingSpot(p.x + v.x * 0.4, p.z + v.z * 0.4);
  const rest = restHeight(sx, sz), g = 20, vy = Math.min(v.y, 2), hgt = Math.max(0, p.y - rest);
  t.fall = { from: p.clone(), to: new THREE.Vector3(sx, rest, sz), vy, g, t: 0, dur: (vy + Math.sqrt(vy * vy + 2 * g * hgt)) / g, spin: (Math.random() < 0.5 ? -1 : 1) * 5 };
  t.state = 'falling'; t.rest = rest;
  winch.toy = null; winch.state = 'idle'; winch.vel.set(0, 0, 0);
  if (t.isBucket && t.water > 0.05) { garden.splash(p.x, p.y + 1, p.z, 18, 1.2); t.water = 0; }
  if (t.isBasket && t.held.length) { // apples tumble out and can be scooped up again
    for (const a of t.held) {
      const [ax, az] = landingSpot(sx + (Math.random() - 0.5) * 3, sz + (Math.random() - 0.5) * 3);
      a.state = 'spill'; orchard.fly(a, new THREE.Vector3(ax, (restHeight(ax, az) ?? 0) + 0.3, az), 0.75, 1.3, 'ground');
    }
    t.held = [];
  }
  audio.sfx.uhoh();
}

function landToy(t, impact = 3) {
  t.fall = null;
  if (playground.landed(t, impact) === 'bounce') return;
  t.state = 'placed';
  t.floaty = t.rest < 0.05 && inPond(t.group.position.x, t.group.position.z);
  t.group.quaternion.identity(); t.yaw = 0; t.sqV = 10;
  audio.sfx.pomf(); if (t.floaty) audio.sfx.splash();
  if (!game.free && !t.rescued && hdist(t.group.position, L.pad) < L.pad.r) rescue(t);
}

function dropZone(t) {
  if (t.isBasket) return { x: L.home.x, z: L.home.z, r: 3.4, exact: true };
  return { x: L.pad.x, z: L.pad.z, r: PAD_DROP_R, exact: false };
}
function letGo() {
  const t = winch.toy, p = t.group.position, zn = dropZone(t);
  const inZone = hdist(p, zn) < zn.r;
  if (!inZone && !game.free) return dropToy(t);
  // over its drop zone (or anywhere during free flight): set it down gently
  const hx = inZone ? (zn.exact ? zn.x : zn.x + clamp(p.x - zn.x, -1.5, 1.5)) : p.x, hz = inZone ? (zn.exact ? zn.z : zn.z + clamp(p.z - zn.z, -1.5, 1.5)) : p.z;
  const rest = restHeight(hx, hz);
  if (rest === null) return dropToy(t);
  winch.hold = { x: hx, z: hz }; winch.rest = rest; winch.state = 'lower'; winch.timer = 0; winch.landed = false;
}

function tryCatch() {
  for (const t of things) {
    if (!pickable(t)) continue;
    toyTop(t, tmpTop);
    const dx = hdist(winch.bob, tmpTop), dy = winch.bob.y - tmpTop.y;
    if (dx < CATCH_R && dy > -0.35 && dy < 0.35 && winch.vel.length() < CATCH_SPEED) {
      winch.bob.copy(tmpTop); winch.vel.set(0, 0, 0); winch.len = anchor.distanceTo(tmpTop);
      winch.target = t; winch.state = 'grab'; winch.timer = 0; t.wiggle = 1; game.usedWinch = true;
      audio.sfx.click(); later(0.16, () => audio.sfx[t.name]());
      return;
    }
  }
}

function updateWinch(dt) {
  const w = winch; w.timer += dt;
  const before = w.len;
  const reel = (target, speed) => { w.len = w.len < target ? Math.min(target, w.len + speed * dt) : Math.max(target, w.len - speed * dt); return w.len === target; };
  switch (w.state) {
    case 'idle':
      if (w.toy) {
        // the bucket dips itself into water below; everything else rides at its carry length
        reel(w.toy.dunk ?? w.toy.carry.len, w.toy.dunk != null || w.len > w.toy.carry.len + 0.05 ? 4 : game.time - w.liftAt < 1.5 ? 3.6 : 1.6);
        if (!w.held) letGo();
      } else if (w.held && heli.flying) {
        // pay out only as far as whatever is below (no slack piling up on the grass)
        reel(Math.min(MAX_LEN, anchor.y - hookFloor(w.bob.x, w.bob.z) + 0.2), 3.2);
        tryCatch();
        if (w.bumped && game.time - w.lastTink > 0.45) { w.lastTink = game.time; audio.sfx.tink(); }
      } else reel(STOW, 5);
      break;
    case 'grab': {
      toyTop(w.target, tmpTop); w.bob.copy(tmpTop); w.vel.set(0, 0, 0); w.len = Math.max(w.len, anchor.distanceTo(tmpTop));
      if (w.timer > 0.5) { w.toy = w.target; w.target = null; w.toy.state = 'hanging'; w.toy.floaty = false; w.state = 'idle'; w.hold = null; w.liftAt = game.time; w.floor = w.toy.rest + w.toy.height;
        heli.yVel -= w.toy.carry.mass * 15; } // a heavy toy tugs the helicopter down as it takes the weight
      break;
    }
    case 'lower': {
      const t = w.toy;
      // steady first, then lower: wait until we're hovering over the spot
      const steady = (hdist(heli.pos, w.hold) < 0.9 && heli.vel.length() < 1.6) || w.timer > 2.6;
      if (steady) reel(40, 3.4);
      if (w.landed || w.timer > 9) {
        t.state = 'placed'; t.rest = w.rest; t.floaty = w.rest < 0.05 && inPond(w.bob.x, w.bob.z);
        t.group.position.set(w.bob.x, w.rest, w.bob.z); t.group.quaternion.identity(); t.yaw = 0; t.sqV = 7;
        audio.sfx.pomf(); if (t.floaty) audio.sfx.splash();
        w.toy = null; w.state = 'release'; w.timer = 0;
        if (playground.landed(t, 2.5) === 'bounce') break;
        if (!game.free && !t.rescued && hdist(t.group.position, L.pad) < L.pad.r + 0.8) rescue(t);
        if (t.isBasket && hdist(t.group.position, L.home) < 3) deliverBasket();
      }
      break;
    }
    case 'release': if (w.timer > 0.45) { w.state = 'idle'; w.hold = null; } break;
  }
  w.moving = Math.sign(w.len - before);
}

function bloom(pl) {
  pl.target = 1; pl.progress = 0; pl.pop = 1;
  later(0.1, save);
  audio.sfx.grow(); life.burst(pl.x, pl.y + pl.top * 0.8, pl.z, 26, 0.7);
  if (garden.thirsty().length === 0) later(0.9, () => {
    // whole garden in bloom: celebrate, then let plants get thirsty again one at a time so there is always a job
    audio.sfx.fanfare(); hud.gstar.classList.add('on'); game.gardenDone++;
    garden.plants.forEach((p, k) => later(k * 0.12, () => { p.pop = 1; life.burst(p.x, p.y + p.top, p.z, 22, 0.9); }));
    if (game.gardenDone === 1) later(75, wiltOne);
  });
}
function wiltOne() {
  const ok = garden.plants.filter((p) => p.target === 1);
  if (ok.length && garden.thirsty().length < 4) { const p = ok[Math.floor(Math.random() * ok.length)]; p.target = 0; p.progress = 0; hud.gstar.classList.remove('on'); }
  later(40, wiltOne);
}

function updateBucket(dt, t, thirstyCount) {
  const b = bucket, carrying = b.state === 'hanging';
  b.tiltTo = 0; b.dunk = null;
  let pouring = false;
  if (carrying) {
    const p = b.group.position, wy = garden.waterAt(winch.bob.x, winch.bob.z);
    if (wy !== null && b.water < 3) {
      // over water with room in the bucket: dip in and fill
      b.dunk = clamp(anchor.y - (wy - 0.5 + b.height), 1.0, MAX_LEN);
      if (p.y < wy + 0.05) {
        if (!b.filling) { b.filling = true; audio.sfx.splash(); garden.splash(p.x, wy + 0.1, p.z, 12); }
        b.water = Math.min(3, b.water + dt * 2.2);
        if (b.water >= 3) { audio.sfx.glug(); garden.splash(p.x, wy + 0.1, p.z, 16, 1.2); }
      }
    } else {
      b.filling = false;
      if (b.water > 0.02) {
        let pl = null, bd = 2.4;
        for (const q of garden.plants) { if (q.target === 1) continue; const d = hdist(winch.bob, q); if (d < bd) { bd = d; pl = q; } }
        if (pl) { // hovering over a thirsty plant: tip and pour
          pouring = true; b.tiltTo = 1.15;
          const amt = Math.min(b.water, dt / 1.3, 1 - pl.progress); b.water -= amt; pl.progress += amt;
          for (let k = 0; k < 2; k++) garden.drop(p.x + (Math.random() - 0.5) * 0.5, p.y + 1.0, p.z + (Math.random() - 0.5) * 0.5, (pl.x - p.x) * 1.2 + (Math.random() - 0.5), 0.5, (pl.z - p.z) * 1.2 + (Math.random() - 0.5), 1.1);
          if (t - game.pourTick > 0.16) { game.pourTick = t; audio.sfx.pour(); }
          if (pl.progress >= 0.999) bloom(pl);
          if (b.water < 0.02) b.water = 0;
        } else if (Math.random() < dt * 2.5 * b.water) garden.drop(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.9, p.z + (Math.random() - 0.5) * 0.8, winch.vel.x * 0.5, 1, winch.vel.z * 0.5, 0.9);
      }
    }
  } else b.filling = false;
  b.tiltNow = damp(b.tiltNow, b.tiltTo, 6, dt);
  // where to go next
  const needWater = carrying && b.water < 0.3 && !pouring, hasWater = carrying && b.water >= 0.3;
  waterMarkers.forEach((m, i) => {
    m.g.visible = needWater && thirstyCount > 0;
    if (m.g.visible) { m.arrow.position.y = 2.2 + Math.abs(Math.sin(t * 3.2 + i)) * 0.8; m.arrow.rotation.y = t * 1.5; const s = waterSpots[i].s + Math.sin(t * 3.2) * 0.3; m.ring.scale.set(s, s, 1); }
  });
  plantMarkers.forEach((m, i) => {
    const pl = garden.plants[i];
    m.g.visible = (hasWater || pouring) && pl.target === 0;
    if (m.g.visible) { m.arrow.position.y = pl.top + 1.6 + Math.abs(Math.sin(t * 3.2 + i)) * 0.6; m.arrow.rotation.y = t * 1.5; const s = 2.2 + Math.sin(t * 3.2 + i) * 0.2; m.ring.scale.set(s, s, 1); }
  });
  // HUD
  garden.plants.forEach((pl, i) => hud.pips[i] && hud.pips[i].classList.toggle('on', pl.target === 1));
  hud.water.classList.toggle('on', carrying);
  hud.wd.forEach((el, i) => el.classList.toggle('on', b.water > i + 0.15));
}

// ---------------------------------------------------------------- apples
function updateApples(dt, t) {
  const B = basket, carrying = B.state === 'hanging';
  // flying close to the apple tree shakes the apples loose, one at a time
  const nearTree = heli.flying && hdist(heli.pos, L.apple) < 6.2;
  if (nearTree) { game.shakeT -= dt; if (game.shakeT <= 0) { const a = orchard.apples.find((q) => q.state === 'tree'); if (a) { a.state = 'wobble'; a.wob = 0; audio.sfx.rustle(); } game.shakeT = 0.8; } }
  garden.appleTree.rotation.z = nearTree && orchard.apples.some((q) => q.state === 'tree' || q.state === 'wobble') ? Math.sin(t * 23) * 0.012 : garden.appleTree.rotation.z * 0.9;
  // the basket dips to the grass when it is over fallen apples, and they hop in
  B.dunk = null;
  if (carrying && B.held.length < APPLES) {
    let near = false;
    for (const a of orchard.apples) {
      if (a.state !== 'ground') continue;
      const d = hdist(a.pos, B.group.position);
      if (d < 2.4) near = true;
      if (d < 1.5 && B.group.position.y < a.pos.y + 0.8 && B.held.length < APPLES) {
        a.state = 'hop'; B.held.push(a); a.slot = B.slots[B.held.length - 1];
        orchard.fly(a, null, 0.4, 0.9, 'basket'); later(0.38, () => audio.sfx.plop());
      }
    }
    // the helicopter floats high near the tree, so the basket may need a long cable to reach the grass
    if (near) B.dunk = clamp(anchor.y - (restHeight(winch.bob.x, winch.bob.z) ?? 0) - 0.05 - B.height, 1.0, 14);
  }
  B.group.updateMatrixWorld();
  for (const a of orchard.apples) {
    const m = a.mesh;
    if (a.state === 'tree') { m.position.copy(a.pos); m.position.y += Math.sin(t * 1.4 + a.pos.x) * 0.02; }
    else if (a.state === 'wobble') {
      a.wob += dt; m.rotation.z = Math.sin(a.wob * 40) * 0.35;
      if (a.wob > 0.45) { a.state = 'fall'; m.rotation.z = 0; orchard.fly(a, orchard.groundSpot(), 0.7, 0, 'ground'); }
    } else if (a.anim) {
      const an = a.anim; an.t += dt;
      const u = Math.min(1, an.t / an.dur), to = an.to || B.group.localToWorld(v2.copy(a.slot));
      m.position.lerpVectors(an.from, to, a.state === 'fall' ? u : u * u * (3 - 2 * u));
      if (a.state === 'fall') m.position.y = lerp(an.from.y, to.y, u * u);
      m.position.y += Math.sin(u * Math.PI) * an.arc;
      m.rotation.x += dt * 9;
      if (u >= 1) {
        a.anim = null; a.state = an.next;
        if (a.state === 'ground') { a.pos.copy(to); m.rotation.set(0, m.rotation.y, 0); audio.sfx.plop(); }
      }
    } else if (a.state === 'ground') m.position.copy(a.pos);
    else if (a.state === 'basket') { m.position.copy(B.group.localToWorld(v2.copy(a.slot))); m.quaternion.copy(B.group.quaternion); }
  }
  // where to go: the tree, a fallen apple, or home to the blanket
  const onGround = orchard.apples.filter((q) => q.state === 'ground'), onTree = orchard.apples.some((q) => q.state === 'tree' || q.state === 'wobble' || q.state === 'fall');
  const full = B.held.length >= APPLES;
  treeMarker.g.visible = carrying && !full && !onGround.length && onTree;
  blanketMarker.g.visible = carrying && full && !game.picnic;
  orchard.apples.forEach((a, i) => {
    const mk = appleMarkers[i]; mk.g.visible = carrying && !full && a.state === 'ground';
    if (mk.g.visible) { mk.g.position.set(a.pos.x, a.pos.y - 0.25, a.pos.z); const s = 1.0 + Math.sin(t * 4 + i) * 0.12; mk.ring.scale.set(s, s, 1); }
  });
  for (const [mk, s0, h] of [[treeMarker, 3.2, 10.5], [blanketMarker, 3.4, 2.4]]) if (mk.g.visible) { mk.arrow.position.y = h + Math.abs(Math.sin(t * 3.2)) * 0.8; mk.arrow.rotation.y = t * 1.5; const s = s0 + Math.sin(t * 3.2) * 0.3; mk.ring.scale.set(s, s, 1); }
  hud.applebar.classList.toggle('on', carrying);
  hud.ap.forEach((el, i) => el.classList.toggle('on', i < B.held.length));
}

// ---------------------------------------------------------------- golden acorns + paint
const ACORN_SPOTS = [[9.5, 0, -12.6], [20, 0, -9.6], [21.7, 5.5, -19.7], [58.2, 0.15, 5.0], [-21.4, 0.3, 13.6], [-19.8, 0, -29.4], [L.pond.x + 5.6, 0.1, L.pond.z + 2.6], [-9.6, 0.36, -9.6], [45, 1.6, -7.5]];
const ACORN_R = 2.4;
const PAINTS = [{ c: 0xdc1f2e, r: 0.22, m: 0 }, { c: 0x2f80ed, r: 0.22, m: 0 }, { c: 0x8f5bd6, r: 0.22, m: 0 }, { c: 0xffc23a, r: 0.18, m: 0.65 }];
const acorns = ACORN_SPOTS.map(([x, y, z], i) => {
  const a = makeAcorn(); a.group.position.set(x, y, z); a.group.scale.setScalar(1.25); scene.add(a.group);
  return Object.assign(a, { home: new THREE.Vector3(x, y, z), got: false, t: -1, ph: i * 0.37 });
});
const NG = 70, gpos = new Float32Array(NG * 3), gcol = new Float32Array(NG * 3), glitter = [];
for (let i = 0; i < NG; i++) glitter.push({ x: 0, y: -50, z: 0, life: 0 });
const ggeo = new THREE.BufferGeometry();
ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3)); ggeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
{
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,215,90,0.8)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  // drawn on top of everything so a sparkle gives away an acorn hidden under the slide or behind the shed
  const pts = new THREE.Points(ggeo, new THREE.PointsMaterial({ size: 0.55, map: tex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.renderOrder = 9; scene.add(pts);
}
let gi = 0;
function setPaint(i, fanfare) {
  const P = PAINTS[i]; H.paint.color.set(P.c); H.paint.roughness = P.r; H.paint.metalness = P.m; game.paint = i;
  hud.swatches.forEach((el, k) => el.classList.toggle('sel', k === i));
  if (fanfare) { audio.sfx.paint(); life.burst(heli.pos.x, heli.pos.y + 1, heli.pos.z, 40, 0.8); }
}
function unlockPaints() {
  const n = Math.floor(game.acorns / 3);
  hud.swatches.forEach((el, k) => el.classList.toggle('locked', k > n));
  hud.acornPips.forEach((el, k) => el.classList.toggle('on', k < game.acorns));
  hud.swatches[0].parentNode.classList.toggle('any', n > 0);
}
hud.swatches.forEach((el, k) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.start(); if (!el.classList.contains('locked') && game.paint !== k) { setPaint(k, true); save(); } }));
function updateAcorns(dt, t) {
  for (const a of acorns) {
    const g = a.group;
    if (!a.got) {
      g.rotation.y = t * 1.2 + a.ph; g.position.y = a.home.y + 0.12 + Math.sin(t * 2 + a.ph) * 0.1;
      if (Math.sin(t * 3.1 + a.ph * 5) > 0.93) { const p = glitter[gi++ % NG]; p.x = a.home.x + (Math.random() - 0.5) * 0.8; p.y = a.home.y + 0.6; p.z = a.home.z + (Math.random() - 0.5) * 0.8; p.life = 1.3; }
      if (heli.flying && hdist(heli.pos, a.home) < ACORN_R) {
        a.got = true; a.t = 0; game.acorns++;
        audio.sfx.acorn(); life.burst(a.home.x, a.home.y + 1, a.home.z, 18, 0.6);
        unlockPaints();
        if (game.acorns % 3 === 0 && game.acorns / 3 < PAINTS.length) later(0.6, () => setPaint(game.acorns / 3, true));
        save();
      }
    } else if (a.t >= 0) { // zip up into the helicopter
      a.t += dt; const u = Math.min(1, a.t / 0.5);
      g.position.lerpVectors(a.home, heli.pos, u * u); g.scale.setScalar(1.25 * (1 - u) + 0.01); g.rotation.y += dt * 14;
      if (u >= 1) { a.t = -1; g.visible = false; }
    }
  }
  for (let i = 0; i < NG; i++) {
    const p = glitter[i];
    if (p.life > 0) { p.life -= dt; p.y += dt * 1.9; }
    gpos[i * 3] = p.x; gpos[i * 3 + 1] = p.life > 0 ? p.y : -50; gpos[i * 3 + 2] = p.z;
    const b = Math.max(0, Math.sin((p.life / 1.3) * Math.PI)); gcol[i * 3] = b; gcol[i * 3 + 1] = b; gcol[i * 3 + 2] = b;
  }
  ggeo.attributes.position.needsUpdate = true; ggeo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- sunset finale
const allDone = () => game.free && game.gardenDone > 0 && game.picnic;
function updateFinale(dt, t) {
  if (!game.finale && allDone()) { game.finale = 'dusk'; setTimeTarget(2, true); later(0.5, () => audio.sfx.chime()); }
  // come home: hover over the pad and the helicopter lands itself
  if (game.finale === 'dusk' && heli.flying && !winch.toy && winch.state === 'idle' && hdist(heli.pos, L.pad) < 2.4 && heli.vel.length() < 1.6) { heli.flying = false; game.finale = 'landing'; }
  if (game.finale === 'landing') {
    if (heli.flying) game.finale = 'dusk';
    else if (heli.pos.y < L.pad.y + H.skidY * 0.92 + 0.15) {
      game.finale = 'done'; save();
      audio.sfx.fanfare(); toys.forEach((x) => (x.happy = 14));
      hud.bigstar.classList.add('on'); later(4.5, () => hud.bigstar.classList.remove('on'));
      for (let j = 0; j < 6; j++) later(j * 0.4, () => life.burst(L.pad.x + Math.cos(j) * 4, 3 + (j % 3), L.pad.z + Math.sin(j) * 3, 45, 1.3));
    }
  }
  finaleMarker.g.visible = game.finale === 'dusk' && !winch.toy;
  if (finaleMarker.g.visible) { finaleMarker.arrow.position.y = 2.4 + Math.abs(Math.sin(t * 3.2)) * 0.8; finaleMarker.arrow.rotation.y = t * 1.5; const s = 3.5 + Math.sin(t * 3.2) * 0.3; finaleMarker.ring.scale.set(s, s, 1); }
}

// ---------------------------------------------------------------- time of day
const TOD_NAMES = ['morning', 'afternoon', 'evening'];
function applyTime() {
  const td = game.tod;
  world.setTime(td); life.setTime(td); birds.setTime(td); audio.setTime(td);
  life.setFireflies(smoothstep(1.4, 2, td));
  const w = [Math.max(0, 1 - td), Math.max(0, 1 - Math.abs(td - 1)), Math.max(0, td - 1)];
  hud.grade.forEach((el, i) => (el.style.opacity = w[i].toFixed(3)));
}
function updateTime(dt) {
  const d = game.todTarget - game.tod;
  if (Math.abs(d) > 1e-4) { game.tod += Math.sign(d) * Math.min(Math.abs(d), dt * 0.3); applyTime(); }
}
function setTimeTarget(i, quiet) {
  game.todTarget = i; hud.tod.dataset.t = TOD_NAMES[i];
  if (!quiet) { audio.sfx.chime(); save(); }
}
hud.tod.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation(); audio.start();
  setTimeTarget((Math.round(game.todTarget) + 1) % 3);
});

// ---------------------------------------------------------------- saving (on the phone, offline)
const SAVE_KEY = 'backyard-air-rescue-v1';
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      rescued: toys.filter((x) => x.rescued).map((x) => x.name), round: game.round, plants: garden.plants.map((p) => p.target), gardenDone: game.gardenDone,
      acorns: acorns.map((a) => a.got), paint: game.paint, picnic: game.picnic, tod: Math.round(game.todTarget), finale: game.finale === 'done' || game.finale === 'over',
    }));
  } catch (_) { /* no storage: the game still plays, it just won't remember */ }
}
function load() {
  let d = null;
  try { d = params.has('fresh') ? null : JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) {}
  if (!d) return;
  for (const x of toys) if (d.rescued?.includes(x.name)) {
    x.rescued = true; x.state = 'home'; x.rest = x.home.y; x.floaty = false; x.group.position.copy(x.home); x.group.rotation.set(0, 0, 0); x.group.visible = true; x.appear = 1;
    game.rescued++; hud.slots[toys.indexOf(x)].classList.add('saved');
  }
  game.round = d.round || 1;
  if (game.round >= 2) startRound2(true);
  if (game.rescued === toys.length) { game.free = true; hud.star.classList.add('on'); }
  (d.plants || []).forEach((v, i) => { const p = garden.plants[i]; if (p) { p.target = p.bloom = v; } });
  game.gardenDone = d.gardenDone || 0;
  if (game.gardenDone) { later(75, wiltOne); if (!garden.thirsty().length) hud.gstar.classList.add('on'); }
  (d.acorns || []).forEach((got, i) => { if (got && acorns[i]) { acorns[i].got = true; acorns[i].group.visible = false; game.acorns++; } });
  unlockPaints(); setPaint(Math.min(d.paint || 0, Math.floor(game.acorns / 3)), false);
  if (d.picnic) {
    game.picnic = true;
    orchard.apples.forEach((a, i) => { a.state = 'basket'; a.anim = null; a.slot = basket.slots[i]; basket.held.push(a); });
  }
  if (d.finale) game.finale = 'over';
  if (d.tod != null) { setTimeTarget(d.tod, true); game.tod = d.tod; }
}
// grown-ups: hold the toy counter for three seconds to start over
{
  let tmr = null;
  hud.counter.addEventListener('pointerdown', (e) => { e.preventDefault(); hud.counter.classList.add('resetting'); tmr = setTimeout(() => { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} location.replace(location.pathname + location.search.replace(/[?&]fresh\b/, '')); }, 3000); });
  const stop = () => { clearTimeout(tmr); hud.counter.classList.remove('resetting'); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => hud.counter.addEventListener(n, stop));
}

// ---------------------------------------------------------------- physics coupling
const _pc = new Map(), _push = new THREE.Vector3();
function physicsStep(dt) {
  const k = phys.plan(dt);
  if (!k) return;
  const sdt = k / 60;
  for (const th of things) {
    let c = null;
    if (th.state === 'hanging' || th.state === 'falling') {
      c = _pc.get(th) || new THREE.Vector3(); _pc.set(th, c);
      if (th.state === 'hanging') c.set(winch.bob.x, winch.bob.y - th.height * 0.55, winch.bob.z);
      else c.set(th.group.position.x, th.group.position.y + th.height * 0.5, th.group.position.z);
    }
    phys.drive(th, c, sdt);
  }
  phys.step(k, game.time, (x, z) => !!winch.toy && Math.hypot(winch.bob.x - x, winch.bob.z - z) < 7);
  // whatever is on the winch gets shoved back by what it hits: a light toy bounces off, a heavy one barely notices
  if (winch.toy && winch.toy.state === 'hanging') {
    const d = phys.pushedBy(winch.toy, _push);
    if (d && d.lengthSq() > 1e-5) { winch.bob.add(d); winch.vel.addScaledVector(d, 0.7 / sdt); if (winch.vel.length() > 25) winch.vel.setLength(25); }
  }
}

function rescue(t) {
  if (!t.isToy) return;
  t.rescued = true; game.rescued++; game.delivered = true; t.happy = 5;
  const slot = hud.slots[toys.indexOf(t)]; slot.classList.add('saved');
  later(0.25, () => { audio.sfx.chime(); audio.sfx[t.name](); });
  later(0.65, () => { if (t.state === 'placed') { t.state = 'hop'; t.hopT = 0; t.hopFrom.copy(t.group.position); } });
  life.burst(t.group.position.x, 1.5, t.group.position.z, 45);
  if (game.round === 1 && toys.slice(0, ROUND1).every((x) => x.rescued)) { game.round = 2; later(2.2, startRound2); }
  if (game.rescued === toys.length) game.celebrate = 1.6;
  save();
}
function startRound2(quiet) {
  hud.counter.classList.add('r2');
  toys.slice(ROUND1).forEach((x, k) => {
    if (x.rescued || x.state !== 'hidden') return;
    x.state = 'stranded'; x.appear = quiet ? 1 : -k * 0.35; x.group.visible = true;
    if (x.idle) x.idle(game.time);
    if (!quiet) later(0.35 * k + 0.2, () => { life.burst(x.group.position.x, x.rest + 1.5, x.group.position.z, 24, 0.8); audio.sfx.pop(); });
  });
  if (!quiet) audio.sfx.chime();
}
function deliverBasket() {
  if (game.picnic || basket.held.length < APPLES) { audio.sfx.chime(); return; }
  game.picnic = true; basket.happy = 0;
  toys.forEach((x) => (x.happy = 6));
  for (let k = 0; k < 5; k++) later(0.3 + k * 0.28, () => audio.sfx.chomp());
  life.burst(L.home.x, 2, L.home.z, 50, 1.1);
  later(0.4, () => audio.sfx.fanfare());
  save();
}

// ---------------------------------------------------------------- simulation
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), dHat = new THREE.Vector3();

function flightStep(h, inp) {
  const p = heli.pos, v = heli.vel, B = L.bounds;
  let dvx = 0, dvz = 0;
  if (heli.flying) {
    if (winch.hold) { dvx = clamp((winch.hold.x - p.x) * 3.0, -7, 7); dvz = clamp((winch.hold.z - p.z) * 3.0, -7, 7); }
    else { dvx = inp.x * FLY.maxSpeed; dvz = inp.y * FLY.maxSpeed; }
  }
  // soft yard edges: ease to a stop, never a bump
  if (p.x > B.x1) dvx = Math.min(dvx, 0) - (p.x - B.x1) * 3; if (p.x < B.x0) dvx = Math.max(dvx, 0) + (B.x0 - p.x) * 3;
  if (p.z > B.z1) dvz = Math.min(dvz, 0) - (p.z - B.z1) * 3; if (p.z < B.z0) dvz = Math.max(dvz, 0) + (B.z0 - p.z) * 3;
  for (const o of PUSHERS) {
    const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz);
    if (d < o.r + 1.5) {
      const nx = ox / d, nz = oz / d, vn = dvx * nx + dvz * nz, k = 1 - smoothstep(o.r, o.r + 1.5, d);
      if (vn < 0) { dvx -= vn * nx * k; dvz -= vn * nz * k; }
      if (d < o.r) { dvx += nx * (o.r - d) * 5; dvz += nz * (o.r - d) * 5; }
    }
  }
  let ax = (dvx - v.x) * FLY.gain / FLY.accel, az = (dvz - v.z) * FLY.gain / FLY.accel;
  const al = Math.hypot(ax, az); if (al > 1) { ax /= al; az /= al; }
  const T = heli.tilt, TV = heli.tiltVel, W = FLY.leanW;
  TV.x += ((ax - T.x) * W * W - 2 * FLY.leanZ * W * TV.x) * h; TV.y += ((az - T.y) * W * W - 2 * FLY.leanZ * W * TV.y) * h;
  T.x += TV.x * h; T.y += TV.y * h;
  v.x += (T.x * FLY.accel + heli.react.x) * h; v.z += (T.y * FLY.accel + heli.react.y) * h;
  const dr = Math.exp(-FLY.drag * h); v.x *= dr; v.z *= dr;
  p.x += v.x * h; p.z += v.z * h;
  // altitude: floats over obstacles, dips under a heavy load then recovers
  const hangT = winch.toy ? winch.toy.carry.len + winch.toy.height : 0.7;
  if (game.time - winch.liftAt > 0.9) heli.hang += (hangT - heli.hang) * Math.min(1, h * 2.2);
  const hang = heli.hang;
  const TR = playground.tramp, matTop = L.tramp.matY + H.skidY * 0.92 - TR.dip;
  let target = heli.flying ? cruiseAlt(p.x, p.z, hang) : L.pad.y + H.skidY * 0.92;
  if (heli.flying && TR.heliPull) target = matTop - 0.3;
  heli.comp += (heli.loadF - heli.comp) * Math.min(1, h / 0.75);
  const K = heli.flying && game.time < takeoffUntil ? 3.2 : 10;
  heli.yVel += ((target - p.y) * K - 5.6 * heli.yVel - (heli.loadF - heli.comp)) * h;
  p.y += heli.yVel * h;
  if (TR.heliPull && p.y < matTop + 0.05 && heli.yVel < 0) {
    heli.yVel = 15; TR.kick(5); TR.cool = game.time + 0.55; TR.heliPull = false;
    audio.sfx.boing(1); heli.squashV = -9; game.heliBounces++;
  }
}
let takeoffUntil = 0;

function cableStep(h) {
  const w = winch, toy = w.toy;
  // lean of the body moves the attach point a little
  const lean = heli.tilt.length() * FLY.maxLean;
  v1.set(heli.tilt.y, 0, -heli.tilt.x); if (v1.lengthSq() > 1e-8) v1.normalize(); else v1.set(1, 0, 0);
  q1.setFromAxisAngle(v1, lean);
  anchor.copy(H.hookLocal).multiplyScalar(0.92).applyQuaternion(q1).add(heli.pos);
  heli.loadF = 0; heli.react.set(0, 0);
  if (w.state === 'grab') return;
  const c = toy ? toy.carry : { damp: 2.5, mass: 0, spring: 0, g: G };
  const dampK = c.damp * (w.state === 'lower' ? 3.5 : 1);
  v2.copy(w.bob);
  w.vel.y -= c.g * h;
  w.vel.multiplyScalar(Math.exp(-dampK * h));
  w.bob.addScaledVector(w.vel, h);
  dHat.copy(w.bob).sub(anchor);
  let len = dHat.length(); if (len < 1e-5) { dHat.set(0, -1, 0); len = 1e-5; } else dHat.multiplyScalar(1 / len);
  let tension = 0;
  if (c.spring > 0) { // stretchy: the duck bobs
    if (len > w.len) {
      tension = c.spring * (len - w.len);
      const vr = w.vel.dot(dHat);
      w.vel.addScaledVector(dHat, -(tension + vr * 3.2) * h);
    }
    if (len > w.len + 0.7) { w.bob.copy(anchor).addScaledVector(dHat, w.len + 0.7); const vr = w.vel.dot(dHat); if (vr > 0) w.vel.addScaledVector(dHat, -vr); }
  } else if (len > w.len) {
    w.bob.copy(anchor).addScaledVector(dHat, w.len);
    w.vel.copy(w.bob).sub(v2).multiplyScalar(1 / h);
    const vr = w.vel.dot(dHat), vt2 = Math.max(0, w.vel.lengthSq() - vr * vr);
    tension = c.g * Math.max(0, -dHat.y) + vt2 / Math.max(0.5, w.len);
  }
  if (!toy) {
    // the empty hook rests on whatever is below it, including the top of a toy that isn't lined up
    w.bumped = false;
    const fl = hookFloor(w.bob.x, w.bob.z);
    if (w.bob.y < fl) { w.bob.y = fl; if (w.vel.y < 0) w.vel.y = 0; w.vel.x *= 0.9; w.vel.z *= 0.9; }
    for (const t of things) {
      if (t.state === 'hanging' || t.state === 'falling' || t.state === 'hop') continue;
      toyTop(t, tmpTop);
      if (hdist(w.bob, tmpTop) < 0.75 && w.bob.y < tmpTop.y && w.bob.y > tmpTop.y - t.height) {
        w.bob.y = tmpTop.y; if (w.vel.y < 0) { if (w.vel.y < -0.6) w.bumped = true; w.vel.y = 0; }
      }
    }
  }
  // still standing where it was found until the cable takes the weight
  if (toy && game.time - w.liftAt < 1.2 && w.bob.y < w.floor) { w.bob.y = w.floor; w.vel.y = Math.max(0, w.vel.y); tension = 0; }
  // resting on the ground while being lowered
  if (toy && w.state === 'lower') {
    const floor = w.rest + toy.height;
    if (w.bob.y < floor) { w.bob.y = floor; w.vel.set(0, 0, 0); tension = 0; w.landed = true; }
  }
  w.tension = tension;
  if (toy) {
    heli.loadF = c.mass * tension * Math.max(0, -dHat.y);
    heli.react.set(dHat.x, dHat.z).multiplyScalar(c.mass * tension);
  }
}

function update(dt) {
  game.time += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= game.time) timers.splice(i, 1)[0].fn();
  const t = game.time, inp = readInput(), mag = Math.hypot(inp.x, inp.y);
  if (!heli.flying && mag > 0.15) { heli.flying = true; }
  if (heli.flying && takeoffUntil === 0) { takeoffUntil = t + 1.6; hud.hintMove.classList.add('gone'); }
  heli.rotor = damp(heli.rotor, heli.flying ? 1 : 0.12, 2.2, dt);

  updateWinch(dt);
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  { const TR = playground.tramp; TR.heliPull = heli.flying && !winch.toy && winch.state === 'idle' && !winch.held && playground.heliOver(heli.pos) && Math.hypot(heli.vel.x, heli.vel.z) < 3.5 && t > TR.cool; }
  for (let i = 0; i < n; i++) { flightStep(h, inp); cableStep(h); }
  if (phys) physicsStep(dt);

  // --- helicopter pose
  if (mag > 0.2 && heli.flying && !winch.hold) heli.yaw = dampAngle(heli.yaw, Math.atan2(inp.x, inp.y), FLY.yawRate, dt);
  const lean = heli.tilt.length();
  v1.set(heli.tilt.y, 0, -heli.tilt.x); if (lean > 1e-4) v1.normalize(); else v1.set(1, 0, 0);
  q1.setFromAxisAngle(v1, lean * FLY.maxLean); q2.setFromAxisAngle(UP, heli.yaw);
  H.body.quaternion.copy(q1).multiply(q2);
  heli.squashV += (-heli.squash * 120 - heli.squashV * 9) * dt; heli.squash += heli.squashV * dt;
  H.body.scale.set(0.92 * (1 - heli.squash * 0.4), 0.92 * (1 + heli.squash), 0.92 * (1 - heli.squash * 0.4));
  const bob = heli.flying ? Math.sin(t * 1.9) * 0.07 * heli.rotor : 0;
  H.root.position.set(heli.pos.x + (heli.flying ? Math.sin(t * 1.3) * 0.03 : 0), heli.pos.y + bob, heli.pos.z);
  H.rotor.rotation.y += heli.rotor * 34 * dt; H.tailRotor.rotation.x += heli.rotor * 50 * dt;
  H.disc.material.opacity = heli.rotor * 0.2; H.discTip.material.opacity = heli.rotor * 0.3;
  H.beacon.material.emissiveIntensity = Math.sin(t * 6) > 0.6 ? 3 : 0.2;

  // --- contact shadows
  const overDeck = Math.abs(heli.pos.x - L.tower.x) < 2.7 && Math.abs(heli.pos.z - L.tower.z) < 2.7;
  const gy = overDeck ? L.tower.platY + 0.03 : hdist(heli.pos, L.pad) < L.pad.r ? L.pad.y + 0.03 : inPond(heli.pos.x, heli.pos.z) ? 0.1 : 0.04;
  const alt = heli.pos.y - gy;
  heliShadow.position.set(heli.pos.x, gy, heli.pos.z);
  heliShadow.scale.setScalar(0.75 + alt * 0.05); heliShadow.material.opacity = clamp(0.5 - alt * 0.022, 0.16, 0.5);

  // --- cable + hook
  const cl = anchor.distanceTo(winch.bob);
  cable.position.copy(anchor).lerp(winch.bob, 0.5);
  cable.scale.set(1, Math.max(0.01, cl), 1);
  cable.quaternion.setFromUnitVectors(UP, v1.copy(anchor).sub(winch.bob).normalize());
  hook.position.copy(winch.bob); hook.quaternion.copy(cable.quaternion);
  hookShadow.visible = !winch.toy && winch.len > 1;
  if (hookShadow.visible) {
    let sy = hookFloor(winch.bob.x, winch.bob.z) - 0.1;
    for (const toy of things) { if (toy.state === 'hanging') continue; toyTop(toy, tmpTop); if (hdist(winch.bob, tmpTop) < 0.75 && tmpTop.y < winch.bob.y + 0.1) sy = Math.max(sy, tmpTop.y + 0.02); }
    hookShadow.position.set(winch.bob.x, sy, winch.bob.z);
  }

  playground.update(dt, t, things, bunny, winch.toy, heli.pos);
  const thirstyCount = garden.thirsty().length;
  // --- toys and the bucket
  things.forEach((toy, i) => {
    const g = toy.group;
    if (toy.state === 'hidden') { g.visible = false; markers[i].g.visible = false; return; }
    g.visible = true;
    toy.sqV += (-toy.sq * 160 - toy.sqV * 11) * dt; toy.sq += toy.sqV * dt;
    toy.wiggle = Math.max(0, toy.wiggle - dt * 1.9);
    toy.happy = Math.max(0, toy.happy - dt);
    let mood = toy.rescued ? 'happy' : 'help', at = t;
    if (toy.state === 'hanging') {
      mood = 'hang';
      v1.copy(anchor).sub(winch.bob).normalize().lerp(UP, 0.3).normalize();
      toy.yaw += (winch.vel.x * 0.05 + Math.sin(t * 0.9) * 0.25) * dt;
      q1.setFromUnitVectors(UP, v1); q2.setFromAxisAngle(UP, toy.yaw);
      g.quaternion.copy(q1).multiply(q2);
      g.position.copy(winch.bob).addScaledVector(v1, -toy.height);
      if (winch.state === 'lower' && g.position.y < winch.rest) g.position.y = winch.rest;
    } else if (toy.state === 'falling') {
      const f = toy.fall; f.t += dt;
      const u = Math.min(1, f.t / Math.max(0.05, f.dur));
      g.position.x = lerp(f.from.x, f.to.x, u); g.position.z = lerp(f.from.z, f.to.z, u);
      g.position.y = Math.max(f.to.y, f.from.y + f.vy * f.t - 0.5 * f.g * f.t * f.t);
      g.rotation.set(Math.sin(f.t * 7) * 0.5, toy.yaw, f.t * f.spin);
      mood = 'hang';
      if (u >= 1) { g.position.copy(f.to); landToy(toy, Math.abs(f.vy - f.g * f.t)); }
    } else if (toy.state === 'hopping') {
      // posed by the playground while she hops home
    } else if (toy.state === 'stranded' && toy.idle) {
      toy.idle(t, dt);
      g.rotation.z += Math.sin(t * 38) * 0.2 * toy.wiggle;
    } else if (toy.state === 'hop') {
      toy.hopT += dt; const u = Math.min(1, toy.hopT / 1.1);
      g.position.lerpVectors(toy.hopFrom, toy.home, u * u * (3 - 2 * u));
      g.position.y += Math.abs(Math.sin(u * Math.PI * 2)) * 1.7 * (1 - u * 0.35);
      g.rotation.set(0, u * Math.PI * 2, 0);
      if (u >= 1) { toy.state = 'home'; toy.rest = toy.home.y; toy.sqV = 6; toy.floaty = false; g.rotation.set(0, 0, 0); life.burst(toy.home.x, 1, toy.home.z, 16, 0.6); }
    } else {
      const fl = toy.floaty ? Math.sin(t * 2 + i) * 0.05 - 0.1 : 0;
      g.position.y = toy.rest + fl;
      g.rotation.set(toy.floaty ? Math.sin(t * 1.7) * 0.05 : 0, toy.yaw, Math.sin(t * 38) * 0.2 * toy.wiggle + (toy.floaty ? Math.cos(t * 1.3) * 0.05 : 0));
      if (toy.rescued && toy.happy <= 0 && hdist(heli.pos, g.position) > 9) at = t * 0.3; // calm when you're far away
      if (toy.rescued && toy.happy > 0) g.position.y += Math.abs(Math.sin(t * 7 + i)) * 0.35;
    }
    if (toy.appear < 1) toy.appear = Math.min(1, toy.appear + dt * 1.6);
    const ap = toy.appear <= 0 ? 0.001 : 1 + 2.7 * (toy.appear - 1) ** 3 + 1.7 * (toy.appear - 1) ** 2; // pop in with an overshoot
    g.scale.set((1 + toy.sq * 0.25) * ap, (1 - toy.sq * 0.3) * ap, (1 + toy.sq * 0.25) * ap);
    toy.anim(at + i, mood);
    // rescue marker
    const loose = toy.state !== 'hanging' && toy.state !== 'falling' && !winch.toy;
    const m = markers[i], show = toy.isBunny ? false : toy.isBucket ? loose && thirstyCount > 0 : toy.isBasket ? loose && !game.picnic : !game.free && !toy.rescued && loose && toy.appear >= 1;
    m.g.visible = show;
    if (show) {
      m.g.position.set(g.position.x, toy.rest + 0.06, g.position.z);
      // get out of the way while the hook is coming down to this toy
      m.arrow.visible = !(winch.held && !winch.toy && hdist(heli.pos, g.position) < PICK_R + 1);
      m.arrow.position.y = toy.height + 0.9 + Math.abs(Math.sin(t * 3.2 + i)) * 0.7;
      m.arrow.rotation.y = t * 1.5;
      const s = 2.0 + Math.sin(t * 3.2 + i) * 0.25; m.ring.scale.set(s, s, 1);
      toyTop(toy, tmpTop);
      m.ring.material.color.set(hdist(winch.bob, tmpTop) < CATCH_R && winch.len > 1 ? 0x35d07f : markerColor(toy));
    }
  });
  toyShadow.visible = !!winch.toy;
  if (winch.toy) {
    const p = winch.toy.group.position;
    const ty = restHeight(p.x, p.z);
    toyShadow.position.set(p.x, (ty ?? (overDeck ? L.tower.platY : 0)) + 0.05, p.z);
  }
  updateBucket(dt, t, thirstyCount);
  updateApples(dt, t);
  updateAcorns(dt, t);
  updateFinale(dt, t);
  updateTime(dt);
  const padOn = !game.free && !!winch.toy && winch.toy.isToy;
  padMarker.g.visible = padOn;
  if (padOn) { padMarker.arrow.position.y = 2.4 + Math.abs(Math.sin(t * 3.2)) * 0.8; padMarker.arrow.rotation.y = t * 1.5; const s = 3.5 + Math.sin(t * 3.2) * 0.3; padMarker.ring.scale.set(s, s, 1); }

  // --- celebration → free flight
  if (game.celebrate > 0) {
    game.celebrate -= dt;
    if (game.celebrate <= 0) {
      game.free = true; audio.sfx.fanfare(); hud.star.classList.add('on'); save();
      toys.forEach((x) => (x.happy = 8));
      for (let k = 0; k < 4; k++) later(k * 0.35, () => life.burst(L.home.x + (k - 1.5) * 2.5, 3 + k, L.home.z - 1, 40, 1.3));
    }
  }

  // --- world reactions to the rotor wash
  const wash = heli.rotor * smoothstep(15, 5.5, alt) * (heli.flying ? 1 : 0.35);
  uniforms.uTime.value = t; uniforms.uHeli.value.copy(heli.pos); uniforms.uWash.value = wash;
  uniforms.uPondWash.value = damp(uniforms.uPondWash.value, inPond(heli.pos.x, heli.pos.z, 3) ? wash : 0, 3, dt);
  world.update(dt, t, heli.pos, wash);
  life.update(dt, t, heli.pos, wash);
  garden.update(dt, t, heli.pos, wash);
  hammock.update(dt, t, heli.pos, wash);
  birds.update(dt, t, heli.pos, heli.flying);

  // --- camera: glides after the helicopter, never turns
  const busy = (winch.held && !winch.toy) || winch.state === 'grab' || winch.state === 'lower' || winch.state === 'release';
  cam.zoom = damp(cam.zoom, !heli.flying ? 0.8 : busy ? 0.84 : 1, 2.2, dt);
  cam.x = damp(cam.x, heli.pos.x + heli.vel.x * 0.32, 3.6, dt); cam.z = damp(cam.z, heli.pos.z + heli.vel.z * 0.32, 3.6, dt);
  cam.y = damp(cam.y, heli.pos.y - (winch.toy ? 0.9 : 0), 1.7, dt);
  camera.position.set(cam.x, cam.y, cam.z).addScaledVector(CAM_OFF, cam.zoom * cam.fit);

  updateHud(t);
  audio.update(dt, heli.rotor, Math.min(1, heli.vel.length() / FLY.maxSpeed), winch.moving);
}
const cam = { x: heli.pos.x, y: heli.pos.y, z: heli.pos.z, zoom: 0.8, fit: 1 };

function updateHud(t) {
  const canGrab = !winch.toy && !winch.held && winch.state === 'idle' && heli.flying && !!nearestToy();
  const letGoNow = !!winch.toy && winch.state === 'idle' && (game.free || hdist(winch.toy.group.position, dropZone(winch.toy)) < dropZone(winch.toy).r);
  hud.btn.classList.toggle('ready', canGrab);
  hud.btn.classList.toggle('letgo', letGoNow);
  hud.btn.classList.toggle('down', winch.held);
  hud.btn.classList.toggle('busy', winch.state === 'lower' || winch.state === 'release');
  hud.btn.classList.toggle('carry', !!winch.toy);
  hud.hintTap.classList.toggle('on', canGrab && !game.usedWinch);
  // edge pointer toward the next thing to do
  let target = null, kind = '';
  const nearestOf = (list, pos) => { let best = null, bd = 1e9; for (const q of list) { const d = hdist(heli.pos, pos(q)); if (d < bd) { bd = d; best = q; } } return best; };
  if (heli.flying) {
    const W = winch.toy;
    if (W && W.isBucket) {
      kind = 'water';
      if (bucket.water < 0.3) { const w = nearestOf(waterSpots, (q) => q); target = v2.set(w.x, 1.5, w.z); }
      else { const pl = nearestOf(garden.thirsty(), (q) => q); if (pl) target = v2.set(pl.x, pl.y + 1.5, pl.z); }
    } else if (W && W.isBasket) {
      kind = 'apple';
      if (basket.held.length >= APPLES) { kind = 'pad'; target = v2.set(L.home.x, 1.5, L.home.z); }
      else { const a = nearestOf(orchard.apples.filter((q) => q.state === 'ground'), (q) => q.pos); target = a ? v2.copy(a.pos).setY(1.5) : v2.set(L.apple.x, 8, L.apple.z + 2); }
    } else if (W) { if (!game.free) { kind = 'pad'; target = v2.set(L.pad.x, 1.5, L.pad.z); } }
    else {
      const toy = game.free ? null : nearestOf(toys.filter((q) => !q.rescued && q.state !== 'hop' && q.state !== 'hidden' && q.appear >= 1), (q) => q.group.position);
      if (toy) target = v2.copy(toy.group.position).setY(toy.group.position.y + 1.5);
      else if (garden.thirsty().length && game.gardenDone === 0 && bucket.state !== 'falling') { kind = 'water'; target = v2.copy(bucket.group.position).setY(1.5); }
      else if (!game.picnic && basket.state !== 'falling') { kind = 'apple'; target = v2.copy(basket.group.position).setY(1.5); }
      else if (game.finale === 'dusk') { kind = 'pad'; target = v2.set(L.pad.x, 1.5, L.pad.z); }
    }
  }
  let show = false;
  if (target) {
    v1.copy(target).project(camera);
    const behind = v1.z > 1;
    if (behind || Math.abs(v1.x) > 0.9 || Math.abs(v1.y) > 0.86) {
      // direction from the helicopter on screen
      const hp = heli.pos.clone().project(camera);
      let dx = v1.x - hp.x, dy = v1.y - hp.y; if (behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy * innerHeight, dx * innerWidth);
      const mx = innerWidth / 2 - 54, my = innerHeight / 2 - 54;
      const k = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
      const ex = innerWidth / 2 + Math.cos(a) * k, ey = innerHeight / 2 - Math.sin(a) * k;
      hud.edge.style.transform = `translate(${ex}px,${ey}px) rotate(${-a}rad) scale(${1 + Math.sin(t * 6) * 0.08})`;
      hud.edge.classList.toggle('pad', kind === 'pad'); hud.edge.classList.toggle('water', kind === 'water'); hud.edge.classList.toggle('apple', kind === 'apple');
      show = true;
    }
  }
  hud.edge.classList.toggle('on', show);
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  cam.fit = camera.aspect < 1.25 ? 1.25 + (1.25 - camera.aspect) * 0.9 : 1; // pull back in portrait
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
camera.quaternion.copy(camQuat);

let last = 0, slow = 0, fast = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
  update(Math.min(raw, 1 / 20));
  renderer.render(scene, camera);
  // keep it smooth on modest phones: drop render resolution before dropping frames
  if (!params.has('dpr') && game.time > 3) {
    if (raw > 1 / 40) slow += raw; else slow = Math.max(0, slow - raw * 0.5);
    if (slow > 1.5 && dprIndex < dprSteps.length - 1) { dprIndex++; renderer.setPixelRatio(dprSteps[dprIndex]); resize(); slow = 0; }
  }
}
function boot() {
  load();
  hud.tod.dataset.t = TOD_NAMES[Math.round(game.todTarget)];
  applyTime();
  update(1 / 60); renderer.render(scene, camera);
  document.body.classList.add('ready');
  if (!MANUAL) requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
  window.__game = testHooks;
}
physReady.then(boot);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// Hooks for the automated playtest (tools/playtest.mjs) – not used by the game itself.
const testHooks = {
  heli, winch, toys, game, L, bucket, garden, basket, acorns, bunny, playground, get phys() { return phys; },
  advance(dt, steps = 1, draw = true) { for (let i = 0; i < steps; i++) update(dt); if (draw) renderer.render(scene, camera); },
  draw() { renderer.render(scene, camera); },
  script(x, y) { scripted = x === null ? null : { x, y }; },
  setTime(i) { setTimeTarget(i, true); game.tod = i; applyTime(); },
  dusk() { game.finale = 'dusk'; game.todTarget = 2; game.tod = 1.999; },
  time(i) { setTimeTarget(i, true); game.tod = i - (i ? 0.001 : -0.001); },
  round2() { if (game.round < 2) { game.round = 2; startRound2(false); } },
  debugLife: () => ({ flies: life.debugFlies(), heads: life.debugHeads(), birds: birds.debug() }),
  press: pressWinch,
  hold(on) { if (on) pressWinch(); else winch.held = false; },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr: renderer.getPixelRatio() }),
  state: () => ({ t: game.time, pos: heli.pos.toArray(), vel: heli.vel.toArray(), tilt: heli.tilt.toArray(), winch: winch.state, len: winch.len, carrying: winch.toy ? winch.toy.name : null, held: winch.held, rescued: game.rescued, free: game.free,
    bucket: { state: bucket.state, water: bucket.water, pos: bucket.group.position.toArray(), loop: toyTop(bucket, new THREE.Vector3()).toArray() },
    basket: { state: basket.state, held: basket.held.length, pos: basket.group.position.toArray(), loop: toyTop(basket, new THREE.Vector3()).toArray() },
    apples: orchard.apples.map((a) => ({ state: a.state, pos: a.pos.toArray() })), acorns: acorns.map((a) => ({ got: a.got, pos: a.home.toArray() })),
    paint: game.paint, round: game.round, picnic: game.picnic, physics: phys ? phys.report() : null, saw: { theta: playground.saw.theta, A: playground.saw.seats.A?.name || null, B: playground.saw.seats.B?.name || null, last: playground.saw.lastLaunch || null }, trampBounces: playground.tramp.bounces, heliBounces: game.heliBounces, alt: heli.pos.y,
    bunnyState: { state: bunny.state, pos: bunny.group.position.toArray(), seat: bunny.seat || null },
    finale: game.finale, dusk: clamp(game.tod - 1, 0, 1), tod: game.tod, butterflies: life.butterflies(), birds: birds.count(), flying: heli.flying, gardenDone: game.gardenDone, plants: garden.plants.map((p) => ({ x: p.x, z: p.z, bloomed: p.target === 1, progress: p.progress })),
    bob: winch.bob.toArray(), toys: toys.map((t) => ({ name: t.name, state: t.state, rescued: t.rescued, pos: t.group.position.toArray(), loop: toyTop(t, new THREE.Vector3()).toArray() })) }),
};
