class_name PlayerCamera
extends Camera3D
## First-person camera. Top-level node placed every rendered frame from the
## body's *interpolated* transform, with mouse look applied immediately (no
## extra latency from physics interpolation). Adds smoothed eye height,
## subtle head bob, landing dip, view punch (recoil) and zoom.

var combatant: Combatant
var brain: PlayerBrain
## Recoil source; the camera shows `view_punch` of its aim punch plus a
## short visual kick per shot.
var weapons: WeaponController
var _kick := Vector2.ZERO
var _kick_vel := Vector2.ZERO
## View punch in radians (x = pitch, y = yaw); decays toward zero.
var punch := Vector2.ZERO
var punch_recovery := 9.0
## 0 = no zoom; otherwise the target vertical FOV in degrees.
var zoom_fov := 0.0
var bob_enabled := true

var _eye := Combatant.EYE_STAND
var _bob_phase := 0.0
var _bob_amount := 0.0
var _land_offset := 0.0
var _land_vel := 0.0
var _roll := 0.0

func _ready() -> void:
	top_level = true
	near = 0.02
	far = 400.0
	fov = GameSettings.fov
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	if combatant:
		combatant.landed.connect(_on_landed)
		weapons = combatant.weapons
		if weapons:
			weapons.fired.connect(_on_fired)
			weapons.zoom_changed.connect(func(level: int, zfov: float): zoom_fov = zfov if level > 0 else 0.0)

func snap() -> void:
	if combatant == null:
		return
	_eye = combatant.eye_height()
	_land_offset = 0.0
	_land_vel = 0.0
	punch = Vector2.ZERO
	_update_transform(0.0)

func _process(delta: float) -> void:
	if combatant == null or not is_instance_valid(combatant):
		return
	_eye = lerpf(_eye, combatant.eye_height(), 1.0 - exp(-22.0 * delta))
	var speed := combatant.horizontal_speed()
	var moving := combatant.is_on_floor() and speed > 0.6
	_bob_amount = move_toward(_bob_amount, clampf(speed / Combatant.RUN_SPEED, 0.0, 1.0) if moving else 0.0, delta * 4.0)
	_bob_phase += delta * (speed / Combatant.STEP_STRIDE) * PI
	# Critically damped spring for the landing dip.
	var ls := Spring.step(_land_offset, _land_vel, 140.0, 18.0, delta)
	_land_offset = ls.x
	_land_vel = ls.y
	var ks := Spring.step2(_kick, _kick_vel, 220.0, 22.0, delta)
	_kick = ks[0]
	_kick_vel = ks[1]
	if weapons and weapons.active:
		punch = weapons.aim_punch * weapons.active.data.view_punch + _kick
	else:
		punch = punch.lerp(Vector2.ZERO, 1.0 - exp(-punch_recovery * delta)) + _kick
	# Strafe roll.
	var local_v := Basis(Vector3.UP, combatant.yaw).inverse() * combatant.velocity
	_roll = lerpf(_roll, clampf(-local_v.x / 6.0, -1.0, 1.0) * deg_to_rad(0.6), 1.0 - exp(-8.0 * delta))
	var target_fov := zoom_fov if zoom_fov > 0.0 else GameSettings.fov
	fov = lerpf(fov, target_fov, 1.0 - exp(-30.0 * delta)) if absf(fov - target_fov) > 0.05 else target_fov
	_update_transform(delta)

func _update_transform(_delta: float) -> void:
	var origin := combatant.get_global_transform_interpolated().origin if is_inside_tree() else combatant.global_position
	var bob := 0.0
	if bob_enabled:
		bob = absf(sin(_bob_phase)) * 0.035 * _bob_amount - 0.017 * _bob_amount
	global_position = origin + Vector3(0, _eye + bob + _land_offset, 0)
	var p := (brain.look_pitch if brain else combatant.pitch) + punch.x
	var y := (brain.look_yaw if brain else combatant.yaw) + punch.y
	rotation = Vector3(clampf(p, deg_to_rad(-89.0), deg_to_rad(89.0)), y, _roll)

func _on_fired(w: WeaponInstance, _impacts: Array, _inacc: float) -> void:
	var k := deg_to_rad(w.data.view_kick)
	_kick_vel += Vector2(k * 9.0, randf_range(-k, k) * 3.0)

func _on_landed(fall_speed: float) -> void:
	_land_vel -= clampf(fall_speed * 0.09, 0.0, 1.4)

## Horizontal offset of the bob for the viewmodel sway (Phase 4).
func bob_sway() -> Vector2:
	return Vector2(cos(_bob_phase) * 0.012, absf(sin(_bob_phase)) * 0.01) * _bob_amount
