import * as THREE from 'three';
import { CFG } from './config.js';

const f = (v, d = 2) => Number(v).toFixed(d);

/** In-game diagnostic overlay (press T): live stats + automated spec / integrity checks. */
export class QA {
  constructor({ renderer, terrain, world, game, robot, env, assets, quality }) {
    Object.assign(this, { renderer, terrain, world, game, robot, env, assets, quality });
    this.el = document.getElementById('qa');
    this.visible = false;
    this.fps = 60; this.fpsMin = 60; this.ms = 16; this._acc = 0; this._frames = 0; this._worst = 0;
    this.errors = 0; this.shaderErrors = 0; this.contextLost = false; this.lastError = '';
    this.drawCalls = 0; this.triangles = 0;
    this._uiT = 0; this._checkT = 0;
    this.results = [];
    // static measurements, taken once
    this.terrainM = terrain.measure();
    this.models = {};
    for (const [type, def] of Object.entries(CFG.BUILD)) {
      const box = new THREE.Box3().setFromObject(assets.M[def.model]);
      this.models[type] = { x: box.max.x - box.min.x, z: box.max.z - box.min.z, top: box.max.y, bottom: box.min.y };
      if (type === 'campfire') {                               // round footprint: measure the true diameter
        let r = 0;
        assets.M[def.model].traverse((o) => {
          if (!o.isMesh) return;
          const p = o.geometry.attributes.position, v = new THREE.Vector3();
          for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); r = Math.max(r, Math.hypot(v.x, v.z)); }
        });
        this.models[type].x = this.models[type].z = 2 * r;
      }
    }
    this.initial = { trees: world.trees.length, boulders: world.boulders.length };
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.glVersion = gl.getParameter(gl.VERSION);
    renderer.domElement.addEventListener('webglcontextlost', () => { this.contextLost = true; });
    renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; });
  }

  noteError(msg) { this.errors++; this.lastError = String(msg).slice(0, 140); }

  setVisible(v) { this.visible = v; if (v) { this.results = this.runChecks(); this.render(); } }

  frame(dt) {
    this._acc += dt; this._frames++; this._worst = Math.max(this._worst, dt);
    if (this._acc >= 0.5) {
      this.fps = this._frames / this._acc;
      this.ms = this._acc / this._frames * 1000;
      this.fpsMin = 1 / this._worst;
      this._acc = 0; this._frames = 0; this._worst = 0;
    }
    if (!this.visible) return;
    this._uiT -= dt; this._checkT -= dt;
    if (this._checkT <= 0) { this._checkT = 1.0; this.results = this.runChecks(); }
    if (this._uiT <= 0) { this._uiT = 0.2; this.render(); }
  }

  runChecks() {
    const { terrain: T, world: W, game: G, robot } = this;
    const out = [];
    const add = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
    const tm = this.terrainM;

    // 1 — spec & measurement compliance
    add('Map size 150 × 150 m', Math.abs(tm.sizeX - 150) < 1e-3 && Math.abs(tm.sizeZ - 150) < 1e-3, `${f(tm.sizeX, 1)} × ${f(tm.sizeZ, 1)} m`);
    add('Playable elevation 0–8 m', tm.playMin >= -1e-3 && tm.playMax <= 8 + 1e-3 && tm.playMax - tm.playMin > 7, `${f(tm.playMin)} … ${f(tm.playMax)} m`);
    let inClear = 0, minDist = Infinity;
    for (const o of W.trees.concat(W.boulders)) {
      const edge = Math.hypot(o.x, o.z) - (o.type === 'boulder' ? o.width / 2 : o.radius);
      minDist = Math.min(minDist, edge);
      if (edge < CFG.CLEAR_RADIUS) inClear++;
    }
    add('Spawn clearing r = 20 m empty', inClear === 0 && tm.clearMax < CFG.CLEAR_MAX_ELEV, `${inClear} obstacles · nearest ${f(minDist, 1)} m · max elev ${f(tm.clearMax)} m`);
    let hOk = true, wOk = true, hMin = 99, hMax = 0, wMin = 99, wMax = 0;
    for (const t of W.trees) { hMin = Math.min(hMin, t.height); hMax = Math.max(hMax, t.height); if (t.height < 6 || t.height > 14) hOk = false; }
    for (const b of W.boulders) { wMin = Math.min(wMin, b.width); wMax = Math.max(wMax, b.width); if (b.width < 1 || b.width > 3) wOk = false; }
    add('Trees 120–150 (6–14 m tall)', this.initial.trees >= 120 && this.initial.trees <= 150 && hOk, `${this.initial.trees} placed · ${f(hMin, 1)}–${f(hMax, 1)} m`);
    add('Boulders 40–60 (1–3 m wide)', this.initial.boulders >= 40 && this.initial.boulders <= 60 && wOk, `${this.initial.boulders} placed · ${f(wMin, 1)}–${f(wMax, 1)} m`);
    add('Border ridge 60–75 m contains map', tm.ridgeMin > tm.playMax + 2 && W.borderTrees.length > 200, `ridge ≥ ${f(tm.ridgeMin, 1)} m · ${W.borderTrees.length} trees · ${W.borderRocks.length} rocks`);
    const m = this.models, B = CFG.BUILD;
    const dimOk = Math.abs(m.wall.x - 3) < 0.03 && Math.abs(m.wall.top - 2.5) < 0.03 && Math.abs(m.campfire.x - 1.5) < 0.04 && Math.abs(m.campfire.z - 1.5) < 0.04
      && Math.abs(m.beacon.x - 3) < 0.03 && Math.abs(m.beacon.z - 3) < 0.03 && Math.abs(m.beacon.top - 7) < 0.03;
    const costOk = B.wall.cost.wood === 3 && B.wall.cost.stone === 0 && B.campfire.cost.wood === 2 && B.campfire.cost.stone === 3 && B.beacon.cost.wood === 4 && B.beacon.cost.stone === 6;
    add('Structure sizes & costs', dimOk && costOk, `wall ${f(m.wall.x)}×${f(m.wall.top)} · fire ⌀${f(m.campfire.x)} · beacon ${f(m.beacon.x)}×${f(m.beacon.z)}×${f(m.beacon.top)}`);
    add('Robot 1.6 m · 6 m/s · range 3.5 m', Math.abs(robot.measuredHeight - 1.6) < 0.06 && CFG.WALK_SPEED === 6 && CFG.HARVEST_RANGE === 3.5 && G.player.topSpeed <= 6.02,
      `h ${f(robot.measuredHeight)} m · top speed ${f(G.player.topSpeed)} m/s`);
    add('Camera 5–20 m (default 10)', CFG.CAM_DIST === 10 && G.cam.distTarget >= 5 - 1e-6 && G.cam.distTarget <= 20 + 1e-6, `zoom ${f(G.cam.distTarget, 1)} m · arm ${f(G.cam.actual, 1)} m`);

    // 2 — graphics pipeline
    const info = this.renderer.info;
    add('WebGL pipeline healthy', !this.contextLost && this.shaderErrors === 0 && this.errors === 0,
      this.errors || this.shaderErrors ? `${this.errors} errors · ${this.shaderErrors} shader · ${this.lastError}` : `${info.programs.length} programs · ${info.memory.textures} textures · 0 errors`);
    const sh = this.env.shadowInfo;
    add('Sun shadows: PCFSoft, full-map frustum', this.renderer.shadowMap.enabled && this.renderer.shadowMap.type === THREE.PCFSoftShadowMap && sh.width >= 150 && sh.texel < 0.06,
      `${f(sh.width, 0)} × ${f(sh.height, 0)} m · ${f(sh.texel * 100, 1)} cm/texel`);

    // 3 — terrain grounding
    let worst = 0, n = 0;
    for (const t of W.trees.concat(W.borderTrees)) { if (!t.alive) continue; n++; worst = Math.max(worst, Math.abs(t.y - T.heightAt(t.x, t.z))); }
    for (const b of W.boulders) { if (!b.alive) continue; n++; const d = T.heightAt(b.x, b.z) - b.y; worst = Math.max(worst, d < 0 ? -d : Math.max(0, d - b.width * 0.35)); }
    for (const s of G.structures) { n++; worst = Math.max(worst, Math.abs(s.y - T.heightAt(s.x, s.z)), Math.abs(s.obj.position.y - s.y)); }
    const pp = G.player.pos;
    const robotGap = Math.abs(pp.y - T.heightAt(pp.x, pp.z)) + Math.abs(robot.measuredMinY);
    add('Terrain grounding (flush)', worst < 0.01 && robotGap < 0.03, `${n} objects · max gap ${f(worst * 100, 1)} cm · robot ${f(robotGap * 100, 1)} cm`);

    // 4 — collisions / controls
    const pen = G.penetration();
    const inside = Math.max(Math.abs(pp.x), Math.abs(pp.z)) <= CFG.PLAY_HALF + 1e-6;
    add('Collision integrity', pen < 0.02 && inside, `penetration ${f(pen * 100, 1)} cm · ${W.colliders.length} colliders · in bounds ${inside}`);
    add('Camera-relative movement', G.player.camDot > 0.2, `input·travel = ${f(G.player.camDot)} · keys held ${G.input.keys.size}`);
    add('Cursor raycast accuracy', G.build.rayErrPx < 1.5, G.build.type ? `${f(G.build.rayErrPx, 2)} px reprojection error` : 'idle (enter build mode to sample)');

    // 5 — economy
    const L = G.ledger, I = G.inventory;
    const mathOk = I.wood === L.gained.wood - L.spent.wood && I.stone === L.gained.stone - L.spent.stone && I.wood >= 0 && I.stone >= 0
      && L.hits === L.gained.wood + L.gained.stone && L.depleted.every((d) => d.hits === CFG.HITS_TO_DEPLETE && d.yield === 3);
    add('Inventory math', mathOk, `wood ${L.gained.wood}−${L.spent.wood}=${I.wood} · stone ${L.gained.stone}−${L.spent.stone}=${I.stone} · ${L.depleted.length} depleted @3 hits`);
    return out;
  }

  summary() {
    const r = this.results.length ? this.results : (this.results = this.runChecks());
    const pass = r.filter((x) => x.pass).length;
    return { pass, total: r.length, ok: pass === r.length, failed: r.filter((x) => !x.pass).map((x) => x.name) };
  }

  render() {
    const G = this.game, p = G.player.pos, s = this.summary();
    const rows = this.results.map((r) => `<tr class="${r.pass ? 'ok' : 'fail'}"><td>${r.pass ? '✔' : '✘'}</td><td>${r.name}</td><td>${r.detail}</td></tr>`).join('');
    this.el.innerHTML = `
      <div class="qa-head"><b>QA DIAGNOSTICS</b><span class="badge ${s.ok ? 'ok' : 'fail'}">${s.ok ? 'PASS' : 'FAIL'} ${s.pass}/${s.total}</span></div>
      <div class="qa-stats">
        <span><i>FPS</i>${f(this.fps, this.fps < 10 ? 1 : 0)} <small>(min ${f(this.fpsMin, this.fpsMin < 10 ? 1 : 0)} · ${f(this.ms, 1)} ms)</small></span>
        <span><i>Player</i>X ${f(p.x, 1)} · Y ${f(p.y, 2)} · Z ${f(p.z, 1)} <small>${f(G.player.speed, 1)} m/s</small></span>
        <span><i>WebGL</i>${this.contextLost ? 'CONTEXT LOST' : 'OK'} · ${this.glVersion.replace(/\(.*$/, '').trim()}</span>
        <span><i>Frame</i>${this.drawCalls} draws · ${(this.triangles / 1e6).toFixed(2)} M tris · Q${this.quality.level}</span>
        <span class="wide"><i>GPU</i><small>${String(this.gpu).slice(0, 96)}</small></span>
      </div>
      <table>${rows}</table>`;
  }
}
