# REGOLITH asset pipeline — modelling helpers on top of Blender (bpy/bmesh).
# Everything is authored in GAME coordinates (x right, y up, -z forward, metres); Blender only models, bevels,
# cuts and bakes ambient occlusion, so its own up-axis never matters.
import bpy, bmesh, math, json, struct
from mathutils import Vector, Matrix, Euler

def hexc(h): return ((h >> 16) & 255, (h >> 8) & 255, h & 255)
def s2l(c): c /= 255.0; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def l2s(v): v = max(0.0, min(1.0, v)); return round(255 * (v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055))

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    return sc

class Model:
    """Collects parts (Blender objects with modifiers) plus per-part colour / material / skin weights."""
    def __init__(self, name):
        self.name = name; self.parts = []; self.cutters = []; self.points = {}; self.bones = []; self.n = 0
        self.d = dict(col=0x808080, mat='hard', bone=None, smooth=False, bevel=0.0, seg=1, w=None)
    def defaults(self, **k): self.d.update(k); return self
    # ---- object plumbing
    def _obj(self, bm, k):
        o = dict(self.d); o.update(k)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new('m%d' % self.n); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('p%d' % self.n, me); bpy.context.collection.objects.link(ob); self.n += 1
        if o['bevel'] > 0:
            m = ob.modifiers.new('bev', 'BEVEL'); m.width = o['bevel']; m.segments = o['seg']; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(o.get('bevel_angle', 32))
            m.harden_normals = False
        part = dict(ob=ob, col=o['col'], mat=o['mat'], bone=o['bone'], smooth=o['smooth'], w=o['w'], cut_first=o.get('cut_first', True))
        if not o.get('cutter'): self.parts.append(part)
        else: ob.display_type = 'WIRE'; ob.hide_render = True; self.cutters.append(ob)
        return part if not o.get('cutter') else ob
    def cut(self, part, *cutters):
        ob = part['ob']
        for c in cutters:
            m = ob.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
            # booleans run before the bevel so the cut edges get chamfered too
            if part.get('cut_first') and 'bev' in ob.modifiers:
                idx = ob.modifiers.find(m.name)
                with bpy.context.temp_override(object=ob): bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        return part
    @staticmethod
    def _xf(bm, at=(0, 0, 0), rot=(0, 0, 0), scale=None):
        M = Matrix.Translation(Vector(at)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
        if scale: M = M @ Matrix.Diagonal((*scale, 1))
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts[:])
    # ---- primitives
    def box(self, w, h, d, at=(0, 0, 0), rot=(0, 0, 0), taper=None, **k):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co.x *= w; v.co.y *= h; v.co.z *= d
            if taper:  # (sx_top, sz_top[, sx_bot, sz_bot])
                t = taper if v.co.y > 0 else (taper[2:] if len(taper) > 2 else (1, 1)); v.co.x *= t[0]; v.co.z *= t[1]
        self._xf(bm, at, rot); return self._obj(bm, k)
    def hull(self, pts, at=(0, 0, 0), rot=(0, 0, 0), mirror=False, **k):
        bm = bmesh.new(); P = [Vector(p) for p in pts]
        if mirror: P += [Vector((-p.x, p.y, p.z)) for p in P if abs(p.x) > 1e-6]
        for p in P: bm.verts.new(p)
        r = bmesh.ops.convex_hull(bm, input=bm.verts[:])
        junk = list({e for e in r.get('geom_interior', []) + r.get('geom_unused', []) if isinstance(e, bmesh.types.BMVert)})
        if junk: bmesh.ops.delete(bm, geom=junk, context='VERTS')
        self._xf(bm, at, rot); return self._obj(bm, k)
    def loft(self, rings, seg=12, cap=True, **k):
        """rings: list of (centre, u, v) — vertex i = c + u cos(a) + v sin(a)."""
        bm = bmesh.new(); R = []
        for c, u, v in rings:
            c, u, v = Vector(c), Vector(u), Vector(v)
            R.append([bm.verts.new(c + u * math.cos(i / seg * math.tau) + v * math.sin(i / seg * math.tau)) for i in range(seg)])
        for a, b in zip(R, R[1:]):
            for i in range(seg): bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
        if cap: bm.faces.new(R[0]); bm.faces.new(R[-1])
        self._xf(bm, k.pop('at', (0, 0, 0)), k.pop('rot', (0, 0, 0))); return self._obj(bm, k)
    def rings_y(self, spec, **k):  # spec: (y, rx, rz[, cx, cz])
        return self.loft([((s[3] if len(s) > 3 else 0, s[0], s[4] if len(s) > 4 else 0), (s[1], 0, 0), (0, 0, s[2])) for s in spec], **k)
    def rings_z(self, spec, **k):  # spec: (z, rx, ry[, cx, cy])
        return self.loft([((s[3] if len(s) > 3 else 0, s[4] if len(s) > 4 else 0, s[0]), (s[1], 0, 0), (0, s[2], 0)) for s in spec], **k)
    def cyl(self, r, length, axis='z', at=(0, 0, 0), r2=None, seg=14, **k):
        r2 = r if r2 is None else r2; h = length / 2
        ax = {'x': ((-h, 0, 0), (h, 0, 0), (0, 1, 0), (0, 0, 1)), 'y': ((0, -h, 0), (0, h, 0), (1, 0, 0), (0, 0, 1)), 'z': ((0, 0, -h), (0, 0, h), (1, 0, 0), (0, 1, 0))}[axis]
        a, b, u, v = [Vector(q) for q in ax]; at = Vector(at)
        k.setdefault('smooth', True)
        return self.loft([(at + a, u * r, v * r), (at + b, u * r2, v * r2)], seg=seg, **k)
    def tube(self, pts, radii, seg=8, flat=1.0, **k):
        """round tube along a polyline (parallel-transported frames); flat squashes the second axis."""
        P = [Vector(p) for p in pts]; rings = []; n = None
        for i, p in enumerate(P):
            t = ((P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)])).normalized()
            if n is None: n = t.orthogonal().normalized()
            n = (n - t * n.dot(t)).normalized(); b = t.cross(n)
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            rings.append((p, n * r, b * r * flat))
        k.setdefault('smooth', True); return self.loft(rings, seg=seg, **k)
    def sphere(self, r, at=(0, 0, 0), scale=(1, 1, 1), sub=2, clips=(), **k):
        """icosphere; clips = [(point, normal)] planes — geometry on the normal side is removed and capped."""
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
        for v in bm.verts: v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
        for co, no in clips: clip(bm, co, no)
        self._xf(bm, at); return self._obj(bm, k)
    def profile(self, outline, thick, holes=(), at=(0, 0, 0), **k):
        """side profile in (z, y) extruded symmetrically along x; holes are cut with booleans."""
        def prism(pts, t):
            bm = bmesh.new(); a = [bm.verts.new((-t / 2, y, z)) for z, y in pts]; b = [bm.verts.new((t / 2, y, z)) for z, y in pts]; n = len(pts)
            bm.faces.new(a); bm.faces.new(b[::-1])
            for i in range(n): bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
            self._xf(bm, at); return bm
        part = self._obj(prism(outline, thick), k)
        for h in holes: self.cut(part, self._obj(prism(h, thick * 2), dict(cutter=True)))
        return part
    def cutter_box(self, w, h, d, at=(0, 0, 0), rot=(0, 0, 0)): return self.box(w, h, d, at, rot, cutter=True, bevel=0)
    def cutter_cyl(self, r, length, axis='x', at=(0, 0, 0), seg=12): return self.cyl(r, length, axis, at, seg=seg, cutter=True, bevel=0)
    def point(self, name, p): self.points[name] = list(p)

def clip(bm, co, no):
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector(co), plane_no=Vector(no).normalized(), clear_outer=True)
    edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges: bmesh.ops.edgeloop_fill(bm, edges=edges)

def blend(a, b, axis, at, width):
    """skin weights: bone a on the low side of `at` along axis (0/1/2), bone b on the high side, blended over width."""
    def f(p):
        t = max(0.0, min(1.0, (p[axis] - at) / width + 0.5)); t = t * t * (3 - 2 * t)
        return [(a, 1 - t), (b, t)]
    return f

# ---------------------------------------------------------------- bake + serialise
def finish(model, ao_dist=0.18, ao_min=0.34, samples=48, ao_gamma=1.0):
    """Apply modifiers, merge, bake AO into corner colours; returns dict with packed mesh buffers per material."""
    dg = bpy.context.evaluated_depsgraph_get(); bm = bmesh.new(); lay = bm.faces.layers.int.new('part')
    for i, part in enumerate(model.parts):
        me = bpy.data.meshes.new_from_object(part['ob'].evaluated_get(dg)); n0 = len(bm.faces); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        for f in bm.faces[n0:]: f[lay] = i; f.smooth = bool(part['smooth'])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(model.name); bm.to_mesh(me); bm.free()
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    ob = bpy.data.objects.new(model.name, me); bpy.context.collection.objects.link(ob)
    me.set_sharp_from_angle(angle=math.radians(38))
    mat = bpy.data.materials.new('m'); me.materials.append(mat)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.world.light_settings.distance = ao_dist
    attr = me.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = attr
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    ao = [d.color[0] for d in me.color_attributes['ao'].data]
    normals = [c.vector.copy() for c in me.corner_normals]; pid = [d.value for d in me.attributes['part'].data]
    groups = {}; bone_idx = {b['name']: i for i, b in enumerate(model.bones)}
    for poly in me.polygons:
        part = model.parts[pid[poly.index]]; base = [s2l(c) for c in hexc(part['col'])]
        g = groups.setdefault(part['mat'], dict(key={}, pos=[], nrm=[], col=[], skin=[], idx=[]))
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co; n = normals[li]
            k = ao_min + (1 - ao_min) * (max(0.0, min(1.0, ao[li])) ** ao_gamma)
            col = tuple(l2s(c * k) for c in base)
            if model.bones:
                w = part['w'](v) if part['w'] else [(part['bone'], 1.0)]
                w = sorted(w, key=lambda t: -t[1])[:2]; w0 = round(255 * w[0][1] / (w[0][1] + (w[1][1] if len(w) > 1 else 0)))
                skin = (bone_idx[w[0][0]], bone_idx[w[1][0]] if len(w) > 1 else bone_idx[w[0][0]], w0)
            else: skin = None
            key = (round(v.x, 5), round(v.y, 5), round(v.z, 5), round(n.x, 2), round(n.y, 2), round(n.z, 2), col, skin)
            j = g['key'].get(key)
            if j is None:
                j = len(g['pos']); g['key'][key] = j; g['pos'].append((v.x, v.y, v.z)); g['nrm'].append((n.x, n.y, n.z)); g['col'].append(col); g['skin'].append(skin)
            g['idx'].append(j)
    # final colours as an attribute too (used by preview renders)
    fc = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        base = [s2l(c) for c in hexc(model.parts[pid[poly.index]]['col'])]
        for li in poly.loop_indices:
            k = ao_min + (1 - ao_min) * (max(0.0, min(1.0, ao[li])) ** ao_gamma); fc.data[li].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    return groups

def preview(name, path, views, res=(900, 600), ortho=1.2, target=(0, 0, 0), samples=24):
    """quick Cycles render of the baked object; views = list of unit-ish direction vectors (camera placed along them)."""
    ob = bpy.data.objects[name]; me = ob.data; sc = bpy.context.scene
    mat = me.materials[0]; mat.use_nodes = True; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.6
    sc.world.use_nodes = True; bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.42, 0.4, 0.4, 1); bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0; sun.data.angle = 0.2; bpy.context.collection.objects.link(sun)
    sun.rotation_euler = Vector((0.3, -1, 0.35)).to_track_quat('Z', 'Y').to_euler()  # light travels along -local Z
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    sc.cycles.samples = samples; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    T = Vector(target)
    for i, d in enumerate(views):
        d = Vector(d).normalized(); cam.location = T + d * 5
        # camera looks along -local Z with local Y up; game up is +Y
        z = d; x = Vector((0, 1, 0)).cross(z).normalized(); y = z.cross(x)
        cam.rotation_euler = Matrix((x, y, z)).transposed().to_euler()
        sc.render.filepath = '%s_%d.png' % (path, i); bpy.ops.render.render(write_still=True)

def pack(models):
    """models: list of (Model, groups) → bytes: uint32 header length, JSON header, binary payload."""
    head = {}; blob = bytearray()
    def put(b):
        off = len(blob); blob.extend(b)
        while len(blob) % 4: blob.append(0)
        return off
    for model, groups in models:
        ext = max(max(abs(c) for p in g['pos'] for c in p) for g in groups.values()); q = ext / 32767.0
        entry = dict(q=q, points=model.points, meshes=[])
        if model.bones: entry['bones'] = model.bones
        for mat, g in groups.items():
            n = len(g['pos']); m = dict(mat=mat, n=n, ni=len(g['idx']))
            m['pos'] = put(struct.pack('<%dh' % (n * 3), *[max(-32767, min(32767, round(c / q))) for p in g['pos'] for c in p]))
            m['nrm'] = put(struct.pack('<%db' % (n * 3), *[max(-127, min(127, round(c * 127))) for p in g['nrm'] for c in p]))
            m['col'] = put(struct.pack('<%dB' % (n * 3), *[c for p in g['col'] for c in p]))
            if model.bones: m['skin'] = put(struct.pack('<%dB' % (n * 3), *[c for p in g['skin'] for c in p]))
            m['idx'] = put(struct.pack('<%dI' % len(g['idx']), *g['idx'])) if n > 65535 else put(struct.pack('<%dH' % len(g['idx']), *g['idx']))
            m['i32'] = n > 65535
            entry['meshes'].append(m)
        head[model.name] = entry
    hj = json.dumps(head, separators=(',', ':')).encode()
    while (4 + len(hj)) % 4: hj += b' '
    return struct.pack('<I', len(hj)) + hj + bytes(blob)
