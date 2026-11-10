#!/usr/bin/env python3
"""
Breach Line - procedural, seamlessly tiling PBR texture + FX sprite generator.

Run from the project root (breach-line/):

    python3 tools/texgen.py                 # generate everything, verify tiling, report sizes
    python3 tools/texgen.py --only rust,gravel   # regenerate a subset
    python3 tools/texgen.py --no-fx | --fx-only | --check

Everything is generated procedurally with fixed seeds (fully deterministic); no external
images are used. All noise is periodic over the tile (FFT-filtered noise, periodic Worley /
cellular noise with wraparound, wrap-around bilinear domain warping, periodic Gaussian blur,
wrap-around stamping), so every map tiles seamlessly in U and V.

Per material (in assets/textures/<name>/):
    <name>_albedo.jpg   1024x1024 RGB, sRGB, JPEG q90
    <name>_normal.png   1024x1024 RGB tangent-space normal, OpenGL convention (G = +Y up),
                        derived from a metric height map with wraparound central differences
    <name>_rough.jpg    512x512 grayscale roughness (white = rough), JPEG q90

Materials (real-world size of one tile in metres):
     1. concrete_floor    4.0 m  worn poured slab, aggregate speckle, hairline cracks, oil/water
                                 stains, saw-cut control joints on the tile edges (every 4 m)
     2. concrete_wall     4.0 m  cast-in-place panels, faint board-form lines, form-tie hole grid
                                 (0.8 m), vertical rain/rust streaks
     3. brick_red         3.0 m  red brick, running bond, 13 x 40 bricks (0.231 x 0.075 m incl.
                                 10 mm mortar), per-brick colour, chipped edges, grime blotches
     4. brick_dark        3.0 m  same bond, soot-stained dark brown/grey brick, different seed
     5. asphalt           5.0 m  street asphalt, aggregate, cracks + tar sealant, darker patches,
                                 faint tyre-wear bands
     6. metal_corrugated  2.0 m  27 vertical corrugations (74 mm pitch), faded grey-green paint,
                                 chips, screws on purlin lines, rust bleeding down the valleys
     7. metal_tread       1.5 m  steel diamond tread plate (48 x 48 lugs, 31 mm pitch), polished
                                 lug tops (low roughness), dirt in recesses
     8. metal_painted     2.0 m  neutral light-grey painted steel (tint in engine), scratches,
                                 chips to dark metal, light rust spots, faint grime
     9. rust              2.0 m  heavily rusted steel, flaking scale, pitting
    10. wood_crate        1.2 m  8 horizontal planks (0.15 m), grain, knots, gaps, nails
    11. plaster_wall      3.0 m  painted plaster, pale green-grey, scuffs, grime, hairline cracks
    12. tiles_floor       2.0 m  vinyl tiles 0.5 m (4 x 4), alternating beige / grey, scuffs,
                                 dirt in seams
    13. gravel            3.0 m  railway ballast, angular faceted crushed stone (cellular)
    14. hazard_stripes    1.0 m  yellow/black 45-degree stripes (4 pairs per tile, 88 mm stripe
                                 width) on steel, chipped and faded
    15. dirt_ground       4.0 m  packed dirt / mud, pebbles, faint tyre ruts
    16. roof_tar          4.0 m  bitumen roll roofing, 1 m strips with lapped seams, blisters

FX sprites (in assets/fx/, RGBA PNG, colour bled under transparent pixels so that
premultiplied / mipmapped sampling never darkens the edges):
    muzzle_flash_front.png 256x256, muzzle_flash_side.png 256x128, bullet_hole.png 128x128,
    bullet_hole_metal.png 128x128, smoke_puff.png 128x128, spark.png 64x64,
    blood_splat.png 128x128, scorch.png 256x256
"""

import argparse
import math
import os
import sys
import time

import numpy as np
from PIL import Image

N = 1024
ROUGH_N = 512
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "assets", "textures")
FX_DIR = os.path.join(ROOT, "assets", "fx")

F32 = np.float32
TAU = 2.0 * math.pi

# ----------------------------------------------------------------------------------------
# Grids
# ----------------------------------------------------------------------------------------
_FY = (np.fft.fftfreq(N, d=1.0 / N)).astype(F32)[:, None]   # cycles per tile (rows)
_FX = (np.fft.rfftfreq(N, d=1.0 / N)).astype(F32)[None, :]  # cycles per tile (cols)
_YI, _XI = np.mgrid[0:N, 0:N]
XPX = _XI.astype(F32)
YPX = _YI.astype(F32)
U = (XPX + 0.5) / N       # tile coordinates in [0,1)
V = (YPX + 0.5) / N
del _YI, _XI


# ----------------------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------------------
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(F32)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(base, col, m):
    """Blend colour image `base` (N,N,3) toward `col` ((3,) or (N,N,3)) by mask m (N,N)."""
    m = np.asarray(m, F32)[..., None]
    return base + (np.asarray(col, F32) - base) * m


def c3(r, g, b):
    return np.array([r, g, b], F32)


def gradient_map(t, stops):
    pos = np.array([s[0] for s in stops], F32)
    cols = np.array([s[1] for s in stops], F32)
    return np.stack([np.interp(t, pos, cols[:, k]).astype(F32) for k in range(3)], -1)


def cover(field, frac, soft=0.15):
    """Soft mask that is ~1 on the `frac` highest fraction of `field`."""
    t = float(np.quantile(field, 1.0 - frac))
    s = soft * float(field.std() + 1e-9)
    return smoothstep(t - s, t + s, field)


def pdelta(a, c):
    """Periodic difference a-c in tile units, in [-0.5, 0.5)."""
    return (a - c + 0.5) % 1.0 - 0.5


def roll_grad(h):
    gx = 0.5 * (np.roll(h, -1, 1) - np.roll(h, 1, 1))
    gy = 0.5 * (np.roll(h, -1, 0) - np.roll(h, 1, 0))
    return gx, gy


def contour_lines(n, width_px, offset_px=None, smooth_px=2.0):
    """Uniform-width lines along the zero level set of a smooth field (cracks, tide marks).
    Signed distance to the zero crossing ~ n / |grad n| (px). Jaggedness is added as a bounded
    pixel offset (offset_px) rather than as noise in n, so the line wiggles without breaking
    up into beads."""
    gx, gy = roll_grad(blur(n, smooth_px) if smooth_px > 0 else n)
    d = n / (np.sqrt(gx * gx + gy * gy) + 1e-6)
    if offset_px is not None:
        d = d + offset_px
    return np.clip(1.0 - np.abs(d) / np.maximum(width_px, 1e-3), 0.0, 1.0).astype(F32)


def blur(img, sx, sy=None):
    """Periodic (wraparound) Gaussian blur via FFT. sx, sy in pixels."""
    sy = sx if sy is None else sy
    g = np.exp(-2.0 * (math.pi ** 2) * ((sx * _FX / N) ** 2 + (sy * _FY / N) ** 2))
    if img.ndim == 3:
        return np.stack([blur(img[..., k], sx, sy) for k in range(img.shape[2])], -1)
    return np.fft.irfft2(np.fft.rfft2(img) * g, s=(N, N)).astype(F32)


def sample(img, x, y):
    """Bilinear sample with wraparound; x, y in pixel units (arrays)."""
    x0 = np.floor(x)
    y0 = np.floor(y)
    tx = (x - x0).astype(F32)
    ty = (y - y0).astype(F32)
    x0 = x0.astype(np.int64) % N
    y0 = y0.astype(np.int64) % N
    x1 = (x0 + 1) % N
    y1 = (y0 + 1) % N
    if img.ndim == 3:
        tx = tx[..., None]
        ty = ty[..., None]
    a = img[y0, x0]
    b = img[y0, x1]
    c = img[y1, x0]
    d = img[y1, x1]
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty).astype(F32)


def warp(img, dx_px, dy_px):
    return sample(img, XPX + dx_px, YPX + dy_px)


def local_patch(cx, cy, rad):
    """Pixel window around (cx, cy) with wraparound indices. Returns dx, dy (px) and index."""
    rad = min(rad, N / 2 - 1)
    x0 = int(math.floor(cx - rad))
    x1 = int(math.ceil(cx + rad)) + 1
    y0 = int(math.floor(cy - rad))
    y1 = int(math.ceil(cy + rad)) + 1
    xs = np.arange(x0, x1)
    ys = np.arange(y0, y1)
    dx = (xs.astype(F32) + 0.5 - cx)[None, :]
    dy = (ys.astype(F32) + 0.5 - cy)[:, None]
    return dx, dy, np.ix_(ys % N, xs % N)


def draw_segment(canvas, x0, y0, x1, y1, w, val=1.0, soft=0.8, op="max"):
    pad = w + soft + 1.5
    bx0 = int(math.floor(min(x0, x1) - pad))
    bx1 = int(math.ceil(max(x0, x1) + pad)) + 1
    by0 = int(math.floor(min(y0, y1) - pad))
    by1 = int(math.ceil(max(y0, y1) + pad)) + 1
    xs = np.arange(bx0, bx1)
    ys = np.arange(by0, by1)
    gx = xs.astype(F32)[None, :] + 0.5
    gy = ys.astype(F32)[:, None] + 0.5
    ddx = x1 - x0
    ddy = y1 - y0
    l2 = ddx * ddx + ddy * ddy + 1e-9
    t = np.clip(((gx - x0) * ddx + (gy - y0) * ddy) / l2, 0.0, 1.0)
    px = x0 + t * ddx
    py = y0 + t * ddy
    d = np.sqrt((gx - px) ** 2 + (gy - py) ** 2)
    a = np.clip((w - d) / soft + 0.5, 0.0, 1.0) * val
    idx = np.ix_(ys % N, xs % N)
    if op == "max":
        canvas[idx] = np.maximum(canvas[idx], a)
    else:
        canvas[idx] += a


def wander_path(rng, x, y, ang, length, curv, step=5.0):
    pts = [(x, y)]
    n = max(2, int(length / step))
    for _ in range(n):
        ang += rng.normal(0.0, curv)
        x += math.cos(ang) * step
        y += math.sin(ang) * step
        pts.append((x, y))
    return pts


def draw_path(canvas, pts, wmax, val=1.0, soft=0.8, taper=True, op="max"):
    k = len(pts) - 1
    for i in range(k):
        t = (i + 0.5) / k
        w = wmax * (math.sin(math.pi * t) ** 0.6 if taper else 1.0)
        draw_segment(canvas, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1],
                     max(w, 0.25), val, soft, op)


def drip(src, length_px, rng=None, spread=0.0):
    """Carry `src` downward (increasing row) with exponential decay, wrapping vertically.
    length_px may be a scalar or a per-column array."""
    length = np.broadcast_to(np.asarray(length_px, F32), (N,)).astype(F32)
    d = np.exp(-1.0 / np.maximum(length, 1.0)).astype(F32)
    acc = np.zeros(N, F32)
    out = np.empty((N, N), F32)
    for y in range(N):
        acc = np.maximum(src[y], acc * d)
    for y in range(N):
        acc = np.maximum(src[y], acc * d)
        out[y] = acc
    return out


def downsample2(img):
    return 0.25 * (img[0::2, 0::2] + img[1::2, 0::2] + img[0::2, 1::2] + img[1::2, 1::2])


def to_u8(x):
    return np.clip(np.round(np.asarray(x) * 255.0), 0, 255).astype(np.uint8)


def luma(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


# ----------------------------------------------------------------------------------------
# Periodic noise generator (one per material, fixed seed)
# ----------------------------------------------------------------------------------------
class Gen:
    def __init__(self, seed, tile_m):
        self.rng = np.random.default_rng(seed)
        self.tile = float(tile_m)
        self.px = self.tile / N
        self.no_border = False

    def m(self, metres):
        """metres -> pixels"""
        return metres / self.px

    def noise(self, lmax=None, lmin=None, beta=2.0, sx=1.0, sy=1.0, angle=0.0):
        """Periodic Gaussian noise (unit std) with power spectrum ~ f^-beta, band-limited to
        wavelengths [lmin, lmax] metres. sx/sy > 1 squeeze features along x/y (stretching
        them along the other axis). Only integer frequencies exist -> perfectly tileable."""
        w = self.rng.standard_normal((N, N), dtype=F32)
        F = np.fft.rfft2(w)
        fx, fy = _FX, _FY
        if angle:
            ca, sa = math.cos(angle), math.sin(angle)
            fx, fy = fx * ca + fy * sa, -fx * sa + fy * ca
        f = np.sqrt((fx * sx) ** 2 + (fy * sy) ** 2)
        f = np.maximum(f, 1e-3)
        amp = f ** (-beta / 2.0)
        if lmax:
            fmin = self.tile / lmax
            amp = amp / (1.0 + (fmin / f) ** 4)
        if lmin:
            fmax = self.tile / lmin
            amp = amp / (1.0 + (f / fmax) ** 4)
        amp[0, 0] = 0.0
        out = np.fft.irfft2(F * amp, s=(N, N)).astype(F32)
        out -= out.mean()
        out /= out.std() + 1e-12
        return out

    def line1d(self, lmax, lmin, beta=2.0, axis=0):
        """Periodic 1-D noise along rows (axis=0, function of V) or columns (axis=1)."""
        n = self.noise(lmax, lmin, beta)
        v = n[:, 0] if axis == 0 else n[0, :]
        v = (v - v.mean()) / (v.std() + 1e-9)
        return v[:, None] if axis == 0 else v[None, :]

    def worley(self, cells, jitter=0.9, warp=None, edge=False):
        """Periodic Worley/cellular noise on a cells x cells jittered grid.
        Returns f1, f2 (cell units), id (cell index), ox/oy (vector pixel->nearest feature
        point, cell units) and optionally edge (distance to Voronoi border, cell units)."""
        c = int(cells)
        pts = (0.5 + (self.rng.random((c * c, 2), dtype=F32) - 0.5) * jitter).astype(F32)
        u = U * c
        v = V * c
        if warp is not None:
            u = u + warp[0]
            v = v + warp[1]
        iu = np.floor(u).astype(np.int32)
        iv = np.floor(v).astype(np.int32)
        fu = (u - iu).astype(F32)
        fv = (v - iv).astype(F32)
        b1 = np.full((N, N), 1e9, F32)
        b2 = np.full((N, N), 1e9, F32)
        id1 = np.zeros((N, N), np.int32)
        ox = np.zeros((N, N), F32)
        oy = np.zeros((N, N), F32)
        cache = []
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                cid = ((iv + dj) % c) * c + ((iu + di) % c)
                p = pts[cid]
                dx = di + p[..., 0] - fu
                dy = dj + p[..., 1] - fv
                d2 = dx * dx + dy * dy
                m = d2 < b1
                b2 = np.where(m, b1, np.minimum(b2, d2))
                b1 = np.where(m, d2, b1)
                id1 = np.where(m, cid, id1)
                ox = np.where(m, dx, ox)
                oy = np.where(m, dy, oy)
                if edge:
                    cache.append((cid, dx, dy))
        res = {"f1": np.sqrt(b1), "f2": np.sqrt(b2), "id": id1, "ox": ox, "oy": oy,
               "cells": c}
        if edge:
            e = np.full((N, N), 1e9, F32)
            for cid, dx, dy in cache:
                ex = dx - ox
                ey = dy - oy
                l = np.sqrt(ex * ex + ey * ey) + 1e-6
                dist = ((0.5 * (ox + dx)) * ex + (0.5 * (oy + dy)) * ey) / l
                e = np.where(cid == id1, e, np.minimum(e, dist))
            res["edge"] = e
        return res

    def cellrand(self, w, k=1):
        c = w["cells"]
        r = self.rng.random((k, c * c), dtype=F32)
        return r[:, w["id"]]

    def warp_noise(self, img, amp_m, lmax, lmin, beta=2.0):
        a = self.m(amp_m)
        return warp(img, a * self.noise(lmax, lmin, beta), a * self.noise(lmax, lmin, beta))


def cavity(h, r_px):
    """Positive in crevices (height below local average)."""
    return blur(h, r_px) - h


# ----------------------------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------------------------
def height_to_normal(h, tile_m, strength=1.0, blur_px=0.0):
    """Tangent-space normal (OpenGL / +Y up) from a height map in metres, wraparound."""
    if blur_px > 0:
        h = blur(h, blur_px)
    px = tile_m / N
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2.0 * px)   # dh/dx (x right)
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2.0 * px)   # dh/drow (row down)
    nx = -gx * strength
    ny = gy * strength       # +Y is up = -row  ->  ny = -dh/dy_up = +dh/drow
    l = np.sqrt(nx * nx + ny * ny + 1.0)
    n = np.stack([nx / l, ny / l, 1.0 / l], -1)
    return to_u8(n * 0.5 + 0.5)


def save_material(name, tile_m, res):
    d = os.path.join(TEX_DIR, name)
    os.makedirs(d, exist_ok=True)
    alb = np.clip(res["albedo"], 0, 1)
    Image.fromarray(to_u8(alb), "RGB").save(
        os.path.join(d, f"{name}_albedo.jpg"), quality=90, optimize=True, subsampling=0)
    nrm = height_to_normal(res["height"], tile_m, res.get("nstrength", 1.0),
                           res.get("nblur", 0.5))
    Image.fromarray(nrm, "RGB").save(os.path.join(d, f"{name}_normal.png"), optimize=True)
    r = downsample2(np.clip(res["rough"], 0, 1))
    Image.fromarray(to_u8(r), "L").save(os.path.join(d, f"{name}_rough.jpg"), quality=90,
                                        optimize=True)
    return float(luma(alb).mean()), float(r.mean())


# ----------------------------------------------------------------------------------------
# Materials
# ----------------------------------------------------------------------------------------
def crack_network(g, cells, width_px, jag_px, frac, mask_lmax, mask_lmin):
    """Hairline cracks: open polyline segments from warped Voronoi edges (no closed loops),
    with bounded pixel-scale jaggedness, masked so only isolated runs remain."""
    T = g.tile
    cell_m = T / cells
    w = g.worley(cells, jitter=0.9, warp=(0.18 * g.noise(cell_m * 2, cell_m / 6, 2.4),
                                          0.18 * g.noise(cell_m * 2, cell_m / 6, 2.4)), edge=True)
    d = w["edge"] * (N / cells) + jag_px * g.noise(0.08, 0.012, beta=1.5)
    line = np.clip(1.0 - np.abs(d) / np.maximum(width_px, 1e-3), 0, 1)
    return (line * cover(g.noise(mask_lmax, mask_lmin, beta=2.5), frac, 0.5)).astype(F32)


def trowel_swirls(g, count, rmin, rmax, width):
    out = np.zeros((N, N), F32)
    for _ in range(count):
        cx, cy = g.rng.random(2) * N
        r = g.m(g.rng.uniform(rmin, rmax))
        w = g.m(g.rng.uniform(0.4, 1.0) * width)
        a0 = g.rng.uniform(0, TAU)
        span = g.rng.uniform(1.2, 3.5)
        s = g.rng.uniform(-1, 1)
        dx, dy, idx = local_patch(cx, cy, r + 3 * w)
        d = np.sqrt(dx * dx + dy * dy)
        ring = np.exp(-((d - r) / w) ** 2)
        ang = (np.arctan2(dy, dx) - a0) % TAU
        am = smoothstep(0, 0.5, ang) * smoothstep(span, span - 0.5, ang)
        out[idx] += s * ring * am
    return out


def mat_concrete_floor(g):
    T = g.tile
    macro = g.noise(3.0, 0.35, beta=3.0)
    mid = g.noise(0.5, 0.03, beta=2.2)
    fine = g.noise(0.03, 2.5 * g.px, beta=1.2)
    swirl = trowel_swirls(g, 45, 0.25, 0.7, 0.07)

    # exposed aggregate where the cream layer is worn
    wear = smoothstep(-0.6, 1.6, g.noise(2.5, 0.25, beta=2.6))
    agg = g.worley(300, jitter=0.9)
    ar = g.cellrand(agg, 3)
    aa = 300.0 / N
    rad = 0.12 + 0.30 * ar[0]
    present = (ar[1] < 0.10 + 0.40 * wear).astype(F32)
    stone = smoothstep(rad + aa, rad - 0.5 * aa, agg["f1"]) * present
    stone_col = gradient_map(ar[2], [(0, (0.34, 0.34, 0.35)), (0.4, (0.47, 0.46, 0.44)),
                                     (0.75, (0.60, 0.58, 0.54)), (1, (0.70, 0.68, 0.64))])
    sand = g.noise(0.012, 0.006, beta=0.5)
    speck_l = smoothstep(1.8, 2.8, sand)
    speck_d = smoothstep(-1.9, -2.9, sand)

    # air-void pits
    wp = g.worley(130, jitter=0.9)
    pr = g.cellrand(wp, 2)
    aa2 = 130.0 / N
    prad = 0.03 + 0.06 * pr[0]
    pits = smoothstep(prad + aa2, prad - aa2, wp["f1"]) * (pr[1] < 0.06)

    # hairline cracks: long gently meandering zero-contours, only in some regions
    cw = 0.7 + 0.5 * smoothstep(-1, 1.5, g.noise(0.8, 0.1))
    cracks = 0.9 * crack_network(g, 6, cw, 0.9, 0.45, 1.2, 0.15)
    crack_halo = np.clip(blur(cracks, 2.5) * 2.0, 0, 1)

    # saw-cut control joint centred on the tile border (every 4 m) with spalled lips
    du = np.minimum(U, 1 - U) * T
    dv = np.minimum(V, 1 - V) * T
    dj = np.minimum(du, dv)
    spall = np.maximum(g.noise(0.12, 0.006, beta=1.6), 0) * 0.0012
    spall += smoothstep(1.5, 2.5, g.noise(0.3, 0.02, beta=2.0)) * 0.004
    joint = smoothstep(0.0008, -0.0008, dj - 0.0030 - spall)
    kerf = smoothstep(0.0032, 0.0012, dj)
    joint_dirt = smoothstep(0.03, 0.0, dj) * smoothstep(-0.5, 1.5, g.noise(0.4, 0.02))
    if g.no_border:            # verification only: same texture without the border joint
        joint, kerf, joint_dirt = joint * 0, kerf * 0, joint_dirt * 0

    # stains: oil (soft falloff, darker drip spots), water tide marks, a little rust
    oilf = g.warp_noise(g.noise(1.4, 0.10, beta=3.0), 0.05, 0.5, 0.05)
    oil = smoothstep(float(np.quantile(oilf, 0.91)), float(np.quantile(oilf, 0.995)), oilf)
    oil = oil * (0.65 + 0.35 * smoothstep(-1.2, 1.2, g.noise(0.15, 0.01, 1.5)))
    wd = g.worley(36, jitter=0.95)
    dr = g.cellrand(wd, 3)
    drad = 0.03 + 0.08 * dr[0] ** 2
    near_oil = (blur(oil, 50) > 0.03).astype(F32)
    spots = smoothstep(drad + 0.05, drad - 0.03, wd["f1"]) * (dr[1] < 0.12 + 0.2 * near_oil)
    oil = np.maximum(oil, blur(spots, 1.0) * (0.3 + 0.4 * dr[2]))
    wf = g.noise(2.2, 0.15, beta=2.8)
    wt = float(np.quantile(wf, 0.86))
    water_in = smoothstep(wt - 0.05, wt + 0.05, wf)
    tide = contour_lines(wf - wt, 1.4) * 0.7
    dirt = smoothstep(0.2, 2.2, g.noise(1.5, 0.05, beta=2.4))
    rustst = cover(g.noise(0.8, 0.03, beta=2.2), 0.012, 0.5)

    # ---- height (m)
    h = 0.0011 * macro + 0.00018 * mid + 0.00005 * fine
    h += 0.00008 * stone - 0.00004 * speck_d
    h -= 0.0009 * pits
    h -= 0.0004 * cracks
    h -= 0.0015 * joint + 0.0025 * kerf
    # ---- albedo
    base = c3(0.555, 0.548, 0.525)
    tone = 1.0 + 0.045 * macro + 0.022 * mid + 0.022 * fine + 0.010 * swirl
    alb = base * tone[..., None]
    hue = g.noise(2.0, 0.2, beta=2.5)
    alb = alb * (1.0 + 0.008 * hue[..., None] * c3(1, 0.2, -1))
    alb = mix(alb, stone_col, stone * 0.7)
    alb = mix(alb, c3(0.76, 0.75, 0.72), speck_l * 0.45)
    alb = mix(alb, c3(0.25, 0.25, 0.25), speck_d * 0.45)
    alb = alb * (1 - 0.05 * water_in - 0.08 * tide)[..., None]
    alb = alb * (1 - 0.08 * dirt)[..., None]
    alb = mix(alb, c3(0.50, 0.34, 0.21), rustst * 0.3)
    alb = mix(alb, c3(0.20, 0.19, 0.175), oil * 0.55)
    alb = alb * (1 - 0.40 * pits)[..., None]
    alb = alb * (1 - 0.08 * crack_halo - 0.45 * cracks)[..., None]
    alb = mix(alb, c3(0.27, 0.26, 0.24), joint_dirt * 0.30)
    alb = mix(alb, c3(0.30, 0.29, 0.27), joint * 0.8)
    alb = mix(alb, c3(0.07, 0.065, 0.06), kerf * 0.9)
    # ---- roughness
    rough = 0.86 + 0.04 * mid - 0.06 * wear + 0.01 * swirl
    rough = rough - 0.30 * oil + 0.05 * dirt - 0.04 * water_in
    rough = np.maximum(rough, 0.93 * joint)
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.6, "nblur": 0.6}


def mat_concrete_wall(g):
    T = g.tile
    macro = g.noise(3.0, 0.4, beta=3.0)
    mid = g.noise(0.4, 0.03, beta=2.3)
    fine = g.noise(0.03, 2.5 * g.px, beta=1.3)
    sandy = g.noise(0.008, 1.5 * g.px, beta=0.8)

    # board-form imprint: 20 boards of 0.2 m, each row split into 2 boards at random joints
    nb = 20
    bv = V * nb
    bi = np.floor(bv).astype(np.int32) % nb
    bf = bv - np.floor(bv)
    jr = g.rng.random((nb, 2), dtype=F32)
    j0 = jr[bi, 0]
    j1 = (j0 + 0.35 + 0.3 * jr[bi, 1]) % 1.0
    lo = np.minimum(j0, j1)
    hi = np.maximum(j0, j1)
    seg = ((U >= lo) & (U < hi)).astype(np.int32)
    brand = g.rng.random((nb * 2, 4), dtype=F32)
    bid = bi * 2 + seg
    board_tone = (brand[bid, 0] - 0.5)
    board_h = (brand[bid, 1] - 0.5) * 0.0008 + (brand[bid, 3] - 0.5) * 0.0006 * (bf - 0.5)
    grain = g.noise(0.8, 0.003, beta=1.5, sx=14.0, sy=1.0)
    grain = sample(grain, XPX + brand[bid, 2] * N, YPX + brand[bid, 3] * N)
    dline = np.minimum(bf, 1 - bf) * (T / nb)
    lmod = 0.5 + 0.5 * smoothstep(-1, 1, g.noise(0.6, 0.05))
    hline = smoothstep(0.0045, 0.0012, dline) * lmod
    dj = np.minimum(np.abs(pdelta(U, lo)), np.abs(pdelta(U, hi))) * T
    vline = smoothstep(0.0040, 0.0010, dj) * lmod

    # form-tie holes on a 0.8 m grid
    holes = np.zeros((N, N), F32)
    hole_ring = np.zeros((N, N), F32)
    plug = np.zeros((N, N), F32)
    rust_src = np.zeros((N, N), F32)
    k = 5
    for iy in range(k):
        for ix in range(k):
            cx = (ix + 0.5) / k * N + g.rng.normal(0, 1.5)
            cy = (iy + 0.5) / k * N + g.rng.normal(0, 1.5)
            r = g.m(0.013 + g.rng.uniform(-0.001, 0.002))
            dx, dy, idx = local_patch(cx, cy, r * 4)
            d = np.sqrt(dx * dx + dy * dy)
            if g.rng.random() < 0.25:     # grout-plugged hole
                pr = r * 1.7
                plug[idx] = np.maximum(plug[idx], smoothstep(pr + 0.8, pr - 0.8, d))
            else:
                holes[idx] = np.maximum(holes[idx], np.clip(1 - d / r, 0, 1) ** 0.6)
                hole_ring[idx] = np.maximum(hole_ring[idx],
                                            np.exp(-((d - r * 1.3) / (r * 0.4)) ** 2))
                if g.rng.random() < 0.6:
                    rust_src[idx] = np.maximum(rust_src[idx], smoothstep(r * 1.3, r * 0.5, d)
                                               * g.rng.uniform(0.4, 1.0))

    # bug holes (surface air voids)
    wb = g.worley(170, jitter=0.9)
    brr = g.cellrand(wb, 2)
    dens = 0.04 + 0.10 * smoothstep(-1, 1.5, g.noise(1.5, 0.2))
    aa = 170.0 / N
    brad = 0.04 + 0.10 * brr[0] ** 1.5
    bug = smoothstep(brad + aa, brad - aa, wb["f1"]) * (brr[1] < dens)

    # sparse vertical rain stains + drips + rust runs below tie holes
    streak_n = g.noise(1.5, 0.04, beta=2.0, sx=1.0, sy=8.0)
    streak = cover(streak_n, 0.25, 1.2) * smoothstep(-0.5, 1.5, g.noise(2.0, 0.4))
    srcs = cover(g.noise(0.3, 0.02, beta=1.5), 0.006, 0.2)
    lengths = g.m(0.3 + 1.2 * g.rng.random(N).astype(F32))
    dstreak = drip(srcs, lengths) * smoothstep(-1, 1, g.noise(0.8, 0.01, 1.5, sx=1, sy=10))
    dstreak = blur(dstreak, 1.2, 0.5)
    rlen = g.m(0.15 + 0.6 * g.rng.random(N).astype(F32))
    rstreak = drip(rust_src, rlen)
    rstreak = blur(rstreak, 1.2, 0.5) * (0.5 + 0.5 * smoothstep(-1, 1, g.noise(0.5, 0.01,
                                                                             1.5, sy=6)))
    effl = cover(g.noise(1.0, 0.03, beta=2.2, sy=3.0), 0.05, 0.6)

    # ---- height
    h = 0.0008 * macro + 0.00015 * mid + 0.00004 * fine + 0.000015 * sandy + board_h
    h += 0.00012 * grain
    h += 0.0004 * hline + 0.0003 * vline
    h -= 0.008 * holes
    h -= 0.0006 * plug
    h -= 0.0012 * bug
    # ---- albedo
    base = c3(0.585, 0.585, 0.565)
    tone = (1 + 0.035 * macro + 0.02 * mid + 0.022 * fine + 0.06 * board_tone + 0.025 * grain
            + 0.02 * sandy)
    alb = base * tone[..., None]
    alb = alb * (1 + 0.010 * g.noise(2.0, 0.2, 2.5)[..., None] * c3(1, 0.3, -1))
    alb = alb * (1 - 0.13 * hline - 0.10 * vline)[..., None]
    alb = alb * (1 - 0.09 * streak - 0.12 * dstreak)[..., None]
    alb = mix(alb, c3(0.70, 0.70, 0.68), effl * 0.22)
    alb = mix(alb, c3(0.46, 0.30, 0.19), np.clip(rstreak, 0, 1) * 0.45)
    alb = mix(alb, c3(0.66, 0.65, 0.62), plug * 0.8)
    alb = alb * (1 - 0.25 * hole_ring)[..., None]
    alb = mix(alb, c3(0.07, 0.065, 0.06), holes ** 0.5)
    alb = alb * (1 - 0.55 * bug)[..., None]
    rough = 0.88 + 0.04 * mid - 0.05 * streak + 0.03 * board_tone - 0.08 * rstreak
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.8, "nblur": 0.6}


def bricks(g, dark):
    T = g.tile
    ncol, nrow = 13, 40
    bw, bh = T / ncol, T / nrow
    mortar = 0.010
    rowf = V * nrow
    row = np.floor(rowf).astype(np.int32)
    off = (row % 2) * 0.5
    uu = U * ncol + off
    col = np.floor(uu).astype(np.int32) % ncol
    lu = (uu - np.floor(uu)) * bw
    lv = (rowf - row) * bh
    row = row % nrow
    bid = row * ncol + col
    R = g.rng.random((10, nrow * ncol), dtype=F32)
    rb = R[:, bid]
    cxm = lu - bw / 2 + (rb[0] - 0.5) * 0.003
    cym = lv - bh / 2 + (rb[1] - 0.5) * 0.002
    hw = (bw - mortar) / 2 - rb[2] * 0.002
    hh = (bh - mortar) / 2 - rb[3] * 0.0012
    rc = 0.0025
    qx = np.abs(cxm) - hw + rc
    qy = np.abs(cym) - hh + rc
    sd = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(
        np.maximum(qx, qy), 0) - rc
    en = g.noise(0.05, 0.003, beta=1.5) * 0.0008
    chipf = g.noise(0.1, 0.006, beta=1.8)
    chips = smoothstep(0.9, 2.2, chipf + 0.8 * (rb[4] - 0.5))
    chip_depth = chips * 0.009
    sde = sd + en + chip_depth * smoothstep(-0.012, 0.0, sd)
    brick = smoothstep(0.0006, -0.0006, sde)
    chipped = chips * smoothstep(-0.010, -0.001, sd) * brick

    # surface
    surf = g.noise(0.06, 0.005, beta=2.0)
    pw = g.worley(220, jitter=0.9)
    pr = g.cellrand(pw, 2)
    aa = 220.0 / N
    prad = 0.05 + 0.12 * pr[0]
    pits = smoothstep(prad + aa, prad - aa, pw["f1"]) * (pr[1] < 0.22)
    mot = g.noise(0.15, 0.01, beta=2.2)
    speck = smoothstep(2.0, 3.0, g.noise(0.008, 2 * g.px, beta=0.5))
    tilt = (rb[5] - 0.5) * 0.0015 * cxm / hw + (rb[6] - 0.5) * 0.0008 * cym / hh

    # ---- height
    face = smoothstep(0.0, 0.0028, -sde)
    mort_n = g.noise(0.02, 3 * g.px, beta=1.4)
    h_mortar = -0.0045 + 0.0004 * mort_n
    h_brick = -0.0045 + 0.0045 * face + 0.0002 * surf + tilt - 0.0008 * pits
    h_brick -= 0.0018 * chipped * (0.6 + 0.4 * smoothstep(-1, 1, surf))
    h = h_mortar * (1 - brick) + h_brick * brick
    h += 0.0004 * g.noise(1.5, 0.2, beta=3.0)

    # ---- colour
    if not dark:
        pal = [(0.00, (0.42, 0.18, 0.13)), (0.25, (0.53, 0.24, 0.17)),
               (0.55, (0.60, 0.29, 0.20)), (0.80, (0.66, 0.36, 0.26)),
               (1.00, (0.58, 0.40, 0.31))]
        mortar_col = c3(0.50, 0.485, 0.45)
        grime_col = c3(0.17, 0.13, 0.11)
        grime_frac = 0.22
    else:
        pal = [(0.00, (0.14, 0.12, 0.11)), (0.30, (0.22, 0.17, 0.14)),
               (0.60, (0.29, 0.23, 0.19)), (0.85, (0.33, 0.29, 0.26)),
               (1.00, (0.40, 0.31, 0.25))]
        mortar_col = c3(0.36, 0.345, 0.32)
        grime_col = c3(0.07, 0.065, 0.06)
        grime_frac = 0.40
    bcol = gradient_map(rb[7], pal)
    bcol = bcol * (0.86 + 0.28 * rb[8])[..., None]
    bcol = bcol * (1 + 0.10 * mot + 0.025 * surf)[..., None]
    # flashed (darker) brick ends
    endf = np.abs(cxm) / hw
    flash = (rb[9] > 0.72) * smoothstep(0.4, 1.0, endf) * 0.25
    bcol = bcol * (1 - flash)[..., None]
    bcol = mix(bcol, c3(0.12, 0.08, 0.07), speck * 0.6)
    bcol = bcol * (1 - 0.45 * pits)[..., None]
    chipcol = bcol * 1.12 + c3(0.03, 0.01, 0.0)
    bcol = mix(bcol, chipcol, chipped * 0.8)
    mcol = mortar_col * (1 + 0.09 * mort_n + 0.04 * g.noise(0.3, 0.02))[..., None]
    # mortar darker in the shadowed groove edge
    mcol = mcol * (1 - 0.25 * smoothstep(0.004, 0.0, sde))[..., None]
    alb = mcol * (1 - brick)[..., None] + bcol * brick[..., None]

    # grime / soot blotches (random, no vertical gradient so it tiles), efflorescence
    gr = g.warp_noise(g.noise(1.5, 0.08, beta=2.6), 0.05, 0.4, 0.04)
    grime = cover(gr, grime_frac, 1.0) * (0.6 + 0.4 * smoothstep(-1, 1, g.noise(0.2, 0.01)))
    alb = mix(alb, grime_col, grime * (0.45 if dark else 0.35))
    eff = cover(g.noise(0.8, 0.02, beta=2.0), 0.06, 0.8) * smoothstep(0.003, -0.002, -np.abs(sd))
    eff2 = cover(g.noise(0.8, 0.02, beta=2.0), 0.05, 0.8) * (1 - brick)
    alb = mix(alb, c3(0.74, 0.73, 0.69), np.maximum(eff * 0.25, eff2 * 0.3) * (0.5 if dark else 1))
    alb = alb * (1 + 0.04 * g.noise(3.0, 0.3, beta=3.0))[..., None]

    rough = 0.80 + 0.05 * surf + 0.08 * (1 - brick) + 0.06 * chipped + 0.04 * grime
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.3, "nblur": 0.7}


def mat_brick_red(g):
    return bricks(g, dark=False)


def mat_brick_dark(g):
    return bricks(g, dark=True)


def mat_asphalt(g):
    T = g.tile
    macro = g.noise(4.0, 0.4, beta=3.0)
    mid = g.noise(0.4, 0.03, beta=2.2)
    fine = g.noise(0.03, 2 * g.px, beta=1.0)

    # saw-cut repair patches (darker, finer, newer asphalt), wraparound rectangles
    patch = np.zeros((N, N), F32)
    patch_edge = np.zeros((N, N), F32)
    rag = g.noise(0.2, 0.01, beta=1.8) * 0.004
    for hw, hh in ((0.75, 0.42), (0.30, 1.1), (0.45, 0.35)):
        cx, cy = g.rng.random(2)
        hw *= g.rng.uniform(0.85, 1.15)
        hh *= g.rng.uniform(0.85, 1.15)
        dx = np.abs(pdelta(U, cx)) * T - hw
        dy = np.abs(pdelta(V, cy)) * T - hh
        sdp = np.maximum(dx, dy) + rag
        patch = np.maximum(patch, smoothstep(0.004, -0.004, sdp))
        patch_edge = np.maximum(patch_edge, np.exp(-(sdp / 0.008) ** 2))

    # aggregate
    ravel = smoothstep(-0.5, 1.8, g.noise(3.0, 0.3, 2.6)) * (1 - patch)
    w = g.worley(360, jitter=0.9)
    r = g.cellrand(w, 3)
    aa = 360.0 / N
    rad = 0.18 + 0.27 * r[0]
    present = r[1] < (0.40 + 0.25 * ravel - 0.25 * patch)
    st = smoothstep(rad + aa, rad - aa, w["f1"]) * present
    st_h = np.clip((rad - w["f1"]) / rad, 0, 1) * present
    st_col = gradient_map(r[2], [(0, (0.28, 0.275, 0.27)), (0.5, (0.40, 0.395, 0.38)),
                                 (0.85, (0.50, 0.48, 0.45)), (1, (0.58, 0.55, 0.50))])
    w2 = g.worley(150, jitter=0.9)
    r2 = g.cellrand(w2, 3)
    aa2 = 150.0 / N
    rad2 = 0.15 + 0.2 * r2[0]
    big = smoothstep(rad2 + aa2, rad2 - aa2, w2["f1"]) * (r2[1] < 0.12 * (1 - patch))
    big_col = gradient_map(r2[2], [(0, (0.33, 0.32, 0.31)), (1, (0.55, 0.53, 0.50))])
    voids = smoothstep(-1.9, -2.6, g.noise(0.015, 2 * g.px, 0.8)) * (0.4 + 0.6 * ravel)

    # cracks: long longitudinal + transverse, some sealed with tar bands
    nl = g.noise(5.0, 0.3, beta=2.6, sx=1.0, sy=4.0)
    nt = g.noise(5.0, 0.3, beta=2.6, sx=4.0, sy=1.0)
    jag = 1.2 * g.noise(0.1, 0.012, beta=1.5)
    cwid = 0.8 + 0.7 * smoothstep(-1, 1, g.noise(1.0, 0.1))
    cl = contour_lines(nl, cwid, jag) * cover(g.noise(5.0, 0.8, 2.5), 0.30, 0.6)
    ct = contour_lines(nt, cwid, jag) * cover(g.noise(5.0, 0.8, 2.5), 0.25, 0.6)
    cracks = np.maximum(cl, ct) * (1 - patch)
    sealed_mask = cover(g.noise(5.0, 1.0, 2.5), 0.45, 0.3)
    seal = np.maximum(contour_lines(nl, g.m(0.012), 0.3 * jag) * cover(g.noise(5.0, 0.8, 2.5),
                                                                          0.35, 0.3),
                      0.0) * sealed_mask * (1 - patch)
    seal = blur(seal, 0.7)
    cracks = cracks * (1 - smoothstep(0.2, 0.6, seal))
    # alligator cracking in one zone
    wa = g.worley(40, jitter=0.85, warp=(0.12 * g.noise(0.5, 0.05), 0.12 * g.noise(0.5, 0.05)),
                  edge=True)
    alli = smoothstep(0.035, 0.012, wa["edge"]) * cover(g.noise(4.0, 0.8, 3.0), 0.10, 0.6)
    alli *= (1 - patch)

    # tyre wear bands (vertical, faint): polished, slightly lighter, smoother
    wan = 0.04 * g.line1d(5.0, 0.5, 2.5, axis=0)
    c1, c2 = 1.15, 1.15 + 1.75
    tyre = np.zeros((N, N), F32)
    for c in (c1, c2):
        d = np.abs(pdelta(U, c / T) * T + wan)
        tyre = np.maximum(tyre, smoothstep(0.30, 0.10, d))
    tyre *= 0.6 + 0.4 * smoothstep(-1, 1, g.noise(2.0, 0.1, 2.0, sx=1, sy=6))
    lane = np.exp(-((pdelta(U, (c1 + 0.875) / T) * T) / 0.35) ** 2)
    od = g.worley(28, jitter=0.95)
    orr = g.cellrand(od, 3)
    orad = 0.05 + 0.10 * orr[0]
    oil = smoothstep(orad + 0.03, orad - 0.02, od["f1"]) * (orr[1] < 0.6 * lane + 0.04)
    oil *= 0.4 + 0.6 * orr[2]
    oil = np.maximum(oil, 0.5 * cover(g.noise(1.0, 0.1, 2.8), 0.05, 0.8) * lane)

    # ---- height
    h = 0.002 * macro + 0.0003 * mid + 0.0001 * fine
    h += 0.0012 * st_h * (1 - 0.5 * tyre) + 0.0012 * big - 0.0008 * voids
    h -= 0.0016 * cracks + 0.0010 * alli
    h += 0.0008 * patch - 0.0008 * patch_edge
    h = h * (1 - 0.4 * patch) + 0.0004 * seal
    # ---- albedo
    binder = c3(0.21, 0.21, 0.21) * (1 + 0.12 * macro + 0.06 * mid + 0.10 * fine)[..., None]
    alb = mix(binder, st_col, st * 0.62)
    alb = mix(alb, big_col, big * 0.75)
    alb = alb * (1 - 0.5 * voids)[..., None]
    fresh = c3(0.165, 0.165, 0.17) * (1 + 0.12 * fine + 0.06 * mid)[..., None]
    fresh = mix(fresh, st_col * 0.8, st * 0.55)
    alb = mix(alb, fresh, patch)
    alb = mix(alb, c3(0.07, 0.07, 0.07), patch_edge * 0.5)
    alb = alb * (1 + 0.07 * tyre)[..., None]
    alb = mix(alb, c3(0.08, 0.075, 0.07), oil * 0.5)
    alb = alb * (1 - 0.55 * cracks - 0.45 * alli)[..., None]
    alb = mix(alb, c3(0.05, 0.05, 0.053), seal * 0.9)
    dust = smoothstep(0.0, 2.0, g.noise(2.0, 0.05, 2.4))
    alb = mix(alb, c3(0.40, 0.38, 0.35), dust * 0.12)
    rough = 0.90 + 0.04 * mid - 0.10 * tyre - 0.06 * patch - 0.45 * seal - 0.25 * oil
    rough = rough - 0.05 * st
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.4, "nblur": 0.7}


def mat_metal_corrugated(g):
    T = g.tile
    nc = 27
    phase = TAU * nc * U
    prof = np.cos(phase)
    crest = smoothstep(0.2, 1.0, prof)
    valley = smoothstep(-0.2, -1.0, prof)
    macro = g.noise(2.0, 0.2, beta=3.0)
    mid = g.noise(0.3, 0.02, beta=2.2)
    fine = g.noise(0.02, 2 * g.px, beta=1.2)

    # profile + large-scale dents
    h = 0.009 * prof
    dents = g.noise(1.2, 0.15, beta=3.0) * 0.0012
    dings = np.zeros((N, N), F32)
    for _ in range(8):
        cx, cy = g.rng.random(2) * N
        rr = g.m(g.rng.uniform(0.04, 0.12))
        dx, dy, idx = local_patch(cx, cy, rr * 2.5)
        dings[idx] -= g.rng.uniform(0.001, 0.003) * np.exp(-(dx * dx + dy * dy) / (rr * rr))
    h += dents + dings

    # screws on purlin lines (v = 0 and v = 0.5), every 3rd valley
    screws = np.zeros((N, N), F32)
    washer = np.zeros((N, N), F32)
    screw_h = np.zeros((N, N), F32)
    rsrc = np.zeros((N, N), F32)
    for vrow in (0.0, 0.5):
        for k in range(0, nc, 3):
            cx = (k + 0.5) / nc * N + g.rng.normal(0, 0.6)
            cy = vrow * N + g.rng.normal(0, 1.2)
            rw = g.m(0.0085)
            rh = g.m(0.0045)
            dx, dy, idx = local_patch(cx, cy, rw * 4)
            d = np.sqrt(dx * dx + dy * dy)
            wsh = smoothstep(rw + 0.7, rw - 0.7, d)
            ang = np.arctan2(dy, dx) + g.rng.uniform(0, 1)
            hexd = d * np.cos(((ang + math.pi / 6) % (math.pi / 3)) - math.pi / 6)
            hd = smoothstep(rh + 0.6, rh - 0.6, hexd)
            washer[idx] = np.maximum(washer[idx], wsh)
            screws[idx] = np.maximum(screws[idx], hd)
            screw_h[idx] = np.maximum(screw_h[idx], 0.0025 * wsh * (1 - d / (rw + 1)) + 0.003 * hd)
            rsrc[idx] = np.maximum(rsrc[idx], smoothstep(rw * 1.8, rw * 0.6, d)
                                   * g.rng.uniform(0.5, 1.0))
    h = np.where(washer > 0, h * (1 - washer) + (-0.009 + screw_h) * washer, h)

    # paint wear: chips more on crests, rust patches
    chipn = g.noise(0.25, 0.004, beta=1.9)
    chip_t = 1.9 - 0.9 * crest - 0.4 * smoothstep(-1, 2, macro)
    chips = smoothstep(chip_t, chip_t + 0.25, chipn)
    rustn = g.noise(0.6, 0.006, beta=2.2)
    rust = smoothstep(1.4, 2.0, rustn + 0.4 * valley + 0.3 * macro)
    rust = np.maximum(rust, chips * smoothstep(-0.5, 0.5, g.noise(0.3, 0.02)))
    rust = np.maximum(rust, rsrc * 0.9)
    rust_tex = g.noise(0.03, 2 * g.px, beta=1.5)

    # rust bleeding downward, concentrated in valleys
    lens = g.m(0.15 + 0.7 * g.rng.random(N).astype(F32) ** 1.5)
    bleed = drip(np.clip(rust * 1.2, 0, 1), lens)
    bleed *= (0.35 + 0.65 * valley + 0.25 * (1 - crest)) * (
        0.5 + 0.5 * smoothstep(-1, 1, g.noise(0.6, 0.01, 1.4, sx=1, sy=8)))
    bleed = blur(bleed, 0.8, 0.4)
    streaks = smoothstep(0.0, 2.0, g.noise(1.5, 0.01, 1.6, sx=1, sy=12)) * (0.5 + 0.5 * valley)

    # ---- height
    h += 0.00003 * fine + 0.00012 * rust * (rust_tex + 1) - 0.00008 * chips
    # ---- albedo
    paint = c3(0.45, 0.50, 0.46) * (1 + 0.06 * macro + 0.03 * mid + 0.02 * fine)[..., None]
    fade = smoothstep(-1.0, 2.0, g.noise(1.0, 0.05, 2.4)) * 0.6 + 0.35 * crest
    paint = mix(paint, c3(0.58, 0.60, 0.57), fade * 0.45)
    paint = paint * (1 - 0.12 * valley)[..., None]
    alb = paint
    alb = mix(alb, c3(0.24, 0.22, 0.20), streaks * 0.22)
    bleed_c = np.clip(bleed, 0, 1)
    alb = mix(alb, c3(0.47, 0.27, 0.13), bleed_c * 0.6)
    zinc = c3(0.50, 0.51, 0.50) * (1 + 0.1 * fine)[..., None]
    alb = mix(alb, zinc, chips * 0.9)
    rcol = gradient_map(np.clip(0.5 + 0.25 * rust_tex + 0.2 * mid, 0, 1),
                        [(0, (0.20, 0.10, 0.06)), (0.5, (0.42, 0.21, 0.09)),
                         (0.8, (0.58, 0.32, 0.14)), (1, (0.66, 0.42, 0.20))])
    alb = mix(alb, rcol, rust)
    scol = c3(0.40, 0.40, 0.39)
    alb = mix(alb, scol, screws * 0.6)
    alb = mix(alb, c3(0.12, 0.12, 0.12), washer * (1 - screws) * 0.7)
    alb = mix(alb, c3(0.36, 0.20, 0.10), rsrc * 0.4 * screws)
    rough = 0.62 + 0.10 * fade + 0.05 * mid - 0.12 * chips + 0.28 * rust + 0.10 * bleed_c
    rough = rough + 0.06 * streaks
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.0, "nblur": 0.5}


def mat_metal_tread(g):
    T = g.tile
    nc = 48            # 48 x 48 lugs, pitch 31.25 mm
    p = T / nc
    cu = U * nc
    cv = V * nc
    i0 = np.floor(cu)
    j0 = np.floor(cv)
    s2 = 0.70710678
    a = 0.56 * p       # half length
    b = 0.135 * p      # half width
    lug = np.zeros((N, N), F32)
    dmin = np.full((N, N), 9.0, F32)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            ci = i0 + di
            cj = j0 + dj
            lx = (cu - (ci + 0.5)) * p
            ly = (cv - (cj + 0.5)) * p
            ori = np.where((cj % 2) == 0, 1.0, -1.0).astype(F32)   # rows alternate (herringbone)
            ax = (lx + ori * ly) * s2
            ay = (-ori * lx + ly) * s2
            d = (np.abs(ax / a) ** 1.35 + np.abs(ay / b) ** 1.35) ** (1 / 1.35)
            dmin = np.minimum(dmin, d)
    lug = smoothstep(1.0, 0.62, dmin) * (1 - 0.18 * dmin * dmin)
    lug_mask = smoothstep(1.0, 0.85, dmin)
    lug_top = smoothstep(0.6, 0.2, dmin)

    macro = g.noise(1.5, 0.15, beta=3.0)
    mid = g.noise(0.2, 0.01, beta=2.0)
    fine = g.noise(0.01, 2 * g.px, beta=1.0)
    traffic = smoothstep(-1.0, 1.5, macro)
    lugwear = np.clip(lug_top * (0.55 + 0.6 * traffic) + 0.25 * lug_mask * traffic, 0, 1)
    lugwear *= 0.7 + 0.3 * smoothstep(-1, 1, g.noise(0.08, 0.004, 1.5))
    scr = g.noise(0.5, 1.5 * g.px, beta=1.0, sx=1.0, sy=25.0)
    scr2 = g.noise(0.5, 1.5 * g.px, beta=1.0, angle=0.5, sx=1.0, sy=25.0)
    scratches = smoothstep(1.6, 2.8, np.maximum(scr, scr2)) * (0.3 + 0.7 * traffic)

    h_plate = 0.00005 * mid + 0.00002 * fine + 0.0003 * g.noise(1.5, 0.2, 3.0)
    h = 0.0018 * lug + h_plate
    cav = cavity(0.0018 * lug, 2.5)
    dirt_n = g.noise(0.3, 0.01, 2.0)
    dirt = np.clip(cav / 0.0004, 0, 1) * (0.55 + 0.45 * smoothstep(-1, 1, dirt_n))
    dirt = np.maximum(dirt, (1 - lug_mask) * smoothstep(0.3, 2.2, dirt_n + 0.6 * macro) * 0.75)
    rustp = cover(g.noise(0.4, 0.006, 2.0), 0.05, 0.4) * (1 - lug_top)
    h += 0.00008 * rustp * (fine + 1) * 0.5

    plate = c3(0.33, 0.335, 0.34) * (1 + 0.08 * mid + 0.05 * fine + 0.05 * macro)[..., None]
    plate = mix(plate, c3(0.22, 0.225, 0.235), smoothstep(-1, 1, g.noise(0.15, 0.01, 2.0)) * 0.5)
    alb = plate
    alb = mix(alb, c3(0.30, 0.20, 0.13) * (1 + 0.2 * fine)[..., None], rustp * 0.55)
    alb = mix(alb, c3(0.18, 0.165, 0.14) * (1 + 0.15 * fine)[..., None], dirt * 0.75)
    steel = c3(0.62, 0.62, 0.61) * (1 + 0.05 * fine)[..., None]
    alb = mix(alb, steel, lugwear * 0.85)
    alb = mix(alb, c3(0.50, 0.50, 0.49), scratches * 0.3 * (1 - dirt))
    rough = 0.60 + 0.05 * mid + 0.22 * dirt + 0.15 * rustp - 0.38 * lugwear - 0.10 * scratches
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.3, "nblur": 0.7}


def mat_metal_painted(g):
    T = g.tile
    macro = g.noise(2.0, 0.2, beta=3.0)
    mid = g.noise(0.3, 0.02, beta=2.2)
    peel = g.noise(0.012, 2 * g.px, beta=1.4)  # orange-peel paint texture
    wav = g.noise(1.5, 0.15, beta=3.0)

    # chipped paint: dark steel core, lighter primer rim, clustered in wear zones
    chipn = g.noise(0.25, 0.003, beta=2.0)
    zone = smoothstep(-0.3, 2.0, g.noise(1.2, 0.15, 2.6))
    chip_t = 2.7 - 1.0 * zone
    chips = smoothstep(chip_t, chip_t + 0.08, chipn)
    primer = smoothstep(chip_t - 0.22, chip_t - 0.14, chipn) * (1 - chips)
    # light rust spots and runs
    rs = g.worley(60, jitter=0.95)
    rr = g.cellrand(rs, 3)
    rrad = 0.03 + 0.08 * rr[0] ** 2
    rspot = smoothstep(rrad + 0.05, rrad - 0.02, rs["f1"]) * (rr[1] < 0.08)
    rspot = np.maximum(rspot, chips * smoothstep(0.0, 1.0, g.noise(0.1, 0.01)))
    halo = np.clip(blur(rspot, 3.0) * 1.5, 0, 1) * (1 - rspot)
    rbleed = drip(np.clip(rspot * 0.8, 0, 1), g.m(0.04 + 0.15 * g.rng.random(N).astype(F32)))
    rbleed = blur(rbleed, 0.8, 0.4) * (1 - rspot)

    # scratches: many faint scuffs, a few fine deep ones down to metal
    scr = np.zeros((N, N), F32)
    scr_deep = np.zeros((N, N), F32)
    for _ in range(360):
        x, y = g.rng.random(2) * N
        ang = g.rng.normal(0.0, 0.3) + (math.pi / 2 if g.rng.random() < 0.15 else 0.0)
        ln = g.rng.uniform(15, 120) * (1 + 1.5 * (g.rng.random() < 0.15))
        pts = wander_path(g.rng, x, y, ang, ln, 0.03, step=6.0)
        draw_path(scr, pts, g.rng.uniform(0.35, 0.75), g.rng.uniform(0.25, 0.8), 0.7)
    for _ in range(28):
        x, y = g.rng.random(2) * N
        ang = g.rng.normal(0.0, 0.3)
        pts = wander_path(g.rng, x, y, ang, g.rng.uniform(20, 90), 0.03, step=6.0)
        draw_path(scr_deep, pts, g.rng.uniform(0.35, 0.6), 1.0, 0.6)
    scr_rim = np.clip(blur(scr_deep, 1.2) * 2.5, 0, 1) * (1 - scr_deep)

    grime = smoothstep(-0.5, 2.0, g.warp_noise(g.noise(1.5, 0.05, 2.5), 0.04, 0.4, 0.04))
    vstreak = smoothstep(0.5, 2.5, g.noise(1.5, 0.01, 1.6, sx=1, sy=12))

    h = 0.0012 * wav + 0.000012 * peel
    h -= 0.00020 * chips + 0.00008 * primer
    h -= 0.00005 * scr + 0.00015 * scr_deep
    h += 0.00010 * rspot * (g.noise(0.01, 2 * g.px, 1.0) + 1)

    paint = c3(0.70, 0.705, 0.70) * (1 + 0.025 * macro + 0.012 * mid + 0.008 * peel)[..., None]
    alb = paint
    alb = mix(alb, c3(0.55, 0.54, 0.52), grime * 0.25)
    alb = mix(alb, c3(0.50, 0.49, 0.47), vstreak * 0.15)
    alb = mix(alb, c3(0.80, 0.80, 0.79), scr * 0.4)
    alb = mix(alb, c3(0.62, 0.55, 0.50), halo * 0.22)
    alb = mix(alb, c3(0.55, 0.40, 0.30), rbleed * 0.3)
    alb = mix(alb, c3(0.80, 0.80, 0.79), scr_rim * 0.35)
    metal = c3(0.20, 0.20, 0.205) * (1 + 0.15 * g.noise(0.05, 2 * g.px, 1.5))[..., None]
    alb = mix(alb, c3(0.30, 0.30, 0.30), scr_deep * 0.7)
    alb = mix(alb, c3(0.52, 0.52, 0.51), primer * 0.85)
    alb = mix(alb, metal, chips)
    alb = mix(alb, c3(0.45, 0.26, 0.13), rspot * 0.8)
    rough = 0.42 + 0.03 * mid + 0.15 * grime + 0.06 * vstreak + 0.10 * scr + 0.18 * chips
    rough = rough + 0.38 * rspot + 0.1 * scr_deep + 0.12 * primer
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.5, "nblur": 0.5}


def mat_rust(g):
    T = g.tile
    macro = g.noise(2.0, 0.25, beta=3.0)
    mid = g.noise(0.25, 0.012, beta=2.0)
    fine = g.noise(0.012, 2 * g.px, beta=1.2)
    crust = g.noise(0.04, 2 * g.px, beta=1.7)

    mA, rimA, shA, frA, tiltA = flake_layer(g, 18, 0.48, macro, 0.0030, 0.0030)
    mB, rimB, shB, frB, tiltB = flake_layer(g, 44, 0.45, -macro, 0.0016, 0.0018)
    mB = mB * (1 - mA)
    rimB = rimB * (1 - mA)
    shB = shB * (1 - mA)
    fl = np.clip(mA + mB, 0, 1)

    # pitting: dense on the exposed under-surface, sparse on the scale
    wp = g.worley(170, jitter=0.9)
    pr = g.cellrand(wp, 2)
    aa = 170.0 / N
    prad = 0.07 + 0.22 * pr[0] ** 1.5
    pdens = (0.18 + 0.45 * smoothstep(-0.5, 1.5, g.noise(1.0, 0.1))) * (1 - 0.8 * fl)
    pits = smoothstep(prad + aa, prad - aa, wp["f1"]) * (pr[1] < pdens)
    pit_depth = np.clip(1 - wp["f1"] / (prad + 1e-3), 0, 1) * pits
    pit_rim = smoothstep(prad + 0.12, prad + aa, wp["f1"]) * (pr[1] < pdens) * (1 - pits)

    # blisters under the scale
    wb = g.worley(22, jitter=0.9)
    br = g.cellrand(wb, 2)
    brad = 0.18 + 0.25 * br[0]
    blister = np.clip(1 - (wb["f1"] / brad) ** 2, 0, 1) ** 1.5 * (br[1] < 0.35)

    lift_A = mA * (0.0012 + 0.0012 * frA[1] + 0.02 * tiltA + 0.0005 * rimA)
    lift_B = mB * (0.0006 + 0.0005 * frB[1] + 0.02 * tiltB + 0.0003 * rimB)
    h = 0.0005 * macro + 0.0002 * mid + 0.00006 * fine + 0.00016 * crust
    h += 0.0012 * blister
    h += lift_A + lift_B
    h -= 0.0010 * pit_depth

    # colour: recessed under-surface dark brown, scale tops orange-brown, lifted rims bright
    tU = np.clip(0.45 + 0.22 * mid + 0.06 * fine + 0.06 * crust + 0.08 * macro, 0, 1)
    under = gradient_map(tU, [(0, (0.065, 0.042, 0.03)), (0.35, (0.13, 0.07, 0.04)),
                              (0.6, (0.20, 0.10, 0.05)), (0.85, (0.28, 0.14, 0.06)),
                              (1, (0.36, 0.19, 0.08))])
    flake_tone = np.where(mA > 0.5, frA[1], frB[1])
    tF = np.clip(0.50 + 0.16 * mid + 0.05 * fine + 0.08 * crust + 0.30 * (flake_tone - 0.5)
                 + 0.08 * macro, 0, 1)
    top = gradient_map(tF, [(0, (0.24, 0.12, 0.055)), (0.3, (0.35, 0.175, 0.075)),
                            (0.6, (0.46, 0.235, 0.095)), (0.82, (0.55, 0.30, 0.125)),
                            (1, (0.62, 0.39, 0.18))])
    alb = mix(under, top, fl)
    rim = np.clip(rimA + rimB, 0, 1)
    alb = mix(alb, np.minimum(alb * 1.45 + c3(0.05, 0.03, 0.01), 1), rim * 0.7)
    sh = np.clip(shA + shB, 0, 1)
    alb = alb * (1 - 0.55 * sh)[..., None]
    yel = cover(g.noise(0.15, 0.01, 2.0), 0.06, 0.5) * fl
    alb = mix(alb, c3(0.60, 0.42, 0.21), yel * 0.35)
    alb = mix(alb, c3(0.42, 0.22, 0.09), pit_rim * 0.35)
    alb = mix(alb, c3(0.04, 0.03, 0.025), pits * 0.85)
    alb = alb * (1 + 0.06 * blister)[..., None]
    paint = cover(g.noise(0.3, 0.01, 1.8), 0.03, 0.15) * mA
    alb = mix(alb, c3(0.34, 0.37, 0.34) * (1 + 0.1 * fine)[..., None], paint * 0.6)
    rough = 0.90 + 0.04 * crust - 0.05 * fl + 0.05 * pits - 0.12 * paint
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.3, "nblur": 0.7}


def mat_wood_crate(g):
    T = g.tile
    npl = 8
    ph = T / npl
    pv = V * npl
    pi = np.floor(pv).astype(np.int32) % npl
    pf = pv - np.floor(pv)
    joints_u = (0.04, 0.54)
    has_joint = g.rng.random(npl) < 0.6
    pr = g.rng.random((npl * 2, 7), dtype=F32)
    in_b = ((U >= joints_u[0]) & (U < joints_u[1])).astype(np.int32)
    seg = np.where(has_joint[pi], in_b, 0)
    sid = pi * 2 + seg
    sp = pr[sid]

    # grain: rings warped by stretched noise, independent per board via offsets
    warpn = g.noise(1.2, 0.03, beta=2.6, sx=12.0, sy=1.0)
    fibre = g.noise(0.4, 1.2 * g.px, beta=1.0, sx=40.0, sy=1.0)
    fibre2 = g.noise(0.3, 2 * g.px, beta=1.5, sx=12.0, sy=1.0)
    offx = sp[..., 0] * N
    offy = sp[..., 1] * N
    wv = sample(warpn, XPX + offx, YPX + offy)
    fv = sample(fibre, XPX + offx, YPX + offy)
    fv2 = sample(fibre2, XPX + offx, YPX + offy)

    # knots (with grain swirling around them)
    kfield = np.zeros((N, N), F32)
    kring = np.zeros((N, N), F32)
    kwarp = np.zeros((N, N), F32)
    for _ in range(6):
        kp = g.rng.integers(0, npl)
        cx = g.rng.random() * N
        cy = (kp + g.rng.uniform(0.3, 0.7)) / npl * N
        rx = g.m(g.rng.uniform(0.007, 0.014))
        ry = rx * g.rng.uniform(0.55, 0.85)
        dx, dy, idx = local_patch(cx, cy, rx * 9)
        dd = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        kfield[idx] = np.maximum(kfield[idx], smoothstep(1.15, 0.8, dd))
        kring[idx] = np.maximum(kring[idx], np.exp(-((dd - 1.25) / 0.3) ** 2))
        kwarp[idx] += 1.4 * np.exp(-(np.sqrt((dx / (rx * 3.5)) ** 2 + (dy / ry / 1.8) ** 2)) ** 2) \
            * np.sign(dy + 1e-3)

    rings_per_plank = 6 + 7 * sp[..., 2]
    ring_phase = (pf * rings_per_plank + 0.95 * wv + kwarp + sp[..., 3] * 10 + 0.02 * fv)
    rings = 0.5 + 0.5 * np.sin(TAU * ring_phase)
    late = smoothstep(0.66, 0.98, rings)
    early = smoothstep(0.5, 0.0, rings)

    # gaps between planks, rounded edges
    gap = 0.003
    db = np.minimum(pf, 1 - pf) * ph - gap / 2 + g.noise(0.5, 0.02) * 0.0002
    plank = smoothstep(-0.0003, 0.0005, db)
    edge_round = smoothstep(0.0, 0.0035, db)
    djx = np.minimum(np.abs(pdelta(U, joints_u[0])), np.abs(pdelta(U, joints_u[1]))) * T
    butt = smoothstep(0.0011, 0.0003, djx) * has_joint[pi]
    end_round = smoothstep(0.0, 0.003, djx - 0.0007) if True else 1
    end_round = np.where(has_joint[pi], end_round, 1.0)
    endgrain = smoothstep(0.03, 0.0, djx) * has_joint[pi]
    plank = plank * (1 - butt)
    edge_round = edge_round * end_round

    # splits along grain
    spl = contour_lines(g.noise(0.6, 0.02, 2.0, sx=20, sy=1), 0.6) * cover(
        g.noise(0.8, 0.1, 2.0, sx=4, sy=1), 0.10, 0.3)

    # nails at the batten columns, two per plank (either side of joints)
    nails = np.zeros((N, N), F32)
    nail_h = np.zeros((N, N), F32)
    dent = np.zeros((N, N), F32)
    rust_src = np.zeros((N, N), F32)
    for k in range(npl):
        for ju in joints_u:
            offs = (-0.016, 0.016) if has_joint[k] else (0.0,)
            for ox in offs:
                for fy in (0.3, 0.7):
                    cx = (ju * T + ox) / T * N + g.rng.normal(0, 1.0)
                    cy = (k + fy + g.rng.normal(0, 0.03)) / npl * N
                    rn = g.m(0.0034)
                    dx, dy, idx = local_patch(cx, cy, rn * 6)
                    d = np.sqrt(dx * dx + dy * dy)
                    nm = smoothstep(rn + 0.6, rn - 0.6, d)
                    nails[idx] = np.maximum(nails[idx], nm)
                    nail_h[idx] = np.maximum(nail_h[idx], nm * (0.0006 - 0.0003 * (d / rn) ** 2))
                    dent[idx] = np.maximum(dent[idx], np.exp(-(d / (rn * 2.2)) ** 2))
                    rust_src[idx] = np.maximum(rust_src[idx], smoothstep(rn * 2.2, rn, d)
                                               * g.rng.uniform(0.3, 1.0))
    rstreak = blur(drip(rust_src, g.m(0.02 + 0.07 * g.rng.random(N).astype(F32))), 1.0, 0.6)

    macro = g.noise(1.0, 0.1, beta=3.0)
    wgrain = g.noise(0.6, 0.01, beta=2.0, sx=10.0, sy=1.0)
    weather = np.clip(0.40 + 0.30 * smoothstep(-1.5, 1.5, 0.6 * macro + 1.0 * wgrain)
                      + 0.30 * (sp[..., 4] - 0.5) + 0.25 * (1 - edge_round), 0, 1)

    # height
    h = -0.0010 * (1 - edge_round) + 0.00022 * late - 0.00008 * early + 0.00006 * fv
    h += 0.00004 * fv2 + 0.0004 * (sp[..., 5] - 0.5) + 0.0003 * (sp[..., 6] - 0.5) * (pf - 0.5)
    h -= 0.0004 * spl
    h -= 0.00035 * dent
    h = h * plank + (-0.004) * (1 - plank)
    h = np.where(nails > 0, h * (1 - nails) + (0.0002 + nail_h) * nails, h)
    h += 0.0001 * kfield

    # colour
    tone = 0.80 + 0.36 * sp[..., 4]
    wood = c3(0.63, 0.48, 0.32) * tone[..., None]
    wood = wood * (1 + 0.10 * fv + 0.05 * fv2)[..., None]
    wood = mix(wood, wood * c3(0.62, 0.52, 0.45), late * 0.75)
    wood = mix(wood, wood * 1.06, early * 0.5)
    grey = c3(0.56, 0.54, 0.50) * (0.9 + 0.2 * sp[..., 4])[..., None]
    grey = grey * (1 + 0.10 * fv + 0.06 * fv2)[..., None]
    grey = mix(grey, grey * c3(0.62, 0.60, 0.58), late * 0.65)
    alb = mix(wood, grey, weather * 0.7)
    alb = mix(alb, alb * c3(0.62, 0.52, 0.45), kring * 0.5)
    alb = mix(alb, c3(0.27, 0.18, 0.11), kfield * 0.85)
    alb = alb * (1 - 0.15 * endgrain)[..., None]
    dirt = smoothstep(0.3, 2.2, g.noise(0.8, 0.02, 2.2))
    alb = mix(alb, c3(0.30, 0.26, 0.21), dirt * 0.25)
    alb = alb * (1 - 0.22 * (1 - edge_round))[..., None]
    alb = alb * (1 - 0.6 * spl)[..., None]
    alb = mix(alb, c3(0.33, 0.21, 0.12), np.clip(rstreak, 0, 1) * 0.5 * (1 - nails))
    alb = mix(alb, c3(0.07, 0.055, 0.045), 1 - plank)
    ncol = gradient_map(np.clip(0.5 + 0.3 * g.noise(0.01, 2 * g.px), 0, 1),
                        [(0, (0.20, 0.19, 0.18)), (0.6, (0.31, 0.21, 0.13)),
                         (1, (0.42, 0.27, 0.14))])
    alb = mix(alb, ncol, nails)
    rough = 0.76 + 0.08 * weather + 0.05 * fv + 0.15 * (1 - plank) - 0.15 * nails
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.3, "nblur": 0.5}


def mat_plaster_wall(g):
    T = g.tile
    macro = g.noise(2.5, 0.3, beta=3.0)
    trowel = g.noise(0.6, 0.04, beta=2.8)
    stipple = g.noise(0.012, 1.5 * g.px, beta=1.2)
    fine = g.noise(0.05, 2 * g.px, beta=1.8)

    patchn = g.noise(1.5, 0.1, beta=2.5)
    patch = cover(patchn, 0.07, 0.15)
    patch_edge = contour_lines(patchn - float(np.quantile(patchn, 0.93)), 1.5) * 0.7

    cracks = 0.8 * crack_network(g, 5, 0.85, 0.8, 0.22, 1.0, 0.12)

    scuff = np.zeros((N, N), F32)
    scuff_light = np.zeros((N, N), F32)
    for _ in range(70):
        x, y = g.rng.random(2) * N
        ang = g.rng.normal(0, 0.25) + (math.pi if g.rng.random() < 0.5 else 0)
        ln = g.rng.uniform(12, 70)
        pts = wander_path(g.rng, x, y, ang, ln, 0.04, step=4.0)
        if g.rng.random() < 0.65:
            draw_path(scuff, pts, g.rng.uniform(1.0, 3.5), g.rng.uniform(0.25, 0.8), 1.8)
        else:
            draw_path(scuff_light, pts, g.rng.uniform(1.5, 4.0), g.rng.uniform(0.3, 0.8), 2.0)
    scuff = blur(scuff, 0.8)
    chips = np.zeros((N, N), F32)
    chipn = g.noise(0.03, 0.006, 2.0)
    for _ in range(18):
        cx, cy = g.rng.random(2) * N
        r = g.rng.uniform(1.5, 5.0)
        dx, dy, idx = local_patch(cx, cy, r * 3)
        d = np.sqrt(dx * dx + dy * dy) / r + 0.25 * chipn[idx]
        chips[idx] = np.maximum(chips[idx], smoothstep(1.1, 0.9, d))

    grime = smoothstep(-0.5, 2.0, g.warp_noise(g.noise(1.5, 0.06, 2.5), 0.05, 0.4, 0.05))
    smudge = cover(g.noise(0.3, 0.02, 2.2), 0.06, 0.8)

    h = 0.0012 * macro + 0.00035 * trowel * (1 - patch) + 0.00002 * stipple * (1 - 0.6 * patch)
    h += 0.00003 * fine + 0.0002 * patch
    h -= 0.00035 * cracks + 0.0004 * chips

    base = c3(0.71, 0.745, 0.69)
    alb = base * (1 + 0.025 * macro + 0.012 * trowel + 0.01 * stipple + 0.01 * fine)[..., None]
    alb = mix(alb, c3(0.75, 0.775, 0.725), patch * 0.6)
    alb = alb * (1 - 0.05 * patch_edge)[..., None]
    alb = mix(alb, c3(0.56, 0.55, 0.47), grime * 0.28)
    alb = mix(alb, c3(0.50, 0.50, 0.46), smudge * 0.15)
    alb = mix(alb, c3(0.24, 0.24, 0.24), np.clip(scuff, 0, 1) * 0.55)
    alb = mix(alb, c3(0.80, 0.81, 0.78), scuff_light * 0.4)
    alb = alb * (1 - 0.45 * cracks)[..., None]
    alb = mix(alb, c3(0.86, 0.85, 0.80), chips)
    rough = 0.72 + 0.03 * trowel + 0.08 * grime - 0.15 * np.clip(scuff, 0, 1) - 0.06 * patch
    rough = rough + 0.15 * chips + 0.1 * scuff_light
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 2.0, "nblur": 0.5}


def mat_tiles_floor(g):
    T = g.tile
    nt = 4
    tu = U * nt
    tv = V * nt
    ti = np.floor(tu).astype(np.int32) % nt
    tj = np.floor(tv).astype(np.int32) % nt
    fu = tu - np.floor(tu)
    fv = tv - np.floor(tv)
    tid = tj * nt + ti
    parity = (ti + tj) % 2
    tr = g.rng.random((nt * nt, 5), dtype=F32)
    trr = tr[tid]

    colA = c3(0.68, 0.635, 0.55)
    colB = c3(0.545, 0.545, 0.525)
    base = np.where(parity[..., None] == 0, colA, colB)
    base = base * (0.97 + 0.06 * trr[..., 0])[..., None]
    replaced = (tid == int(g.rng.integers(0, nt * nt)))
    base = np.where(replaced[..., None], base * c3(1.03, 1.02, 1.0), base)

    mx = g.noise(0.25, 0.004, beta=1.7, sx=1.0, sy=3.5)
    my = g.noise(0.25, 0.004, beta=1.7, sx=3.5, sy=1.0)
    mot = np.where(parity == 0, mx, my)
    flecks = g.noise(0.01, 1.5 * g.px, beta=0.8)
    fl_l = smoothstep(1.6, 2.4, flecks)
    fl_d = smoothstep(-1.6, -2.4, flecks)

    ds = np.minimum(np.minimum(fu, 1 - fu), np.minimum(fv, 1 - fv)) * (T / nt)
    seam = smoothstep(0.0013, 0.0004, ds)
    seam_dirt = smoothstep(0.012, 0.0, ds) * smoothstep(-0.8, 1.5, g.noise(0.4, 0.01))

    scuff = np.zeros((N, N), F32)
    for _ in range(140):
        x, y = g.rng.random(2) * N
        ang = g.rng.uniform(0, TAU)
        ln = g.rng.uniform(8, 36)
        pts = wander_path(g.rng, x, y, ang, ln, 0.05, step=3.0)
        draw_path(scuff, pts, g.rng.uniform(0.8, 2.2), g.rng.uniform(0.25, 0.8), 1.4)
    scuff = blur(scuff, 0.5)
    fine_scr = smoothstep(1.8, 2.8, g.noise(0.3, 1.5 * g.px, 1.0, sx=1, sy=20, angle=0.3))
    traffic = smoothstep(-0.8, 1.5, g.noise(1.5, 0.2, 3.0))
    dirt = smoothstep(0.0, 2.2, g.warp_noise(g.noise(1.0, 0.04, 2.3), 0.03, 0.3, 0.03))

    # chipped corners on a few tiles
    corner = np.zeros((N, N), F32)
    cn = g.noise(0.02, 0.002, 1.5)
    for _ in range(2):
        cxi, cyi = g.rng.integers(0, nt, 2)
        cx = cxi / nt * N + g.rng.uniform(-2, 2)
        cy = cyi / nt * N + g.rng.uniform(-2, 2)
        r = g.rng.uniform(4, 10)
        dx, dy, idx = local_patch(cx, cy, r * 2)
        dd = np.sqrt(dx * dx + dy * dy) / r + 0.4 * cn[idx]
        corner[idx] = np.maximum(corner[idx], smoothstep(1.05, 0.9, dd))

    h = 0.00012 * (trr[..., 1] - 0.5) + 0.0003 * g.noise(1.5, 0.3, 3.0)
    h -= 0.00035 * smoothstep(0.003, 0.0, ds)
    h -= 0.0004 * seam
    h += 0.000015 * mot
    h -= 0.0005 * corner

    alb = base * (1 + 0.035 * mot)[..., None]
    alb = mix(alb, alb * 1.18 + 0.03, fl_l * 0.6)
    alb = mix(alb, alb * 0.6, fl_d * 0.6)
    alb = mix(alb, c3(0.42, 0.39, 0.34), dirt * 0.25)
    alb = mix(alb, alb * 0.88 + c3(0.03, 0.03, 0.025), traffic * 0.4)
    alb = mix(alb, c3(0.62, 0.60, 0.56), fine_scr * 0.15 * traffic)
    alb = mix(alb, c3(0.10, 0.10, 0.10), np.clip(scuff, 0, 1) * 0.7)
    alb = mix(alb, c3(0.30, 0.27, 0.22), seam_dirt * 0.5)
    alb = mix(alb, c3(0.12, 0.11, 0.10), seam)
    alb = mix(alb, c3(0.30, 0.29, 0.27), corner)
    rough = 0.38 + 0.03 * mot + 0.18 * traffic + 0.18 * dirt + 0.12 * np.clip(scuff, 0, 1)
    rough = rough + 0.08 * fine_scr + 0.4 * seam + 0.3 * seam_dirt + 0.45 * corner
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.5, "nblur": 0.5}


def stone_layer(g, cells, height, facets=7, jitter=0.85, warp_amp=0.04):
    T = g.tile
    c = cells
    cell_m = T / c
    wn = (warp_amp * g.noise(cell_m * 3, cell_m / 2, 2.0),
          warp_amp * g.noise(cell_m * 3, cell_m / 2, 2.0))
    w = g.worley(c, jitter, warp=wn, edge=True)
    nc = c * c
    sid = w["id"]
    Hs = (height * (0.55 + 0.8 * g.rng.random(nc))).astype(F32)
    dx = -w["ox"] * cell_m      # pixel - feature point (m)
    dy = -w["oy"] * cell_m
    hmin = np.full((N, N), 1e9, F32)
    fidx = np.zeros((N, N), np.int32)
    angs = g.rng.random((nc, facets), dtype=F32) * TAU
    slopes = (0.5 + 1.4 * g.rng.random((nc, facets))).astype(F32)
    radii = ((0.10 + 0.30 * g.rng.random((nc, facets))) * cell_m).astype(F32)
    for k in range(facets):
        a = angs[sid, k]
        Hk = Hs[sid] - slopes[sid, k] * ((dx * np.cos(a) + dy * np.sin(a)) - radii[sid, k])
        m = Hk < hmin
        hmin = np.where(m, Hk, hmin)
        fidx = np.where(m, k, fidx)
    tilt_a = g.rng.random(nc).astype(F32)[sid] * TAU
    tilt_s = 0.35 * g.rng.random(nc).astype(F32)[sid]
    top = Hs[sid] + tilt_s * (dx * np.cos(tilt_a) + dy * np.sin(tilt_a))
    m = top < hmin
    fidx = np.where(m, facets, fidx)
    hs = np.minimum(hmin, top)
    # per-stone gap width and edge steepness: some stones touch, others leave dark voids
    gap = (0.0003 + 0.0035 * g.rng.random(nc) ** 1.5).astype(F32)[sid]
    eslope = (1.5 + 3.0 * g.rng.random(nc)).astype(F32)[sid]
    edge_m = w["edge"] * cell_m - gap
    hs = np.minimum(hs, edge_m * eslope)
    rnd = g.rng.random((nc, 4), dtype=F32)
    return hs, sid, fidx, rnd[sid], edge_m


def mat_gravel(g):
    T = g.tile
    hA, idA, fA, rA, eA = stone_layer(g, 50, 0.026)
    hB, idB, fB, rB, eB = stone_layer(g, 84, 0.017)
    hC, idC, fC, rC, eC = stone_layer(g, 150, 0.009)
    hB = hB - 0.007
    hC = hC - 0.013
    base = -0.02 + 0.002 * g.noise(0.1, 0.01, 2.0)
    layers = np.stack([hA, hB, hC, base])
    win = np.argmax(layers, axis=0)
    h = np.max(layers, axis=0)

    def sel(a, b, c, d):
        return np.choose(win, [a, b, c, d])

    rr = np.stack([sel(rA[..., k], rB[..., k], rC[..., k], np.zeros_like(h)) for k in range(4)])
    facet = sel(fA, fB, fC, np.zeros_like(fA)).astype(F32)
    facet_tone = ((facet * 0.618 + rr[0] * 7.0) % 1.0) - 0.5

    macro = g.noise(2.0, 0.2, 3.0)
    speck = g.noise(0.006, 1.5 * g.px, 0.6)
    grain = g.noise(0.02, 1.5 * g.px, 1.5)
    stone = gradient_map(rr[1], [(0, (0.36, 0.36, 0.37)), (0.3, (0.45, 0.45, 0.45)),
                                 (0.6, (0.53, 0.52, 0.51)), (0.85, (0.60, 0.585, 0.56)),
                                 (1.0, (0.56, 0.51, 0.46))])
    stone = stone * (1 + 0.12 * facet_tone + 0.05 * grain)[..., None]
    stone = mix(stone, stone * 1.3, smoothstep(1.7, 2.5, speck) * 0.5)
    stone = mix(stone, stone * 0.55, smoothstep(-1.7, -2.5, speck) * 0.5)
    gaps = (win == 3).astype(F32)
    ao = (np.clip(1 - cavity(h, 2.5) / 0.004, 0, 1) * np.clip(1 - cavity(h, 9.0) / 0.010, 0, 1))
    depth = np.clip((h + 0.02) / 0.04, 0, 1)
    convex = np.clip((h - blur(h, 1.2)) / 0.0015, 0, 1)
    alb = stone * (0.30 + 0.70 * ao * (0.45 + 0.55 * depth))[..., None]
    alb = alb * (1 + 0.15 * convex)[..., None]
    alb = mix(alb, c3(0.07, 0.065, 0.06), gaps * 0.85)
    rusty = smoothstep(0.0, 2.0, macro + 0.6 * g.noise(0.3, 0.02, 2.0))
    alb = mix(alb, alb * c3(1.05, 0.86, 0.70), rusty * 0.55)
    dust = smoothstep(0.0, 2.2, g.noise(0.6, 0.02, 2.0)) * (1 - depth)
    alb = mix(alb, c3(0.34, 0.31, 0.28), dust * 0.35)
    rough = 0.84 + 0.08 * (1 - ao) + 0.03 * grain
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 0.9, "nblur": 0.6}


def mat_hazard_stripes(g):
    T = g.tile
    K = 4
    macro = g.noise(0.8, 0.08, 3.0)
    mid = g.noise(0.1, 0.005, 2.0)
    fine = g.noise(0.005, 2 * g.px, 1.2)
    edge_n = g.noise(0.05, 0.002, 1.5)
    q = (U + V) * K + 0.004 * edge_n
    fq = q - np.floor(q)
    perp = T / (K * math.sqrt(2))
    dist_edge = np.minimum(np.abs(fq - 0.5), np.minimum(fq, 1 - fq)) * perp
    yellow = np.where(fq < 0.5, 1.0, 0.0).astype(F32)
    soft = smoothstep(0.0, 0.0012, dist_edge)
    yellow = 0.5 + (yellow - 0.5) * soft

    # paint wear
    chipn = g.noise(0.12, 0.002, 1.8)
    zone = smoothstep(-0.8, 1.8, macro)
    chip_t = 2.0 - 1.2 * zone
    chips = smoothstep(chip_t, chip_t + 0.1, chipn)
    worn = smoothstep(chip_t - 0.6, chip_t, chipn) * (1 - chips)
    scr = np.zeros((N, N), F32)
    for _ in range(220):
        x, y = g.rng.random(2) * N
        ang = g.rng.uniform(0, TAU)
        ln = g.rng.uniform(15, 120)
        pts = wander_path(g.rng, x, y, ang, ln, 0.05, step=5.0)
        draw_path(scr, pts, g.rng.uniform(0.4, 1.0), g.rng.uniform(0.4, 1.0), 0.7)
    rustn = g.noise(0.05, 0.002, 1.6)
    rust = chips * smoothstep(-0.6, 0.8, rustn + zone)

    h = 0.00015 * macro + 0.00002 * mid + 0.000006 * fine
    h -= 0.00012 * chips + 0.00008 * scr
    h += 0.00006 * rust * (fine + 1)

    ycol = c3(0.86, 0.66, 0.10)
    fadeY = smoothstep(-1.0, 1.5, g.noise(0.6, 0.05, 2.5))
    ycol = mix(np.broadcast_to(ycol, (N, N, 3)).astype(F32), c3(0.80, 0.68, 0.30), fadeY * 0.4)
    bcol = mix(np.broadcast_to(c3(0.07, 0.07, 0.068), (N, N, 3)).astype(F32), c3(0.17, 0.165, 0.155),
               fadeY * 0.5)
    paint = mix(bcol, ycol, yellow)
    paint = paint * (1 + 0.03 * mid + 0.02 * fine)[..., None]
    dirt = smoothstep(-0.5, 2.0, g.warp_noise(g.noise(0.6, 0.02, 2.4), 0.01, 0.1, 0.01))
    paint = mix(paint, c3(0.30, 0.27, 0.22), dirt * 0.35)
    paint = mix(paint, paint * 0.8 + 0.06, worn * 0.5)
    steel = c3(0.22, 0.22, 0.225) * (1 + 0.12 * fine + 0.08 * mid)[..., None]
    alb = mix(paint, steel, chips)
    alb = mix(alb, c3(0.38, 0.21, 0.10) * (1 + 0.2 * fine)[..., None], rust * 0.8)
    alb = mix(alb, c3(0.45, 0.44, 0.42), scr * 0.5 * (1 - chips))
    rough = 0.55 + 0.05 * (1 - yellow) + 0.25 * dirt + 0.1 * worn - 0.05 * chips + 0.35 * rust
    rough = rough + 0.05 * mid
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 2.0, "nblur": 0.5}


def mat_dirt_ground(g):
    T = g.tile
    macro = g.noise(3.0, 0.3, beta=3.2)
    mid = g.noise(0.4, 0.02, beta=2.4)
    fine = g.noise(0.02, 3 * g.px, beta=1.6)

    # faint tyre ruts (vertical), with chevron tread imprints
    wan = 0.06 * g.line1d(4.0, 0.4, 2.5, axis=0)
    xm = U * T
    ruts = np.zeros((N, N), F32)
    tread = np.zeros((N, N), F32)
    rut_str = 0.4 + 0.6 * smoothstep(-1.0, 1.0, g.line1d(4.0, 0.3, 2.0, axis=0))
    for c in (1.0, 2.75):
        dxr = pdelta(U, c / T) * T + wan
        ruts += np.exp(-(dxr / 0.14) ** 2) - 0.35 * np.exp(-((np.abs(dxr) - 0.24) / 0.07) ** 2)
        tp = np.sin(TAU * (V * 80 + np.abs(dxr) / 0.05 * 0.6))
        tread += smoothstep(0.3, 0.8, tp) * smoothstep(0.11, 0.07, np.abs(dxr))
    ruts *= rut_str
    tread *= rut_str * smoothstep(-0.5, 1.0, g.noise(0.6, 0.05, 2.0))

    # pebbles
    w = g.worley(260, jitter=0.9)
    r = g.cellrand(w, 3)
    aa = 260.0 / N
    rad = 0.12 + 0.30 * r[0]
    peb = smoothstep(rad + aa, rad - aa, w["f1"]) * (r[1] < 0.16)
    peb_h = np.clip(1 - (w["f1"] / (rad + 1e-3)) ** 2, 0, 1) * (r[1] < 0.16)
    w2 = g.worley(80, jitter=0.9)
    r2 = g.cellrand(w2, 3)
    aa2 = 80.0 / N
    rad2 = 0.10 + 0.18 * r2[0]
    stn = smoothstep(rad2 + aa2, rad2 - aa2, w2["f1"]) * (r2[1] < 0.08)
    stn_h = np.clip(1 - (w2["f1"] / (rad2 + 1e-3)) ** 2, 0, 1) ** 0.5 * (r2[1] < 0.08)

    # dried mud cracks in some low areas
    wc = g.worley(55, jitter=0.85, warp=(0.2 * g.noise(0.4, 0.04), 0.2 * g.noise(0.4, 0.04)),
                  edge=True)
    h0 = 0.007 * macro + 0.003 * mid - 0.012 * ruts
    low = smoothstep(np.quantile(h0, 0.35), np.quantile(h0, 0.12), h0)
    mudc = smoothstep(0.03, 0.008, wc["edge"]) * low * cover(g.noise(2.0, 0.3), 0.5, 0.5)

    h = h0 + 0.0004 * fine + 0.002 * peb_h + 0.006 * stn_h - 0.003 * tread * 0.5
    h -= 0.002 * mudc
    wet = smoothstep(np.quantile(h, 0.12), np.quantile(h, 0.03), h)

    base = gradient_map(np.clip(0.5 + 0.18 * macro + 0.12 * mid + 0.1 * fine, 0, 1),
                        [(0, (0.24, 0.19, 0.14)), (0.4, (0.36, 0.30, 0.23)),
                         (0.7, (0.44, 0.38, 0.30)), (1, (0.52, 0.47, 0.39))])
    hi = smoothstep(np.quantile(h, 0.6), np.quantile(h, 0.95), h)
    alb = mix(base, c3(0.55, 0.50, 0.42), hi * 0.3)
    org = cover(g.noise(0.2, 0.01, 2.0), 0.08, 0.5)
    alb = mix(alb, c3(0.18, 0.15, 0.11), org * 0.5)
    pcol = gradient_map(r[2], [(0, (0.30, 0.29, 0.28)), (0.5, (0.50, 0.47, 0.42)),
                               (1, (0.62, 0.58, 0.50))])
    alb = mix(alb, pcol * (0.8 + 0.3 * peb_h)[..., None], peb * 0.9)
    scol = gradient_map(r2[2], [(0, (0.36, 0.35, 0.34)), (1, (0.58, 0.55, 0.50))])
    alb = mix(alb, scol * (0.75 + 0.35 * stn_h)[..., None], stn * 0.9)
    alb = alb * (1 - 0.18 * tread)[..., None]
    alb = alb * (1 - 0.5 * mudc)[..., None]
    alb = alb * (1 - 0.25 * wet)[..., None]
    rough = 0.93 + 0.03 * fine - 0.45 * wet - 0.1 * stn
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.4, "nblur": 0.7}


def mat_roof_tar(g):
    T = g.tile
    ns = 4
    edge_w = 0.006 * g.line1d(0.8, 0.03, 2.0, axis=1)
    sv = V * ns + edge_w / (T / ns)
    si = np.floor(sv).astype(np.int32) % ns
    t = sv - np.floor(sv)
    sr = g.rng.random((ns, 3), dtype=F32)
    srr = sr[si]
    macro = g.noise(3.0, 0.3, 3.0)
    mid = g.noise(0.3, 0.02, 2.2)
    gran = g.noise(0.008, 1.3 * g.px, 0.5)
    wrinkle = g.noise(0.8, 0.03, 2.2, sx=1.0, sy=5.0)

    thick = 0.003
    h_strip = thick * smoothstep(0.86, 0.985, t)
    dist_edge = (1 - t) * (T / ns)          # distance above the lapped edge
    below = t * (T / ns)                     # distance below the edge of the strip above
    bead = smoothstep(0.012, 0.003, below) * smoothstep(-0.3, 1.0, g.noise(0.3, 0.02, 2.0))

    # blisters
    blist = np.zeros((N, N), F32)
    for _ in range(9):
        cx, cy = g.rng.random(2) * N
        rx = g.m(g.rng.uniform(0.05, 0.16))
        ry = rx * g.rng.uniform(0.6, 1.0)
        dx, dy, idx = local_patch(cx, cy, rx * 1.3)
        dd = (dx / rx) ** 2 + (dy / ry) ** 2
        blist[idx] = np.maximum(blist[idx], np.clip(1 - dd, 0, 1) ** 1.5)
    bcr = contour_lines(g.noise(0.1, 0.01, 1.8), 0.7) * smoothstep(0.4, 0.8, blist)

    # patches (newer, darker) with tar-sealed edges
    patch = np.zeros((N, N), F32)
    pedge = np.zeros((N, N), F32)
    rag = 0.004 * g.noise(0.2, 0.01, 1.8)
    for _ in range(2):
        cx, cy = g.rng.random(2)
        hw = g.rng.uniform(0.25, 0.45)
        hh = g.rng.uniform(0.2, 0.35)
        sdp = np.maximum(np.abs(pdelta(U, cx)) * T - hw, np.abs(pdelta(V, cy)) * T - hh) + rag
        patch = np.maximum(patch, smoothstep(0.003, -0.003, sdp))
        pedge = np.maximum(pedge, np.exp(-((sdp + 0.002) / 0.008) ** 2))

    bald = cover(g.warp_noise(g.noise(0.6, 0.01, 2.0), 0.02, 0.2, 0.02), 0.10, 0.3) * (1 - patch)
    chalk = smoothstep(-0.5, 2.0, macro + 0.5 * mid)
    puddle = g.noise(2.0, 0.2, 2.8)
    pt = float(np.quantile(puddle, 0.87))
    tide = contour_lines(puddle - pt, 2.0) * 0.6 + 0.25 * smoothstep(pt - 0.05, pt + 0.05, puddle)

    h = h_strip + 0.0006 * macro + 0.00025 * wrinkle + 0.00006 * gran * (1 - bald)
    h += 0.004 * blist - 0.0002 * bcr
    h += 0.0008 * patch + 0.0003 * pedge + 0.0003 * bead
    h -= 0.00005 * bald

    base = c3(0.19, 0.19, 0.195) * (0.93 + 0.14 * srr[..., 0])[..., None]
    base = base * (1 + 0.06 * mid + 0.07 * macro)[..., None]
    alb = mix(base, base * 1.75, smoothstep(1.0, 2.2, gran) * 0.7)
    alb = mix(alb, base * 0.5, smoothstep(-1.0, -2.2, gran) * 0.7)
    alb = mix(alb, c3(0.31, 0.31, 0.30), chalk * 0.3)
    alb = mix(alb, c3(0.075, 0.075, 0.075), bald * 0.65)
    pcol = c3(0.135, 0.135, 0.14) * (1 + 0.06 * mid)[..., None]
    pcol = mix(pcol, pcol * 1.7, smoothstep(1.0, 2.2, gran) * 0.6)
    alb = mix(alb, pcol, patch)
    alb = mix(alb, c3(0.06, 0.06, 0.06), np.maximum(pedge * 0.55, bead * 0.8))
    alb = mix(alb, c3(0.36, 0.34, 0.31), tide * 0.35)
    alb = alb * (1 - 0.5 * bcr)[..., None]
    alb = alb * (1 + 0.15 * smoothstep(0.006, 0.0, dist_edge))[..., None]
    alb = alb * (1 - 0.35 * smoothstep(0.02, 0.0, below))[..., None]
    rough = 0.85 + 0.05 * chalk - 0.35 * bald - 0.45 * np.maximum(pedge, bead) - 0.08 * patch
    rough = rough + 0.03 * mid
    return {"albedo": alb, "height": h, "rough": rough, "nstrength": 1.5, "nblur": 0.5}


def flake_layer(g, cells, cover_frac, macro, inset, edge_amp, warp_amp=0.22):
    """Lifted scale flakes: Voronoi cells with irregular but crisp edges.
    Returns (mask, rim, outer shadow, per-cell randoms, tilt)."""
    T = g.tile
    cell_m = T / cells
    w = g.worley(cells, jitter=0.85,
                 warp=(warp_amp * g.noise(cell_m * 4, cell_m / 4),
                       warp_amp * g.noise(cell_m * 4, cell_m / 4)), edge=True)
    fr = g.cellrand(w, 4)
    edge_m = w["edge"] * cell_m
    en = g.noise(cell_m * 0.6, 2 * g.px, beta=2.2) * edge_amp
    present = (fr[0] < cover_frac + 0.2 * smoothstep(-1, 1, macro)).astype(F32)
    fe = edge_m + en - inset
    mask = smoothstep(-0.0004, 0.0004, fe) * present
    rim = smoothstep(0.0030, 0.0004, fe) * mask
    shadow = smoothstep(-0.0050, -0.0002, fe) * (1 - mask) * present
    tilt = ((fr[2] - 0.5) * (-w["ox"]) + (fr[3] - 0.5) * (-w["oy"])) * cell_m
    return mask, rim, shadow, fr, tilt


def seam_stats(arr, struct=(0, 0)):
    """Seam metrics along x and y for an image array.
    ratio  : wrap-pair |difference| / mean |difference| of the interior pairs that straddle an
             8 px block boundary (the wrap pair is always a JPEG block boundary, so this is the
             fair reference; for PNG it is just a 1/8 subsample of all interior pairs).
    matched: for maps with intentional structure on the tile border (joints, plank gaps, strip
             laps...), max |diff| in a 3-pair window around the wrap / the same measure around
             the interior repeats of that structure (k * size / n). None if not applicable.
    A real seam pushes both well above 1."""
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    out = []
    for b, n in ((a, struct[0]), (a.transpose(1, 0, 2), struct[1])):
        W = b.shape[1]
        dx = np.abs(np.diff(b, axis=1)).mean(axis=(0, 2))       # dx[i]: pair (i, i+1)
        seam = float(np.abs(b[:, 0] - b[:, -1]).mean())
        ratio = seam / (float(dx[7::8].mean()) + 1e-9)
        matched = None
        if n and n > 1:
            vals = []
            for k in range(1, n):
                p = int(round(k * W / n))
                vals.append(float(dx[p - 2:p + 1].max()))
            seam3 = max(float(dx[W - 2]), seam, float(dx[0]))
            matched = seam3 / (float(np.mean(vals)) + 1e-9)
        out.append((ratio, matched))
    return out


def _check_arrays(label, arrs, struct, informational=False):
    ok = True
    for suf, a in arrs:
        (rx, mx), (ry, my) = seam_stats(a, struct)
        okx = rx < 1.5 or (mx is not None and mx < 1.5)
        oky = ry < 1.5 or (my is not None and my < 1.5)
        good = okx and oky
        tag = ("OK " if good else "BAD") if not informational else "ftr"
        if not informational:
            ok &= good
        fm = lambda m: "  -  " if m is None else f"{m:5.2f}"
        print(f"  {tag} {label:24s} {suf:7s} {a.shape[1]:4d}px  "
              f"x {rx:5.2f} / {fm(mx)}   y {ry:5.2f} / {fm(my)}")
    return ok


MATERIALS = [
    # name, tile size (m), seed, function, border structure repeats per tile (x, y):
    # 0 = nothing aligned to the tile border on that axis, n = a feature sits on the border and
    # repeats n times per tile (used by the seam check), (1, 1) = border-only feature.
    ("concrete_floor", 4.0, 1101, mat_concrete_floor, (1, 1)),
    ("concrete_wall", 4.0, 1202, mat_concrete_wall, (0, 20)),
    ("brick_red", 3.0, 1303, mat_brick_red, (13, 40)),
    ("brick_dark", 3.0, 1404, mat_brick_dark, (13, 40)),
    ("asphalt", 5.0, 1505, mat_asphalt, (0, 0)),
    ("metal_corrugated", 2.0, 1606, mat_metal_corrugated, (27, 2)),
    ("metal_tread", 1.5, 1707, mat_metal_tread, (48, 48)),
    ("metal_painted", 2.0, 1808, mat_metal_painted, (0, 0)),
    ("rust", 2.0, 1909, mat_rust, (0, 0)),
    ("wood_crate", 1.2, 2010, mat_wood_crate, (0, 8)),
    ("plaster_wall", 3.0, 2111, mat_plaster_wall, (0, 0)),
    ("tiles_floor", 2.0, 2212, mat_tiles_floor, (4, 4)),
    ("gravel", 3.0, 2313, mat_gravel, (0, 0)),
    ("hazard_stripes", 1.0, 2414, mat_hazard_stripes, (0, 0)),
    ("dirt_ground", 4.0, 2515, mat_dirt_ground, (0, 0)),
    ("roof_tar", 4.0, 2616, mat_roof_tar, (0, 4)),
]


# ----------------------------------------------------------------------------------------
# FX sprites (not tiling; alpha reaches 0 at the border)
# ----------------------------------------------------------------------------------------
def fx_noise(rng, h, w, lmin_px, lmax_px, beta=2.0):
    wn = rng.standard_normal((h, w))
    F = np.fft.rfft2(wn)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    f = np.maximum(np.sqrt(fx * fx + fy * fy), 1e-4)
    amp = f ** (-beta / 2) / (1 + (1.0 / lmax_px / f) ** 4) / (1 + (f / (1.0 / lmin_px)) ** 4)
    amp[0, 0] = 0
    o = np.fft.irfft2(F * amp, s=(h, w))
    return ((o - o.mean()) / (o.std() + 1e-9)).astype(F32)


def fx_grid(h, w, cx=None, cy=None):
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    return xx + 0.5 - cx, yy + 0.5 - cy


def bleed_rgb(rgb, a):
    """Fill colour under (near-)transparent pixels with alpha-weighted neighbourhood colour
    so bilinear / mip / premultiplied sampling never pulls in black."""
    h, w = a.shape
    out = rgb.copy()
    acc = np.zeros_like(rgb)
    wacc = np.zeros_like(a)
    for s in (2, 6, 16, 48):
        k = np.exp(-2 * (math.pi ** 2) * (s ** 2) * ((np.fft.rfftfreq(w)[None, :]) ** 2 +
                                                       (np.fft.fftfreq(h)[:, None]) ** 2))
        wa = np.fft.irfft2(np.fft.rfft2(a) * k, s=(h, w))
        ca = np.stack([np.fft.irfft2(np.fft.rfft2(rgb[..., c] * a) * k, s=(h, w))
                       for c in range(3)], -1)
        good = (wa > 1e-4) & (wacc < 1e-6)
        acc[good] = ca[good] / wa[good][:, None]
        wacc[good] = 1.0
    fill = np.where(wacc[..., None] > 0, acc, rgb)
    t = smoothstep(0.0, 0.25, a)[..., None]
    out = fill * (1 - t) + rgb * t
    return np.clip(out, 0, 1)


def save_rgba(name, rgb, a):
    os.makedirs(FX_DIR, exist_ok=True)
    rgb = bleed_rgb(rgb.astype(F32), a.astype(F32))
    img = np.concatenate([to_u8(rgb), to_u8(np.clip(a, 0, 1))[..., None]], -1)
    Image.fromarray(img, "RGBA").save(os.path.join(FX_DIR, name), optimize=True)


def flash_ramp(I):
    return gradient_map(np.clip(I, 0, 1), [(0.0, (0.95, 0.30, 0.04)), (0.3, (1.0, 0.50, 0.10)),
                                          (0.6, (1.0, 0.78, 0.32)), (0.85, (1.0, 0.95, 0.75)),
                                          (1.0, (1.0, 1.0, 0.97))])


def fx_muzzle_front(rng):
    S = 256
    dx, dy = fx_grid(S, S)
    r = np.sqrt(dx * dx + dy * dy) / (S / 2)
    th = np.arctan2(dy, dx)
    k = 5
    base = rng.uniform(0, TAU)
    nz = fx_noise(rng, S, S, 7, 60, 2.2)
    petals = np.zeros((S, S), F32)
    for i in range(k):
        a = base + i * TAU / k + rng.normal(0, 0.22)
        L = rng.uniform(0.62, 0.93)
        wid = rng.uniform(0.26, 0.40)
        dth = (th - a + math.pi) % TAU - math.pi + 0.025 * nz * r
        wr = wid * np.clip(1 - r / L, 0, 1) ** 0.8 + 0.015
        p = np.exp(-(dth / wr) ** 2) * smoothstep(L, L * 0.25, r)
        petals = np.maximum(petals, p)
        a2 = a + rng.uniform(0.35, 0.6) * rng.choice([-1, 1])
        L2 = L * rng.uniform(0.35, 0.55)
        dth2 = (th - a2 + math.pi) % TAU - math.pi
        wr2 = 0.18 * np.clip(1 - r / L2, 0, 1) ** 0.8 + 0.01
        petals = np.maximum(petals, 0.7 * np.exp(-(dth2 / wr2) ** 2) * smoothstep(L2, 0.0, r))
    core = np.exp(-(r / 0.16) ** 2)
    glow = np.exp(-(r / 0.42) ** 2)
    I = np.maximum(core, petals * (0.85 + 0.15 * nz) * (0.55 + 0.45 * np.exp(-(r / 0.5) ** 2)))
    I = np.clip(I + 0.18 * glow, 0, 1.2)
    rgb = flash_ramp(I * 1.05)
    a = smoothstep(0.04, 0.55, I) * smoothstep(1.0, 0.85, r)
    save_rgba("muzzle_flash_front.png", rgb, a)


def fx_muzzle_side(rng):
    W, H = 256, 128
    dx, dy = fx_grid(H, W, cx=14, cy=H / 2)
    x = np.clip(dx / (W - 20), -0.2, 1.2)
    ay = np.abs(dy) / (H / 2)
    nz = fx_noise(rng, H, W, 6, 50, 2.2)
    nz2 = fx_noise(rng, H, W, 3, 14, 1.8)
    width = 0.08 + 0.55 * np.clip(x, 0, 1) ** 0.8 * (1 - 0.35 * np.clip(x, 0, 1))
    width = width * (1 + 0.22 * nz)
    cone = np.exp(-(ay / np.maximum(width, 1e-3)) ** 2) * smoothstep(1.0, 0.5, x + 0.08 * nz) \
        * smoothstep(-0.06, 0.02, x)
    lobes = 0.5 + 0.5 * np.cos(TAU * (x * 3.2 + 0.15))
    axis = np.exp(-(ay / (0.05 + 0.12 * np.clip(x, 0, 1))) ** 2) * smoothstep(0.85, 0.1, x)
    I = cone * (0.55 + 0.25 * lobes) + 0.65 * axis * (0.7 + 0.3 * lobes)
    for _ in range(5):        # side jets
        xs = rng.uniform(0.15, 0.55)
        sgn = rng.choice([-1, 1])
        ang = rng.uniform(0.5, 0.9)
        px = (x - xs) * (W - 20) / (H / 2)
        py = dy / (H / 2) * sgn
        al = px * math.cos(ang) + py * math.sin(ang)
        pe = -px * math.sin(ang) + py * math.cos(ang)
        L = rng.uniform(0.3, 0.6)
        jet = np.exp(-(pe / (0.07 * np.clip(1 - al / L, 0, 1) + 0.01)) ** 2) * smoothstep(
            L, 0.0, al) * smoothstep(-0.05, 0.05, al)
        I = np.maximum(I, 0.55 * jet)
    core = np.exp(-((dx / 18.0) ** 2 + (dy / 9.0) ** 2))
    I = np.maximum(I, core) * (0.88 + 0.12 * nz) * (0.95 + 0.05 * nz2)
    I = np.clip(I, 0, 1.2)
    rgb = flash_ramp(I * 1.05)
    a = smoothstep(0.05, 0.5, I)
    a *= smoothstep(W / 2 - 1, W / 2 - 10, np.abs(dx + 14 - W / 2)) * smoothstep(
        H / 2 - 1, H / 2 - 8, np.abs(dy))
    save_rgba("muzzle_flash_side.png", rgb, a)


def fx_bullet_hole(rng):
    S = 128
    dx, dy = fx_grid(S, S)
    r = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dy, dx)
    ang_lo = np.zeros_like(r)
    for k, amp in ((2, 0.05), (3, 0.06), (5, 0.07)):
        ang_lo += amp * np.cos(k * th + rng.uniform(0, TAU))
    ang_hi = np.zeros_like(r)
    for k in (7, 9, 12, 15):
        ang_hi += rng.uniform(0.02, 0.05) * np.cos(k * th + rng.uniform(0, TAU))
    nz = fx_noise(rng, S, S, 1.5, 12, 1.5)
    nz2 = fx_noise(rng, S, S, 5, 40, 2.2)
    hole_r = 4.5 * (1 + 0.15 * ang_lo + 0.5 * ang_hi)
    crater_r = 16.0 * (1 + ang_lo + ang_hi + 0.04 * nz)
    hole = smoothstep(hole_r + 0.9, hole_r - 0.9, r)
    crater = smoothstep(crater_r + 0.9, crater_r - 0.9, r)
    depth = np.clip(1 - r / crater_r, 0, 1)
    shade = np.clip(1 + 0.45 * ((dx + dy) / (r + 1e-3)) * depth, 0.6, 1.35)
    fresh = gradient_map(np.clip(0.55 + 0.22 * nz, 0, 1), [(0, (0.40, 0.39, 0.37)),
                                                           (1, (0.68, 0.67, 0.64))])
    fresh = fresh * (shade * (0.62 + 0.38 * (1 - depth) ** 0.7))[..., None]
    chips = smoothstep(1.6, 2.4, nz) * smoothstep(crater_r + 7, crater_r, r) * (1 - crater)
    cracks = np.zeros((S, S), F32)
    xs = np.arange(S)[None, :] + 0.5
    ys = np.arange(S)[:, None] + 0.5
    for _ in range(rng.integers(3, 6)):
        a0 = rng.uniform(0, TAU)
        r0 = 14.0
        pts = wander_path(rng, S / 2 + math.cos(a0) * r0, S / 2 + math.sin(a0) * r0, a0,
                          rng.uniform(8, 20), 0.4, step=2.5)
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            ddx, ddy = x1 - x0, y1 - y0
            t = np.clip(((xs - x0) * ddx + (ys - y0) * ddy) / (ddx * ddx + ddy * ddy + 1e-9), 0, 1)
            d = np.sqrt((xs - x0 - t * ddx) ** 2 + (ys - y0 - t * ddy) ** 2)
            wv = 0.55 * (1 - i / len(pts)) + 0.2
            cracks = np.maximum(cracks, np.clip(wv - d + 0.5, 0, 1) * (1 - i / len(pts) * 0.6))
    cracks *= (1 - crater)
    dust = np.exp(-(r / (32 * (1 + 0.3 * ang_lo))) ** 2) * (0.75 + 0.25 * nz2)
    rgb = np.empty((S, S, 3), F32)
    rgb[:] = c3(0.24, 0.23, 0.22)
    rgb = mix(rgb, c3(0.62, 0.61, 0.58), chips * 0.8)
    rgb = mix(rgb, fresh, crater)
    rgb = mix(rgb, c3(0.14, 0.13, 0.12), cracks)
    rgb = mix(rgb, c3(0.03, 0.03, 0.03), hole)
    a = np.clip(np.maximum.reduce([dust * 0.72, crater, cracks * 0.8, chips * 0.8, hole]), 0, 1)
    a *= smoothstep(63, 48, r)
    save_rgba("bullet_hole.png", rgb, a)


def fx_bullet_hole_metal(rng):
    S = 128
    dx, dy = fx_grid(S, S)
    r = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dy, dx)
    nz = fx_noise(rng, S, S, 1.5, 10, 1.5)
    nz2 = fx_noise(rng, S, S, 3, 30, 2.0)
    ang = np.zeros_like(r)
    for k in (3, 5, 7, 11, 13):
        ang += rng.uniform(0.02, 0.07) * np.cos(k * th + rng.uniform(0, TAU))
    hole_r = 4.6 * (1 + ang)
    hole = smoothstep(hole_r + 0.8, hole_r - 0.8, r)
    # torn, pushed-in lip: bright jagged petals
    petals = 0.5 + 0.5 * np.cos(6 * th + 2 * ang * 10 + rng.uniform(0, TAU))
    lip_r = hole_r + 1.2 + 1.6 * petals
    lip = smoothstep(lip_r + 0.8, lip_r - 0.6, r) * (1 - hole)
    # dent bowl, lit from upper-left (subtle baked shading for decal)
    dent_r = 15.0
    slope = np.where(r < dent_r, np.sin(np.pi * np.clip(r / dent_r, 0, 1)), 0)
    light = ((dx * 0.6 + dy * 0.8) / (r + 1e-3)) * slope
    # paint stripped ring with radial scratches
    ring_r = 13.0 * (1 + 2.0 * ang + 0.08 * nz2)
    ring = smoothstep(ring_r + 1.2, ring_r - 1.2, r) * (1 - lip) * (1 - hole)
    radial = 0.5 + 0.5 * np.cos(th * 70 + 4 * nz)
    scratch = (0.7 + 0.3 * radial) * (0.85 + 0.15 * nz)
    bare = gradient_map(np.clip(0.45 + 0.35 * scratch + 0.25 * light, 0, 1),
                        [(0, (0.30, 0.30, 0.31)), (0.6, (0.58, 0.58, 0.58)),
                         (1, (0.82, 0.82, 0.80))])
    # flaked paint fragments at the rim of the stripped area
    flake_r = ring_r + 4.0 + 3.0 * (0.5 + 0.5 * nz2)
    flakes = smoothstep(flake_r + 1, flake_r - 1, r) * (1 - ring) * smoothstep(-0.3, 0.6, nz)
    soot = np.exp(-(r / 22.0) ** 2) * (0.7 + 0.3 * nz2)
    rgb = np.empty((S, S, 3), F32)
    rgb[:] = c3(0.24, 0.235, 0.23)
    rgb = mix(rgb, c3(0.40, 0.40, 0.40), flakes * 0.8)
    rgb = mix(rgb, bare, ring)
    rgb = mix(rgb, c3(0.86, 0.86, 0.83) * (0.85 + 0.15 * petals)[..., None], lip)
    rgb = mix(rgb, c3(0.02, 0.02, 0.02), hole)
    a = np.maximum.reduce([soot * 0.45, flakes * 0.75, ring, lip, hole])
    a *= smoothstep(62, 48, r)
    save_rgba("bullet_hole_metal.png", rgb, a)


def fx_smoke(rng):
    S = 128
    dx, dy = fx_grid(S, S)
    dens = np.zeros((S, S), F32)
    for _ in range(10):
        cx, cy = rng.normal(0, 10, 2)
        rad = rng.uniform(15, 27)
        dens += rng.uniform(0.5, 1.0) * np.exp(-((dx - cx) ** 2 + (dy - cy) ** 2) / (rad * rad))
    dens /= dens.max()
    n1 = fx_noise(rng, S, S, 8, 60, 2.6)
    n2 = fx_noise(rng, S, S, 4, 20, 2.0)
    d = dens * (1 + 0.22 * n1) + 0.06 * n2 * dens
    r = np.sqrt(dx * dx + dy * dy) / (S / 2)
    a = smoothstep(0.06, 0.70, d) ** 1.2 * 0.85 * smoothstep(1.0, 0.8, r)
    shade = np.clip(0.80 + 0.18 * ((-dx - dy) / (S / 2)) + 0.10 * (d - 0.5) + 0.04 * n1, 0.6, 1.0)
    rgb = c3(0.88, 0.875, 0.865) * shade[..., None]
    save_rgba("smoke_puff.png", rgb, a)


def fx_spark(rng):
    S = 64
    dx, dy = fx_grid(S, S)
    ang = -0.35
    ax = dx * math.cos(ang) + dy * math.sin(ang)
    ay = -dx * math.sin(ang) + dy * math.cos(ang)
    tail = np.where(ax < 0, 1.0, 0.45)
    core = np.exp(-(ax / (20 * tail)) ** 2 - (ay / 1.6) ** 2)
    glow = np.exp(-(ax / (26 * tail)) ** 2 - (ay / 5.5) ** 2)
    I = np.clip(core + 0.45 * glow, 0, 1.2)
    rgb = gradient_map(np.clip(I, 0, 1), [(0, (1.0, 0.45, 0.08)), (0.5, (1.0, 0.75, 0.30)),
                                          (0.85, (1.0, 0.95, 0.80)), (1, (1, 1, 1))])
    a = smoothstep(0.02, 0.6, I)
    rr = np.sqrt(dx * dx + dy * dy)
    a *= smoothstep(32, 28, rr)
    save_rgba("spark.png", rgb, a)


def fx_blood(rng):
    S = 128
    dx, dy = fx_grid(S, S)
    r = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dy, dx)
    nz = fx_noise(rng, S, S, 4, 30, 2.2)
    field = np.zeros((S, S), F32)

    def ball(cx, cy, rx, ry, ang, wgt=1.0):
        ca, sa = math.cos(ang), math.sin(ang)
        u = (dx - cx) * ca + (dy - cy) * sa
        v = -(dx - cx) * sa + (dy - cy) * ca
        return wgt * np.exp(-((u / rx) ** 2 + (v / ry) ** 2))

    edge = np.zeros_like(r)
    for k in (2, 3, 5, 7, 9, 11, 13):
        edge += rng.uniform(0.02, 0.07) * np.cos(k * th + rng.uniform(0, TAU))
    rad = 16 * (1 + edge + 0.05 * nz)
    field += np.exp(-(r / rad) ** 4) * 1.3
    for _ in range(10):       # scallops / lobes on the pool rim
        a = rng.uniform(0, TAU)
        d = rng.uniform(13, 18)
        rr = rng.uniform(2.5, 4.5)
        field += ball(math.cos(a) * d, math.sin(a) * d, rr * 1.3, rr, a)
    for _ in range(11):       # thin spines thrown outward, ending in a droplet
        a = rng.uniform(0, TAU)
        d0 = rng.uniform(14, 18)
        L = rng.uniform(6, 16)
        w0 = rng.uniform(1.2, 2.0)
        for t in np.linspace(0, 1, 10):
            field += ball(math.cos(a) * (d0 + L * t), math.sin(a) * (d0 + L * t),
                          w0 * 1.8, w0 * (1 - 0.55 * t), a, 0.85)
        dd = d0 + L + rng.uniform(2.5, 5)
        sz = rng.uniform(1.1, 2.0)
        field += ball(math.cos(a) * dd, math.sin(a) * dd, sz * 1.4, sz, a, 1.0)
    for _ in range(30):       # satellite droplets
        a = rng.uniform(0, TAU)
        d = rng.uniform(22, 56)
        sz = rng.uniform(0.7, 2.2) * (1 - d / 80)
        field += ball(math.cos(a) * d, math.sin(a) * d, sz * 1.3, sz, a, 1.0)
    m = smoothstep(0.42, 0.58, field)
    a = m * 0.96 * smoothstep(63, 56, r)
    t = np.clip(0.55 + 0.20 * nz - 0.35 * np.exp(-(r / 13) ** 2)
                + 0.15 * (1 - np.clip(field, 0, 1)), 0, 1)
    rgb = gradient_map(t, [(0, (0.20, 0.012, 0.018)), (0.6, (0.34, 0.025, 0.03)),
                           (1, (0.46, 0.05, 0.04))])
    save_rgba("blood_splat.png", rgb, a)

def fx_scorch(rng):
    S = 256
    dx, dy = fx_grid(S, S)
    r = np.sqrt(dx * dx + dy * dy) / (S / 2)
    th = np.arctan2(dy, dx)
    nz = fx_noise(rng, S, S, 8, 90, 2.6)
    mid = fx_noise(rng, S, S, 4, 24, 2.0)
    rays = np.zeros_like(r)
    for _ in range(70):
        a = rng.uniform(0, TAU)
        w = rng.uniform(0.012, 0.05)
        L = rng.uniform(0.45, 0.95)
        dth = (th - a + math.pi) % TAU - math.pi
        rays = np.maximum(rays, rng.uniform(0.4, 1.0) * np.exp(-(dth / w) ** 2)
                          * smoothstep(L, L * 0.35, r))
    angn = np.zeros_like(r)
    for k in (3, 5, 8, 13):
        angn += rng.uniform(0.03, 0.08) * np.cos(k * th + rng.uniform(0, TAU))
    rr = r * (1 + angn + 0.10 * nz)
    body = smoothstep(0.72, 0.10, rr)
    dens = np.clip(np.maximum(body, 0.55 * rays * smoothstep(0.98, 0.3, rr)) * (0.9 + 0.1 * mid),
                   0, 1)
    a = np.clip(dens * 0.94, 0, 1) * smoothstep(1.0, 0.9, r)
    t = np.clip(rr * 1.2 + 0.08 * mid, 0, 1)
    rgb = gradient_map(t, [(0, (0.035, 0.032, 0.03)), (0.45, (0.06, 0.055, 0.05)),
                           (1, (0.12, 0.10, 0.085))])
    save_rgba("scorch.png", rgb, a)


FX = [
    ("muzzle_flash_front.png", 3101, fx_muzzle_front),
    ("muzzle_flash_side.png", 3202, fx_muzzle_side),
    ("bullet_hole.png", 3303, fx_bullet_hole),
    ("bullet_hole_metal.png", 3404, fx_bullet_hole_metal),
    ("smoke_puff.png", 3505, fx_smoke),
    ("spark.png", 3606, fx_spark),
    ("blood_splat.png", 3707, fx_blood),
    ("scorch.png", 3808, fx_scorch),
]


# ----------------------------------------------------------------------------------------
# Verification
# ----------------------------------------------------------------------------------------
def verify_textures(names):
    print("\nSeam check (wrap-pair diff / interior block-boundary diff  |  structure-matched);"
          "\n'ftr' = intentional feature centred on the border, verified by the re-render below it:")
    ok = True
    for name, tile, seed, fn, struct in MATERIALS:
        if name not in names:
            continue
        arrs = []
        for suf in ("albedo.jpg", "normal.png", "rough.jpg"):
            p = os.path.join(TEX_DIR, name, f"{name}_{suf}")
            arrs.append((suf.split(".")[0], np.asarray(Image.open(p))))
        ok &= _check_arrays(name, arrs, struct, informational=(struct == (1, 1)))
        if struct == (1, 1):
            # The only instance of the border feature is on the border itself (no interior
            # repeat to compare against), so re-render without it and check everything else.
            g = Gen(seed, tile)
            g.no_border = True
            res = fn(g)
            arrs = [("albedo", to_u8(np.clip(res["albedo"], 0, 1))),
                    ("normal", height_to_normal(res["height"], tile, res.get("nstrength", 1.0),
                                                res.get("nblur", 0.5))),
                    ("rough", to_u8(downsample2(np.clip(res["rough"], 0, 1))))]
            ok &= _check_arrays(name + " (no joint)", arrs, (0, 0))
    return ok


def dir_size(d):
    tot = 0
    for root, _, files in os.walk(d):
        for f in files:
            tot += os.path.getsize(os.path.join(root, f))
    return tot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma separated material names")
    ap.add_argument("--no-fx", action="store_true")
    ap.add_argument("--fx-only", action="store_true")
    ap.add_argument("--check", action="store_true", help="only verify existing outputs")
    args = ap.parse_args()
    only = [s for s in args.only.split(",") if s]
    names = [m[0] for m in MATERIALS if not only or m[0] in only]
    t0 = time.time()
    if not args.check and not args.fx_only:
        os.makedirs(TEX_DIR, exist_ok=True)
        for name, tile, seed, fn, _ in MATERIALS:
            if name not in names:
                continue
            t1 = time.time()
            g = Gen(seed, tile)
            res = fn(g)
            lum, rmean = save_material(name, tile, res)
            print(f"{name:17s} tile {tile:3.1f} m  albedo luma {lum:.3f}  rough {rmean:.3f}  "
                  f"({time.time() - t1:.1f}s)", flush=True)
    if not args.check and not args.no_fx and not only:
        for fname, seed, fn in FX:
            fn(np.random.default_rng(seed))
        print(f"FX sprites written to {FX_DIR}")
    ok = verify_textures(names)
    ts = dir_size(TEX_DIR)
    fs = dir_size(FX_DIR) if os.path.isdir(FX_DIR) else 0
    print(f"\nassets/textures total: {ts / 1e6:.2f} MB ({ts / 2**20:.2f} MiB)")
    print(f"assets/fx total:       {fs / 1e6:.2f} MB")
    print(f"done in {time.time() - t0:.1f}s; seams {'OK' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
