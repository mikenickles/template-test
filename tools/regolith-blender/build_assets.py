# Builds every REGOLITH model in Blender (pip install bpy) and writes the gzip+base64 blob as a JS snippet:
#   python build_assets.py            → assets_b64.js (replace the ASSET_B64 line in public/regolith/index.html with it)
#   PREVIEW=1 python build_assets.py -- rifle   → also renders quick previews of the named models into ./pv
import sys, os, gzip, base64, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import guns
OUT = os.path.dirname(os.path.abspath(__file__))
only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
built = []
def run(fn, pv=None, **fk):
    t = time.time(); reset(); m = fn(); 
    if only and m.name not in only: return
    g = finish(m, **fk); built.append((m, g))
    print(m.name, {k: len(v['pos']) for k, v in g.items()}, 'tris', sum(len(v['idx']) for v in g.values()) // 3, '%.1fs' % (time.time() - t))
    if pv and os.environ.get('PREVIEW'): preview(m.name, OUT + '/pv/' + m.name, **pv)
for fn in guns.GUNS: run(fn, pv=dict(views=[(-1, 0.25, 0.25), (-0.5, 0.5, 0.9)], ortho=1.25, target=(0, 0.03, -0.2)))
import soldier
SV = dict(views=[(0, 0.1, -1), (-0.7, 0.1, -0.7), (-1, 0.1, 0), (-0.7, 0.1, 0.7), (0, 0.1, 1)], ortho=2.0, target=(0, 0.92, 0), res=(520, 800))
for team in ('blue', 'red'):
    run(lambda: soldier.soldier(team), pv=SV, ao_dist=0.14, ao_min=0.42)
    run(lambda: soldier.fparm(team), ao_dist=0.08, ao_min=0.5)
HV = dict(views=[(-1, 0.4, 0.5), (0.6, 0.6, 1)], ortho=0.4, target=(0, 0.02, 0.02), res=(500, 500))
for fn in (soldier.hand_fore, soldier.hand_grip, soldier.hand_cup): run(fn, pv=HV, ao_dist=0.05, ao_min=0.5)
blob = pack(built); gz = gzip.compress(blob, 9)
open(OUT + '/assets.bin', 'wb').write(blob)
if not only:
    open(os.environ.get('REGOLITH_ASSET_OUT', OUT + '/assets_b64.js'), 'w').write('// Baked models from the Blender pipeline (gzip + base64): guns, soldiers, first-person arms\nconst ASSET_B64 = "' + base64.b64encode(gz).decode() + '";\n')
print('raw', len(blob), 'gz', len(gz))
