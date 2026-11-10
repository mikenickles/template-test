extends Node3D
## Visual effects service (autoload "Fx"). Everything is pooled so sustained
## firefights allocate nothing: bullet-hole decals, impact particle bursts,
## tracers, muzzle-flash lights and ejected casings. Effects live under this
## node (in the root World3D) and are cleared between matches with clear().

const DECAL_POOL := 160
const TRACER_POOL := 24
const LIGHT_POOL := 6
const CASING_POOL := 32
const BURST_POOL := 6
const TRACER_SPEED := 420.0

var _decals: Array[MeshInstance3D] = []
var _decal_next := 0
var _tracers: Array = [] # [MeshInstance3D, from, to, t, duration]
var _tracer_next := 0
var _lights: Array = [] # [OmniLight3D, time_left, energy]
var _light_next := 0
var _casings: Array = [] # [MeshInstance3D, velocity, life, ground_y, played]
var _casing_next := 0
var _bursts: Dictionary = {} # kind -> {list, next}
var _mat_cache: Dictionary = {}
var _ready_done := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE

func _setup() -> void:
	if _ready_done:
		return
	_ready_done = true
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	for i in DECAL_POOL:
		var d := MeshInstance3D.new()
		d.mesh = quad
		d.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		d.visible = false
		add_child(d)
		_decals.append(d)
	var tbox := BoxMesh.new()
	tbox.size = Vector3(0.012, 0.012, 1.0)
	for i in TRACER_POOL:
		var t := MeshInstance3D.new()
		t.mesh = tbox
		t.material_override = _tracer_material()
		t.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		t.visible = false
		add_child(t)
		_tracers.append([t, Vector3.ZERO, Vector3.ZERO, 0.0, 0.0])
	for i in LIGHT_POOL:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.72, 0.38)
		l.omni_range = 7.0
		l.omni_attenuation = 1.6
		l.shadow_enabled = false
		l.visible = false
		add_child(l)
		_lights.append([l, 0.0, 0.0])
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.0055
	cyl.bottom_radius = 0.0055
	cyl.height = 0.035
	cyl.radial_segments = 6
	cyl.rings = 1
	cyl.material = WeaponModels.mat("brass")
	for i in CASING_POOL:
		var c := MeshInstance3D.new()
		c.mesh = cyl
		c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		c.visible = false
		add_child(c)
		_casings.append([c, Vector3.ZERO, 0.0, 0.0, true])

func clear() -> void:
	for d in _decals:
		d.visible = false
	for t in _tracers:
		t[0].visible = false
	for l in _lights:
		l[0].visible = false
	for c in _casings:
		c[0].visible = false
	for kind in _bursts:
		for p in _bursts[kind].list:
			(p as CPUParticles3D).emitting = false

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

func _tex(path: String) -> Texture2D:
	return load(path) if ResourceLoader.exists(path) else null

func muzzle_material() -> StandardMaterial3D:
	if _mat_cache.has("muzzle"):
		return _mat_cache["muzzle"]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_texture = _tex("res://assets/fx/muzzle_flash_front.png")
	m.albedo_color = Color(1.0, 0.85, 0.6) * 2.0
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.no_depth_test = false
	_mat_cache["muzzle"] = m
	return m

func muzzle_side_material() -> StandardMaterial3D:
	if _mat_cache.has("muzzle_side"):
		return _mat_cache["muzzle_side"]
	var m := muzzle_material().duplicate() as StandardMaterial3D
	m.albedo_texture = _tex("res://assets/fx/muzzle_flash_side.png")
	_mat_cache["muzzle_side"] = m
	return m

func _tracer_material() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_color = Color(1.0, 0.78, 0.45, 0.55)
	return m

func _decal_material(kind: String) -> StandardMaterial3D:
	if _mat_cache.has("decal_" + kind):
		return _mat_cache["decal_" + kind]
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	m.roughness = 0.9
	m.albedo_texture = _tex({"metal": "res://assets/fx/bullet_hole_metal.png", "blood": "res://assets/fx/blood_splat.png", "scorch": "res://assets/fx/scorch.png"}.get(kind, "res://assets/fx/bullet_hole.png"))
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_mat_cache["decal_" + kind] = m
	return m

func _particle_material(tex_path: String, additive: bool, unshaded: bool) -> StandardMaterial3D:
	var key := "p_%s_%s_%s" % [tex_path, additive, unshaded]
	if _mat_cache.has(key):
		return _mat_cache[key]
	var m := StandardMaterial3D.new()
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = _tex(tex_path)
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat_cache[key] = m
	return m

# ---------------------------------------------------------------------------
# Particle bursts
# ---------------------------------------------------------------------------

func _make_burst(kind: String) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = false
	p.explosiveness = 0.95
	p.local_coords = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var q := QuadMesh.new()
	var fade := Gradient.new()
	match kind:
		"dust":
			p.amount = 10
			p.lifetime = 0.9
			q.size = Vector2(0.18, 0.18)
			q.material = _particle_material("res://assets/fx/smoke_puff.png", false, false)
			p.direction = Vector3(0, 0, 1)
			p.spread = 38.0
			p.initial_velocity_min = 0.8
			p.initial_velocity_max = 3.2
			p.gravity = Vector3(0, -1.2, 0)
			p.damping_min = 3.0
			p.damping_max = 5.0
			p.scale_amount_min = 0.6
			p.scale_amount_max = 1.6
			var sc := Curve.new()
			sc.add_point(Vector2(0, 0.4))
			sc.add_point(Vector2(1, 1.6))
			p.scale_amount_curve = sc
			fade.set_color(0, Color(0.72, 0.68, 0.62, 0.75))
			fade.set_color(1, Color(0.72, 0.68, 0.62, 0.0))
		"sparks":
			p.amount = 14
			p.lifetime = 0.32
			q.size = Vector2(0.045, 0.045)
			q.material = _particle_material("res://assets/fx/spark.png", true, true)
			p.direction = Vector3(0, 0, 1)
			p.spread = 55.0
			p.initial_velocity_min = 3.0
			p.initial_velocity_max = 9.0
			p.gravity = Vector3(0, -12.0, 0)
			fade.set_color(0, Color(1.0, 0.9, 0.6, 1.0))
			fade.set_color(1, Color(1.0, 0.45, 0.1, 0.0))
		"chips":
			p.amount = 10
			p.lifetime = 0.7
			q.size = Vector2(0.03, 0.05)
			q.material = _particle_material("", false, false)
			p.direction = Vector3(0, 0, 1)
			p.spread = 45.0
			p.initial_velocity_min = 1.5
			p.initial_velocity_max = 4.5
			p.gravity = Vector3(0, -9.8, 0)
			fade.set_color(0, Color(0.5, 0.36, 0.2, 1.0))
			fade.set_color(1, Color(0.4, 0.3, 0.18, 0.0))
		"blood":
			p.amount = 12
			p.lifetime = 0.45
			q.size = Vector2(0.12, 0.12)
			q.material = _particle_material("res://assets/fx/smoke_puff.png", false, false)
			p.direction = Vector3(0, 0, 1)
			p.spread = 30.0
			p.initial_velocity_min = 0.6
			p.initial_velocity_max = 2.4
			p.gravity = Vector3(0, -4.0, 0)
			p.damping_min = 2.0
			p.damping_max = 4.0
			fade.set_color(0, Color(0.45, 0.02, 0.02, 0.9))
			fade.set_color(1, Color(0.3, 0.0, 0.0, 0.0))
	p.mesh = q
	p.color_ramp = fade
	add_child(p)
	return p

func _burst(kind: String, pos: Vector3, normal: Vector3) -> void:
	if not _bursts.has(kind):
		var list: Array = []
		for i in BURST_POOL:
			list.append(_make_burst(kind))
		_bursts[kind] = {"list": list, "next": 0}
	var entry: Dictionary = _bursts[kind]
	var p: CPUParticles3D = entry.list[entry.next]
	entry.next = (entry.next + 1) % BURST_POOL
	var up := Vector3.UP if absf(normal.dot(Vector3.UP)) < 0.95 else Vector3.RIGHT
	p.global_transform = Transform3D(Basis.looking_at(-normal, up), pos + normal * 0.02)
	p.restart()
	p.emitting = true

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Bullet impact on a surface: decal, particles and sound.
func impact(pos: Vector3, normal: Vector3, surface: String, play_sound: bool = true) -> void:
	_setup()
	match surface:
		"flesh":
			_burst("blood", pos, normal)
		"metal", "metal_thin":
			_burst("sparks", pos, normal)
			_decal(pos, normal, "metal", randf_range(0.07, 0.1))
		"wood":
			_burst("chips", pos, normal)
			_burst("dust", pos, normal)
			_decal(pos, normal, "hole", randf_range(0.07, 0.1))
		"clip":
			return
		_:
			_burst("dust", pos, normal)
			_decal(pos, normal, "hole", randf_range(0.08, 0.12))
	if play_sound:
		Audio.play_3d("impacts/" + _impact_sound(surface), pos, -4.0, 0.08, 30.0)

static func _impact_sound(surface: String) -> String:
	match surface:
		"metal", "metal_thin": return "metal"
		"wood": return "wood"
		"gravel", "dirt": return "dirt"
		"flesh": return "flesh"
	return "concrete"

## Blood spatter decal on geometry behind a hit target.
func blood_spatter(space: PhysicsDirectSpaceState3D, pos: Vector3, dir: Vector3) -> void:
	_setup()
	var q := PhysicsRayQueryParameters3D.create(pos, pos + dir * 2.5, GameConst.LAYER_WORLD)
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		_decal(hit.position, hit.normal, "blood", randf_range(0.35, 0.6))

func _decal(pos: Vector3, normal: Vector3, kind: String, size: float) -> void:
	var d := _decals[_decal_next]
	_decal_next = (_decal_next + 1) % DECAL_POOL
	d.material_override = _decal_material(kind)
	var up := Vector3.UP if absf(normal.dot(Vector3.UP)) < 0.95 else Vector3.FORWARD
	var basis := Basis.looking_at(-normal, up).rotated(normal, randf() * TAU)
	d.global_transform = Transform3D(basis.scaled(Vector3(size, size, 1.0)), pos + normal * (0.004 + randf() * 0.002))
	d.visible = true

## Big explosion: flash, debris/smoke bursts, scorch decal.
func explosion(pos: Vector3) -> void:
	_setup()
	flash_light(pos + Vector3(0, 1.5, 0), 40.0)
	var l: Array = _lights[(_light_next + LIGHT_POOL - 1) % LIGHT_POOL]
	l[0].omni_range = 30.0
	l[1] = 0.5
	l[2] = 40.0
	for i in 4:
		var a := TAU * i / 4.0
		_burst("dust", pos + Vector3(cos(a), 0.5, sin(a)), Vector3(cos(a), 1.2, sin(a)).normalized())
		_burst("sparks", pos + Vector3(0, 0.6, 0), Vector3(cos(a), 1.5, sin(a)).normalized())
	_decal(pos + Vector3(0, 0.02, 0), Vector3.UP, "scorch", 6.0)

func tracer(from: Vector3, to: Vector3) -> void:
	_setup()
	var dist := from.distance_to(to)
	if dist < 3.0:
		return
	var t: Array = _tracers[_tracer_next]
	_tracer_next = (_tracer_next + 1) % TRACER_POOL
	t[1] = from
	t[2] = to
	t[3] = 0.0
	t[4] = dist / TRACER_SPEED
	t[0].visible = true

func flash_light(pos: Vector3, energy: float = 2.0) -> void:
	_setup()
	var l: Array = _lights[_light_next]
	_light_next = (_light_next + 1) % LIGHT_POOL
	l[0].global_position = pos
	l[0].light_energy = energy
	l[0].visible = true
	l[1] = 0.06
	l[2] = energy

func eject_casing(pos: Vector3, vel: Vector3, play_sound: bool) -> void:
	_setup()
	var c: Array = _casings[_casing_next]
	_casing_next = (_casing_next + 1) % CASING_POOL
	var node: MeshInstance3D = c[0]
	node.global_position = pos
	node.rotation = Vector3(randf() * TAU, randf() * TAU, 0)
	node.visible = true
	c[1] = vel
	c[2] = 0.9
	var ground := pos.y - 1.7
	var space := get_world_3d().direct_space_state
	if space:
		var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(pos, pos + Vector3.DOWN * 4.0, GameConst.LAYER_WORLD))
		if not hit.is_empty():
			ground = hit.position.y + 0.006
	c[3] = ground
	c[4] = not play_sound

func _process(delta: float) -> void:
	if not _ready_done:
		return
	for t in _tracers:
		var node: MeshInstance3D = t[0]
		if not node.visible:
			continue
		t[3] += delta
		var k: float = t[3] / maxf(t[4], 0.001)
		if k >= 1.0:
			node.visible = false
			continue
		var from: Vector3 = t[1]
		var to: Vector3 = t[2]
		var dir := (to - from).normalized()
		var head := from.lerp(to, k)
		var length := minf(3.5, head.distance_to(from))
		var center := head - dir * length * 0.5
		var up := Vector3.UP if absf(dir.dot(Vector3.UP)) < 0.98 else Vector3.RIGHT
		node.global_transform = Transform3D(Basis.looking_at(dir, up).scaled(Vector3(1, 1, length)), center)
	for l in _lights:
		if not l[0].visible:
			continue
		l[1] -= delta
		if l[1] <= 0.0:
			l[0].visible = false
			l[0].omni_range = 7.0
		else:
			l[0].light_energy = l[2] * clampf(l[1] / 0.06, 0.0, 1.0)
	for c in _casings:
		var node: MeshInstance3D = c[0]
		if not node.visible:
			continue
		c[2] -= delta
		if c[2] <= 0.0:
			node.visible = false
			continue
		c[1] += Vector3(0, -9.8, 0) * delta
		node.global_position += c[1] * delta
		node.rotate_x(delta * 25.0)
		if node.global_position.y < c[3]:
			node.global_position.y = c[3]
			c[1] = Vector3(c[1].x * 0.35, -c[1].y * 0.3, c[1].z * 0.35)
			if not c[4]:
				c[4] = true
				Audio.play_3d("weapons/shell_casing", node.global_position, -16.0, 0.12, 12.0)
