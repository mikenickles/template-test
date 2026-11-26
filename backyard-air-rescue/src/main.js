import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, smoothstep, blobShadow } from './util.js';
import { L, PUSHERS, buildWorld, cruiseAlt, restHeight, inPond } from './world.js';
import { makeHeli, makeTeddy, makeDuck, makeRobot, makeHook, makeMarker } from './models.js';
import { buildLife } from './life.js';
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
const PICK_R = 5.5;           // forgiving pickup radius
const PAD_R = 6.5;            // forgiving drop-off radius
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
const world = buildWorld(scene, renderer, uniforms, { grass: lowEnd ? 20000 : 38000 });
world.lights.sun.shadow.mapSize.setScalar(lowEnd ? 1024 : 2048);
const life = buildLife(scene);
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

// ---------------------------------------------------------------- toys
const toys = [makeTeddy(), makeDuck(), makeRobot()].map((t, i) => {
  scene.add(t.group);
  return Object.assign(t, { state: 'stranded', rescued: false, yaw: 0, sq: 0, sqV: 0, wiggle: 0, hopT: 0, hopFrom: new THREE.Vector3(), happy: 0, rest: 0, floaty: false,
    home: new THREE.Vector3(L.home.x - 1.6 + i * 1.6, 0.11, L.home.z + (i === 1 ? 0.5 : 0)) });
});
const [teddy, duck, robot] = toys;
teddy.group.position.set(L.bed.x, 0.3, L.bed.z); teddy.rest = 0.3;
duck.group.position.set(L.pond.x - 0.4, 0.02, L.pond.z + 0.2); duck.rest = 0.02; duck.floaty = true; duck.yaw = -0.5;
robot.group.position.set(L.tower.x, L.tower.platY, L.tower.z + 0.3); robot.rest = L.tower.platY;

// ---------------------------------------------------------------- winch
const hook = makeHook(); scene.add(hook);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1, 6), new THREE.MeshStandardMaterial({ color: 0xfaf6ea, roughness: 0.6 }));
cable.castShadow = true; scene.add(cable);
const winch = { state: 'idle', len: STOW, bob: heli.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), vel: new THREE.Vector3(), toy: null, target: null, timer: 0, hold: null, rest: 0, moving: 0, tension: 0, liftAt: -9, floor: 0 };
const anchor = new THREE.Vector3();

const markers = toys.map(() => makeMarker(0xffa81f));
const padMarker = makeMarker(0x35d07f);
[...markers, padMarker].forEach((m) => scene.add(m.g));
padMarker.g.position.set(L.pad.x, L.pad.y + 0.03, L.pad.z);

const timers = [];
const later = (sec, fn) => timers.push({ at: game.time + sec, fn });
const game = { time: 0, rescued: 0, free: false, celebrate: -1, usedWinch: false, delivered: false };

// ---------------------------------------------------------------- HUD
const hud = { joy: $('joy'), knob: $('knob'), btn: $('winch'), slots: [...document.querySelectorAll('.slot')], edge: $('edge'), hintMove: $('hintMove'), hintTap: $('hintTap'), star: $('star') };
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
hud.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); hud.btn.classList.add('down'); pressWinch(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => hud.btn.addEventListener(n, () => hud.btn.classList.remove('down')));
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { audio.start(); pressWinch(); } keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
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
  for (const t of toys) { if (!pickable(t)) continue; const d = hdist(heli.pos, t.group.position); if (d < bd) { bd = d; best = t; } }
  return best;
}
const nearPad = () => hdist(heli.pos, L.pad) < PAD_R;
function toyTop(t, out) { return out.copy(t.group.position).setY(t.group.position.y + t.height); }
const tmpTop = new THREE.Vector3();

function pressWinch() {
  if (!heli.flying) { heli.flying = true; return; }
  if (winch.state !== 'idle') return;
  if (winch.toy) {
    let hx, hz;
    if (!game.free && nearPad()) { hx = L.pad.x; hz = L.pad.z; }
    else { hx = heli.pos.x + heli.vel.x * 0.35; hz = heli.pos.z + heli.vel.z * 0.35; }
    const rest = restHeight(hx, hz);
    if (rest === null) { audio.sfx.boop(); hud.btn.classList.remove('nope'); void hud.btn.offsetWidth; hud.btn.classList.add('nope'); return; }
    winch.hold = { x: hx, z: hz }; winch.rest = rest; winch.state = 'lower'; winch.timer = 0; winch.landed = false;
  } else {
    const t = nearestToy();
    if (t) { winch.target = t; winch.state = 'reach'; winch.timer = 0; winch.hold = { x: t.group.position.x, z: t.group.position.z }; }
    else { winch.state = 'dip'; winch.timer = 0; audio.sfx.boop(); }
  }
}

function updateWinch(dt) {
  const w = winch; w.timer += dt;
  const before = w.len;
  const reel = (target, speed) => { w.len = w.len < target ? Math.min(target, w.len + speed * dt) : Math.max(target, w.len - speed * dt); return w.len === target; };
  switch (w.state) {
    case 'idle': reel(w.toy ? w.toy.carry.len : STOW, w.toy ? 1.6 : 5); break;
    case 'dip': if (w.timer < 0.45) reel(2.4, 5.5); else if (reel(STOW, 5.5)) w.state = 'idle'; break;
    case 'reach': {
      const t = w.target; toyTop(t, tmpTop);
      w.hold.x = tmpTop.x; w.hold.z = tmpTop.z;
      const need = Math.max(STOW, anchor.y - tmpTop.y);
      const there = reel(need, 6.5);
      if ((there && hdist(anchor, tmpTop) < 1.2 && w.bob.distanceTo(tmpTop) < 0.7) || w.timer > 3) {
        w.bob.copy(tmpTop); w.vel.set(0, 0, 0); w.len = anchor.distanceTo(tmpTop);
        w.state = 'grab'; w.timer = 0; t.wiggle = 1; game.usedWinch = true;
        audio.sfx.click(); later(0.16, () => audio.sfx[t.name]());
      }
      break;
    }
    case 'grab': {
      toyTop(w.target, tmpTop); w.bob.copy(tmpTop); w.vel.set(0, 0, 0); w.len = Math.max(w.len, anchor.distanceTo(tmpTop));
      if (w.timer > 0.5) { w.toy = w.target; w.target = null; w.toy.state = 'hanging'; w.toy.floaty = false; w.state = 'lift'; w.hold = null; w.liftAt = game.time; w.floor = w.toy.rest + w.toy.height;
        heli.yVel -= w.toy.carry.mass * 15; } // a heavy toy tugs the helicopter down as it takes the weight
      break;
    }
    case 'lift': if (reel(Math.min(w.len, w.toy.carry.len), 3.6)) w.state = 'idle'; break;
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

function rescue(t) {
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
  if (w.state === 'reach') { // the hook homes in on the toy's loop: forgiving for small hands
    toyTop(w.target, tmpTop);
    const k = smoothstep(3.5, 0.5, w.bob.y - tmpTop.y) * 60;
    w.vel.x += ((tmpTop.x - w.bob.x) * k - w.vel.x * 6) * h; w.vel.z += ((tmpTop.z - w.bob.z) * k - w.vel.z * 6) * h;
  }
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

  // --- toys
  toys.forEach((toy, i) => {
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
    const m = markers[i], show = !game.free && !toy.rescued && toy.state !== 'hanging' && !winch.toy;
    m.g.visible = show;
    if (show) {
      m.g.position.set(g.position.x, toy.rest + 0.06, g.position.z);
      m.arrow.position.y = toy.height + 0.9 + Math.abs(Math.sin(t * 3.2 + i)) * 0.7;
      m.arrow.rotation.y = t * 1.5;
      const s = 2.0 + Math.sin(t * 3.2 + i) * 0.25; m.ring.scale.set(s, s, 1);
    }
  });
  toyShadow.visible = !!winch.toy;
  if (winch.toy) {
    const p = winch.toy.group.position;
    const ty = restHeight(p.x, p.z);
    toyShadow.position.set(p.x, (ty ?? (overDeck ? L.tower.platY : 0)) + 0.05, p.z);
  }
  const padOn = !game.free && !!winch.toy;
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

  // --- camera: glides after the helicopter, never turns
  const busy = winch.state === 'reach' || winch.state === 'grab' || winch.state === 'lower' || winch.state === 'release';
  cam.zoom = damp(cam.zoom, !heli.flying ? 0.8 : busy ? 0.84 : 1, 2.2, dt);
  cam.x = damp(cam.x, heli.pos.x + heli.vel.x * 0.32, 3.6, dt); cam.z = damp(cam.z, heli.pos.z + heli.vel.z * 0.32, 3.6, dt);
  cam.y = damp(cam.y, heli.pos.y - (winch.toy ? 0.9 : 0), 1.7, dt);
  camera.position.set(cam.x, cam.y, cam.z).addScaledVector(CAM_OFF, cam.zoom * cam.fit);

  updateHud(t);
  audio.update(dt, heli.rotor, Math.min(1, heli.vel.length() / FLY.maxSpeed), winch.moving);
}
const cam = { x: heli.pos.x, y: heli.pos.y, z: heli.pos.z, zoom: 0.8, fit: 1 };

function updateHud(t) {
  const canGrab = !winch.toy && winch.state === 'idle' && heli.flying && !!nearestToy();
  const canDrop = !!winch.toy && winch.state === 'idle' && !game.free && nearPad();
  hud.btn.classList.toggle('ready', canGrab || canDrop);
  hud.btn.classList.toggle('busy', winch.state !== 'idle' && winch.state !== 'lift');
  hud.btn.classList.toggle('carry', !!winch.toy);
  hud.hintTap.classList.toggle('on', (canGrab && !game.usedWinch) || (canDrop && !game.delivered));
  // edge pointer toward the next thing to do
  let target = null;
  if (!game.free && heli.flying) {
    if (winch.toy) target = v2.set(L.pad.x, 1.5, L.pad.z);
    else { let bd = 1e9; for (const toy of toys) if (!toy.rescued && toy.state !== 'hop') { const d = hdist(heli.pos, toy.group.position); if (d < bd) { bd = d; target = v2.copy(toy.group.position).setY(toy.group.position.y + 1.5); } } }
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
      hud.edge.classList.toggle('pad', !!winch.toy);
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
  heli, winch, toys, game, L,
  advance(dt, steps = 1, draw = true) { for (let i = 0; i < steps; i++) update(dt); if (draw) renderer.render(scene, camera); },
  draw() { renderer.render(scene, camera); },
  script(x, y) { scripted = x === null ? null : { x, y }; },
  press: pressWinch,
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr: renderer.getPixelRatio() }),
  state: () => ({ t: game.time, pos: heli.pos.toArray(), vel: heli.vel.toArray(), tilt: heli.tilt.toArray(), winch: winch.state, len: winch.len, carrying: winch.toy ? winch.toy.name : null, rescued: game.rescued, free: game.free,
    bob: winch.bob.toArray(), toys: toys.map((t) => ({ name: t.name, state: t.state, rescued: t.rescued, pos: t.group.position.toArray() })) }),
};
