class_name ViewModel
extends Node3D
## First-person weapon and arms, parented to the PlayerCamera.
##
## Uses the "tiny viewmodel" technique: the whole rig is scaled to 1/10 and
## sits 10x closer to the eye, which looks identical in perspective but can
## never poke through walls (the player's hull is far larger). All motion is
## procedural: look sway, movement bob, recoil kick, draw, magazine reloads,
## shell-by-shell reloads, pump/bolt cycling, pistol slide, knife swings.

const SCALE := 0.1

var combatant: Combatant
var controller: WeaponController
var camera: PlayerCamera

var _holder: Node3D
var _weapon: Node3D
var _weapon_inst: WeaponInstance
var _flash_front: MeshInstance3D
var _flash_side: MeshInstance3D
var _flash_t := 0.0
var _arms: Array[Node3D] = []

var _base := Vector3(0.11, -0.12, -0.3)
var _last_look := Vector2.ZERO
var _sway := Vector2.ZERO
var _kick := 0.0
var _kick_vel := 0.0
var _draw_t := 1.0
var _swing_t := 1.0
var _swing_heavy := false
var _action_t := 1.0
var _slide_t := 1.0
var _mag_home := Vector3.ZERO
var _bolt_home := Vector3.ZERO
var _pump_home := Vector3.ZERO
var _slide_home := Vector3.ZERO

func setup(c: Combatant, cam: PlayerCamera) -> void:
	combatant = c
	controller = c.weapons
	camera = cam
	name = "ViewModel"
	scale = Vector3.ONE * SCALE
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	_holder = Node3D.new()
	add_child(_holder)
	controller.switched.connect(_on_switched)
	controller.fired.connect(_on_fired)
	controller.melee_swing.connect(_on_swing)
	controller.reload_started.connect(func(_w): pass)
	if controller.active:
		_on_switched(controller.active)

func _on_switched(w: WeaponInstance) -> void:
	if _weapon:
		_weapon.queue_free()
	_arms.clear()
	_weapon_inst = w
	if w == null:
		_weapon = null
		return
	_weapon = WeaponModels.build(w.data.model)
	_holder.add_child(_weapon)
	for mi in _weapon.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	match w.data.category:
		"pistol": _base = Vector3(0.12, -0.14, -0.34)
		"melee": _base = Vector3(0.15, -0.15, -0.3)
		"bomb": _base = Vector3(0.08, -0.17, -0.32)
		"sniper": _base = Vector3(0.14, -0.165, -0.33)
		_: _base = Vector3(0.14, -0.165, -0.37)
	_build_arms(w)
	_mag_home = _part_pos("Mag")
	_bolt_home = _part_pos("Bolt")
	_pump_home = _part_pos("Pump")
	_slide_home = _part_pos("Slide")
	_build_flash()
	_draw_t = 0.0

func _part_pos(n: String) -> Vector3:
	var node := _weapon.get_node_or_null(n) as Node3D
	return node.position if node else Vector3.ZERO

func _build_arms(w: WeaponInstance) -> void:
	var att := combatant.team == GameConst.Team.ATTACKERS
	var sleeve := StandardMaterial3D.new()
	sleeve.albedo_color = Color(0.5, 0.43, 0.31) if att else Color(0.15, 0.19, 0.27)
	sleeve.roughness = 0.9
	var glove := WeaponModels.mat("polymer")
	var grip := Vector3(0, -0.05, 0.02)
	var fore_node := _weapon.get_node_or_null("Fore") as Node3D
	var fore := fore_node.position if fore_node else Vector3(-0.03, -0.03, -0.25)
	var right_elbow := grip + Vector3(0.09, -0.2, 0.3)
	var left_elbow := fore + Vector3(-0.16, -0.2, 0.2)
	if w.data.category == "pistol":
		left_elbow = grip + Vector3(-0.15, -0.2, 0.28)
		fore = grip + Vector3(-0.025, -0.01, 0.0)
	if w.data.category == "melee":
		fore = Vector3(-0.3, -0.25, 0.1)
		left_elbow = fore + Vector3(-0.1, -0.2, 0.2)
	_arms.append(_limb(right_elbow, grip, sleeve, glove))
	if w.data.category != "melee":
		_arms.append(_limb(left_elbow, fore, sleeve, glove))

func _limb(elbow: Vector3, hand: Vector3, sleeve: Material, glove: Material) -> Node3D:
	var n := Node3D.new()
	_weapon.add_child(n)
	n.position = elbow
	var dir := (hand - elbow).normalized()
	n.basis = Basis.looking_at(dir, Vector3.UP)
	var length := elbow.distance_to(hand)
	var arm := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.042
	cap.height = length + 0.05
	arm.mesh = cap
	arm.material_override = sleeve
	arm.rotation_degrees = Vector3(90, 0, 0)
	arm.position = Vector3(0, 0, -length * 0.5)
	arm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	n.add_child(arm)
	var hand_mesh := MeshInstance3D.new()
	var hb := BoxMesh.new()
	hb.size = Vector3(0.075, 0.05, 0.1)
	hand_mesh.mesh = hb
	hand_mesh.material_override = glove
	hand_mesh.position = Vector3(0, 0, -length - 0.02)
	hand_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	n.add_child(hand_mesh)
	return n

func _build_flash() -> void:
	var muzzle := _weapon.get_node_or_null("Muzzle") as Node3D
	if muzzle == null or not _weapon_inst.data.is_gun():
		_flash_front = null
		_flash_side = null
		return
	var k := _weapon_inst.data.muzzle_flash_scale
	_flash_front = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.16, 0.16) * k
	_flash_front.mesh = q
	_flash_front.material_override = Fx.muzzle_material()
	_flash_front.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_flash_front.visible = false
	muzzle.add_child(_flash_front)
	_flash_side = MeshInstance3D.new()
	var q2 := QuadMesh.new()
	q2.size = Vector2(0.24, 0.12) * k
	_flash_side.mesh = q2
	_flash_side.material_override = Fx.muzzle_side_material()
	_flash_side.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_flash_side.rotation_degrees = Vector3(0, 90, 0)
	_flash_side.position = Vector3(0, 0, -0.1 * k)
	_flash_side.visible = false
	muzzle.add_child(_flash_side)

func _on_fired(w: WeaponInstance, _impacts: Array, _inacc: float) -> void:
	_kick_vel += 1.0 + w.data.view_kick * 0.35
	if _flash_front:
		_flash_front.visible = true
		_flash_side.visible = true
		_flash_front.rotation.z = randf() * TAU
		var s := randf_range(0.8, 1.25)
		_flash_front.scale = Vector3.ONE * s
		_flash_side.scale = Vector3(randf_range(0.8, 1.3), s, 1.0)
		_flash_t = 0.045
	var fwd := -camera.global_basis.z
	Fx.flash_light(camera.global_position + fwd * 0.9, 2.2 * w.data.muzzle_flash_scale)
	if w.data.bolt_action:
		_action_t = 0.0
	if w.data.category == "pistol":
		_slide_t = 0.0
	if w.data.shell_eject and not w.data.bolt_action:
		var right := camera.global_basis.x
		var up := camera.global_basis.y
		var pos := camera.global_position + right * 0.14 - up * 0.06 + fwd * 0.3
		Fx.eject_casing(pos, right * randf_range(1.6, 2.4) + up * randf_range(1.2, 2.0) + combatant.velocity, true)

func _on_swing(_w: WeaponInstance, heavy: bool, _impact: Dictionary) -> void:
	_swing_t = 0.0
	_swing_heavy = heavy

func _process(delta: float) -> void:
	if camera == null or _weapon == null or _weapon_inst == null:
		return
	visible = not _weapon_inst.is_scoped() and combatant.alive
	if _flash_t > 0.0:
		_flash_t -= delta
		if _flash_t <= 0.0 and _flash_front:
			_flash_front.visible = false
			_flash_side.visible = false
	# Look sway: the weapon lags behind fast mouse motion.
	var look := Vector2(camera.rotation.y, camera.rotation.x)
	var d := Vector2(wrapf(look.x - _last_look.x, -PI, PI), look.y - _last_look.y)
	_last_look = look
	var target := Vector2(clampf(-d.x * 2.5, -0.06, 0.06), clampf(-d.y * 2.5, -0.05, 0.05))
	_sway = _sway.lerp(target, 1.0 - exp(-12.0 * delta))
	# Recoil kick spring (critically-damped-ish).
	var ks := Spring.step(_kick, _kick_vel, 260.0, 24.0, delta)
	_kick = ks.x
	_kick_vel = ks.y
	_draw_t = minf(_draw_t + delta / maxf(_weapon_inst.data.draw_time * 0.75, 0.05), 1.0)
	_swing_t = minf(_swing_t + delta / (0.55 if _swing_heavy else 0.32), 1.0)
	_action_t = minf(_action_t + delta / 0.7, 1.0)
	_slide_t = minf(_slide_t + delta / 0.09, 1.0)
	var bob := camera.bob_sway()
	var t := Time.get_ticks_msec() / 1000.0
	var breathe := Vector2(sin(t * 1.3) * 0.0015, sin(t * 2.1) * 0.0012)
	var pos := _base + Vector3(_sway.x * 0.25 + bob.x + breathe.x, _sway.y * 0.25 - bob.y + breathe.y, 0)
	var rot := Vector3(_sway.y * 0.6, _sway.x * 0.8, _sway.x * 0.5)
	pos.z += _kick * 0.035
	rot.x += _kick * 0.06
	if combatant.is_crouched():
		pos.y -= 0.005
	# Draw: rise from below.
	var de := 1.0 - pow(1.0 - _draw_t, 3.0)
	pos.y -= (1.0 - de) * 0.16
	rot.x -= (1.0 - de) * deg_to_rad(45.0)
	var off := _animate_reload()
	pos += off[0]
	rot += off[1]
	if _weapon_inst.data.is_melee():
		var se := sin(_swing_t * PI)
		if _swing_heavy:
			pos.z -= se * 0.12
			rot.x -= se * 0.3
		else:
			rot.y += se * deg_to_rad(-55.0)
			rot.z += se * deg_to_rad(-30.0)
			pos.x -= se * 0.08
	_holder.transform = Transform3D(Basis.from_euler(rot), pos)

## Returns [position offset, rotation offset] for reload/action animation.
func _animate_reload() -> Array:
	var pos := Vector3.ZERO
	var rot := Vector3.ZERO
	var w := _weapon_inst
	var mag := _weapon.get_node_or_null("Mag") as Node3D
	var bolt := _weapon.get_node_or_null("Bolt") as Node3D
	var pump := _weapon.get_node_or_null("Pump") as Node3D
	var slide := _weapon.get_node_or_null("Slide") as Node3D
	var p := w.reload_progress()
	var reloading := w.state == WeaponInstance.State.RELOADING
	if reloading and not w.data.shell_reload:
		var tilt := smoothstep(0.0, 0.12, p) * (1.0 - smoothstep(0.82, 1.0, p))
		rot.z += tilt * deg_to_rad(28.0)
		rot.x += tilt * deg_to_rad(10.0)
		pos.y += tilt * 0.015
		pos.x -= tilt * 0.02
		if mag:
			var out := smoothstep(0.12, 0.32, p) * (1.0 - smoothstep(0.48, 0.62, p))
			mag.position = _mag_home + Vector3(0, -0.28 * out, 0.03 * out)
			mag.visible = out < 0.95 or w.data.category != "pistol"
			if w.data.category == "pistol":
				mag.visible = out > 0.02
		if bolt:
			var pull := smoothstep(0.68, 0.76, p) * (1.0 - smoothstep(0.78, 0.86, p))
			bolt.position = _bolt_home + Vector3(0, 0, 0.06 * pull)
	elif reloading and w.data.shell_reload:
		var bob := sin(p * PI)
		rot.z += deg_to_rad(18.0)
		rot.x += bob * 0.08
		pos.y += 0.01 - bob * 0.01
		if mag:
			mag.visible = true
			mag.position = _mag_home + Vector3(0, -0.05 + bob * 0.05, 0)
	else:
		if mag:
			mag.position = _mag_home
			mag.visible = w.data.category != "pistol" and w.data.category != "shotgun"
		if bolt:
			bolt.position = _bolt_home
	# Pump / bolt cycle after a shot.
	if _action_t < 1.0:
		var a := smoothstep(0.25, 0.5, _action_t) * (1.0 - smoothstep(0.55, 0.85, _action_t))
		if pump:
			pump.position = _pump_home + Vector3(0, 0, 0.09 * a)
		if bolt:
			bolt.position = _bolt_home + Vector3(0, 0, 0.07 * a)
			bolt.rotation.z = a * deg_to_rad(70.0)
		rot.x += a * deg_to_rad(4.0)
		rot.z += a * deg_to_rad(6.0)
	elif pump:
		pump.position = _pump_home
	# Pistol slide: cycles on each shot, locks back when empty.
	if slide:
		var back := 1.0 if w.mag == 0 and not reloading else sin(clampf(_slide_t, 0.0, 1.0) * PI)
		slide.position = _slide_home + Vector3(0, 0, 0.035 * back)
	return [pos, rot]
