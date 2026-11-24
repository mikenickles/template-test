import { CFG, clamp } from './config.js';

// Phone / tablet controls built from gestures, not buttons:
//   left side   - a floating thumb-stick appears wherever the thumb lands (analog walk speed)
//   right side  - drag to look around, pinch to zoom, tap to harvest
//   build mode  - drag a finger to aim the ghost (it sits just above the fingertip), lift to place,
//                 tap with a second finger to rotate, tap the build icon again to cancel
const STICK_R = 54;          // px of thumb travel for full speed
const DEAD = 0.12;           // dead zone as a fraction of STICK_R
const TAP_MS = 280;
const TAP_PX = 12;
const AIM_LIFT = 72;         // px the ghost sits above the fingertip so the finger never hides it
const LOOK_GAIN = 1.3;

export class TouchControls {
  constructor(canvas, game, hud) {
    this.canvas = canvas;
    this.g = game;
    this.hud = hud;
    this.enabled = false;
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 };   // x: right, y: forward, -1..1
    this.look = new Map();                                                          // pointerId -> last {x, y}
    this.pinch = null;
    this.aim = null;
    this.rotateIds = new Set();
    this.taps = new Map();
    this.hintShown = false;

    const hudEl = document.getElementById('hud');
    this.el = document.createElement('div');
    this.el.id = 'stick';
    this.el.innerHTML = '<div class="ring"></div><div class="knob"></div>';
    hudEl.appendChild(this.el);
    this.knob = this.el.querySelector('.knob');
    this.hint = document.createElement('div');
    this.hint.id = 'touchhint';
    this.hint.innerHTML = '<span>Left thumb: walk</span><span>Right: drag to look, pinch to zoom</span><span>Tap: harvest</span>';
    hudEl.appendChild(this.hint);

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e, false));
    addEventListener('pointercancel', (e) => this.up(e, true));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) this.enable();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    if (this.g.started) this.showHint();
  }

  /** One-time, self-dismissing gesture hint. */
  showHint() {
    if (!this.enabled || this.hintShown) return;
    this.hintShown = true;
    this.hint.classList.add('on');
    this.hintTimer = setTimeout(() => this.hideHint(), 7000);
  }

  hideHint() { clearTimeout(this.hintTimer); this.hint.classList.remove('on'); }

  reset() {
    this.endStick();
    this.look.clear();
    this.pinch = null;
    this.aim = null;
    this.rotateIds.clear();
    this.taps.clear();
  }

  // ------------------------------------------------------------------ pointer routing
  down(e) {
    if (e.pointerType !== 'touch') return;
    this.enable();
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    const id = e.pointerId, x = e.clientX, y = e.clientY, g = this.g;
    this.taps.set(id, { t0: e.timeStamp, x0: x, y0: y, moved: false });   // event times, so a slow frame never eats a tap
    if (!g.started) return;
    const leftZone = x < innerWidth * 0.42;
    if (g.build.type) {
      if (this.aim) { this.rotateIds.add(id); return; }                 // second finger while aiming: rotate on tap
      if (!leftZone || this.stick.active) { this.aim = { id }; this.setAim(x, y); return; }
    }
    if (leftZone && !this.stick.active) { this.startStick(id, x, y); return; }
    this.look.set(id, { x, y });
    if (this.look.size === 2) this.startPinch();
  }

  move(e) {
    if (e.pointerType !== 'touch') return;
    const id = e.pointerId, x = e.clientX, y = e.clientY;
    const tp = this.taps.get(id);
    if (!tp) return;
    if (!tp.moved && Math.hypot(x - tp.x0, y - tp.y0) > TAP_PX) tp.moved = true;
    if (this.stick.id === id) { this.updateStick(x, y); return; }
    if (this.aim && this.aim.id === id) { this.setAim(x, y); return; }
    const p = this.look.get(id);
    if (!p) return;
    if (this.pinch) {
      p.x = x; p.y = y;
      this.updatePinch();
      return;
    }
    if (tp.moved) this.g.orbit((x - p.x) * LOOK_GAIN, (y - p.y) * LOOK_GAIN);
    p.x = x; p.y = y;
  }

  up(e, cancelled) {
    if (e.pointerType !== 'touch') return;
    const id = e.pointerId, x = e.clientX, y = e.clientY, g = this.g;
    const tp = this.taps.get(id);
    if (!tp) return;
    this.taps.delete(id);
    const tap = !cancelled && !tp.moved && e.timeStamp - tp.t0 < TAP_MS;
    if (!g.started) return;
    if (this.stick.id === id) {
      this.endStick();
      if (tap) this.tapAction(x, y);
    } else if (this.aim && this.aim.id === id) {
      this.aim = null;
      if (!cancelled && g.build.type) {
        this.setAim(x, y);
        g._updateGhost();
        if (g.placeStructure()) g.input.mouse.inside = false;   // hide the ghost until the next aim
      }
    } else if (this.rotateIds.has(id)) {
      this.rotateIds.delete(id);
      if (tap && g.build.type) g.build.rot += Math.PI / 12;
    } else if (this.look.has(id)) {
      this.look.delete(id);
      if (this.pinch) {
        this.pinch = null;
        for (const t of this.taps.values()) t.moved = true;          // the remaining finger must not count as a tap
      } else if (tap) this.tapAction(x, y);
    }
  }

  // ------------------------------------------------------------------ gestures
  startStick(id, x, y) {
    const s = this.stick;
    Object.assign(s, { active: true, id, ox: x, oy: y, x: 0, y: 0, mag: 0 });
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.el.classList.add('on');
  }

  updateStick(x, y) {
    const s = this.stick;
    let dx = x - s.ox, dy = y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {                       // the base trails the thumb, so it never runs out of travel
      s.ox += dx / d * (d - STICK_R);
      s.oy += dy / d * (d - STICK_R);
      dx = x - s.ox; dy = y - s.oy;
    }
    const len = Math.hypot(dx, dy);
    const raw = Math.min(1, len / STICK_R);
    const m = raw < DEAD ? 0 : (raw - DEAD) / (1 - DEAD);
    s.mag = m;
    s.x = len > 0 ? dx / len * m : 0;
    s.y = len > 0 ? -dy / len * m : 0;
    this.el.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (m > 0.4) this.hideHint();
  }

  endStick() {
    Object.assign(this.stick, { active: false, id: null, x: 0, y: 0, mag: 0 });
    this.el.classList.remove('on');
  }

  startPinch() {
    const [a, b] = [...this.look.values()];
    this.pinch = { span0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), dist0: this.g.cam.distTarget, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    for (const id of this.look.keys()) { const t = this.taps.get(id); if (t) t.moved = true; }
  }

  updatePinch() {
    const [a, b] = [...this.look.values()];
    const P = this.pinch, g = this.g;
    const span = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    g.cam.distTarget = clamp(P.dist0 * P.span0 / span, CFG.CAM_MIN, CFG.CAM_MAX);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    g.orbit((cx - P.cx) * LOOK_GAIN, (cy - P.cy) * LOOK_GAIN);      // two-finger drag also looks around
    P.cx = cx; P.cy = cy;
  }

  setAim(x, y) {
    const m = this.g.input.mouse;
    m.x = x; m.y = Math.max(0, y - AIM_LIFT); m.inside = true;
  }

  tapAction(x, y) {
    const g = this.g;
    if (g.build.type) return;
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = `${x}px`; r.style.top = `${y}px`;
    document.getElementById('hud').appendChild(r);
    setTimeout(() => r.remove(), 500);
    g.tryHarvest(g._pickAt(x, y));
  }
}
