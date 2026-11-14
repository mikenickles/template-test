// Lyra's sounds (0.46): a few soft, original notes, made on the spot with the Web Audio
// API (no sound files). Off unless you turn them on in Settings → You → Feel (this device only).
//   send    a small rising pop when your message goes
//   reply   two warm notes when Lyra's answer lands
//   done    three quick notes when something gets done (a task ticked, a card approved)
//   notice  a gentle bell when Lyra speaks first (a heads-up, a reminder) while the app is open
const KEY = "lyra.sounds";

export function soundsOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSounds(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: stays off */
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft note: a sine with a quiet octave above it, a quick attack and a long, even fade. */
function note(c: AudioContext, o: { freq: number; to?: number; at: number; length: number; gain: number; shimmer?: number }): void {
  const t = c.currentTime + o.at;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(o.gain, t + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t + o.length);
  out.connect(c.destination);
  const voice = (mult: number, level: number) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(o.freq * mult, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * mult, t + o.length * 0.6);
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + o.length + 0.05);
  };
  voice(1, 1);
  if (o.shimmer) voice(2, o.shimmer);
}

const play = (notes: Parameters<typeof note>[1][], force = false) => {
  if (!force && !soundsOn()) return;
  if (!force && document.visibilityState !== "visible") return;
  const c = audio();
  if (c) for (const n of notes) note(c, n);
};

// E major pentatonic, so any two of Lyra's sounds sit well together
const E5 = 659.26;
const GS5 = 830.61;
const B5 = 987.77;
const CS6 = 1108.73;
const E6 = 1318.51;

export const sound = {
  send: (force = false) => play([{ freq: 520, to: 780, at: 0, length: 0.11, gain: 0.05 }], force),
  reply: (force = false) =>
    play(
      [
        { freq: E5, at: 0, length: 0.32, gain: 0.05, shimmer: 0.18 },
        { freq: B5, at: 0.09, length: 0.42, gain: 0.045, shimmer: 0.18 },
      ],
      force,
    ),
  done: (force = false) =>
    play(
      [
        { freq: E5, at: 0, length: 0.2, gain: 0.045, shimmer: 0.15 },
        { freq: GS5, at: 0.07, length: 0.22, gain: 0.045, shimmer: 0.15 },
        { freq: CS6, at: 0.14, length: 0.4, gain: 0.045, shimmer: 0.15 },
      ],
      force,
    ),
  notice: (force = false) =>
    play(
      [
        { freq: B5, at: 0, length: 0.9, gain: 0.04, shimmer: 0.3 },
        { freq: E6, at: 0.16, length: 1.1, gain: 0.03, shimmer: 0.25 },
      ],
      force,
    ),
};
