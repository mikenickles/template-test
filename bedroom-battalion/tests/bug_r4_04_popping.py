# Round 4: find popping in frame sequences saved by bug_r4_04_popping.cjs. For each pair of consecutive frames in a
# sequence, try horizontal shifts of -8..8 px and keep the best; count pixels still differing by more than 70 (sum of
# RGB channels / 3). A pop is a frame whose count is far above its neighbours. Usage: python3 bug_r4_04_popping.py <dir>
import sys, os, json
from PIL import Image, ImageChops
d = sys.argv[1]; idx = json.load(open(os.path.join(d, 'index.json')))
seqs = {}
for f in idx: seqs.setdefault(f.rsplit('_', 1)[0], []).append(f)
def load(f): return Image.open(os.path.join(d, f)).convert('L')
def count(a, b):
    best = None
    for s in range(-8, 9):
        w = a.width
        x0, x1 = max(0, s), min(w, w + s)
        ca = a.crop((x0, 0, x1, a.height)); cb = b.crop((x0 - s, 0, x1 - s, b.height))
        diff = ImageChops.difference(ca, cb).point(lambda v: 255 if v > 70 else 0)
        n = sum(1 for v in diff.getdata() if v)
        if best is None or n < best[0]: best = (n, s)
    return best
report = []
for name, fs in seqs.items():
    turn = not name.startswith('train')
    vals = []
    prev = load(fs[0])
    for f in fs[1:]:
        cur = load(f); n, s = count(prev, cur) if turn else (sum(1 for v in ImageChops.difference(prev, cur).point(lambda v: 255 if v > 70 else 0).getdata() if v), 0)
        vals.append((n, s, f)); prev = cur
    ns = sorted(v[0] for v in vals); med = ns[len(ns) // 2]
    spikes = [v for i, v in enumerate(vals) if v[0] > max(400, 6 * med) and v[0] > 3 * max(vals[i - 1][0] if i else 0, vals[i + 1][0] if i + 1 < len(vals) else 0)]
    report.append((name, med, max(ns), spikes[:8]))
    print(f'{name:28s} frames {len(fs):4d} median changed px {med:5d} max {max(ns):6d} spikes {len(spikes)} {[(v[2], v[0]) for v in spikes[:6]]}')
