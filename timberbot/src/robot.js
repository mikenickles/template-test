import * as THREE from 'three';
import { instantiate } from './assets.js';
import { clamp, lerp, smoothstep } from './config.js';

const NODES = ['Hips', 'Torso', 'Head', 'LegL_Thigh', 'LegL_Shin', 'LegL_Foot', 'LegR_Thigh', 'LegR_Shin', 'LegR_Foot',
  'ArmR_Upper', 'ArmR_Fore', 'ArmR_Tool', 'ArmL_Upper', 'ArmL_Fore'];

/** Timberbot: procedural animation over the articulated node hierarchy exported from Blender. */
export class Robot {
  constructor(scene, assets, mats) {
    this.group = new THREE.Group();
    this.group.name = 'TimberbotRoot';
    this.model = instantiate(assets.M.timberbot, mats);
    this.group.add(this.model);
    scene.add(this.group);
    this.n = {};
    this.rest = {};
    for (const name of NODES) {
      const o = this.model.getObjectByName(name);
      if (!o) { console.error('[robot] missing node', name); continue; }
      this.n[name] = o;
      this.rest[name] = { pos: o.position.clone(), rot: o.rotation.clone() };
    }
    const box = new THREE.Box3().setFromObject(this.model);
    this.measuredHeight = box.max.y - box.min.y;
    this.measuredMinY = box.min.y;
    this.visor = mats.Robot_Visor;
    this.lamp = mats.Robot_Lamp;
    this.phase = 0;
    this.blend = 0;          // 0 idle .. 1 walking
    this.lastStep = 0;
    this.onStep = null;
    this.swing = -1;         // harvest swing progress 0..1, -1 = inactive
    this.time = 0;
  }

  /** Swing curve: shoulder pitch (rad) over normalised time. Negative = arm raised forward/up. */
  static swingPose(t) {
    // wind-up -> strike (impact at t = 0.45) -> recover
    if (t < 0.3) { const k = smoothstep(0, 0.3, t); return { sh: lerp(0, -2.75, k), el: lerp(-0.1, -0.9, k), lean: lerp(0, -0.12, k), tool: lerp(0, 0.5, k) }; }
    if (t < 0.45) { const k = ((t - 0.3) / 0.15) ** 2; return { sh: lerp(-2.75, -0.95, k), el: lerp(-0.9, -0.12, k), lean: lerp(-0.12, 0.3, k), tool: lerp(0.5, -0.25, k) }; }
    const k = smoothstep(0.45, 1, t);
    return { sh: lerp(-0.95, 0, k), el: lerp(-0.12, -0.1, k), lean: lerp(0.3, 0, k), tool: lerp(-0.25, 0, k) };
  }

  update(dt, speed, time) {
    this.time = time;
    const n = this.n, r = this.rest;
    const moving = speed > 0.3;
    this.blend = clamp(this.blend + (moving ? dt * 7 : -dt * 6), 0, 1);
    const w = this.blend * clamp(speed / 6, 0.35, 1);
    // stride: ~0.95 m per step at walk speed
    this.phase += dt * speed * 3.25;
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    const idle = 1 - this.blend;
    const breathe = Math.sin(time * 1.7) * 0.5 + 0.5;

    // legs (rotation.x > 0 swings the limb backwards)
    const stride = 0.62 * w;
    n.LegL_Thigh.rotation.x = r.LegL_Thigh.rot.x - s * stride - 0.08 * w;
    n.LegR_Thigh.rotation.x = r.LegR_Thigh.rot.x + s * stride - 0.08 * w;
    const kneeL = Math.max(0, Math.sin(ph - 1.0)) * 1.05 * w + 0.1 * w;
    const kneeR = Math.max(0, Math.sin(ph - 1.0 + Math.PI)) * 1.05 * w + 0.1 * w;
    n.LegL_Shin.rotation.x = r.LegL_Shin.rot.x + kneeL;
    n.LegR_Shin.rotation.x = r.LegR_Shin.rot.x + kneeR;
    n.LegL_Foot.rotation.x = r.LegL_Foot.rot.x - kneeL * 0.5 + s * stride * 0.45;
    n.LegR_Foot.rotation.x = r.LegR_Foot.rot.x - kneeR * 0.5 - s * stride * 0.45;

    // body: bob twice per cycle, sway, counter-rotate
    const bob = Math.abs(c) * 0.045 * w;
    n.Hips.position.y = r.Hips.pos.y - 0.035 * w + bob - 0.006 * breathe * idle;
    n.Hips.rotation.z = r.Hips.rot.z + s * 0.035 * w;
    n.Hips.rotation.y = r.Hips.rot.y + s * 0.07 * w;
    n.Torso.rotation.y = r.Torso.rot.y - s * 0.13 * w + Math.sin(time * 0.45) * 0.04 * idle;
    n.Torso.rotation.x = r.Torso.rot.x + 0.1 * w + breathe * 0.012 * idle;
    n.Head.rotation.y = r.Head.rot.y + s * 0.05 * w + Math.sin(time * 0.6) * 0.32 * idle * (0.5 + 0.5 * Math.sin(time * 0.13));
    n.Head.rotation.x = r.Head.rot.x - 0.06 * w + Math.sin(time * 0.9) * 0.03 * idle;

    // arms
    n.ArmL_Upper.rotation.x = r.ArmL_Upper.rot.x + s * 0.5 * w;
    n.ArmL_Upper.rotation.z = r.ArmL_Upper.rot.z + 0.06;
    n.ArmL_Fore.rotation.x = r.ArmL_Fore.rot.x - 0.25 * w - 0.12 - Math.max(0, s) * 0.3 * w;
    let sh = -s * 0.35 * w - 0.05, el = -0.22 - 0.2 * w, lean = 0, tool = 0;
    if (this.swing >= 0) {
      const p = Robot.swingPose(this.swing);
      sh = p.sh; el = p.el; lean = p.lean; tool = p.tool;
    }
    n.ArmR_Upper.rotation.x = r.ArmR_Upper.rot.x + sh;
    n.ArmR_Upper.rotation.z = r.ArmR_Upper.rot.z - 0.06;
    n.ArmR_Fore.rotation.x = r.ArmR_Fore.rot.x + el;
    n.ArmR_Tool.rotation.x = r.ArmR_Tool.rot.x + tool;
    n.Torso.rotation.x += lean;
    n.Torso.rotation.y += lean * 0.6;

    // footfalls drive audio + dust
    const step = Math.floor(ph / Math.PI);
    if (moving && step !== this.lastStep) {
      this.lastStep = step;
      if (this.onStep) this.onStep(step % 2 === 0 ? 'L' : 'R');
    }
    // visor pulse
    this.visor.emissiveIntensity = 4.6 + Math.sin(time * 2.4) * 0.6 + (this.swing >= 0 ? 2.5 : 0);
    this.lamp.emissiveIntensity = 2.5 + 2.0 * (Math.sin(time * 3.1) > 0.6 ? 1 : 0.2);
  }
}
