// Fully synthesised audio (Web Audio API): forest wind bed, birds, servo footsteps,
// wood chop, rock mining, building placement, UI blips, campfire crackle. No audio files.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('timberbot.muted') === '1'; } catch (_) { /* storage blocked */ }
    this.fireGain = null;
    this.stepFlip = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // shared noise buffers
    const len = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), p = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99765 * b0 + x * 0.0990460; b1 = 0.96300 * b1 + x * 0.2965164; b2 = 0.57000 * b2 + x * 1.0526913;
      p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.22;
    }
    this._ambience();
    if (ctx.state === 'suspended') ctx.resume();
  }

  _noise(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    s.loopStart = 0; s.loopEnd = buf.duration;
    return s;
  }

  _ambience() {
    const ctx = this.ctx, t = ctx.currentTime;
    // wind: two slowly breathing band-passed noise layers
    const mk = (freq, q, gain, lfoRate, lfoDepth, pan) => {
      const src = this._noise(this.pink);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
      const lg = ctx.createGain(); lg.gain.value = lfoDepth;
      lfo.connect(lg).connect(g.gain);
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = lfoRate * 0.37;
      const lg2 = ctx.createGain(); lg2.gain.value = freq * 0.35;
      lfo2.connect(lg2).connect(bp.frequency);
      const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (pn.pan) pn.pan.value = pan;
      src.connect(bp).connect(g).connect(pn).connect(this.master);
      src.start(t, Math.random() * 2); lfo.start(t); lfo2.start(t);
    };
    mk(320, 0.6, 0.16, 0.09, 0.07, -0.3);
    mk(900, 0.8, 0.07, 0.13, 0.04, 0.35);
    mk(3200, 0.7, 0.028, 0.21, 0.02, 0.0);    // leaf rustle
    // campfire crackle bus (silent until a fire is close)
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    const fsrc = this._noise(this.pink);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const fg = ctx.createGain(); fg.gain.value = 0.5;
    fsrc.connect(lp).connect(fg).connect(this.fireGain);
    this.fireGain.connect(this.master);
    fsrc.start(t);
    this._birdTimer = 2 + Math.random() * 3;
    this._crackTimer = 0.2;
  }

  _env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _burst({ buf = this.white, type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, decay = 0.1, when = 0, dest = this.master, freqEnd }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = this._noise(buf, false);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = ctx.createGain();
    this._env(g, t, attack, gain, decay);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2, attack + decay + 0.05);
  }

  _tone({ type = 'sine', f0 = 200, f1 = 100, gain = 0.3, attack = 0.002, decay = 0.15, when = 0, dest = this.master }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + attack + decay);
    const g = ctx.createGain();
    this._env(g, t, attack, gain, decay);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }

  footstep() {
    if (!this.ctx) return;
    this.stepFlip = !this.stepFlip;
    const d = this.stepFlip ? 1 : 0.92;
    this._tone({ type: 'sawtooth', f0: 210 * d, f1: 420 * d, gain: 0.018, attack: 0.01, decay: 0.09 });        // servo whirr
    this._burst({ type: 'bandpass', freq: 1900 * d, q: 5, gain: 0.02, decay: 0.07 });                           // actuator hiss
    this._tone({ f0: 95 * d, f1: 48, gain: 0.2, decay: 0.11, when: 0.07 });                                     // foot thud
    this._burst({ buf: this.pink, type: 'lowpass', freq: 600, gain: 0.16, decay: 0.09, when: 0.07 });           // grass crunch
  }

  swing() {
    if (!this.ctx) return;
    this._burst({ type: 'bandpass', freq: 500, freqEnd: 1700, q: 1.2, gain: 0.07, attack: 0.08, decay: 0.14 });
    this._tone({ type: 'sawtooth', f0: 140, f1: 330, gain: 0.02, attack: 0.05, decay: 0.16 });
  }

  chop(final) {
    if (!this.ctx) return;
    this._burst({ type: 'bandpass', freq: 1500, q: 0.9, gain: 0.5, decay: 0.06 });
    this._burst({ type: 'highpass', freq: 3500, gain: 0.16, decay: 0.035 });
    this._tone({ type: 'triangle', f0: 210, f1: 80, gain: 0.55, decay: 0.16 });
    this._tone({ f0: 520, f1: 260, gain: 0.14, decay: 0.07 });
    if (final) {                                                // creak + crash
      this._tone({ type: 'sawtooth', f0: 90, f1: 46, gain: 0.12, attack: 0.05, decay: 0.55, when: 0.05 });
      for (let i = 0; i < 6; i++) this._burst({ type: 'bandpass', freq: 800 + Math.random() * 1800, q: 2, gain: 0.2, decay: 0.05, when: 0.1 + i * 0.07 + Math.random() * 0.03 });
      this._burst({ buf: this.pink, type: 'lowpass', freq: 900, gain: 0.5, attack: 0.05, decay: 0.6, when: 0.5 });
      this._tone({ f0: 70, f1: 34, gain: 0.5, decay: 0.3, when: 0.55 });
    }
  }

  mine(final) {
    if (!this.ctx) return;
    for (const [f, g] of [[2350, 0.2], [3480, 0.12], [5120, 0.07]]) this._tone({ type: 'triangle', f0: f * (0.97 + Math.random() * 0.06), f1: f * 0.98, gain: g, decay: 0.22 });
    this._burst({ type: 'highpass', freq: 2500, gain: 0.3, decay: 0.03 });
    this._tone({ f0: 130, f1: 60, gain: 0.4, decay: 0.12 });
    if (final) {
      for (let i = 0; i < 9; i++) this._burst({ buf: this.pink, type: 'bandpass', freq: 300 + Math.random() * 900, q: 1.5, gain: 0.34, decay: 0.09, when: 0.04 + i * 0.05 + Math.random() * 0.03 });
      this._tone({ f0: 80, f1: 30, gain: 0.55, decay: 0.4, when: 0.05 });
    }
  }

  place(type) {
    if (!this.ctx) return;
    this._tone({ f0: 110, f1: 42, gain: 0.6, decay: 0.28 });
    this._burst({ buf: this.pink, type: 'lowpass', freq: 500, gain: 0.4, decay: 0.25 });
    const stone = type !== 'wall';
    for (let i = 0; i < (type === 'beacon' ? 5 : 3); i++) {
      const w = 0.09 + i * 0.085;
      if (stone) { this._tone({ type: 'triangle', f0: 900 + Math.random() * 600, f1: 500, gain: 0.14, decay: 0.07, when: w }); this._burst({ type: 'highpass', freq: 1800, gain: 0.14, decay: 0.03, when: w }); }
      if (!stone || type !== 'campfire') this._tone({ type: 'triangle', f0: 330 - i * 28, f1: 150, gain: 0.3, decay: 0.09, when: w + 0.02 });
    }
    if (type !== 'wall') this._burst({ type: 'bandpass', freq: 700, freqEnd: 2400, q: 0.7, gain: 0.12, attack: 0.25, decay: 0.5, when: 0.35 });   // fire catching
  }

  ui(cancel) {
    if (!this.ctx) return;
    this._tone({ type: 'sine', f0: cancel ? 520 : 660, f1: cancel ? 330 : 990, gain: 0.07, decay: 0.07 });
  }

  error() {
    if (!this.ctx) return;
    this._tone({ type: 'square', f0: 150, f1: 110, gain: 0.06, decay: 0.16 });
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('timberbot.muted', m ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  update(dt, fireDist) {
    if (!this.ctx) return;
    const near = fireDist === undefined ? 0 : Math.max(0, 1 - fireDist / 16);
    this.fireGain.gain.setTargetAtTime(near * near * 0.5, this.ctx.currentTime, 0.2);
    this._crackTimer -= dt;
    if (near > 0.02 && this._crackTimer <= 0) {
      this._crackTimer = 0.04 + Math.random() * 0.3;
      this._burst({ type: 'bandpass', freq: 1200 + Math.random() * 3200, q: 3, gain: 0.3 * near * near, decay: 0.012 + Math.random() * 0.03 });
    }
    this._birdTimer -= dt;
    if (this._birdTimer <= 0) {
      this._birdTimer = 3.5 + Math.random() * 7;
      const base = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this._tone({ f0: base * (1 + Math.random() * 0.15), f1: base * (0.75 + Math.random() * 0.5), gain: 0.018 + Math.random() * 0.014, attack: 0.012, decay: 0.07 + Math.random() * 0.06, when: i * (0.11 + Math.random() * 0.05) });
    }
  }
}
