#!/usr/bin/env python3
"""Generates original decal textures (RGBA PNG) for environment detail.

Outputs into assets/decals/:
  oil_stain.png (512)   dark irregular oil/water stain, soft edges
  puddle.png (512)      dark wet patch (used with low roughness)
  paint_line.png (512x64) worn white road paint stripe
  grime_streak.png (256x512) vertical rain/rust streaks for walls
  cracks.png (512)      dark branching cracks
Deterministic (fixed seeds). Run from breach-line/.
"""
import os
import numpy as np
from PIL import Image

OUT = "assets/decals"
os.makedirs(OUT, exist_ok=True)


def fbm(h, w, seed, octaves=5, base=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.random((n + 1, n + 1))
        ys = np.linspace(0, n, h, endpoint=False)
        xs = np.linspace(0, n, w, endpoint=False)
        yi, xi = ys.astype(int), xs.astype(int)
        fy, fx = ys - yi, xs - xi
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        a = g[yi][:, xi]
        b = g[yi][:, xi + 1]
        c = g[yi + 1][:, xi]
        d = g[yi + 1][:, xi + 1]
        top = a + (b - a) * fx[None, :]
        bot = c + (d - c) * fx[None, :]
        out += (top + (bot - top) * fy[:, None]) * amp
        amp *= 0.5
    return out / out.max()


def radial(h, w):
    y, x = np.mgrid[0:h, 0:w]
    return np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)


def save(name, rgb, alpha):
    a = np.clip(alpha, 0, 1)
    img = np.dstack([np.clip(rgb, 0, 1)] + [a]) if rgb.ndim == 3 else None
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, name))


def oil_stain():
    n = fbm(512, 512, 11)
    r = radial(512, 512)
    shape = np.clip((0.75 - r + (n - 0.5) * 0.7) * 3.0, 0, 1)
    ring = np.exp(-((0.75 - r + (n - 0.5) * 0.7) * 6) ** 2) * 0.35
    alpha = np.clip(shape * 0.65 + ring, 0, 0.85) * (0.75 + 0.25 * fbm(512, 512, 12, base=16))
    rgb = np.dstack([np.full((512, 512), 0.05), np.full((512, 512), 0.045), np.full((512, 512), 0.04)])
    save("oil_stain.png", rgb, alpha)


def puddle():
    n = fbm(512, 512, 21, base=3)
    r = radial(512, 512)
    shape = np.clip((0.8 - r + (n - 0.5) * 0.9) * 5.0, 0, 1)
    rgb = np.dstack([np.full((512, 512), 0.12), np.full((512, 512), 0.13), np.full((512, 512), 0.14)])
    save("puddle.png", rgb, shape * 0.55)


def paint_line():
    h, w = 64, 512
    n = fbm(h, w, 31, base=8)
    wear = fbm(h, w, 32, base=24)
    y = np.abs(np.linspace(-1, 1, h))[:, None] * np.ones((1, w))
    edge = np.clip((0.82 - y + (n - 0.5) * 0.12) * 12, 0, 1)
    ends = np.clip(np.minimum(np.linspace(0, 1, w), np.linspace(1, 0, w)) * 40, 0, 1)[None, :]
    alpha = edge * ends * np.clip((wear - 0.28) * 2.2, 0, 1) * 0.9
    rgb = np.dstack([np.full((h, w), 0.92), np.full((h, w), 0.9), np.full((h, w), 0.84)])
    save("paint_line.png", rgb, alpha)


def grime_streak():
    h, w = 512, 256
    rng = np.random.default_rng(41)
    cols = np.zeros(w)
    for _ in range(14):
        c = rng.integers(0, w)
        cols += np.exp(-((np.arange(w) - c) / rng.uniform(3, 14)) ** 2) * rng.uniform(0.3, 1.0)
    cols = np.clip(cols, 0, 1)
    fade = np.linspace(1, 0, h) ** 1.4
    n = fbm(h, w, 42, base=6)
    alpha = cols[None, :] * fade[:, None] * (0.6 + 0.4 * n) * 0.7
    side = np.clip(np.minimum(np.arange(w), w - 1 - np.arange(w)) / 30.0, 0, 1)[None, :]
    alpha *= side
    rgb = np.dstack([np.full((h, w), 0.18), np.full((h, w), 0.13), np.full((h, w), 0.09)])
    save("grime_streak.png", rgb, alpha)


def cracks():
    s = 512
    img = np.zeros((s, s))
    rng = np.random.default_rng(51)

    def walk(x, y, ang, length, width, depth):
        for _ in range(length):
            ang += rng.normal(0, 0.18)
            x += np.cos(ang) * 2
            y += np.sin(ang) * 2
            if not (4 < x < s - 4 and 4 < y < s - 4):
                return
            xi, yi = int(x), int(y)
            r = max(1, int(width))
            img[yi - r:yi + r + 1, xi - r:xi + r + 1] = np.maximum(img[yi - r:yi + r + 1, xi - r:xi + r + 1], 0.9)
            width *= 0.996
            if depth < 3 and rng.random() < 0.012:
                walk(x, y, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), int(length * 0.5), width * 0.7, depth + 1)

    for _ in range(3):
        walk(s / 2, s / 2, rng.uniform(0, 6.28), 160, 2.5, 0)
    soft = np.array(Image.fromarray((img * 255).astype(np.uint8)).resize((s // 2, s // 2), Image.BILINEAR).resize((s, s), Image.BILINEAR)) / 255.0
    alpha = np.clip(np.maximum(img * 0.85, soft * 0.4), 0, 0.9) * np.clip(1.2 - radial(s, s), 0, 1)
    rgb = np.dstack([np.full((s, s), 0.06)] * 3)
    save("cracks.png", rgb, alpha)


if __name__ == "__main__":
    oil_stain(); puddle(); paint_line(); grime_streak(); cracks()
    print("decals:", sorted(os.listdir(OUT)))
