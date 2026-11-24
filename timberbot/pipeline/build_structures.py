"""Buildable structures, modelled to the exact gameplay dimensions:

  palisade  : 3.0 m wide x 2.5 m tall sharpened-log wall
  campfire  : 1.5 m diameter stone ring with charred logs
  beacon    : 3 m x 3 m base, 7.0 m tall stone watchtower with a brazier under a shingled roof

Origin = ground contact point; foundations extend below z=0 so they stay flush on slopes.
UVs are world-scaled box / cylinder projections so the tileable PBR sets keep their texel density.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

from bl_common import MODELS, TEX, TMP, MeshBuilder, export_glb, get_mat, preview, reset, select_only

UVS = {'Stone_Masonry': 0.5, 'Wood_Beam': 1.0, 'Wood_Cut': 1.0, 'Wood_Bark': 0.75, 'Roof_Shingles': 0.6,
       'Iron_Dark': 2.0, 'Fire_Log': 2.0, 'Fire_Ash': 1.2, 'Rope': 4.0, 'Beacon_Glow': 1.0, 'Dark_Void': 1.0}


class SPart:
    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.bm.loops.layers.uv.verify()
        self.mats = []
        self.rng = random.Random(seed)

    def _merge(self, tmp, mat, rot, center, cylinder=False, u_rep=1.0):
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        uvl = tmp.loops.layers.uv.verify()
        sc = UVS.get(mat, 1.0)
        ou, ov = self.rng.random(), self.rng.random()
        tmp.normal_update()
        for f in tmp.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            fc = f.calc_center_median()
            for lp in f.loops:
                c = lp.vert.co
                if cylinder and ax != 2:
                    a = math.atan2(c.y, c.x)
                    ac = math.atan2(fc.y, fc.x)
                    if a - ac > math.pi:
                        a -= 2 * math.pi
                    elif ac - a > math.pi:
                        a += 2 * math.pi
                    lp[uvl].uv = (a / (2 * math.pi) * u_rep + ou, c.z * sc + ov)
                elif ax == 2:
                    lp[uvl].uv = (c.x * sc + ou, c.y * sc + ov)
                elif ax == 0:
                    lp[uvl].uv = (c.y * sc + ou, c.z * sc + ov)
                else:
                    lp[uvl].uv = (c.x * sc + ou, c.z * sc + ov)
        M = Matrix.Translation(Vector(center)) @ (Euler(rot).to_matrix().to_4x4() if rot else Matrix.Identity(4))
        tmp.transform(M)
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(me)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[n0:]:
            f.material_index = mi
        bpy.data.meshes.remove(me)

    def box(self, size, center, mat, bevel=0.015, rot=None, segs=1, shape=None):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        for v in tmp.verts:
            x, y, z = v.co
            if shape:
                x, y, z = shape(x, y, z)
            v.co = Vector((x * size[0], y * size[1], z * size[2]))
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=tmp.edges[:], offset=bevel, segments=segs, profile=0.5, affect='EDGES')
        self._merge(tmp, mat, rot, center)

    def cyl(self, r, depth, center, mat, rot=None, verts=12, r2=None, bevel=0.0, caps=True, u_rep=1.0, cap_mat=None, wobble=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=caps, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        if wobble:
            for v in tmp.verts:
                a = math.atan2(v.co.y, v.co.x)
                k = 1 + wobble * math.sin(3 * a + v.co.z * 2.0) + wobble * 0.6 * math.sin(5 * a + 1.3)
                v.co.x *= k
                v.co.y *= k
        if bevel > 0 and caps:
            capf = [f for f in tmp.faces if len(f.verts) > 4]
            edges = list({e for f in capf for e in f.edges})
            bmesh.ops.bevel(tmp, geom=edges, offset=bevel, segments=1, profile=0.5, affect='EDGES')
        self._merge(tmp, mat, rot, center, cylinder=True, u_rep=u_rep)

    def sphere(self, r, center, mat, scale=(1, 1, 1), subdiv=2):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=r)
        for v in tmp.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        self._merge(tmp, mat, None, center)

    def finish(self, weighted=True):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        for m in self.mats:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if weighted:
            select_only([ob])
            me.set_sharp_from_angle(angle=math.radians(50))
            mod = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
            mod.keep_sharp = True
            mod.weight = 60
            bpy.ops.object.modifier_apply(modifier='wn')
        return ob


def bounds(ob):
    cs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return mn, mx


# ------------------------------------------------------------------ palisade
def palisade():
    p = SPart('Palisade', 5)
    rng = random.Random(5)
    n = 10
    tops = [2.5 - rng.uniform(0.02, 0.2) for _ in range(n)]
    tops[rng.randrange(n)] = 2.5
    tops[rng.randrange(n)] = 2.5
    for i in range(n):
        x = -1.35 + 0.3 * i
        r = 0.15 if i in (0, n - 1) else rng.uniform(0.15, 0.165)
        top = tops[i]
        tip = rng.uniform(0.3, 0.38)
        lean = (rng.uniform(-0.025, 0.025), 0, rng.uniform(0, 6.28))
        y = rng.uniform(-0.02, 0.02)
        body_h = top - tip + 0.9
        p.cyl(r, body_h, (x, y, -0.9 + body_h / 2), 'Wood_Bark', rot=lean, verts=10, caps=False, u_rep=1.0, wobble=0.035)
        p.cyl(r * 0.99, tip, (x, y, top - tip / 2), 'Wood_Cut', rot=lean, verts=10, r2=0.025, caps=True, u_rep=1.0)
    for z in (0.7, 1.75):                                   # lashed back rails
        p.box((0.1, 0.085, 2.96), (0, 0.185, z), 'Wood_Beam', rot=(0, math.pi / 2, 0), bevel=0.012)
        for i in range(0, n, 3):
            x = -1.35 + 0.3 * i + 0.15
            p.cyl(0.075, 0.07, (x, 0.175, z), 'Rope', rot=(0, math.pi / 2, 0), verts=10, bevel=0.012)
    ob = p.finish()
    mn, mx = bounds(ob)
    k = 3.0 / (mx.x - mn.x)                                  # snap to exactly 3.0 m wide
    for v in ob.data.vertices:
        v.co.x = (v.co.x - (mx.x + mn.x) / 2) * k
    mn, mx = bounds(ob)
    assert abs((mx.x - mn.x) - 3.0) < 0.002 and abs(mx.z - 2.5) < 0.01, (mn, mx)
    print(f'[palisade] {mx.x - mn.x:.3f} m wide, {mx.z:.3f} m tall, {mx.y - mn.y:.2f} m deep')
    return ob


# ------------------------------------------------------------------ campfire
def campfire():
    rng = random.Random(9)
    stones = []
    src = {}
    for nm in ('boulder_a', 'boulder_b', 'boulder_c'):
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, nm + '.glb'))
        src[nm] = bpy.context.selected_objects[0]
    n = 10
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.08, 0.08)
        s = rng.uniform(0.27, 0.33)
        base = src[rng.choice(list(src))]
        ob = base.copy()
        ob.data = base.data.copy()
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = None
        select_only([ob])
        dec = ob.modifiers.new('dec', 'DECIMATE')
        dec.ratio = 0.22
        bpy.ops.object.modifier_apply(modifier='dec')
        ob.matrix_world = Matrix.Translation((math.cos(a) * 0.59, math.sin(a) * 0.59, 0.0)) @ Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Z') @ Matrix.Scale(s, 4)
        stones.append(ob)
    for o in src.values():
        bpy.data.objects.remove(o)
    p = SPart('CampfireCore', 9)
    # ash mound
    p.cyl(0.5, 0.07, (0, 0, 0.012), 'Fire_Ash', verts=18, r2=0.36, wobble=0.05)
    for i in range(6):                                       # teepee of charred logs
        a = 2 * math.pi * i / 6 + rng.uniform(-0.2, 0.2)
        base = Vector((math.cos(a) * 0.36, math.sin(a) * 0.36, 0.05))
        top = Vector((math.cos(a + 2.6) * 0.06, math.sin(a + 2.6) * 0.06, 0.52 + rng.uniform(-0.05, 0.06)))
        d = top - base
        rot = d.to_track_quat('Z', 'Y').to_euler()
        p.cyl(rng.uniform(0.048, 0.062), d.length, (base + top) / 2, 'Fire_Log', rot=rot, verts=8, u_rep=1.0, bevel=0.01, wobble=0.05)
    for i in range(3):                                       # embers logs lying in the ash
        a = rng.uniform(0, 6.28)
        p.cyl(0.05, 0.55, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.07), 'Fire_Log', rot=(math.pi / 2, 0, a), verts=8, bevel=0.01, wobble=0.05)
    core = p.finish()
    select_only(stones + [core])
    bpy.context.view_layer.objects.active = core
    bpy.ops.object.join()
    core.name = 'Campfire'
    mn, mx = bounds(core)
    r = max(math.hypot(v.co.x, v.co.y) for v in core.data.vertices)
    for v in core.data.vertices:                             # snap to exactly 1.5 m diameter
        v.co.x *= 0.75 / r
        v.co.y *= 0.75 / r
    r = max(math.hypot(v.co.x, v.co.y) for v in core.data.vertices)
    print(f'[campfire] diameter {2 * r:.3f} m, height {mx.z:.2f} m')
    assert abs(2 * r - 1.5) < 0.002
    return core


# -------------------------------------------------------------------- beacon
def beacon():
    p = SPart('Beacon', 13)
    rng = random.Random(13)
    M, W = 'Stone_Masonry', 'Wood_Beam'
    p.box((3.0, 3.0, 1.75), (0, 0, -0.375), M, bevel=0.05)                         # plinth (-1.25 .. 0.5)
    taper = lambda x, y, z: (x * (1 - 0.07 * (z + 0.5)), y * (1 - 0.07 * (z + 0.5)), z)
    p.box((2.5, 2.5, 4.0), (0, 0, 2.5), M, bevel=0.03, shape=taper)                # shaft (0.5 .. 4.5)
    for sx in (-1, 1):                                                             # corner quoins
        for sy in (-1, 1):
            for k in range(10):
                z = 0.72 + k * 0.4
                half = 1.25 * (1 - 0.14 * (z - 0.5) / 4.0)
                long_x = k % 2 == 0
                sz = (0.46, 0.3, 0.33) if long_x else (0.3, 0.46, 0.33)
                cx = sx * (half - sz[0] / 2 + 0.035)
                cy = sy * (half - sz[1] / 2 + 0.035)
                p.box(sz, (cx, cy, z), M, bevel=0.022)
    p.box((2.66, 2.66, 0.2), (0, 0, 4.58), M, bevel=0.035)                          # corbel courses
    p.box((2.88, 2.88, 0.18), (0, 0, 4.76), M, bevel=0.035)
    # door (front = -Y) with timber frame and stone steps
    p.box((0.9, 0.12, 1.75), (0, -1.165, 1.375), 'Dark_Void', bevel=0.0)
    p.box((0.8, 0.06, 1.66), (0, -1.215, 1.33), W, bevel=0.01)
    for sx in (-1, 1):
        p.box((0.14, 0.16, 1.9), (sx * 0.5, -1.235, 1.45), W, bevel=0.015)
        p.box((0.06, 0.02, 0.74), (0, -1.25, 0.95 + (sx > 0) * 0.8), 'Iron_Dark', bevel=0.006, rot=(0, math.pi / 2, 0))
    p.box((0.16, 0.18, 1.3), (0, -1.235, 2.46), W, bevel=0.015, rot=(0, math.pi / 2, 0))
    p.box((1.3, 0.24, 0.25), (0, -1.36, 0.375), M, bevel=0.03)
    for face in ((1, 0), (-1, 0), (0, 1)):                                          # arrow slits
        fx, fy = face
        sz = (0.07, 0.14, 0.75) if fx == 0 else (0.14, 0.07, 0.75)
        for z in (2.1, 3.5):
            if fy == 1 and z < 3:
                continue
            p.box((sz[0] * (4 if fx else 1), sz[1] * (4 if fy else 1), sz[2]), (fx * 1.13, fy * 1.13, z), 'Dark_Void', bevel=0.0)
    # timber deck, 3 x 3 m
    for i in range(10):
        p.box((0.285, 0.09, 3.0 - rng.uniform(0, 0.04)), (-1.35 + 0.3 * i, 0, 4.895), W, rot=(math.pi / 2, 0, 0), bevel=0.01)
    for sy in (-1, 1):
        p.box((0.16, 0.16, 3.0), (0, sy * 1.2, 4.80 + 0.0), W, rot=(0, math.pi / 2, 0), bevel=0.012)
    for sx in (-1, 1):                                                              # posts + rails
        for sy in (-1, 1):
            p.box((0.15, 0.15, 1.2), (sx * 1.38, sy * 1.38, 5.54), W, bevel=0.014)
            p.box((0.1, 0.1, 0.85), (sx * 1.12, sy * 1.12, 4.52), W, bevel=0.01, rot=(sy * 0.6, -sx * 0.6, 0))
    for z, t in ((5.35, 0.07), (5.72, 0.09)):
        for sx in (-1, 1):
            p.box((t, t, 2.7), (sx * 1.38, 0, z), W, rot=(math.pi / 2, 0, 0), bevel=0.008)
        p.box((t, t, 2.7), (0, 1.38, z), W, rot=(0, math.pi / 2, 0), bevel=0.008)
        for sx in (-1, 1):                                                          # front rail leaves a gap
            p.box((t, t, 0.95), (sx * 0.88, -1.38, z), W, rot=(0, math.pi / 2, 0), bevel=0.008)
    for sx in (-1, 1):
        p.box((0.11, 0.11, 2.9), (sx * 1.38, 0, 6.12), W, rot=(math.pi / 2, 0, 0), bevel=0.01)   # roof plates
        p.box((0.11, 0.11, 2.9), (0, sx * 1.38, 6.12), W, rot=(0, math.pi / 2, 0), bevel=0.01)
    # iron brazier with the beacon fire
    p.cyl(0.2, 0.5, (0, 0, 5.19), 'Iron_Dark', verts=10, r2=0.13, bevel=0.015)
    p.cyl(0.3, 0.26, (0, 0, 5.56), 'Iron_Dark', verts=14, r2=0.5, bevel=0.012)
    p.cyl(0.52, 0.05, (0, 0, 5.705), 'Iron_Dark', verts=14, bevel=0.012)
    p.sphere(0.34, (0, 0, 5.75), 'Beacon_Glow', scale=(1.15, 1.15, 0.62), subdiv=2)
    for i in range(5):
        a = i * 1.257
        p.cyl(0.05, 0.42, (math.cos(a) * 0.12, math.sin(a) * 0.12, 5.86), 'Fire_Log', rot=(0.5 * math.sin(a), -0.5 * math.cos(a), a), verts=7, bevel=0.008)
    ob = p.finish()
    # shingled pyramid roof, apex at exactly 7.0 m
    mb = MeshBuilder()
    e, z0, z1 = 1.5, 6.14, 7.0
    sl = math.hypot(e, z1 - z0)
    for k in range(4):
        a = k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        rot = lambda x, y: (x * ca - y * sa, x * sa + y * ca)
        rows = 5
        verts, uvs, ns, cs, faces = [], [], [], [], []
        nrm = Vector((*rot(0, -(z1 - z0)), e)).normalized()
        for r in range(rows + 1):
            t = r / rows
            w = e * (1 - t)
            for q in (-1, 1):
                x, y = rot(q * w, -e * (1 - t))
                verts.append((x, y, z0 + (z1 - z0) * t))
                uvs.append((q * w * 0.6 + k * 0.37, -t * sl * 0.6))
                ns.append(nrm)
                cs.append((1, 1, 1))
        for r in range(rows):
            b = r * 2
            faces.append((b, b + 1, b + 3, b + 2))
        mb.add(verts, uvs, ns, cs, faces, 'Roof_Shingles')
        # dark underside
        mb.add([(v[0] * 0.98, v[1] * 0.98, v[2] - 0.05) for v in verts], uvs, [-nrm] * len(verts), cs, [tuple(reversed(f)) for f in faces], 'Wood_Beam')
    roof = mb.build('BeaconRoof')
    select_only([roof, ob])
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    mn, mx = bounds(ob)
    print(f'[beacon] base {mx.x - mn.x:.3f} x {mx.y - mn.y:.3f} m, top {mx.z:.3f} m, bottom {mn.z:.2f} m')
    assert abs(mx.z - 7.0) < 0.01 and abs((mx.x - mn.x) - 3.0) < 0.12
    return ob


def preview_materials():
    spec = {'Stone_Masonry': 'stone_masonry', 'Wood_Beam': 'wood_beam', 'Wood_Cut': 'wood_cut', 'Wood_Bark': 'bark_pine',
            'Roof_Shingles': 'roof_shingles', 'Fire_Log': 'charcoal', 'Fire_Ash': 'charcoal', 'Boulder_A': 'boulder_a',
            'Boulder_B': 'boulder_b', 'Boulder_C': 'boulder_c'}
    for m in bpy.data.materials:
        nt = m.node_tree
        if not nt:
            continue
        bsdf = nt.nodes.get('Principled BSDF')
        if not bsdf:
            continue
        key = m.name.split('.')[0]
        if key in spec:
            img = nt.nodes.new('ShaderNodeTexImage')
            img.image = bpy.data.images.load(os.path.join(TEX, spec[key] + '_albedo.webp'), check_existing=True)
            nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
            bsdf.inputs['Roughness'].default_value = 0.85
        elif key in ('Dark_Void', 'Iron_Dark'):
            bsdf.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
        elif key == 'Rope':
            bsdf.inputs['Base Color'].default_value = (0.35, 0.26, 0.14, 1)
        elif key == 'Beacon_Glow':
            bsdf.inputs['Emission Color'].default_value = (1.0, 0.45, 0.1, 1)
            bsdf.inputs['Emission Strength'].default_value = 8.0


if __name__ == '__main__':
    for name, fn, tang in (('palisade', palisade, False), ('campfire', campfire, False), ('beacon', beacon, False)):
        reset()
        ob = fn()
        export_glb(name, [ob], tangents=tang, colors=False)
    if '--preview' in sys.argv:
        reset()
        a = palisade()
        a.location = (-4.2, 0, 0)
        b = campfire()
        b.location = (-1.2, -2.2, 0)
        beacon()
        preview_materials()
        bpy.ops.mesh.primitive_plane_add(size=80)
        preview(os.path.join(TMP, 'structures_preview.png'), res=(1100, 900), cam_dir=(-0.55, -1, 0.3), samples=32, target=(-1.2, 0, 3.3), dist=14.5)
