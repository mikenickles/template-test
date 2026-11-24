"""Shared helpers for the headless Blender (bpy) asset pipeline."""
import math
import os
import random

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, '..', 'assets', 'models'))
TEX = os.path.normpath(os.path.join(HERE, '..', 'assets', 'textures'))
TMP = os.environ.get('TIMBERBOT_TMP', os.path.join(HERE, '_tmp'))
os.makedirs(MODELS, exist_ok=True)
os.makedirs(TEX, exist_ok=True)
os.makedirs(TMP, exist_ok=True)


def reset(samples=16):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import addon_utils
    addon_utils.enable('cycles')
    addon_utils.enable('io_scene_gltf2')
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_denoising = False
    s.render.threads_mode = 'AUTO'
    if s.world is None:
        s.world = bpy.data.worlds.new('World')
    return s


def srgb2lin(c):
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    return m


class MeshBuilder:
    """Accumulates verts / per-vertex uv, normal, colour / faces with material slots."""

    def __init__(self):
        self.v, self.uv, self.n, self.c = [], [], [], []
        self.f, self.fm = [], []
        self.mats = []

    def slot(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def add(self, verts, uvs, normals, colors, faces, mat):
        base = len(self.v)
        self.v.extend([tuple(p) for p in verts])
        self.uv.extend([tuple(p) for p in uvs])
        self.n.extend([tuple(p) for p in normals])
        self.c.extend([tuple(p) for p in colors])
        mi = self.slot(mat)
        for f in faces:
            self.f.append(tuple(base + i for i in f))
            self.fm.append(mi)
        return base

    def build(self, name, collection=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        nl = len(me.loops)
        li = np.zeros(nl, dtype=np.int32)
        me.loops.foreach_get('vertex_index', li)
        uv = np.asarray(self.uv, dtype=np.float32)[li]
        me.uv_layers.new(name='UVMap').data.foreach_set('uv', uv.ravel())
        col = np.asarray(self.c, dtype=np.float32)
        if col.shape[1] == 3:
            col = np.concatenate([col, np.ones((len(col), 1), np.float32)], 1)
        ca = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', col.ravel())
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.polygons.foreach_set('material_index', self.fm)
        for m in self.mats:
            me.materials.append(get_mat(m))
        nrm = np.asarray(self.n, dtype=np.float64)
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        me.normals_split_custom_set_from_vertices([tuple(x) for x in nrm])
        me.update()
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


def frames(pts):
    """Parallel-transport frames along a polyline. Returns tangents, normals, binormals."""
    pts = [Vector(p) for p in pts]
    T = []
    for i in range(len(pts)):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        T.append((b - a).normalized())
    ref = Vector((1, 0, 0)) if abs(T[0].x) < 0.9 else Vector((0, 1, 0))
    n = (ref - T[0] * ref.dot(T[0])).normalized()
    Ns, Bs = [], []
    for t in T:
        n = (n - t * n.dot(t))
        n = n.normalized() if n.length > 1e-6 else t.orthogonal().normalized()
        Ns.append(n.copy())
        Bs.append(t.cross(n).normalized())
    return T, Ns, Bs


def tube(mb, pts, radii, seg, mat, u_repeat=1.0, v_per_m=1.0, color=(1, 1, 1), rfun=None,
         cap_end=False, cap_start=False, cap_mat=None, v0=0.0, colors=None):
    """Sweep a circular (or rfun-modulated) section along pts. Returns end-of-tube v."""
    T, Ns, Bs = frames(pts)
    verts, uvs, nrm, cols, faces = [], [], [], [], []
    vv = v0
    for k, p in enumerate(pts):
        p = Vector(p)
        if k > 0:
            vv += (p - Vector(pts[k - 1])).length * v_per_m
        for j in range(seg + 1):
            a = 2 * math.pi * j / seg
            r = radii[k] * (rfun(k, a) if rfun else 1.0)
            d = Ns[k] * math.cos(a) + Bs[k] * math.sin(a)
            verts.append(p + d * r)
            uvs.append((j / seg * u_repeat, vv))
            nrm.append(d)
            cols.append(colors[k] if colors else color)
    for k in range(len(pts) - 1):
        for j in range(seg):
            a = k * (seg + 1) + j
            faces.append((a, a + 1, a + seg + 2, a + seg + 1))
    mb.add(verts, uvs, nrm, cols, faces, mat)
    for end, on in ((len(pts) - 1, cap_end), (0, cap_start)):
        if not on:
            continue
        p = Vector(pts[end])
        t = T[end] if end else -T[end]
        cv, cu, cn, cc = [p + t * radii[end] * 0.15], [(0.5, 0.5)], [t], [color]
        for j in range(seg):
            a = 2 * math.pi * j / seg
            r = radii[end] * (rfun(end, a) if rfun else 1.0)
            d = Ns[end] * math.cos(a) + Bs[end] * math.sin(a)
            cv.append(p + d * r)
            cu.append((0.5 + 0.48 * math.cos(a), 0.5 + 0.48 * math.sin(a)))
            cn.append((t + d * 0.25).normalized())
            cc.append(color)
        cf = [(0, 1 + j, 1 + (j + 1) % seg) if end else (0, 1 + (j + 1) % seg, 1 + j) for j in range(seg)]
        mb.add(cv, cu, cn, cc, cf, cap_mat or mat)
    return vv


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def export_glb(name, objs, tangents=False, colors=True):
    select_only(objs)
    path = os.path.join(MODELS, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_normals=True, export_texcoords=True, export_tangents=tangents,
        export_materials='EXPORT', export_image_format='NONE',
        export_vertex_color='ACTIVE' if colors else 'NONE', export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_animations=False, export_skins=False, export_morph=False, export_extras=True)
    tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type == 'MESH':
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
    print(f'[export] {name}.glb  {os.path.getsize(path) / 1024:.0f} KB  {tris} tris')
    return path


def preview(path, objs_bounds=None, res=(900, 700), cam_dir=(1.0, -1.6, 0.7), samples=24, sun=True, target=None, dist=None):
    """Quick lit Cycles preview render of the whole scene (pipeline QA aid, not shipped)."""
    s = bpy.context.scene
    s.render.film_transparent = False
    s.cycles.samples = samples
    s.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'AgX'
    w = s.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background') or w.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.55, 0.68, 0.9, 1)
    bg.inputs[1].default_value = 0.9
    out = w.node_tree.nodes.get('World Output') or w.node_tree.nodes.new('ShaderNodeOutputWorld')
    w.node_tree.links.new(bg.outputs[0], out.inputs[0])
    lo = None
    if sun:
        l = bpy.data.lights.new('pv_sun', 'SUN')
        l.energy = 4.0
        l.angle = 0.03
        l.color = (1.0, 0.86, 0.7)
        lo = bpy.data.objects.new('pv_sun', l)
        s.collection.objects.link(lo)
        lo.rotation_euler = (math.radians(58), 0, math.radians(120))
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    for o in s.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z)))
            mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    ctr = Vector(target) if target else (mn + mx) / 2
    size = (mx - mn).length
    cam = bpy.data.cameras.new('pv_cam')
    cam.lens = 50
    co = bpy.data.objects.new('pv_cam', cam)
    s.collection.objects.link(co)
    d = Vector(cam_dir).normalized()
    co.location = ctr + d * (dist or size * 1.25)
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.clip_end = 1000
    s.camera = co
    s.render.resolution_x, s.render.resolution_y = res
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co)
    if lo:
        bpy.data.objects.remove(lo)


def dilate_rgba(rgba, iters=40):
    """Bleed colour into fully transparent texels so mip-mapping never pulls in black."""
    rgb = rgba[..., :3].astype(np.float64)
    a = rgba[..., 3].astype(np.float64)
    known = a > 140.0
    rgb = rgb * known[..., None]
    w = known.astype(np.float64)
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        wacc = np.zeros_like(w)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            acc += np.roll(rgb, (dy, dx), (0, 1))
            wacc += np.roll(w, (dy, dx), (0, 1))
        fill = (w == 0) & (wacc > 0)
        rgb[fill] = acc[fill] / wacc[fill][:, None]
        w[fill] = 1
    avg = rgb[w > 0].mean(0) if (w > 0).any() else np.zeros(3)
    rgb[w == 0] = avg
    out = rgba.copy().astype(np.float64)
    out[..., :3] = rgb
    return out


rnd = random.Random
