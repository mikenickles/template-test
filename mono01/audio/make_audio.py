#!/usr/bin/env python3
"""MONO-01 teaser — procedural stereo soundtrack (15.000 s, 48 kHz).

Everything is synthesised here; no samples. The same timing constants are
mirrored in src/film.js so picture and sound share one beat grid (120 BPM).

Outputs:
  <out_dir>/mono01-audio.wav      16-bit stereo master
  <src_dir>/audio-data.js         per-frame spectrum bands that drive the
                                  reactive waveform in the product reveal
"""
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(SR * DUR)
FPS = 60
BEAT = 0.5  # 120 BPM

rng = np.random.default_rng(101)
t_all = np.arange(N) / SR

# ---------------------------------------------------------------- buses
dry = np.zeros((2, N))   # goes straight to the master
rev = np.zeros((2, N))   # reverb send
music = np.zeros((2, N)) # groove bus, gated by the dial "volume" in beat 2
music_rev = np.zeros((2, N))


def pan_gains(pan):
    """Equal-power pan, -1 (L) .. +1 (R)."""
    a = (pan + 1) * math.pi / 4
    return math.cos(a), math.sin(a)


EVENTS = []  # start time of every placed sound; the QA pop detector checks transients against it


def place(bus, sig, t0, pan=0.0, gain=1.0):
    EVENTS.append(round(float(t0), 5))
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        sig = sig[-i0:]
        i0 = 0
    n = min(len(sig), N - i0)
    gl, gr = pan_gains(pan)
    bus[0, i0:i0 + n] += sig[:n] * gl * gain
    bus[1, i0:i0 + n] += sig[:n] * gr * gain


def tvec(d):
    return np.arange(int(d * SR)) / SR


def fade_edges(x, a=0.002, r=0.004):
    """Raised-cosine edges so no event can start or end on a discontinuity."""
    x = x.copy()
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    na, nr = min(na, len(x) // 2), min(nr, len(x) // 2)
    x[:na] *= 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, na))
    x[-nr:] *= 0.5 + 0.5 * np.cos(np.linspace(0, math.pi, nr))
    return x


def sos_filter(x, kind, freq, order=2):
    sos = signal.butter(order, freq, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def svf_sweep(x, f_curve, q=1.2, mode="bp"):
    """Chamberlin state-variable filter with a per-sample cutoff curve."""
    low = band = 0.0
    out = np.empty_like(x)
    f = 2 * np.sin(np.pi * np.minimum(f_curve, SR / 6.5) / SR)
    damp = 1.0 / q
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - damp * band
        band += f[i] * high
        out[i] = band if mode == "bp" else (low if mode == "lp" else high)
    return out


# ---------------------------------------------------------------- voices
def kick(f0=120.0, f1=46.0, drop=0.035, decay=0.22, d=0.5, click=0.25):
    t = tvec(d)
    f = f1 + (f0 - f1) * np.exp(-t / drop)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / decay)
    tick = sos_filter(rng.standard_normal(len(t)), "highpass", 3000) * np.exp(-t / 0.003) * click
    return fade_edges(np.tanh(1.4 * body) + tick, 0.0015, 0.03)


def tactile_click(bright=1.0):
    """The spec-cut 'switch' sound: transient + tonal blip + wooden thock."""
    t = tvec(0.14)
    transient = sos_filter(rng.standard_normal(len(t)), "highpass", 2200) * np.exp(-t / 0.0022)
    blip = np.sin(2 * np.pi * 1850 * t) * np.exp(-t / 0.012) * 0.55
    blip2 = np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.006) * 0.3
    thock = np.sin(2 * np.pi * (210 * np.exp(-t / 0.05) + 150) * t) * np.exp(-t / 0.03) * 0.9
    return fade_edges((transient * 0.9 + blip + blip2) * bright + thock, 0.0004, 0.02)


def tick(freq=2400.0, decay=0.006, d=0.05, noise=0.5):
    t = tvec(d)
    n = sos_filter(rng.standard_normal(len(t)), "highpass", 4000) * np.exp(-t / 0.0015) * noise
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t / decay)
    return fade_edges(n + s, 0.0004, 0.01)


def hat(decay=0.02, d=0.09):
    t = tvec(d)
    n = sos_filter(rng.standard_normal(len(t)), "highpass", 7000, order=4)
    return fade_edges(n * np.exp(-t / decay), 0.0005, 0.01)


def bell(freq, decay=0.9, d=2.2):
    t = tvec(d)
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-t / decay)
         + 0.35 * np.sin(2 * np.pi * freq * 2.005 * t) * np.exp(-t / (decay * 0.5))
         + 0.18 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t / (decay * 0.28)))
    return fade_edges(s, 0.004, 0.2)


def whoosh(d, f_start, f_end, q=1.4, shape="swell", curve=2.0):
    """Filtered-noise sweep. shape: 'swell' (rise then fall), 'rise', 'fall'."""
    n = int(d * SR)
    x = rng.standard_normal(n)
    p = np.linspace(0, 1, n)
    f_curve = f_start * (f_end / f_start) ** (p ** (1 / curve) if f_end > f_start else p ** curve)
    y = svf_sweep(x, f_curve, q=q)
    if shape == "swell":
        env = np.sin(np.pi * p) ** 1.6
    elif shape == "rise":
        env = p ** 2.4
        tail = int(0.012 * SR)
        env[-tail:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, tail))
    else:
        env = (1 - p) ** 2.2
        head = int(0.01 * SR)
        env[:head] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, head))
    return y * env


def pluck_bass(freq, d=0.42, decay=0.16, bright=900.0):
    t = tvec(d)
    ph = 2 * np.pi * freq * t
    saw = sum(np.sin(k * ph) / k for k in range(1, 9))
    y = svf_sweep(saw, bright * np.exp(-t / 0.07) + freq * 2.2, q=1.1, mode="lp")
    y = y * np.exp(-t / decay) + 0.7 * np.sin(ph) * np.exp(-t / (decay * 1.3))
    return fade_edges(y, 0.003, 0.04)


def pad_chord(freqs, d, attack=0.6, release=0.8, bright=1.0):
    """Warm detuned-sine pad, returned as a stereo pair."""
    t = tvec(d)
    out = np.zeros((2, len(t)))
    for k, f in enumerate(freqs):
        for det, pan in ((-0.0035, -0.6), (0.0, 0.0), (0.0035, 0.6)):
            ff = f * (1 + det)
            ph0 = rng.uniform(0, 2 * np.pi)
            lfo = 1 + 0.12 * np.sin(2 * np.pi * (0.31 + 0.07 * k) * t + ph0)
            s = (np.sin(2 * np.pi * ff * t + ph0)
                 + 0.32 * bright * np.sin(2 * np.pi * 2 * ff * t + ph0 * 1.7)
                 + 0.12 * bright * np.sin(2 * np.pi * 3 * ff * t + ph0 * 0.6)) * lfo
            gl, gr = pan_gains(pan)
            out[0] += s * gl
            out[1] += s * gr
    env = np.ones(len(t))
    na, nr = int(attack * SR), int(release * SR)
    env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    env[-nr:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nr))
    return out * env / (len(freqs) * 2.2)


def place_st(bus, st, t0, gain=1.0):
    EVENTS.append(round(float(t0), 5))
    i0 = int(round(t0 * SR))
    n = min(st.shape[1], N - i0)
    bus[:, i0:i0 + n] += st[:, :n] * gain


def spring(t, w, z):
    """Under-damped step response — identical to spring() in film.js."""
    t = np.maximum(t, 0)
    wd = w * math.sqrt(1 - z * z)
    return 1 - np.exp(-z * w * t) * (np.cos(wd * t) + (z * w / wd) * np.sin(wd * t))


# note table
A1, E1, D2, Fs2, A2, E2 = 55.0, 41.2, 73.42, 92.5, 110.0, 82.41
Cs3, D3, E3, Fs3, A3, B3 = 138.59, 146.83, 164.81, 185.0, 220.0, 246.94
Cs4, D4, E4, Fs4, A4 = 277.18, 293.66, 329.63, 369.99, 440.0

# ================================================================ BEAT 1 — hook (0.0–2.5)
place_st(dry, pad_chord([A2, E3, A3], 3.4, attack=1.1, release=0.9, bright=0.5), 0.0, 0.16)
place_st(rev, pad_chord([A2, E3, A3], 3.4, attack=1.1, release=0.9, bright=0.5), 0.0, 0.10)
# orange dot lands (0.09) -> bell ping, panned toward the dot (right of frame)
place(dry, bell(880.0, 0.7), 0.09, pan=0.22, gain=0.20)
place(rev, bell(880.0, 0.7), 0.09, pan=0.22, gain=0.22)
place(dry, tick(3200, 0.004, noise=0.35), 0.09, pan=0.22, gain=0.16)
# masked type rises: two soft air sweeps
place(dry, whoosh(0.55, 500, 3800, shape="swell"), 0.16, pan=-0.25, gain=0.085)
place(dry, whoosh(0.60, 420, 3200, shape="swell"), 0.50, pan=0.15, gain=0.095)
# phrase locks (1.25) -> second ring, fifth above
place(dry, bell(1318.5, 0.8), 1.25, pan=0.22, gain=0.15)
place(rev, bell(1318.5, 0.8), 1.25, pan=0.22, gain=0.20)
place(dry, kick(90, 50, 0.03, 0.16, 0.4, click=0.0), 1.25, gain=0.20)
# type exits + dot swoops toward the dial
place(dry, whoosh(0.50, 700, 5200, shape="rise", curve=1.6), 2.0, pan=0.2, gain=0.10)

# ================================================================ BEAT 2 — product (2.5–6.0)
# body rises on a spring: descending air + sub swell, lands on the 3.0 grid line
place(dry, whoosh(0.62, 2600, 240, q=1.0, shape="swell"), 2.46, gain=0.20)
tt = tvec(0.55)
sub_sw = np.sin(2 * np.pi * (38 + 26 * tt / 0.55) * tt) * np.sin(np.pi * tt / 0.55) ** 2
place(dry, sub_sw, 2.5, gain=0.16)
place(dry, kick(105, 44, 0.04, 0.26, 0.6, click=0.12), 3.0, gain=0.50)
place(rev, kick(105, 44, 0.04, 0.26, 0.6, click=0.12), 3.0, gain=0.10)
place(dry, tick(1500, 0.01, noise=0.6), 3.0, gain=0.14)
# grille perforations ripple in (3.05–3.5): fine granular shimmer
for k in range(14):
    place(dry, tick(5200 + 260 * k, 0.003, noise=0.25), 3.06 + k * 0.028, pan=-0.35 + 0.02 * k, gain=0.035)

# dial: spring(w=5, z=0.85) from 3.7 — same curve as the picture. 0..1 "volume"
DIAL_T0, DIAL_W, DIAL_Z = 3.7, 5.0, 0.85
vol_curve = spring(t_all - DIAL_T0, DIAL_W, DIAL_Z)
vol_curve[t_all < DIAL_T0] = 0
# detent clicks every 1/14 of the sweep
prev = 0.0
for i in range(int(DIAL_T0 * SR), int(5.6 * SR), 24):
    v = vol_curve[i]
    if math.floor(v * 14) > math.floor(prev * 14) and v < 0.995:
        place(dry, tick(2100 + 900 * v, 0.004, noise=0.4), i / SR, pan=0.3, gain=0.075)
    prev = max(prev, v)

# ================================================================ groove (3.0–10.5)
chords = {  # bar start -> (bass root, pad voicing)
    3.0: (A1, [A2, E3, A3, Cs4]),
    4.5: (A1, [A2, E3, B3, Cs4]),
    6.0: (A1, [A2, E3, A3, Cs4, E4]),
    7.5: (Fs2 / 2, [Fs3 / 2, Cs3, Fs3, A3, Cs4]),
    9.0: (D2, [D3 / 2, A2, D3, Fs3, A3]),
}
for bar, (root, voicing) in chords.items():
    g = 0.22 if bar >= 6.0 else 0.20
    pc = pad_chord(voicing, 1.9, attack=0.25, release=0.5, bright=0.9 if bar >= 6.0 else 0.6)
    place_st(music, pc, bar - 0.05, g)
    place_st(music_rev, pc, bar - 0.05, g * 0.5)
    for e in range(6):                       # 8th-note bass pluck
        tb = bar + e * 0.25
        if tb >= 10.5:
            break
        acc = 1.0 if e % 2 == 0 else 0.55
        f = root * (2 if (e == 5) else 1)
        place(music, pluck_bass(f * 2, bright=1100 if bar >= 6.0 else 700), tb, gain=0.20 * acc)

b = 3.5
while b < 10.5 - 1e-6:
    spec_cut = any(abs(b - c) < 1e-6 for c in (6.0, 7.5, 9.0))
    place(music, kick(), b, gain=0.50 if spec_cut else 0.40)
    b += BEAT
h = 4.0
i8 = 0
while h < 10.5 - 1e-6:
    off = (i8 % 2 == 1)
    place(music, hat(0.028 if off else 0.012), h, pan=0.25 if off else -0.2, gain=0.085 if off else 0.035)
    h += 0.25
    i8 += 1

# the dial is the fader: groove bus follows the volume spring until the first cut
gate = np.clip(0.16 + 0.84 * vol_curve, 0, 1.2)   # faintly audible before the dial turns it up
gate[t_all >= 6.0] = 1.0
gate[t_all < 3.0] = 0.0
music *= gate
music_rev *= gate

# ================================================================ BEAT 3 — spec cuts (6.0 / 7.5 / 9.0)
for k, cut in enumerate((6.0, 7.5, 9.0)):
    # wipe slams shut on the cut: short rising air, then the click
    place(dry, whoosh(0.24, 900, 6500, shape="rise", curve=1.4), cut - 0.24, pan=(-0.3, 0.0, 0.3)[k], gain=0.15)
    place(dry, tactile_click(), cut, gain=0.62)
    place(rev, tactile_click(), cut, gain=0.07)

# icon foley — each locked to the icon animation in film.js
for c in range(5):                                   # 40H: five cells charge
    place(dry, tick(1400 + 230 * c, 0.007, noise=0.3), 6.0 + 0.22 + c * 0.065, pan=-0.35, gain=0.10 if c < 4 else 0.15)
for c in range(3):                                   # lossless: three arcs bloom
    place(dry, bell((A4 * 2, Cs4 * 4, E4 * 4)[c], 0.16, 0.6), 7.5 + 0.10 + c * 0.075, pan=-0.35, gain=0.060)
    place(rev, bell((A4 * 2, Cs4 * 4, E4 * 4)[c], 0.16, 0.6), 7.5 + 0.10 + c * 0.075, pan=-0.35, gain=0.05)
tm = tvec(0.62)                                      # machined: spindle pass around the bore
pm = tm / 0.62
spin_f = 520 + 900 * np.sin(np.pi * pm) ** 1.3
spin = np.sin(2 * np.pi * np.cumsum(spin_f) / SR + 2.2 * np.sin(2 * np.pi * np.cumsum(spin_f * 2.01) / SR))
spin = sos_filter(spin, "bandpass", [700, 5200]) * np.sin(np.pi * pm) ** 1.5
place(dry, spin, 9.0 + 0.10, pan=-0.35, gain=0.040)
place(dry, tick(2800, 0.012, noise=0.5), 9.0 + 0.74, pan=-0.35, gain=0.10)

# ================================================================ BEAT 4 — finale (10.5–13.0)
place(dry, whoosh(0.34, 300, 7000, q=1.1, shape="rise", curve=1.3), 10.5 - 0.34, gain=0.22)
# warm bass pulse
tb_ = tvec(2.0)
f_b = E1 + (E2 * 1.25 - E1) * np.exp(-tb_ / 0.06)
ph_b = 2 * np.pi * np.cumsum(f_b) / SR
bass_pulse = np.tanh(1.8 * (np.sin(ph_b) + 0.28 * np.sin(2 * ph_b) + 0.08 * np.sin(3 * ph_b))) * np.exp(-tb_ / 0.62)
bass_pulse = fade_edges(sos_filter(bass_pulse, "lowpass", 900), 0.002, 0.3)
place(dry, bass_pulse, 10.5, gain=0.85)
impact = sos_filter(rng.standard_normal(int(0.5 * SR)), "lowpass", 1400) * np.exp(-tvec(0.5) / 0.07)
place(dry, fade_edges(impact, 0.001, 0.05), 10.5, gain=0.30)
place(rev, fade_edges(impact, 0.001, 0.05), 10.5, gain=0.22)
place(dry, tactile_click(0.7), 10.5, gain=0.40)
pc = pad_chord([E2, B3 / 2, E3, B3 / 2 * 1.5, E4 * 0.75 * 4 / 3], 2.05, attack=0.2, release=0.03, bright=1.2)
swell = np.linspace(0.35, 1.0, pc.shape[1]) ** 1.5
place_st(dry, pc * swell, 10.5, 0.30)
place_st(rev, pc * swell, 10.5, 0.14)

# accelerating pulse grid — identical list in film.js (FINALE_HITS)
hits = [10.75, 11.0, 11.25, 11.5, 11.625, 11.75, 11.875] + [12.0 + i * 0.0625 for i in range(8)]
for i, th in enumerate(hits):
    p = (th - 10.5) / 2.0
    place(dry, kick(130 + 60 * p, 52, 0.028, 0.10 + 0.05 * (1 - p), 0.3, click=0.2 + 0.3 * p), th, gain=0.26 + 0.20 * p)
    stab_t = tvec(0.11)
    stab = sum(np.sin(2 * np.pi * E3 * k * (1 + 0.5 * p) * stab_t) / k for k in (1, 2, 3, 4)) * np.exp(-stab_t / 0.03)
    place(dry, fade_edges(stab, 0.001, 0.02), th, pan=(-0.5 if i % 2 else 0.5), gain=0.05 + 0.07 * p)
    place(dry, hat(0.012), th, pan=(0.5 if i % 2 else -0.5), gain=0.03 + 0.07 * p)
# riser: noise + glide, hard-stops at the snap (12.5)
n_r = int(2.0 * SR)
p_r = np.linspace(0, 1, n_r)
riser = svf_sweep(rng.standard_normal(n_r), 350 * (9000 / 350) ** (p_r ** 1.5), q=2.0) * p_r ** 2.2
glide = np.sin(2 * np.pi * np.cumsum(E3 * 2 ** (2 * p_r ** 1.7)) / SR) * p_r ** 2.5
stop = int(0.012 * SR)
cut_env = np.ones(n_r)
cut_env[-stop:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, stop))
place(dry, riser * cut_env, 10.5, pan=-0.15, gain=0.20)
place(dry, glide * cut_env, 10.5, pan=0.15, gain=0.07)
place(rev, glide * cut_env, 10.5, gain=0.05)
# the snap itself: bars collapse to a line
place(dry, tick(1700, 0.02, d=0.12, noise=0.9), 12.5, gain=0.26)
place(rev, tick(1700, 0.02, d=0.12, noise=0.9), 12.5, gain=0.20)
# line condenses into the hyphen: quiet inward suction into 13.0
place(dry, whoosh(0.40, 5200, 500, q=1.6, shape="rise", curve=1.0), 12.58, gain=0.085)

# ================================================================ BEAT 5 — end card (13.0–15.0)
place(dry, tactile_click(), 13.0, gain=0.55)
place(rev, tactile_click(), 13.0, gain=0.10)
place(dry, kick(95, 55, 0.04, 0.42, 0.9, click=0.0), 13.0, gain=0.50)
end_pad = pad_chord([A2, E3, A3, Cs4, E4, B3 * 2], 2.05, attack=0.012, release=0.9, bright=1.0)
decay_env = np.exp(-tvec(2.05) / 1.25)
place_st(dry, end_pad * decay_env, 13.0, 0.42)
place_st(rev, end_pad * decay_env, 13.0, 0.30)
place(dry, whoosh(0.5, 3500, 600, q=0.9, shape="fall"), 13.0, gain=0.07)   # letters unfold
place(dry, bell(Cs4 * 4, 0.5, 1.4), 13.55, gain=0.055)                      # subtitle settles
place(rev, bell(Cs4 * 4, 0.5, 1.4), 13.55, gain=0.09)

# ================================================================ reverb + master
def reverb(send, rt60=1.7, seed=7):
    r = np.random.default_rng(seed)
    n = int(rt60 * 1.3 * SR)
    tt_ = np.arange(n) / SR
    out = np.zeros_like(send)
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-6.91 * tt_ / rt60)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))   # pre-delay ramp
        ir = sos_filter(sos_filter(ir, "lowpass", 5200), "highpass", 260)
        ir /= np.sqrt(np.sum(ir ** 2))
        out[ch] = signal.fftconvolve(send[ch], ir)[:N]
    return out


mix = dry + music + reverb(rev + music_rev) * 0.9
# the snap: duck everything except the tails for the half-second of "vacuum"
duck = np.ones(N)
i0, i1 = int(12.5 * SR), int(13.0 * SR)
ramp = int(0.015 * SR)
duck[i0:i0 + ramp] = np.linspace(1, 0.55, ramp)
duck[i0 + ramp:i1] = 0.55
duck[i1 - 48:i1] = np.linspace(0.55, 1, 48)
mix *= duck

mix = np.stack([sos_filter(ch, "highpass", 24) for ch in mix])
# gentle bus glue, then normalise to a fixed sample-peak ceiling
mix = np.tanh(mix * 1.25) / 1.25
# master fades: 15 ms in, 0.85 s raised-cosine out landing on exact zero at 15.0
fi = int(0.015 * SR)
mix[:, :fi] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fi))
fo = int(0.85 * SR)
mix[:, -fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
mix[:, -1] = 0.0
CEIL_DB = -2.0
mix *= 10 ** (CEIL_DB / 20) / np.max(np.abs(mix))

out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("build")
src_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("src")
out_dir.mkdir(parents=True, exist_ok=True)
pcm = np.round(mix.T * 32767).astype("<i2")
with wave.open(str(out_dir / "mono01-audio.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

# ---------------------------------------------------------------- analysis for the picture
mono = mix.mean(axis=0)
NB, WIN = 24, 2048
edges = np.geomspace(55, 9000, NB + 1)
freqs = np.fft.rfftfreq(WIN, 1 / SR)
win = np.hanning(WIN)
bands = np.zeros((int(DUR * FPS), NB))
for fr in range(bands.shape[0]):
    c = int(fr / FPS * SR)
    seg = mono[max(0, c - WIN // 2): c + WIN // 2]
    seg = np.pad(seg, (0, WIN - len(seg)))
    mag = np.abs(np.fft.rfft(seg * win)) / (WIN / 4)
    for k in range(NB):
        sel = (freqs >= edges[k]) & (freqs < edges[k + 1])
        bands[fr, k] = np.sqrt(np.mean(mag[sel] ** 2)) if sel.any() else 0
db = 20 * np.log10(bands + 1e-6)
norm = np.clip((db + 62) / 44, 0, 1)                      # -62 dB .. -18 dB -> 0..1
tilt = np.linspace(0.85, 1.25, NB)                        # lift the quieter top bands
norm = np.clip(norm * tilt, 0, 1)
sm = np.zeros_like(norm)                                  # fast attack, eased release
for fr in range(1, norm.shape[0]):
    up = norm[fr] > sm[fr - 1]
    sm[fr] = np.where(up, sm[fr - 1] + (norm[fr] - sm[fr - 1]) * 0.6, sm[fr - 1] + (norm[fr] - sm[fr - 1]) * 0.16)
(src_dir / "audio-data.js").write_text(
    "// generated by audio/make_audio.py — do not edit\n"
    "window.AUDIO_BANDS = " + json.dumps([[round(float(v), 3) for v in row] for row in sm]) + ";\n")

(out_dir / "audio-events.json").write_text(json.dumps(sorted(set(EVENTS + [12.5, 13.0]))))

peak = 20 * np.log10(np.max(np.abs(mix)))
rms = 20 * np.log10(np.sqrt(np.mean(mix ** 2)))
print(f"wrote {out_dir / 'mono01-audio.wav'}  samples={N}  peak={peak:.2f} dBFS  rms={rms:.2f} dBFS")
