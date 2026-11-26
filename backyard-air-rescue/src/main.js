import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, smoothstep, blobShadow } from './util.js';
import { L, PUSHERS, buildWorld, cruiseAlt, restHeight, inPond } from './world.js';
import { makeHeli, makeTeddy, makeDuck, makeRobot, makeHook, makeMarker } from './models.js';
import { buildLife } from './life.js';
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
const audio = makeAudio();

// ---------------------------------------------------------------- helicopter
const H = makeHeli();
scene.add(H.root);
const heli = {
  pos: new THREE.Vector3(L.pad.x, L.pad.y + H.skidY * 0.92, L.pad.z),
  vel: new THREE.Vector3(), tilt: new THREE.Vector2(), tiltVel: new THREE.Vector2(),
  yaw: 0.85, yVel: 0, hang: 0.7, flying: false, rotor: 0.12, comp: 0, loadF: 0, react: new THREE.Vector2(),
};
const heliShadow = blobShadow(1.5, 0.38); scene.add(heliShadow);
const toyShadow = blobShadow(0.95, 0.4); scene.add(toyShadow); toyShadow.visible = false;
const hookShadow = blobShadow(0.32, 0.55); scene.add(hookShadow);

// ---------------------------------------------------------------- toys
const toys = [makeTeddy(), makeDuck(), makeRobot()].map((t, i) => {
  scene.add(t.group);
  return Object.assign(t, { state: 'stranded', rescued: false, yaw: 0, sq: 0, sqV: 0, wiggle: 0, hopT: 0, hopFrom: new THREE.Vector3(), happy: 0, rest: 0, floaty: false,
    home: new THREE.Vector3(L.home.x - 1.6 + i * 1.6, 0.11, L.home.z + (i === 1 ? 0.5 : 0)) });
});
const [teddy, duck, robot] = toys;
toys.forEach((t) => (t.isToy = true));
// the bucket rides the winch like a toy, but its job is watering
const bucket = Object.assign(makeBucket(), { state: 'stranded', rescued: false, yaw: 0.4, sq: 0, sqV: 0, wiggle: 0, hopT: 0, hopFrom: new THREE.Vector3(), happy: 0, rest: 0, floaty: false, home: new THREE.Vector3() });
bucket.group.position.set(L.bucket.x, 0, L.bucket.z); scene.add(bucket.group);
const things = [...toys, bucket];
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
const markers = things.map((t) => makeMarker(t.isBucket ? BLUE : 0xffa81f));
const padMarker = makeMarker(0x35d07f);
const waterSpots = [{ x: L.pond.x, y: 0.1, z: L.pond.z, s: 4 }, { x: L.pool.x, y: L.pool.y + 0.05, z: L.pool.z, s: 2.6 }];
const waterMarkers = waterSpots.map(() => makeMarker(BLUE));
const plantMarkers = garden.plants.map(() => makeMarker(BLUE));
[...markers, padMarker, ...waterMarkers, ...plantMarkers].forEach((m) => scene.add(m.g));
waterMarkers.forEach((m, i) => m.g.position.set(waterSpots[i].x, waterSpots[i].y, waterSpots[i].z));
plantMarkers.forEach((m, i) => { const p = garden.plants[i]; m.g.position.set(p.x, p.y + 0.05, p.z); m.arrow.scale.setScalar(0.75); });
padMarker.g.position.set(L.pad.x, L.pad.y + 0.03, L.pad.z);

const timers = [];
const later = (sec, fn) => timers.push({ at: game.time + sec, fn });
const game = { time: 0, rescued: 0, free: false, celebrate: -1, usedWinch: false, delivered: false, gardenDone: 0, pourTick: 0 };

// ---------------------------------------------------------------- HUD
const hud = { joy: $('joy'), knob: $('knob'), btn: $('winch'), slots: [...document.querySelectorAll('.slot')], edge: $('edge'), hintMove: $('hintMove'), hintTap: $('hintTap'), star: $('star'), pips: [...document.querySelectorAll('#garden .pip')], gstar: $('gstar'), water: $('water'), wd: [...document.querySelectorAll('#water i')] };
function makeThumbs() {
  // Render each toy once into its counter slot so the HUD matches the 3D toys exactly.
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(160, 160); r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 2.2));
  const d = new THREE.DirectionalLight(0xfff0d0, 2.5); d.position.set(2, 4, 5); s.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  [makeTeddy, makeDuck, makeRobot].forEach((mk, i) => {
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
  if (e.target.closest('#winch')) return;
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
const pickable = (t) => (t.state === 'stranded' || t.state === 'placed' || (t.state === 'home' && game.free)) && (game.free || !t.rescued);
function nearestToy() {
  let best = null, bd = PICK_R;
  for (const t of things) { if (!pickable(t)) continue; const d = hdist(heli.pos, t.group.position); if (d < bd) { bd = d; best = t; } }
  return best;
}
function hookFloor(x, z) {
  if (Math.abs(x - L.tower.x) < 2.7 && Math.abs(z - L.tower.z) < 2.7) return L.tower.platY + 0.15;
  if (Math.abs(x - L.shed.x) < L.shed.w / 2 + 0.9 && Math.abs(z - L.shed.z) < L.shed.d / 2 + 0.8) return L.shed.h + 1.5;
  if (Math.hypot(x - L.pad.x, z - L.pad.z) < L.pad.r) return L.pad.y + 0.15;
  return 0.15;
}
function toyTop(t, out) { return out.copy(t.group.position).setY(t.group.position.y + t.height); }
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
  const [sx, sz] = landingSpot(p.x + v.x * 0.4, p.z + v.z * 0.4);
  const rest = restHeight(sx, sz), g = 20, vy = Math.min(v.y, 2), hgt = Math.max(0, p.y - rest);
  t.fall = { from: p.clone(), to: new THREE.Vector3(sx, rest, sz), vy, g, t: 0, dur: (vy + Math.sqrt(vy * vy + 2 * g * hgt)) / g, spin: (Math.random() < 0.5 ? -1 : 1) * 5 };
  t.state = 'falling'; t.rest = rest;
  winch.toy = null; winch.state = 'idle'; winch.vel.set(0, 0, 0);
  if (t.isBucket && t.water > 0.05) { garden.splash(p.x, p.y + 1, p.z, 18, 1.2); t.water = 0; }
  audio.sfx.uhoh();
}

function landToy(t) {
  t.state = 'placed'; t.fall = null;
  t.floaty = t.rest < 0.05 && inPond(t.group.position.x, t.group.position.z);
  t.group.quaternion.identity(); t.yaw = 0; t.sqV = 10;
  audio.sfx.pomf(); if (t.floaty) audio.sfx.splash();
  if (!game.free && !t.rescued && hdist(t.group.position, L.pad) < L.pad.r) rescue(t);
}

function letGo() {
  const t = winch.toy, p = t.group.position;
  const overPad = hdist(p, L.pad) < PAD_DROP_R;
  if (!game.free && !t.rescued && !overPad) return dropToy(t);
  // over the pad (or anywhere during free flight): set it down gently
  const hx = overPad && !game.free ? L.pad.x + clamp(p.x - L.pad.x, -1.5, 1.5) : p.x, hz = overPad && !game.free ? L.pad.z + clamp(p.z - L.pad.z, -1.5, 1.5) : p.z;
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
        if (!game.free && !t.rescued && hdist(t.group.position, L.pad) < L.pad.r + 0.8) rescue(t);
      }
      break;
    }
    case 'release': if (w.timer > 0.45) { w.state = 'idle'; w.hold = null; } break;
  }
  w.moving = Math.sign(w.len - before);
}

function bloom(pl) {
  pl.target = 1; pl.progress = 0; pl.pop = 1;
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

function rescue(t) {
  if (!t.isToy) return;
  t.rescued = true; game.rescued++; game.delivered = true; t.happy = 5;
  const slot = hud.slots[toys.indexOf(t)]; slot.classList.add('saved');
  later(0.25, () => { audio.sfx.chime(); audio.sfx[t.name](); });
  later(0.65, () => { if (t.state === 'placed') { t.state = 'hop'; t.hopT = 0; t.hopFrom.copy(t.group.position); } });
  life.burst(t.group.position.x, 1.5, t.group.position.z, 45);
  if (game.rescued === toys.length) game.celebrate = 1.6;
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
  const target = heli.flying ? cruiseAlt(p.x, p.z, hang) : L.pad.y + H.skidY * 0.92;
  heli.comp += (heli.loadF - heli.comp) * Math.min(1, h / 0.75);
  const K = heli.flying && game.time < takeoffUntil ? 3.2 : 10;
  heli.yVel += ((target - p.y) * K - 5.6 * heli.yVel - (heli.loadF - heli.comp)) * h;
  p.y += heli.yVel * h;
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
  for (let i = 0; i < n; i++) { flightStep(h, inp); cableStep(h); }

  // --- helicopter pose
  if (mag > 0.2 && heli.flying && !winch.hold) heli.yaw = dampAngle(heli.yaw, Math.atan2(inp.x, inp.y), FLY.yawRate, dt);
  const lean = heli.tilt.length();
  v1.set(heli.tilt.y, 0, -heli.tilt.x); if (lean > 1e-4) v1.normalize(); else v1.set(1, 0, 0);
  q1.setFromAxisAngle(v1, lean * FLY.maxLean); q2.setFromAxisAngle(UP, heli.yaw);
  H.body.quaternion.copy(q1).multiply(q2);
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

  const thirstyCount = garden.thirsty().length;
  // --- toys and the bucket
  things.forEach((toy, i) => {
    const g = toy.group;
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
      if (u >= 1) { g.position.copy(f.to); landToy(toy); }
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
    g.scale.set(1 + toy.sq * 0.25, 1 - toy.sq * 0.3, 1 + toy.sq * 0.25);
    toy.anim(at + i, mood);
    // rescue marker
    const m = markers[i], show = toy.isBucket ? toy.state !== 'hanging' && toy.state !== 'falling' && !winch.toy && thirstyCount > 0 : !game.free && !toy.rescued && toy.state !== 'hanging' && !winch.toy;
    m.g.visible = show;
    if (show) {
      m.g.position.set(g.position.x, toy.rest + 0.06, g.position.z);
      // get out of the way while the hook is coming down to this toy
      m.arrow.visible = !(winch.held && !winch.toy && hdist(heli.pos, g.position) < PICK_R + 1);
      m.arrow.position.y = toy.height + 0.9 + Math.abs(Math.sin(t * 3.2 + i)) * 0.7;
      m.arrow.rotation.y = t * 1.5;
      const s = 2.0 + Math.sin(t * 3.2 + i) * 0.25; m.ring.scale.set(s, s, 1);
      toyTop(toy, tmpTop);
      m.ring.material.color.set(hdist(winch.bob, tmpTop) < CATCH_R && winch.len > 1 ? 0x35d07f : toy.isBucket ? BLUE : 0xffa81f);
    }
  });
  toyShadow.visible = !!winch.toy;
  if (winch.toy) {
    const p = winch.toy.group.position;
    const ty = restHeight(p.x, p.z);
    toyShadow.position.set(p.x, (ty ?? (overDeck ? L.tower.platY : 0)) + 0.05, p.z);
  }
  updateBucket(dt, t, thirstyCount);
  const padOn = !game.free && !!winch.toy && winch.toy.isToy;
  padMarker.g.visible = padOn;
  if (padOn) { padMarker.arrow.position.y = 2.4 + Math.abs(Math.sin(t * 3.2)) * 0.8; padMarker.arrow.rotation.y = t * 1.5; const s = 3.5 + Math.sin(t * 3.2) * 0.3; padMarker.ring.scale.set(s, s, 1); }

  // --- celebration → free flight
  if (game.celebrate > 0) {
    game.celebrate -= dt;
    if (game.celebrate <= 0) {
      game.free = true; audio.sfx.fanfare(); hud.star.classList.add('on');
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
  const letGoNow = !!winch.toy && winch.state === 'idle' && (game.free || hdist(winch.toy.group.position, L.pad) < PAD_DROP_R);
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
    if (winch.toy && winch.toy.isBucket) {
      kind = 'water';
      if (bucket.water < 0.3) { const w = nearestOf(waterSpots, (q) => q); target = v2.set(w.x, 1.5, w.z); }
      else { const pl = nearestOf(garden.thirsty(), (q) => q); if (pl) target = v2.set(pl.x, pl.y + 1.5, pl.z); }
    } else if (winch.toy) { if (!game.free) { kind = 'pad'; target = v2.set(L.pad.x, 1.5, L.pad.z); } }
    else {
      const toy = game.free ? null : nearestOf(toys.filter((q) => !q.rescued && q.state !== 'hop'), (q) => q.group.position);
      if (toy) target = v2.copy(toy.group.position).setY(toy.group.position.y + 1.5);
      else if (garden.thirsty().length && bucket.state !== 'falling') { kind = 'water'; target = v2.copy(bucket.group.position).setY(1.5); }
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
      hud.edge.classList.toggle('pad', kind === 'pad'); hud.edge.classList.toggle('water', kind === 'water');
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
  update(1 / 60); renderer.render(scene, camera);
  document.body.classList.add('ready');
  if (!MANUAL) requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
}
boot();
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// Hooks for the automated playtest (tools/playtest.mjs) – not used by the game itself.
window.__game = {
  heli, winch, toys, game, L, bucket, garden,
  advance(dt, steps = 1, draw = true) { for (let i = 0; i < steps; i++) update(dt); if (draw) renderer.render(scene, camera); },
  draw() { renderer.render(scene, camera); },
  script(x, y) { scripted = x === null ? null : { x, y }; },
  press: pressWinch,
  hold(on) { if (on) pressWinch(); else winch.held = false; },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr: renderer.getPixelRatio() }),
  state: () => ({ t: game.time, pos: heli.pos.toArray(), vel: heli.vel.toArray(), tilt: heli.tilt.toArray(), winch: winch.state, len: winch.len, carrying: winch.toy ? winch.toy.name : null, held: winch.held, rescued: game.rescued, free: game.free,
    bucket: { state: bucket.state, water: bucket.water, pos: bucket.group.position.toArray() }, plants: garden.plants.map((p) => ({ x: p.x, z: p.z, bloomed: p.target === 1, progress: p.progress })),
    bob: winch.bob.toArray(), toys: toys.map((t) => ({ name: t.name, state: t.state, rescued: t.rescued, pos: t.group.position.toArray() })) }),
};
