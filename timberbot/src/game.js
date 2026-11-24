import * as THREE from 'three';
import { CFG, clamp, lerp } from './config.js';
import { instantiate, shared } from './assets.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ------------------------------------------------------------------------------- 2D collision helpers
function boxLocal(c, x, z) { const dx = x - c.x, dz = z - c.z; return [dx * c.ax + dz * c.az, -dx * c.az + dz * c.ax]; }

/** Push a circle (x, z, r) out of a collider. Returns penetration depth (0 if separate). */
function resolve(c, p, r) {
  if (c.kind === 'circle') {
    const dx = p.x - c.x, dz = p.z - c.z, min = r + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return 0;
    const d = Math.sqrt(d2);
    if (d < 1e-5) { p.x += min; return min; }
    p.x = c.x + dx / d * min; p.z = c.z + dz / d * min;
    return min - d;
  }
  let [lx, lz] = boxLocal(c, p.x, p.z);
  const cx = clamp(lx, -c.hx, c.hx), cz = clamp(lz, -c.hz, c.hz);
  let ox = lx - cx, oz = lz - cz;
  const d = Math.hypot(ox, oz);
  let pen;
  if (d > 1e-6) {
    if (d >= r) return 0;
    pen = r - d; lx = cx + ox / d * r; lz = cz + oz / d * r;
  } else {                                                    // centre inside the box: exit through the nearest face
    const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
    if (px < pz) { lx = Math.sign(lx || 1) * (c.hx + r); pen = px + r; } else { lz = Math.sign(lz || 1) * (c.hz + r); pen = pz + r; }
  }
  p.x = c.x + lx * c.ax - lz * c.az; p.z = c.z + lx * c.az + lz * c.ax;
  return pen;
}

function boxCorners(b) {
  const out = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([b.x + sx * b.hx * b.ax - sz * b.hz * b.az, b.z + sx * b.hx * b.az + sz * b.hz * b.ax]);
  return out;
}
function boxBox(a, b) {                                       // 2D SAT
  const ca = boxCorners(a), cb = boxCorners(b);
  for (const [ax, az] of [[a.ax, a.az], [-a.az, a.ax], [b.ax, b.az], [-b.az, b.ax]]) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, z] of ca) { const d = x * ax + z * az; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const [x, z] of cb) { const d = x * ax + z * az; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}
function boxCircle(b, x, z, r) {
  const [lx, lz] = boxLocal(b, x, z);
  const ox = lx - clamp(lx, -b.hx, b.hx), oz = lz - clamp(lz, -b.hz, b.hz);
  return ox * ox + oz * oz < r * r;
}
function overlap(a, b) {
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r;
  if (a.kind === 'box' && b.kind === 'box') return boxBox(a, b);
  return a.kind === 'box' ? boxCircle(a, b.x, b.z, b.r) : boxCircle(b, a.x, a.z, a.r);
}

// ------------------------------------------------------------------------------- input
class Input {
  constructor(canvas, game) {
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
    this.ptr = null;
    this.canvas = canvas;
    const g = game;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const first = !this.keys.has(e.code);
      this.keys.add(e.code);
      if (first) g.onKey(e.code, e.shiftKey);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') e.preventDefault(); });
    // never leave a key stuck when focus goes away
    const clear = () => { this.keys.clear(); this.ptr = null; };
    addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // fingers are handled by TouchControls (src/touch.js); this class handles mouse and pen
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.ptr = { id: e.pointerId, button: e.button, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, drag: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.inside = e.target === canvas;
      const p = this.ptr;
      if (!p) return;
      if (!p.drag && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 5) p.drag = true;
      if (p.drag) g.orbit(e.clientX - p.lx, e.clientY - p.ly);
      p.lx = e.clientX; p.ly = e.clientY;
    });
    const up = (e) => {
      if (e.pointerType === 'touch') return;
      const p = this.ptr;
      if (!p) return;
      this.ptr = null;
      if (e.type === 'pointerup' && !p.drag) g.onClick(p.button, e.clientX, e.clientY);
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); g.zoom(e.deltaY); }, { passive: false });
  }

  down(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
}

// ------------------------------------------------------------------------------- game
export class Game {
  constructor({ scene, camera, renderer, terrain, world, robot, fx, audio, hud, assets, mats, splat }) {
    Object.assign(this, { scene, camera, renderer, terrain, world, robot, fx, audio, hud, assets, mats, splat });
    this.input = new Input(renderer.domElement, this);
    this.raycaster = new THREE.Raycaster();
    this.inventory = { wood: 0, stone: 0 };
    this.ledger = { gained: { wood: 0, stone: 0 }, spent: { wood: 0, stone: 0 }, hits: 0, depleted: [], built: [] };
    this.player = {
      pos: new THREE.Vector3(0, terrain.heightAt(0, 0), 0), vel: new THREE.Vector2(), yaw: 0.6, speed: 0, topSpeed: 0,
      moveDir: new THREE.Vector2(), camDot: 1,
    };
    this.cam = { yaw: 0.55, pitch: 0.4, dist: CFG.CAM_DIST, distTarget: CFG.CAM_DIST, actual: CFG.CAM_DIST, focus: this.player.pos.clone().add(new THREE.Vector3(0, 1.25, 0)) };
    this.swing = null;
    this.target = null;
    this.structures = [];
    this.build = { type: null, rot: 0, ghost: null, valid: false, reason: '', pos: new THREE.Vector3(), hit: false, rayErrPx: 0 };
    this.time = 0;
    this.started = false;

    // translucent ghost material + ground footprint outline
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.42, depthWrite: false, fog: false });
    this.ghosts = {};
    for (const [type, def] of Object.entries(CFG.BUILD)) {
      const g = instantiate(assets.M[def.model], mats);
      g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 15; } });
      g.visible = false;
      scene.add(g);
      this.ghosts[type] = g;
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3));
    this.outline = new THREE.Line(og, new THREE.LineBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.95, depthTest: false, fog: false }));
    this.outline.frustumCulled = false; this.outline.visible = false; this.outline.renderOrder = 16;
    scene.add(this.outline);

    // harvest target ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 4;
    scene.add(ring);
    this.ring = ring;

    robot.onStep = () => {
      audio.footstep();
      const p = this.player.pos;
      if (this.player.speed > 3) fx.dust(p.x, p.y, p.z, 0.15, 1, 0.14);
    };
    this._syncRobot(0);
    this._updateCamera(1, true);
    hud.setInventory(this.inventory);
    this._refreshBuildHud();
  }

  // ------------------------------------------------------------------ input callbacks
  onKey(code, shift) {
    if (code === 'Digit1' || code === 'Numpad1') this.toggleBuild('wall');
    else if (code === 'Digit2' || code === 'Numpad2') this.toggleBuild('campfire');
    else if (code === 'Digit3' || code === 'Numpad3') this.toggleBuild('beacon');
    else if (code === 'Escape') this.cancelBuild();
    else if (code === 'Space') this.harvestQueued = true;      // edge-triggered: a tap shorter than one frame still counts
    else if (code === 'KeyR' && this.build.type) this.build.rot += (shift ? -1 : 1) * Math.PI / 12;
    else if (code === 'KeyT') this.hud.toggleQA();
    else if (code === 'KeyM') this.hud.toggleMute();
    else if (code === 'KeyH') this.hud.toggleHelp();
  }

  orbit(dx, dy) {
    this.cam.yaw -= dx * 0.0052;
    this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.1, 1.08);
  }

  zoom(deltaY) {
    this.cam.distTarget = clamp(this.cam.distTarget * Math.exp(clamp(deltaY, -240, 240) * 0.0011), CFG.CAM_MIN, CFG.CAM_MAX);
  }

  onClick(button, cx, cy) {
    if (!this.started) return;
    if (this.build.type) {
      if (button === 0) this.placeStructure();
      else if (button === 2) this.cancelBuild();
      return;
    }
    if (button === 0) this.tryHarvest(this._pickAt(cx, cy));
  }

  // ------------------------------------------------------------------ helpers
  _ndc(cx, cy, out = new THREE.Vector2()) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return out.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  /** Exact terrain point under a screen position (ray-marched against the heightfield). */
  terrainUnder(cx, cy, out = new THREE.Vector3()) {
    this.raycaster.setFromCamera(this._ndc(cx, cy), this.camera);
    return this.terrain.raycast(this.raycaster.ray.origin, this.raycaster.ray.direction, 400, out);
  }

  screenOf(v, out = new THREE.Vector2()) {
    const r = this.renderer.domElement.getBoundingClientRect();
    _v2.copy(v).project(this.camera);
    return out.set((_v2.x + 1) / 2 * r.width + r.left, (1 - _v2.y) / 2 * r.height + r.top);
  }

  _inRange() {
    const p = this.player.pos, out = [];
    for (const o of this.world.trees) if (o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= CFG.HARVEST_RANGE) out.push(o);
    for (const o of this.world.boulders) if (o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= CFG.HARVEST_RANGE) out.push(o);
    return out;
  }

  _bestTarget() {
    const p = this.player.pos, fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
    let best = null, bs = Infinity;
    for (const o of this._inRange()) {
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1e-3;
      const score = d - 0.9 * ((dx * fx + dz * fz) / d);
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  _pickAt(cx, cy) {
    let best = null, bd = 95;
    const s = new THREE.Vector2();
    for (const o of this._inRange()) {
      this.screenOf(_v.set(o.x, o.y + (o.type === 'tree' ? 1.3 : o.width * 0.35), o.z), s);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ------------------------------------------------------------------ harvesting
  tryHarvest(preferred) {
    if (this.swing || !this.started) return false;
    const target = preferred || this._bestTarget();
    this.swing = { t: 0, target, done: false };
    if (target) this.player.faceYaw = Math.atan2(target.x - this.player.pos.x, target.z - this.player.pos.z);
    else {
      const p = this.player.pos;
      let near = null;
      for (const o of this.world.borderTrees) if (Math.hypot(o.x - p.x, o.z - p.z) < CFG.HARVEST_RANGE) { near = o; break; }
      this.hud.toast(near ? 'The ridge forest is too dense to harvest' : `Nothing in range — move within ${CFG.HARVEST_RANGE} m of a tree or boulder`, 1600);
    }
    this.audio.swing();
    return !!target;
  }

  _impact() {
    const o = this.swing.target, p = this.player.pos;
    if (!o || !o.alive || Math.hypot(o.x - p.x, o.z - p.z) > CFG.HARVEST_RANGE + 0.25) return;
    const res = o.resource;
    const { depleted } = this.world.hit(o, p.x, p.z);
    this.inventory[res] += CFG.YIELD_PER_HIT;
    this.ledger.gained[res] += CFG.YIELD_PER_HIT;
    this.ledger.hits++;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1;
    const ix = o.x + dx / d * o.radius, iz = o.z + dz / d * o.radius;
    if (o.type === 'tree') {
      this.fx.woodChips(ix, p.y + 1.05, iz, dx / d, dz / d, depleted ? 26 : 12, depleted ? 22 : 6, depleted);
      this.fx.floatText('wood', o.x, p.y + 2.3 + this.ledger.hits % 2 * 0.15, o.z);
      this.audio.chop(depleted);
    } else {
      this.fx.rockSparks(ix, o.yCenter + Math.min(0.9, o.width * 0.4), iz, dx / d, dz / d, depleted ? 24 : 9, depleted);
      this.fx.floatText('stone', o.x, o.yCenter + o.width * 0.75 + 0.7, o.z);
      this.audio.mine(depleted);
    }
    if (depleted) {
      this.ledger.depleted.push({ type: o.type, hits: o.hits, yield: o.hits * CFG.YIELD_PER_HIT });
      if (o.type === 'boulder') this.fx.dust(o.x, o.yCenter, o.z, o.width * 0.4, 12, 0.4);
    }
    this.hud.setInventory(this.inventory, res);
    this._refreshBuildHud();
  }

  // ------------------------------------------------------------------ building
  toggleBuild(type) {
    if (!this.started) return;
    if (this.build.type === type) { this.cancelBuild(); return; }
    this.cancelBuild(true);
    this.build.type = type;
    this.ghosts[type].visible = false;
    this.audio.ui();
    this._refreshBuildHud();
  }

  cancelBuild(silent) {
    if (!this.build.type) return;
    this.ghosts[this.build.type].visible = false;
    this.outline.visible = false;
    this.build.type = null;
    this.hud.setBuildHint(null);
    if (!silent) this.audio.ui(true);
    this._refreshBuildHud();
  }

  canAfford(type) {
    const c = CFG.BUILD[type].cost;
    return this.inventory.wood >= c.wood && this.inventory.stone >= c.stone;
  }

  _footprint(type, x, z, rot) {
    const def = CFG.BUILD[type];
    if (type === 'campfire') return { kind: 'circle', x, z, r: def.diameter / 2 };
    const hx = def.width / 2, hz = (def.depth || def.width) / 2;
    return { kind: 'box', x, z, hx, hz, ax: Math.cos(rot), az: -Math.sin(rot) };
  }

  _footSamples(fp) {
    const pts = [[fp.x, fp.z]];
    if (fp.kind === 'circle') { for (let i = 0; i < 8; i++) pts.push([fp.x + Math.cos(i * Math.PI / 4) * fp.r, fp.z + Math.sin(i * Math.PI / 4) * fp.r]); return pts; }
    for (const sx of [-1, -0.5, 0, 0.5, 1]) for (const sz of [-1, 0, 1]) pts.push([fp.x + sx * fp.hx * fp.ax - sz * fp.hz * fp.az, fp.z + sx * fp.hx * fp.az + sz * fp.hz * fp.ax]);
    return pts;
  }

  validate(type, x, z, rot) {
    const def = CFG.BUILD[type], c = def.cost;
    const needW = c.wood - this.inventory.wood, needS = c.stone - this.inventory.stone;
    if (needW > 0 || needS > 0) {
      const parts = [];
      if (needW > 0) parts.push(`${needW} more Wood`);
      if (needS > 0) parts.push(`${needS} more Stone`);
      return { ok: false, reason: 'Need ' + parts.join(' and ') };
    }
    const fp = this._footprint(type, x, z, rot);
    const pts = this._footSamples(fp);
    let mn = Infinity, mx = -Infinity;
    for (const [px, pz] of pts) {
      if (Math.max(Math.abs(px), Math.abs(pz)) > CFG.PLAY_HALF - 0.5) return { ok: false, reason: 'Outside the buildable area' };
      const h = this.terrain.heightAt(px, pz);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    if (mx - mn > def.maxSlope) return { ok: false, reason: 'Ground is too steep' };
    const grow = (f, m) => (f.kind === 'circle' ? { ...f, r: f.r + m } : { ...f, hx: f.hx + m, hz: f.hz + m });
    const big = grow(fp, 0.06);
    for (const col of this.world.colliders) {
      if (col.ref && col.ref.alive === false) continue;
      if (Math.abs(col.x - x) > 9 || Math.abs(col.z - z) > 9) continue;
      if (overlap(big, col)) return { ok: false, reason: 'Blocked by ' + ({ tree: 'a tree', boulder: 'a boulder', log: 'a fallen log', structure: 'another structure' }[col.ref?.type] || 'an obstacle') };
    }
    if (overlap(grow(fp, 0.05), { kind: 'circle', x: this.player.pos.x, z: this.player.pos.z, r: CFG.ROBOT_RADIUS })) return { ok: false, reason: 'Timberbot is standing there' };
    return { ok: true, reason: this.touch && this.touch.enabled ? 'Lift your finger to place' : 'Left-click to place' };
  }

  _updateGhost() {
    const b = this.build;
    if (!b.type) return;
    const ghost = this.ghosts[b.type];
    const hit = this.input.mouse.inside ? this.terrainUnder(this.input.mouse.x, this.input.mouse.y, b.pos) : null;
    b.hit = !!hit;
    if (!hit) { ghost.visible = false; this.outline.visible = false; this.hud.setBuildHint(this.touch && this.touch.enabled ? 'Touch the ground where it should go' : 'Point at the ground', false); return; }
    // QA: re-project the hit point; it must land under the cursor
    const s = this.screenOf(b.pos);
    b.rayErrPx = Math.hypot(s.x - this.input.mouse.x, s.y - this.input.mouse.y);
    const v = this.validate(b.type, b.pos.x, b.pos.z, b.rot);
    b.valid = v.ok; b.reason = v.reason;
    ghost.visible = true;
    ghost.position.set(b.pos.x, this.terrain.heightAt(b.pos.x, b.pos.z), b.pos.z);
    this._orient(ghost, b.type, b.pos.x, b.pos.z, b.rot);
    const pulse = 0.4 + 0.08 * Math.sin(this.time * 6);
    this.ghostMat.color.setHex(v.ok ? 0x39ff78 : 0xff3b30);
    this.ghostMat.opacity = pulse;
    this.outline.material.color.setHex(v.ok ? 0x7dffab : 0xff6a5e);
    // drape the footprint outline on the terrain
    const fp = this._footprint(b.type, b.pos.x, b.pos.z, b.rot);
    const arr = this.outline.geometry.attributes.position.array;
    for (let i = 0; i <= 64; i++) {
      let px, pz;
      if (fp.kind === 'circle') { const a = i / 64 * TAU; px = fp.x + Math.cos(a) * fp.r; pz = fp.z + Math.sin(a) * fp.r; } else {
        const t = (i % 64) / 16, e = Math.floor(t), f = t - e;
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
        const sx = lerp(cs[e][0], cs[e + 1][0], f) * fp.hx, sz = lerp(cs[e][1], cs[e + 1][1], f) * fp.hz;
        px = fp.x + sx * fp.ax - sz * fp.az; pz = fp.z + sx * fp.az + sz * fp.ax;
      }
      arr[i * 3] = px; arr[i * 3 + 1] = this.terrain.heightAt(px, pz) + 0.06; arr[i * 3 + 2] = pz;
    }
    this.outline.geometry.attributes.position.needsUpdate = true;
    this.outline.visible = true;
    this.hud.setBuildHint(v.reason, v.ok);
  }

  _orient(obj, type, x, z, rot) {
    if (type === 'campfire') {                                 // lie flush on gentle slopes
      this.terrain.normalAt(x, z, _v, 0.6);
      obj.quaternion.setFromUnitVectors(UP, _v).multiply(_q.setFromAxisAngle(UP, rot));
    } else obj.rotation.set(0, rot, 0);
  }

  placeStructure() {
    const b = this.build;
    if (!b.type) return false;
    if (!b.hit) return false;
    const v = this.validate(b.type, b.pos.x, b.pos.z, b.rot);
    if (!v.ok) { this.hud.toast(v.reason, 1400, true); this.audio.error(); return false; }
    const type = b.type, def = CFG.BUILD[type], x = b.pos.x, z = b.pos.z, y = this.terrain.heightAt(x, z);
    this.inventory.wood -= def.cost.wood; this.inventory.stone -= def.cost.stone;
    this.ledger.spent.wood += def.cost.wood; this.ledger.spent.stone += def.cost.stone;
    const obj = instantiate(this.assets.M[def.model], this.mats);
    obj.position.set(x, y, z);
    this._orient(obj, type, x, z, b.rot);
    this.scene.add(obj);
    const fp = this._footprint(type, x, z, b.rot);
    const s = { type: 'structure', kind: type, x, y, z, rot: b.rot, obj, alive: true, born: this.time, footprint: fp };
    this.world.colliders.push({ ...fp, ref: s });
    this.structures.push(s);
    this.ledger.built.push({ kind: type, cost: { ...def.cost } });
    if (type === 'campfire') s.fire = this.fx.addFire('campfire', x, y + 0.12, z);
    if (type === 'beacon') s.fire = this.fx.addFire('beacon', x, y + 5.72, z);
    this.splat.extra.push({ x, z, r: type === 'beacon' ? 3.0 : type === 'wall' ? 1.9 : 1.3, strength: type === 'campfire' ? 0.5 : 0.42 });
    this.splat.rebuildAO(this.world);
    this.fx.dust(x, y, z, type === 'beacon' ? 1.8 : 1.0, type === 'beacon' ? 26 : 12, 0.42);
    this.audio.place(type);
    this.hud.setInventory(this.inventory);
    this.hud.toast(`${def.name} built`, 1200);
    if (!this.canAfford(type)) this.cancelBuild(true);
    this._refreshBuildHud();
    return true;
  }

  _refreshBuildHud() {
    const afford = {};
    for (const t of Object.keys(CFG.BUILD)) afford[t] = this.canAfford(t);
    this.hud.setBuildState(this.build.type, afford);
  }

  // ------------------------------------------------------------------ simulation
  _movePlayer(dt) {
    const P = this.player, I = this.input, T = this.terrain;
    let f = (I.down('KeyW', 'ArrowUp') ? 1 : 0) - (I.down('KeyS', 'ArrowDown') ? 1 : 0);
    let r = (I.down('KeyD', 'ArrowRight') ? 1 : 0) - (I.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let mag = 1;
    const st = this.touch && this.touch.stick;
    if (st && st.active && st.mag > 0 && !f && !r) { f = st.y; r = st.x; mag = st.mag; }   // analog thumb-stick
    if (this.swing || !this.started) { f = 0; r = 0; }
    // strictly camera-relative basis on the ground plane
    const yaw = this.cam.yaw;
    const fwx = -Math.sin(yaw), fwz = -Math.cos(yaw), rtx = Math.cos(yaw), rtz = -Math.sin(yaw);
    let dx = fwx * f + rtx * r, dz = fwz * f + rtz * r;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }
    P.moveDir.set(dx, dz);
    const tvx = dx * CFG.WALK_SPEED * mag, tvz = dz * CFG.WALK_SPEED * mag;
    const acc = 46 * dt, ex = tvx - P.vel.x, ez = tvz - P.vel.y, el = Math.hypot(ex, ez);
    if (el <= acc || el < 1e-9) P.vel.set(tvx, tvz); else P.vel.set(P.vel.x + ex / el * acc, P.vel.y + ez / el * acc);
    const ox = P.pos.x, oz = P.pos.z;
    const next = { x: ox + P.vel.x * dt, z: oz + P.vel.y * dt };
    // steep ground blocks movement (the ridge is a natural wall)
    const climb = (nx, nz) => { const run = Math.hypot(nx - ox, nz - oz); return run > 1e-6 && (T.heightAt(nx, nz) - P.pos.y) / run > 1.05; };
    if (climb(next.x, next.z)) {
      if (!climb(next.x, oz)) next.z = oz; else if (!climb(ox, next.z)) next.x = ox; else { next.x = ox; next.z = oz; }
    }
    for (let it = 0; it < 4; it++) {
      let any = false;
      for (const c of this.world.colliders) {
        if (c.ref && c.ref.alive === false) continue;
        if (Math.abs(c.x - next.x) > 7 || Math.abs(c.z - next.z) > 7) continue;
        if (resolve(c, next, CFG.ROBOT_RADIUS) > 0) any = true;
      }
      if (!any) break;
    }
    const lim = CFG.PLAY_HALF;
    next.x = clamp(next.x, -lim, lim); next.z = clamp(next.z, -lim, lim);
    const moved = Math.hypot(next.x - ox, next.z - oz);
    P.speed = dt > 0 ? moved / dt : 0;
    if (len > 0 && P.speed > P.topSpeed) P.topSpeed = P.speed;
    if (len > 0 && moved > 1e-6) P.camDot = ((next.x - ox) * dx + (next.z - oz) * dz) / moved;
    P.pos.set(next.x, T.heightAt(next.x, next.z), next.z);
    if (P.speed < 0.05 && len === 0) P.vel.set(0, 0);
    // face the direction of travel (or the harvest target)
    let want = null;
    if (this.swing && P.faceYaw !== undefined && this.swing.target) want = P.faceYaw;
    else if (len > 0) want = Math.atan2(dx, dz);
    if (want !== null) P.yaw += angDiff(P.yaw, want) * (1 - Math.exp(-13 * dt));
  }

  _syncRobot(dt) {
    const P = this.player, g = this.robot.group;
    g.position.copy(P.pos);
    // lean gently with the slope so the feet read as planted
    this.terrain.normalAt(P.pos.x, P.pos.z, _v, 0.5);
    _v.lerp(UP, 0.65).normalize();
    g.quaternion.setFromUnitVectors(UP, _v).multiply(_q.setFromAxisAngle(UP, P.yaw));
    this.robot.swing = this.swing ? this.swing.t : -1;
    this.robot.update(dt, P.speed, this.time);
  }

  _updateCamera(dt, snap) {
    const C = this.cam, I = this.input, T = this.terrain;
    if (this.started) C.yaw += ((I.down('KeyQ') ? 1 : 0) - (I.down('KeyE') ? 1 : 0)) * 1.9 * dt;
    C.dist += (C.distTarget - C.dist) * (snap ? 1 : 1 - Math.exp(-10 * dt));
    _v.copy(this.player.pos); _v.y += 1.25;
    C.focus.lerp(_v, snap ? 1 : 1 - Math.exp(-16 * dt));
    const cp = Math.cos(C.pitch), dx = Math.sin(C.yaw) * cp, dy = Math.sin(C.pitch), dz = Math.cos(C.yaw) * cp;
    // spring arm: stay above the terrain and inside the map so the edge is never visible
    const clear = (t) => {
      const x = C.focus.x + dx * t, y = C.focus.y + dy * t, z = C.focus.z + dz * t;
      return Math.abs(x) < 72.5 && Math.abs(z) < 72.5 && y > T.heightAt(x, z) + 0.55;
    };
    let free = C.dist;
    const N = 28;
    for (let i = 1; i <= N; i++) {
      const t = C.dist * i / N;
      if (!clear(t)) {
        let a = C.dist * (i - 1) / N, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (clear(m)) a = m; else b = m; }
        free = a; break;
      }
    }
    free = Math.max(free - 0.15, 1.4);
    if (snap || free < C.actual) C.actual = free; else C.actual += (free - C.actual) * (1 - Math.exp(-5 * dt));
    this.camera.position.set(C.focus.x + dx * C.actual, C.focus.y + dy * C.actual, C.focus.z + dz * C.actual);
    this.camera.lookAt(C.focus);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    shared.uPlayerView.value.set(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z).applyMatrix4(this.camera.matrixWorldInverse);
  }

  update(dt) {
    this.time += dt;
    if (this.started && (this.harvestQueued || this.input.down('Space')) && !this.build.type) this.tryHarvest();
    this.harvestQueued = false;
    if (this.swing) {
      this.swing.t += dt / 0.5;
      if (!this.swing.done && this.swing.t >= 0.45) { this.swing.done = true; this._impact(); }
      if (this.swing.t >= 1) this.swing = null;
    }
    this._movePlayer(dt);
    this._syncRobot(dt);
    this._updateCamera(dt);
    this._updateGhost();

    // harvest prompt + ring
    const t = this.build.type ? null : this._bestTarget();
    this.target = t;
    if (t) {
      this.ring.visible = true;
      const rr = t.radius + 0.35;
      this.ring.scale.setScalar(rr * (1 + 0.04 * Math.sin(this.time * 5)));
      this.ring.position.set(t.x, (t.type === 'tree' ? t.y : t.yCenter) + 0.12, t.z);
      this.terrain.normalAt(t.x, t.z, _v);
      this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v);
      this.hud.setPrompt(`${this.touch && this.touch.enabled ? '<b>Tap</b>' : '<b>Space</b> / <b>Click</b>'} — harvest ${t.type === 'tree' ? 'tree' : 'boulder'} <span class="pips">${'●'.repeat(t.hp)}${'○'.repeat(CFG.HITS_TO_DEPLETE - t.hp)}</span>`);
    } else { this.ring.visible = false; this.hud.setPrompt(null); }

    // structures pop in
    for (const s of this.structures) {
      const a = (this.time - s.born) / 0.45;
      if (a < 1.2) {
        const k = a >= 1 ? 1 : 1 - Math.pow(1 - a, 3) + Math.sin(a * Math.PI) * 0.08;
        s.obj.scale.set(1 + (1 - Math.min(a, 1)) * 0.12, Math.max(k, 0.05), 1 + (1 - Math.min(a, 1)) * 0.12);
      }
    }
    this.world.grassUniforms.uPlayer.value.copy(this.player.pos);
  }

  /** Deepest overlap between the robot and any collider (QA: must be ~0). */
  penetration() {
    let worst = 0;
    const p = { x: this.player.pos.x, z: this.player.pos.z };
    for (const c of this.world.colliders) {
      if (c.ref && c.ref.alive === false) continue;
      if (Math.abs(c.x - p.x) > 7 || Math.abs(c.z - p.z) > 7) continue;
      const q = { x: p.x, z: p.z };
      worst = Math.max(worst, resolve(c, q, CFG.ROBOT_RADIUS));
    }
    return worst;
  }

  teleport(x, z) {
    const p = { x, z };
    for (let it = 0; it < 6; it++) for (const c of this.world.colliders) { if (!(c.ref && c.ref.alive === false)) resolve(c, p, CFG.ROBOT_RADIUS); }
    this.player.pos.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
    this.player.vel.set(0, 0);
    this._syncRobot(0);
    this._updateCamera(1, true);
  }
}
