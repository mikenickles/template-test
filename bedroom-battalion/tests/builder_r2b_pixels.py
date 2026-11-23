# Pixel analysis for builder_r2b_item5.cjs screenshots: CIE76 dE in Lab (sRGB, D65).
import json, math, os, statistics as st, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); SH = os.path.join(HERE, '..', 'screenshots', 'round2')
def lab(c):
    def lin(v): v /= 255; return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in c[:3])
    X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047; Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return (116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z)))
def dE(a, b): A, B = lab(a), lab(b); return math.dist(A, B)
def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
R = json.load(open(os.path.join(HERE, 'builder_r2b_item5.json')))
PXU = 2 * math.tan(math.radians(37.5)) / 720
print('== team body vs background (median dE over views; worst side per view)')
for build in ('now', 'old'):
    if build not in R['team']: continue
    cells = {}
    for v in R['team'][build]['rows']:
        im = Image.open(os.path.join(SH, v['file'])).convert('RGB'); px = im.load()
        body = px[640, 360]
        hw = int(0.5 / (v['dist'] * PXU)) + 3
        sides = [px[640 - hw, 360], px[640 + hw, 360]]
        d = min(dE(body, s) for s in sides)
        cells.setdefault((v['team'], v['d']), []).append((d, body, sides))
    for (team, d), L in sorted(cells.items()):
        ds = [x[0] for x in L]
        print(f"  {build:3} {team:5} {d:3}u  views {len(L)}  median {st.median(ds):5.1f}  min {min(ds):5.1f}  body e.g. #{''.join('%02X' % c for c in L[0][1])}")
        if '-v' in sys.argv:
            for x in L: print('     view', round(x[0], 1), 'body', x[1], 'sides', x[2])
print('== impacts: particle pixels (changed between before and after) against the surface')
OLD = {'wood': '#8A5A32', 'fabric': '#EFEAE0'}
for m in R['impacts']:
    if m['surface'] not in OLD: print(f"  {m['name']:16} hit {m['hit']} ({m['surface']}), not a wood or fabric surface: skipped"); continue
    a = Image.open(os.path.join(SH, m['before'])).convert('RGB').load(); b = Image.open(os.path.join(SH, m['file'])).convert('RGB').load()
    ch = [(b[x, y], a[x, y]) for x in range(200) for y in range(200) if dE(a[x, y], b[x, y]) > 6]
    surf = tuple(st.median([a[x, y][i] for x in range(80, 120) for y in range(80, 120)]) for i in range(3))
    if not ch: print(f"  {m['name']:16} hit {m['hit']:18} no changed pixels"); continue
    part = tuple(st.median([c[0][i] for c in ch]) for i in range(3))
    print(f"  {m['name']:16} hit {m['hit']:18} changed px {len(ch):4}  particle #{''.join('%02X' % int(c) for c in part)}  surface #{''.join('%02X' % int(c) for c in surf)}  dE now {dE(part, surf):5.1f}  old colour {OLD[m['surface']]} dE {dE(hexc(OLD[m['surface']]), surf):5.1f}")
