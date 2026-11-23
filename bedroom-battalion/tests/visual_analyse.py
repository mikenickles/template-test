# Offline image analysis for the visual tester (run: python3 visual_analyse.py <mode>).
#   jitter  : compares visual_jitterA_*/visual_jitterB_* pairs (camera moved 0.006 units). Geometry edges move by
#             under a pixel, so real z-fighting or flicker shows up as BLOBS of strongly changed pixels.
#   sample  : projects known world points into the named-view screenshots and reads the pixel colour there.
import sys, os, glob, math, json
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'screenshots', 'round1')
VIEWS = {
    'spawn_green': ((60, 1.6, 20), (60, 1.6, 80)), 'spawn_tan': ((60, 1.6, 140), (60, 1.6, 80)),
    'bed_top': ((27, 19.6, 80), (100, 10, 80)), 'desk_top': ((97.5, 27.6, 80), (20, 8, 80)),
    'shelf_top': ((110.5, 61.6, 136), (30, 0, 50)), 'floor_centre': ((60, 1.6, 66), (60, 3, 110)),
    'under_bed': ((28, 1.6, 80), (28, 2, 50)), 'east_lane': ((83.2, 1.6, 40), (90, 12, 80)),
    'west_lane': ((40, 1.6, 30), (30, 10, 70)),
}

def load(name):
    return np.asarray(Image.open(os.path.join(D, name)).convert('RGB')).astype(np.int32)

def blobs(mask):
    """connected components (4-neighbour) sizes and boxes, largest first"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        stack = [(y0, x0)]; seen[y0, x0] = True
        n = 0; bx0 = bx1 = x0; by0 = by1 = y0
        while stack:
            y, x = stack.pop(); n += 1
            bx0 = min(bx0, x); bx1 = max(bx1, x); by0 = min(by0, y); by1 = max(by1, y)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; stack.append((yy, xx))
        out.append((n, bx0, by0, bx1, by1))
    out.sort(reverse=True)
    return out

def jitter():
    for a in sorted(glob.glob(os.path.join(D, 'visual_jitterA_*.png'))) + [os.path.join(D, 'visual_close_%s.png' % n) for n in ('overview_ne', 'overview_sw', 'wall_east_far')]:
        base = os.path.basename(a)
        name = base.replace('visual_jitterA_', '').replace('visual_close_', '').replace('.png', '')
        A = load(base); B = load('visual_jitterB_%s.png' % name)
        d = np.abs(A - B).max(axis=2)
        strong = d > 48
        bl = blobs(strong)
        # a blob is "thick" if its area is large relative to an edge line: min(box side) >= 4 px and fill > 35 %
        thick = [b for b in bl if min(b[3] - b[1] + 1, b[4] - b[2] + 1) >= 4 and b[0] / ((b[3] - b[1] + 1) * (b[4] - b[2] + 1)) > 0.35]
        print('%-14s changed>48: %6d px (%.3f %%)  blobs %4d  largest %s  thick blobs %s' % (name, strong.sum(), 100 * strong.mean(), len(bl), bl[:2], thick[:5]))
        img = np.clip(d * 4, 0, 255).astype(np.uint8)
        Image.fromarray(img).save(os.path.join(D, 'visual_jitterdiff_%s.png' % name))

def camera(eye, target, w, h, fov=75.0):
    e = np.array(eye, float); f = np.array(target, float) - e; f /= np.linalg.norm(f)
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r); u = np.cross(r, f)
    t = math.tan(math.radians(fov) / 2)
    def proj(p):
        v = np.array(p, float) - e
        z = v.dot(f)
        if z <= 0.05: return None
        x = v.dot(r) / (z * t * w / h); y = v.dot(u) / (z * t)
        return (int(round((x + 1) / 2 * w)), int(round((1 - y) / 2 * h)), z)
    return proj

def srgb2lin(c): c = np.asarray(c, float) / 255; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(np.asarray(c, float), 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255
def lab(rgb):
    l = srgb2lin(rgb)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = M.dot(l) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
def dE(a, b): return float(np.linalg.norm(lab(a) - lab(b)))
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def tohex(c): return '#%02X%02X%02X' % tuple(int(round(v)) for v in c)
def hsv(c):
    import colorsys
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(c, float) / 255)); return (round(h * 360), round(s * 100), round(v * 100))

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'jitter'
    if mode == 'jitter': jitter()
