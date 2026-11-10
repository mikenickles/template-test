#!/usr/bin/env python3
"""Breach Line procedural sound-effect generator.

Every sound is synthesised from scratch (noise, oscillators, modal resonators,
synthetic reverb impulse responses) with fixed per-file random seeds, so the
output is fully deterministic and contains no recorded or downloaded material.

Usage (from the breach-line/ project directory):
    python3 tools/sfxgen.py                 # generate everything
    python3 tools/sfxgen.py --only 'weapons/*shot*'   # glob filter on cat/name
    python3 tools/sfxgen.py --list          # print the output list

Requirements: Python 3, numpy 2.x, scipy (pip install scipy).
Output: 16-bit PCM, mono, 44100 Hz WAV under assets/audio/<category>/<name>.wav

Output files (assets/audio/...):
    weapons/p9_shot_1.wav                    9mm service pistol: sharp crack, moderate body, short tail
    weapons/p9_shot_2.wav                    9mm service pistol: sharp crack, moderate body, short tail
    weapons/p9_shot_3.wav                    9mm service pistol: sharp crack, moderate body, short tail
    weapons/hand_cannon_shot_1.wav           .50 hand cannon: big boom, strong low thump, long tail
    weapons/hand_cannon_shot_2.wav           .50 hand cannon: big boom, strong low thump, long tail
    weapons/vx9_shot_1.wav                   compact SMG: tight and snappy, core < 250 ms, quiet tail
    weapons/vx9_shot_2.wav                   compact SMG: tight and snappy, core < 250 ms, quiet tail
    weapons/vx9_shot_3.wav                   compact SMG: tight and snappy, core < 250 ms, quiet tail
    weapons/breacher12_shot_1.wav            pump shotgun: wide boomy blast, chunky low end
    weapons/breacher12_shot_2.wav            pump shotgun: wide boomy blast, chunky low end
    weapons/ravager_shot_1.wav               7.62 assault rifle: aggressive mid-heavy crack, punchy
    weapons/ravager_shot_2.wav               7.62 assault rifle: aggressive mid-heavy crack, punchy
    weapons/ravager_shot_3.wav               7.62 assault rifle: aggressive mid-heavy crack, punchy
    weapons/sentinel_shot_1.wav              5.56 carbine: tighter/brighter, less bass than ravager
    weapons/sentinel_shot_2.wav              5.56 carbine: tighter/brighter, less bass than ravager
    weapons/sentinel_shot_3.wav              5.56 carbine: tighter/brighter, less bass than ravager
    weapons/longbow_shot_1.wav               bolt-action sniper: massive crack + ~1.5 s rolling echo
    weapons/longbow_shot_2.wav               bolt-action sniper: massive crack + ~1.5 s rolling echo
    weapons/dry_fire.wav                     empty trigger click
    weapons/mag_out.wav                      rifle magazine release + pull-out
    weapons/mag_in.wav                       rifle magazine insert + seat
    weapons/pistol_mag_out.wav               pistol magazine release (lighter)
    weapons/pistol_mag_in.wav                pistol magazine insert (lighter)
    weapons/bolt_charge.wav                  charging handle pulled and released (two clacks)
    weapons/slide_release.wav                pistol slide snapping forward
    weapons/pump_action.wav                  shotgun pump back-and-forward
    weapons/shell_insert.wav                 single shell pushed into tube
    weapons/bolt_cycle.wav                   sniper bolt up, back, forward, down
    weapons/weapon_draw.wav                  cloth rustle + metal rattle (generic deploy)
    weapons/knife_draw.wav                   short metallic shing
    weapons/knife_swing_1.wav                knife air swish
    weapons/knife_swing_2.wav                knife air swish
    weapons/knife_hit_flesh.wav              knife stab into body
    weapons/knife_hit_wall.wav               knife on concrete/metal
    weapons/shell_casing_1.wav               brass casing bouncing on concrete
    weapons/shell_casing_2.wav               brass casing bouncing on concrete
    weapons/shell_casing_3.wav               brass casing bouncing on concrete
    weapons/bullet_whiz_1.wav                supersonic near-miss crack + doppler whiz
    weapons/bullet_whiz_2.wav                supersonic near-miss crack + doppler whiz
    weapons/bullet_whiz_3.wav                supersonic near-miss crack + doppler whiz
    impacts/concrete_1.wav                   bullet into concrete: crack + chips + dust
    impacts/concrete_2.wav                   bullet into concrete: crack + chips + dust
    impacts/concrete_3.wav                   bullet into concrete: crack + chips + dust
    impacts/concrete_4.wav                   bullet into concrete: crack + chips + dust
    impacts/metal_1.wav                      bullet into metal (2 and 4 include a ricochet)
    impacts/metal_2.wav                      bullet into metal (2 and 4 include a ricochet)
    impacts/metal_3.wav                      bullet into metal (2 and 4 include a ricochet)
    impacts/metal_4.wav                      bullet into metal (2 and 4 include a ricochet)
    impacts/wood_1.wav                       bullet into wood: knock + splinters
    impacts/wood_2.wav                       bullet into wood: knock + splinters
    impacts/wood_3.wav                       bullet into wood: knock + splinters
    impacts/flesh_1.wav                      dull wet body thud
    impacts/flesh_2.wav                      dull wet body thud
    impacts/flesh_3.wav                      dull wet body thud
    impacts/dirt_1.wav                       bullet into dirt: thud + spray
    impacts/dirt_2.wav                       bullet into dirt: thud + spray
    impacts/dirt_3.wav                       bullet into dirt: thud + spray
    impacts/glass_1.wav                      glass hit + shatter
    impacts/glass_2.wav                      glass hit + shatter
    impacts/helmet_ping.wav                  bright metallic helmet ping
    footsteps/concrete_1.wav                 heel-toe on concrete
    footsteps/concrete_2.wav                 heel-toe on concrete
    footsteps/concrete_3.wav                 heel-toe on concrete
    footsteps/concrete_4.wav                 heel-toe on concrete
    footsteps/metal_1.wav                    resonant catwalk clang
    footsteps/metal_2.wav                    resonant catwalk clang
    footsteps/metal_3.wav                    resonant catwalk clang
    footsteps/metal_4.wav                    resonant catwalk clang
    footsteps/gravel_1.wav                   gravel crunch
    footsteps/gravel_2.wav                   gravel crunch
    footsteps/gravel_3.wav                   gravel crunch
    footsteps/gravel_4.wav                   gravel crunch
    footsteps/wood_1.wav                     wooden floor (3 has a creak)
    footsteps/wood_2.wav                     wooden floor (3 has a creak)
    footsteps/wood_3.wav                     wooden floor (3 has a creak)
    footsteps/wood_4.wav                     wooden floor (3 has a creak)
    footsteps/land_hard_1.wav                heavy landing thud + gear
    footsteps/land_hard_2.wav                heavy landing thud + gear
    footsteps/jump.wav                       soft cloth/shoe scuff
    player/hurt_1.wav                        body impact thud with cloth (no voice)
    player/hurt_2.wav                        body impact thud with cloth (no voice)
    player/hurt_3.wav                        body impact thud with cloth (no voice)
    player/death_thud.wav                    body falling + weapon clatter
    player/armor_hit_1.wav                   kevlar thump
    player/armor_hit_2.wav                   kevlar thump
    player/heartbeat.wav                     low-health heartbeat, exactly 1.0 s, loops seamlessly
    bomb/bomb_beep.wav                       2.5 kHz 80 ms beep
    bomb/bomb_keypress.wav                   keypad button press beep
    bomb/bomb_planted.wav                    confirmation tone sequence
    bomb/defuse_start.wav                    case open + tools rattle
    bomb/defuse_wire.wav                     wire snip
    bomb/bomb_defused.wav                    descending power-down tones
    bomb/explosion.wav                       huge layered explosion (~3.6 s)
    bomb/explosion_distant.wav               filtered, distant version
    grenades/grenade_bounce_1.wav            grenade hitting the floor (1: bounces, 2: bounce + roll)
    grenades/grenade_bounce_2.wav            grenade hitting the floor (1: bounces, 2: bounce + roll)
    grenades/grenade_pin.wav                 pin pull
    grenades/smoke_hiss.wav                  2.5 s seamless smoke hiss loop
    grenades/flash_bang.wav                  sharp bang + high ring
    grenades/he_explosion.wav                frag grenade explosion (smaller than bomb)
    ui/click.wav                             menu click
    ui/hover.wav                             very soft hover tick
    ui/buy_confirm.wav                       positive purchase chirp
    ui/buy_deny.wav                          low buzz
    ui/money_ping.wav                        money ping
    ui/round_start.wav                       tense synth stinger (~1.6 s)
    ui/round_win.wav                         uplifting stinger
    ui/round_lose.wav                        somber stinger
    ui/match_win.wav                         longer triumphant stinger
    ui/match_lose.wav                        longer somber stinger
    ui/kill_ping.wav                         subtle kill confirmation tick
    ui/hitmarker.wav                         very short hit tick
    ambience/industrial_loop.wav             24 s seamless industrial bed
    ambience/wind_loop.wav                   12 s seamless gentle wind
"""

import argparse
import fnmatch
import os
import sys
import time
import wave
import zlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np

try:
    from scipy import signal as sps
except ImportError:  # pragma: no cover
    sys.exit("sfxgen.py needs scipy for filtering:  pip install scipy")

SR = 44100
SEED_BASE = 0xB7EAC4
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "audio")


# ----------------------------------------------------------------------------
# Basic helpers
# ----------------------------------------------------------------------------

def n_of(sec):
    return max(1, int(round(sec * SR)))


def tline(n):
    return np.arange(n) / SR


def norm(x, peak=1.0):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 0 else x


DEBUG = bool(os.environ.get("SFX_DEBUG"))


def end_fade(x, sec=0.003):
    """Raised-cosine fade over the last `sec` (never more than a third of x)."""
    k = min(n_of(sec), len(x) // 3)
    if k > 1:
        x = x.copy()
        x[-k:] *= np.cos(0.5 * np.pi * np.arange(1, k + 1) / k) ** 2
    return x


def soft_end(src, where="?"):
    """If a layer stops while still audible (> -60 dB re. its peak) fade its last 5 ms."""
    if len(src) < 8:
        return src
    pk = np.max(np.abs(src)) + 1e-12
    tail = np.max(np.abs(src[-max(2, n_of(0.001)):]))
    if tail / pk > 1e-3:
        if DEBUG:
            print(f"  [soft_end] layer ended at {20 * np.log10(tail / pk):.0f} dB re. peak ({where})")
        return end_fade(src, 0.005)
    return src


def place(dst, src, at, gain=1.0):
    """Add src into dst starting at time `at` (seconds).

    If src does not fit it is cut with a short fade (never a hard step, which
    would click); with SFX_DEBUG=1 audible truncations are reported."""
    i = int(round(at * SR))
    if i >= len(dst) or i < 0:
        return dst
    if DEBUG:
        import traceback
        fr = traceback.extract_stack(limit=2)[0]
        src = soft_end(src, f"{fr.name}:{fr.lineno}")
    else:
        src = soft_end(src)
    m = min(len(src), len(dst) - i)
    seg = src[:m]
    if m < len(src):
        pk = np.max(np.abs(src)) + 1e-12
        if DEBUG and np.max(np.abs(src[m:])) / pk > 10 ** (-50 / 20):
            import traceback
            caller = traceback.extract_stack(limit=2)[0]
            print(f"  [place] truncated {len(src) - m} samples at {caller.name}:{caller.lineno} "
                  f"(residual {20 * np.log10(np.max(np.abs(src[m:])) / pk):.0f} dB)")
        seg = end_fade(seg, 0.004)
    dst[i:i + m] += gain * seg
    return dst


def add_circ(dst, src, at, gain=1.0):
    """Add src into dst circularly (wraps around the end) - used for loops."""
    i = int(round(at * SR)) % len(dst)
    idx = (i + np.arange(len(src))) % len(dst)
    dst[idx] += gain * src
    return dst


def pad_to(x, n):
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def mixsum(*arrays):
    n = max(len(a) for a in arrays)
    out = np.zeros(n)
    for a in arrays:
        out[:len(a)] += soft_end(a, "mixsum")
    return out


def loguni(rng, lo, hi):
    return float(np.exp(rng.uniform(np.log(lo), np.log(hi))))


def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


# ----------------------------------------------------------------------------
# Filters
# ----------------------------------------------------------------------------

def _sos(kind, fc, order):
    nyq = SR / 2.0
    if kind in ("lowpass", "highpass"):
        wn = float(np.clip(fc / nyq, 1e-4, 0.995))
    else:
        lo = float(np.clip(fc[0] / nyq, 1e-4, 0.98))
        hi = float(np.clip(fc[1] / nyq, lo + 1e-3, 0.995))
        wn = [lo, hi]
    return sps.butter(order, wn, btype=kind, output="sos")


def lp(x, fc, order=2):
    return sps.sosfilt(_sos("lowpass", fc, order), x)


def hp(x, fc, order=2):
    return sps.sosfilt(_sos("highpass", fc, order), x)


def bp(x, lo, hi, order=2):
    return sps.sosfilt(_sos("bandpass", (lo, hi), order), x)


def band(x, lo=None, hi=None, order=2):
    if lo and hi:
        return bp(x, lo, hi, order)
    if lo:
        return hp(x, lo, order)
    if hi:
        return lp(x, hi, order)
    return x


def biquad(x, kind, f0, q=0.707, gain_db=0.0):
    """RBJ cookbook biquads: 'peak', 'bp' (0 dB peak), 'lowshelf', 'highshelf'."""
    A = 10.0 ** (gain_db / 40.0)
    w = 2 * np.pi * min(f0, 0.45 * SR) / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "bp":
        b = [al, 0.0, -al]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind in ("lowshelf", "highshelf"):
        sA = 2 * np.sqrt(A) * al
        if kind == "lowshelf":
            b = [A * ((A + 1) - (A - 1) * cw + sA), 2 * A * ((A - 1) - (A + 1) * cw),
                 A * ((A + 1) - (A - 1) * cw - sA)]
            a = [(A + 1) + (A - 1) * cw + sA, -2 * ((A - 1) + (A + 1) * cw),
                 (A + 1) + (A - 1) * cw - sA]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + sA), -2 * A * ((A - 1) + (A + 1) * cw),
                 A * ((A + 1) + (A - 1) * cw - sA)]
            a = [(A + 1) - (A - 1) * cw + sA, 2 * ((A - 1) - (A + 1) * cw),
                 (A + 1) - (A - 1) * cw - sA]
    else:
        raise ValueError(kind)
    b = np.asarray(b) / a[0]
    a = np.asarray(a) / a[0]
    return sps.lfilter(b, a, x)


def peq(x, f0, gain_db, q=1.0):
    return biquad(x, "peak", f0, q, gain_db)


def svf(x, fc, q=0.707):
    """Time-varying TPT state-variable filter. Returns (lowpass, bandpass, highpass).

    fc may be a per-sample array, which makes it ideal for sweeps (swishes,
    doppler whizzes, risers). Pure-python inner loop: use on short signals.
    """
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 20.0, 0.45 * SR) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    lo_out = [0.0] * n
    bp_out = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        bp_out[i] = v1
        lo_out[i] = v2
    lo_a = np.asarray(lo_out)
    bp_a = np.asarray(bp_out)
    return lo_a, bp_a, x - k * bp_a - lo_a


# ----------------------------------------------------------------------------
# Envelopes and sources
# ----------------------------------------------------------------------------

def env_exp(n, decay, attack=0.0005):
    """Smooth (sin^2) attack followed by exponential decay with time-constant `decay`."""
    t = tline(n)
    e = np.exp(-t / max(decay, 1e-5))
    if attack > 0:
        a = np.clip(t / attack, 0.0, 1.0)
        e = e * np.sin(0.5 * np.pi * a) ** 2
    return e


def env_pts(n, pts):
    """Piecewise-linear envelope from [(time, value), ...]."""
    ts, vs = zip(*pts)
    return np.interp(tline(n), ts, vs)


def nburst(rng, dur, decay, attack=0.0003, lo=None, hi=None, order=2):
    """Filtered noise burst; length is at least long enough to decay by 60 dB."""
    n = n_of(max(dur, 7.0 * decay + attack + 0.003))
    return end_fade(band(rng.standard_normal(n) * env_exp(n, decay, attack), lo, hi, order))


def thump(dur, f0, f1, ptau, decay, attack=0.0008):
    """Sine whose pitch glides exponentially from f0 to f1 (kick / body thump).
    Length is at least long enough to decay by 60 dB."""
    n = n_of(max(dur, 7.0 * decay + attack + 0.003))
    t = tline(n)
    f = f1 + (f0 - f1) * np.exp(-t / ptau)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return end_fade(np.sin(ph) * env_exp(n, decay, attack))


def nwave(dur, lpf=13000.0):
    """Supersonic N-wave (shock front): instant rise, linear fall, instant return."""
    L = max(3, n_of(dur))
    w = np.zeros(L + 200)
    w[:L] = np.linspace(1.0, -1.0, L)
    return lp(w, lpf, 2)


def contact(n, hard):
    """Half-sine contact force pulse; shorter = harder = brighter excitation."""
    m = max(2, n_of(hard))
    e = np.zeros(n)
    e[:min(m, n)] = np.sin(np.pi * (np.arange(min(m, n)) + 0.5) / m)
    return e


def resonate(exc, freqs, t60s, gains):
    """Modal synthesis: bank of 2-pole resonators driven by `exc`."""
    out = np.zeros(len(exc))
    for f, t60, g in zip(freqs, t60s, gains):
        if f <= 20 or f >= 0.45 * SR:
            continue
        r = 10.0 ** (-3.0 / (max(t60, 1e-3) * SR))
        w = 2 * np.pi * f / SR
        out += sps.lfilter([g * np.sin(w)], [1.0, -2 * r * np.cos(w), r * r], exc)
    return out


# Inharmonic mode-ratio tables
PLATE = [1.0, 1.594, 2.136, 2.296, 2.653, 3.156, 3.501, 4.15, 4.62, 5.40, 6.20, 7.13]
BEAM = [1.0, 2.756, 5.404, 8.933, 13.34]
TUBE = [1.0, 1.73, 2.32, 3.18, 4.25, 5.12, 6.63]
BELL = [1.0, 2.0, 2.76, 3.0, 4.07, 5.40, 6.27]
WOOD = [1.0, 1.93, 2.81, 4.12, 5.66]


def strike(rng, dur, base, ratios, t60, slope=0.6, hard=0.0003, jitter=0.025,
           gain_tilt=0.5, nm=None, t60_spread=0.3):
    """Modal strike: contact pulse into inharmonic resonators. Returns peak-1."""
    n = n_of(max(dur, 1.35 * t60 + 0.01))      # long enough for the slowest mode to ring out
    r = np.asarray(ratios[:nm] if nm else ratios, dtype=float)
    r = r * (1 + jitter * rng.standard_normal(len(r)))
    freqs = base * r
    t60s = t60 * r ** (-slope) * rng.uniform(1 - t60_spread, 1 + t60_spread, len(r))
    gains = rng.uniform(0.35, 1.0, len(r)) * r ** (-gain_tilt)
    return end_fade(norm(resonate(contact(n, hard), freqs, t60s, gains)), 0.01)


def m_click(rng, base, t60=0.025, hard=0.00018, noise=0.5, ratios=PLATE, nm=8, dur=None):
    """Small metallic click/clack: modal ring + raw contact transient."""
    dur = dur or min(0.4, t60 * 3.0 + 0.012)
    n = n_of(dur)
    y = strike(rng, dur, base, ratios, t60, hard=hard, nm=nm)
    tr = hp(rng.standard_normal(n) * env_exp(n, hard * 2.5 + 0.0003, 0.00004), base * 0.6, 2)
    return norm(y + noise * norm(tr))


def p_click(rng, base=1300, t60=0.008, hard=0.0005, noise=0.9, dur=0.05):
    """Polymer click: few heavily damped modes + more noise, darker."""
    y = m_click(rng, base, t60, hard, noise, ratios=[1.0, 1.71, 2.43, 3.3], nm=4, dur=dur)
    return norm(lp(y, 6500, 2))


def clunk(rng, f=220, decay=0.022, dur=0.12, lpf=1600, noise=0.6):
    """Dull low 'clunk' (body hitting body)."""
    n = n_of(dur)
    body = thump(dur, f * 1.7, f, 0.004, decay, attack=0.0004)
    nz = lp(rng.standard_normal(n) * env_exp(n, decay * 0.6, 0.0003), lpf, 2)
    return norm(mixsum(norm(body), noise * norm(nz)))


def friction(rng, dur, lo=700, hi=5000, peak_at=0.5, rough=0.8, grit=0.25, rough_hz=90):
    """Sliding friction noise (magazine sliding, slide rails, scrapes)."""
    n = n_of(dur)
    u = tline(n) / dur
    e = np.where(u < peak_at, u / peak_at, (1 - u) / (1 - peak_at)).clip(0, 1)
    e = np.sin(0.5 * np.pi * e) ** 2
    am = np.clip(1 + rough * norm(lp(rng.standard_normal(n), rough_hz, 2)), 0, None)
    x = norm(bp(rng.standard_normal(n) * am * e, lo, hi, 2))
    if grit:
        g = grain_cloud(rng, dur, max(3, int(dur * 120)), hi * 0.8, min(hi * 2.2, 15000),
                        t0=0.0, t1=dur * 0.95, glen=(0.0002, 0.0008))[:n]
        x = x + grit * norm(g) * e
    return norm(x)


def grain_cloud(rng, dur, count, f_lo, f_hi, t0=0.0, t1=None, skew=1.0, decay=0.0,
                q=(1.0, 3.0), glen=(0.0005, 0.003), amp_jitter=0.8):
    """Cloud of tiny band-passed noise ticks (gravel, debris, grit, crackle)."""
    t1 = dur if t1 is None else t1
    n = n_of(max(dur, t1) + 6 * glen[1] + 0.003)
    out = np.zeros(n)
    times = t0 + (t1 - t0) * rng.uniform(0, 1, count) ** skew
    for tt in times:
        L = n_of(rng.uniform(*glen))
        m = L * 8 + 8
        g = rng.standard_normal(m) * env_exp(m, L / SR, 0.00003)
        g = biquad(g, "bp", loguni(rng, f_lo, f_hi), rng.uniform(*q))
        a = 1.0 - amp_jitter * rng.uniform()
        if decay:
            a *= np.exp(-(tt - t0) / decay)
        place(out, norm(g), tt, a)
    return out


def cloth(rng, dur, lo=350, hi=4500, rate=22, crackle=0.3):
    """Fabric rustle: band noise with irregular swells plus fibre crackle."""
    n = n_of(dur)
    u = tline(n) / dur
    env = np.sin(np.pi * np.clip(u, 0, 1)) ** 0.7
    mod = np.maximum(0, norm(lp(rng.standard_normal(n), rate, 2))) ** 1.4
    x = norm(bp(rng.standard_normal(n) * mod * env, lo, hi, 2))
    if crackle:
        c = grain_cloud(rng, dur, int(dur * 90), 1500, 7000, glen=(0.0002, 0.0007))[:n]
        x = x + crackle * norm(c) * env
    return norm(x)


def swish(rng, dur, f_lo, f_hi, peak_at=0.45, width=0.17, q=1.3, body=0.35):
    """Air swish: noise through a band-pass whose centre follows a doppler-like bell."""
    n = n_of(dur)
    u = tline(n) / dur
    bell = np.exp(-0.5 * ((u - peak_at) / width) ** 2)
    fc = f_lo * (f_hi / f_lo) ** bell
    _, b, _ = svf(rng.standard_normal(n), fc, q)
    low, _, _ = svf(rng.standard_normal(n), fc * 0.35, 0.8)
    return end_fade(norm(norm(b) * bell ** 1.3 + body * norm(low) * bell ** 1.6), 0.01)


def bell_tone(freq, dur, t60, ratios=BELL, gains=None, attack=0.0015, rng=None):
    """Additive bell / ping: damped inharmonic partials."""
    n = n_of(dur)
    t = tline(n)
    out = np.zeros(n)
    gains = gains or [1.0 / (1 + 0.8 * i) for i in range(len(ratios))]
    for i, (r, g) in enumerate(zip(ratios, gains)):
        f = freq * r
        if f >= 0.45 * SR:
            continue
        ph = rng.uniform(0, 2 * np.pi) if rng is not None else 0.0
        d = t60 / 6.91 / (r ** 0.5)
        out += g * np.sin(2 * np.pi * f * t + ph) * np.exp(-t / d)
    a = np.clip(t / attack, 0, 1)
    return end_fade(out * np.sin(0.5 * np.pi * a) ** 2, 0.005)


def synth(freq, dur, env, cutoff=20000.0, wave="saw", detune=(0.0,), rng=None,
          vib=0.0, vib_rate=5.0, fmul=None):
    """Band-limited additive oscillator(s) through a time-varying 2-pole low-pass.

    The low-pass is applied per harmonic (Butterworth magnitude), so cutoff
    sweeps are alias-free and cheap. `fmul` is an optional pitch-multiplier curve.
    """
    n = n_of(dur)
    t = tline(n)
    env = np.broadcast_to(np.asarray(env, dtype=float), (n,))
    cut = np.broadcast_to(np.asarray(cutoff, dtype=float), (n,))
    cmax = float(cut.max())
    out = np.zeros(n)
    for i, dc in enumerate(detune):
        f = freq * 2.0 ** (dc / 1200.0)
        finst = np.full(n, f)
        if fmul is not None:
            finst = finst * fmul
        if vib:
            finst = finst * (1 + vib * np.sin(2 * np.pi * vib_rate * t + 1.7 * i))
        ph = 2 * np.pi * np.cumsum(finst) / SR
        if rng is not None:
            ph = ph + rng.uniform(0, 2 * np.pi)
        kmax = max(1, int(min(16000.0, 4.0 * cmax) / (f * (fmul.max() if fmul is not None else 1))))
        for k in range(1, kmax + 1):
            if wave in ("square", "tri") and k % 2 == 0:
                continue
            if wave == "tri":
                a = (1.0 / k ** 2) * (-1) ** ((k - 1) // 2)
            elif wave == "sine":
                if k > 1:
                    break
                a = 1.0
            else:
                a = 1.0 / k
            r = k * finst / cut
            r2 = r * r
            out += (a / np.sqrt(1.0 + r2 * r2)) * np.sin(k * ph)
    return end_fade(out * env / len(detune), 0.008)


def sat(x, drive):
    """Soft saturation (tanh) on a peak-normalised signal."""
    x = norm(x)
    return np.tanh(drive * x) / np.tanh(drive)


# ----------------------------------------------------------------------------
# Space: synthetic reverb impulse responses
# ----------------------------------------------------------------------------

def early_taps(rng, size=1.0, count=6, first=0.006, last=0.07):
    ts = np.sort(rng.uniform(first, last, count)) * size
    gs = np.linspace(0.38, 0.12, count) * rng.uniform(0.7, 1.15, count)
    return list(zip(ts, gs))


def make_ir(rng, dur, t60, predelay=0.005, early=(), color_lp=8000.0, onset=0.003):
    """Exponentially decaying noise IR with frequency-dependent decay
    (highs die faster, lows linger) plus optional discrete early reflections."""
    n = n_of(dur)
    t = tline(n)
    w = rng.standard_normal(n)
    ir = np.zeros(n)
    for lo, hi, k in ((None, 250, 1.2), (250, 1200, 1.0), (1200, 4000, 0.72), (4000, color_lp, 0.45)):
        if lo and lo >= hi:
            continue
        ir += band(w, lo, hi, 2) * 10.0 ** (-3.0 * t / (t60 * k))
    ir *= 1.0 - np.exp(-t / onset)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    if early:
        taps = np.zeros(n)
        for d, g in early:
            i = n_of(d)
            if i < n:
                taps[i] += g
        taps = lp(taps, 4500, 2)
        e_target = sum(g * g for _, g in early)
        taps *= np.sqrt(e_target / (np.sum(taps ** 2) + 1e-12))
        ir = ir + taps
    ir = np.concatenate([np.zeros(n_of(predelay)), ir])
    return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-12)


def add_reverb(x, ir, wet, dry=1.0):
    y = sps.fftconvolve(x, ir)
    y[:len(x)] = y[:len(x)] * wet + dry * x
    y[len(x):] *= wet
    return y


def room(rng, x, t60=0.35, wet=0.15, size=0.5, color_lp=6500):
    """Small concrete/metal room for foley."""
    ir = make_ir(rng, t60 * 1.15 + 0.03, t60, predelay=0.001 + 0.004 * size,
                 early=early_taps(rng, size, 5), color_lp=color_lp)
    return add_reverb(x, ir, wet)


def industrial_ir(rng, t60, size=1.0, color_lp=5000):
    return make_ir(rng, t60 * 1.25 + 0.05, t60, predelay=0.004 * size,
                   early=early_taps(rng, size, 7, 0.008, 0.11), color_lp=color_lp)


# ----------------------------------------------------------------------------
# Loop (periodic) construction helpers
# ----------------------------------------------------------------------------

def periodic_noise(rng, n, mag_fn):
    """Noise that is exactly periodic over n samples, with spectral magnitude mag_fn(f)."""
    f = np.fft.rfftfreq(n, 1.0 / SR)
    spec = rng.standard_normal(f.size) + 1j * rng.standard_normal(f.size)
    spec *= mag_fn(np.maximum(f, 1e-3))
    spec[0] = 0.0
    x = np.fft.irfft(spec, n)
    return x / (np.std(x) + 1e-12)


def periodic_smooth(rng, n, max_hz):
    """Smooth random modulation curve in [-1, 1], periodic over n samples."""
    return norm(periodic_noise(rng, n, lambda f: (f <= max_hz).astype(float)))


def circ_convolve(x, ir):
    h = np.zeros(len(x))
    h[:len(ir)] = ir
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(h), len(x))


# ----------------------------------------------------------------------------
# Finalisation and output
# ----------------------------------------------------------------------------

def finalize(x, peak_db=-1.0, trim=True, trim_db=-60.0, hp_fc=22.0, fade_in=0.0003,
             fade_out=0.012, max_dur=None, loop=False):
    x = np.asarray(x, dtype=float).copy()
    peak = 10.0 ** (peak_db / 20.0)
    if loop:
        # loops are built periodic; only remove the mean (keeps periodicity).
        x -= np.mean(x)
        return norm(x, peak)
    # 0.5 ms of pre-roll so the attack transient is never eaten by the fade-in
    x = np.concatenate([np.zeros(n_of(0.0005)), x])
    if hp_fc:
        x = hp(x, hp_fc, 2)
    x = norm(x, peak)
    if trim:
        thr = 10.0 ** ((peak_db + trim_db) / 20.0)
        idx = np.nonzero(np.abs(x) > thr)[0]
        if len(idx):
            x = x[:min(len(x), idx[-1] + n_of(0.004))]
    if max_dur and len(x) > n_of(max_dur):
        x = x[:n_of(max_dur)]
        fade_out = max(fade_out, 0.4)
    fi = min(n_of(fade_in), len(x) // 4)
    if fi > 1:
        x[:fi] *= np.sin(0.5 * np.pi * np.arange(fi) / fi) ** 2
    fo = min(n_of(fade_out), len(x) // 3)
    if fo > 1:
        x[-fo:] *= np.cos(0.5 * np.pi * np.arange(1, fo + 1) / fo) ** 2
    return norm(x, peak)


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ----------------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------------

REGISTRY = []  # (category, name, fn, variation, finalize-kwargs)


def sfx(cat, name, count=None, **fin):
    def deco(fn):
        if count:
            for v in range(1, count + 1):
                REGISTRY.append((cat, f"{name}_{v}", fn, v, fin))
        else:
            REGISTRY.append((cat, name, fn, 1, fin))
        return fn
    return deco


def j(rng, s=0.08):
    """Random jitter factor 1 +- s."""
    return 1.0 + s * rng.uniform(-1.0, 1.0)


# ============================================================================
# WEAPONS - gunshots
# ============================================================================

GUNS = {
    # Layers: crack (HF snap) | blast mid/hi (main muzzle blast) | bloom (expanding gas, mid)
    #         | body (low-mid noise) | thump (pitch-dropping punch) | mech | tail (industrial IR)
    # 9mm service pistol: sharp crack, moderate body, short tail
    "p9": dict(crack=(2400, 0.002, 0.8), mid=(250, 2400, 0.014, 1.0), hi=(2200, 9000, 0.006, 0.55),
               bloom=(200, 1600, 0.05, 0.3), body=(700, 0.035, 0.45), thump=(170, 75, 0.008, 0.035, 0.55),
               mech=(0.020, 2400, 0.10), eq=[(1100, 2.0, 0.9)], drive=2.2,
               t60=0.6, wet=0.30, send_hp=180, tail_lp=4500, size=0.8),
    # heavy .50 pistol: big boom, strong low thump, long tail
    "hand_cannon": dict(nwave=(0.0004, 0.4), crack=(1800, 0.003, 0.9), mid=(150, 2000, 0.03, 1.0),
                        hi=(2000, 8000, 0.01, 0.45), bloom=(120, 1200, 0.12, 0.45), body=(550, 0.08, 0.8),
                        thump=(125, 45, 0.02, 0.10, 0.9), mech=(0.026, 1900, 0.08),
                        eq=[(90, 2.0, 0.8), (700, 2.0, 0.8)], drive=3.0,
                        t60=1.4, wet=0.45, send_hp=100, tail_lp=3500, size=1.3),
    # compact SMG: tight, snappy, light, quick decay (13 rps) - quiet tail
    "vx9": dict(crack=(3200, 0.0015, 0.85), mid=(350, 3000, 0.008, 1.0), hi=(2500, 10000, 0.004, 0.6),
                bloom=(300, 2000, 0.025, 0.2), body=(900, 0.018, 0.35), thump=(200, 95, 0.006, 0.022, 0.45),
                mech=(0.011, 2800, 0.14), eq=[(2000, 2.0, 1.0)], drive=2.0,
                t60=0.45, wet=0.14, send_hp=250, tail_lp=4000, size=0.7),
    # pump shotgun: wide, boomy blast, chunky low end
    "breacher12": dict(crack=(1500, 0.0035, 0.7), mid=(130, 1800, 0.04, 1.0), hi=(1800, 6500, 0.012, 0.4),
                       spread=(0.0, 0.0006, 0.0013, 0.0021),
                       bloom=(120, 1200, 0.13, 0.5), body=(480, 0.10, 0.9), thump=(115, 40, 0.025, 0.12, 1.0),
                       eq=[(110, 2.0, 0.7), (420, 2.0, 0.7), (3500, -2.0, 0.8)], drive=3.2,
                       t60=1.25, wet=0.42, send_hp=110, tail_lp=3000, size=1.2),
    # heavy AR (7.62): aggressive, mid-heavy crack, punchy
    "ravager": dict(nwave=(0.00045, 0.55), crack=(2000, 0.0028, 0.85), mid=(220, 2200, 0.022, 1.0),
                    hi=(2000, 8000, 0.008, 0.5), bloom=(180, 1500, 0.07, 0.38), body=(650, 0.05, 0.6),
                    thump=(150, 55, 0.014, 0.06, 0.75), mech=(0.016, 2100, 0.10),
                    eq=[(850, 3.0, 0.9), (120, 1.5, 0.8)], drive=2.8,
                    t60=0.95, wet=0.32, send_hp=150, tail_lp=3800, size=1.0),
    # 5.56 carbine: tighter, brighter, less bass than ravager
    "sentinel": dict(nwave=(0.0003, 0.7), crack=(3000, 0.0022, 1.0), mid=(300, 3000, 0.016, 1.0),
                     hi=(2500, 10000, 0.007, 0.65), bloom=(250, 2000, 0.05, 0.3), body=(800, 0.035, 0.45),
                     thump=(175, 68, 0.01, 0.045, 0.55), mech=(0.014, 2600, 0.10),
                     eq=[(2300, 3.0, 1.0), (6000, 2.0, 0.8)], drive=2.4,
                     t60=0.85, wet=0.30, send_hp=200, tail_lp=4500, size=0.95),
    # bolt-action sniper: massive crack, long rolling echo tail (~1.5 s)
    "longbow": dict(nwave=(0.0006, 1.0), crack=(1400, 0.0045, 1.0), mid=(150, 2000, 0.035, 1.0),
                    hi=(1800, 8000, 0.012, 0.5), bloom=(120, 1400, 0.12, 0.45), body=(520, 0.09, 0.8),
                    thump=(120, 40, 0.025, 0.12, 0.95), eq=[(100, 2.0, 0.7), (1500, 2.0, 0.8)], drive=3.0,
                    t60=1.6, wet=0.38, send_hp=120, tail_lp=3000, size=1.5,
                    echoes=([0.13, 0.27, 0.42, 0.60, 0.81, 1.05, 1.32],
                            [0.42, 0.36, 0.30, 0.24, 0.18, 0.13, 0.08],
                            [2600, 2100, 1700, 1300, 1000, 750, 550]),
                    rumble=0.22),
}


def rolling_echo(rng, src, P):
    """Rolling (thunder-like) echoes: progressively darker, smeared copies + low rumble."""
    times, gains, lps = P["echoes"]
    out = np.zeros(len(src) + n_of(max(times) + 0.8))
    src = hp(src, P["send_hp"], 2)
    for t, g, f in zip(times, gains, lps):
        e = lp(src, f * j(rng, 0.1), 2)
        e = sps.fftconvolve(e, make_ir(rng, 0.3, 0.22, predelay=0.0, onset=0.012))
        place(out, norm(e), t * j(rng, 0.06), g * j(rng, 0.15))
    nr = n_of(max(times) + 0.5)
    t = tline(nr)
    env = (1 - np.exp(-t / 0.08)) * np.exp(-t / 0.42)
    am = 0.55 + 0.45 * norm(lp(rng.standard_normal(nr), 6, 2))
    rum = end_fade(bp(rng.standard_normal(nr) * env * am, 60, 380, 2), 0.2)
    place(out, norm(rum), 0.04, P["rumble"])
    return out


def gunshot(rng, P):
    fc0, fc1, ptau, tdec, tgain = P["thump"]
    longest = max(0.12, 7 * tdec, 7 * P["body"][1], 7 * P["bloom"][2])
    nc = n_of(longest + 0.05)
    core = np.zeros(nc)
    t0 = 0.0008
    if P.get("nwave"):
        place(core, nwave(P["nwave"][0] * j(rng, 0.1)), t0, P["nwave"][1])
    hpf, cdec, cgain = P["crack"]
    place(core, norm(nburst(rng, 0.03, cdec * j(rng), attack=0.00008, lo=hpf)), t0, cgain)
    spread = P.get("spread", (0.0,))
    for off in spread:
        lo, hi, dec, g = P["mid"]
        place(core, norm(nburst(rng, 0, dec * j(rng), 0.00025, lo * j(rng, 0.1), hi * j(rng, 0.1))),
              t0 + off, g / np.sqrt(len(spread)))
    lo, hi, dec, g = P["hi"]
    place(core, norm(nburst(rng, 0, dec * j(rng), 0.0001, lo, hi)), t0, g)
    lo, hi, dec, g = P["bloom"]
    place(core, norm(nburst(rng, 0, dec * j(rng), 0.003, lo, hi)), t0, g)
    lpf, dec, g = P["body"]
    place(core, norm(nburst(rng, 0, dec * j(rng), 0.0008, hi=lpf, order=4)), t0, g)
    place(core, thump(0, fc0 * j(rng, 0.05), fc1 * j(rng, 0.05), ptau, tdec * j(rng), 0.0007), t0, tgain)
    if P.get("mech"):
        mt, mf, mg = P["mech"]
        place(core, m_click(rng, mf * j(rng, 0.06), t60=0.03, hard=0.00015), mt * j(rng, 0.12), mg)
    for f, g, q in P.get("eq", ()):
        core = peq(core, f, g, q)
    core = sat(core, P["drive"] * j(rng, 0.05))
    ir = industrial_ir(rng, P["t60"] * j(rng, 0.07), P["size"], P["tail_lp"])
    tail = sps.fftconvolve(lp(hp(core, P["send_hp"], 2), P["tail_lp"], 2), ir)
    parts = [core, P["wet"] * tail]
    if P.get("echoes"):
        parts.append(rolling_echo(rng, core, P))
    return mixsum(*parts)


def _register_guns():
    counts = {"p9": 3, "hand_cannon": 2, "vx9": 3, "breacher12": 2, "ravager": 3, "sentinel": 3, "longbow": 2}
    for key, cnt in counts.items():
        def fn(rng, v, _k=key):
            return gunshot(rng, GUNS[_k])
        fn.__name__ = f"shot_{key}"
        globals()[fn.__name__] = fn  # module-level name so it pickles for worker processes
        sfx("weapons", f"{key}_shot", cnt, peak_db=-1.0, hp_fc=25)(fn)


_register_guns()


# ============================================================================
# WEAPONS - handling foley
# ============================================================================

@sfx("weapons", "dry_fire", peak_db=-6.0)
def dry_fire(rng, v):
    out = np.zeros(n_of(0.2))
    place(out, m_click(rng, 3300, t60=0.010, hard=0.00012, noise=0.6), 0.0, 0.5)    # sear
    place(out, m_click(rng, 2100, t60=0.018, hard=0.00015, noise=0.5), 0.013, 1.0)  # striker
    place(out, p_click(rng, 700, t60=0.008), 0.0135, 0.35)                          # frame
    return room(rng, out, 0.25, 0.08, 0.3)


@sfx("weapons", "mag_out", peak_db=-6.0)
def mag_out(rng, v):
    out = np.zeros(n_of(0.45))
    place(out, m_click(rng, 2700, t60=0.012, hard=0.00015), 0.0, 0.7)          # release button
    place(out, p_click(rng, 1100, t60=0.01), 0.004, 0.4)
    place(out, friction(rng, 0.11, 900, 4800, peak_at=0.3, grit=0.3), 0.018, 0.45)  # slide out
    place(out, m_click(rng, 3600, t60=0.02, hard=0.0001, nm=5), 0.03, 0.25)    # spring tick
    place(out, clunk(rng, 260, 0.02, lpf=1800), 0.14, 0.6)                     # into hand
    place(out, p_click(rng, 900, t60=0.012), 0.142, 0.4)
    return room(rng, out, 0.28, 0.1, 0.4)


@sfx("weapons", "mag_in", peak_db=-6.0)
def mag_in(rng, v):
    out = np.zeros(n_of(0.5))
    place(out, friction(rng, 0.09, 700, 4200, peak_at=0.8, grit=0.25), 0.0, 0.4)  # slide in
    place(out, clunk(rng, 230, 0.026, lpf=1500), 0.09, 1.0)                       # seat
    place(out, p_click(rng, 1000, t60=0.012), 0.0905, 0.6)
    place(out, m_click(rng, 2900, t60=0.022, hard=0.00012), 0.096, 0.85)          # latch catch
    place(out, clunk(rng, 300, 0.015, lpf=1200), 0.17, 0.35)                      # palm slap
    return room(rng, out, 0.28, 0.1, 0.4)


@sfx("weapons", "pistol_mag_out", peak_db=-6.0)
def pistol_mag_out(rng, v):
    out = np.zeros(n_of(0.3))
    place(out, m_click(rng, 3400, t60=0.009, hard=0.0001), 0.0, 0.7)
    place(out, friction(rng, 0.06, 1200, 6000, peak_at=0.3, grit=0.3), 0.01, 0.35)
    place(out, clunk(rng, 380, 0.012, dur=0.06, lpf=2500), 0.085, 0.4)
    place(out, m_click(rng, 3000, t60=0.012, nm=5), 0.086, 0.25)
    return room(rng, out, 0.25, 0.08, 0.3)


@sfx("weapons", "pistol_mag_in", peak_db=-6.0)
def pistol_mag_in(rng, v):
    out = np.zeros(n_of(0.3))
    place(out, friction(rng, 0.055, 1000, 5500, peak_at=0.8, grit=0.25), 0.0, 0.35)
    place(out, clunk(rng, 340, 0.014, dur=0.07, lpf=2200), 0.055, 0.7)
    place(out, m_click(rng, 3500, t60=0.016, hard=0.0001), 0.058, 1.0)
    return room(rng, out, 0.25, 0.08, 0.3)


@sfx("weapons", "bolt_charge", peak_db=-6.0)
def bolt_charge(rng, v):
    out = np.zeros(n_of(0.65))
    place(out, m_click(rng, 2600, t60=0.012), 0.0, 0.35)                           # grab handle
    place(out, friction(rng, 0.12, 800, 5000, peak_at=0.7, rough=1.0, grit=0.4), 0.01, 0.4)
    place(out, m_click(rng, 1700, t60=0.04, hard=0.0002, noise=0.4), 0.13, 0.75)   # clack 1 (rear)
    place(out, clunk(rng, 320, 0.015, lpf=2000), 0.13, 0.3)
    place(out, friction(rng, 0.035, 2500, 9000, peak_at=0.4, grit=0.0), 0.31, 0.25)  # spring zing
    place(out, m_click(rng, 1450, t60=0.05, hard=0.00015, noise=0.5), 0.34, 1.0)   # clack 2 (slam home)
    place(out, clunk(rng, 210, 0.025, lpf=1600), 0.34, 0.55)
    return room(rng, out, 0.32, 0.12, 0.5)


@sfx("weapons", "slide_release", peak_db=-6.0)
def slide_release(rng, v):
    out = np.zeros(n_of(0.3))
    place(out, m_click(rng, 3800, t60=0.008, hard=0.0001), 0.0, 0.3)               # lever
    place(out, friction(rng, 0.018, 3000, 10000, peak_at=0.5, grit=0.0), 0.004, 0.3)
    place(out, m_click(rng, 2000, t60=0.04, hard=0.00012, noise=0.55), 0.02, 1.0)  # snap forward
    place(out, clunk(rng, 330, 0.014, dur=0.07, lpf=2400), 0.02, 0.4)
    return room(rng, out, 0.28, 0.1, 0.35)


@sfx("weapons", "pump_action", peak_db=-6.0)
def pump_action(rng, v):
    out = np.zeros(n_of(0.6))
    place(out, friction(rng, 0.09, 500, 3800, peak_at=0.6, rough=1.0, grit=0.3), 0.0, 0.45)  # back
    place(out, m_click(rng, 1500, t60=0.035, hard=0.0002), 0.09, 0.85)
    place(out, clunk(rng, 240, 0.02, lpf=1500), 0.09, 0.6)
    place(out, p_click(rng, 800, t60=0.014), 0.092, 0.4)
    place(out, friction(rng, 0.08, 500, 3500, peak_at=0.6, rough=1.0, grit=0.3), 0.18, 0.45)  # forward
    place(out, m_click(rng, 1250, t60=0.045, hard=0.0002), 0.26, 1.0)
    place(out, clunk(rng, 200, 0.028, lpf=1400), 0.26, 0.75)
    place(out, m_click(rng, 3100, t60=0.02, nm=5), 0.275, 0.2)                    # rattle
    return room(rng, out, 0.3, 0.12, 0.45)


@sfx("weapons", "shell_insert", peak_db=-6.0)
def shell_insert(rng, v):
    out = np.zeros(n_of(0.3))
    place(out, friction(rng, 0.05, 600, 3500, peak_at=0.7, grit=0.2), 0.0, 0.4)   # hull pushed
    place(out, p_click(rng, 1200, t60=0.012), 0.05, 0.8)                          # past the lifter
    place(out, m_click(rng, 2400, t60=0.02, nm=5), 0.052, 0.45)                   # brass rim
    place(out, clunk(rng, 280, 0.018, lpf=1500), 0.065, 0.6)                      # thumb thud
    return room(rng, out, 0.28, 0.1, 0.4)


@sfx("weapons", "bolt_cycle", peak_db=-6.0)
def bolt_cycle(rng, v):
    out = np.zeros(n_of(0.9))
    place(out, m_click(rng, 2300, t60=0.02), 0.0, 0.7)                             # bolt up (cam)
    place(out, p_click(rng, 900, t60=0.01), 0.002, 0.3)
    place(out, friction(rng, 0.16, 700, 4500, peak_at=0.6, rough=0.9, grit=0.35), 0.05, 0.45)  # back
    place(out, m_click(rng, 1600, t60=0.04, hard=0.0002), 0.21, 0.9)               # rear stop
    place(out, clunk(rng, 280, 0.018), 0.21, 0.4)
    place(out, friction(rng, 0.13, 700, 4500, peak_at=0.6, rough=0.9, grit=0.35), 0.33, 0.4)   # forward
    place(out, m_click(rng, 1450, t60=0.04, hard=0.0002), 0.46, 0.85)              # chambered
    place(out, clunk(rng, 240, 0.02), 0.46, 0.45)
    place(out, m_click(rng, 2000, t60=0.03, hard=0.00015), 0.58, 1.0)              # bolt down/lock
    place(out, clunk(rng, 260, 0.02), 0.58, 0.4)
    return room(rng, out, 0.32, 0.12, 0.5)


@sfx("weapons", "weapon_draw", peak_db=-6.0)
def weapon_draw(rng, v):
    out = np.zeros(n_of(0.6))
    place(out, cloth(rng, 0.32, crackle=0.35), 0.0, 0.6)
    place(out, clunk(rng, 200, 0.02, lpf=900), 0.01, 0.35)                        # grab
    for _ in range(5):
        place(out, m_click(rng, loguni(rng, 1800, 4200), t60=rng.uniform(0.015, 0.05), nm=6),
              rng.uniform(0.08, 0.32), rng.uniform(0.2, 0.5))                       # sling/swivel rattle
    place(out, m_click(rng, 1700, t60=0.04), 0.36, 0.55)                           # settle on shoulder
    place(out, clunk(rng, 260, 0.02), 0.36, 0.4)
    return room(rng, out, 0.3, 0.1, 0.4)


@sfx("weapons", "knife_draw", peak_db=-6.0)
def knife_draw(rng, v):
    dur = 0.7
    n = n_of(dur)
    out = np.zeros(n)
    place(out, p_click(rng, 1600, t60=0.008), 0.0, 0.4)                           # sheath catch
    sl = n_of(0.3)
    u = tline(sl) / 0.3
    e = np.clip(u / 0.08, 0, 1) * np.exp(-np.maximum(u - 0.08, 0) / 0.35)
    exc = rng.standard_normal(sl) * e
    _, sweep, _ = svf(exc, 2500 * (7000 / 2500) ** np.clip(u * 1.4, 0, 1), 5.0)
    sweep = end_fade(sweep, 0.06)
    blade = resonate(np.concatenate([hp(exc, 2000) * 0.02, np.zeros(n - sl)]),
                     np.array([3150, 4320, 5870, 7480, 9100, 11300]) * j(rng, 0.03),
                     [0.5, 0.45, 0.4, 0.35, 0.3, 0.25], [1.0, 0.8, 0.7, 0.55, 0.45, 0.3])
    place(out, norm(sweep), 0.01, 0.6)
    place(out, norm(blade), 0.01, 0.75)
    return room(rng, out, 0.3, 0.1, 0.4)


@sfx("weapons", "knife_swing", 2, peak_db=-6.0)
def knife_swing(rng, v):
    dur = rng.uniform(0.24, 0.3)
    return swish(rng, dur, rng.uniform(280, 380), rng.uniform(1300, 1900),
                 peak_at=rng.uniform(0.4, 0.5), q=rng.uniform(1.1, 1.6))


def wet_squelch(rng, dur=0.12, lo=500, hi=2200, decay=0.045):
    n = n_of(dur)
    am = np.maximum(0, norm(lp(rng.standard_normal(n), 70, 2))) ** 1.2
    return end_fade(norm(bp(rng.standard_normal(n) * am * env_exp(n, decay, 0.004), lo, hi, 2)), 0.02)


@sfx("weapons", "knife_hit_flesh", peak_db=-3.0)
def knife_hit_flesh(rng, v):
    out = np.zeros(n_of(0.35))
    place(out, thump(0.2, 150, 75, 0.01, 0.035), 0.0, 1.0)
    place(out, norm(nburst(rng, 0.15, 0.03, 0.0008, hi=700, order=4)), 0.0, 0.8)
    place(out, norm(nburst(rng, 0.05, 0.006, 0.0002, 300, 1500)), 0.0, 0.45)      # slap
    place(out, wet_squelch(rng), 0.004, 0.5)
    place(out, friction(rng, 0.07, 900, 3800, peak_at=0.3, grit=0.2), 0.01, 0.15)  # blade drag
    out = lp(sat(out, 1.6), 4000, 2)
    return room(rng, out, 0.25, 0.06, 0.3)


@sfx("weapons", "knife_hit_wall", peak_db=-3.0)
def knife_hit_wall(rng, v):
    out = np.zeros(n_of(0.6))
    place(out, norm(nburst(rng, 0.03, 0.0015, 0.00005, lo=2500)), 0.0, 1.0)
    place(out, strike(rng, 0.5, 2400, BEAM + [17.0], 0.28, slope=0.3, hard=0.0001), 0.0, 0.55)
    place(out, clunk(rng, 420, 0.01, dur=0.06, lpf=3000), 0.0, 0.4)
    place(out, grain_cloud(rng, 0.2, 18, 1500, 7000, t0=0.002, t1=0.12, skew=2.0), 0.0, 0.4)
    place(out, friction(rng, 0.06, 1500, 7000, peak_at=0.2, grit=0.5), 0.005, 0.2)
    return room(rng, out, 0.4, 0.15, 0.6)


@sfx("weapons", "shell_casing", 3, peak_db=-8.0)
def shell_casing(rng, v):
    out = np.zeros(n_of(1.1))
    base = rng.uniform(3300, 4400)
    t, a = 0.0, 1.0
    interval = rng.uniform(0.09, 0.13)
    while a > 0.04 and t < 0.8 and interval > 0.012:
        hit = strike(rng, 0.25, base * j(rng, 0.01), TUBE, rng.uniform(0.07, 0.14), slope=0.35,
                     hard=0.00008, jitter=0.01)
        tick = norm(nburst(rng, 0.01, 0.0005, 0.00003, lo=3000))
        place(out, hit, t, a)
        place(out, tick, t, 0.45 * a)
        t += interval
        interval *= rng.uniform(0.6, 0.78)
        a *= rng.uniform(0.5, 0.72)
    # short roll / settle: tiny rapid contacts
    for k in range(rng.integers(4, 9)):
        t += rng.uniform(0.008, 0.022)
        place(out, strike(rng, 0.08, base, TUBE, 0.04, hard=0.00006), t, a * rng.uniform(0.2, 0.6))
    return room(rng, out, 0.35, 0.12, 0.4)


@sfx("weapons", "bullet_whiz", 3, peak_db=-3.0)
def bullet_whiz(rng, v):
    dur = rng.uniform(0.32, 0.42)
    n = n_of(dur)
    t = tline(n)
    out = np.zeros(n)
    place(out, nwave(rng.uniform(0.00018, 0.0003), 15000), 0.001, 1.0)           # shock crack
    place(out, norm(nburst(rng, 0.02, 0.0012, 0.00005, lo=3500)), 0.001, 0.6)
    tc = rng.uniform(0.03, 0.06)
    w = rng.uniform(0.018, 0.03)
    fh, fl = rng.uniform(4500, 6500), rng.uniform(900, 1500)
    fc = fl + (fh - fl) / (1 + np.exp((t - tc) / w))                              # doppler drop
    env = np.exp(-0.5 * ((t - tc) / (w * 2.2)) ** 2) * (t < tc) + np.exp(-np.maximum(t - tc, 0) / (w * 3.5)) * (t >= tc)
    env *= np.clip(t / 0.004, 0, 1) * np.cos(0.5 * np.pi * np.clip((t - 0.75 * dur) / (0.25 * dur), 0, 1)) ** 2
    flutter = 1 + 0.35 * np.sin(2 * np.pi * rng.uniform(60, 110) * t)
    _, b, _ = svf(rng.standard_normal(n), fc, 3.5)
    zing = np.sin(2 * np.pi * np.cumsum(fc) / SR)
    place(out, norm(b * env * flutter), 0.0, 0.7)
    place(out, norm(zing * env * flutter), 0.0, 0.12)
    return room(rng, out, 0.5, 0.12, 0.8)


# ============================================================================
# IMPACTS
# ============================================================================

@sfx("impacts", "concrete", 4, peak_db=-3.0)
def imp_concrete(rng, v):
    out = np.zeros(n_of(0.7))
    place(out, norm(nburst(rng, 0.03, 0.002 * j(rng), 0.00005, lo=1800)), 0.0, 1.0)
    place(out, norm(nburst(rng, 0.08, 0.012 * j(rng), 0.0002, 250, 4000)), 0.0, 0.8)
    place(out, thump(0.08, 260, 120, 0.004, 0.012), 0.0, 0.35)
    chips = grain_cloud(rng, 0.5, rng.integers(25, 45), 1500, 7500, t0=0.004, t1=0.4, skew=2.6,
                        decay=0.12, glen=(0.0004, 0.0025))
    place(out, norm(chips), 0.0, 0.35)
    place(out, norm(nburst(rng, 0.5, 0.11, 0.012, lo=2500)), 0.005, 0.1)          # dust hiss
    out = sat(out, 1.5)
    return room(rng, out, 0.5, 0.22, 0.7)


def ricochet(rng, dur):
    n = n_of(dur)
    t = tline(n)
    f0, f1 = rng.uniform(3800, 5200), rng.uniform(1500, 2300)
    f = f1 + (f0 - f1) * np.exp(-t / (dur * 0.35))
    ph = 2 * np.pi * np.cumsum(f) / SR
    am = 0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(40, 80) * t + rng.uniform(0, 6.28))
    env = np.clip(t / 0.006, 0, 1) * np.exp(-t / (dur * 0.3))
    env *= np.cos(0.5 * np.pi * np.clip((t - 0.8 * dur) / (0.2 * dur), 0, 1)) ** 2   # die out by the end
    tone = np.sin(ph) + 0.25 * np.sin(2 * ph + 0.3)
    _, nb, _ = svf(rng.standard_normal(n), f, 5.0)
    return norm(0.7 * norm(tone * am * env) + 0.6 * norm(nb * am * env))


@sfx("impacts", "metal", 4, peak_db=-3.0)
def imp_metal(rng, v):
    out = np.zeros(n_of(0.8))
    place(out, norm(nburst(rng, 0.02, 0.0015, 0.00005, lo=3000)), 0.0, 0.8)        # spark crack
    place(out, strike(rng, 0.6, rng.uniform(1100, 1900), PLATE, 0.28, slope=0.5, hard=0.00012, nm=10),
          0.0, 1.0)
    place(out, strike(rng, 0.5, rng.uniform(380, 520), PLATE, 0.2, hard=0.0003, nm=6), 0.0, 0.4)
    if v in (2, 4):
        place(out, ricochet(rng, rng.uniform(0.35, 0.5)), rng.uniform(0.006, 0.015), 0.6)
    out = sat(out, 1.3)
    return room(rng, out, 0.6, 0.2, 0.7)


@sfx("impacts", "wood", 3, peak_db=-3.0)
def imp_wood(rng, v):
    out = np.zeros(n_of(0.5))
    place(out, norm(nburst(rng, 0.02, 0.002, 0.00005, lo=1500)), 0.0, 0.6)
    place(out, strike(rng, 0.3, rng.uniform(220, 330), WOOD, 0.07, slope=0.6, hard=0.0005), 0.0, 1.0)
    place(out, norm(nburst(rng, 0.1, 0.02, 0.0003, hi=900)), 0.0, 0.6)
    place(out, grain_cloud(rng, 0.2, 18, 1500, 6000, t0=0.002, t1=0.12, skew=1.8), 0.0, 0.35)
    out = sat(out, 1.4)
    return room(rng, out, 0.4, 0.15, 0.5)


@sfx("impacts", "flesh", 3, peak_db=-3.0)
def imp_flesh(rng, v):
    out = np.zeros(n_of(0.35))
    place(out, thump(0.2, 130 * j(rng, 0.2), 60 * j(rng, 0.2), 0.01, 0.045 * j(rng, 0.25)), 0.0, j(rng, 0.2))
    place(out, norm(nburst(rng, 0.15, 0.03 * j(rng, 0.3), 0.0006, hi=700 * j(rng, 0.3), order=4)), 0.0, 0.8 * j(rng, 0.25))
    place(out, norm(nburst(rng, 0.04, 0.006, 0.0002, 300, 1500)), 0.0, 0.5)
    place(out, wet_squelch(rng, 0.15, 500, 2200, 0.05), 0.003, 0.45)
    out = lp(sat(out, 1.6), 3500, 2)
    return room(rng, out, 0.3, 0.08, 0.3)


@sfx("impacts", "dirt", 3, peak_db=-3.0)
def imp_dirt(rng, v):
    out = np.zeros(n_of(0.9))
    place(out, thump(0.12, 170, 70, 0.006, 0.03), 0.0, 0.8)
    place(out, norm(nburst(rng, 0.12, 0.025, 0.0005, hi=600)), 0.0, 1.0)
    place(out, norm(nburst(rng, 0.03, 0.003, 0.0001, 800, 4000)), 0.0, 0.5)
    spray = grain_cloud(rng, 0.45, rng.integers(35, 55), 600, 3800, t0=0.01, t1=0.35, skew=1.6,
                        decay=0.15, glen=(0.0008, 0.004))
    place(out, norm(spray), 0.0, 0.4)
    place(out, norm(nburst(rng, 0.4, 0.12, 0.02, 1000, 5000)), 0.01, 0.12)
    out = sat(out, 1.5)
    return room(rng, out, 0.35, 0.1, 0.5)


@sfx("impacts", "glass", 2, peak_db=-3.0)
def imp_glass(rng, v):
    dur = 1.0
    n = n_of(dur)
    out = np.zeros(n)
    place(out, norm(nburst(rng, 0.05, 0.003, 0.00005, lo=2500)), 0.0, 1.0)
    place(out, norm(nburst(rng, 0.2, 0.035, 0.0005, lo=3000)), 0.0, 0.4)
    times = 0.002 + 0.8 * rng.uniform(0, 1, 70) ** 2.4
    for tt in times:
        L = n_of(0.2)
        tl = tline(L)
        f = loguni(rng, 2500, 11000)
        d = rng.uniform(0.004, 0.03)
        g = (np.sin(2 * np.pi * f * tl) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tl)) * np.exp(-tl / d)
        g *= np.clip(tl / 0.0002, 0, 1)
        place(out, g, tt, rng.uniform(0.15, 0.6) * np.exp(-tt / 0.35))
    return room(rng, out, 0.5, 0.15, 0.6)


@sfx("impacts", "helmet_ping", peak_db=-2.0)
def helmet_ping(rng, v):
    out = np.zeros(n_of(1.0))
    place(out, norm(nburst(rng, 0.02, 0.0012, 0.00004, lo=3000)), 0.0, 0.7)
    place(out, strike(rng, 0.9, 2350, [1.0, 1.62, 2.22, 2.86, 3.78, 4.6], 0.75, slope=0.4,
                      hard=0.00006, gain_tilt=0.2), 0.0, 1.0)
    place(out, strike(rng, 0.3, 900, [1.0, 1.5, 2.1], 0.1, hard=0.0003), 0.0, 0.35)
    place(out, clunk(rng, 500, 0.008, dur=0.05, lpf=2500), 0.0, 0.3)
    return room(rng, out, 0.45, 0.12, 0.5)


# ============================================================================
# FOOTSTEPS
# ============================================================================

def heel_toe(rng, heel, toe, gap, toe_gain, dur):
    out = np.zeros(n_of(dur))
    place(out, heel, 0.0, 1.0)
    place(out, toe, gap, toe_gain)
    return out


@sfx("footsteps", "concrete", 4, peak_db=-6.0, hp_fc=50)
def fs_concrete(rng, v):
    def part(scale):
        n = n_of(0.15)
        x = np.zeros(n)
        place(x, norm(nburst(rng, 0.1, 0.016 * scale, 0.0006, hi=650, order=2)), 0, 1.0)
        place(x, thump(0.08, 140, 80, 0.006, 0.018), 0, 0.35)
        place(x, norm(nburst(rng, 0.02, 0.0012, 0.00005, lo=2500)), 0, 0.3)         # sole click
        place(x, grain_cloud(rng, 0.05, 8, 3000, 8000, t1=0.03), 0, 0.12)
        return x
    heel = part(1.0)
    toe = part(0.8) * 0.7 + 0.3 * friction(rng, 0.15, 900, 5000, peak_at=0.15, grit=0.4)
    out = heel_toe(rng, heel, norm(toe), rng.uniform(0.05, 0.08), rng.uniform(0.35, 0.55), 0.35)
    return room(rng, out, 0.4, 0.15, 0.6)


@sfx("footsteps", "metal", 4, peak_db=-6.0, hp_fc=50)
def fs_metal(rng, v):
    base = rng.uniform(170, 250)

    def part():
        n = n_of(0.7)
        x = np.zeros(n)
        place(x, strike(rng, 0.7, base * j(rng, 0.03), PLATE, 0.45, slope=0.5, hard=0.0006, nm=12), 0, 1.0)
        place(x, norm(nburst(rng, 0.05, 0.002, 0.00005, lo=2000)), 0, 0.35)
        place(x, norm(nburst(rng, 0.1, 0.015, 0.0005, hi=500)), 0, 0.5)
        for _ in range(rng.integers(2, 5)):                                          # loose grating rattle
            place(x, m_click(rng, loguni(rng, 1100, 2400), t60=0.04, nm=6), rng.uniform(0.012, 0.08),
                  rng.uniform(0.1, 0.25))
        return x
    out = heel_toe(rng, part(), part(), rng.uniform(0.06, 0.09), rng.uniform(0.4, 0.6), 0.8)
    return room(rng, out, 0.7, 0.22, 0.8)


@sfx("footsteps", "gravel", 4, peak_db=-6.0, hp_fc=50)
def fs_gravel(rng, v):
    out = np.zeros(n_of(0.35))
    place(out, grain_cloud(rng, 0.15, rng.integers(60, 90), 1200, 7000, t1=0.12, skew=1.3,
                           glen=(0.0004, 0.0025)), 0, 1.0)
    place(out, norm(nburst(rng, 0.1, 0.022, 0.0008, hi=420)), 0, 0.5)
    gap = rng.uniform(0.07, 0.1)
    place(out, grain_cloud(rng, 0.12, rng.integers(35, 55), 1500, 7500, t1=0.09, skew=1.2,
                           glen=(0.0004, 0.002)), gap, 0.65)
    place(out, norm(nburst(rng, 0.08, 0.015, 0.0008, hi=500)), gap, 0.25)
    return room(rng, out, 0.3, 0.08, 0.6)


def creak(rng, dur):
    """Stick-slip floorboard creak: jittery pulse train into wood resonances."""
    n = n_of(dur)
    t = tline(n)
    f = rng.uniform(160, 240) * (1 + 0.15 * np.sin(2 * np.pi * 3 * t)) * (1 + 0.05 * lp(rng.standard_normal(n), 40))
    ph = np.cumsum(f) / SR
    pulses = np.diff(np.floor(ph), prepend=0.0)
    x = resonate(pulses, [620, 1100, 1750, 2600], [0.03, 0.025, 0.02, 0.015], [1, 0.7, 0.5, 0.3])
    return norm(x * np.sin(np.pi * t / dur) ** 2)


@sfx("footsteps", "wood", 4, peak_db=-6.0, hp_fc=50)
def fs_wood(rng, v):
    base = rng.uniform(110, 160)

    def part():
        x = np.zeros(n_of(0.3))
        place(x, strike(rng, 0.3, base * j(rng, 0.04), WOOD, 0.12, slope=0.7, hard=0.0012), 0, 1.0)
        place(x, norm(nburst(rng, 0.1, 0.014, 0.0006, hi=800)), 0, 0.6)
        place(x, norm(nburst(rng, 0.02, 0.0015, 0.00005, lo=2000)), 0, 0.25)
        return x
    out = heel_toe(rng, part(), part(), rng.uniform(0.05, 0.08), rng.uniform(0.35, 0.55), 0.45)
    if v == 3:
        place(out, creak(rng, 0.16), 0.09, 0.12)
    return room(rng, out, 0.35, 0.12, 0.5)


@sfx("footsteps", "land_hard", 2, peak_db=-4.0, hp_fc=35)
def land_hard(rng, v):
    out = np.zeros(n_of(0.8))
    place(out, thump(0.4, 90 * j(rng, 0.15), 38 * j(rng, 0.15), 0.02, 0.11 * j(rng, 0.2)), 0, 1.2)
    place(out, norm(nburst(rng, 0.3, 0.07 * j(rng, 0.25), 0.001, hi=450 * j(rng, 0.25), order=4)), 0, 0.9)
    place(out, thump(0.3, 75, 40, 0.02, 0.06), rng.uniform(0.03, 0.06), rng.uniform(0.3, 0.6))  # 2nd foot
    place(out, norm(nburst(rng, 0.03, 0.002, 0.00005, lo=1500)), 0, 0.35)
    place(out, cloth(rng, 0.25, crackle=0.2), 0, 0.3)
    for _ in range(rng.integers(4, 7)):                                               # gear rattle
        place(out, m_click(rng, loguni(rng, 1500, 3500), t60=0.03, nm=6), rng.uniform(0.01, 0.16),
              rng.uniform(0.06, 0.15))
    place(out, grain_cloud(rng, 0.2, 20, 2000, 7000, t1=0.15, skew=2.0), 0.0, 0.12)
    out = sat(out, 2.0)
    return room(rng, out, 0.45, 0.14, 0.6)


@sfx("footsteps", "jump", peak_db=-9.0, hp_fc=60)
def jump(rng, v):
    out = np.zeros(n_of(0.35))
    place(out, cloth(rng, 0.22, crackle=0.2), 0, 0.6)
    place(out, friction(rng, 0.07, 1000, 5000, peak_at=0.3, grit=0.3), 0.0, 0.5)    # shoe scuff
    place(out, norm(nburst(rng, 0.08, 0.012, 0.001, hi=500)), 0.0, 0.4)
    return room(rng, out, 0.3, 0.08, 0.5)


# ============================================================================
# PLAYER
# ============================================================================

@sfx("player", "hurt", 3, peak_db=-3.0)
def hurt(rng, v):
    out = np.zeros(n_of(0.35))
    place(out, thump(0.2, 150 * j(rng, 0.2), 70 * j(rng, 0.2), 0.01, 0.04 * j(rng, 0.25)), 0, j(rng, 0.2))
    place(out, norm(nburst(rng, 0.12, 0.03 * j(rng, 0.3), 0.0006, hi=700 * j(rng, 0.3), order=4)), 0, 0.8 * j(rng, 0.25))
    place(out, norm(nburst(rng, 0.05, 0.012, 0.0003, 600, 3500)), 0, 0.5 * j(rng, 0.4))  # cloth slap
    if v == 2:                                                                        # double hit
        place(out, thump(0.2, 130, 65, 0.01, 0.03), rng.uniform(0.018, 0.03), 0.6)
    place(out, cloth(rng, 0.18, crackle=0.3), 0.01, 0.25)
    place(out, m_click(rng, loguni(rng, 1600, 3000), t60=0.03, nm=5), rng.uniform(0.02, 0.06), 0.08)
    out = sat(out, 1.8)
    return room(rng, out, 0.3, 0.07, 0.4)


@sfx("player", "death_thud", peak_db=-3.0)
def death_thud(rng, v):
    out = np.zeros(n_of(1.3))
    place(out, thump(0.25, 110, 60, 0.012, 0.05), 0.0, 0.6)                         # knees
    place(out, norm(nburst(rng, 0.15, 0.03, 0.001, hi=600)), 0.0, 0.45)
    place(out, thump(0.5, 85, 36, 0.02, 0.14), 0.18, 1.2)                           # torso
    place(out, norm(nburst(rng, 0.35, 0.09, 0.002, hi=420, order=4)), 0.18, 1.0)
    place(out, cloth(rng, 0.4, crackle=0.25), 0.12, 0.35)
    place(out, strike(rng, 0.4, 820, PLATE, 0.14, hard=0.0003, nm=8), 0.25, 0.3)    # weapon clatter
    place(out, strike(rng, 0.3, 860, PLATE, 0.1, hard=0.0003, nm=8), 0.34, 0.15)
    for _ in range(4):
        place(out, m_click(rng, loguni(rng, 1500, 3200), t60=0.03, nm=5), rng.uniform(0.19, 0.4), 0.08)
    place(out, thump(0.2, 120, 70, 0.01, 0.03), 0.44, 0.35)                         # arm settles
    place(out, norm(nburst(rng, 0.1, 0.02, 0.001, hi=700)), 0.44, 0.25)
    out = sat(out, 2.0)
    return room(rng, out, 0.55, 0.14, 0.6)


@sfx("player", "armor_hit", 2, peak_db=-3.0)
def armor_hit(rng, v):
    out = np.zeros(n_of(0.3))
    place(out, norm(nburst(rng, 0.08, 0.014, 0.0003, 200, 2500)), 0, 1.0)
    place(out, thump(0.15, 190 * j(rng, 0.2), 90 * j(rng, 0.2), 0.006, 0.028 * j(rng, 0.25)), 0, 0.85 * j(rng, 0.2))
    place(out, norm(nburst(rng, 0.02, 0.0025, 0.00005, 1000, 5000)), 0, 0.5)      # fabric slap
    place(out, strike(rng, 0.12, rng.uniform(1400, 1900), PLATE, 0.025, hard=0.0003, nm=6), 0, 0.25)
    out = sat(out, 1.8)
    return room(rng, out, 0.25, 0.06, 0.3)


@sfx("player", "heartbeat", peak_db=-6.0, trim=False, fade_in=0.001, fade_out=0.01, hp_fc=18)
def heartbeat(rng, v):
    out = np.zeros(n_of(1.0))

    def beat(f0, f1, dec, gain, at):
        place(out, thump(0.4, f0, f1, 0.02, dec, 0.004), at, gain)
        place(out, norm(lp(nburst(rng, 0.3, dec * 0.8, 0.004, hi=180), 300)), at, 0.4 * gain)
        place(out, thump(0.2, f0 * 2.4, f1 * 2.4, 0.01, dec * 0.5, 0.003), at, 0.22 * gain)  # audible on small speakers
    beat(62, 44, 0.07, 1.0, 0.10)       # "lub" (wrap point sits in the silence before it)
    beat(70, 50, 0.055, 0.75, 0.38)     # "dub"
    return sat(out, 1.5)


# ============================================================================
# BOMB
# ============================================================================

def beep(freq, dur, attack=0.002, release=0.01, harm=(1.0, 0.0, 0.3, 0.0, 0.15)):
    n = n_of(dur)
    t = tline(n)
    x = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(harm) if a)
    e = np.clip(t / attack, 0, 1) * np.clip((dur - t) / release, 0, 1)
    return x * np.sin(0.5 * np.pi * e) ** 2


@sfx("bomb", "bomb_beep", peak_db=-3.0, trim=False)
def bomb_beep(rng, v):
    return beep(2500, 0.08, 0.0015, 0.012)


@sfx("bomb", "bomb_keypress", peak_db=-6.0)
def bomb_keypress(rng, v):
    out = np.zeros(n_of(0.09))
    place(out, p_click(rng, 1800, t60=0.006), 0.0, 0.5)
    place(out, beep(1650, 0.06, 0.002, 0.01), 0.004, 0.8)
    return out


@sfx("bomb", "bomb_planted", peak_db=-4.0)
def bomb_planted(rng, v):
    out = np.zeros(n_of(1.0))
    for k, (f, at) in enumerate([(1760, 0.0), (2217, 0.1), (2637, 0.2)]):
        place(out, beep(f, 0.07), at, 0.8)
    place(out, m_click(rng, 2200, t60=0.02), 0.32, 0.4)                               # arming relay
    n = n_of(0.45)
    t = tline(n)
    fm = 1 + 0.004 * np.sin(2 * np.pi * 9 * t)
    tone = np.sin(2 * np.pi * 2637 * np.cumsum(fm) / SR) + 0.6 * np.sin(2 * np.pi * 3520 * np.cumsum(fm) / SR)
    e = np.clip(t / 0.004, 0, 1) * np.clip((0.45 - t) / 0.08, 0, 1)
    place(out, tone * e, 0.33, 0.7)
    return room(rng, out, 0.3, 0.06, 0.4)


@sfx("bomb", "defuse_start", peak_db=-6.0)
def defuse_start(rng, v):
    out = np.zeros(n_of(0.75))
    place(out, cloth(rng, 0.4, crackle=0.3), 0.0, 0.4)
    place(out, p_click(rng, 1200, t60=0.012), 0.05, 0.7)                             # case latches
    place(out, p_click(rng, 1250, t60=0.012), 0.12, 0.7)
    for _ in range(7):                                                               # tools rattle
        place(out, m_click(rng, loguni(rng, 1800, 5200), t60=rng.uniform(0.02, 0.06), nm=6),
              rng.uniform(0.16, 0.5), rng.uniform(0.25, 0.6))
    place(out, m_click(rng, 2600, t60=0.025), 0.55, 0.8)                             # clip snaps on
    place(out, m_click(rng, 3400, t60=0.015), 0.565, 0.5)
    return room(rng, out, 0.3, 0.08, 0.4)


@sfx("bomb", "defuse_wire", peak_db=-6.0)
def defuse_wire(rng, v):
    out = np.zeros(n_of(0.4))
    place(out, friction(rng, 0.04, 2000, 7000, peak_at=0.8, grit=0.4), 0.0, 0.25)  # blades close
    place(out, m_click(rng, 3600, t60=0.015, hard=0.00006, noise=0.9), 0.04, 1.0)   # snip
    place(out, norm(nburst(rng, 0.02, 0.003, 0.00005, 2000, 9000)), 0.04, 0.5)
    n = n_of(0.3)
    t = tline(n)
    f = 1150 + 150 * np.exp(-t / 0.02)
    tw = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    tw += 0.4 * np.sin(2 * np.pi * np.cumsum(f * 2.756) / SR) * np.exp(-t / 0.025)
    tw *= (1 + 0.3 * np.sin(2 * np.pi * 30 * t)) * np.clip(t / 0.0008, 0, 1)
    place(out, tw, 0.041, 0.35)                                                      # wire twang
    return room(rng, out, 0.25, 0.06, 0.3)


@sfx("bomb", "bomb_defused", peak_db=-4.0)
def bomb_defused(rng, v):
    out = np.zeros(n_of(1.6))
    for f, at in [(2637, 0.0), (1976, 0.12), (1480, 0.24)]:
        place(out, beep(f, 0.07), at, 0.7)
    d = 0.95
    n = n_of(d)
    t = tline(n)
    fm = (90 / 1100) ** (t / d)
    env = np.clip(t / 0.01, 0, 1) * (1 - t / d) ** 1.5
    pd = synth(1100, d, env, cutoff=5000 * fm + 300, wave="square", fmul=fm)
    place(out, pd, 0.38, 0.8)
    place(out, m_click(rng, 1600, t60=0.02), 1.36, 0.25)                             # relay drops out
    place(out, clunk(rng, 180, 0.03), 1.36, 0.25)
    return room(rng, out, 0.4, 0.08, 0.5)


def explosion_layers(rng, size=1.0, dur=4.6):
    n = n_of(dur)
    core = np.zeros(n_of(3.6))
    nb = n_of(2.4)
    e = env_exp(nb, 0.05 * size, 0.0006) + 0.5 * env_exp(nb, 0.3 * size, 0.015)
    place(core, norm(bp(rng.standard_normal(nb) * e, 70, 3800, 2)), 0.001, 1.0)          # blast
    place(core, norm(nburst(rng, 0, 0.18 * size, 0.004, 180, 1400)), 0.002, 0.8)       # mid bloom
    place(core, thump(0, 72, 26, 0.07 * size, 0.3 * size, 0.0025), 0.0015, 0.85)       # sub boom
    place(core, norm(nburst(rng, 0, 0.28 * size, 0.008, hi=150, order=4)), 0.003, 0.45)
    core = peq(core, 60, 2.0, 0.7)
    core = sat(core, 4.0)
    # unsquashed crack on top so the onset stays the sharpest, loudest moment
    place(core, nwave(0.0011 * size ** 0.3, 9000), 0.001, 0.9)
    place(core, norm(nburst(rng, 0.1, 0.004, 0.00008, lo=1500)), 0.001, 0.8)
    # debris rumble
    t = tline(n)
    am = 0.55 + 0.45 * norm(lp(rng.standard_normal(n), 5, 2))
    renv = (1 - np.exp(-t / 0.15)) * np.exp(-t / (0.85 * size))
    rumble = norm(lp(rng.standard_normal(n) * am * renv, 700, 4))
    # falling debris: small chips, chunks and the odd bit of metal
    deb = grain_cloud(rng, dur, int(120 * size), 500, 6000, t0=0.25, t1=3.0 * size, skew=1.8,
                      decay=0.9 * size, glen=(0.0008, 0.005), q=(1.0, 4.0))
    for _ in range(int(9 * size)):
        at = 0.3 + 2.2 * size * rng.uniform() ** 1.5
        place(deb, clunk(rng, rng.uniform(120, 300), 0.02, lpf=1200), at, 0.6 * np.exp(-at / (0.9 * size)))
    for _ in range(int(5 * size)):
        at = 0.4 + 2.0 * size * rng.uniform() ** 1.3
        place(deb, m_click(rng, loguni(rng, 900, 3000), t60=0.08, nm=7), at, 0.8 * np.exp(-at / size))
    ir = make_ir(rng, 3.4 * size, 2.6 * size, predelay=0.012, early=early_taps(rng, 1.6, 6, 0.01, 0.12),
                 color_lp=3500)
    tail = sps.fftconvolve(lp(core, 2500, 2), ir)
    return core, rumble, norm(lp(deb, 4500, 2)), tail


@sfx("bomb", "explosion", peak_db=-1.0, hp_fc=16, max_dur=3.6)
def explosion(rng, v):
    core, rumble, deb, tail = explosion_layers(rng, 1.0)
    return mixsum(core, 0.3 * rumble, 0.16 * deb, 0.4 * tail)


@sfx("bomb", "explosion_distant", peak_db=-3.0, hp_fc=16, max_dur=3.6)
def explosion_distant(rng, v):
    core, rumble, deb, tail = explosion_layers(rng, 1.0)
    n = len(core)
    soft = np.clip(tline(n) / 0.03, 0, 1) ** 2                                     # no sharp front
    direct = lp(lp(core * soft, 650, 2), 900, 2)
    far_ir = make_ir(rng, 3.6, 3.0, predelay=0.03, early=early_taps(rng, 3.0, 6, 0.03, 0.25), color_lp=1500)
    far = sps.fftconvolve(direct, far_ir)
    mix = mixsum(0.6 * direct, 0.55 * lp(rumble, 300, 2), 0.05 * lp(deb, 1500, 2), 1.1 * far)
    return np.concatenate([np.zeros(n_of(0.015)), mix])


# ============================================================================
# GRENADES
# ============================================================================

def canister_hit(rng, gain=1.0):
    x = np.zeros(n_of(0.4))
    place(x, strike(rng, 0.4, rng.uniform(720, 880), PLATE, 0.14, slope=0.5, hard=0.00015, nm=10), 0, 1.0)
    place(x, clunk(rng, 260, 0.012, dur=0.08, lpf=1500), 0, 0.5)
    place(x, norm(nburst(rng, 0.02, 0.001, 0.00004, lo=2500)), 0, 0.5)
    return x * gain


@sfx("grenades", "grenade_bounce", 2, peak_db=-4.0)
def grenade_bounce(rng, v):
    out = np.zeros(n_of(0.9))
    place(out, canister_hit(rng), 0.0)
    if v == 1:
        place(out, canister_hit(rng, 0.45), rng.uniform(0.14, 0.18))
        place(out, canister_hit(rng, 0.18), rng.uniform(0.25, 0.28))
    else:
        t = 0.09
        for k in range(10):                                                          # roll / rattle
            place(out, strike(rng, 0.12, rng.uniform(1300, 1700), PLATE, 0.04, hard=0.0002, nm=6),
                  t, 0.25 * (1 - k / 11))
            t += rng.uniform(0.03, 0.055)
    return room(rng, out, 0.5, 0.15, 0.6)


@sfx("grenades", "grenade_pin", peak_db=-6.0)
def grenade_pin(rng, v):
    out = np.zeros(n_of(0.45))
    place(out, friction(rng, 0.06, 2000, 8000, peak_at=0.7, grit=0.5), 0.0, 0.45)
    place(out, strike(rng, 0.4, 3800, BEAM, 0.18, slope=0.3, hard=0.00008), 0.06, 0.7)   # pin ring 'tink'
    place(out, m_click(rng, 2400, t60=0.015, hard=0.0001), 0.058, 0.8)
    place(out, strike(rng, 0.3, 5600, BEAM, 0.25, slope=0.2, hard=0.00006), 0.065, 0.25)  # spring
    return room(rng, out, 0.3, 0.08, 0.4)


@sfx("grenades", "smoke_hiss", peak_db=-6.0, loop=True)
def smoke_hiss(rng, v):
    n = n_of(2.5)
    hiss = periodic_noise(rng, n, lambda f: (1 / (1 + (1400 / f) ** 4)) * (1 / (1 + (f / 12000) ** 4))
                          * (1 + 1.2 * np.exp(-0.5 * ((f - 5000) / 1500) ** 2)))
    roar = periodic_noise(rng, n, lambda f: 1 / (1 + (250 / f) ** 2) / (1 + (f / 900) ** 4))
    u = np.arange(n) / n
    am = 1 + 0.08 * np.sin(2 * np.pi * 3 * u) + 0.05 * np.sin(2 * np.pi * 7 * u + 1) + \
        0.12 * periodic_smooth(rng, n, 6.0)
    flutter = 1 + 0.06 * periodic_smooth(rng, n, 40.0)
    return (hiss * am * flutter + 0.25 * roar * am)


@sfx("grenades", "flash_bang", peak_db=-1.0, max_dur=2.6)
def flash_bang(rng, v):
    core = np.zeros(n_of(0.6))
    place(core, nwave(0.0005), 0.0008, 0.9)
    place(core, norm(nburst(rng, 0.03, 0.0025, 0.00005, lo=1800)), 0.0008, 1.0)
    nb = n_of(0.4)
    place(core, norm(bp(rng.standard_normal(nb) * env_exp(nb, 0.025, 0.0003), 200, 6000)), 0.0008, 1.0)
    place(core, thump(0.4, 150, 55, 0.012, 0.07), 0.001, 1.0)
    core = sat(core, 3.0)
    tail = sps.fftconvolve(lp(core, 4000), industrial_ir(rng, 1.1, 1.2, 4500))
    n = n_of(2.6)
    t = tline(n)
    ring = (np.sin(2 * np.pi * 3980 * t) + 0.8 * np.sin(2 * np.pi * 4012 * t) + 0.15 * np.sin(2 * np.pi * 7964 * t))
    ring *= (1 - np.exp(-t / 0.05)) * np.exp(-t / 0.75)
    out = mixsum(core, 0.45 * tail)
    return mixsum(out, np.concatenate([np.zeros(n_of(0.02)), 0.09 * ring]))


@sfx("grenades", "he_explosion", peak_db=-1.0, hp_fc=18, max_dur=2.4)
def he_explosion(rng, v):
    core, rumble, deb, tail = explosion_layers(rng, 0.6, dur=3.0)
    return mixsum(core, 0.25 * rumble, 0.2 * deb, 0.5 * tail)


# ============================================================================
# UI
# ============================================================================

@sfx("ui", "click", peak_db=-6.0)
def ui_click(rng, v):
    out = np.zeros(n_of(0.06))
    place(out, norm(nburst(rng, 0.01, 0.0007, 0.00003, lo=2000)), 0, 0.5)
    place(out, bell_tone(1750, 0.05, 0.035, ratios=[1.0, 2.0], gains=[1.0, 0.25]), 0, 1.0)
    place(out, bell_tone(520, 0.05, 0.05, ratios=[1.0], gains=[1.0]), 0, 0.3)
    return out


@sfx("ui", "hover", peak_db=-16.0)
def ui_hover(rng, v):
    n = n_of(0.06)
    t = tline(n)
    e = np.sin(np.pi * np.clip(t / 0.035, 0, 1)) ** 2
    return (np.sin(2 * np.pi * 2400 * t) + 0.2 * np.sin(2 * np.pi * 4800 * t)) * e


@sfx("ui", "buy_confirm", peak_db=-6.0)
def buy_confirm(rng, v):
    out = np.zeros(n_of(0.8))
    place(out, m_click(rng, 2600, t60=0.02), 0.0, 0.35)                              # drawer latch
    place(out, bell_tone(1975, 0.7, 0.45, rng=rng), 0.025, 0.8)
    place(out, bell_tone(2960, 0.7, 0.6, rng=rng), 0.105, 1.0)
    place(out, m_click(rng, 5200, t60=0.06, nm=5), 0.11, 0.15)                       # coin shimmer
    place(out, m_click(rng, 6100, t60=0.05, nm=5), 0.15, 0.1)
    return room(rng, out, 0.35, 0.08, 0.4)


@sfx("ui", "buy_deny", peak_db=-6.0)
def buy_deny(rng, v):
    out = np.zeros(n_of(0.32))
    for at in (0.0, 0.16):
        n = n_of(0.12)
        t = tline(n)
        e = np.clip(t / 0.003, 0, 1) * np.clip((0.12 - t) / 0.012, 0, 1)
        z = synth(92, 0.12, e, cutoff=1600, wave="saw", detune=(0, 95), rng=rng)
        z += 0.4 * synth(92, 0.12, e, cutoff=1200, wave="square", rng=rng)
        place(out, z, at, 1.0)
    return out


@sfx("ui", "money_ping", peak_db=-6.0)
def money_ping(rng, v):
    out = np.zeros(n_of(0.6))
    place(out, norm(nburst(rng, 0.01, 0.0005, 0.00003, lo=4000)), 0, 0.25)
    place(out, bell_tone(2793, 0.6, 0.5, rng=rng), 0.002, 1.0)
    place(out, bell_tone(4186, 0.4, 0.3, rng=rng), 0.045, 0.4)
    return out


def drum_hit(rng, f0=110, f1=45, decay=0.25, noise=0.4, nlp=2500):
    x = np.zeros(n_of(decay * 6))
    place(x, thump(decay * 6, f0, f1, 0.02, decay, 0.001), 0, 1.0)
    place(x, norm(nburst(rng, decay * 3, decay * 0.25, 0.0005, hi=nlp)), 0, noise)
    return x


def chord(notes, dur, env, cutoff, wave="saw", detune=(-7, 0, 7), rng=None, vib=0.0):
    return sum(synth(hz(m), dur, env, cutoff, wave, detune, rng, vib=vib) for m in notes) / np.sqrt(len(notes))


@sfx("ui", "round_start", peak_db=-4.0, max_dur=1.6, trim_db=-50)
def round_start(rng, v):
    total = 1.7
    out = np.zeros(n_of(total + 0.8))
    hit_t = 1.05
    # accelerating low pulses on D
    pulses = [0.0, 0.3, 0.55, 0.74, 0.88, 0.97]
    for i, at in enumerate(pulses):
        d = 0.18
        n = n_of(d)
        e = env_exp(n, 0.06, 0.003)
        cut = 300 + 2200 * (at / hit_t)
        place(out, synth(hz(38), d, e, cut, "saw", (-6, 6), rng), at, 0.55 + 0.25 * i / len(pulses))
        place(out, thump(0.2, 90, 50, 0.01, 0.05), at, 0.35)
    # riser
    rn = n_of(hit_t)
    u = tline(rn) / hit_t
    _, r, _ = svf(rng.standard_normal(rn), 400 * (6000 / 400) ** u, 2.0)
    place(out, norm(r) * u ** 2.2, 0.0, 0.35)
    # tense stab: D2 + D3 A3 D#4 (minor 9th)
    sd = total - hit_t
    sn = n_of(sd)
    e = env_exp(sn, 0.22, 0.002)
    cut = 600 + 3800 * np.exp(-tline(sn) / 0.08)
    place(out, chord([38, 50, 57, 63], sd, e, cut, rng=rng), hit_t, 1.2)
    place(out, drum_hit(rng, 100, 40, 0.2, 0.5), hit_t, 0.9)
    return room(rng, out, 0.9, 0.16, 1.0)


@sfx("ui", "round_win", peak_db=-4.0, max_dur=2.1, trim_db=-50)
def round_win(rng, v):
    out = np.zeros(n_of(2.4))
    for i, m in enumerate([72, 76, 79, 84]):                                         # C E G C arpeggio
        d = 0.5
        n = n_of(d)
        e = env_exp(n, 0.16, 0.002)
        cut = 1500 + 5000 * np.exp(-tline(n) / 0.06)
        place(out, synth(hz(m), d, e, cut, "saw", (-5, 5), rng) + 0.5 * synth(hz(m), d, e, cut, "square", (0,), rng),
              0.07 * i, 0.55)
    d = 1.9
    n = n_of(d)
    e = env_pts(n, [(0, 0), (0.03, 1), (0.5, 0.75), (d, 0)]) ** 1.5
    cut = 1200 + 2500 * env_pts(n, [(0, 0.2), (0.15, 1), (d, 0.3)])
    place(out, chord([48, 60, 64, 67, 72, 74], d, e, cut, rng=rng), 0.28, 0.9)       # C major add9, bright
    place(out, drum_hit(rng, 120, 50, 0.18, 0.4), 0.28, 0.6)
    for at, m in [(0.32, 96), (0.45, 91), (0.6, 100)]:                               # sparkle
        place(out, bell_tone(hz(m), 0.8, 0.5, rng=rng), at, 0.12)
    return room(rng, out, 1.1, 0.2, 1.0)


@sfx("ui", "round_lose", peak_db=-4.0, max_dur=2.4, trim_db=-50)
def round_lose(rng, v):
    out = np.zeros(n_of(2.6))
    place(out, drum_hit(rng, 70, 34, 0.4, 0.25, 900), 0.0, 0.8)
    d = 2.2
    n = n_of(d)
    e = env_pts(n, [(0, 0), (0.25, 1), (1.5, 0.7), (d, 0)])
    place(out, chord([45, 52, 60], d, e, 700 + 300 * env_pts(n, [(0, 0), (0.4, 1), (d, 0)]), rng=rng), 0.0, 0.9)
    for (m, at, dd) in [(64, 0.05, 0.38), (62, 0.42, 0.38), (60, 0.8, 0.5), (59, 1.3, 0.85)]:
        nn = n_of(dd)
        ee = env_pts(nn, [(0, 0), (0.02, 1), (dd * 0.6, 0.6), (dd, 0)])
        place(out, synth(hz(m), dd, ee, 1300, "square", (-4, 4), rng, vib=0.004), at, 0.45)
    return room(rng, out, 1.3, 0.22, 1.0)


@sfx("ui", "match_win", peak_db=-4.0, max_dur=3.6, trim_db=-50)
def match_win(rng, v):
    out = np.zeros(n_of(4.0))
    seq = [([48, 60, 64, 67], 0.0, 0.45), ([53, 60, 65, 69], 0.45, 0.45), ([55, 62, 67, 71], 0.9, 0.45)]
    for notes, at, d in seq:                                                         # C  F  G  (brassy)
        n = n_of(d + 0.1)
        e = env_pts(n, [(0, 0), (0.015, 1), (d * 0.7, 0.7), (d + 0.1, 0)])
        cut = 900 + 3200 * np.exp(-tline(n) / 0.12)
        place(out, chord(notes, d + 0.1, e, cut, rng=rng), at, 0.85)
        place(out, drum_hit(rng, 110, 70, 0.22, 0.35), at, 0.55)
    d = 2.2                                                                          # big C
    n = n_of(d)
    e = env_pts(n, [(0, 0), (0.02, 1), (1.0, 0.8), (d, 0)]) ** 1.3
    cut = 1400 + 3500 * env_pts(n, [(0, 0.3), (0.2, 1), (d, 0.25)])
    place(out, chord([36, 48, 60, 64, 67, 72, 76], d, e, cut, rng=rng), 1.35, 1.0)
    place(out, drum_hit(rng, 100, 42, 0.35, 0.5), 1.35, 0.9)
    for i, m in enumerate([84, 88, 91, 96, 91, 96, 100]):
        place(out, bell_tone(hz(m), 0.7, 0.45, rng=rng), 1.4 + 0.09 * i, 0.12)
    return room(rng, out, 1.3, 0.22, 1.0)


@sfx("ui", "match_lose", peak_db=-4.0, max_dur=3.9, trim_db=-50)
def match_lose(rng, v):
    out = np.zeros(n_of(4.8))
    toll = bell_tone(hz(45), 3.5, 3.0, ratios=[0.5, 1.0, 1.19, 1.5, 2.0, 2.52, 3.0], rng=rng)
    place(out, lp(toll, 1500, 2), 0.0, 0.5)                                          # low funeral toll
    place(out, drum_hit(rng, 65, 32, 0.45, 0.2, 700), 0.0, 0.7)
    seq = [([45, 52, 57, 60], 0.0, 1.0), ([41, 53, 57, 60], 0.9, 1.0), ([38, 50, 53, 57], 1.8, 0.95),
           ([33, 45, 52, 57, 60], 2.65, 1.5)]
    for notes, at, d in seq:                                                         # Am F Dm Am
        n = n_of(d + 0.3)
        e = env_pts(n, [(0, 0), (0.25, 1), (d, 0.7), (d + 0.3, 0)])
        place(out, chord(notes, d + 0.3, e, 650, rng=rng), at, 0.8)
    for (m, at, dd) in [(76, 0.1, 0.8), (74, 0.95, 0.8), (72, 1.85, 0.8), (69, 2.7, 1.3)]:
        nn = n_of(dd)
        ee = env_pts(nn, [(0, 0), (0.05, 1), (dd * 0.6, 0.6), (dd, 0)])
        place(out, synth(hz(m), dd, ee, 1500, "tri", (-4, 4), rng, vib=0.005), at, 0.5)
    return room(rng, out, 1.4, 0.22, 1.0)


@sfx("ui", "kill_ping", peak_db=-9.0)
def kill_ping(rng, v):
    out = np.zeros(n_of(0.14))
    place(out, norm(nburst(rng, 0.008, 0.0005, 0.00003, lo=3000)), 0, 0.4)
    place(out, bell_tone(1900, 0.13, 0.09, ratios=[1.0, 1.5, 3.0], gains=[1.0, 0.35, 0.15]), 0.0, 1.0)
    return out


@sfx("ui", "hitmarker", peak_db=-8.0)
def hitmarker(rng, v):
    out = np.zeros(n_of(0.035))
    place(out, norm(nburst(rng, 0.006, 0.0004, 0.00002, lo=2500)), 0, 0.6)
    place(out, bell_tone(3600, 0.035, 0.018, ratios=[1.0, 1.9], gains=[1.0, 0.3], attack=0.0002), 0, 1.0)
    return out


# ============================================================================
# AMBIENCE (seamless loops built periodically: every component repeats with
# the loop length, events wrap around, and reverb is a circular convolution)
# ============================================================================

@sfx("ambience", "industrial_loop", peak_db=-12.0, loop=True)
def industrial_loop(rng, v):
    L = 24.0
    n = n_of(L)
    u = np.arange(n) / n                       # loop phase 0..1
    t = u * L

    def per(f):                                # snap a frequency so it repeats exactly in L
        return round(f * L) / L

    # 1) machinery hum: mains-like 50 Hz family + a slower motor drone with beating
    hum = np.zeros(n)
    for k, a in [(1, 1.0), (2, 0.55), (3, 0.3), (4, 0.12), (6, 0.05)]:
        hum += a * np.sin(2 * np.pi * per(50.0 * k) * t + rng.uniform(0, 6.28))
    hum *= 1 + 0.18 * np.sin(2 * np.pi * 3 * u + 0.7)
    motor = sum(a * np.sin(2 * np.pi * per(74.6 * k) * t + rng.uniform(0, 6.28))
                for k, a in [(1, 1.0), (2, 0.4), (3, 0.25), (5, 0.08)])
    motor += 0.7 * np.sin(2 * np.pi * per(75.1) * t)
    motor *= 0.6 + 0.4 * periodic_smooth(rng, n, 0.25)
    rumble = periodic_noise(rng, n, lambda f: 1 / (1 + (f / 140) ** 4) / (1 + (25 / f) ** 4))
    whir = periodic_noise(rng, n, lambda f: np.exp(-0.5 * ((f - 680) / 60) ** 2))
    whir *= 0.5 + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * 5 * u))

    # 2) distant rhythmic press (16 cycles per loop) and metallic clanks
    press = np.zeros(n)
    period = L / 16
    for k in range(16):
        g = rng.uniform(0.5, 1.0)
        add_circ(press, lp(drum_hit(rng, 80, 45, 0.08, 0.6, 600), 500), k * period, g)
        add_circ(press, lp(drum_hit(rng, 95, 55, 0.05, 0.6, 600), 500), k * period + period * 0.5, 0.5 * g)
    clanks = np.zeros(n)
    for ct in np.sort(rng.uniform(0, L, 8)):
        c = strike(rng, 1.6, rng.uniform(260, 700), PLATE, rng.uniform(0.6, 1.4), slope=0.5,
                   hard=0.0004, nm=10)
        c = lp(mixsum(c, 0.3 * norm(nburst(rng, 0.05, 0.003, 0.0001, lo=1500))), 2200, 2)
        add_circ(clanks, c, ct, rng.uniform(0.45, 1.0))

    # 3) far-off horn-like drone: an original 3-voice chord with a Doppler droop as it recedes
    hd = 8.0
    hn = n_of(hd)
    ht = tline(hn)
    henv = np.clip(ht / 1.6, 0, 1) ** 2 * np.clip((hd - ht) / 3.0, 0, 1) ** 1.5
    droop = 1 - 0.018 * np.clip((ht - 4.5) / 3.5, 0, 1) ** 2
    horn = np.zeros(n)
    add_circ(horn, sum(synth(f, hd, henv, 650, "saw", (-5, 4), rng, fmul=droop) for f in (138.0, 164.5, 220.5)),
             11.0)

    # everything distant sits in the same big hall (circular convolution keeps the loop seamless)
    hall = make_ir(rng, 3.6, 3.0, predelay=0.04, early=early_taps(rng, 3.0, 6, 0.02, 0.2), color_lp=3000)

    def far(x, dry=0.25):
        return norm(dry * x + circ_convolve(x, hall))

    # 4) faint wind through the structure
    wind = periodic_noise(rng, n, lambda f: 1 / (1 + (300 / f) ** 2) / (1 + (f / 1600) ** 3))
    wind *= 0.35 + 0.65 * (0.5 + 0.5 * periodic_smooth(rng, n, 0.2))

    # stems are peak-normalised, then mixed at fixed levels
    return (0.12 * norm(hum) + 0.08 * norm(motor) + 0.18 * norm(rumble) + 0.04 * norm(whir)
            + 0.16 * far(press) + 0.45 * far(clanks) + 0.10 * far(horn) + 0.08 * norm(wind))


@sfx("ambience", "wind_loop", peak_db=-12.0, loop=True)
def wind_loop(rng, v):
    L = 12.0
    n = n_of(L)
    base = periodic_noise(rng, n, lambda f: (1 / np.sqrt(f)) / (1 + (f / 900) ** 2) / (1 + (60 / f) ** 4))
    gust = 0.5 + 0.5 * periodic_smooth(rng, n, 0.35)                                # 0..1
    bright = periodic_noise(rng, n, lambda f: 1 / (1 + (800 / f) ** 2) / (1 + (f / 3000) ** 4))
    x = base * (0.35 + 0.65 * gust) + 0.35 * bright * gust ** 2
    for fc in (520.0, 780.0, 1150.0):                                                 # soft whistles
        nb = periodic_noise(rng, n, lambda f, c=fc: np.exp(-0.5 * ((f - c) / (c / 40)) ** 2))
        x += 0.12 * nb * (0.5 + 0.5 * periodic_smooth(rng, n, 0.3)) ** 3 * gust
    return x


# ============================================================================
# Driver
# ============================================================================

def out_path(cat, name):
    return os.path.join(OUT_DIR, cat, name + ".wav")


def render(index):
    cat, name, fn, v, fin = REGISTRY[index]
    rng = np.random.default_rng([zlib.crc32(f"{cat}/{name}".encode()), SEED_BASE])
    t0 = time.time()
    x = finalize(fn(rng, v), **fin)
    path = out_path(cat, name)
    write_wav(path, x)
    return f"{cat}/{name}.wav", len(x) / SR, time.time() - t0


def file_list():
    return [f"{c}/{n}.wav" for c, n, _, _, _ in REGISTRY]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="glob on category/name, e.g. 'weapons/*shot*'")
    ap.add_argument("--list", action="store_true", help="print output file list and exit")
    ap.add_argument("--jobs", type=int, default=min(4, os.cpu_count() or 1))
    args = ap.parse_args()
    if args.list:
        print("\n".join(file_list()))
        return
    idx = [i for i, (c, n, *_r) in enumerate(REGISTRY) if not args.only or fnmatch.fnmatch(f"{c}/{n}", args.only)]
    missing = [f for f in file_list() if f not in __doc__]
    if missing:
        print("WARNING: docstring is missing:", ", ".join(missing))
    t0 = time.time()
    if args.jobs > 1 and len(idx) > 1:
        with ProcessPoolExecutor(args.jobs) as ex:
            results = list(ex.map(render, idx))
    else:
        results = [render(i) for i in idx]
    for rel, dur, el in results:
        print(f"  {rel:42s} {dur:6.3f} s   ({el:4.2f} s)")
    print(f"Generated {len(results)} files into {OUT_DIR} in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
