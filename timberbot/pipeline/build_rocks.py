"""Mossy boulders: sculpt a high-poly rock (chiselled + noise-displaced icosphere), decimate to a
game mesh, then Cycles-bake the high-poly + its procedural rock/moss shader down to the low-poly:
albedo, tangent-space normal, and AO/roughness.  Exports GLB with MikkTSpace tangents."""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from PIL import Image
from mathutils import Vector, noise

from bl_common import TEX, TMP, export_glb, get_mat, preview, reset, select_only

RES = 1024


def sculpt(seed, squash=(1.0, 0.85, 0.7), planes=18, subdiv=6):
    rng = random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=0.5)
    ob = bpy.context.object
    me = ob.data
    n = len(me.vertices)
    v = np.zeros(n * 3)
    me.vertices.foreach_get('co', v)
    v = v.reshape(-1, 3) * np.array(squash)
    # low-frequency lumps
    off = Vector((seed * 3.1, seed * 1.7, seed * 0.3))
    for i in range(n):
        p = Vector(v[i])
        d = noise.fractal(p * 1.6 + off, 1.0, 2.0, 3) * 0.16
        v[i] += np.array(p.normalized()) * d
    # chisel with random planes -> flat facets and hard fracture edges
    for k in range(planes):
        nv = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.35, 1.0))).normalized()
        d = rng.uniform(0.3, 0.45) * (0.6 + 0.4 * abs(nv.x * squash[0]) + 0.0)
        d = min(d, 0.5 * min(squash) * rng.uniform(0.75, 1.0) + 0.1 * abs(nv.z))
        s = v @ np.array(nv) - d
        m = s > 0
        v[m] -= np.outer(s[m], np.array(nv)) * 0.93
    me.vertices.foreach_set('co', v.ravel())
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(2):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for vert in bm.verts:                                 # medium + fine surface breakup
        p = vert.co
        d = noise.fractal(p * 5.0 + off, 1.0, 2.0, 5) * 0.022
        d += (noise.ridged_multi_fractal(p * 9.0 + off, 1.0, 2.0, 3, 1.0, 2.0) - 1.0) * 0.006
        vert.co = p + vert.normal * d
    zmin = min(vert.co.z for vert in bm.verts)
    zmax = max(vert.co.z for vert in bm.verts)
    cut = zmin + (zmax - zmin) * 0.16                      # flat base, buried below ground level
    for vert in bm.verts:
        if vert.co.z < cut:
            vert.co.z = cut - (cut - vert.co.z) * 0.15
    xs = [vert.co.x for vert in bm.verts]
    ys = [vert.co.y for vert in bm.verts]
    k = 1.0 / max(max(xs) - min(xs), max(ys) - min(ys))   # normalise to exactly 1 m wide
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for vert in bm.verts:
        vert.co = Vector(((vert.co.x - cx) * k, (vert.co.y - cy) * k, (vert.co.z - cut) * k - 0.06))
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    return ob


def rock_material(name, seed):
    m = get_mat(name)
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    tc = N('ShaderNodeTexCoord')
    mp = N('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (seed * 1.3, seed * 0.7, seed * 2.1)
    L(tc.outputs['Object'], mp.inputs['Vector'])

    def noise_tex(scale, detail=8.0, rough=0.6, vec=None):
        t = N('ShaderNodeTexNoise')
        t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail
        t.inputs['Roughness'].default_value = rough
        L(vec or mp.outputs[0], t.inputs['Vector'])
        return t

    def ramp(src, stops):
        r = N('ShaderNodeValToRGB')
        el = r.color_ramp.elements
        el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
        el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
        for pos, c in stops[1:-1]:
            e = el.new(pos)
            e.color = (*c, 1)
        L(src, r.inputs[0])
        return r

    def mix(a, b, fac, blend='MIX'):
        x = N('ShaderNodeMixRGB')
        x.blend_type = blend
        for sock, val in ((x.inputs[1], a), (x.inputs[2], b), (x.inputs[0], fac)):
            if isinstance(val, (float, int)):
                sock.default_value = val
            elif isinstance(val, tuple):
                sock.default_value = (*val, 1)
            else:
                L(val, sock)
        return x

    def math_node(op, a, b=None, clamp=False):
        x = N('ShaderNodeMath')
        x.operation = op
        x.use_clamp = clamp
        for sock, val in ((x.inputs[0], a), (x.inputs[1], b)):
            if val is None:
                continue
            if isinstance(val, (float, int)):
                sock.default_value = val
            else:
                L(val, sock)
        return x

    n1 = noise_tex(3.0, 9.0, 0.62)
    n2 = noise_tex(18.0, 6.0, 0.7)
    n3 = noise_tex(90.0, 3.0, 0.6)
    base = ramp(n1.outputs['Fac'], [(0.28, (0.085, 0.078, 0.07)), (0.48, (0.17, 0.16, 0.145)), (0.62, (0.25, 0.225, 0.19)), (0.78, (0.36, 0.34, 0.31))])
    speck = mix(base.outputs[0], (0.5, 0.48, 0.44), math_node('MULTIPLY', n3.outputs['Fac'], 0.35).outputs[0], 'OVERLAY')
    tone = mix(speck.outputs[0], (0.11, 0.095, 0.08), math_node('MULTIPLY', n2.outputs['Fac'], 0.55).outputs[0], 'MULTIPLY')
    # strata bands
    wave = N('ShaderNodeTexWave')
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 5.0
    wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 4.0
    wave.inputs['Detail Scale'].default_value = 1.5
    L(mp.outputs[0], wave.inputs['Vector'])
    band = mix(tone.outputs[0], (0.3, 0.25, 0.2), math_node('MULTIPLY', wave.outputs['Fac'], 0.3).outputs[0], 'SOFT_LIGHT')
    # cracks
    vor = N('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = 4.5
    warp = mix(mp.outputs[0], noise_tex(4.0, 4.0).outputs['Color'], 0.12)
    L(warp.outputs[0], vor.inputs['Vector'])
    crack = ramp(vor.outputs['Distance'], [(0.0, (0, 0, 0)), (0.035, (1, 1, 1))])
    cracked = mix((0.03, 0.027, 0.024), band.outputs[0], crack.outputs[0])
    # lichen spots
    lich = ramp(noise_tex(11.0, 5.0, 0.55).outputs['Fac'], [(0.62, (0, 0, 0)), (0.66, (1, 1, 1))])
    lichen = mix(cracked.outputs[0], (0.38, 0.37, 0.2), math_node('MULTIPLY', lich.outputs[0], 0.45).outputs[0])
    # moss: grows on up-facing surfaces, broken up by noise
    geo = N('ShaderNodeNewGeometry')
    sep = N('ShaderNodeSeparateXYZ')
    L(geo.outputs['Normal'], sep.inputs[0])
    mn = noise_tex(6.0, 6.0, 0.6)
    mval = math_node('ADD', sep.outputs['Z'], math_node('MULTIPLY', math_node('SUBTRACT', mn.outputs['Fac'], 0.5).outputs[0], 1.3).outputs[0])
    moss_mask = ramp(mval.outputs[0], [(0.42, (0, 0, 0)), (0.7, (1, 1, 1))])
    moss_col = ramp(noise_tex(45.0, 4.0, 0.7).outputs['Fac'], [(0.3, (0.028, 0.055, 0.012)), (0.55, (0.075, 0.13, 0.025)), (0.75, (0.16, 0.22, 0.05))])
    mossy = mix(lichen.outputs[0], moss_col.outputs[0], moss_mask.outputs[0])
    # damp earth where the rock meets the ground
    pos = N('ShaderNodeSeparateXYZ')
    L(tc.outputs['Object'], pos.inputs[0])
    dirt = ramp(math_node('ADD', pos.outputs['Z'], math_node('MULTIPLY', n2.outputs['Fac'], 0.08).outputs[0]).outputs[0],
                [(0.02, (1, 1, 1)), (0.16, (0, 0, 0))])
    final_col = mix(mossy.outputs[0], (0.06, 0.045, 0.03), math_node('MULTIPLY', dirt.outputs[0], 0.75).outputs[0])
    rough = math_node('ADD', math_node('MULTIPLY', n2.outputs['Fac'], 0.18).outputs[0], 0.72)
    rough = mix(rough.outputs[0], (0.96, 0.96, 0.96), moss_mask.outputs[0])
    # micro relief
    h = math_node('ADD', math_node('MULTIPLY', noise_tex(30.0, 10.0, 0.7).outputs['Fac'], 0.6).outputs[0],
                  math_node('MULTIPLY', crack.outputs[0], 0.5).outputs[0])
    h = math_node('ADD', h.outputs[0], math_node('MULTIPLY', math_node('MULTIPLY', noise_tex(160.0, 2.0).outputs['Fac'], moss_mask.outputs[0]).outputs[0], 0.5).outputs[0])
    bump = N('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.55
    bump.inputs['Distance'].default_value = 0.012
    L(h.outputs[0], bump.inputs['Height'])
    bsdf = N('ShaderNodeBsdfPrincipled')
    L(final_col.outputs[0], bsdf.inputs['Base Color'])
    L(rough.outputs[0], bsdf.inputs['Roughness'])
    L(bump.outputs[0], bsdf.inputs['Normal'])
    em = N('ShaderNodeEmission')
    out = N('ShaderNodeOutputMaterial')
    L(bsdf.outputs[0], out.inputs[0])
    return dict(mat=m, nt=nt, bsdf=bsdf, em=em, out=out, color=final_col.outputs[0], rough=rough.outputs[0])


def bake_rock(name, seed, **kw):
    s = reset()
    hi = sculpt(seed, **kw)
    hi.name = name + '_hi'
    rm = rock_material(name + '_src', seed)
    hi.data.materials.append(rm['mat'])
    # low poly
    lo = hi.copy()
    lo.data = hi.data.copy()
    lo.name = name
    s.collection.objects.link(lo)
    lo.data.materials.clear()
    select_only([lo])
    mod = lo.modifiers.new('dec', 'DECIMATE')
    mod.ratio = 1300 / len(lo.data.polygons)
    bpy.ops.object.modifier_apply(modifier='dec')
    lo.data.polygons.foreach_set('use_smooth', [True] * len(lo.data.polygons))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    gm = get_mat(name.replace('boulder_', 'Boulder_').replace('_a', '_A').replace('_b', '_B').replace('_c', '_C'))
    lo.data.materials.append(gm)
    nt = gm.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    nt.nodes.active = tex
    # ground plane so the AO bake darkens the contact zone
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    ground = bpy.context.object
    out_imgs = {}
    for kind in ('normal', 'color', 'rough', 'ao'):
        img = bpy.data.images.new(f'{name}_{kind}', RES, RES, alpha=False)
        img.colorspace_settings.name = 'sRGB' if kind == 'color' else 'Non-Color'
        tex.image = img
        L = rm['nt'].links.new
        if kind in ('normal', 'ao'):
            L(rm['bsdf'].outputs[0], rm['out'].inputs[0])
        else:
            L(rm[kind], rm['em'].inputs[0])
            L(rm['em'].outputs[0], rm['out'].inputs[0])
        s.cycles.samples = 48 if kind == 'ao' else 6
        ground.hide_render = kind != 'ao'
        select_only([lo])
        hi.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.bake(type={'normal': 'NORMAL', 'color': 'EMIT', 'rough': 'EMIT', 'ao': 'AO'}[kind],
                            use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.12,
                            margin=16, use_clear=True, normal_space='TANGENT')
        path = os.path.join(TMP, f'{name}_{kind}.png')
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        out_imgs[kind] = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    ao = np.clip(out_imgs['ao'][..., 0] / 255.0 * 1.25, 0, 1)
    alb = out_imgs['color'] * (0.8 + 0.2 * ao[..., None])       # a touch of baked cavity shading
    Image.fromarray(alb.astype(np.uint8)).save(os.path.join(TEX, f'{name}_albedo.webp'), quality=90, method=6)
    Image.fromarray(out_imgs['normal'].astype(np.uint8)).save(os.path.join(TEX, f'{name}_normal.webp'), quality=92, method=6)
    orm = np.stack([ao * 255, out_imgs['rough'][..., 1], np.zeros_like(ao)], -1)
    Image.fromarray(orm.astype(np.uint8)).save(os.path.join(TEX, f'{name}_orm.webp'), quality=90, method=6)
    bpy.data.objects.remove(hi)
    bpy.data.objects.remove(ground)
    export_glb(name, [lo], tangents=True, colors=False)
    return lo, gm


def preview_scene(names):
    reset()
    x = 0
    for name in names:
        bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(TEX), 'models', name + '.glb'))
        ob = bpy.context.selected_objects[0]
        ob.location.x = x
        ob.scale = (2, 2, 2)
        x += 2.6
        m = ob.data.materials[0]
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        for kind, sock in (('albedo', 'Base Color'), ('normal', None), ('orm', None)):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = bpy.data.images.load(os.path.join(TEX, f'{name}_{kind}.webp'))
            if kind == 'albedo':
                nt.links.new(t.outputs[0], bsdf.inputs['Base Color'])
            elif kind == 'normal':
                t.image.colorspace_settings.name = 'Non-Color'
                nm = nt.nodes.new('ShaderNodeNormalMap')
                nt.links.new(t.outputs[0], nm.inputs['Color'])
                nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
            else:
                t.image.colorspace_settings.name = 'Non-Color'
                sp = nt.nodes.new('ShaderNodeSeparateColor')
                nt.links.new(t.outputs[0], sp.inputs[0])
                nt.links.new(sp.outputs[1], bsdf.inputs['Roughness'])
    bpy.ops.mesh.primitive_plane_add(size=60)
    preview(os.path.join(TMP, 'rocks_preview.png'), res=(1500, 560), cam_dir=(0.25, -1, 0.35), samples=32, target=(2.6, 0, 0.6), dist=8.5)


VARIANTS = [
    ('boulder_a', 3, dict(squash=(1.0, 0.86, 0.74), planes=18)),
    ('boulder_b', 7, dict(squash=(1.0, 0.72, 0.5), planes=14)),
    ('boulder_c', 12, dict(squash=(0.9, 0.82, 0.95), planes=24)),
]

if __name__ == '__main__':
    for name, seed, kw in VARIANTS:
        bake_rock(name, seed, **kw)
    if '--preview' in sys.argv:
        preview_scene([v[0] for v in VARIANTS])
