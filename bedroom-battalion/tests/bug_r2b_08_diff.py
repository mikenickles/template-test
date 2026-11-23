# Compare first-frame PNGs with the same views 3 s later (and after effects): changed-pixel count and bounding box.
# Usage: python3 bug_r2b_08_diff.py <folder>
import sys, os
from PIL import Image, ImageChops
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if not f.startswith('first_'): continue
    a = Image.open(os.path.join(d, f)).convert('RGB')
    for tag in ('later', 'aftereffects'):
        g = os.path.join(d, f.replace('first_', tag + '_'))
        if not os.path.exists(g): continue
        diff = ImageChops.difference(a, Image.open(g).convert('RGB')).convert('L').point(lambda v: 255 if v > 24 else 0)
        n = sum(1 for v in diff.getdata() if v)
        print(f'{f[6:-4]:22s} vs {tag:12s}: {n:6d} px differ (>24/255){"  bbox " + str(diff.getbbox()) if n else ""}')
