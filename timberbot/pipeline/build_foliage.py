"""Model real leaf / needle / frond geometry in Blender and render it (Cycles, orthographic,
transparent film) into foliage card atlases: albedo+alpha and tangent-space normal.

  foliage_leaf_*   2x2 atlas of broadleaf clusters
  foliage_pine_*   2x1 atlas of conifer branch sprays (each tile 1:2)
  foliage_fern_*   single fern frond (1:2)
"""
import math
import os
import random

import bpy
import numpy as np
from PIL import Image
from mathutils import Matrix, Vector

from bl_common import TEX, TMP, MeshBuilder, dilate_rgba, reset, srgb2lin


def lin(c):
    return tuple(srgb2lin(c))


def leaf(mb, rng, pos, ang, length, width, palette, tilt=0.45, fold=0.35, serr=0.0, z=0.0):
    """Ovate leaf with a folded midrib, pointing along `ang` in the XY plane."""
    n = 7
    base = np.array(palette[rng.randrange(len(palette))], dtype=np.float64) * rng.uniform(0.82, 1.18)
    rib = np.clip(base * 1.25 + np.array([0.02, 0.03, 0.0]), 0, 1)
    R = (Matrix.Rotation(ang - math.pi / 2, 4, 'Z') @ Matrix.Rotation(rng.uniform(-tilt, tilt), 4, 'X')
         @ Matrix.Rotation(rng.uniform(-tilt, tilt), 4, 'Y'))
    curl = rng.uniform(-0.25, 0.1)
    verts, cols = [], []
    for i in range(n + 1):
        t = i / n
        hw = width * 0.5 * math.sin(math.pi * t ** 0.75) ** 0.85
        if serr and 0 < i < n:
            hw *= 1.0 + serr * (1 if i % 2 else -1)
        zz = curl * length * t * t
        for sx in (-1, 0, 1):
            p = Vector((sx * hw, t * length, zz + abs(sx) * hw * fold))
            verts.append(R @ p + Vector((pos[0], pos[1], z)))
            edge = base * (0.9 + 0.2 * t)
            cols.append(tuple(rib if sx == 0 else edge))
    faces = []
    for i in range(n):
        a = i * 3
        faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    mb.add(verts, [(0, 0)] * len(verts), [(0, 0, 1)] * len(verts), cols, faces, 'Leaf')


def twig(mb, pts, r0, r1, color, z=-0.02):
    verts, cols, faces = [], [], []
    for i, p in enumerate(pts):
        a = pts[min(i + 1, len(pts) - 1)]
        b = pts[max(i - 1, 0)]
        d = Vector((a[0] - b[0], a[1] - b[1], 0)).normalized()
        nrm = Vector((-d.y, d.x, 0))
        r = r0 + (r1 - r0) * i / (len(pts) - 1)
        verts += [Vector((p[0], p[1], z)) + nrm * r, Vector((p[0], p[1], z + r * 0.9)), Vector((p[0], p[1], z)) - nrm * r]
        cols += [tuple(np.array(color) * 0.7), tuple(np.array(color) * 1.15), tuple(np.array(color) * 0.7)]
    for i in range(len(pts) - 1):
        a = i * 3
        faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    mb.add(verts, [(0, 0)] * len(verts), [(0, 0, 1)] * len(verts), cols, faces, 'Leaf')


def polyline(p0, ang, length, steps, rng, wobble=0.25):
    pts = [p0]
    a = ang
    for _ in range(steps):
        a += rng.uniform(-wobble, wobble)
        q = pts[-1]
        pts.append((q[0] + math.cos(a) * length / steps, q[1] + math.sin(a) * length / steps))
    return pts


# --------------------------------------------------------------------------- scenes
def build_leaf_atlas(mb):
    greens = [lin(c) for c in [(58, 98, 30), (72, 114, 36), (84, 126, 42), (64, 104, 28), (96, 136, 48),
                               (110, 142, 52), (50, 88, 30), (124, 148, 56)]]
    bark = lin((70, 50, 34))
    for ti, (cx, cy) in enumerate([(-0.5, 0.5), (0.5, 0.5), (-0.5, -0.5), (0.5, -0.5)]):
        rng = random.Random(100 + ti)
        lim = 0.47

        def inside(p, m=0.0):
            return abs(p[0] - cx) < lim - m and abs(p[1] - cy) < lim - m

        anchors = []
        main = polyline((cx + rng.uniform(-0.05, 0.05), cy - 0.46), math.pi / 2 + rng.uniform(-0.2, 0.2), 0.7, 8, rng, 0.2)
        twig(mb, main, 0.014, 0.004, bark)
        anchors += [(p, math.pi / 2) for p in main[2:]]
        for k in range(2, 8):
            for side in (-1, 1):
                if rng.random() < 0.2:
                    continue
                a = math.pi / 2 + side * rng.uniform(0.6, 1.25)
                sub = polyline(main[k], a, rng.uniform(0.2, 0.4), 5, rng, 0.25)
                sub = [p for p in sub if inside(p, 0.06)]
                if len(sub) > 2:
                    twig(mb, sub, 0.007, 0.003, bark)
                    anchors += [(p, a) for p in sub[1:]]
        z = 0.0
        for p, a in anchors:
            for _ in range(3):
                la = a + rng.choice((-1, 1)) * rng.uniform(0.3, 1.3)
                L = rng.uniform(0.1, 0.15)
                tip = (p[0] + math.cos(la) * L, p[1] + math.sin(la) * L)
                if inside(tip, 0.0):
                    z += 0.0015
                    leaf(mb, rng, p, la, L, L * rng.uniform(0.5, 0.66), greens, serr=0.06, z=z)
        for _ in range(170):                       # fill the silhouette for a dense canopy card
            r = 0.4 * math.sqrt(rng.random())
            t = rng.uniform(0, 2 * math.pi)
            p = (cx + r * math.cos(t), cy + 0.02 + r * math.sin(t) * 1.02)
            la = math.atan2(p[1] - (cy - 0.3), p[0] - cx) + rng.uniform(-0.9, 0.9)
            L = rng.uniform(0.1, 0.15)
            tip = (p[0] + math.cos(la) * L, p[1] + math.sin(la) * L)
            if inside(tip) and inside(p):
                z += 0.0015
                leaf(mb, rng, p, la, L, L * rng.uniform(0.5, 0.66), greens, serr=0.06, z=z)


def needle_strip(mb, rng, p0, ang, length, greens, z):
    """A twiglet densely set with needles (each a thin tapered quad)."""
    steps = max(4, int(length / 0.012))
    d = Vector((math.cos(ang), math.sin(ang), 0))
    nrm = Vector((-d.y, d.x, 0))
    verts, cols, faces = [], [], []
    for i in range(steps):
        t = i / steps
        base = Vector((p0[0], p0[1], z)) + d * (length * t)
        tipcol = 1.0 + 0.5 * t
        for side in (-1, 1):
            for _ in range(3):
                na = rng.uniform(0.5, 1.1) * side
                nl = rng.uniform(0.028, 0.044) * (1.0 - 0.35 * t)
                nd = (d * math.cos(na) + nrm * math.sin(na)).normalized()
                up = rng.uniform(-0.012, 0.022)
                w = 0.0042
                pn = Vector((-nd.y, nd.x, 0))
                c = np.array(greens[rng.randrange(len(greens))]) * rng.uniform(0.75, 1.2) * tipcol
                b = len(verts)
                verts += [base + pn * w, base - pn * w, base + nd * nl + Vector((0, 0, up)) - pn * w * 0.3,
                          base + nd * nl + Vector((0, 0, up)) + pn * w * 0.3]
                cols += [tuple(c * 0.75), tuple(c * 0.75), tuple(np.clip(c * 1.15, 0, 1)), tuple(np.clip(c * 1.15, 0, 1))]
                faces.append((b, b + 1, b + 2, b + 3))
    mb.add(verts, [(0, 0)] * len(verts), [(0, 0, 1)] * len(verts), cols, faces, 'Leaf')


def build_pine_atlas(mb):
    greens = [lin(c) for c in [(44, 84, 44), (54, 98, 50), (40, 76, 42), (66, 112, 54), (48, 90, 56), (76, 120, 56)]]
    bark = lin((78, 54, 36))
    for ti, cx in enumerate((-0.5, 0.5)):
        rng = random.Random(200 + ti)
        stem = polyline((cx, -0.97), math.pi / 2, 1.86, 22, rng, 0.03)
        twig(mb, stem, 0.012, 0.003, bark, z=0.0)
        z = 0.0
        for k in range(1, 22):
            t = k / 22
            # triangular spray outline, widest low on the branch
            reach = (0.44 * (1 - t) ** 0.75 + 0.05) * (0.85 + 0.3 * rng.random())
            for side in (-1, 1):
                a = math.pi / 2 - side * rng.uniform(0.75, 1.0)
                p0 = stem[k]
                ln = min(reach, (0.48 - abs(p0[0] - cx)) / max(abs(math.cos(a)), 1e-3) - 0.03)
                if ln < 0.04:
                    continue
                z += 0.002
                sub = [p0, (p0[0] + math.cos(a) * ln, p0[1] + math.sin(a) * ln)]
                twig(mb, sub, 0.005, 0.002, bark, z=z)
                needle_strip(mb, rng, p0, a, ln, greens, z + 0.004)
                # secondary twiglets
                m = int(ln / 0.07)
                for j in range(1, m):
                    q = (p0[0] + math.cos(a) * ln * j / m, p0[1] + math.sin(a) * ln * j / m)
                    for s2 in (-1, 1):
                        a2 = a + s2 * rng.uniform(0.5, 0.8)
                        l2 = ln * rng.uniform(0.22, 0.4) * (1 - j / m * 0.5)
                        tipx = q[0] + math.cos(a2) * l2
                        tipy = q[1] + math.sin(a2) * l2
                        if abs(tipx - cx) < 0.47 and abs(tipy) < 0.97 and l2 > 0.03:
                            z += 0.0005
                            needle_strip(mb, rng, q, a2, l2, greens, z + 0.006)
        needle_strip(mb, rng, stem[0], math.pi / 2, 1.86, greens, 0.004)


def build_fern(mb):
    greens = [lin(c) for c in [(70, 122, 38), (84, 136, 44), (98, 150, 50), (76, 128, 34)]]
    rng = random.Random(300)
    rach = [(0.0, -0.97 + 1.9 * i / 30) for i in range(31)]
    twig(mb, rach, 0.016, 0.005, lin((92, 124, 44)), z=0.0)
    z = 0.0
    for k in range(3, 30):
        t = k / 30
        reach = 0.46 * math.sin(math.pi * min(1.0, (t * 0.95 + 0.06)) ** 0.7) ** 0.9 * (1 - t ** 5)
        for side in (-1, 1):
            a = math.pi / 2 - side * (1.25 - 0.45 * t)
            p0 = rach[k]
            ln = reach * rng.uniform(0.9, 1.05)
            d = Vector((math.cos(a), math.sin(a), 0))
            nrm = Vector((-d.y, d.x, 0))
            m = max(4, int(ln / 0.03))
            base = np.array(greens[rng.randrange(len(greens))]) * rng.uniform(0.85, 1.15)
            verts, cols, faces = [], [], []
            z += 0.002
            tilt = rng.uniform(0.05, 0.4)
            for j in range(m + 1):
                s = j / m
                hw = 0.052 * (1 - s) ** 0.65 + 0.007
                tooth = 1.0 if j % 2 == 0 else 0.55
                c = Vector((p0[0], p0[1], z)) + d * (ln * s) + Vector((0, 0, -0.03 * s * s))
                verts += [c + nrm * hw * tooth + Vector((0, 0, hw * tilt)), c, c - nrm * hw * tooth + Vector((0, 0, hw * tilt))]
                cols += [tuple(base * (0.85 + 0.25 * s)), tuple(np.clip(base * 1.3, 0, 1)), tuple(base * (0.85 + 0.25 * s))]
            for j in range(m):
                q = j * 3
                faces += [(q, q + 1, q + 4, q + 3), (q + 1, q + 2, q + 5, q + 4)]
            mb.add(verts, [(0, 0)] * len(verts), [(0, 0, 1)] * len(verts), cols, faces, 'Leaf')


# --------------------------------------------------------------------------- render
def setup_material(mode):
    m = bpy.data.materials['Leaf']
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    if mode == 'albedo':
        col = nt.nodes.new('ShaderNodeVertexColor')
        col.layer_name = 'Color'
        ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = 0.06
        ao.samples = 8
        mp = nt.nodes.new('ShaderNodeMapRange')
        mp.inputs[3].default_value = 0.5
        mp.inputs[4].default_value = 1.0
        nt.links.new(ao.outputs['AO'], mp.inputs[0])
        mul = nt.nodes.new('ShaderNodeMixRGB')
        mul.blend_type = 'MULTIPLY'
        mul.inputs[0].default_value = 1.0
        nt.links.new(col.outputs['Color'], mul.inputs[1])
        nt.links.new(mp.outputs[0], mul.inputs[2])
        nt.links.new(mul.outputs[0], em.inputs[0])
    else:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        mad = nt.nodes.new('ShaderNodeVectorMath')
        mad.operation = 'MULTIPLY_ADD'
        mad.inputs[1].default_value = (0.5, 0.5, 0.5)
        mad.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(geo.outputs['Normal'], mad.inputs[0])
        nt.links.new(mad.outputs[0], em.inputs[0])


def render_atlas(name, builder, res, ortho):
    s = reset(samples=24)
    mb = MeshBuilder()
    builder(mb)
    ob = mb.build('foliage')
    ob.data.polygons.foreach_set('use_smooth', [False] * len(ob.data.polygons))
    ob.data.materials[0].use_backface_culling = False
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = ortho
    co = bpy.data.objects.new('cam', cam)
    s.collection.objects.link(co)
    co.location = (0, 0, 5)
    s.camera = co
    s.render.resolution_x, s.render.resolution_y = res
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.cycles.filter_width = 1.2
    imgs = {}
    for mode in ('albedo', 'normal'):
        setup_material(mode)
        s.view_settings.view_transform = 'Standard' if mode == 'albedo' else 'Raw'
        s.view_settings.look = 'None'
        s.cycles.samples = 24 if mode == 'albedo' else 12
        path = os.path.join(TMP, f'{name}_{mode}.png')
        s.render.filepath = path
        bpy.ops.render.render(write_still=True)
        imgs[mode] = np.asarray(Image.open(path).convert('RGBA'), dtype=np.float64)
    alb, nrm = imgs['albedo'], imgs['normal']
    alpha = alb[..., 3].copy()
    # un-premultiply edge pixels, bleed colour outwards, keep a crisp-but-antialiased alpha
    alb = dilate_rgba(alb)
    nrm[..., 3] = alpha
    nrm = dilate_rgba(nrm)
    alb[..., 3] = np.clip((alpha / 255.0 - 0.15) / 0.7, 0, 1) * 255
    Image.fromarray(alb.astype(np.uint8), 'RGBA').save(os.path.join(TEX, f'{name}_albedo.webp'), quality=92, method=6)
    Image.fromarray(nrm[..., :3].astype(np.uint8), 'RGB').save(os.path.join(TEX, f'{name}_normal.webp'), quality=90, method=6)
    cov = (alpha > 128).mean()
    print(f'[foliage] {name}: {len(ob.data.polygons)} polys, coverage {cov:.2f}')


if __name__ == '__main__':
    render_atlas('foliage_leaf', build_leaf_atlas, (1024, 1024), 2.0)
    render_atlas('foliage_pine', build_pine_atlas, (1024, 1024), 2.0)
    render_atlas('foliage_fern', build_fern, (512, 1024), 2.0)
