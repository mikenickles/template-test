"""Timberbot: a ~1.6 m articulated harvesting robot.

Hard-surface parts are modelled from bevelled primitives, parented into a joint hierarchy
(pivots at the joints), UV-packed into a single atlas, and textured by Cycles-baking procedural
weathering shaders (brushed steel, chipped paint, edge wear, cavity grime) into
albedo / normal / AO-roughness-metalness maps.  Faces -Y in Blender => +Z in glTF/three.js.
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from PIL import Image
from mathutils import Euler, Matrix, Vector

from bl_common import TEX, TMP, export_glb, get_mat, preview, reset, select_only

RES = 2048
EMISSIVE = ('Robot_Visor', 'Robot_Lamp')


class Part:
    def __init__(self, name, pivot):
        self.name = name
        self.pivot = Vector(pivot)
        self.bm = bmesh.new()
        self.mats = []

    def _slot(self, mat):
        name = mat if mat in EMISSIVE else 'src_' + mat
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def _merge(self, tmp, mat, rot, center):
        mi = self._slot(mat)
        M = Matrix.Translation(Vector(center) - self.pivot) @ (Euler(rot).to_matrix().to_4x4() if rot else Matrix.Identity(4))
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

    def box(self, size, center, mat, bevel=0.012, rot=None, segs=2, shape=None):
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

    def cyl(self, r, depth, center, mat, axis='Z', verts=20, bevel=0.006, r2=None, rot=None, segs=2):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        if bevel > 0:
            caps = [f for f in tmp.faces if len(f.verts) > 4]
            edges = list({e for f in caps for e in f.edges})
            bmesh.ops.bevel(tmp, geom=edges, offset=bevel, segments=segs, profile=0.5, affect='EDGES')
        base = {'Z': (0, 0, 0), 'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0)}[axis]
        if rot is None:
            rot = base
        self._merge(tmp, mat, rot, center)

    def rod(self, p0, p1, r, mat, verts=12, bevel=0.003):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        rot = d.to_track_quat('Z', 'Y').to_euler()
        self.cyl(r, d.length, (p0 + p1) / 2, mat, verts=verts, bevel=bevel, rot=rot)

    def sphere(self, r, center, mat, scale=(1, 1, 1)):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=20, v_segments=12, radius=r)
        for v in tmp.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        self._merge(tmp, mat, None, center)

    def bolt(self, center, axis='Y', r=0.011, mat='metal'):
        self.cyl(r, 0.012, center, mat, axis=axis, verts=6, bevel=0.002, segs=1)

    def finish(self, parent=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        for m in self.mats:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = self.pivot - (parent['pivot'] if parent else Vector())
        if parent:
            ob.parent = parent['ob']
        select_only([ob])
        mod = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        mod.weight = 70
        bpy.ops.object.modifier_apply(modifier='wn')
        return dict(ob=ob, pivot=self.pivot)


def build_parts():
    parts = {}
    root = bpy.data.objects.new('Timberbot', None)
    bpy.context.scene.collection.objects.link(root)
    R = dict(ob=root, pivot=Vector())

    # ---------------------------------------------------------------- hips
    p = Part('Hips', (0, 0, 0.80))
    p.box((0.34, 0.20, 0.12), (0, 0, 0.80), 'dark', bevel=0.02)
    p.box((0.15, 0.035, 0.13), (0, -0.105, 0.795), 'paint', bevel=0.012, shape=lambda x, y, z: (x * (1 - 0.35 * (0.5 - z)), y, z))
    p.box((0.2, 0.03, 0.09), (0, 0.105, 0.80), 'metal', bevel=0.008)
    p.cyl(0.115, 0.03, (0, 0, 0.868), 'rubber', bevel=0.012)
    p.cyl(0.105, 0.03, (0, 0, 0.892), 'rubber', bevel=0.012)
    for sx in (-1, 1):
        p.cyl(0.062, 0.05, (sx * 0.195, 0, 0.78), 'metal', axis='X', bevel=0.008)
        p.bolt((sx * 0.05, -0.125, 0.83))
    parts['Hips'] = p.finish(R)

    # ---------------------------------------------------------------- torso
    p = Part('Torso', (0, 0, 0.90))
    taper = lambda x, y, z: (x * (0.86 + 0.14 * (z + 0.5)), y * (0.9 + 0.1 * (z + 0.5)), z)
    p.box((0.50, 0.32, 0.38), (0, 0, 1.105), 'metal', bevel=0.035, segs=3, shape=taper)
    p.box((0.40, 0.035, 0.20), (0, -0.168, 1.165), 'paint', bevel=0.014, shape=lambda x, y, z: (x * (0.9 + 0.1 * (z + 0.5)), y, z))
    p.box((0.36, 0.03, 0.055), (0, -0.165, 1.005), 'hazard', bevel=0.008)
    for i in range(5):                                             # chest intake grille
        p.box((0.16, 0.02, 0.012), (-0.085, -0.19, 1.105 + i * 0.026), 'dark', bevel=0.004, rot=(0.5, 0, 0), segs=1)
    p.box((0.19, 0.012, 0.15), (-0.085, -0.182, 1.158), 'dark', bevel=0.004, segs=1)
    p.box((0.13, 0.014, 0.07), (0.1, -0.19, 1.2), 'metal', bevel=0.005)            # name plate
    p.cyl(0.022, 0.02, (0.06, -0.19, 1.12), 'Robot_Lamp', axis='Y', bevel=0.004, verts=14)
    p.cyl(0.03, 0.014, (0.06, -0.186, 1.12), 'dark', axis='Y', bevel=0.003, verts=14)
    p.cyl(0.016, 0.02, (0.13, -0.19, 1.12), 'Robot_Lamp', axis='Y', bevel=0.004, verts=12)
    p.cyl(0.023, 0.014, (0.13, -0.186, 1.12), 'dark', axis='Y', bevel=0.003, verts=12)
    for sx in (-1, 1):
        for z in (1.08, 1.25):
            p.bolt((sx * 0.18, -0.19, z))
        p.cyl(0.085, 0.07, (sx * 0.262, 0, 1.20), 'dark', axis='X', bevel=0.012)   # shoulder sockets
        p.box((0.03, 0.2, 0.2), (sx * 0.235, 0.0, 1.03), 'paint', bevel=0.01)       # side armour
        p.rod((sx * 0.25, -0.07, 0.96), (sx * 0.25, 0.07, 0.96), 0.014, 'rubber')    # grab rail
        p.rod((sx * 0.235, -0.07, 0.96), (sx * 0.25, -0.07, 0.96), 0.012, 'dark')
        p.rod((sx * 0.235, 0.07, 0.96), (sx * 0.25, 0.07, 0.96), 0.012, 'dark')
    p.cyl(0.1, 0.045, (0, 0, 1.30), 'dark', bevel=0.012)                            # collar
    # backpack: resource hopper with exhaust stacks
    p.box((0.38, 0.17, 0.32), (0, 0.235, 1.10), 'paint', bevel=0.022, segs=3)
    p.box((0.30, 0.02, 0.2), (0, 0.325, 1.10), 'metal', bevel=0.006)
    p.box((0.34, 0.15, 0.025), (0, 0.235, 1.268), 'dark', bevel=0.006)
    for sx in (-1, 1):
        p.cyl(0.028, 0.26, (sx * 0.13, 0.30, 1.33), 'metal', bevel=0.004, verts=14)
        p.cyl(0.034, 0.03, (sx * 0.13, 0.30, 1.455), 'dark', bevel=0.005, verts=14)
        p.cyl(0.036, 0.02, (sx * 0.13, 0.30, 1.23), 'dark', bevel=0.004, verts=14)
        for z in (0.98, 1.22):
            p.bolt((sx * 0.13, 0.338, z))
    p.rod((-0.2, 0.12, 0.95), (-0.2, 0.2, 0.99), 0.016, 'rubber')                    # hoses
    p.rod((0.2, 0.12, 0.95), (0.2, 0.2, 0.99), 0.016, 'rubber')
    parts['Torso'] = p.finish(parts['Hips'])

    # ---------------------------------------------------------------- head
    p = Part('Head', (0, 0, 1.33))
    p.cyl(0.055, 0.06, (0, 0, 1.34), 'rubber', bevel=0.01)
    p.box((0.30, 0.26, 0.19), (0, -0.01, 1.455), 'paint', bevel=0.035, segs=3,
          shape=lambda x, y, z: (x * (1 - 0.1 * (z + 0.5)), y * (1 - 0.08 * (z + 0.5)), z))
    p.box((0.262, 0.03, 0.092), (0, -0.132, 1.462), 'dark', bevel=0.012)            # visor housing
    p.box((0.226, 0.014, 0.05), (0, -0.147, 1.462), 'Robot_Visor', bevel=0.006)
    p.box((0.28, 0.05, 0.022), (0, -0.14, 1.523), 'metal', bevel=0.007, rot=(-0.25, 0, 0))   # brow
    p.box((0.16, 0.15, 0.014), (0, 0.01, 1.553), 'metal', bevel=0.005)              # top hatch
    for sx in (-1, 1):
        p.cyl(0.052, 0.03, (sx * 0.156, 0.0, 1.455), 'metal', axis='X', bevel=0.007)
        p.cyl(0.028, 0.016, (sx * 0.175, 0.0, 1.455), 'dark', axis='X', bevel=0.004, verts=12)
        p.bolt((sx * 0.06, 0.06, 1.561), axis='Z', r=0.008)
        p.bolt((sx * 0.06, -0.04, 1.561), axis='Z', r=0.008)
    p.cyl(0.012, 0.016, (0.105, 0.07, 1.556), 'dark', bevel=0.003, verts=10)
    p.rod((0.105, 0.07, 1.555), (0.105, 0.075, 1.59), 0.0055, 'metal', verts=8, bevel=0.0)
    p.sphere(0.011, (0.105, 0.0755, 1.589), 'Robot_Lamp')
    p.box((0.1, 0.03, 0.03), (0, -0.13, 1.385), 'dark', bevel=0.006)                # jaw sensor
    parts['Head'] = p.finish(parts['Torso'])

    # ---------------------------------------------------------------- legs
    for side, sx in (('L', 1), ('R', -1)):
        x = sx * 0.135
        p = Part(f'Leg{side}_Thigh', (x, 0, 0.76))
        p.sphere(0.075, (x, 0, 0.76), 'dark', scale=(0.9, 1, 1))
        p.box((0.115, 0.13, 0.24), (x, 0, 0.61), 'metal', bevel=0.022, segs=3, shape=lambda a, b, c: (a * (1 + 0.15 * (c + 0.5)), b * (1 + 0.15 * (c + 0.5)), c))
        p.box((0.022, 0.115, 0.19), (x + sx * 0.062, 0, 0.615), 'paint', bevel=0.008)
        p.box((0.09, 0.03, 0.17), (x, -0.07, 0.615), 'paint', bevel=0.01)
        p.bolt((x + sx * 0.075, 0.03, 0.68), axis='X')
        p.bolt((x + sx * 0.075, -0.03, 0.55), axis='X')
        th = p.finish(parts['Hips'])
        p = Part(f'Leg{side}_Shin', (x, 0, 0.44))
        p.cyl(0.062, 0.15, (x, 0, 0.44), 'dark', axis='X', bevel=0.012)
        p.cyl(0.035, 0.165, (x, 0, 0.44), 'metal', axis='X', bevel=0.006, verts=14)
        p.box((0.105, 0.115, 0.26), (x, 0.0, 0.275), 'paint', bevel=0.022, segs=3, shape=lambda a, b, c: (a * (0.82 + 0.18 * (c + 0.5)), b * (0.8 + 0.2 * (c + 0.5)), c))
        p.box((0.11, 0.035, 0.11), (x, -0.068, 0.435), 'metal', bevel=0.012)        # knee guard
        p.rod((x, 0.075, 0.16), (x, 0.075, 0.40), 0.017, 'metal')                    # rear piston
        p.rod((x, 0.075, 0.13), (x, 0.075, 0.27), 0.024, 'dark')
        p.box((0.05, 0.03, 0.04), (x, 0.07, 0.40), 'dark', bevel=0.006)
        p.bolt((x + sx * 0.055, 0.0, 0.33), axis='X')
        sh = p.finish(th)
        p = Part(f'Leg{side}_Foot', (x, 0, 0.10))
        p.cyl(0.048, 0.14, (x, 0, 0.10), 'dark', axis='X', bevel=0.01)
        p.box((0.15, 0.30, 0.05), (x, -0.04, 0.026), 'rubber', bevel=0.014)
        p.box((0.135, 0.2, 0.06), (x, -0.01, 0.078), 'paint', bevel=0.016, shape=lambda a, b, c: (a * (1 - 0.15 * (c + 0.5)), b * (1 - 0.2 * (c + 0.5)), c))
        p.box((0.15, 0.09, 0.05), (x, -0.165, 0.052), 'metal', bevel=0.016)         # toe cap
        p.box((0.08, 0.06, 0.05), (x, 0.11, 0.06), 'dark', bevel=0.012)             # heel
        for k in range(3):
            p.box((0.156, 0.03, 0.02), (x, -0.13 + k * 0.1, 0.008), 'rubber', bevel=0.005, segs=1)   # tread lugs
        p.finish(sh)

    # ------------------------------------------------- right arm: harvesting arm
    x = -0.345
    p = Part('ArmR_Upper', (-0.335, 0, 1.20))
    p.sphere(0.085, (x, 0, 1.20), 'paint', scale=(0.85, 1.05, 1.0))
    p.box((0.095, 0.105, 0.22), (x, 0, 1.055), 'metal', bevel=0.02, segs=3)
    p.rod((x, 0.062, 1.12), (x, 0.062, 0.95), 0.016, 'metal')
    p.rod((x, 0.062, 1.14), (x, 0.062, 1.03), 0.024, 'dark')
    p.box((0.1, 0.03, 0.12), (x, -0.058, 1.06), 'paint', bevel=0.008)
    p.bolt((x - 0.05, 0, 1.11), axis='X')
    ua = p.finish(parts['Torso'])
    p = Part('ArmR_Fore', (x, 0, 0.92))
    p.cyl(0.056, 0.12, (x, 0, 0.92), 'dark', axis='X', bevel=0.012)
    p.cyl(0.03, 0.135, (x, 0, 0.92), 'metal', axis='X', bevel=0.006, verts=14)
    p.box((0.105, 0.115, 0.2), (x, 0, 0.795), 'paint', bevel=0.022, segs=3, shape=lambda a, b, c: (a * (0.8 + 0.2 * (c + 0.5)), b * (0.8 + 0.2 * (c + 0.5)), c))
    p.box((0.11, 0.02, 0.05), (x, -0.06, 0.84), 'hazard', bevel=0.005)
    p.rod((x - 0.045, 0.03, 0.88), (x - 0.045, 0.03, 0.72), 0.011, 'rubber')
    p.cyl(0.05, 0.035, (x, 0, 0.685), 'dark', bevel=0.008)
    fa = p.finish(ua)
    p = Part('ArmR_Tool', (x, 0, 0.67))
    p.cyl(0.036, 0.05, (x, 0, 0.65), 'metal', bevel=0.008)
    p.rod((x, 0, 0.64), (x, 0, 0.50), 0.022, 'dark')
    p.box((0.07, 0.07, 0.085), (x, 0, 0.525), 'dark', bevel=0.012)                 # head socket
    # axe blade: wedge that fans out and thins toward the cutting edge (-Y = forward)
    p.box((0.05, 0.17, 0.17), (x, -0.115, 0.525), 'blade', bevel=0.004, segs=1,
          shape=lambda a, b, c: (a * (0.08 + 0.92 * (b + 0.5)), b, c * (1.0 - 0.55 * (b + 0.5))))
    # pick spike on the back for stone
    p.cyl(0.026, 0.14, (x, 0.1, 0.525), 'blade', axis='Y', r2=0.004, bevel=0.0, verts=10, rot=(-math.pi / 2, 0, 0))
    p.bolt((x - 0.038, 0, 0.525), axis='X')
    p.bolt((x + 0.038, 0, 0.525), axis='X')
    p.finish(fa)

    # ------------------------------------------------------ left arm: grip clamp
    x = 0.34
    p = Part('ArmL_Upper', (0.335, 0, 1.20))
    p.sphere(0.078, (x, 0, 1.20), 'paint', scale=(0.85, 1.05, 1.0))
    p.box((0.08, 0.09, 0.22), (x, 0, 1.055), 'metal', bevel=0.018, segs=3)
    p.rod((x, 0.055, 1.12), (x, 0.055, 0.95), 0.013, 'metal')
    p.bolt((x + 0.043, 0, 1.11), axis='X')
    ua = p.finish(parts['Torso'])
    p = Part('ArmL_Fore', (x, 0, 0.92))
    p.cyl(0.05, 0.105, (x, 0, 0.92), 'dark', axis='X', bevel=0.01)
    p.box((0.085, 0.095, 0.2), (x, 0, 0.80), 'paint', bevel=0.018, segs=3, shape=lambda a, b, c: (a * (0.8 + 0.2 * (c + 0.5)), b * (0.8 + 0.2 * (c + 0.5)), c))
    p.cyl(0.04, 0.03, (x, 0, 0.69), 'dark', bevel=0.007)
    p.box((0.07, 0.05, 0.04), (x, 0, 0.66), 'metal', bevel=0.008)
    for sy in (-1, 1):                                                              # two-finger clamp
        p.box((0.05, 0.016, 0.09), (x, sy * 0.028, 0.60), 'dark', bevel=0.005, rot=(sy * 0.18, 0, 0))
        p.box((0.045, 0.014, 0.04), (x, sy * 0.022, 0.545), 'rubber', bevel=0.004, rot=(-sy * 0.5, 0, 0))
    p.finish(ua)
    return root


# ----------------------------------------------------------------- materials
KINDS = {
    #          base colour (linear)      metal rough  brushed chips rust
    'paint':  ((0.58, 0.235, 0.018),     0.0,  0.48,  0.0,    1.0,  0.0),
    'hazard': ((0.62, 0.42, 0.02),       0.0,  0.5,   0.0,    1.0,  0.0),
    'metal':  ((0.52, 0.53, 0.54),       1.0,  0.32,  1.0,    0.0,  0.35),
    'dark':   ((0.075, 0.08, 0.088),     1.0,  0.46,  0.5,    0.0,  0.2),
    'rubber': ((0.016, 0.016, 0.018),    0.0,  0.82,  0.0,    0.0,  0.0),
    'blade':  ((0.66, 0.67, 0.68),       1.0,  0.2,   1.0,    0.0,  0.12),
}


def src_material(kind):
    base, metal, rough, brushed, chips, rust = KINDS[kind]
    m = get_mat('src_' + kind)
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes.new, nt.links.new
    tc = N('ShaderNodeTexCoord')
    geo = N('ShaderNodeNewGeometry')

    def val(v):
        return v

    def noise(scale, detail=6.0, rough_=0.6, vec=None, sc3=None):
        t = N('ShaderNodeTexNoise')
        t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail
        t.inputs['Roughness'].default_value = rough_
        src = vec or tc.outputs['Object']
        if sc3:
            mp = N('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = sc3
            L(src, mp.inputs['Vector'])
            src = mp.outputs[0]
        L(src, t.inputs['Vector'])
        return t.outputs['Fac']

    def math_(op, a, b=None, clamp=False):
        x = N('ShaderNodeMath')
        x.operation = op
        x.use_clamp = clamp
        for sock, v in ((x.inputs[0], a), (x.inputs[1], b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                L(v, sock)
        return x.outputs[0]

    def ramp(src, p0, p1):
        r = N('ShaderNodeMapRange')
        r.interpolation_type = 'SMOOTHSTEP'
        r.inputs[1].default_value = p0
        r.inputs[2].default_value = p1
        L(src, r.inputs[0])
        return r.outputs[0]

    def mix(a, b, fac, blend='MIX'):
        x = N('ShaderNodeMixRGB')
        x.blend_type = blend
        for sock, v in ((x.inputs[1], a), (x.inputs[2], b), (x.inputs[0], fac)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = (*v, 1) if len(v) == 3 else v
            else:
                L(v, sock)
        return x.outputs[0]

    g = lambda v: (v, v, v)
    # ---- masks
    bev = N('ShaderNodeBevel')
    bev.samples = 4
    bev.inputs['Radius'].default_value = 0.018
    dot = N('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    L(bev.outputs[0], dot.inputs[0])
    L(geo.outputs['Normal'], dot.inputs[1])
    edge = ramp(math_('SUBTRACT', 1.0, dot.outputs['Value']), 0.004, 0.09)
    n_big = noise(7.0, 6.0, 0.65)
    n_mid = noise(38.0, 5.0, 0.7)
    n_fine = noise(160.0, 3.0, 0.6)
    wear = ramp(math_('ADD', math_('MULTIPLY', edge, 1.5), math_('MULTIPLY', math_('SUBTRACT', n_mid, 0.5), 1.1)), 0.52, 0.72)
    spots = ramp(math_('ADD', n_big, math_('MULTIPLY', n_mid, 0.35)), 0.83, 0.9)          # random paint chips
    ao = N('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = 0.09
    cavity = ramp(math_('ADD', math_('SUBTRACT', 1.0, ao.outputs['AO']), math_('MULTIPLY', math_('SUBTRACT', n_big, 0.5), 0.5)), 0.22, 0.62)
    pos = N('ShaderNodeSeparateXYZ')
    L(geo.outputs['Position'], pos.inputs[0])
    low = ramp(math_('ADD', pos.outputs['Z'], math_('MULTIPLY', n_big, 0.25)), 0.62, 0.12)   # dust/mud climbs the legs
    dust = math_('MULTIPLY', low, ramp(n_mid, 0.3, 0.75))
    streak = noise(6.0, 4.0, 0.5, sc3=(1.0, 1.0, 0.012) if kind != 'blade' else (1.0, 0.012, 1.0))
    streak_f = noise(60.0, 2.0, 0.5, sc3=(1.0, 1.0, 0.01) if kind != 'blade' else (1.0, 0.01, 1.0))
    scratch = ramp(noise(14.0, 2.0, 0.4, sc3=(1.0, 0.04, 1.0)), 0.7, 0.74)
    rustm = ramp(math_('ADD', n_big, math_('MULTIPLY', cavity, 0.35)), 0.74, 0.86)

    # ---- colour
    col = mix(base, (base[0] * 0.55, base[1] * 0.5, base[2] * 0.5), ramp(n_big, 0.35, 0.8), 'MIX')     # sun fade / stain
    col = mix(col, g(1.0), math_('MULTIPLY', n_fine, 0.08), 'OVERLAY')
    if kind == 'hazard':
        wv = N('ShaderNodeTexWave')
        wv.bands_direction = 'DIAGONAL'
        wv.inputs['Scale'].default_value = 9.0
        mp = N('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.0, 0.0, 1.0)
        L(tc.outputs['Object'], mp.inputs['Vector'])
        L(mp.outputs[0], wv.inputs['Vector'])
        col = mix(col, (0.012, 0.012, 0.013), ramp(wv.outputs['Fac'], 0.48, 0.52))
    met = metal
    rgh = rough
    if brushed:
        col = mix(col, g(1.0), math_('MULTIPLY', math_('SUBTRACT', streak_f, 0.5), 0.5 * brushed), 'OVERLAY')
        col = mix(col, g(0.75), math_('MULTIPLY', streak, 0.25 * brushed), 'MULTIPLY')
    metal_s = mix(g(metal), g(metal), 0.0)
    rough_s = mix(g(rough), g(min(1.0, rough + 0.22)), math_('ADD', math_('MULTIPLY', streak_f, 0.6 * max(brushed, 0.3)), math_('MULTIPLY', n_mid, 0.4)))
    if chips:                                                    # paint chipped down to primer / bare steel
        chip = math_('MAXIMUM', wear, spots)
        prim = ramp(math_('ADD', math_('MULTIPLY', edge, 1.2), math_('MULTIPLY', math_('SUBTRACT', n_mid, 0.5), 1.1)), 0.42, 0.56)
        col = mix(col, (0.19, 0.17, 0.15), prim)
        col = mix(col, (0.5, 0.5, 0.5), chip)
        metal_s = mix(metal_s, g(1.0), chip)
        rough_s = mix(rough_s, g(0.36), chip)
    else:
        col = mix(col, g(0.85), math_('MULTIPLY', wear, 0.5 if metal else 0.15), 'SCREEN')           # polished edges
        rough_s = mix(rough_s, g(max(0.12, rough - 0.14)), wear)
    col = mix(col, g(0.8), math_('MULTIPLY', scratch, 0.35), 'SCREEN' if metal or chips else 'MIX')
    rough_s = mix(rough_s, g(0.3), math_('MULTIPLY', scratch, 0.6))
    if rust:
        rc = mix((0.16, 0.06, 0.02), (0.07, 0.03, 0.015), n_mid)
        col = mix(col, rc, math_('MULTIPLY', rustm, rust * 1.6, clamp=True))
        metal_s = mix(metal_s, g(0.0), math_('MULTIPLY', rustm, rust * 1.6, clamp=True))
        rough_s = mix(rough_s, g(0.88), math_('MULTIPLY', rustm, rust * 1.6, clamp=True))
    grime = math_('MULTIPLY', cavity, 0.85)
    col = mix(col, (0.028, 0.022, 0.017), grime)
    metal_s = mix(metal_s, g(0.0), grime)
    rough_s = mix(rough_s, g(0.92), grime)
    col = mix(col, (0.19, 0.15, 0.1), math_('MULTIPLY', dust, 0.75))
    metal_s = mix(metal_s, g(0.0), math_('MULTIPLY', dust, 0.75))
    rough_s = mix(rough_s, g(0.95), math_('MULTIPLY', dust, 0.75))

    # ---- relief
    h = math_('ADD', math_('MULTIPLY', streak_f, 0.25 * brushed), math_('MULTIPLY', n_fine, 0.12))
    h = math_('ADD', h, math_('MULTIPLY', n_mid, 0.25 if kind == 'rubber' else 0.06))
    if chips:
        h = math_('SUBTRACT', h, math_('MULTIPLY', math_('MAXIMUM', wear, spots), 0.7))
    h = math_('SUBTRACT', h, math_('MULTIPLY', scratch, 0.5))
    if rust:
        h = math_('ADD', h, math_('MULTIPLY', math_('MULTIPLY', rustm, n_mid), 0.8))
    bump = N('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    bump.inputs['Distance'].default_value = 0.0018
    L(h, bump.inputs['Height'])
    bev2 = N('ShaderNodeBevel')
    bev2.samples = 4
    bev2.inputs['Radius'].default_value = 0.004
    L(bev2.outputs[0], bump.inputs['Normal'])
    bsdf = N('ShaderNodeBsdfPrincipled')
    L(col, bsdf.inputs['Base Color'])
    L(rough_s, bsdf.inputs['Roughness'])
    L(metal_s, bsdf.inputs['Metallic'])
    L(bump.outputs[0], bsdf.inputs['Normal'])
    em = N('ShaderNodeEmission')
    out = N('ShaderNodeOutputMaterial')
    L(bsdf.outputs[0], out.inputs[0])
    tex = N('ShaderNodeTexImage')
    nt.nodes.active = tex
    return dict(nt=nt, bsdf=bsdf, em=em, out=out, color=col, rough=rough_s, metal=metal_s, tex=tex)


def build():
    s = reset()
    root = build_parts()
    meshes = [o for o in s.objects if o.type == 'MESH']
    # --- one shared UV atlas
    select_only(meshes)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=0.0035, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # --- source shaders
    src = {k: src_material(k) for k in KINDS}
    dummy = bpy.data.images.new('dummy', 8, 8)
    for name in EMISSIVE:
        m = get_mat(name)
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = dummy
        m.node_tree.nodes.active = t
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    ground = bpy.context.object
    baked = {}
    for kind in ('color', 'rough', 'metal', 'normal', 'ao'):
        res = RES // 2 if kind == 'ao' else RES              # AO is low-frequency: bake at half res, upscale
        img = bpy.data.images.new(f'robot_{kind}', res, res, alpha=False)
        img.colorspace_settings.name = 'sRGB' if kind == 'color' else 'Non-Color'
        for sm in src.values():
            sm['tex'].image = img
            L = sm['nt'].links.new
            if kind in ('normal', 'ao'):
                L(sm['bsdf'].outputs[0], sm['out'].inputs[0])
            else:
                L(sm[kind], sm['em'].inputs[0])
                L(sm['em'].outputs[0], sm['out'].inputs[0])
        s.cycles.samples = {'color': 8, 'rough': 4, 'metal': 4, 'normal': 8, 'ao': 16}[kind]
        ground.hide_render = kind != 'ao'
        select_only(meshes)
        bpy.ops.object.bake(type={'normal': 'NORMAL', 'ao': 'AO'}.get(kind, 'EMIT'), margin=4 if kind == 'ao' else 8, use_clear=True, normal_space='TANGENT')
        path = os.path.join(TMP, f'robot_{kind}.png')
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        baked[kind] = np.asarray(Image.open(path).convert('RGB').resize((RES, RES), Image.BILINEAR), dtype=np.float64)
        print('[bake] robot', kind, flush=True)
    bpy.data.objects.remove(ground)
    ao = np.clip(baked['ao'][..., 0] / 255.0 * 1.2, 0, 1)
    Image.fromarray(baked['color'].astype(np.uint8)).save(os.path.join(TEX, 'robot_albedo.webp'), quality=92, method=6)
    Image.fromarray(baked['normal'].astype(np.uint8)).save(os.path.join(TEX, 'robot_normal.webp'), quality=93, method=6)
    orm = np.stack([ao * 255, baked['rough'][..., 1], baked['metal'][..., 1]], -1)
    Image.fromarray(orm.astype(np.uint8)).save(os.path.join(TEX, 'robot_orm.webp'), quality=92, method=6)
    # --- swap every baked source slot for the single runtime material
    body = get_mat('Robot_Body')
    for o in meshes:
        for slot in o.material_slots:
            if slot.material.name.startswith('src_'):
                slot.material = body
    export_glb('timberbot', [root] + meshes, tangents=True, colors=False)
    zs = [(o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box]
    print(f'[robot] height {max(zs):.3f} m, min z {min(zs):.3f}')
    return root, meshes


def apply_preview_materials():
    body = bpy.data.materials['Robot_Body']
    nt = body.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(os.path.join(TEX, 'robot_albedo.webp'))
    nt.links.new(t.outputs[0], bsdf.inputs['Base Color'])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(os.path.join(TEX, 'robot_normal.webp'))
    t.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(t.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(os.path.join(TEX, 'robot_orm.webp'))
    t.image.colorspace_settings.name = 'Non-Color'
    sp = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t.outputs[0], sp.inputs[0])
    nt.links.new(sp.outputs[1], bsdf.inputs['Roughness'])
    nt.links.new(sp.outputs[2], bsdf.inputs['Metallic'])
    for name, colr in (('Robot_Visor', (0.1, 0.9, 1.0, 1)), ('Robot_Lamp', (1.0, 0.5, 0.1, 1))):
        m = bpy.data.materials[name]
        b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Emission Color'].default_value = colr
        b.inputs['Emission Strength'].default_value = 6.0


if __name__ == '__main__':
    build()
    if '--preview' in sys.argv:
        apply_preview_materials()
        bpy.ops.mesh.primitive_plane_add(size=30)
        preview(os.path.join(TMP, 'robot_front.png'), res=(800, 1000), cam_dir=(-0.75, -1, 0.3), samples=48, target=(0, 0, 0.82), dist=3.3)
        preview(os.path.join(TMP, 'robot_back.png'), res=(800, 1000), cam_dir=(0.8, 1, 0.35), samples=48, target=(0, 0, 0.82), dist=3.3)
