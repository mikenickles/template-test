// All sound is synthesised on the device: nothing to download, works offline.
// Same tone/noise toolkit as Backyard Air Rescue; the rotor became a soft engine hum.
export function makeAudio() {
  let ctx = null, master = null, engGain = null, engFilter = null, hum = null, winchOsc = null, winchGain = null, noiseBuf = null;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engines: filtered noise + a low hum that rises with thrust
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 260; engFilter.Q.value = 0.6;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    src.connect(engFilter); engFilter.connect(engGain); engGain.connect(master);
    hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 55;
    const humGain = ctx.createGain(); humGain.gain.value = 0.3; hum.connect(humGain); humGain.connect(engGain);
    src.start(); hum.start();
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
    letgo() { tone(520, 0.14, { type: 'triangle', vol: 0.12, to: 400 }); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.09 }); tone(f * 2, 0.4, { vol: 0.06, delay: i * 0.09 }); }); },
    fanfare() { [523, 523, 659, 784, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, i > 5 ? 0.9 : 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.16 }); tone(f / 2, 0.3, { type: 'sine', vol: 0.12, delay: i * 0.16 }); }); },
    stow() { tone(240, 0.12, { type: 'sine', vol: 0.22, to: 120 }); [1319, 1760, 2093].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: 0.08 + i * 0.07 })); },
    pop() { tone(600, 0.1, { type: 'sine', vol: 0.2, to: 1300 }); },
    hiss() { noise(0.5, { vol: 0.16, freq: 3000, type: 'highpass' }); tone(220, 0.3, { vol: 0.12, to: 330, delay: 0.1 }); },
    dock() { noise(0.3, { vol: 0.14, freq: 2600, type: 'highpass' }); tone(170, 0.25, { vol: 0.25, to: 90, delay: 0.15 }); },
    puff() { noise(0.09, { vol: 0.05, freq: 2200, type: 'bandpass' }); },
    panel() { tone(440, 0.1, { type: 'triangle', vol: 0.12 }); tone(660, 0.14, { type: 'triangle', vol: 0.12, delay: 0.08 }); },
  };

  function update(dt, thrust, speed01, winchMoving) {
    if (!ctx) return;
    const t = ctx.currentTime;
    engGain.gain.setTargetAtTime(0.035 + thrust * 0.11 + speed01 * 0.04, t, 0.12);
    engFilter.frequency.setTargetAtTime(180 + thrust * 420 + speed01 * 160, t, 0.12);
    hum.frequency.setTargetAtTime(48 + thrust * 26 + speed01 * 10, t, 0.12);
    winchGain.gain.setTargetAtTime(winchMoving ? 0.045 : 0, t, 0.04);
    winchOsc.frequency.setTargetAtTime(winchMoving > 0 ? 150 : 215, t, 0.05);
  }
  // go quiet the moment the app is backgrounded
  document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
  return { start, sfx, update };
}
