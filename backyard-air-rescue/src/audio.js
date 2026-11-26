// All sound is synthesised on the device: nothing to download, works offline.
export function makeAudio() {
  let ctx = null, master = null, rotorGain = null, rotorFilter = null, lfo = null, hum = null, winchOsc = null, winchGain = null, noiseBuf = null;
  let nextBird = 3;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // rotor: chopped, filtered noise + a soft low hum
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    rotorFilter = ctx.createBiquadFilter(); rotorFilter.type = 'lowpass'; rotorFilter.frequency.value = 320; rotorFilter.Q.value = 0.6;
    const chop = ctx.createGain(); chop.gain.value = 0.55;
    lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain); lfoGain.connect(chop.gain);
    rotorGain = ctx.createGain(); rotorGain.gain.value = 0;
    src.connect(rotorFilter); rotorFilter.connect(chop); chop.connect(rotorGain); rotorGain.connect(master);
    hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 62;
    const humGain = ctx.createGain(); humGain.gain.value = 0.22; hum.connect(humGain); humGain.connect(rotorGain);
    src.start(); lfo.start(); hum.start();
    // winch motor
    winchOsc = ctx.createOscillator(); winchOsc.type = 'sawtooth'; winchOsc.frequency.value = 180;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 900;
    winchGain = ctx.createGain(); winchGain.gain.value = 0;
    winchOsc.connect(wf); wf.connect(winchGain); winchGain.connect(master); winchOsc.start();
  }

  function tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.008 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { vol = 0.2, freq = 1200, type = 'lowpass', delay = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const sfx = {
    click() { noise(0.04, { vol: 0.5, freq: 3500, type: 'highpass' }); tone(1500, 0.07, { type: 'square', vol: 0.12 }); tone(2100, 0.1, { type: 'triangle', vol: 0.16, delay: 0.06 }); noise(0.03, { vol: 0.4, freq: 4200, type: 'highpass', delay: 0.06 }); },
    boop() { tone(300, 0.16, { vol: 0.16, to: 210 }); },
    pomf() { noise(0.22, { vol: 0.4, freq: 380 }); tone(170, 0.25, { vol: 0.28, to: 70 }); },
    teddy() { tone(330, 0.2, { vol: 0.18, to: 392, type: 'triangle' }); tone(392, 0.28, { vol: 0.18, to: 494, type: 'triangle', delay: 0.2 }); },
    duck() { tone(760, 0.11, { vol: 0.2, to: 1500, type: 'square' }); tone(1300, 0.16, { vol: 0.18, to: 700, type: 'square', delay: 0.12 }); },
    robot() { [660, 880, 520, 990].forEach((f, i) => tone(f, 0.09, { type: 'square', vol: 0.1, delay: i * 0.1 })); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.09 }); tone(f * 2, 0.4, { vol: 0.06, delay: i * 0.09 }); }); },
    fanfare() { [523, 523, 659, 784, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, i > 5 ? 0.9 : 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.16 }); tone(f / 2, 0.3, { type: 'sine', vol: 0.12, delay: i * 0.16 }); }); },
    splash() { noise(0.3, { vol: 0.25, freq: 1800, type: 'bandpass' }); },
  };

  function update(dt, rotorSpeed, speed01, winchMoving) {
    if (!ctx) return;
    const t = ctx.currentTime;
    rotorGain.gain.setTargetAtTime(0.05 + rotorSpeed * 0.2 + speed01 * 0.07, t, 0.1);
    lfo.frequency.setTargetAtTime(3 + rotorSpeed * 15 + speed01 * 3, t, 0.1);
    rotorFilter.frequency.setTargetAtTime(220 + rotorSpeed * 260 + speed01 * 240, t, 0.1);
    hum.frequency.setTargetAtTime(40 + rotorSpeed * 30 + speed01 * 10, t, 0.1);
    winchGain.gain.setTargetAtTime(winchMoving ? 0.045 : 0, t, 0.04);
    winchOsc.frequency.setTargetAtTime(winchMoving > 0 ? 150 : 215, t, 0.05);
    nextBird -= dt;
    if (nextBird < 0) {
      nextBird = 4 + Math.random() * 7;
      const base = 2400 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone(base, 0.09, { vol: 0.035, to: base * (1.2 + Math.random() * 0.3), delay: i * 0.13 });
    }
  }
  // go quiet the moment the app is backgrounded
  document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
  return { start, sfx, update };
}
