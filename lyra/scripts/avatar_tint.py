"""Recolors the avatar's lime glow (headphones, logo dot) to another accent."""
import numpy as np
from PIL import Image

# the glow color for each accent: bright enough to still read as light
GLOW = {
    "lime": None,
    "orange": "#ec7434",
    "yellow": "#f5c52c",
    "red": "#f0453c",
    "maroon": "#c4475d",
    "navy": "#4f7bd6",
    "indigo": "#7677f0",
    "teal": "#22b5a2",
}


def _hsv(rgb):
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) / 6
    return np.where(d > 0, h, 0), s, mx


def _rgb(h, s, v):
    i = np.floor(h * 6) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = [np.select([i == k for k in range(6)], c) for c in (
        [v, q, p, p, t, v], [t, v, v, q, p, p], [p, p, t, v, v, q])]
    return np.stack(out, -1)


def tint(img: Image.Image, accent: str) -> Image.Image:
    target = GLOW[accent]
    if not target:
        return img
    a = np.asarray(img.convert("RGBA")).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    h, s, v = _hsv(rgb)
    th, ts, tv = (x.item() for x in _hsv(np.array([int(target[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)))
    # how "lime" a pixel is: yellow-green hue, with some color to it
    hue_w = np.clip(1 - np.abs(h * 360 - 68) / 30, 0, 1)
    sat_w = np.clip((s - 0.1) / 0.18, 0, 1)
    w = (hue_w * sat_w)[..., None]
    new = _rgb(np.full_like(h, th), np.clip(s / 0.75 * ts, 0, 1), np.clip(v * tv / 0.94, 0, 1))
    out = rgb * (1 - w) + new * w
    return Image.fromarray((np.concatenate([out, alpha], -1) * 255).round().astype(np.uint8), "RGBA")
