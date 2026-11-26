import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, smoothstep } from './util.js';
import { MATERIALS, ITEMS, FIELD, WINCH, EVA, TETHER, REPAIRS } from './config.js';
import { L, PUSHERS, buildWorld } from './world.js';
import { makeShip, makeAstronaut, makeItem, makeHook, makeMarker } from './models.js';
import { makeAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const MANUAL = params.has('manual');           // test harness drives the clock
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- tuning
// Flight feel is the rescue helicopter's, number for number. Balance values live in config.js.
const FLY = {
  maxSpeed: 10.5,   // field units / s
  accel: 17,        // at full lean
  gain: 3.3,        // how eagerly it chases the stick
  leanW: 8.5,       // lean spring frequency: lean first, then go
  leanZ: 0.45,      // <1 gives the soft bounce when braking
  drag: 0.25,
  maxLean: 0.4,     // radians shown on the model
  yawRate: 4.5,
};
const G = 16;                 // cable gravity for the empty hook; each item brings its own (heavier = calmer swing)
const STOW = 0.42;
const PICK_R = 3.5;           // close enough that the button starts pulsing
const HOOK_FLOOR = -0.5;      // the hook pays out to just under the debris plane
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
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 2, 0.5, 3200);
camera.position.copy(CAM_OFF); camera.lookAt(0, -1.0, 0);
const camQuat = camera.quaternion.clone();   // the camera never rotates

const lowEnd = params.get('q') === 'low' || (navigator.hardwareConcurrency || 4) <= 4 && (navigator.deviceMemory || 4) <= 2;
const world = buildWorld(scene, renderer);
world.lights.sun.shadow.mapSize.setScalar(lowEnd ? 1024 : 2048);
const audio = makeAudio();

// ---------------------------------------------------------------- state
const timers = [];
const later = (sec, fn) => timers.push({ at: game.time + sec, fn });
const game = {
  time: 0, mode: 'ship',                       // 'ship' | 'eva'
  cargo: Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0])),
  repairs: {},                                 // id -> true
  tier: 1,                                     // current tether tier (1-based index into TETHER)
  shop: false, usedWinch: false, moved: false,
};
const tether = () => TETHER[game.tier - 1];
const has = (ability) => REPAIRS.some((r) => r.unlocks === ability && game.repairs[r.id]);
const canAfford = (cost) => Object.entries(cost).every(([k, n]) => (game.cargo[k] || 0) >= n);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------- ship
const S = makeShip();
scene.add(S.root);
const ship = {
  pos: new THREE.Vector3(L.start.x, L.cruise, L.start.z),
  vel: new THREE.Vector3(), tilt: new THREE.Vector2(), tiltVel: new THREE.Vector2(),
  yaw: 0.6, yVel: 0, comp: 0, loadF: 0, react: new THREE.Vector2(),
};

// ---------------------------------------------------------------- astronaut + tether
const A = makeAstronaut();
scene.add(A.root); A.root.visible = false;
const eva = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, armed: false, o2: 1, held: [], recall: false, puffT: 0 };
const ROPE_N = 14;
const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshStandardMaterial({ color: 0xfaf6ea, roughness: 0.6 }), ROPE_N);
rope.frustumCulled = false; rope.visible = false; scene.add(rope);
const tetherRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
tetherRing.rotation.x = -Math.PI / 2; tetherRing.renderOrder = 3; tetherRing.visible = false; scene.add(tetherRing);

// ---------------------------------------------------------------- salvage
const items = FIELD.items.map((d, i) => {
  const def = ITEMS[d.kind], it = makeItem(d.kind); scene.add(it.group);
  const home = new THREE.Vector3(d.x, d.y ?? 0, d.z);
  it.group.position.copy(home);
  return Object.assign(it, { kind: d.kind, def, carry: def.carry, small: def.size === 'small', state: 'loose', home, pos: home.clone(), vel: new THREE.Vector3(), yaw: i * 1.3, spin: 0.12 + (i % 4) * 0.05, sq: 0, sqV: 0, wiggle: 0, appear: 1, respawn: 0, ph: i * 0.9, t: 0, from: new THREE.Vector3() });
});
const markers = items.map((it) => makeMarker(MATERIALS[it.def.gives].color));
markers.forEach((m) => { m.arrow.scale.setScalar(0.7); scene.add(m.g); });
const hookSpot = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
hookSpot.rotation.x = -Math.PI / 2; hookSpot.renderOrder = 4; scene.add(hookSpot);

// ---------------------------------------------------------------- winch
const hook = makeHook(); scene.add(hook);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1, 6), new THREE.MeshStandardMaterial({ color: 0xfaf6ea, roughness: 0.6 }));
cable.castShadow = true; scene.add(cable);
const winch = { state: 'idle', len: STOW, bob: ship.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), vel: new THREE.Vector3(), toy: null, target: null, timer: 0, moving: 0, tension: 0, liftAt: -9, floor: 0, held: false };
const anchor = new THREE.Vector3();

// ---------------------------------------------------------------- HUD
const hud = { joy: $('joy'), knob: $('knob'), btn: $('winch'), evaBtn: $('eva'), shopBtn: $('shopBtn'), shop: $('shop'), cargo: $('cargo'), edge: $('edge'), hintMove: $('hintMove'), hintTap: $('hintTap'), toast: $('toast'), o2: $('o2'), o2fill: $('o2fill') };
hud.cargo.innerHTML = Object.entries(MATERIALS).map(([k, m]) => `<div class="chip" data-m="${k}" title="${m.name}"><i style="background:${hex(m.color)}"></i><b>0</b></div>`).join('');
const chips = Object.fromEntries([...hud.cargo.querySelectorAll('.chip')].map((el) => [el.dataset.m, el]));
function refreshCargo(popKey) {
  for (const k in chips) chips[k].querySelector('b').textContent = game.cargo[k];
  if (popKey && chips[popKey]) { chips[popKey].classList.remove('pop'); void chips[popKey].offsetWidth; chips[popKey].classList.add('pop'); }
}
let toastT = null;
function toast(text) {
  hud.toast.textContent = text; hud.toast.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => hud.toast.classList.remove('on'), 2200);
}
function nope(el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); audio.sfx.boop(); }

// ---------------------------------------------------------------- input
const input = { x: 0, y: 0 }, ZERO = { x: 0, y: 0 };
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
  if (e.target.closest('#winch, #eva, #shopBtn, #shop, #cargo')) return;
  if (game.shop) return closeShop();           // tap outside the workshop to close it
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
  pressAction();
});
const endWinch = (e) => { if (e.pointerId === winchPointer) { winchPointer = null; winch.held = false; } };
hud.btn.addEventListener('pointerup', endWinch); hud.btn.addEventListener('pointercancel', endWinch);
hud.evaBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); toggleEva(); });
hud.shopBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); toggleShop(); });
addEventListener('blur', () => { winchPointer = null; winch.held = false; });
addEventListener('keydown', (e) => {
  if (!e.repeat) {
    audio.start();
    if (e.code === 'Space') pressAction();
    if (e.code === 'KeyE') toggleEva();
    if (e.code === 'KeyQ' || e.code === 'Tab') { e.preventDefault(); toggleShop(); }
    if (e.code === 'Escape') closeShop();
  }
  keys[e.code] = true;
});
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
/** The one big button: the winch in the ship, the hand grapple on a spacewalk. */
function pressAction() {
  if (game.shop) return;
  if (game.mode === 'ship') winch.held = true; else evaGrab();
}

// ---------------------------------------------------------------- cargo
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const tmpTop = new THREE.Vector3();
const itemTop = (it, out) => out.copy(it.group.position).setY(it.group.position.y + it.height);
function nearestLoose(pos, maxR, pred = () => true) {
  let best = null, bd = maxR;
  for (const it of items) { if (it.state !== 'loose' || it.appear < 1 || !pred(it)) continue; const d = hdist(pos, it.pos); if (d < bd) { bd = d; best = it; } }
  return best;
}
/** Into the hold: counted, celebrated, saved. The item itself drifts back into the field later. */
function stowItem(it) {
  const k = it.def.gives;
  game.cargo[k] += it.def.value;
  it.state = 'gone'; it.group.visible = false; it.respawn = FIELD.respawnSeconds;
  audio.sfx.stow(); world.sparks.burst(ship.pos.x, ship.pos.y - 0.4, ship.pos.z, 26, 0.7, MATERIALS[k].color);
  toast(`+${it.def.value} ${MATERIALS[k].name}`); refreshCargo(k); save();
}
function respawn(it) {
  const a = Math.random() * 6.283;
  it.pos.set(it.home.x + Math.cos(a) * 7, it.home.y, it.home.z + Math.sin(a) * 7); it.vel.set(0, 0, 0);
  it.state = 'loose'; it.appear = 0; it.group.visible = true; it.group.scale.setScalar(0.001);
}
/** Let an item go: it is never lost, it just drifts back to where it was found. */
function setLoose(it) {
  it.pos.copy(it.group.position); it.vel.set(0, 0, 0); it.state = 'loose'; it.sqV = 5;
}

// ---------------------------------------------------------------- winch logic (drop, attach, reel in, release)
function tryCatch() {
  for (const it of items) {
    if (it.state !== 'loose' || it.appear < 1) continue;
    itemTop(it, tmpTop);
    const dx = hdist(winch.bob, tmpTop), dy = winch.bob.y - tmpTop.y;
    if (dx < WINCH.snapRadius && dy < 0.6 && winch.vel.length() < WINCH.catchSpeed) {
      winch.target = it; winch.state = 'grab'; winch.timer = 0; it.wiggle = 1; game.usedWinch = true;
      audio.sfx.click(); world.sparks.burst(tmpTop.x, tmpTop.y, tmpTop.z, 10, 0.4, 0xffcf3a);
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
        // hold the button to tow it around on the cable; let go and it is reeled into the hold
        reel(w.toy.carry.len, w.len > w.toy.carry.len + 0.05 ? 4 : game.time - w.liftAt < 1.5 ? 3.6 : 1.6);
        if (!w.held) { w.state = 'stow'; w.timer = 0; }
      } else if (w.held && game.mode === 'ship') {
        // pay out only as far as the debris plane
        reel(Math.min(WINCH.maxLen, anchor.y - HOOK_FLOOR + 0.2), 3.2);
        tryCatch();
      } else reel(STOW, 5);
      break;
    case 'grab': {
      // the hook slides the last little way onto the loop by itself: that is the forgiving snap
      itemTop(w.target, tmpTop); w.bob.lerp(tmpTop, 1 - Math.exp(-16 * dt)); w.vel.set(0, 0, 0); w.len = Math.max(w.len, anchor.distanceTo(w.bob));
      if (w.timer > 0.5) {
        w.bob.copy(tmpTop); w.len = anchor.distanceTo(tmpTop);
        w.toy = w.target; w.target = null; w.toy.state = 'hanging'; w.state = 'idle'; w.liftAt = game.time; w.floor = tmpTop.y;
        ship.yVel -= w.toy.carry.mass * 15; // a heavy item tugs the ship down as it takes the weight
      }
      break;
    }
    case 'stow':
      if (reel(STOW + 0.3, 3.4) || w.timer > 6) { const it = w.toy; w.toy = null; w.state = 'release'; w.timer = 0; w.vel.set(0, 0, 0); stowItem(it); }
      break;
    case 'release': if (w.timer > 0.45) w.state = 'idle'; break;
  }
  w.moving = Math.sign(w.len - before);
}

// ---------------------------------------------------------------- spacewalk
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), dHat = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const airlock = (out) => { S.body.updateWorldMatrix(true, false); return S.body.localToWorld(out.copy(S.airlockLocal)); };

function toggleEva() {
  if (game.shop) return;
  if (game.mode === 'eva') { eva.recall = !eva.recall; audio.sfx.panel(); return; }
  if (winch.toy || winch.state !== 'idle' || winch.held || winch.len > STOW + 0.1) return nope(hud.evaBtn);
  game.mode = 'eva'; document.body.dataset.mode = 'eva';
  airlock(eva.pos);
  v1.copy(eva.pos).sub(ship.pos).setY(0).normalize();
  eva.vel.copy(ship.vel).addScaledVector(v1, 1.8); eva.vel.y = 0;
  eva.yaw = Math.atan2(v1.x, v1.z); eva.armed = false; eva.o2 = 1; eva.recall = false; eva.held.length = 0;
  A.root.visible = true; rope.visible = true; tetherRing.visible = true;
  audio.sfx.hiss(); world.sparks.burst(eva.pos.x, eva.pos.y, eva.pos.z, 14, 0.4, 0xbfe9ff);
}
function dock() {
  game.mode = 'ship'; document.body.dataset.mode = 'ship';
  A.root.visible = false; rope.visible = false; tetherRing.visible = false;
  eva.held.forEach((it, k) => { it.state = 'stowing'; it.t = -k * 0.25; it.from.copy(it.group.position); });
  eva.held.length = 0;
  audio.sfx.dock(); world.sparks.burst(eva.pos.x, eva.pos.y, eva.pos.z, 14, 0.4, 0xbfe9ff);
}
/** Hand grapple: same idea as the winch, a forgiving snap radius around the astronaut. */
function evaGrab() {
  const near = nearestLoose(eva.pos, EVA.grabRadius);
  if (near && near.small && eva.held.length < EVA.carryMax) {
    near.state = 'held'; near.wiggle = 1; eva.held.push(near);
    audio.sfx.click(); world.sparks.burst(near.pos.x, near.pos.y + 0.5, near.pos.z, 10, 0.4, 0xffcf3a);
  } else if (near && !near.small) { nope(hud.btn); toast('Too big to carry: use the winch'); }
  else if (near) { nope(hud.btn); toast('Hands full: take these back to the ship'); }
  else if (eva.held.length) { setLoose(eva.held.pop()); audio.sfx.letgo(); }
}
function evaStep(dt, inp) {
  const p = eva.pos, v = eva.vel, T = tether();
  let ax = inp.x * EVA.thrust, az = inp.y * EVA.thrust;
  const dx = p.x - ship.pos.x, dz = p.z - ship.pos.z, d = Math.hypot(dx, dz) || 1e-5, nx = dx / d, nz = dz / d;
  // oxygen is only pacing: when it runs low the cord shortens and brings you home to refill
  eva.o2 = Math.max(0, eva.o2 - dt / EVA.oxygenSeconds);
  if (eva.o2 <= 0) eva.recall = true;
  if (eva.recall) {
    const sp = Math.min(EVA.maxSpeed, d * 1.1 + 0.6);
    ax = clamp((-nx * sp - v.x) * 2.5, -EVA.thrust * 1.5, EVA.thrust * 1.5); az = clamp((-nz * sp - v.z) * 2.5, -EVA.thrust * 1.5, EVA.thrust * 1.5);
  }
  // the tether: free inside the radius, a gentle pull outside it, never a wall
  const R = T.radius * smoothstep(0, EVA.lowOxygen, eva.o2);
  if (d > R) {
    const k = T.pull * (d - R), vr = v.x * nx + v.z * nz;
    ax -= nx * (k + Math.max(0, vr) * 1.2); az -= nz * (k + Math.max(0, vr) * 1.2);
  }
  v.x += ax * dt; v.z += az * dt;
  const dr = Math.exp(-EVA.drag * dt); v.x *= dr; v.z *= dr;
  const sp = Math.hypot(v.x, v.z), cap = EVA.maxSpeed * (d > R ? 1.4 : 1);
  if (sp > cap) { v.x *= cap / sp; v.z *= cap / sp; }
  p.x += v.x * dt; p.z += v.z * dt;
  // drift down to the debris plane away from the ship, back up to the airlock near it
  p.y = damp(p.y, lerp(ship.pos.y - 0.9, 0.7, smoothstep(1.2, 5, d)), 2.4, dt);
  const mag = Math.hypot(inp.x, inp.y);
  if (mag > 0.2 && !eva.recall) eva.yaw = dampAngle(eva.yaw, Math.atan2(inp.x, inp.y), 3.2, dt);
  else if (eva.recall) eva.yaw = dampAngle(eva.yaw, Math.atan2(-nx, -nz), 3.2, dt);
  // little thruster puffs
  eva.puffT -= dt;
  if ((mag > 0.2 || eva.recall) && eva.puffT <= 0) {
    eva.puffT = 0.07;
    const bx = eva.recall ? nx : -inp.x / mag, bz = eva.recall ? nz : -inp.y / mag;
    world.sparks.one(p.x + bx * 0.4, p.y + 0.1, p.z + bz * 0.4, bx * 2.5 + (Math.random() - 0.5), (Math.random() - 0.5), bz * 2.5 + (Math.random() - 0.5), 0.5, 0xbfe9ff);
    if (Math.random() < 0.12) audio.sfx.puff();
  }
  if (!eva.armed && d > EVA.dockRadius + 1.5) eva.armed = true;
  if (eva.armed && d < EVA.dockRadius) dock();
}

// ---------------------------------------------------------------- workshop (repairs + upgrades, at the ship)
const costHtml = (cost) => Object.entries(cost).map(([k, n]) => `<span class="cost ${game.cargo[k] >= n ? 'ok' : 'no'}"><i style="background:${hex(MATERIALS[k].color)}"></i>${game.cargo[k]}/${n}</span>`).join('');
function renderShop() {
  const T = tether(), next = TETHER[game.tier];
  let h = '<button class="close" data-act="close" aria-label="Close">&times;</button><h2>Workshop</h2><h3>Repairs</h3>';
  for (const r of REPAIRS) {
    const done = !!game.repairs[r.id];
    h += `<div class="row ${done ? 'done' : ''}"><div><b>${r.name}</b><small>${r.blurb}</small></div>` +
      (done ? '<span class="tick">Done</span>' : `<div class="costs">${costHtml(r.cost)}</div><button data-act="repair" data-id="${r.id}" ${canAfford(r.cost) ? '' : 'disabled'}>Fix</button>`) + '</div>';
  }
  h += `<h3>Tether</h3><div class="row done"><div><b>Tier ${T.tier}: ${T.name}</b><small>Reach ${T.radius}</small></div><span class="tick">Fitted</span></div>`;
  if (next) {
    const ready = next.ready !== false;
    h += `<div class="row"><div><b>Tier ${next.tier}: ${next.name}</b><small>Reach ${next.radius}${ready ? '' : ' · not in this prototype yet'}</small></div>` +
      `<div class="costs">${costHtml(next.cost)}</div><button data-act="tier" ${ready && canAfford(next.cost) ? '' : 'disabled'}>${ready ? 'Install' : 'Later'}</button></div>`;
  }
  hud.shop.innerHTML = h;
}
function toggleShop() {
  if (game.shop) return closeShop();
  if (game.mode !== 'ship') { nope(hud.shopBtn); toast('Float back to the ship first'); return; }
  game.shop = true; winch.held = false; renderShop(); hud.shop.classList.add('on'); audio.sfx.panel();
}
function closeShop() { if (!game.shop) return; game.shop = false; hud.shop.classList.remove('on'); }
function pay(cost) { for (const [k, n] of Object.entries(cost)) game.cargo[k] -= n; refreshCargo(); }
function celebrate(text) {
  audio.sfx.fanfare(); toast(text);
  for (let j = 0; j < 4; j++) later(j * 0.3, () => world.sparks.burst(ship.pos.x + Math.cos(j * 1.7) * 2, ship.pos.y + 0.5, ship.pos.z + Math.sin(j * 1.7) * 2, 40, 1.1));
}
hud.shop.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  e.preventDefault();
  if (b.dataset.act === 'close') return closeShop();
  if (b.dataset.act === 'repair') {
    const r = REPAIRS.find((x) => x.id === b.dataset.id);
    if (!r || game.repairs[r.id] || !canAfford(r.cost)) return;
    pay(r.cost); game.repairs[r.id] = true; celebrate(`${r.name}: done!`);
  }
  if (b.dataset.act === 'tier') {
    const next = TETHER[game.tier];
    if (!next || next.ready === false || !canAfford(next.cost)) return;
    pay(next.cost); game.tier = next.tier; celebrate(`${next.name} fitted!`);
  }
  save(); renderShop();
});

// ---------------------------------------------------------------- saving (on the device, offline)
const SAVE_KEY = 'starlight-salvage-v1';
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cargo: game.cargo, repairs: Object.keys(game.repairs).filter((k) => game.repairs[k]), tier: game.tier })); }
  catch (_) { /* no storage: the game still plays, it just won't remember */ }
}
function load() {
  let d = null;
  try { d = params.has('fresh') ? null : JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) {}
  if (!d) return;
  for (const k in game.cargo) game.cargo[k] = Math.max(0, Math.floor(d.cargo?.[k] || 0));
  for (const id of d.repairs || []) if (REPAIRS.some((r) => r.id === id)) game.repairs[id] = true;
  game.tier = clamp(Math.floor(d.tier || 1), 1, TETHER.length);
}
// grown-ups: hold the cargo counter for three seconds to start over
{
  let tmr = null;
  hud.cargo.addEventListener('pointerdown', (e) => { e.preventDefault(); hud.cargo.classList.add('resetting'); tmr = setTimeout(() => { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} location.replace(location.pathname + location.search.replace(/[?&]fresh\b/, '')); }, 3000); });
  const stop = () => { clearTimeout(tmr); hud.cargo.classList.remove('resetting'); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => hud.cargo.addEventListener(n, stop));
}

// ---------------------------------------------------------------- simulation
function flightStep(h, inp) {
  const p = ship.pos, v = ship.vel, B = L.bounds;
  let dvx = inp.x * FLY.maxSpeed, dvz = inp.y * FLY.maxSpeed;
  // soft field edges: ease to a stop, never a bump
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
  const T = ship.tilt, TV = ship.tiltVel, W = FLY.leanW;
  TV.x += ((ax - T.x) * W * W - 2 * FLY.leanZ * W * TV.x) * h; TV.y += ((az - T.y) * W * W - 2 * FLY.leanZ * W * TV.y) * h;
  T.x += TV.x * h; T.y += TV.y * h;
  v.x += (T.x * FLY.accel + ship.react.x) * h; v.z += (T.y * FLY.accel + ship.react.y) * h;
  const dr = Math.exp(-FLY.drag * h); v.x *= dr; v.z *= dr;
  p.x += v.x * h; p.z += v.z * h;
  // altitude: holds its cruise height, dips under a heavy load then recovers
  ship.comp += (ship.loadF - ship.comp) * Math.min(1, h / 0.75);
  ship.yVel += ((L.cruise - p.y) * 10 - 5.6 * ship.yVel - (ship.loadF - ship.comp)) * h;
  p.y += ship.yVel * h;
}

function cableStep(h) {
  const w = winch, toy = w.toy;
  // lean of the body moves the attach point a little
  const lean = ship.tilt.length() * FLY.maxLean;
  v1.set(ship.tilt.y, 0, -ship.tilt.x); if (v1.lengthSq() > 1e-8) v1.normalize(); else v1.set(1, 0, 0);
  q1.setFromAxisAngle(v1, lean);
  anchor.copy(S.hookLocal).multiplyScalar(0.92).applyQuaternion(q1).add(ship.pos);
  ship.loadF = 0; ship.react.set(0, 0);
  if (w.state === 'grab') return;
  const c = toy ? toy.carry : { damp: 2.5, mass: 0, spring: 0, g: G };
  v2.copy(w.bob);
  w.vel.y -= c.g * h;
  w.vel.multiplyScalar(Math.exp(-c.damp * h));
  w.bob.addScaledVector(w.vel, h);
  dHat.copy(w.bob).sub(anchor);
  let len = dHat.length(); if (len < 1e-5) { dHat.set(0, -1, 0); len = 1e-5; } else dHat.multiplyScalar(1 / len);
  let tension = 0;
  if (c.spring > 0) { // stretchy: the wire coil bobs
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
  if (!toy && w.bob.y < HOOK_FLOOR) { w.bob.y = HOOK_FLOOR; if (w.vel.y < 0) w.vel.y = 0; w.vel.x *= 0.9; w.vel.z *= 0.9; }
  // still floating where it was found until the cable takes the weight
  if (toy && game.time - w.liftAt < 1.2 && w.bob.y < w.floor) { w.bob.y = w.floor; w.vel.y = Math.max(0, w.vel.y); tension = 0; }
  w.tension = tension;
  if (toy) {
    ship.loadF = c.mass * tension * Math.max(0, -dHat.y);
    ship.react.set(dHat.x, dHat.z).multiplyScalar(c.mass * tension);
  }
}

function update(dt) {
  game.time += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= game.time) timers.splice(i, 1)[0].fn();
  const t = game.time, raw = game.shop ? ZERO : readInput(), inEva = game.mode === 'eva';
  const shipInp = inEva ? ZERO : raw, mag = Math.hypot(shipInp.x, shipInp.y);
  if (!game.moved && Math.hypot(raw.x, raw.y) > 0.15) { game.moved = true; hud.hintMove.classList.add('gone'); }

  updateWinch(dt);
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  for (let i = 0; i < n; i++) { flightStep(h, shipInp); cableStep(h); }

  // --- ship pose
  if (mag > 0.2) ship.yaw = dampAngle(ship.yaw, Math.atan2(shipInp.x, shipInp.y), FLY.yawRate, dt);
  const lean = ship.tilt.length();
  v1.set(ship.tilt.y, 0, -ship.tilt.x); if (lean > 1e-4) v1.normalize(); else v1.set(1, 0, 0);
  q1.setFromAxisAngle(v1, lean * FLY.maxLean); q2.setFromAxisAngle(UP, ship.yaw);
  S.body.quaternion.copy(q1).multiply(q2);
  S.root.position.set(ship.pos.x + Math.sin(t * 1.3) * 0.03, ship.pos.y + Math.sin(t * 1.9) * 0.07, ship.pos.z);
  const thrust = clamp(lean * 1.3 + 0.12, 0, 1);
  S.setThrust(thrust, t); S.setDish(has('scanner'), t);
  S.beacon.material.emissiveIntensity = Math.sin(t * 6) > 0.6 ? 3 : 0.2;

  // --- spacewalk
  if (inEva) evaStep(dt, raw);
  if (game.mode === 'eva') {
    A.root.position.copy(eva.pos); A.root.position.y += Math.sin(t * 1.4) * 0.06;
    const sp = Math.hypot(eva.vel.x, eva.vel.z) / EVA.maxSpeed;
    q1.setFromAxisAngle(v1.set(eva.vel.z, 0, -eva.vel.x).normalize(), Math.min(0.45, sp * 0.45)); q2.setFromAxisAngle(UP, eva.yaw);
    if (sp > 0.02) A.body.quaternion.copy(q1).multiply(q2); else A.body.quaternion.copy(q2);
    A.anim(t, sp);
    // tether line with a little slack in it, and the ring that shows how far it reaches
    const T = tether(), d = hdist(eva.pos, ship.pos), R = T.radius * smoothstep(0, EVA.lowOxygen, eva.o2);
    airlock(v2); A.body.updateWorldMatrix(true, false); A.body.localToWorld(v3.copy(A.packLocal));
    const sag = clamp((R - d) * 0.12, 0, 1.4);
    let px = v2.x, py = v2.y, pz = v2.z;
    for (let k = 1; k <= ROPE_N; k++) {
      const u = k / ROPE_N, x = lerp(v2.x, v3.x, u), y = lerp(v2.y, v3.y, u) - sag * 4 * u * (1 - u), z = lerp(v2.z, v3.z, u);
      v1.set(x - px, y - py, z - pz); const sl = v1.length() || 1e-5;
      q1.setFromUnitVectors(UP, v1.multiplyScalar(1 / sl));
      m4.compose(dHat.set((x + px) / 2, (y + py) / 2, (z + pz) / 2), q1, v1.set(1, sl, 1)); rope.setMatrixAt(k - 1, m4);
      px = x; py = y; pz = z;
    }
    rope.instanceMatrix.needsUpdate = true;
    const over = d > R;
    tetherRing.position.set(ship.pos.x, 0.04, ship.pos.z); tetherRing.scale.setScalar(Math.max(0.5, R));
    tetherRing.material.color.set(over ? 0xffb347 : 0x8fe9ff); tetherRing.material.opacity = over ? 0.9 : 0.35 + Math.sin(t * 2) * 0.1;
  }

  // --- cable + hook
  const cl = anchor.distanceTo(winch.bob);
  cable.position.copy(anchor).lerp(winch.bob, 0.5);
  cable.scale.set(1, Math.max(0.01, cl), 1);
  cable.quaternion.setFromUnitVectors(UP, v1.copy(anchor).sub(winch.bob).normalize());
  hook.position.copy(winch.bob); hook.quaternion.copy(cable.quaternion);
  hookSpot.visible = !inEva && !winch.toy && winch.len > 1;
  if (hookSpot.visible) hookSpot.position.set(winch.bob.x, 0.03, winch.bob.z);

  // --- salvage
  const scanner = has('scanner'), body = game.mode === 'eva' ? eva : ship;
  items.forEach((it, i) => {
    const g = it.group, m = markers[i];
    if (it.state === 'gone') { m.g.visible = false; it.respawn -= dt; if (it.respawn <= 0) respawn(it); return; }
    it.sqV += (-it.sq * 160 - it.sqV * 11) * dt; it.sq += it.sqV * dt;
    it.wiggle = Math.max(0, it.wiggle - dt * 1.9);
    let shrink = 1;
    if (it.state === 'hanging') {
      v1.copy(anchor).sub(winch.bob).normalize().lerp(UP, 0.3).normalize();
      it.yaw += (winch.vel.x * 0.05 + Math.sin(t * 0.9) * 0.25) * dt;
      q1.setFromUnitVectors(UP, v1); q2.setFromAxisAngle(UP, it.yaw);
      g.quaternion.copy(q1).multiply(q2);
      if (winch.state === 'stow') shrink = smoothstep(STOW + 0.3, STOW + 1.3, winch.len) * 0.85 + 0.15;
      g.position.copy(winch.bob).addScaledVector(v1, -it.height * shrink);
    } else if (it.state === 'held') {
      // towed behind the astronaut on a short line, one after another
      const k = eva.held.indexOf(it), lead = k === 0 ? eva.pos : eva.held[k - 1].pos;
      v1.copy(it.pos).sub(lead).setY(0); if (v1.lengthSq() < 1e-6) v1.set(0, 0, -1); v1.normalize();
      v2.copy(lead).addScaledVector(v1, 1.0); v2.y = eva.pos.y - 0.55;
      it.pos.lerp(v2, 1 - Math.exp(-7 * dt)); it.yaw += dt * 0.8;
      g.position.copy(it.pos); g.rotation.set(0, it.yaw, Math.sin(t * 38) * 0.2 * it.wiggle);
    } else if (it.state === 'stowing') {
      it.t += dt; const u = clamp(it.t / 0.45, 0, 1);
      g.position.lerpVectors(it.from, ship.pos, u * u); shrink = 1 - u * 0.9; g.rotation.y += dt * 10;
      if (u >= 1) { stowItem(it); return; }
    } else {
      // loose: bobs gently and always drifts back to where it belongs
      if (inEva && !it.small && hdist(eva.pos, it.pos) < 1.2) it.vel.addScaledVector(eva.vel, dt * 2);
      it.vel.x += (it.home.x - it.pos.x) * FIELD.driftHome * dt; it.vel.y += (it.home.y - it.pos.y) * FIELD.driftHome * 4 * dt; it.vel.z += (it.home.z - it.pos.z) * FIELD.driftHome * dt;
      it.vel.multiplyScalar(Math.exp(-FIELD.driftDamp * dt)); it.pos.addScaledVector(it.vel, dt);
      it.yaw += it.spin * dt;
      g.position.copy(it.pos); g.position.y += Math.sin(t * 0.8 + it.ph) * 0.12;
      g.rotation.set(Math.sin(t * 0.6 + it.ph) * 0.07, it.yaw, Math.sin(t * 38) * 0.2 * it.wiggle + Math.cos(t * 0.5 + it.ph) * 0.07);
    }
    if (it.appear < 1) it.appear = Math.min(1, it.appear + dt * 1.6);
    const ap = (it.appear <= 0 ? 0.001 : 1 + 2.7 * (it.appear - 1) ** 3 + 1.7 * (it.appear - 1) ** 2) * shrink; // pop in with an overshoot
    g.scale.set((1 + it.sq * 0.25) * ap, (1 - it.sq * 0.3) * ap, (1 + it.sq * 0.25) * ap);
    it.anim(t + i);
    // ring = the snap zone; it turns green when the hook (or your hand) is close enough
    const loose = it.state === 'loose' && it.appear >= 1, dB = hdist(body.pos, it.pos);
    m.g.visible = loose && !winch.toy && (scanner || dB < 16);
    if (m.g.visible) {
      const mine = inEva ? it.small : true, snapR = inEva ? EVA.grabRadius : WINCH.snapRadius;
      m.g.position.set(g.position.x, g.position.y + 0.05, g.position.z);
      m.arrow.visible = mine && (scanner || dB < 10) && !(winch.held && dB < PICK_R + 1) && !(inEva && dB < EVA.grabRadius);
      m.arrow.position.y = it.height + 0.9 + Math.abs(Math.sin(t * 3.2 + i)) * 0.7;
      m.arrow.rotation.y = t * 1.5;
      const s = snapR / 0.95 + Math.sin(t * 3.2 + i) * 0.08; m.ring.scale.set(s, s, 1);
      itemTop(it, tmpTop);
      const inSnap = inEva ? it.small && dB < EVA.grabRadius : hdist(winch.bob, tmpTop) < WINCH.snapRadius && winch.len > 1;
      m.ring.material.color.set(inSnap ? 0x35d07f : MATERIALS[it.def.gives].color);
      m.ring.material.opacity = mine ? 0.8 : 0.25;
    }
  });

  world.update(dt, t, body.pos);

  // --- camera: glides after whoever you are flying, never turns
  const busy = (winch.held && !winch.toy) || winch.state === 'grab';
  cam.zoom = damp(cam.zoom, inEva ? 0.92 : busy ? 0.84 : 1, 2.2, dt);
  cam.x = damp(cam.x, body.pos.x + body.vel.x * 0.32, 3.6, dt); cam.z = damp(cam.z, body.pos.z + body.vel.z * 0.32, 3.6, dt);
  cam.y = damp(cam.y, inEva ? lerp(eva.pos.y, ship.pos.y, 0.55) : ship.pos.y - (winch.toy ? 0.9 : 0), 1.7, dt);
  camera.position.set(cam.x, cam.y, cam.z).addScaledVector(CAM_OFF, cam.zoom * cam.fit);

  updateHud(t);
  audio.update(dt, thrust, Math.min(1, ship.vel.length() / FLY.maxSpeed), winch.moving);
}
const cam = { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z, zoom: 1, fit: 1 };

function updateHud(t) {
  const inEva = game.mode === 'eva', body = inEva ? eva : ship;
  const canGrab = inEva ? eva.held.length < EVA.carryMax && !!nearestLoose(eva.pos, EVA.grabRadius, (it) => it.small)
    : !winch.toy && !winch.held && winch.state === 'idle' && !!nearestLoose(ship.pos, PICK_R);
  hud.btn.classList.toggle('ready', canGrab && !game.shop);
  hud.btn.classList.toggle('letgo', !inEva && !!winch.toy && winch.state === 'idle');
  hud.btn.classList.toggle('down', winch.held);
  hud.btn.classList.toggle('busy', winch.state === 'stow' || winch.state === 'release');
  hud.btn.classList.toggle('carry', inEva ? eva.held.length > 0 : !!winch.toy);
  hud.hintTap.classList.toggle('on', canGrab && !game.usedWinch && !inEva && !game.shop);
  hud.evaBtn.classList.toggle('recall', inEva && eva.recall);
  hud.evaBtn.classList.toggle('off', !inEva && (!!winch.toy || winch.state !== 'idle'));
  hud.o2.classList.toggle('on', inEva); hud.o2.classList.toggle('low', eva.o2 < EVA.lowOxygen);
  hud.o2fill.style.width = (eva.o2 * 100).toFixed(1) + '%';
  const next = TETHER[game.tier];
  const buyable = REPAIRS.some((r) => !game.repairs[r.id] && canAfford(r.cost)) || (next && next.ready !== false && canAfford(next.cost));
  hud.shopBtn.classList.toggle('can', !!buyable && !inEva && !game.shop);
  // edge pointer toward the nearest salvage, once the scanner dish is mended
  let target = null;
  if (has('scanner') && !winch.toy && !game.shop) {
    const it = nearestLoose(body.pos, 1e9, (q) => !inEva || q.small);
    if (it) target = v2.copy(it.pos).setY(it.pos.y + 1);
  }
  let show = false;
  if (target) {
    v1.copy(target).project(camera);
    const behind = v1.z > 1;
    if (behind || Math.abs(v1.x) > 0.9 || Math.abs(v1.y) > 0.86) {
      const hp = v3.copy(body.pos).project(camera);
      let dx = v1.x - hp.x, dy = v1.y - hp.y; if (behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy * innerHeight, dx * innerWidth);
      const mx = innerWidth / 2 - 54, my = innerHeight / 2 - 54;
      const k = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
      const ex = innerWidth / 2 + Math.cos(a) * k, ey = innerHeight / 2 - Math.sin(a) * k;
      hud.edge.style.transform = `translate(${ex}px,${ey}px) rotate(${-a}rad) scale(${1 + Math.sin(t * 6) * 0.08})`;
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

let last = 0, slow = 0;
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
  load(); refreshCargo();
  document.body.dataset.mode = 'ship';
  update(1 / 60); renderer.render(scene, camera);
  document.body.classList.add('ready');
  if (!MANUAL) requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
}
boot();
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// Hooks for the automated playtest (tools/playtest.mjs) – not used by the game itself.
window.__game = {
  ship, eva, winch, items, game, L, TETHER, REPAIRS, EVA, WINCH,
  advance(dt, steps = 1, draw = true) { for (let i = 0; i < steps; i++) update(dt); if (draw) renderer.render(scene, camera); },
  draw() { renderer.render(scene, camera); },
  script(x, y) { scripted = x === null ? null : { x, y }; },
  give(cargo) { Object.assign(game.cargo, cargo); refreshCargo(); save(); },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr: renderer.getPixelRatio() }),
  state: () => {
    const body = game.mode === 'eva' ? eva : ship;
    return { t: game.time, mode: game.mode, pos: body.pos.toArray(), vel: body.vel.toArray(), ship: ship.pos.toArray(), tilt: ship.tilt.toArray(),
      winch: winch.state, len: winch.len, carrying: winch.toy ? winch.toy.kind : null, held: winch.held, bob: winch.bob.toArray(), anchor: anchor.toArray(),
      cargo: { ...game.cargo }, repairs: { ...game.repairs }, tier: game.tier, tetherR: tether().radius, o2: eva.o2, evaHeld: eva.held.length, shop: game.shop, scanner: has('scanner'),
      items: items.map((it) => ({ kind: it.kind, small: it.small, state: it.state, pos: it.pos.toArray(), home: it.home.toArray(), loop: itemTop(it, new THREE.Vector3()).toArray() })) };
  },
};
