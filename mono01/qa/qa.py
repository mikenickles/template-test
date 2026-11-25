#!/usr/bin/env python3
"""Automated render audit for mono01-v1.mp4.

  python3 qa/qa.py mono01-v1.mp4 <keyframe_dir>

Checks container/stream specs with ffprobe, extracts the seven review keyframes
plus a contact sheet, scans every decoded frame for blank / frozen / jumpy
frames and verifies the cuts land on their frame numbers, then measures the
decoded audio (peak, true peak, clipping, tail, hit alignment).
Exit code 1 if any check fails.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import signal

MP4 = Path(sys.argv[1])
KDIR = Path(sys.argv[2]) if len(sys.argv) > 2 else MP4.parent / "qa" / "keyframes"
KDIR.mkdir(parents=True, exist_ok=True)
FPS, SR = 60, 48000
KEY_TIMES = [0.5, 2.0, 4.5, 7.0, 9.0, 11.5, 14.0]
CUTS = {150: "hook -> product (2.5 s, continuous move, no hard cut expected)",
        360: "product -> 40H BATTERY (6.0 s)", 450: "-> LOSSLESS WIRELESS (7.5 s)",
        540: "-> MACHINED ALUMINUM (9.0 s)", 630: "-> finale (10.5 s)", 780: "-> end card (13.0 s)"}
HITS = {6.0: "spec click 1", 7.5: "spec click 2", 9.0: "spec click 3", 10.5: "bass pulse", 13.0: "end-card lock"}
results = []


def check(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name:<34} {detail}")


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


# ------------------------------------------------------------------ 1. ffprobe
probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(MP4)]).stdout)
v = next(s for s in probe["streams"] if s["codec_type"] == "video")
a = next((s for s in probe["streams"] if s["codec_type"] == "audio"), None)
dur = float(probe["format"]["duration"])
print("== container / streams")
check("duration 15.0 s ± 0.1", abs(dur - 15.0) <= 0.1, f"{dur:.3f} s (video stream {float(v['duration']):.3f} s)")
check("resolution 1920x1080", (v["width"], v["height"]) == (1920, 1080), f"{v['width']}x{v['height']}")
check("frame rate 60 fps", v["r_frame_rate"] == "60/1" and v["avg_frame_rate"] == "60/1", f"r={v['r_frame_rate']} avg={v['avg_frame_rate']}")
check("frame count 900", int(v["nb_read_frames"]) == 900, v["nb_read_frames"])
check("codec H.264 / yuv420p", v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p", f"{v['codec_name']} {v.get('profile')} {v['pix_fmt']} {v.get('color_space')}")
check("audio stream stereo", a is not None and a["channels"] == 2, f"{a['codec_name']} {a['sample_rate']} Hz {a['channels']} ch {int(a.get('bit_rate', 0)) // 1000} kb/s" if a else "missing")

# ------------------------------------------------------------------ 2. keyframes + contact sheet
print("== keyframes")
for t in KEY_TIMES:
    out = KDIR / f"key_{t:04.1f}s.png"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(MP4), "-ss", f"{t}", "-frames:v", "1", str(out)])
inputs = sum((["-i", str(KDIR / f"key_{t:04.1f}s.png")] for t in KEY_TIMES), [])
lab = ";".join(
    f"[{i}:v]scale=960:540,drawtext=text='{t:.1f}s':x=24:y=h-52:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:"
    f"fontfile=/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Medium.ttf[k{i}]" for i, t in enumerate(KEY_TIMES))
sheet = KDIR.parent / "contact-sheet.png"
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
     lab + ";" + "".join(f"[k{i}]" for i in range(7)) + "xstack=inputs=7:layout=0_0|960_0|0_540|960_540|0_1080|960_1080|0_1620:fill=0x2a2a2a[o]",
     "-map", "[o]", "-frames:v", "1", str(sheet)])
print(f"      wrote {len(KEY_TIMES)} keyframes -> {KDIR}  and  {sheet}")

# ------------------------------------------------------------------ 3. every frame
print("== frame scan (900 decoded frames, 480x270 luma)")
raw = run(["ffmpeg", "-v", "error", "-i", str(MP4), "-vf", "scale=480:270:flags=area,format=gray", "-f", "rawvideo", "-"]).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, 270, 480).astype(np.float32)
std = fr.std(axis=(1, 2))
diff = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))            # diff[i] = change going INTO frame i+1
into = np.concatenate([[0], diff])                              # into[i] = change going into frame i
# a frame counts as blank when it carries no foreground at all: fewer than 0.02 % of
# pixels differ from the frame's own median by more than 24 levels
med = np.median(fr.reshape(len(fr), -1), axis=1)[:, None, None]
fg = (np.abs(fr - med) > 24).mean(axis=(1, 2))
blank = np.where(fg < 0.0002)[0]
check("no blank frames", len(blank) == 0, f"min foreground coverage {fg.min() * 100:.3f} % (frame {int(fg.argmin())})" if len(blank) == 0 else f"blank frames: {blank[:20].tolist()}")
# each cut is verified in the strip of the frame its wipe reaches LAST: that strip must still show
# the old plate on frame f-1, show the new plate on frame f, and then stay put on f+1
h, w = fr.shape[1:]
strips = {360: (slice(0, 12), slice(0, w)),          # wipe travels up    -> top strip is last
          450: (slice(0, h), slice(w - 12, w)),      # wipe travels right -> right strip
          540: (slice(h - 12, h), slice(0, w)),      # wipe travels down  -> bottom strip
          630: (slice(0, 12), slice(0, 20)),         # shutters close from the centre -> corner
          780: (slice(0, 12), slice(0, w))}          # hard plate flip
parts, ok_cuts = [], True
for f, sl in strips.items():
    L = [fr[k][sl].mean() for k in (f - 1, f, f + 1)]
    good = abs(L[1] - L[0]) > 12 and abs(L[2] - L[1]) < 2
    ok_cuts &= good
    parts.append(f"f{f}:{L[0]:.0f}>{L[1]:.0f}")
check("cuts land on exact frames", ok_cuts, "plate luma f-1>f  " + "  ".join(parts))
# outside the cuts, the 14-frame wipes that lead into them and the designed 12.5 s snap,
# everything is eased, so a big single-frame delta would be a glitch
others = into.copy()
for f in strips:
    others[max(0, f - 15):f + 2] = 0
others[750:758] = 0
check("no stray jump cuts", others.max() < 12, f"largest delta outside cuts/wipes/snap {others.max():.1f} at frame {int(others.argmax())} ({others.argmax() / FPS:.3f} s)")
frozen = np.where(into[1:855] < 0.004)[0] + 1                  # before the intentional end-card hold (14.25 s+)
runs, start = [], None
for f in range(1, 855):
    if into[f] < 0.004:
        start = f if start is None else start
    elif start is not None:
        runs.append((start, f - start)); start = None
long_runs = [r for r in runs if r[1] >= 6]
check("no dead air before end hold", len(long_runs) == 0, f"{len(frozen)} static frames, longest run {max([r[1] for r in runs], default=0)} frames" + (f" {long_runs[:5]}" if long_runs else ""))
hold = into[870:].max()
check("end card holds still to 15.0 s", hold < 0.05, f"max frame delta after 14.5 s = {hold:.4f}")

# ------------------------------------------------------------------ 4. audio
print("== audio (decoded from the mp4)")
pcm_all = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(MP4), "-vn", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]).stdout, np.float32).reshape(-1, 2)
pcm = pcm_all[:15 * SR]                                        # AAC pads the last packet; judge the 15.0 s programme
peak = np.abs(pcm).max()
tp = np.abs(signal.resample_poly(pcm, 4, 1, axis=0)).max()
rms = np.sqrt((pcm ** 2).mean())
db = lambda x: 20 * np.log10(max(x, 1e-9))
check("audio present / non-silent", rms > 10 ** (-40 / 20), f"RMS {db(rms):.1f} dBFS; {len(pcm_all) / SR:.3f} s decoded, padding after 15.0 s peaks at {db(np.abs(pcm_all[15 * SR:]).max() if len(pcm_all) > 15 * SR else 0):.0f} dBFS")
check("sample peak < -1 dBFS", db(peak) < -1.0, f"{db(peak):.2f} dBFS")
check("true peak (4x) < -0.5 dBTP", db(tp) < -0.5, f"{db(tp):.2f} dBTP")
check("zero clipped samples", int((np.abs(pcm) >= 0.999).sum()) == 0, f"{int((np.abs(pcm) >= 0.999).sum())} samples at full scale")
win = np.sqrt((pcm.mean(axis=1) ** 2).reshape(-1, 480).mean(axis=1))                 # 10 ms RMS
q = win[10:1420]                                                                    # 0.10 s .. 14.2 s (before the fade)
check("no silent gaps (dead air)", db(q.min()) > -50, f"quietest 10 ms window 0.1-14.2 s: {db(q.min()):.1f} dBFS at {(10 + q.argmin()) / 100:.2f} s")
tail = np.abs(pcm[int(14.98 * SR):]).max()
check("clean fade-out at 15.0 s", db(tail) < -60, f"last 20 ms peak {db(tail):.1f} dBFS; first sample {db(np.abs(pcm[0]).max()):.1f} dBFS")
# pops: a broadband impulsive spike that does NOT sit on a scheduled sound event is a click/pop
mono = pcm.mean(axis=1)
ev_file = MP4.parent / "build" / "audio-events.json"
events = np.array(json.loads(ev_file.read_text())) if ev_file.exists() else np.array(list(HITS))
hf = signal.sosfilt(signal.butter(4, 5000, "highpass", fs=SR, output="sos"), mono)
e1 = np.sqrt((hf ** 2).reshape(-1, 48).mean(axis=1))                                # 1 ms HF envelope
stray = []
for n in range(25, len(e1)):
    ref = np.median(e1[n - 25:n - 3])
    if e1[n] > 10 ** (-46 / 20) and e1[n] > 8 * max(ref, 1e-5):
        tt = n / 1000
        d = tt - events
        if not np.any((d > -0.003) & (d < 0.02)):
            stray.append(round(tt, 3))
check("no pops / unscheduled clicks", len(stray) == 0, f"{len(events)} scheduled events; unscheduled HF spikes: {stray[:8] if stray else 'none'}")
# hit alignment: 1 ms full-band RMS envelope (0.25 ms hop). Onset = first crossing of
# floor + 25 % of (peak - floor), searched from the quietest point just before the cue
hop = 12
pad = np.concatenate([np.zeros(24), mono, np.zeros(24)])
csum = np.cumsum(pad ** 2)
env = np.sqrt((csum[48::hop] - csum[:-48:hop]) / 48)
worst, parts = 0.0, []
for t, name in HITS.items():
    k = lambda x: int(round(x * SR / hop))
    lo = k(t - 0.012) + int(np.argmin(env[k(t - 0.012):k(t + 0.002)]))
    floor, pk = env[lo], env[k(t):k(t + 0.03)].max()
    on = lo + int(np.argmax(env[lo:k(t + 0.03)] > floor + 0.25 * (pk - floor)))
    off_ms = (on * hop / SR - t) * 1000
    worst = max(worst, abs(off_ms))
    parts.append(f"{t:.1f}s:{off_ms:+.1f}ms")
check("hits within ±1 frame of cuts", worst <= 1000 / FPS, "  ".join(parts))

fails = [r for r in results if not r[1]]
print(f"\nRENDER AUDIT: {'PASS' if not fails else 'FAIL'}  ({len(results) - len(fails)}/{len(results)} checks)")
sys.exit(1 if fails else 0)
