class_name MapBuilder
extends RefCounted
## Generates map geometry, collision, occluders, lights and markers from a
## declarative layout.
##
## Layout model
## ------------
## The playable space is a set of *zones* (axis-aligned rectangles on a 1 m
## grid: rooms, streets, corridors, doors). Every non-walkable cell touching
## a walkable cell (8-neighbourhood) becomes solid wall, so the boundary is
## watertight by construction — a layout cannot leak. Two zones separated by
## one solid row get a 1 m wall between them; a *door* zone placed in that row
## opens it and receives an automatic lintel. Zones with `roof` get a ceiling
## slab. Props, platforms, stairs and details are added as explicit
## primitives (`box`, `ramp`, `stairs`, `cylinder`).
##
## Output
## ------
## Visual meshes are merged per material per 24 m chunk (few draw calls,
## still frustum-culled) with world-space UVs in meters and baked contact AO
## in vertex colours. Collision is boxes/convex shapes grouped into one
## StaticBody3D per surface type (metadata "surface"). Large solids are added
## to a single ArrayOccluder3D for occlusion culling.

const CHUNK := 96.0
const ROOF_THICK := 0.35
const FLOOR_THICK := 0.5
const AO_MIN := 0.58
const AO_HEIGHT := 1.35

class Zone:
	var index := 0
	var id := ""
	var display := ""
	var rect := Rect2i()
	var floor_mat := "concrete_floor"
	var wall_mat := "concrete_wall"
	var wall_h := 6.0
	var roof_h := 0.0
	var ceiling_mat := "concrete_dark"
	var roof_mat := "roof"
	var is_door := false
	var door_top := 3.0
	var lintel_mat := ""

var mats := MapMaterials.new()
var info := MapInfo.new()
var geometry: Node3D
var decor: Node3D
var grid: Rect2i
var zones: Array[Zone] = []
var rng := RandomNumberGenerator.new()
var stats := {"boxes": 0, "quads": 0, "shapes": 0, "lights": 0, "meshes": 0}

var _zone_at := PackedInt32Array()
var _solid_h := PackedFloat32Array()
var _height_overrides: Array = []
var _wall_mat_overrides: Array = []
var _surf: Dictionary = {}
var _surf_mat: Dictionary = {}
var _bodies: Dictionary = {}
var _clip_body: StaticBody3D
var _occ_verts := PackedVector3Array()
var _occ_idx := PackedInt32Array()

## `geometry_parent` receives meshes + collision (navmesh source);
## `decor_parent` receives lights, labels and the MapInfo node.
func _init(geometry_parent: Node3D, decor_parent: Node3D, p_grid: Rect2i, p_seed: int = 7) -> void:
	grid = p_grid
	rng.seed = p_seed
	geometry = Node3D.new()
	geometry.name = "Geometry"
	geometry_parent.add_child(geometry)
	decor = Node3D.new()
	decor.name = "Decor"
	decor_parent.add_child(decor)
	info.name = "MapInfo"
	decor_parent.add_child(info)
	var n := grid.size.x * grid.size.y
	_zone_at.resize(n)
	_zone_at.fill(-1)
	_solid_h.resize(n)
	_solid_h.fill(0.0)

## Indoor acoustic zone: positional sounds inside send to the Reverb bus.
func _add_reverb_zone(r: Rect2i, height: float, amount: float) -> void:
	var a := Area3D.new()
	a.name = "Reverb"
	a.collision_layer = GameConst.LAYER_TRIGGER
	a.collision_mask = 0
	a.monitoring = false
	a.reverb_bus_enabled = true
	a.reverb_bus_name = &"Reverb"
	a.reverb_bus_amount = amount
	a.reverb_bus_uniformity = 0.4
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = Vector3(r.size.x, height, r.size.y)
	cs.shape = s
	cs.position = Vector3(r.position.x + r.size.x * 0.5, height * 0.5, r.position.y + r.size.y * 0.5)
	a.add_child(cs)
	decor.add_child(a)

## Rect helper using corner coordinates (x0, z0) - (x1, z1).
static func R(x0: int, z0: int, x1: int, z1: int) -> Rect2i:
	return Rect2i(x0, z0, x1 - x0, z1 - z0)

# ---------------------------------------------------------------------------
# Layout API
# ---------------------------------------------------------------------------

func zone(id: String, display: String, r: Rect2i, o: Dictionary = {}) -> Zone:
	var z := Zone.new()
	z.index = zones.size()
	z.id = id
	z.display = display
	z.rect = r
	z.floor_mat = o.get("floor", z.floor_mat)
	z.wall_mat = o.get("wall", z.wall_mat)
	z.wall_h = o.get("wall_h", z.wall_h)
	z.roof_h = o.get("roof", 0.0)
	z.ceiling_mat = o.get("ceiling", z.ceiling_mat)
	z.roof_mat = o.get("roof_mat", z.roof_mat)
	if z.roof_h > 0.0 or o.get("reverb", false):
		_add_reverb_zone(r, maxf(z.roof_h, z.wall_h), o.get("reverb_amount", 0.6))
	if z.roof_h > 0.0:
		z.wall_h = maxf(z.wall_h, z.roof_h + ROOF_THICK)
	zones.append(z)
	if display != "":
		# Later (more specific) zones take precedence in callout lookup.
		info.callouts.push_front([display, AABB(Vector3(r.position.x, -1.0, r.position.y), Vector3(r.size.x, 12.0, r.size.y))])
	return z

func door(id: String, r: Rect2i, o: Dictionary = {}) -> Zone:
	var z := zone(id, "", r, o)
	z.is_door = true
	z.door_top = o.get("top", 3.0)
	z.lintel_mat = o.get("lintel", "")
	z.wall_h = 0.0
	return z

## Callout sub-region (more specific names must be added before broad zones).
func callout(display: String, a: Vector3, b: Vector3) -> void:
	info.callouts.push_front([display, AABB(a, b - a).abs()])

func override_wall_height(r: Rect2i, h: float) -> void:
	_height_overrides.append([r, h])

## Wall faces of walkable cells inside `r` use `mat` instead of the zone's.
func override_wall_material(r: Rect2i, mat: String) -> void:
	_wall_mat_overrides.append([r, mat])

func box(a: Vector3, b: Vector3, mat: String, o: Dictionary = {}) -> void:
	var lo := Vector3(minf(a.x, b.x), minf(a.y, b.y), minf(a.z, b.z))
	var hi := Vector3(maxf(a.x, b.x), maxf(a.y, b.y), maxf(a.z, b.z))
	box_xf(Transform3D(Basis(), (lo + hi) * 0.5), hi - lo, mat, o)

## Box centred on `xf.origin` with local axes from `xf.basis`.
func box_xf(xf: Transform3D, size: Vector3, mat: String, o: Dictionary = {}) -> void:
	stats.boxes += 1
	if o.get("visible", true):
		_emit_box(xf, size, mat, o)
	if o.get("collide", true):
		var s := BoxShape3D.new()
		s.size = size
		_add_shape(s, xf, o.get("surface", mats.surface_of(mat)))
	if o.get("occluder", false):
		_add_occluder_box(xf, size)

## Vertical (or arbitrarily oriented via xf.basis) cylinder centred on xf.origin.
func cylinder(xf: Transform3D, radius: float, height: float, mat: String, o: Dictionary = {}) -> void:
	var seg: int = o.get("segments", 14)
	var tint: Color = o.get("tint", Color.WHITE)
	var hh := height * 0.5
	var caps: bool = o.get("caps", true)
	if o.get("visible", true):
		for i in seg:
			var a0 := TAU * i / seg
			var a1 := TAU * (i + 1) / seg
			var d0 := Vector3(cos(a0), 0, sin(a0))
			var d1 := Vector3(cos(a1), 0, sin(a1))
			var p := [xf * (d0 * radius + Vector3(0, -hh, 0)), xf * (d1 * radius + Vector3(0, -hh, 0)),
				xf * (d1 * radius + Vector3(0, hh, 0)), xf * (d0 * radius + Vector3(0, hh, 0))]
			var u0 := a0 * radius
			var u1 := a1 * radius
			var uvs := PackedVector2Array([Vector2(u0, hh), Vector2(u1, hh), Vector2(u1, -hh), Vector2(u0, -hh)])
			var nm := xf.basis * ((d0 + d1) * 0.5).normalized()
			_quad_smooth(mat, p, [xf.basis * d0, xf.basis * d1, xf.basis * d1, xf.basis * d0], nm.normalized(), uvs, [tint, tint, tint, tint])
			if caps:
				for side: float in [-1.0, 1.0]:
					var c := xf * Vector3(0, hh * side, 0)
					var q0 := xf * (d0 * radius + Vector3(0, hh * side, 0))
					var q1 := xf * (d1 * radius + Vector3(0, hh * side, 0))
					var n := (xf.basis * Vector3(0, side, 0)).normalized()
					_tri(mat, [c, q0, q1], n, PackedVector2Array([Vector2(0, 0), Vector2(d0.x, d0.z) * radius, Vector2(d1.x, d1.z) * radius]), tint)
	if o.get("collide", true):
		var s := CylinderShape3D.new()
		s.radius = radius
		s.height = height
		_add_shape(s, xf, o.get("surface", mats.surface_of(mat)))

## Solid wedge over [x0,x1]x[z0,z1] rising from y_low to y_high towards `dir`
## ("+x", "-x", "+z", "-z"). Bottom at o.base (default 0).
func ramp(x0: float, z0: float, x1: float, z1: float, y_low: float, y_high: float, dir: String, mat: String, o: Dictionary = {}) -> void:
	var base: float = o.get("base", 0.0)
	# Sink a ground-level low edge slightly below the floor so bodies meet the
	# sloped face rather than a zero-thickness edge (which reads as a wall).
	if o.get("sink", true) and y_low <= base + 0.001 and y_high > y_low:
		var sink := 0.08
		var run := (x1 - x0) if dir.ends_with("x") else (z1 - z0)
		var ext := sink * run / (y_high - y_low)
		match dir:
			"+x": x0 -= ext
			"-x": x1 += ext
			"+z": z0 -= ext
			"-z": z1 += ext
		y_low -= sink
		base = minf(base, y_low - 0.02)
	var hfn := func(x: float, z: float) -> float:
		var t := 0.0
		match dir:
			"+x": t = (x - x0) / (x1 - x0)
			"-x": t = (x1 - x) / (x1 - x0)
			"+z": t = (z - z0) / (z1 - z0)
			"-z": t = (z1 - z) / (z1 - z0)
		return lerpf(y_low, y_high, t)
	var c := [Vector2(x0, z0), Vector2(x1, z0), Vector2(x1, z1), Vector2(x0, z1)]
	var top: Array[Vector3] = []
	var bot: Array[Vector3] = []
	for v: Vector2 in c:
		top.append(Vector3(v.x, hfn.call(v.x, v.y), v.y))
		bot.append(Vector3(v.x, base, v.y))
	var tint: Color = o.get("tint", Color.WHITE)
	if o.get("visible", true):
		var n := (top[1] - top[0]).cross(top[3] - top[0]).normalized()
		if n.y < 0:
			n = -n
		_quad(mat, top, n, _uvs_world(top, n), [tint, tint, tint, tint])
		# Four sides (degenerate ones are skipped).
		for i in 4:
			var j := (i + 1) % 4
			var side: Array[Vector3] = [bot[i], bot[j], top[j], top[i]]
			if top[i].y - base < 0.01 and top[j].y - base < 0.01:
				continue
			var sn := Vector3(top[j].z - top[i].z, 0, -(top[j].x - top[i].x)).normalized()
			if sn.dot(Vector3((x0 + x1) * 0.5, 0, (z0 + z1) * 0.5) - Vector3(top[i].x, 0, top[i].z)) > 0:
				sn = -sn
			_quad(mat, side, sn, _uvs_world(side, sn), _ao_colors(side, base, tint))
	if o.get("collide", true):
		var pts := PackedVector3Array()
		var center := Vector3((x0 + x1) * 0.5, base, (z0 + z1) * 0.5)
		for p in top + bot:
			pts.append(p - center)
		var s := ConvexPolygonShape3D.new()
		s.points = pts
		_add_shape(s, Transform3D(Basis(), center), o.get("surface", mats.surface_of(mat)))

## Visual stairs with a smooth invisible ramp for collision/navigation.
func stairs(x0: float, z0: float, x1: float, z1: float, y_low: float, y_high: float, dir: String, steps: int, mat: String, o: Dictionary = {}) -> void:
	var base: float = o.get("base", 0.0)
	for k in steps:
		var t0 := float(k) / steps
		var t1 := float(k + 1) / steps
		var top := lerpf(y_low, y_high, t1)
		var a := Vector3.ZERO
		var b := Vector3.ZERO
		match dir:
			"+x": a = Vector3(lerpf(x0, x1, t0), base, z0); b = Vector3(x1, top, z1)
			"-x": a = Vector3(x0, base, z0); b = Vector3(lerpf(x1, x0, t0), top, z1)
			"+z": a = Vector3(x0, base, lerpf(z0, z1, t0)); b = Vector3(x1, top, z1)
			"-z": a = Vector3(x0, base, z0); b = Vector3(x1, top, lerpf(z1, z0, t0))
		box(a, b, mat, {"collide": false, "tint": o.get("tint", Color.WHITE), "tint_var": 0.0})
	ramp(x0, z0, x1, z1, y_low, y_high, dir, mat, {"visible": false, "base": base, "surface": o.get("surface", mats.surface_of(mat))})

## Projected decal (Forward+/Mobile). `normal` is the surface facing
## direction (UP for floors); `size` is (width, depth along normal, height).
func decal(pos: Vector3, normal: Vector3, size: Vector3, tex: String, o: Dictionary = {}) -> Decal:
	var path := "res://assets/decals/%s.png" % tex
	if not ResourceLoader.exists(path):
		return null
	var d := Decal.new()
	d.texture_albedo = load(path)
	d.size = size
	d.modulate = o.get("modulate", Color.WHITE)
	d.albedo_mix = o.get("mix", 1.0)
	d.upper_fade = 0.2
	d.lower_fade = 0.2
	d.normal_fade = 0.4
	d.distance_fade_enabled = true
	d.distance_fade_begin = o.get("fade", 45.0)
	d.distance_fade_length = 10.0
	decor.add_child(d)
	d.global_position = pos
	# A Decal projects along its local -Y axis.
	var y := normal.normalized()
	var ref := Vector3.FORWARD if absf(y.dot(Vector3.FORWARD)) < 0.9 else Vector3.RIGHT
	var x := ref.cross(y).normalized()
	var z := x.cross(y).normalized()
	var basis := Basis(x, y, z).rotated(y, o.get("spin", 0.0))
	d.global_basis = basis
	return d

## Invisible movement blocker (railings, ledges). Bullets and sight pass.
func clip(a: Vector3, b: Vector3) -> void:
	if _clip_body == null:
		_clip_body = StaticBody3D.new()
		_clip_body.name = "PlayerClip"
		_clip_body.collision_layer = GameConst.LAYER_CLIP
		_clip_body.collision_mask = 0
		_clip_body.set_meta("surface", "clip")
		geometry.add_child(_clip_body)
	var lo := Vector3(minf(a.x, b.x), minf(a.y, b.y), minf(a.z, b.z))
	var hi := Vector3(maxf(a.x, b.x), maxf(a.y, b.y), maxf(a.z, b.z))
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = hi - lo
	cs.shape = s
	cs.position = (lo + hi) * 0.5
	_clip_body.add_child(cs)

func omni(pos: Vector3, color: Color, energy: float, light_range: float, o: Dictionary = {}) -> OmniLight3D:
	var l := OmniLight3D.new()
	l.position = pos
	l.light_color = color
	l.light_energy = energy
	l.omni_range = light_range
	l.omni_attenuation = o.get("attenuation", 1.2)
	l.shadow_enabled = o.get("shadow", false)
	l.light_specular = o.get("specular", 0.4)
	l.distance_fade_enabled = true
	l.distance_fade_begin = o.get("fade", 60.0)
	l.distance_fade_length = 15.0
	decor.add_child(l)
	stats.lights += 1
	return l

func spot(pos: Vector3, dir: Vector3, color: Color, energy: float, light_range: float, angle_deg: float, o: Dictionary = {}) -> SpotLight3D:
	var l := SpotLight3D.new()
	decor.add_child(l)
	l.position = pos
	var up := Vector3.UP if absf(dir.normalized().dot(Vector3.UP)) < 0.95 else Vector3.FORWARD
	l.look_at_from_position(pos, pos + dir, up)
	l.light_color = color
	l.light_energy = energy
	l.spot_range = light_range
	l.spot_angle = angle_deg
	l.spot_attenuation = o.get("attenuation", 1.0)
	l.shadow_enabled = o.get("shadow", false)
	l.distance_fade_enabled = true
	l.distance_fade_begin = o.get("fade", 70.0)
	l.distance_fade_length = 15.0
	stats.lights += 1
	return l

func label(text: String, pos: Vector3, yaw_deg: float, font_size: int, color: Color, o: Dictionary = {}) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.position = pos
	l.rotation_degrees = Vector3(o.get("pitch", 0.0), yaw_deg, 0)
	l.font_size = font_size
	l.pixel_size = o.get("pixel", 0.01)
	l.modulate = color
	l.outline_size = o.get("outline", 0)
	l.shaded = o.get("shaded", true)
	l.double_sided = false
	l.alpha_cut = Label3D.ALPHA_CUT_OPAQUE_PREPASS
	l.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	l.horizontal_alignment = o.get("align", HORIZONTAL_ALIGNMENT_CENTER)
	decor.add_child(l)
	return l

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

func _idx(cx: int, cz: int) -> int:
	return (cz - grid.position.y) * grid.size.x + (cx - grid.position.x)

func _in_grid(cx: int, cz: int) -> bool:
	return cx >= grid.position.x and cz >= grid.position.y and cx < grid.end.x and cz < grid.end.y

func zone_at_cell(cx: int, cz: int) -> int:
	if not _in_grid(cx, cz):
		return -1
	return _zone_at[_idx(cx, cz)]

func solid_height(cx: int, cz: int) -> float:
	if not _in_grid(cx, cz):
		return 0.0
	return _solid_h[_idx(cx, cz)]

## Finalises the layout: rasterises zones, generates walls/floors/roofs and
## commits all meshes. Returns the populated MapInfo.
func build() -> MapInfo:
	_rasterize()
	_compute_solids()
	_emit_floors()
	_emit_roofs()
	_emit_roof_edges()
	_emit_wall_faces()
	_emit_solid_tops_and_collision()
	_emit_lintels()
	_commit_meshes()
	_commit_occluders()
	_fill_info_grid()
	return info

func _rasterize() -> void:
	for z in zones:
		for cz in range(z.rect.position.y, z.rect.end.y):
			for cx in range(z.rect.position.x, z.rect.end.x):
				if not _in_grid(cx, cz) or cx == grid.position.x or cz == grid.position.y or cx == grid.end.x - 1 or cz == grid.end.y - 1:
					push_error("MapBuilder: zone %s touches grid border at %d,%d" % [z.id, cx, cz])
					continue
				_zone_at[_idx(cx, cz)] = z.index

func _compute_solids() -> void:
	for cz in range(grid.position.y, grid.end.y):
		for cx in range(grid.position.x, grid.end.x):
			if _zone_at[_idx(cx, cz)] != -1:
				continue
			var h := 0.0
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					var zi := zone_at_cell(cx + dx, cz + dz)
					if zi >= 0:
						h = maxf(h, zones[zi].wall_h)
			_solid_h[_idx(cx, cz)] = h
	for ov in _height_overrides:
		var r: Rect2i = ov[0]
		for cz in range(r.position.y, r.end.y):
			for cx in range(r.position.x, r.end.x):
				if _in_grid(cx, cz) and _solid_h[_idx(cx, cz)] > 0.0:
					_solid_h[_idx(cx, cz)] = ov[1]
	# Door cells: walls on both sides of a door must be at least as tall as
	# the lintel; handled in _emit_lintels.

## Greedy rectangle merge over grid cells sharing the same key.
## key_fn(cx, cz) -> Variant (null = skip). Returns [[Rect2i, key], ...].
func _greedy(key_fn: Callable) -> Array:
	var w := grid.size.x
	var h := grid.size.y
	var used := PackedByteArray()
	used.resize(w * h)
	var out: Array = []
	for j in h:
		for i in w:
			if used[j * w + i]:
				continue
			var k = key_fn.call(i + grid.position.x, j + grid.position.y)
			if k == null:
				continue
			var iw := 1
			while i + iw < w and not used[j * w + i + iw] and key_fn.call(i + iw + grid.position.x, j + grid.position.y) == k:
				iw += 1
			var jh := 1
			var ok := true
			while j + jh < h and ok:
				for ii in range(i, i + iw):
					if used[(j + jh) * w + ii] or key_fn.call(ii + grid.position.x, j + jh + grid.position.y) != k:
						ok = false
						break
				if ok:
					jh += 1
			for jj in range(j, j + jh):
				for ii in range(i, i + iw):
					used[jj * w + ii] = 1
			out.append([Rect2i(i + grid.position.x, j + grid.position.y, iw, jh), k])
	return out

func _emit_floors() -> void:
	var rects := _greedy(func(cx: int, cz: int):
		var zi := _zone_at[_idx(cx, cz)]
		return null if zi < 0 else zones[zi].floor_mat)
	for item in rects:
		var r: Rect2i = item[0]
		var mat: String = item[1]
		var a := Vector3(r.position.x, 0.0, r.position.y)
		var b := Vector3(r.end.x, 0.0, r.end.y)
		var p: Array[Vector3] = [a, Vector3(b.x, 0, a.z), b, Vector3(a.x, 0, b.z)]
		var t := Color.WHITE
		_quad(mat, p, Vector3.UP, _uvs_world(p, Vector3.UP), [t, t, t, t])
		var s := BoxShape3D.new()
		s.size = Vector3(r.size.x, FLOOR_THICK, r.size.y)
		_add_shape(s, Transform3D(Basis(), Vector3(_rc(r).x, -FLOOR_THICK * 0.5, _rc(r).y)), mats.surface_of(mat))

func _emit_roofs() -> void:
	var rects := _greedy(func(cx: int, cz: int):
		var zi := _zone_at[_idx(cx, cz)]
		if zi < 0 or zones[zi].roof_h <= 0.0 or zones[zi].is_door:
			return null
		var z := zones[zi]
		return "%s|%s|%.2f" % [z.ceiling_mat, z.roof_mat, z.roof_h])
	for item in rects:
		var r: Rect2i = item[0]
		var parts: PackedStringArray = (item[1] as String).split("|")
		var y := float(parts[2])
		var a := Vector3(r.position.x, y, r.position.y)
		var b := Vector3(r.end.x, y, r.end.y)
		var t := Color.WHITE
		var under: Array[Vector3] = [a, Vector3(b.x, y, a.z), b, Vector3(a.x, y, b.z)]
		_quad(parts[0], under, Vector3.DOWN, _uvs_world(under, Vector3.DOWN), [t, t, t, t])
		var yt := y + ROOF_THICK
		var over: Array[Vector3] = [Vector3(a.x, yt, a.z), Vector3(b.x, yt, a.z), Vector3(b.x, yt, b.z), Vector3(a.x, yt, b.z)]
		_quad(parts[1], over, Vector3.UP, _uvs_world(over, Vector3.UP), [t, t, t, t])
		var s := BoxShape3D.new()
		s.size = Vector3(r.size.x, ROOF_THICK, r.size.y)
		_add_shape(s, Transform3D(Basis(), Vector3(_rc(r).x, y + ROOF_THICK * 0.5, _rc(r).y)), "concrete")

## Float centre of an integer rect (Rect2i.get_center() truncates).
static func _rc(r: Rect2i) -> Vector2:
	return Vector2(r.position) + Vector2(r.size) * 0.5

## Closes the seams where a roofed zone meets a walkable neighbour with a
## lower roof or open sky: slab edge faces plus a header wall (with
## collision) between the two ceiling heights so no light leaks through.
func _emit_roof_edges() -> void:
	for cz in range(grid.position.y, grid.end.y):
		for cx in range(grid.position.x, grid.end.x):
			var zi := _zone_at[_idx(cx, cz)]
			if zi < 0 or zones[zi].is_door or zones[zi].roof_h <= 0.0:
				continue
			var ha := zones[zi].roof_h
			for d: Vector2i in _DIRS:
				var ni := zone_at_cell(cx + d.x, cz + d.y)
				if ni < 0 or zones[ni].is_door:
					continue
				var hb := zones[ni].roof_h
				if hb >= ha - 0.01:
					continue
				var line_x := float(cx + (1 if d.x > 0 else 0))
				var line_z := float(cz + (1 if d.y > 0 else 0))
				var pa: Vector3
				var pb: Vector3
				if d.x != 0:
					pa = Vector3(line_x, 0, cz)
					pb = Vector3(line_x, 0, cz + 1)
				else:
					pa = Vector3(cx, 0, line_z)
					pb = Vector3(cx + 1, 0, line_z)
				var out_n := Vector3(d.x, 0, d.y)
				# Slab edge seen from the neighbour.
				_vface("concrete_dark", pa, pb, ha, ha + ROOF_THICK, out_n, 0.0, Color(0.8, 0.8, 0.8), Vector2.ZERO, false)
				if hb > 0.0:
					# Header between the lower and the higher ceiling, seen from inside.
					_vface(zones[zi].wall_mat, pa, pb, hb, ha, -out_n, 0.0, Color.WHITE, Vector2.ZERO, false)
					_vface("concrete_wall", pa, pb, hb + ROOF_THICK, ha + ROOF_THICK, out_n, 0.0, Color.WHITE, Vector2.ZERO, false)
					var s := BoxShape3D.new()
					var thick := 0.1
					if d.x != 0:
						s.size = Vector3(thick, ha + ROOF_THICK - hb, 1.0)
					else:
						s.size = Vector3(1.0, ha + ROOF_THICK - hb, thick)
					var c := (pa + pb) * 0.5 - out_n * thick * 0.5
					c.y = (hb + ha + ROOF_THICK) * 0.5
					_add_shape(s, Transform3D(Basis(), c), "concrete")

func _wall_mat_for(cx: int, cz: int, z: Zone) -> String:
	for ov in _wall_mat_overrides:
		if (ov[0] as Rect2i).has_point(Vector2i(cx, cz)):
			return ov[1]
	return z.wall_mat

const _DIRS := [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

## Emits the vertical wall faces seen from walkable cells, run-length merged
## along each wall line.
func _emit_wall_faces() -> void:
	# Collect unit faces: key (dir, line, mat, y0, y1) -> sorted cell positions.
	var runs: Dictionary = {}
	for cz in range(grid.position.y, grid.end.y):
		for cx in range(grid.position.x, grid.end.x):
			var zi := _zone_at[_idx(cx, cz)]
			if zi < 0:
				continue
			var z := zones[zi]
			for d: Vector2i in _DIRS:
				var nx := cx + d.x
				var nz := cz + d.y
				var nh := solid_height(nx, nz)
				if zone_at_cell(nx, nz) >= 0 or nh <= 0.0:
					continue
				var mat := _wall_mat_for(cx, cz, z)
				var top := nh
				if z.roof_h > 0.0 and not z.is_door:
					top = minf(nh, z.roof_h)
					if nh > z.roof_h + ROOF_THICK:
						# Exterior face above the roof slab (seen from outside).
						_push_run(runs, d, cx, cz, "concrete_wall", z.roof_h + ROOF_THICK, nh)
				elif z.is_door:
					top = minf(nh, z.door_top)
				_push_run(runs, d, cx, cz, mat, 0.0, top)
	for key in runs:
		var parts: Array = runs[key][0]
		var d: Vector2i = parts[0]
		var mat: String = parts[2]
		var y0: float = parts[3]
		var y1: float = parts[4]
		var cells: Array = runs[key][1]
		cells.sort()
		var start: int = cells[0]
		var prev: int = cells[0]
		for i in range(1, cells.size() + 1):
			var c: int = cells[i] if i < cells.size() else 1 << 30
			if c == prev + 1:
				prev = c
				continue
			_emit_wall_run(d, parts[1], start, prev + 1, y0, y1, mat)
			if i < cells.size():
				start = c
				prev = c

func _push_run(runs: Dictionary, d: Vector2i, cx: int, cz: int, mat: String, y0: float, y1: float) -> void:
	# Line coordinate is the cell-edge coordinate perpendicular to the face.
	var line := 0
	var along := 0
	if d.x != 0:
		line = cx + (1 if d.x > 0 else 0)
		along = cz
	else:
		line = cz + (1 if d.y > 0 else 0)
		along = cx
	var key := "%d,%d|%d|%s|%.2f|%.2f" % [d.x, d.y, line, mat, y0, y1]
	if not runs.has(key):
		runs[key] = [[d, line, mat, y0, y1], []]
	runs[key][1].append(along)

func _emit_wall_run(d: Vector2i, line: int, a0: int, a1: int, y0: float, y1: float, mat: String) -> void:
	if y1 - y0 < 0.01:
		return
	var n := Vector3(-d.x, 0, -d.y) # face points back into the walkable cell
	var pa: Vector3
	var pb: Vector3
	if d.x != 0:
		pa = Vector3(line, 0, a0)
		pb = Vector3(line, 0, a1)
	else:
		pa = Vector3(a0, 0, line)
		pb = Vector3(a1, 0, line)
	_vface(mat, pa, pb, y0, y1, n, 0.0, Color.WHITE, Vector2.ZERO, false)

func _emit_solid_tops_and_collision() -> void:
	var rects := _greedy(func(cx: int, cz: int):
		var h := _solid_h[_idx(cx, cz)]
		return null if h <= 0.0 else snappedf(h, 0.01))
	for item in rects:
		var r: Rect2i = item[0]
		var h: float = item[1]
		var a := Vector3(r.position.x, h, r.position.y)
		var b := Vector3(r.end.x, h, r.end.y)
		var t := Color(0.85, 0.85, 0.85)
		var p: Array[Vector3] = [a, Vector3(b.x, h, a.z), b, Vector3(a.x, h, b.z)]
		_quad("concrete_top", p, Vector3.UP, _uvs_world(p, Vector3.UP), [t, t, t, t])
		var s := BoxShape3D.new()
		var bottom := -FLOOR_THICK
		s.size = Vector3(r.size.x, h - bottom, r.size.y)
		var xf := Transform3D(Basis(), Vector3(_rc(r).x, (h + bottom) * 0.5, _rc(r).y))
		_add_shape(s, xf, "concrete")
		if h >= 3.0 and r.size.x * r.size.y >= 3:
			_add_occluder_box(xf, s.size - Vector3(0.1, 0.1, 0.1))

func _emit_lintels() -> void:
	for z in zones:
		if not z.is_door:
			continue
		var r := z.rect
		var top := 0.0
		for cz in range(r.position.y - 1, r.end.y + 1):
			for cx in range(r.position.x - 1, r.end.x + 1):
				top = maxf(top, solid_height(cx, cz))
		if top <= z.door_top + 0.05:
			continue
		var a := Vector3(r.position.x, z.door_top, r.position.y)
		var b := Vector3(r.end.x, top, r.end.y)
		var mat := z.lintel_mat
		# Faces toward each neighbouring zone use that zone's wall material.
		for d: Vector2i in _DIRS:
			var face_mat := mat
			var probe := Vector2i(r.position.x, r.position.y)
			if d.x > 0: probe = Vector2i(r.end.x, r.position.y)
			elif d.x < 0: probe = Vector2i(r.position.x - 1, r.position.y)
			elif d.y > 0: probe = Vector2i(r.position.x, r.end.y)
			else: probe = Vector2i(r.position.x, r.position.y - 1)
			var nz := zone_at_cell(probe.x, probe.y)
			if nz < 0:
				continue
			var nzone := zones[nz]
			if face_mat == "":
				face_mat = nzone.wall_mat
			var y1 := top
			if nzone.roof_h > 0.0:
				y1 = minf(top, nzone.roof_h)
			var pa: Vector3
			var pb: Vector3
			if d.x != 0:
				var x := float(r.end.x if d.x > 0 else r.position.x)
				pa = Vector3(x, 0, r.position.y)
				pb = Vector3(x, 0, r.end.y)
			else:
				var zz := float(r.end.y if d.y > 0 else r.position.y)
				pa = Vector3(r.position.x, 0, zz)
				pb = Vector3(r.end.x, 0, zz)
			_vface(face_mat, pa, pb, z.door_top, y1, Vector3(d.x, 0, d.y), 0.0, Color.WHITE, Vector2.ZERO, false)
		var under: Array[Vector3] = [Vector3(a.x, a.y, a.z), Vector3(b.x, a.y, a.z), Vector3(b.x, a.y, b.z), Vector3(a.x, a.y, b.z)]
		var t := Color(0.8, 0.8, 0.8)
		_quad("concrete_wall", under, Vector3.DOWN, _uvs_world(under, Vector3.DOWN), [t, t, t, t])
		var s := BoxShape3D.new()
		s.size = b - a
		_add_shape(s, Transform3D(Basis(), (a + b) * 0.5), "concrete")

func _commit_meshes() -> void:
	for key in _surf:
		var st: SurfaceTool = _surf[key]
		st.index()
		st.generate_tangents()
		var mesh := st.commit()
		var mi := MeshInstance3D.new()
		mi.name = "Mesh_" + (key as String).replace("|", "_").replace("-", "m")
		mi.mesh = mesh
		mi.material_override = mats.get_material(_surf_mat[key])
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_DOUBLE_SIDED
		mi.gi_mode = GeometryInstance3D.GI_MODE_STATIC
		geometry.add_child(mi)
		stats.meshes += 1
	_surf.clear()

func _commit_occluders() -> void:
	if _occ_verts.is_empty():
		return
	var occ := ArrayOccluder3D.new()
	occ.set_arrays(_occ_verts, _occ_idx)
	var inst := OccluderInstance3D.new()
	inst.name = "Occluders"
	inst.occluder = occ
	decor.add_child(inst)

func _fill_info_grid() -> void:
	info.grid_origin = grid.position
	info.grid_size = grid.size
	var n := grid.size.x * grid.size.y
	info.walkable.resize(n)
	info.surface_ids.resize(n)
	var names: Array[String] = []
	for i in n:
		var zi := _zone_at[i]
		if zi < 0:
			info.walkable[i] = 0
			info.surface_ids[i] = 0
			continue
		info.walkable[i] = 1
		var s := mats.surface_of(zones[zi].floor_mat)
		var si := names.find(s)
		if si < 0:
			names.append(s)
			si = names.size() - 1
		info.surface_ids[i] = si
	info.surface_names = PackedStringArray(names)
	info.bounds = Rect2(grid.position, grid.size)

# ---------------------------------------------------------------------------
# Low-level emission
# ---------------------------------------------------------------------------

func _st(mat: String, center: Vector3) -> SurfaceTool:
	var key := "%s|%d|%d" % [mat, floori(center.x / CHUNK), floori(center.z / CHUNK)]
	if not _surf.has(key):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		_surf[key] = st
		_surf_mat[key] = mat
	return _surf[key]

## Planar quad; `p` lists the 4 corners in order around the quad, `n` is the
## outward normal. Winding is fixed up automatically (Godot front faces are
## clockwise when viewed from the front).
func _quad(mat: String, p: Array, n: Vector3, uvs: PackedVector2Array, cols: Array) -> void:
	stats.quads += 1
	var st := _st(mat, (p[0] + p[2]) * 0.5)
	var order := [0, 1, 2, 0, 2, 3]
	if ((p[1] - p[0]) as Vector3).cross(p[2] - p[0]).dot(n) > 0.0:
		order = [0, 2, 1, 0, 3, 2]
	for i in order:
		st.set_normal(n)
		st.set_uv(uvs[i])
		st.set_color(cols[i])
		st.add_vertex(p[i])

## Quad with per-vertex normals (cylinder sides).
func _quad_smooth(mat: String, p: Array, normals: Array, face_n: Vector3, uvs: PackedVector2Array, cols: Array) -> void:
	stats.quads += 1
	var st := _st(mat, (p[0] + p[2]) * 0.5)
	var order := [0, 1, 2, 0, 2, 3]
	if ((p[1] - p[0]) as Vector3).cross(p[2] - p[0]).dot(face_n) > 0.0:
		order = [0, 2, 1, 0, 3, 2]
	for i in order:
		st.set_normal(normals[i])
		st.set_uv(uvs[i])
		st.set_color(cols[i])
		st.add_vertex(p[i])

func _tri(mat: String, p: Array, n: Vector3, uvs: PackedVector2Array, col: Color) -> void:
	var st := _st(mat, p[0])
	var order := [0, 1, 2]
	if ((p[1] - p[0]) as Vector3).cross(p[2] - p[0]).dot(n) > 0.0:
		order = [0, 2, 1]
	for i in order:
		st.set_normal(n)
		st.set_uv(uvs[i])
		st.set_color(col)
		st.add_vertex(p[i])

## World-space planar UVs in meters chosen by the dominant normal axis.
static func _uv_world(p: Vector3, n: Vector3) -> Vector2:
	var an := n.abs()
	if an.y >= an.x and an.y >= an.z:
		return Vector2(p.x, p.z)
	if an.x >= an.z:
		return Vector2(-p.z * signf(n.x), -p.y)
	return Vector2(p.x * signf(n.z), -p.y)

func _uvs_world(p: Array, n: Vector3) -> PackedVector2Array:
	var out := PackedVector2Array()
	for v in p:
		out.append(_uv_world(v, n))
	return out

func _ao(h: float) -> float:
	return lerpf(AO_MIN, 1.0, smoothstep(0.0, AO_HEIGHT, h))

func _ao_colors(p: Array, base: float, tint: Color) -> Array:
	var out := []
	for v in p:
		var f := _ao((v as Vector3).y - base)
		out.append(Color(tint.r * f, tint.g * f, tint.b * f, 1.0))
	return out

## Vertical face from pa..pb (bottom edge at y=0 in the points' xz), spanning
## y0..y1, split into horizontal bands so contact AO near `base` is smooth.
## If `local_uv` the UV origin is `uv_off` along the face instead of world.
func _vface(mat: String, pa: Vector3, pb: Vector3, y0: float, y1: float, n: Vector3, base: float, tint: Color, uv_off: Vector2, local_uv: bool) -> void:
	var cuts: Array[float] = [y0]
	for c in [base + 0.35, base + 0.9, base + AO_HEIGHT]:
		if c > y0 + 0.05 and c < y1 - 0.05:
			cuts.append(c)
	cuts.append(y1)
	var length := Vector2(pb.x - pa.x, pb.z - pa.z).length()
	for i in cuts.size() - 1:
		var ya := cuts[i]
		var yb := cuts[i + 1]
		var p: Array[Vector3] = [Vector3(pa.x, ya, pa.z), Vector3(pb.x, ya, pb.z), Vector3(pb.x, yb, pb.z), Vector3(pa.x, yb, pa.z)]
		var uvs: PackedVector2Array
		if local_uv:
			uvs = PackedVector2Array([uv_off + Vector2(0, -(ya - base)), uv_off + Vector2(length, -(ya - base)),
				uv_off + Vector2(length, -(yb - base)), uv_off + Vector2(0, -(yb - base))])
		else:
			uvs = _uvs_world(p, n)
		_quad(mat, p, n, uvs, _ao_colors(p, base, tint))

func _emit_box(xf: Transform3D, size: Vector3, mat: String, o: Dictionary) -> void:
	var h := size * 0.5
	var var_amt: float = o.get("tint_var", 0.05)
	var tint: Color = o.get("tint", Color.WHITE)
	var k := 1.0 + rng.randf_range(-var_amt, var_amt)
	tint = Color(tint.r * k, tint.g * k, tint.b * k, 1.0)
	var skip: Array = o.get("skip", [])
	var axis_aligned := xf.basis.is_equal_approx(Basis())
	var use_ao: bool = o.get("ao", true) and axis_aligned
	var local_uv: bool = o.get("uv", "world") == "local" or not axis_aligned
	var uv_off := Vector2(rng.randf_range(0, 8), rng.randf_range(0, 8)) if local_uv else Vector2.ZERO
	var base := xf.origin.y - h.y
	var on_ground := axis_aligned and base <= 0.02
	# Bottom face is skipped automatically when resting on the floor.
	if not ("bottom" in skip or on_ground):
		var pb: Array[Vector3] = [xf * Vector3(-h.x, -h.y, -h.z), xf * Vector3(h.x, -h.y, -h.z), xf * Vector3(h.x, -h.y, h.z), xf * Vector3(-h.x, -h.y, h.z)]
		var nb := (xf.basis * Vector3.DOWN).normalized()
		_quad(mat, pb, nb, _box_uvs(pb, nb, xf, local_uv, uv_off), [tint, tint, tint, tint])
	if not "top" in skip:
		var pt: Array[Vector3] = [xf * Vector3(-h.x, h.y, -h.z), xf * Vector3(h.x, h.y, -h.z), xf * Vector3(h.x, h.y, h.z), xf * Vector3(-h.x, h.y, h.z)]
		var nt := (xf.basis * Vector3.UP).normalized()
		_quad(mat, pt, nt, _box_uvs(pt, nt, xf, local_uv, uv_off), [tint, tint, tint, tint])
	# Sides: local +X, -X, +Z, -Z.
	var sides := [
		["e", Vector3(1, 0, 0), Vector3(h.x, 0, h.z), Vector3(h.x, 0, -h.z)],
		["w", Vector3(-1, 0, 0), Vector3(-h.x, 0, -h.z), Vector3(-h.x, 0, h.z)],
		["s", Vector3(0, 0, 1), Vector3(-h.x, 0, h.z), Vector3(h.x, 0, h.z)],
		["n", Vector3(0, 0, -1), Vector3(h.x, 0, -h.z), Vector3(-h.x, 0, -h.z)],
	]
	for sd in sides:
		if sd[0] in skip:
			continue
		var ln: Vector3 = sd[1]
		var n := (xf.basis * ln).normalized()
		if use_ao:
			var pa: Vector3 = xf * (sd[2] as Vector3)
			var pb2: Vector3 = xf * (sd[3] as Vector3)
			_vface(mat, Vector3(pa.x, 0, pa.z), Vector3(pb2.x, 0, pb2.z), base, base + size.y, n, base, tint,
				uv_off + Vector2(_hash_off(pa, n), 0.0) if local_uv else Vector2.ZERO, local_uv)
		else:
			var a: Vector3 = sd[2]
			var b: Vector3 = sd[3]
			var p: Array[Vector3] = [xf * (a + Vector3(0, -h.y, 0)), xf * (b + Vector3(0, -h.y, 0)), xf * (b + Vector3(0, h.y, 0)), xf * (a + Vector3(0, h.y, 0))]
			_quad(mat, p, n, _box_uvs(p, n, xf, local_uv, uv_off), [tint, tint, tint, tint])

func _hash_off(p: Vector3, n: Vector3) -> float:
	return fposmod(p.x * 1.37 + p.z * 0.73 + n.x * 3.1 + n.z * 1.9, 7.0)

func _box_uvs(p: Array, n: Vector3, xf: Transform3D, local_uv: bool, off: Vector2) -> PackedVector2Array:
	if not local_uv:
		return _uvs_world(p, n)
	var inv := xf.affine_inverse()
	var ln := (inv.basis * n).normalized()
	var out := PackedVector2Array()
	for v in p:
		out.append(_uv_world(inv * (v as Vector3), ln) + off)
	return out

func _body(surface: String) -> StaticBody3D:
	if _bodies.has(surface):
		return _bodies[surface]
	var b := StaticBody3D.new()
	b.name = "Static_" + surface
	b.collision_layer = GameConst.LAYER_WORLD
	b.collision_mask = 0
	b.set_meta("surface", surface)
	geometry.add_child(b)
	_bodies[surface] = b
	return b

func _add_shape(shape: Shape3D, xf: Transform3D, surface: String) -> void:
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.transform = xf
	_body(surface).add_child(cs)
	stats.shapes += 1

func _add_occluder_box(xf: Transform3D, size: Vector3) -> void:
	var h := size * 0.5
	var base := _occ_verts.size()
	for sx: float in [-1, 1]:
		for sy: float in [-1, 1]:
			for sz: float in [-1, 1]:
				_occ_verts.append(xf * Vector3(h.x * sx, h.y * sy, h.z * sz))
	# Corner index = (sx>0)*4 + (sy>0)*2 + (sz>0)
	var faces := [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
	for f in faces:
		_occ_idx.append_array(PackedInt32Array([base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]]))
