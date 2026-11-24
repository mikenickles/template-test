"""Procedurally model the vegetation set in Blender and export GLB:
conifers, broadleaf trees, birch, bush, fern, fallen log.

Vertex colour convention (read by the game's foliage shader):
  R = baked ambient occlusion (canopy interior / trunk base darkening)
  G = wind flex weight
  B = per-branch random phase
"""
import json
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

from bl_common import MODELS, TEX, TMP, MeshBuilder, export_glb, get_mat, preview, reset, tube

UP = Vector((0, 0, 1))
MANIFEST = {}


def rand_unit(rng):
    while True:
        v = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if 0.05 < v.length < 1:
            return v.normalized()


def card(mb, origin, along, across, length, width, uvrect, mat, rows=2, cols=3, bow=0.0, sag=0.0, vfold=0.0,
         nfun=None, cfun=None):
    """Grid card. along/across are unit vectors; bow pushes the middle along the face normal."""
    nrm = across.cross(along).normalized()
    u0, v0, u1, v1 = uvrect
    verts, uvs, ns, cs, faces = [], [], [], [], []
    for r in range(rows + 1):
        s = r / rows
        for c in range(cols + 1):
            q = c / cols
            x = (q - 0.5) * width
            p = (origin + along * (length * s) + across * x
                 + nrm * (bow * width * math.sin(math.pi * s) * math.cos(math.pi * (q - 0.5)))
                 + UP * (-sag * length * s * s - vfold * abs(x)))
            verts.append(p)
            uvs.append((u0 + (u1 - u0) * q, v0 + (v1 - v0) * s))
            ns.append(nfun(p, nrm, s, q) if nfun else nrm)
            cs.append(cfun(p, s, q) if cfun else (1, 1, 1))
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mb.add(verts, uvs, ns, cs, faces, mat)


def trunk_flare(phase, strength=0.5, lobes=5):
    def f(z):
        return lambda k, a: 1.0 + strength * math.exp(-max(z[k], -0.3) * 2.6) * (1.0 + 0.35 * math.cos(lobes * a + phase) + 0.2 * math.cos(2 * a - phase))
    return f


def finish(mb, name, H, crown=None, trunk_r=None):
    """Normalise height to exactly H, build + export, store metadata."""
    zmax = max(v[2] for v in mb.v)
    k = H / zmax
    mb.v = [(v[0] * k, v[1] * k, v[2] * k) for v in mb.v]
    ob = mb.build(name)
    xs = [math.hypot(v[0], v[1]) for v in mb.v]
    MANIFEST[name] = dict(height=round(H, 3), trunkRadius=round((trunk_r or 0) * k, 3), crownRadius=round(max(xs), 3))
    return ob


# ------------------------------------------------------------------- conifer
def conifer(name, seed, H=10.0, z0=2.0, levels=22, per=6, lmax=2.5, droop=0.4, irregular=0.2, base_r=0.2, stubs=0):
    rng = random.Random(seed)
    mb = MeshBuilder()
    nseg = 16
    ph = rng.uniform(0, 6.28)
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))
    pts, radii, cols, zs = [], [], [], []
    for i in range(nseg + 1):
        t = i / nseg
        z = -0.7 + (H + 0.7) * t ** 1.15
        tt = max(z, 0) / H
        p = Vector((0, 0, z)) + lean * (tt * tt) + Vector((math.sin(tt * 5 + ph), math.cos(tt * 4 + ph), 0)) * 0.05 * tt
        pts.append(p)
        radii.append(base_r * (1 - tt) ** 0.9 + 0.012)
        zs.append(z)
        ao = 0.55 + 0.45 * min(1.0, max(z, 0) / 0.7)
        if z > z0:
            ao *= 0.7
        cols.append((ao, 0.25 * tt * tt, 0.0))

    def axis(z):
        tt = max(z, 0) / H
        return Vector((0, 0, z)) + lean * (tt * tt) + Vector((math.sin(tt * 5 + ph), math.cos(tt * 4 + ph), 0)) * 0.05 * tt

    tube(mb, pts, radii, 10, 'Bark_Pine', u_repeat=1.0, v_per_m=0.75, colors=cols, rfun=trunk_flare(ph)(zs))
    for i in range(stubs):                                   # dead branch stubs on the bare lower trunk
        z = rng.uniform(1.0, z0 + 0.6)
        az = rng.uniform(0, 6.28)
        d = Vector((math.cos(az), math.sin(az), rng.uniform(-0.1, 0.35))).normalized()
        L = rng.uniform(0.3, 0.9)
        a = axis(z)
        tube(mb, [a, a + d * L * 0.5, a + d * L + Vector((0, 0, -0.06))], [0.035, 0.026, 0.012], 5, 'Bark_Pine',
             u_repeat=0.3, v_per_m=0.75, color=(0.8, 0.05, 0.0))
    for lv in range(levels):
        t = lv / (levels - 1)
        z = z0 + (H - 0.5 - z0) * t ** 0.95
        L = lmax * (1 - t) ** 0.8 * (1 + rng.uniform(-irregular, irregular)) + 0.35
        n = max(3, per + rng.choice([-1, 0, 0, 1]) - (2 if t > 0.8 else 0))
        phase = rng.uniform(0, 6.28)
        for b in range(n):
            az = phase + 2 * math.pi * b / n + rng.uniform(-0.3, 0.3)
            pitch = -droop + (0.5 + droop) * t ** 1.4 + rng.uniform(-0.12, 0.12)
            Lb = L * rng.uniform(0.78, 1.12)
            W = min(max(Lb * 0.6, 0.5), 1.35)
            rad = Vector((math.cos(az), math.sin(az), 0))
            along = (rad * math.cos(pitch) + UP * math.sin(pitch)).normalized()
            across = along.cross(UP).normalized()
            across = (Matrix.Rotation(rng.uniform(-0.4, 0.4), 3, along) @ across).normalized()
            tile = rng.randrange(2)
            bph = rng.random()
            c0 = axis(z + rng.uniform(-0.12, 0.12))

            def nfun(p, nrm, s, q, rad=rad, across=across):
                up = nrm if nrm.z > 0 else -nrm
                return (up * 0.5 + rad * 0.55 + UP * 0.25 + across * (q - 0.5) * 0.5).normalized()

            def cfun(p, s, q, t=t, bph=bph):
                return (min(1.0, (0.42 + 0.58 * s ** 0.8) * (0.72 + 0.28 * t)), (0.2 + 0.8 * s) * (0.35 + 0.65 * t), bph)

            card(mb, c0 - along * 0.05, along, across, Lb, W, (tile * 0.5, 0.0, tile * 0.5 + 0.5, 1.0), 'Foliage_Pine',
                 rows=3, cols=2, sag=0.1 + 0.12 * (1 - t), vfold=0.22, nfun=nfun, cfun=cfun)
    for k in range(3):                                        # leader tip
        az = k * math.pi / 3 + rng.uniform(-0.2, 0.2)
        rad = Vector((math.cos(az), math.sin(az), 0))
        tile = rng.randrange(2)
        card(mb, axis(H - 1.25), UP, rad, 1.3, 0.75, (tile * 0.5, 0.0, tile * 0.5 + 0.5, 1.0), 'Foliage_Pine', rows=1, cols=2,
             nfun=lambda p, nrm, s, q: (nrm + UP * 0.6).normalized(), cfun=lambda p, s, q: (0.95, 0.9, 0.5))
    return finish(mb, name, H, trunk_r=base_r)


# ----------------------------------------------------------------- broadleaf
def grow(mb, rng, start, d, length, r0, depth, maxdepth, tips, bark, seg, H, tropism=0.25, wob=0.25):
    steps = 5 if depth < 2 else 4
    pts, radii = [start.copy()], [r0]
    p = start.copy()
    dd = d.copy()
    for i in range(steps):
        dd = (dd + rand_unit(rng) * wob * 0.5 + UP * tropism * 0.25).normalized()
        p = p + dd * (length / steps)
        pts.append(p.copy())
        radii.append(r0 * (1 - 0.45 * (i + 1) / steps))
    if depth >= maxdepth:
        radii[-1] = r0 * 0.3
    cols = [(0.7, min(1.0, 0.15 + 0.25 * depth) * (q.z / H), 0.0) for q in pts]
    tube(mb, pts, radii, max(4, seg - depth * 2), bark, u_repeat=max(0.3, r0 / 0.22), v_per_m=0.75, colors=cols)
    if depth >= 2:
        tips.append(pts[-1].copy())
        if depth >= maxdepth and rng.random() < 0.5:
            tips.append(pts[-3].copy())
    if depth >= maxdepth:
        return
    nchild = rng.choice([2, 3, 3]) if depth == 0 else rng.choice([2, 2, 3])
    for c in range(nchild):
        f = rng.uniform(0.45, 1.0) if c else 1.0
        idx = min(steps, max(1, int(round(f * steps))))
        base = pts[idx]
        ax = dd.orthogonal().normalized()
        rot = Matrix.Rotation(rng.uniform(0, 6.28), 3, dd) @ ax
        ang = rng.uniform(0.45, 0.95)
        nd = (dd * math.cos(ang) + rot * math.sin(ang)).normalized()
        grow(mb, rng, base, nd, length * rng.uniform(0.58, 0.72), radii[idx] * 0.68, depth + 1, maxdepth, tips, bark, seg, H, tropism, wob)


def leaf_cards(mb, rng, tips, mat, per=9, blob=0.75, size=(1.2, 1.7), hang=0.0):
    crown_c = sum(tips, Vector()) / len(tips)
    crown_r = max((t - crown_c).length for t in tips) + blob
    for tip in tips:
        for _ in range(per):
            p = tip + rand_unit(rng) * blob * rng.random() ** 0.5
            out = (p - crown_c)
            out = out.normalized() if out.length > 1e-3 else UP
            n = (out * 0.75 + rand_unit(rng) * 0.6 + UP * 0.15).normalized()
            upv = (UP - n * UP.dot(n))
            upv = upv.normalized() if upv.length > 0.1 else n.orthogonal().normalized()
            upv = (Matrix.Rotation(rng.uniform(-0.9, 0.9) if not hang else math.pi + rng.uniform(-0.35, 0.35), 3, n) @ upv).normalized()
            across = upv.cross(n).normalized()
            S = rng.uniform(*size)
            tile = rng.randrange(4)
            u0, v0 = (tile % 2) * 0.5, (tile // 2) * 0.5
            bph = rng.random()

            def nfun(q, nrm, s, c, n=n):
                o = (q - crown_c)
                o = o.normalized() if o.length > 1e-3 else UP
                return (o * 0.7 + n * 0.3 + UP * 0.15).normalized()

            def cfun(q, s, c, bph=bph):
                d = min(1.0, (q - crown_c).length / crown_r)
                low = min(1.0, max(0.0, (q.z - (crown_c.z - crown_r)) / (crown_r * 1.2)))
                return (min(1.0, 0.36 + 0.64 * d ** 1.6) * (0.72 + 0.28 * low), 0.45 + 0.55 * d, bph)

            card(mb, p - upv * S * 0.5, upv, across, S, S, (u0, v0, u0 + 0.5, v0 + 0.5), mat, rows=2, cols=2, bow=0.12,
                 nfun=nfun, cfun=cfun)


def base_trunk(mb, rng, H, r0, top_z, top_r, bark, lean=0.4, seg=10, nseg=7):
    ph = rng.uniform(0, 6.28)
    lv = Vector((rng.uniform(-lean, lean), rng.uniform(-lean, lean), 0))
    pts, radii, cols, zs = [], [], [], []
    for i in range(nseg + 1):
        t = i / nseg
        z = -0.7 + (top_z + 0.7) * t
        tt = max(z, 0) / top_z
        pts.append(Vector((0, 0, z)) + lv * tt * tt + Vector((math.sin(tt * 3 + ph), math.cos(tt * 3.5 + ph), 0)) * 0.06 * tt)
        radii.append(r0 + (top_r - r0) * tt ** 0.8)
        zs.append(z)
        cols.append((0.55 + 0.45 * min(1.0, max(z, 0) / 0.7), 0.05 * tt, 0.0))
    tube(mb, pts, radii, seg, bark, u_repeat=max(1.0, round(r0 / 0.2)), v_per_m=0.75, colors=cols, rfun=trunk_flare(ph, 0.6, 4)(zs))
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def broadleaf(name, seed, H=9.0, r0=0.27, split=0.36, limbs=4, per=8, size=(1.25, 1.75), mat='Foliage_Oak'):
    rng = random.Random(seed)
    mb = MeshBuilder()
    top, d = base_trunk(mb, rng, H, r0, H * split, r0 * 0.74, 'Bark_Oak')
    tips = []
    ph = rng.uniform(0, 6.28)
    for i in range(limbs):
        az = ph + 2 * math.pi * i / limbs + rng.uniform(-0.3, 0.3)
        tilt = rng.uniform(0.55, 0.95) if i else 0.2
        nd = Vector((math.cos(az) * math.sin(tilt), math.sin(az) * math.sin(tilt), math.cos(tilt)))
        grow(mb, rng, top - d * 0.1, nd, H * rng.uniform(0.24, 0.3), r0 * 0.5, 1, 3, tips, 'Bark_Oak', 8, H)
    leaf_cards(mb, rng, tips, mat, per=per, size=size)
    return finish(mb, name, H, trunk_r=r0)


def birch(name, seed, H=10.0, r0=0.14):
    rng = random.Random(seed)
    mb = MeshBuilder()
    top, d = base_trunk(mb, rng, H, r0, H * 0.94, 0.02, 'Bark_Birch', lean=0.5, seg=8, nseg=12)
    lean_at = lambda z: top * (z / top.z) ** 2 if z > 0 else Vector((0, 0, z))
    tips = []
    n = 15
    for i in range(n):
        t = i / (n - 1)
        z = H * (0.36 + 0.56 * t)
        az = i * 2.4 + rng.uniform(-0.4, 0.4)
        L = (1.9 * (1 - t) ** 0.7 + 0.5) * rng.uniform(0.8, 1.1)
        rad = Vector((math.cos(az), math.sin(az), 0))
        base = Vector((lean_at(z).x, lean_at(z).y, z))
        pts = []
        for k in range(5):
            s = k / 4
            pts.append(base + rad * (L * s) + UP * (L * (0.75 * s - 0.72 * s * s)))
        rr = 0.035 * (1 - t) + 0.014
        tube(mb, pts, [rr * (1 - 0.7 * k / 4) for k in range(5)], 5, 'Bark_Birch', u_repeat=0.3, v_per_m=0.75,
             colors=[(0.75, 0.3 * k / 4 + 0.2 * t, 0.0) for k in range(5)])
        tips += [pts[2].copy(), pts[3].copy(), pts[4].copy()]
    tips.append(Vector((top.x, top.y, top.z - 0.3)))
    leaf_cards(mb, rng, tips, 'Foliage_Birch', per=6, blob=0.55, size=(0.95, 1.3), hang=1.0)
    return finish(mb, name, H, trunk_r=r0)


# -------------------------------------------------------------- ground cover
def bush(name, seed):
    rng = random.Random(seed)
    mb = MeshBuilder()
    tips = [Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0.3, 0.55))) for _ in range(5)]
    leaf_cards(mb, rng, tips, 'Foliage_Bush', per=4, blob=0.32, size=(0.7, 0.95))
    zmin = min(v[2] for v in mb.v)
    mb.v = [(v[0], v[1], v[2] - zmin - 0.08) for v in mb.v]
    ob = mb.build(name)
    MANIFEST[name] = dict(height=round(max(v[2] for v in mb.v), 3), crownRadius=round(max(math.hypot(v[0], v[1]) for v in mb.v), 3))
    return ob


def fern(name, seed):
    rng = random.Random(seed)
    mb = MeshBuilder()
    n = 9
    for i in range(n):
        az = 2 * math.pi * i / n + rng.uniform(-0.25, 0.25)
        rad = Vector((math.cos(az), math.sin(az), 0))
        side = Vector((-rad.y, rad.x, 0))
        L = rng.uniform(0.7, 1.0)
        rise = rng.uniform(0.5, 0.75)
        W = L * 0.42
        bph = rng.random()
        verts, uvs, ns, cs, faces = [], [], [], [], []
        rows = 5
        for r in range(rows + 1):
            s = r / rows
            ctr = rad * (L * 0.8 * s) + UP * (L * (rise * 1.5 * s - rise * 1.75 * s * s))
            slope = Vector((rad.x * 0.8, rad.y * 0.8, rise * 1.5 - rise * 3.5 * s)).normalized()
            fn = side.cross(slope).normalized()
            if fn.z < 0:
                fn = -fn
            for q in (-1, 0, 1):
                verts.append(ctr + side * (q * W * 0.5) + UP * (abs(q) * W * 0.12))
                uvs.append((0.5 + q * 0.5, s))
                ns.append((fn * 0.6 + UP * 0.5 + side * q * 0.25).normalized())
                cs.append((0.45 + 0.55 * s, s, bph))
        for r in range(rows):
            a = r * 3
            faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
        mb.add(verts, uvs, ns, cs, faces, 'Foliage_Fern')
    ob = mb.build(name)
    MANIFEST[name] = dict(height=0.5, crownRadius=0.8)
    return ob


def fallen_log(name, seed, L=4.2, r=0.27):
    rng = random.Random(seed)
    mb = MeshBuilder()
    n = 9
    pts, radii = [], []
    for i in range(n + 1):
        t = i / n
        pts.append(Vector(((t - 0.5) * L, math.sin(t * 2.2 + seed) * 0.12, r * 0.72 + 0.05 * math.sin(t * 5 + seed))))
        radii.append(r * (1 - 0.22 * t) * (1 + 0.04 * math.sin(i * 2.1)))
    cols = [(1.0, 0.0, 0.0)] * (n + 1)
    tube(mb, pts, radii, 12, 'Log_Bark', u_repeat=2.0, v_per_m=0.75, colors=cols, cap_end=True, cap_start=True, cap_mat='Log_End',
         rfun=lambda k, a: 1.0 + 0.06 * math.cos(3 * a + k * 0.7) + 0.04 * math.cos(7 * a))
    for i in range(3):
        t = rng.uniform(0.2, 0.85)
        base = pts[int(t * n)]
        az = rng.uniform(0.3, 2.8)
        d = Vector((rng.uniform(-0.4, 0.4), math.cos(az), abs(math.sin(az)))).normalized()
        ln = rng.uniform(0.35, 0.8)
        tube(mb, [base, base + d * ln * 0.6, base + d * ln], [0.06, 0.045, 0.03], 6, 'Log_Bark', u_repeat=0.5, v_per_m=0.75,
             color=(1, 0, 0), cap_end=True, cap_mat='Log_End')
    ob = mb.build(name)
    MANIFEST[name] = dict(length=L, radius=r)
    return ob


# -------------------------------------------------------------------- preview
def preview_materials():
    spec = {
        'Bark_Pine': ('bark_pine', False), 'Bark_Oak': ('bark_oak', False), 'Bark_Birch': ('bark_birch', False),
        'Log_Bark': ('bark_oak', False), 'Log_End': ('wood_cut', False),
        'Foliage_Pine': ('foliage_pine', True), 'Foliage_Oak': ('foliage_leaf', True), 'Foliage_Birch': ('foliage_leaf', True),
        'Foliage_Bush': ('foliage_leaf', True), 'Foliage_Fern': ('foliage_fern', True),
    }
    for name, (tex, alpha) in spec.items():
        m = bpy.data.materials.get(name)
        if not m:
            continue
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = bpy.data.images.load(os.path.join(TEX, tex + '_albedo.webp'), check_existing=True)
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8
        if alpha:
            nt.links.new(img.outputs['Alpha'], bsdf.inputs['Alpha'])


SPECS = [
    ('pine_a', lambda: conifer('pine_a', 11, H=10.0, z0=1.9, levels=23, per=6, lmax=2.5, droop=0.42)),
    ('pine_b', lambda: conifer('pine_b', 12, H=10.0, z0=3.6, levels=19, per=5, lmax=2.2, droop=0.5, irregular=0.35, base_r=0.19, stubs=6)),
    ('pine_c', lambda: conifer('pine_c', 13, H=10.0, z0=1.3, levels=25, per=7, lmax=2.9, droop=0.36, base_r=0.22)),
    ('oak_a', lambda: broadleaf('oak_a', 21, H=9.0, r0=0.28, split=0.34, limbs=4)),
    ('oak_b', lambda: broadleaf('oak_b', 25, H=9.0, r0=0.24, split=0.44, limbs=4, per=8, size=(1.15, 1.6))),
    ('birch_a', lambda: birch('birch_a', 31)),
    ('bush_a', lambda: bush('bush_a', 41)),
    ('fern_a', lambda: fern('fern_a', 51)),
    ('log_a', lambda: fallen_log('log_a', 61)),
]

if __name__ == '__main__':
    do_preview = '--preview' in sys.argv
    for name, fn in SPECS:
        reset()
        ob = fn()
        export_glb(name, [ob])
    with open(os.path.join(MODELS, 'vegetation.json'), 'w') as f:
        json.dump(MANIFEST, f, indent=1)
    print(json.dumps(MANIFEST))
    if do_preview:
        reset()
        x = 0
        for name, fn in SPECS:
            ob = fn()
            ob.location.x = x
            x += 7 if not name.startswith(('bush', 'fern', 'log')) else 4
        preview_materials()
        bpy.ops.mesh.primitive_plane_add(size=200)
        preview(os.path.join(TMP, 'trees_preview.png'), res=(1900, 520), cam_dir=(0.05, -1, 0.12), samples=20,
                target=(x / 2 - 4, 0, 4.6), dist=95)
