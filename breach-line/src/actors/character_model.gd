class_name CharacterModel
extends Node3D
## Procedural third-person soldier: primitive-built body with team gear,
## procedural locomotion (walk cycle, crouch, air pose), aim pitch, two-bone
## arm IK onto the held weapon, a death fall, and per-limb hitboxes that ride
## on the animated parts. Animated in _physics_process so physics
## interpolation smooths it and hitboxes match the simulation.

const UPPER_ARM := 0.3
const FOREARM := 0.29
const THIGH := 0.45
const SHIN := 0.44
const HIP_STAND := 0.93
const HIP_CROUCH := 0.6

var combatant: Combatant
var hitboxes: Array[Hitbox] = []
var first_person := false

var _hips: Node3D
var _spine: Node3D
var _neck: Node3D
var _mount: Node3D
var _thigh := [null, null]
var _knee := [null, null]
var _arm_upper := [null, null]
var _arm_lower := [null, null]
var _shoulder := [Vector3(-0.21, 0.44, 0.0), Vector3(0.21, 0.44, 0.0)]
var _weapon_node: Node3D
var _flash: MeshInstance3D
var _flash_time := 0.0
var _phase := 0.0
var _yaw := 0.0
var _death_t := -1.0
var _death_dir := 1.0
var _flinch := 0.0
var _meshes: Array[MeshInstance3D] = []
var _mats: Dictionary = {}

func setup(c: Combatant) -> void:
	combatant = c
	name = "Model"
	_build()
	_yaw = c.yaw
	c.damaged.connect(func(_a, _b, _g): _flinch = 1.0)
	c.died.connect(func(_v, _k, _w, _h): _on_died())

func _m(id: String) -> StandardMaterial3D:
	if _mats.has(id):
		return _mats[id]
	var att := combatant.team == GameConst.Team.ATTACKERS
	var m := StandardMaterial3D.new()
	m.roughness = 0.85
	match id:
		"jacket": m.albedo_color = Color(0.52, 0.45, 0.33) if att else Color(0.15, 0.19, 0.27)
		"pants": m.albedo_color = Color(0.36, 0.32, 0.25) if att else Color(0.12, 0.14, 0.18)
		"vest": m.albedo_color = Color(0.23, 0.19, 0.14) if att else Color(0.2, 0.22, 0.24)
		"accent": m.albedo_color = Color(0.85, 0.42, 0.1) if att else Color(0.25, 0.5, 0.9)
		"boots": m.albedo_color = Color(0.09, 0.08, 0.07)
		"gloves": m.albedo_color = Color(0.07, 0.07, 0.075)
		"skin": m.albedo_color = Color(0.72, 0.55, 0.44)
		"mask": m.albedo_color = Color(0.07, 0.07, 0.07)
		"helmet":
			m.albedo_color = Color(0.2, 0.24, 0.29)
			m.roughness = 0.55
		"goggles":
			m.albedo_color = Color(0.9, 0.45, 0.1) if att else Color(0.1, 0.12, 0.14)
			m.metallic = 0.5
			m.roughness = 0.1
	_mats[id] = m
	return m

func _mesh(parent: Node3D, mesh: Mesh, pos: Vector3, mat_id: String, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _m(mat_id)
	mi.position = pos
	mi.rotation_degrees = rot
	parent.add_child(mi)
	_meshes.append(mi)
	return mi

static func _bx(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b

static func _cap(radius: float, height: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = radius
	c.height = maxf(height, radius * 2.0)
	c.radial_segments = 10
	c.rings = 3
	return c

static func _sph(radius: float, height: float) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = radius
	s.height = height
	s.radial_segments = 14
	s.rings = 8
	return s

func _node(parent: Node3D, n: String, pos: Vector3) -> Node3D:
	var p := Node3D.new()
	p.name = n
	p.position = pos
	parent.add_child(p)
	return p

func _hb(parent: Node3D, hb: Hitbox) -> void:
	parent.add_child(hb)
	hitboxes.append(hb)

func _build() -> void:
	var att := combatant.team == GameConst.Team.ATTACKERS
	var C := GameConst.HitGroup
	_hips = _node(self, "Hips", Vector3(0, HIP_STAND, 0))
	_mesh(_hips, _bx(Vector3(0.34, 0.17, 0.22)), Vector3(0, 0, 0), "pants")
	_mesh(_hips, _bx(Vector3(0.36, 0.05, 0.24)), Vector3(0, 0.07, 0), "vest")
	_spine = _node(_hips, "Spine", Vector3(0, 0.08, 0))
	var torso := _mesh(_spine, _cap(0.2, 0.62), Vector3(0, 0.27, 0), "jacket")
	torso.scale = Vector3(1.0, 1.0, 0.68)
	_mesh(_spine, _bx(Vector3(0.41, 0.34, 0.28)), Vector3(0, 0.28, 0), "vest")
	_mesh(_spine, _bx(Vector3(0.36, 0.05, 0.3)), Vector3(0, 0.12, 0), "vest")
	if att:
		_mesh(_spine, _bx(Vector3(0.32, 0.42, 0.16)), Vector3(0, 0.3, 0.22), "pants")
		_mesh(_spine, _bx(Vector3(0.28, 0.08, 0.18)), Vector3(0, 0.52, 0.22), "accent")
	else:
		_mesh(_spine, _bx(Vector3(0.1, 0.16, 0.07)), Vector3(0.13, 0.4, 0.17), "boots")
		var ant := _mesh(_spine, _cap(0.006, 0.42), Vector3(0.15, 0.62, 0.18), "boots")
		ant.rotation_degrees = Vector3(-8, 0, 0)
	for i in 3:
		_mesh(_spine, _bx(Vector3(0.08, 0.1, 0.05)), Vector3(-0.12 + i * 0.12, 0.2, -0.155), "vest")
	_mesh(_spine, _bx(Vector3(0.3, 0.36, 0.12)), Vector3(0, 0.3, 0.19), "vest")
	_mesh(_spine, _bx(Vector3(0.06, 0.05, 0.08)), Vector3(-0.21, 0.38, 0), "accent")
	_hb(_spine, Hitbox.make_box(combatant, C.CHEST, Vector3(0.44, 0.32, 0.3), Vector3(0, 0.33, 0)))
	_hb(_spine, Hitbox.make_box(combatant, C.STOMACH, Vector3(0.38, 0.24, 0.27), Vector3(0, 0.06, 0)))
	_neck = _node(_spine, "Neck", Vector3(0, 0.52, 0))
	_mesh(_neck, _cap(0.055, 0.12), Vector3(0, 0.03, 0), "skin" if not att else "mask")
	_mesh(_neck, _sph(0.112, 0.25), Vector3(0, 0.15, 0), "mask" if att else "skin")
	if att:
		_mesh(_neck, _bx(Vector3(0.19, 0.055, 0.06)), Vector3(0, 0.17, -0.09), "goggles")
		_mesh(_neck, _bx(Vector3(0.2, 0.02, 0.2)), Vector3(0, 0.2, 0.0), "goggles")
	else:
		_mesh(_neck, _sph(0.135, 0.17), Vector3(0, 0.205, 0.005), "helmet")
		_mesh(_neck, _bx(Vector3(0.17, 0.04, 0.03)), Vector3(0, 0.155, -0.105), "goggles")
		_mesh(_neck, _bx(Vector3(0.06, 0.04, 0.03)), Vector3(0, 0.27, -0.09), "helmet")
	_hb(_neck, Hitbox.make_box(combatant, C.HEAD, Vector3(0.23, 0.27, 0.25), Vector3(0, 0.15, 0)))
	_mount = _node(_spine, "WeaponMount", Vector3(0.13, 0.36, -0.34))
	for side in 2:
		var s := -1.0 if side == 0 else 1.0
		_mesh(_spine, _sph(0.085, 0.15), _shoulder[side] + Vector3(0, 0.0, 0), "jacket")
		var up := _node(_spine, "UpperArm%d" % side, _shoulder[side])
		_mesh(up, _cap(0.058, UPPER_ARM + 0.08), Vector3(0, 0, -UPPER_ARM * 0.5), "jacket", Vector3(90, 0, 0))
		_hb(up, Hitbox.make_capsule(combatant, C.ARM, 0.065, UPPER_ARM + 0.1, Vector3(0, 0, -UPPER_ARM * 0.5), true))
		var lo := _node(_spine, "ForeArm%d" % side, _shoulder[side])
		_mesh(lo, _cap(0.05, FOREARM + 0.06), Vector3(0, 0, -FOREARM * 0.5), "jacket", Vector3(90, 0, 0))
		_mesh(lo, _bx(Vector3(0.08, 0.06, 0.1)), Vector3(0, 0, -FOREARM - 0.03), "gloves")
		_hb(lo, Hitbox.make_capsule(combatant, C.ARM, 0.055, FOREARM + 0.08, Vector3(0, 0, -FOREARM * 0.5), true))
		_arm_upper[side] = up
		_arm_lower[side] = lo
		var th := _node(_hips, "Thigh%d" % side, Vector3(s * 0.1, -0.04, 0))
		_mesh(th, _cap(0.085, THIGH + 0.1), Vector3(0, -THIGH * 0.5, 0), "pants")
		_hb(th, Hitbox.make_capsule(combatant, C.LEG, 0.09, THIGH + 0.12, Vector3(0, -THIGH * 0.5, 0)))
		var kn := _node(th, "Knee%d" % side, Vector3(0, -THIGH, 0))
		_mesh(kn, _cap(0.068, SHIN + 0.06), Vector3(0, -SHIN * 0.5, 0), "pants")
		_mesh(kn, _bx(Vector3(0.1, 0.1, 0.06)), Vector3(0, -0.02, -0.07), "vest")
		_mesh(kn, _bx(Vector3(0.11, 0.1, 0.26)), Vector3(0, -SHIN - 0.02, -0.05), "boots")
		_hb(kn, Hitbox.make_capsule(combatant, C.LEG, 0.075, SHIN + 0.1, Vector3(0, -SHIN * 0.5, 0)))
		_thigh[side] = th
		_knee[side] = kn
	# Collapse the primitive parts under each bone into one mesh per material.
	_meshes = MeshMerge.merge_tree(self)
	# Muzzle flash billboard for third-person shots.
	_flash = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.3, 0.3)
	_flash.mesh = q
	_flash.material_override = Fx.muzzle_material()
	_flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_flash.visible = false
	add_child(_flash)
	_flash.top_level = true

func set_first_person(on: bool) -> void:
	first_person = on
	var mode := GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if on else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for mi in _meshes:
		mi.cast_shadow = mode
	if _weapon_node:
		_apply_weapon_shadow_mode()

func set_weapon(model_id: StringName) -> void:
	if _weapon_node:
		_weapon_node.queue_free()
		_weapon_node = null
	if model_id == &"":
		return
	_weapon_node = WeaponModels.build(model_id)
	_mount.add_child(_weapon_node)
	_apply_weapon_shadow_mode()

func _apply_weapon_shadow_mode() -> void:
	for n in _weapon_node.find_children("*", "MeshInstance3D", true, false):
		(n as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if first_person else GeometryInstance3D.SHADOW_CASTING_SETTING_ON

func show_muzzle_flash(scale_k: float = 1.0) -> void:
	if first_person or _weapon_node == null:
		return
	var muzzle := _weapon_node.get_node_or_null("Muzzle") as Node3D
	if muzzle == null:
		return
	_flash.global_position = muzzle.global_position
	_flash.scale = Vector3.ONE * scale_k * randf_range(0.8, 1.2)
	var cam := get_viewport().get_camera_3d()
	if cam:
		_flash.look_at(cam.global_position, Vector3.UP, true)
		_flash.rotate_object_local(Vector3.FORWARD, randf() * TAU)
	_flash.visible = true
	_flash_time = 0.05
	Fx.flash_light(muzzle.global_position, 1.6 * scale_k)

func _physics_process(delta: float) -> void:
	if combatant == null:
		return
	if _flash_time > 0.0:
		_flash_time -= delta
		if _flash_time <= 0.0:
			_flash.visible = false
	if _death_t >= 0.0:
		_animate_death(delta)
		return
	var tp := Prof.begin()
	_animate(delta)
	Prof.end("model.anim", tp)

func _animate(delta: float) -> void:
	_yaw = lerp_angle(_yaw, combatant.yaw, 1.0 - exp(-20.0 * delta))
	rotation.y = _yaw
	var speed := combatant.horizontal_speed()
	var crouch := combatant.crouch_amount
	var air := combatant.is_airborne()
	_phase += delta * speed * 2.6
	var amp := clampf(speed / 5.5, 0.0, 1.0) * deg_to_rad(34.0) * (1.0 - crouch * 0.5)
	if air:
		amp *= 0.2
	# Direction of travel relative to facing: walking backward reverses the cycle.
	var local_v := Basis(Vector3.UP, combatant.yaw).inverse() * combatant.velocity
	var fwd_sign := -1.0 if local_v.z > 0.3 else 1.0
	_hips.position.y = lerpf(HIP_STAND, HIP_CROUCH, crouch) - absf(sin(_phase)) * 0.025 * clampf(speed / 5.5, 0.0, 1.0)
	for side in 2:
		var ph := _phase + (0.0 if side == 0 else PI)
		var swing := sin(ph) * amp * fwd_sign
		var crouch_thigh := deg_to_rad(80.0) * crouch
		var air_tuck := deg_to_rad(35.0) if air else 0.0
		_thigh[side].rotation.x = swing + crouch_thigh + air_tuck
		var bend := maxf(0.0, -cos(ph)) * amp * 1.3
		_knee[side].rotation.x = -(bend + deg_to_rad(105.0) * crouch + air_tuck * 1.6)
	var pitch := combatant.pitch
	_flinch = move_toward(_flinch, 0.0, delta * 6.0)
	_spine.rotation.x = pitch * 0.35 + crouch * deg_to_rad(12.0) - _flinch * 0.12
	_spine.rotation.y = sin(_phase) * amp * 0.12
	_neck.rotation.x = pitch * 0.45 - crouch * deg_to_rad(8.0)
	_mount.rotation.x = pitch * 0.2
	_solve_arms()

func _solve_arms() -> void:
	if _weapon_node == null:
		_rest_arm(0)
		_rest_arm(1)
		return
	var grip := _spine.to_local(_mount.to_global(Vector3(0, -0.04, 0.02)))
	var fore_node := _weapon_node.get_node_or_null("Fore") as Node3D
	var fore := _spine.to_local(fore_node.global_position) if fore_node else grip + Vector3(-0.1, 0, -0.2)
	_ik(1, grip, Vector3(0.6, -1.0, 0.2))
	_ik(0, fore, Vector3(-0.8, -1.0, 0.0))

func _rest_arm(side: int) -> void:
	var s := -1.0 if side == 0 else 1.0
	_ik(side, _shoulder[side] + Vector3(s * 0.08, -0.5, -0.12), Vector3(s, -0.2, 0.5))

## Two-bone IK in spine space; limb nodes point their local -Z down the bone.
func _ik(side: int, target: Vector3, pole: Vector3) -> void:
	var s: Vector3 = _shoulder[side]
	var to_t := target - s
	var d := clampf(to_t.length(), 0.05, UPPER_ARM + FOREARM - 0.001)
	var dir := to_t.normalized()
	var a := UPPER_ARM
	var b := FOREARM
	var cos_a := clampf((a * a + d * d - b * b) / (2.0 * a * d), -1.0, 1.0)
	var bend_axis := dir.cross(pole.normalized()).normalized()
	if bend_axis.length() < 0.01:
		bend_axis = Vector3.RIGHT
	var elbow_dir := dir.rotated(bend_axis, -acos(cos_a))
	var elbow := s + elbow_dir * a
	var hand := s + dir * d
	_aim_bone(_arm_upper[side], s, elbow)
	_aim_bone(_arm_lower[side], elbow, hand)

static func _aim_bone(n: Node3D, from: Vector3, to: Vector3) -> void:
	n.position = from
	var fwd := (to - from).normalized()
	var up := Vector3.UP if absf(fwd.dot(Vector3.UP)) < 0.98 else Vector3.FORWARD
	n.basis = Basis.looking_at(fwd, up)

func reset_pose() -> void:
	_death_t = -1.0
	rotation = Vector3(0, combatant.yaw, 0)
	_yaw = combatant.yaw
	_hips.position.y = HIP_STAND
	for hb in hitboxes:
		hb.monitorable = true
		hb.collision_layer = GameConst.LAYER_HITBOX
	if _weapon_node:
		_weapon_node.visible = true

func muzzle_global() -> Vector3:
	if _weapon_node:
		var m := _weapon_node.get_node_or_null("Muzzle") as Node3D
		if m:
			return m.global_position
	return global_position + Vector3(0, 1.5, 0)

func _on_died() -> void:
	_death_t = 0.0
	_death_dir = 1.0 if randf() < 0.6 else -1.0
	for hb in hitboxes:
		hb.set_deferred("monitorable", false)
		hb.set_deferred("collision_layer", 0)
	if _weapon_node:
		_weapon_node.visible = false

func _animate_death(delta: float) -> void:
	_death_t += delta
	var t := clampf(_death_t / 0.55, 0.0, 1.0)
	var e := 1.0 - pow(1.0 - t, 3.0)
	rotation.x = e * deg_to_rad(84.0) * _death_dir
	_hips.position.y = lerpf(HIP_STAND, 0.22, e)
	position.y = 0.0
	for side in 2:
		_thigh[side].rotation.x = lerpf(_thigh[side].rotation.x, deg_to_rad(10.0), e)
		_knee[side].rotation.x = lerpf(_knee[side].rotation.x, deg_to_rad(-15.0 - side * 25.0), e)
	_spine.rotation.x = lerpf(_spine.rotation.x, deg_to_rad(-10.0), e)
