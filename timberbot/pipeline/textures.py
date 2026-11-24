"""Procedural tileable PBR texture generator for Timberbot.

Outputs, per material, into ../assets/textures:
  <name>_albedo.webp   sRGB base colour
  <name>_normal.webp   tangent-space normal (OpenGL +Y, authored for flipY=false)
  <name>_arh.webp      R = ambient occlusion, G = roughness, B = height

Everything is periodic (wraps seamlessly) so it can tile on terrain / trunks.
Run:  python3 textures.py [name ...]
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'textures')
os.makedirs(OUT, exist_ok=True)
N = 1024


# ----------------------------------------------------------------- noise kit
def grid(n=N):
    lin = (np.arange(n) + 0.5) / n
    return np.meshgrid(lin, lin)  # u (columns), v (rows)


def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin(u, v, fx, fy, seed):
    """Periodic gradient noise evaluated at arbitrary (u, v) in tile units."""
    rng = np.random.default_rng(seed)
    ang = rng.uniform(0, 2 * np.pi, (fy, fx))
    gx, gy = np.cos(ang), np.sin(ang)
    x = u * fx
    y = v * fy
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    xf = x - xi
    yf = y - yi

    def g(ix, iy, dx, dy):
        ix = np.mod(ix, fx)
        iy = np.mod(iy, fy)
        return gx[iy, ix] * dx + gy[iy, ix] * dy

    n00 = g(xi, yi, xf, yf)
    n10 = g(xi + 1, yi, xf - 1, yf)
    n01 = g(xi, yi + 1, xf, yf - 1)
    n11 = g(xi + 1, yi + 1, xf - 1, yf - 1)
    a, b = fade(xf), fade(yf)
    return ((n00 * (1 - a) + n10 * a) * (1 - b) + (n01 * (1 - a) + n11 * a) * b) * 1.5


def fbm(u, v, fx, fy, seed, octaves=5, gain=0.5, ridged=False):
    out = np.zeros_like(u)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = perlin(u, v, fx * 2 ** o, fy * 2 ** o, seed + o * 17)
        if ridged:
            n = 1.0 - np.abs(n) * 2.0
        out += n * amp
        tot += amp
        amp *= gain
    return out / tot


def worley(u, v, cx, cy, seed, jitter=1.0):
    """Periodic cellular noise. Returns F1, F2 (in cell units) and a per-cell random id."""
    rng = np.random.default_rng(seed)
    px = rng.uniform(0, 1, (cy, cx)) * jitter + (1 - jitter) * 0.5
    py = rng.uniform(0, 1, (cy, cx)) * jitter + (1 - jitter) * 0.5
    ids = rng.uniform(0, 1, (cy, cx))
    x = u * cx
    y = v * cy
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    f1 = np.full(u.shape, 9.0)
    f2 = np.full(u.shape, 9.0)
    cid = np.zeros(u.shape)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ix = xi + ox
            iy = yi + oy
            mx = np.mod(ix, cx)
            my = np.mod(iy, cy)
            dx = ix + px[my, mx] - x
            dy = iy + py[my, mx] - y
            d = np.sqrt(dx * dx + dy * dy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, ids[my, mx], cid)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def norm01(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def blur(a, sigma):
    """Periodic gaussian blur through the FFT."""
    n0, n1 = a.shape[:2]
    fy = np.fft.fftfreq(n0)[:, None]
    fx = np.fft.fftfreq(n1)[None, :]
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    if a.ndim == 3:
        return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * k)) for c in range(a.shape[2])], -1)
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def ao_from_height(h, amount=1.6):
    cav = np.zeros_like(h)
    for s, w in ((3, 0.5), (9, 0.35), (24, 0.25)):
        cav += np.clip(blur(h, s) - h, 0, 1) * w
    return np.clip(1.0 - cav * amount * 4.0, 0.25, 1.0)


def ramp(t, stops):
    """Piecewise-linear colour ramp; stops = [(pos, (r,g,b)), ...] in sRGB 0..255."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1) if i == 0 else (t > p0) & (t <= p1)
        f = ((t - p0) / max(p1 - p0, 1e-9))[..., None]
        seg = np.array(c0)[None, None] * (1 - f) + np.array(c1)[None, None] * f
        out = np.where(m[..., None], seg, out)
    return out


def mix(a, b, t):
    if np.ndim(t) == 2 and np.ndim(a) == 3:
        t = t[..., None]
    return a * (1 - t) + b * t


def col(c):
    return np.array(c, dtype=np.float64)[None, None, :]


def save(name, albedo, height, rough, nstrength=6.0, ao_amount=1.6, size=None, quality=90):
    height = norm01(height)
    nrm = normal_from_height(height, nstrength * (N / 1024))
    ao = ao_from_height(height, ao_amount)
    arh = np.stack([ao, np.clip(rough, 0, 1), height], -1)

    def w(arr, suffix):
        im = Image.fromarray(np.clip(arr * (255 if arr.max() <= 1.001 else 1), 0, 255).astype(np.uint8))
        if size and size != im.size[0]:
            im = im.resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}_{suffix}.webp'), quality=quality, method=6)

    w(np.clip(albedo, 0, 255) / 255.0, 'albedo')
    w(nrm, 'normal')
    w(arh, 'arh')
    print('wrote', name)


# ------------------------------------------------------------------ textures
def bark_pine():
    u, v = grid()
    wu = u + 0.03 * perlin(u, v, 4, 3, 1) + 0.008 * perlin(u, v, 16, 8, 4)
    wv = v + 0.05 * perlin(u, v, 3, 4, 2)
    f1, f2, cid = worley(wu, wv, 13, 4, 3)
    edge = f2 - f1
    edge = edge + 0.1 * fbm(u, v, 24, 12, 6, octaves=3)
    plate = smoothstep(0.03, 0.3, edge)
    fiss = fbm(wu, wv, 34, 5, 5, octaves=4, ridged=True)          # fine vertical fissures
    flakes = fbm(wu, wv, 18, 7, 7, octaves=5, ridged=True)
    fine = fbm(u, v, 110, 40, 9, octaves=3)
    layers = np.floor((cid * 3 + flakes * 1.6 + f1 * 1.5) * 2.5) / 7.0   # flaky terraces
    height = plate * (0.45 + 0.3 * cid) + layers * 0.3 * plate + (fiss - 0.5) * 0.3 + flakes * 0.14 + fine * 0.1
    hn = norm01(height)
    tone = norm01(cid * 0.5 + fbm(u, v, 5, 5, 11) * 0.5 + flakes * 0.5 + fine * 0.3)
    base = ramp(tone, [(0, (74, 52, 40)), (0.35, (104, 78, 60)), (0.65, (126, 104, 88)), (1, (150, 134, 120))])
    base = mix(base, col((142, 92, 62)), smoothstep(0.35, 0.1, edge)[..., None] * 0.55)     # reddish inner bark
    base = mix(col((30, 20, 15)), base, smoothstep(-0.02, 0.2, edge))
    base *= (0.62 + 0.62 * hn[..., None])
    base = mix(base, col((180, 160, 140)), smoothstep(0.6, 0.95, flakes)[..., None] * 0.3 * plate[..., None])
    lichen = smoothstep(0.3, 0.5, fbm(u, v, 7, 7, 23, octaves=5)) * plate * smoothstep(0.0, 0.3, fbm(u, v, 50, 50, 24, 2) + 0.15)
    base = mix(base, col((132, 146, 110)), lichen * 0.5)
    rough = 0.94 - 0.12 * plate + 0.06 * lichen
    save('bark_pine', base, height, rough, nstrength=13)


def bark_oak():
    u, v = grid()
    wu = u + 0.04 * perlin(u, v, 3, 3, 31) + 0.012 * perlin(u, v, 14, 9, 32)
    wv = v + 0.04 * perlin(u, v, 4, 3, 33)
    r1 = np.clip(1.0 - np.abs(perlin(wu, wv, 16, 2, 34)) * 2.2, 0, 1)
    r2 = np.clip(1.0 - np.abs(perlin(wu, wv, 31, 5, 35)) * 2.2, 0, 1)
    r3 = fbm(wu, wv, 60, 12, 41, octaves=3, ridged=True)
    cross = smoothstep(0.25, 0.55, np.abs(perlin(wu, wv, 5, 13, 36)) * 2.0 + 0.2 * perlin(u, v, 20, 20, 42))
    fine = fbm(u, v, 120, 60, 37, octaves=3)
    height = (r1 ** 1.3 * 0.6 + r2 * 0.3 + r3 * 0.22) * (0.45 + 0.55 * cross) + fine * 0.09
    hn = norm01(height)
    tone = norm01(fbm(u, v, 6, 6, 38) + r3 * 0.6 + fine * 0.4)
    base = ramp(hn, [(0, (22, 18, 15)), (0.25, (52, 44, 37)), (0.6, (100, 90, 78)), (1, (146, 138, 124))])
    base *= (0.8 + 0.4 * tone[..., None])
    base = mix(base, col((112, 86, 62)), smoothstep(0.5, 0.2, hn)[..., None] * 0.25)
    moss = smoothstep(0.15, 0.55, fbm(u, v, 4, 4, 39, octaves=5) + 0.3 * (1 - hn) - 0.05) * smoothstep(-0.2, 0.3, fbm(u, v, 40, 40, 43, 3))
    base = mix(base, ramp(norm01(fbm(u, v, 30, 30, 40)), [(0, (44, 62, 26)), (1, (104, 124, 50))]), moss * 0.62)
    rough = 0.95 - 0.1 * hn + 0.05 * moss
    save('bark_oak', base, height + moss * 0.05, rough, nstrength=14)


def bark_birch():
    u, v = grid()
    wv = v + 0.01 * perlin(u, v, 6, 20, 51)
    lent = fbm(u, wv, 5, 70, 52, octaves=2)
    dashes = smoothstep(0.33, 0.5, lent) * smoothstep(0.0, 0.2, fbm(u, v, 9, 9, 53) + 0.12)
    f1, f2, cid = worley(u + 0.05 * perlin(u, v, 3, 3, 54), v, 3, 4, 55)
    scar = smoothstep(0.34, 0.1, f1 * (0.7 + cid)) * (cid > 0.45)
    scar *= smoothstep(-0.2, 0.3, fbm(u, v, 12, 24, 56))
    peel = fbm(u, v, 3, 28, 57, octaves=4)
    tone = norm01(peel + fbm(u, v, 8, 8, 58) * 0.6)
    base = ramp(tone, [(0, (188, 180, 164)), (0.5, (220, 214, 200)), (1, (238, 234, 224))])
    base = mix(base, col((205, 178, 150)), smoothstep(0.6, 0.9, norm01(fbm(u, v, 5, 14, 59)))[..., None] * 0.5)
    base = mix(base, col((42, 36, 32)), np.clip(dashes * 0.85 + scar, 0, 1))
    stain = smoothstep(0.2, 0.6, fbm(u, v, 3, 3, 60))
    base = mix(base, col((150, 156, 120)), stain * 0.18)
    height = 0.6 + peel * 0.12 - dashes * 0.25 - scar * 0.4 + fbm(u, v, 40, 90, 61, octaves=2) * 0.04 + scar * fbm(u, v, 30, 30, 62) * 0.3
    rough = 0.62 + 0.3 * np.clip(dashes + scar, 0, 1) + 0.08 * tone
    save('bark_birch', base, height, rough, nstrength=5)


def _strokes(size, seed, layers, base_rgb_fn, ss=2):
    """Painter's-algorithm stroke renderer (wrapping). Returns albedo(float 0..255), height(0..1)."""
    S = size * ss
    rng = np.random.default_rng(seed)
    alb = Image.fromarray(base_rgb_fn(S).astype(np.uint8)).convert('RGB')
    hgt = Image.new('L', (S, S), 0)
    da, dh = ImageDraw.Draw(alb), ImageDraw.Draw(hgt)
    total = sum(l['count'] for l in layers)
    k = 0
    for L in layers:
        pal = np.array(L['palette'], dtype=np.float64)
        for i in range(L['count']):
            k += 1
            x, y = rng.uniform(0, S, 2)
            ang = rng.uniform(0, 2 * np.pi) if L.get('angle') is None else rng.normal(L['angle'], L.get('spread', 0.5))
            ln = rng.uniform(*L['length']) * ss
            wd = max(1, int(round(rng.uniform(*L['width']) * ss)))
            c = pal[rng.integers(len(pal))] * rng.uniform(0.8, 1.15)
            c = c * (0.72 + 0.4 * k / total) if L.get('shade', True) else c
            cc = tuple(int(q) for q in np.clip(c, 0, 255))
            hv = int(np.clip(L.get('h0', 0.2) * 255 + (L.get('h1', 1.0) - L.get('h0', 0.2)) * 255 * (k / total) * rng.uniform(0.7, 1.0), 0, 255))
            if L.get('shape') == 'ellipse':
                rx, ry = ln * 0.5, ln * 0.5 * rng.uniform(0.45, 0.8)
                pts = [(np.cos(t) * rx, np.sin(t) * ry) for t in np.linspace(0, 2 * np.pi, 14, endpoint=False)]
                ca, sa = np.cos(ang), np.sin(ang)
                pts = [(px * ca - py * sa, px * sa + py * ca) for px, py in pts]
                for ox in (-S, 0, S):
                    for oy in (-S, 0, S):
                        if not (-ln < x + ox < S + ln and -ln < y + oy < S + ln):
                            continue
                        poly = [(x + ox + px, y + oy + py) for px, py in pts]
                        da.polygon(poly, fill=cc)
                        dh.polygon(poly, fill=hv)
                        if L.get('vein'):
                            da.line([(x + ox - ca * rx, y + oy - sa * rx), (x + ox + ca * rx, y + oy + sa * rx)],
                                    fill=tuple(int(q * 0.75) for q in cc), width=ss)
            else:
                bend = rng.normal(0, L.get('bend', 0.25))
                mx, my = x + np.cos(ang) * ln * 0.5, y + np.sin(ang) * ln * 0.5
                ex, ey = mx + np.cos(ang + bend) * ln * 0.5, my + np.sin(ang + bend) * ln * 0.5
                for ox in (-S, 0, S):
                    for oy in (-S, 0, S):
                        if not (-ln < x + ox < S + ln and -ln < y + oy < S + ln):
                            continue
                        pts = [(x + ox, y + oy), (mx + ox, my + oy), (ex + ox, ey + oy)]
                        da.line(pts, fill=cc, width=wd)
                        dh.line(pts, fill=hv, width=wd)
    alb = alb.resize((size, size), Image.LANCZOS)
    hgt = hgt.resize((size, size), Image.LANCZOS)
    return np.asarray(alb, dtype=np.float64), np.asarray(hgt, dtype=np.float64) / 255.0


def ground_grass():
    def base(S):
        u, v = grid(S)
        t = norm01(fbm(u, v, 6, 6, 71, octaves=5))
        return ramp(t, [(0, (30, 38, 16)), (0.5, (44, 56, 22)), (1, (60, 66, 30))])
    green = [(58, 92, 28), (74, 112, 36), (88, 124, 42), (66, 100, 30), (100, 132, 50), (52, 84, 30), (112, 138, 58)]
    layers = [
        dict(count=26000, palette=[(40, 66, 22), (48, 76, 26), (56, 84, 28)], length=(14, 34), width=(1.2, 2.2), h0=0.1, h1=0.5),
        dict(count=1400, palette=[(70, 104, 40), (60, 96, 34)], length=(7, 12), width=(1, 1), shape='ellipse', h0=0.3, h1=0.6, vein=True),
        dict(count=34000, palette=green, length=(18, 46), width=(1.0, 2.0), h0=0.35, h1=0.9),
        dict(count=2600, palette=[(150, 142, 80), (168, 150, 92), (132, 130, 66)], length=(20, 50), width=(1, 1.4), h0=0.5, h1=0.9),
        dict(count=12000, palette=[(104, 140, 52), (120, 150, 62), (92, 130, 44)], length=(16, 40), width=(1, 1.5), h0=0.7, h1=1.0),
    ]
    alb, hgt = _strokes(N, 70, layers, base)
    u, v = grid()
    macro = fbm(u, v, 3, 3, 72, octaves=3)
    alb *= (0.93 + 0.2 * macro)[..., None]
    alb = mix(alb, alb * col((1.12, 1.04, 0.72)), smoothstep(0.1, 0.6, fbm(u, v, 4, 4, 73)) * 0.5)
    hb = blur(hgt, 1.2)
    alb *= (0.62 + 0.5 * norm01(hb))[..., None]
    save('ground_grass', alb, hb, 0.9 - 0.14 * hb, nstrength=7, ao_amount=1.0)


def ground_forest():
    def base(S):
        u, v = grid(S)
        t = norm01(fbm(u, v, 5, 5, 81, octaves=6))
        c = ramp(t, [(0, (44, 33, 24)), (0.45, (68, 52, 38)), (0.8, (88, 70, 50)), (1, (104, 86, 62))])
        return c * (0.9 + 0.2 * fbm(u, v, 60, 60, 82, octaves=2)[..., None])
    layers = [
        dict(count=220, palette=[(108, 104, 98), (128, 122, 112), (92, 88, 82)], length=(8, 22), width=(1, 1), shape='ellipse', h0=0.3, h1=0.6),
        dict(count=26000, palette=[(128, 84, 46), (150, 104, 58), (108, 72, 42), (168, 126, 76), (90, 62, 38)], length=(12, 30), width=(0.8, 1.3), h0=0.2, h1=0.7, bend=0.1),
        dict(count=520, palette=[(120, 82, 40), (146, 98, 44), (98, 70, 36), (160, 122, 54), (84, 60, 34)], length=(18, 34), width=(1, 1), shape='ellipse', h0=0.4, h1=0.8, vein=True),
        dict(count=260, palette=[(58, 42, 30), (74, 56, 40), (46, 34, 26)], length=(40, 130), width=(2.0, 4.5), h0=0.6, h1=1.0, bend=0.3),
        dict(count=9000, palette=[(140, 98, 54), (166, 122, 70), (118, 80, 46)], length=(12, 28), width=(0.8, 1.2), h0=0.5, h1=0.95, bend=0.1),
        dict(count=3500, palette=[(62, 90, 32), (78, 106, 40), (52, 78, 28)], length=(8, 20), width=(1, 1.6), h0=0.5, h1=0.9),
    ]
    alb, hgt = _strokes(N, 80, layers, base)
    u, v = grid()
    moss = smoothstep(0.25, 0.6, fbm(u, v, 4, 4, 83, octaves=5))
    alb = mix(alb, alb * col((0.72, 1.0, 0.55)) + col((6, 16, 0)), moss * 0.45)
    hb = blur(hgt, 1.0)
    alb *= (0.66 + 0.46 * norm01(hb))[..., None]
    save('ground_forest', alb, hb + 0.2 * fbm(u, v, 8, 8, 84), 0.93 - 0.1 * hb, nstrength=7, ao_amount=1.2)


def rock_cliff():
    """Stratified, jointed cliff rock (no cellular pattern, so it never reads as paving)."""
    u, v = grid()
    rng = np.random.default_rng(90)
    warp = 0.055 * perlin(u, v, 2, 2, 91) + 0.02 * perlin(u, v, 5, 4, 92) + 0.006 * perlin(u, v, 17, 13, 93)
    L = 12                                             # strata per tile (periodic)
    sv = (v + warp) * L + 1.6 * perlin(u * 0.0 + 0.5, v, 1, 4, 88) + 0.5 * perlin(u, v, 2, 7, 89)   # uneven bed thickness
    layer = np.floor(sv).astype(np.int64) % L
    fl = sv - np.floor(sv)
    tone_l = rng.uniform(0, 1, L)[layer]
    recess = rng.uniform(0, 1, L)[layer]
    bed = smoothstep(0.0, 0.09, fl) * (1.0 - smoothstep(0.88, 1.0, fl))  # bedding planes between strata
    bed = 1.0 - (1.0 - bed) * smoothstep(-0.35, 0.3, perlin(u, v, 5, 3, 87) + 0.3 * tone_l)   # ...which fade in and out
    # vertical joints, offset per layer, only present in part of each layer
    cells = rng.integers(3, 7, L)[layer]
    off = rng.uniform(0, 1, L)[layer]
    ju = (u + 0.02 * perlin(u, v, 9, 9, 94)) * cells + off
    fj = np.abs(ju - np.round(ju))
    joint = 1.0 - (1.0 - smoothstep(0.0, 0.03, fj)) * smoothstep(0.15, 0.4, perlin(u, v, 4, 7, 96))    # sparse joints
    big = fbm(u, v, 3, 3, 97, octaves=5)
    rough_n = fbm(u, v, 14, 14, 98, octaves=6)
    pits = fbm(u, v, 40, 40, 99, octaves=3, ridged=True)
    fine = fbm(u, v, 150, 150, 86, octaves=2)
    relief = 0.45 + 0.3 * recess + 0.25 * big
    height = relief * (0.4 + 0.6 * bed) * (0.6 + 0.4 * joint) + rough_n * 0.34 + (pits - 0.5) * 0.16 + fine * 0.04
    hn = norm01(height)
    tone = norm01(tone_l * 0.55 + big * 0.7 + rough_n * 0.55)
    base = ramp(tone, [(0, (86, 80, 74)), (0.3, (112, 104, 96)), (0.55, (134, 124, 110)), (0.8, (148, 140, 130)), (1, (172, 164, 152))])
    base = mix(base, base * col((1.1, 0.98, 0.84)), (tone_l > 0.62)[..., None] * 0.55)          # warm iron-stained beds
    base *= (0.62 + 0.55 * hn[..., None])
    base = mix(col((44, 39, 35)), base, (0.25 + 0.75 * bed * (0.4 + 0.6 * joint))[..., None])
    base *= (0.9 + 0.26 * fine[..., None])
    streak = smoothstep(0.1, 0.5, fbm(u, v, 9, 2, 100, octaves=4))                               # rain streaks
    base = mix(base, base * col((0.72, 0.7, 0.68)), streak * 0.5)
    lichen = smoothstep(0.3, 0.42, fbm(u, v, 9, 9, 101, octaves=4)) * smoothstep(0.1, 0.4, fbm(u, v, 40, 40, 102))
    base = mix(base, col((172, 168, 118)), lichen * 0.45)
    moss = smoothstep(0.32, 0.62, fbm(u, v, 3, 5, 103, octaves=5) + 0.35 * (1 - bed)) * smoothstep(-0.1, 0.3, fbm(u, v, 30, 30, 85, 3))
    base = mix(base, ramp(norm01(fbm(u, v, 40, 40, 84)), [(0, (46, 64, 28)), (1, (92, 110, 46))]), moss * 0.6)
    rough = 0.9 - 0.12 * hn + 0.07 * moss
    save('rock_cliff', base, height + moss * 0.04, rough, nstrength=13)


def _blocks(u, v, rows, wmin, wmax, seed, wobble=0.006):
    """Random-width running-bond blocks, periodic. Returns edge distance (tile units), id, local uv."""
    rng = np.random.default_rng(seed)
    wu = u + wobble * perlin(u, v, 9, 9, seed + 1)
    wv = v + wobble * perlin(u, v, 9, 9, seed + 2)
    row = np.floor(wv * rows).astype(np.int64) % rows
    fy = wv * rows - np.floor(wv * rows)
    edge = np.zeros_like(u)
    bid = np.zeros_like(u)
    lu = np.zeros_like(u)
    for r in range(rows):
        widths = []
        while sum(widths) < 1.0:
            widths.append(rng.uniform(wmin, wmax))
        widths = np.array(widths)
        widths /= widths.sum()
        starts = np.concatenate([[0], np.cumsum(widths)])
        off = rng.uniform(0, 1)
        x = np.mod(wu + off, 1.0)
        idx = np.clip(np.searchsorted(starts, x, side='right') - 1, 0, len(widths) - 1)
        w = widths[idx]
        fx = (x - starts[idx]) / w
        dx = np.minimum(fx, 1 - fx) * w
        dy = np.minimum(fy, 1 - fy) / rows
        m = row == r
        edge = np.where(m, np.minimum(dx, dy), edge)
        ids = rng.uniform(0, 1, len(widths))
        bid = np.where(m, ids[idx], bid)
        lu = np.where(m, fx, lu)
    return edge, bid, lu, fy


def stone_masonry():
    u, v = grid()
    edge, bid, lu, lv = _blocks(u, v, 6, 0.14, 0.3, 111)
    mortar = smoothstep(0.004, 0.011, edge)
    bevel = smoothstep(0.004, 0.035, edge)
    surf = fbm(u, v, 14, 14, 112, octaves=6)
    chips = smoothstep(0.35, 0.6, fbm(u, v, 22, 22, 113, octaves=3)) * (1 - smoothstep(0.01, 0.05, edge))
    height = mortar * (0.45 + 0.25 * bid + 0.3 * bevel) + surf * 0.14 * mortar - chips * 0.25 + (1 - mortar) * 0.12 * fbm(u, v, 60, 60, 114, 2)
    tone = norm01(bid + surf * 0.5)
    base = ramp(tone, [(0, (96, 92, 86)), (0.3, (122, 116, 106)), (0.55, (142, 132, 116)), (0.8, (150, 146, 138)), (1, (172, 164, 150))])
    hue = (bid * 7.31) % 1.0
    base = mix(base, base * col((1.08, 0.98, 0.86)), (hue > 0.6) * 0.6)
    base *= (0.88 + 0.24 * fbm(u, v, 70, 70, 115, octaves=2)[..., None])
    base = mix(col((92, 84, 72)) * (0.85 + 0.3 * fbm(u, v, 50, 50, 116, 2)[..., None]), base, mortar)
    grime = smoothstep(0.02, 0.0, edge - 0.012) * 0.5 + smoothstep(0.2, 0.6, fbm(u, v, 3, 5, 117, 5)) * 0.35
    base = mix(base, col((58, 54, 46)), np.clip(grime, 0, 1) * 0.55)
    moss = smoothstep(0.42, 0.62, fbm(u, v, 5, 5, 118, octaves=5) + 0.25 * (1 - bevel))
    base = mix(base, ramp(norm01(fbm(u, v, 40, 40, 119)), [(0, (52, 70, 30)), (1, (98, 116, 48))]), moss * 0.7)
    lichen = smoothstep(0.36, 0.44, fbm(u, v, 11, 11, 120, octaves=3)) * mortar
    base = mix(base, col((176, 170, 128)), lichen * 0.4)
    rough = 0.82 + 0.12 * (1 - mortar) + 0.06 * moss - 0.08 * bid * mortar
    save('stone_masonry', base, height + moss * 0.05, rough, nstrength=10)


def roof_shingles():
    u, v = grid()
    edge, bid, lu, lv = _blocks(u, v, 5, 0.09, 0.2, 131, wobble=0.003)
    gap = smoothstep(0.002, 0.008, np.where(lu < 0.5, lu, 1 - lu) * 0.14)
    slope = 1.0 - lv            # each row is thick at its lower edge (v grows downward) => invert
    slope = lv
    grain = fbm(u * 1.0, v, 70, 3, 132, octaves=3)
    height = (0.25 + 0.6 * slope + 0.12 * bid) * gap + grain * 0.07
    lip = smoothstep(0.9, 1.0, lv)
    tone = norm01(bid * 0.8 + grain * 0.5 + fbm(u, v, 5, 5, 133) * 0.5)
    base = ramp(tone, [(0, (70, 58, 46)), (0.4, (98, 84, 68)), (0.75, (122, 110, 94)), (1, (142, 134, 120))])
    base *= (0.8 + 0.25 * slope)[..., None]
    base = mix(col((30, 25, 20)), base, gap)
    base = mix(base, col((40, 34, 28)), (smoothstep(0.0, 0.08, lv) < 0.5)[..., None] * 0.6)
    moss = smoothstep(0.38, 0.6, fbm(u, v, 5, 6, 134, octaves=5) + 0.25 * (1 - slope))
    base = mix(base, ramp(norm01(fbm(u, v, 40, 40, 135)), [(0, (50, 68, 28)), (1, (100, 118, 46))]), moss * 0.75)
    rough = 0.86 + 0.08 * moss
    save('roof_shingles', base, height + moss * 0.06 + lip * 0.0, rough, nstrength=10)


def wood_cut():
    u, v = grid()
    wu = u + 0.02 * perlin(u, v, 3, 2, 141)
    streak = fbm(wu, v, 50, 2, 142, octaves=4)
    rings = 0.5 + 0.5 * np.sin((wu * 26 + perlin(u, v, 3, 2, 143) * 2.2) * 2 * np.pi)
    facets = np.floor(perlin(u, v, 2, 5, 144) * 3.0) / 3.0
    tone = norm01(streak * 0.7 + rings * 0.5 + fbm(u, v, 6, 6, 145) * 0.4)
    base = ramp(tone, [(0, (150, 108, 62)), (0.4, (184, 142, 90)), (0.75, (208, 172, 118)), (1, (224, 194, 144))])
    f1, f2, cid = worley(u, v, 3, 3, 146)
    knot = smoothstep(0.12, 0.03, f1) * (cid > 0.6)
    base = mix(base, col((92, 60, 34)), knot * 0.8)
    crack = smoothstep(0.72, 0.8, norm01(fbm(wu, v, 30, 1, 147, octaves=3)))
    base = mix(base, col((70, 46, 26)), crack * 0.6)
    height = 0.5 + streak * 0.12 + facets * 0.15 - crack * 0.3 - knot * 0.1
    rough = 0.72 + 0.12 * (1 - tone)
    save('wood_cut', base, height, rough, nstrength=5)


def wood_beam():
    u, v = grid()
    wu = u + 0.025 * perlin(u, v, 2, 2, 151) + 0.006 * perlin(u, v, 12, 3, 152)
    streak = fbm(wu, v, 44, 2, 153, octaves=5)
    fine = fbm(wu, v, 160, 4, 154, octaves=2)
    crack = smoothstep(0.66, 0.78, norm01(fbm(wu, v, 26, 1, 155, octaves=3) + 0.3 * perlin(u, v, 2, 5, 156)))
    tone = norm01(streak + 0.4 * fbm(u, v, 4, 4, 157))
    base = ramp(tone, [(0, (60, 44, 32)), (0.35, (92, 70, 50)), (0.7, (120, 96, 72)), (1, (146, 124, 100))])
    grey = smoothstep(0.3, 0.7, fbm(u, v, 3, 5, 158, octaves=4))
    base = mix(base, base.mean(-1, keepdims=True) * col((1.02, 1.0, 0.96)), grey * 0.6)
    base = mix(base, col((30, 22, 16)), crack * 0.85)
    f1, f2, cid = worley(u, v, 3, 2, 159)
    knot = smoothstep(0.1, 0.02, f1) * (cid > 0.5)
    base = mix(base, col((40, 28, 20)), knot * 0.85)
    height = 0.5 + streak * 0.22 + fine * 0.07 - crack * 0.45 - knot * 0.15
    rough = 0.8 + 0.12 * crack + 0.06 * grey
    save('wood_beam', base, height, rough, nstrength=8)


def charcoal():
    u, v = grid(512)
    wu = u + 0.04 * perlin(u, v, 3, 3, 161)
    f1, f2, cid = worley(wu, v, 7, 5, 162)
    crack = smoothstep(0.0, 0.12, f2 - f1)
    n = fbm(u, v, 20, 20, 163, octaves=4)
    height = crack * (0.6 + 0.4 * cid) + n * 0.1
    ash = smoothstep(0.1, 0.5, fbm(u, v, 5, 5, 164) + 0.4 * cid - 0.2)
    base = mix(col((22, 20, 19)), col((120, 114, 108)), (ash * crack * 0.6)[..., None])
    base = mix(col((10, 8, 8)), base, crack)
    base *= (0.85 + 0.3 * n[..., None])
    rough = 0.9 - 0.25 * crack * (1 - ash)
    global N
    old, N = N, 512
    save('charcoal', base, height, rough, nstrength=8)
    N = old
    glow = (1 - smoothstep(0.0, 0.16, f2 - f1)) * (0.5 + 0.5 * norm01(fbm(u, v, 4, 4, 165)))
    em = ramp(glow, [(0, (0, 0, 0)), (0.35, (120, 14, 0)), (0.7, (255, 96, 8)), (1, (255, 214, 120))])
    Image.fromarray(em.astype(np.uint8)).save(os.path.join(OUT, 'charcoal_emissive.webp'), quality=90)


def sprites():
    """Soft smoke puff + round particle + ember sprites (RGBA)."""
    n = 256
    u, v = grid(n)
    r = np.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2
    puff = fbm(u, v, 4, 4, 171, octaves=5) * 0.5 + 0.5
    a = np.clip((1 - r) * 1.5, 0, 1) ** 1.5 * np.clip(puff * 1.6 - 0.25, 0, 1)
    shade = 0.75 + 0.25 * norm01(fbm(u, v, 3, 3, 172))
    rgba = np.stack([shade, shade, shade, a], -1)
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'smoke.webp'), quality=92)
    dot = np.clip(1 - r, 0, 1) ** 2.2
    rgba = np.stack([np.ones_like(dot)] * 3 + [dot], -1)
    Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'dot.webp'), quality=92)
    print('wrote sprites')


ALL = dict(bark_pine=bark_pine, bark_oak=bark_oak, bark_birch=bark_birch, ground_grass=ground_grass,
           ground_forest=ground_forest, rock_cliff=rock_cliff, stone_masonry=stone_masonry,
           roof_shingles=roof_shingles, wood_cut=wood_cut, wood_beam=wood_beam, charcoal=charcoal, sprites=sprites)

if __name__ == '__main__':
    names = sys.argv[1:] or list(ALL)
    for nm in names:
        ALL[nm]()
