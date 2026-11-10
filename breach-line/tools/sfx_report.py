#!/usr/bin/env python3
"""Breach Line SFX QA report.

Prints, for every WAV under assets/audio: duration, peak dBFS, RMS dBFS,
T-20 (time until the short-term level last falls 20 dB below its maximum),
DC offset, clipped-sample count, start/end edge levels and, for loops,
the seam (wrap-around) continuity. Exits non-zero if any check fails.

Usage (from breach-line/):
    python3 tools/sfx_report.py
    python3 tools/sfx_report.py --spectrograms OUT_DIR weapons/ravager_shot_1 bomb/explosion ...

Spectrograms (numpy + Pillow) show a dB envelope strip on top and a
log-frequency spectrogram below; for loops an extra *_seam.png shows the
last second followed by the first second, so the wrap point sits mid-image.
"""

import argparse
import os
import sys
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "assets", "audio")
SR = 44100

LOOPS = {"ambience/industrial_loop", "ambience/wind_loop", "grenades/smoke_hiss", "player/heartbeat"}
CLIP_LEVEL = 32767
DC_LIMIT_DB = -60.0       # |mean| must be below this
EDGE_LIMIT_DB = -50.0     # first/last sample of one-shots must be below this
SEAM_PCTL_LIMIT = 99.9    # wrap jump must not exceed this percentile of |diff|


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def read_wav(path):
    with wave.open(path, "rb") as w:
        fmt = (w.getnchannels(), w.getsampwidth(), w.getframerate())
        raw = w.readframes(w.getnframes())
    pcm = np.frombuffer(raw, dtype="<i2")
    return pcm, fmt


def short_term_db(x, win=0.005):
    n = max(1, int(win * SR))
    m = len(x) // n
    if m == 0:
        return np.array([db(np.sqrt(np.mean(x ** 2)))])
    blocks = x[:m * n].reshape(m, n)
    return 20 * np.log10(np.sqrt(np.mean(blocks ** 2, axis=1)) + 1e-12)


def analyse(rel, pcm, fmt):
    x = pcm.astype(np.float64) / 32768.0
    key = rel[:-4]
    res = {"file": rel, "problems": []}
    if fmt != (1, 2, SR):
        res["problems"].append(f"format {fmt} != mono/16-bit/{SR}")
    res["dur"] = len(x) / SR
    res["peak"] = db(np.max(np.abs(x)))
    res["rms"] = db(np.sqrt(np.mean(x ** 2)))
    st = short_term_db(x)
    above = np.nonzero(st > st.max() - 20)[0]
    res["t20"] = (above[-1] + 1) * 0.005 if len(above) else 0.0
    res["dc"] = db(abs(np.mean(x)))
    res["clips"] = int(np.sum((pcm >= CLIP_LEVEL) | (pcm <= -CLIP_LEVEL)))
    res["edge"] = max(db(abs(x[0])), db(abs(x[-1])))
    res["seam"] = ""
    if res["dc"] > DC_LIMIT_DB:
        res["problems"].append(f"DC offset {res['dc']:.1f} dBFS")
    if res["clips"]:
        res["problems"].append(f"{res['clips']} clipped samples")
    if key in LOOPS:
        d = np.abs(np.diff(x))
        jump = abs(x[0] - x[-1])
        pct = 100.0 * np.mean(d < jump)
        ratio = jump / (np.median(d) + 1e-12)
        # level continuity: the 20 ms-block level step across the seam (last block -> first
        # block) must be typical of the steps between adjacent blocks inside the file.
        w = int(0.02 * SR)
        m = len(x) // w
        lv = np.maximum(20 * np.log10(np.sqrt(np.mean(x[:m * w].reshape(m, w) ** 2, axis=1)) + 1e-12), -70.0)
        steps = np.abs(np.diff(lv))
        seam_step = abs(max(db(np.sqrt(np.mean(x[-w:] ** 2))), -70.0) - lv[0])
        lpct = 100.0 * np.mean(steps < seam_step)
        res["seam"] = (f"wrap jump={jump:.5f} ({ratio:.2f}x median |diff|, pctl {pct:.1f}); "
                       f"level step {seam_step:.1f} dB (pctl {lpct:.1f})")
        if pct > SEAM_PCTL_LIMIT:
            res["problems"].append("loop seam discontinuity")
        if lpct > SEAM_PCTL_LIMIT and seam_step > 1.0:
            res["problems"].append("loop seam level jump")
    elif res["edge"] > EDGE_LIMIT_DB:
        res["problems"].append(f"edge sample {res['edge']:.1f} dBFS (click risk)")
    return res


def collect():
    files = []
    for dirpath, _, names in os.walk(AUDIO):
        for nm in names:
            if nm.lower().endswith(".wav"):
                p = os.path.join(dirpath, nm)
                files.append((os.path.relpath(p, AUDIO).replace(os.sep, "/"), p))
    return sorted(files)


# ----------------------------------------------------------------------------
# Spectrograms (numpy + Pillow)
# ----------------------------------------------------------------------------

_CMAP = np.array([[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66],
                  [245, 125, 21], [250, 193, 39], [252, 255, 164]], dtype=float)


def colormap(v):
    v = np.clip(v, 0, 1) * (len(_CMAP) - 1)
    i = np.minimum(v.astype(int), len(_CMAP) - 2)
    f = (v - i)[..., None]
    return (_CMAP[i] * (1 - f) + _CMAP[i + 1] * f).astype(np.uint8)


def stft_at(x, centers, nfft):
    pad = np.concatenate([np.zeros(nfft // 2), x, np.zeros(nfft // 2)])
    win = np.hanning(nfft)
    idx = centers[:, None] + np.arange(nfft)[None, :]
    frames = pad[idx] * win
    return np.abs(np.fft.rfft(frames, axis=1)) / np.sqrt(np.sum(win ** 2))  # PSD scaling: noise level independent of nfft


def spectrogram(x, out_png, title, width=1000, spec_h=420, env_h=130, fmin=20.0, fmax=20000.0, floor=-100.0):
    from PIL import Image, ImageDraw, ImageFont

    n = len(x)
    centers = np.linspace(0, n - 1, width).astype(int)
    long_n = 4096 if n > 3 * SR else 2048
    short_n = 512 if n < 2 * SR else 1024
    S_long = stft_at(x, centers, long_n)
    S_short = stft_at(x, centers, short_n)
    rows = fmin * (fmax / fmin) ** (np.arange(spec_h)[::-1] / (spec_h - 1))
    img = np.zeros((spec_h, width))
    for S, nfft, sel in ((S_long, long_n, rows < 300), (S_short, short_n, rows >= 300)):
        bins = rows[sel] * nfft / SR
        b0 = np.clip(np.floor(bins).astype(int), 0, S.shape[1] - 2)
        fr = bins - b0
        img[sel] = (S[:, b0] * (1 - fr) + S[:, b0 + 1] * fr).T
    img_db = 20 * np.log10(img + 1e-12)
    img_db -= img_db.max()
    rgb = colormap((img_db - floor) / -floor)

    L, R, T, B = 64, 16, 26, 34
    W, H = L + width + R, T + env_h + 8 + spec_h + B
    canvas = Image.new("RGB", (W, H), (18, 18, 22))
    canvas.paste(Image.fromarray(rgb, "RGB"), (L, T + env_h + 8))
    d = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    d.text((L, 6), title, fill=(230, 230, 230), font=font)

    # envelope strip: per-column peak and 10 ms RMS in dBFS (-60..0)
    edges = np.linspace(0, n, width + 1).astype(int)
    hop = max(1, int(0.01 * SR))
    pk = np.array([np.max(np.abs(x[a:max(b, a + 1)])) for a, b in zip(edges[:-1], edges[1:])])
    rms = np.array([np.sqrt(np.mean(x[max(0, c - hop // 2):c + hop // 2 + 1] ** 2)) for c in centers])
    y0 = T

    def ypos(v_db):
        return y0 + env_h - int(np.clip((v_db + 60) / 60, 0, 1) * env_h)
    d.rectangle([L, y0, L + width, y0 + env_h], outline=(70, 70, 80))
    for g in (-12, -24, -36, -48):
        d.line([L, ypos(g), L + width, ypos(g)], fill=(45, 45, 55))
        d.text((8, ypos(g) - 6), f"{g} dB", fill=(150, 150, 160), font=font)
    for c in range(width):
        d.line([L + c, y0 + env_h, L + c, ypos(db(pk[c]))], fill=(70, 130, 200))
    pts = [(L + c, ypos(db(rms[c]))) for c in range(width)]
    d.line(pts, fill=(250, 200, 60), width=1)

    sy = T + env_h + 8
    for f in (50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000):
        yy = sy + int((1 - np.log(f / fmin) / np.log(fmax / fmin)) * (spec_h - 1))
        d.line([L - 5, yy, L, yy], fill=(200, 200, 200))
        d.text((6, yy - 6), f"{f // 1000}k" if f >= 1000 else str(f), fill=(200, 200, 200), font=font)
    dur = n / SR
    step = next(s for s in (0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10) if dur / s <= 12)
    tt = 0.0
    while tt <= dur + 1e-9:
        xx = L + int(tt / dur * (width - 1))
        d.line([xx, sy + spec_h, xx, sy + spec_h + 5], fill=(200, 200, 200))
        d.text((xx - 10, sy + spec_h + 8), f"{tt:g}s", fill=(200, 200, 200), font=font)
        tt += step
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    canvas.save(out_png)


def render_spectrograms(out_dir, names, files):
    lookup = dict(files)
    for nm in names:
        rel = nm if nm.endswith(".wav") else nm + ".wav"
        if rel not in lookup:
            hits = [r for r, _ in files if nm in r]
            if not hits:
                print(f"spectrogram: no file matches {nm}")
                continue
            rel = hits[0]
        pcm, _ = read_wav(lookup[rel])
        x = pcm.astype(np.float64) / 32768.0
        base = rel[:-4].replace("/", "__")
        spectrogram(x, os.path.join(out_dir, base + ".png"), rel)
        if rel[:-4] in LOOPS:
            w = min(SR, len(x) // 2)
            seam = np.concatenate([x[-w:], x[:w]])
            spectrogram(seam, os.path.join(out_dir, base + "_seam.png"),
                        f"{rel}: last {w / SR:g}s | first {w / SR:g}s (seam at centre)")
        print(f"spectrogram: {rel} -> {os.path.join(out_dir, base + '.png')}")


def main():
    ap = argparse.ArgumentParser(description="Breach Line SFX QA report")
    ap.add_argument("--spectrograms", metavar="OUT_DIR", help="render spectrogram PNGs of the named files")
    ap.add_argument("names", nargs="*", help="files for --spectrograms (cat/name or substring)")
    args = ap.parse_args()
    files = collect()
    if not files:
        sys.exit(f"no WAV files under {AUDIO}")
    print(f"{'file':40s} {'dur s':>6s} {'peak':>6s} {'rms':>6s} {'T-20':>6s} {'DC dB':>6s} {'clip':>4s} {'edge':>6s}  notes")
    total, bad = 0, 0
    for rel, path in files:
        total += os.path.getsize(path)
        pcm, fmt = read_wav(path)
        r = analyse(rel, pcm, fmt)
        notes = r["seam"]
        if r["problems"]:
            bad += 1
            notes = (notes + "  " if notes else "") + "PROBLEM: " + "; ".join(r["problems"])
        print(f"{rel:40s} {r['dur']:6.3f} {r['peak']:6.1f} {r['rms']:6.1f} {r['t20']:6.3f} "
              f"{r['dc']:6.1f} {r['clips']:4d} {r['edge']:6.1f}  {notes}")
    print(f"\n{len(files)} files, total {total / 1e6:.2f} MB ({total / 2**20:.2f} MiB), "
          f"{bad} with problems")
    if args.spectrograms:
        render_spectrograms(args.spectrograms, args.names, files)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
