class_name Combatant
extends CharacterBody3D
## A player or bot body. Driven exclusively by `intent` (CombatIntent), which
## a brain (PlayerBrain / BotBrain) fills every physics tick.
##
## Movement is Source-style: ground acceleration with friction, limited air
## acceleration (a little air-strafe control), edge-triggered jumps with a
## landing fatigue penalty, smooth crouch with crouch-jump (feet tuck up when
## crouching mid-air), walk (silent), fall damage and footstep noise.
## The origin is at the feet; the body never rotates (yaw lives in `yaw`).

signal died(victim: Combatant, killer: Node, weapon_id: StringName, headshot: bool)
signal damaged(amount: float, attacker: Node, hitgroup: int)
signal landed(fall_speed: float)
signal footstep(surface: String, loudness: float)

# --- Dimensions -------------------------------------------------------------
const RADIUS := 0.4
const STAND_HEIGHT := 1.8
const CROUCH_HEIGHT := 1.2
const EYE_STAND := 1.64
const EYE_CROUCH := 1.1
# --- Movement tuning (meters, seconds) ------------------------------------------
const GRAVITY := 20.0
const JUMP_VELOCITY := 6.6 # apex ~1.09 m standing jump
const RUN_SPEED := 6.35 # unarmed / knife reference speed
const GROUND_ACCEL := 6.5
const AIR_ACCEL := 12.0
const AIR_SPEED_CAP := 0.8
const FRICTION := 5.2
const STOP_SPEED := 2.0
const WALK_FACTOR := 0.52
const CROUCH_FACTOR := 0.34
const CROUCH_RATE := 1.0 / 0.16 # crouch_amount units per second
## Fraction of the crouch height change applied as a feet lift in the air.
const AIR_CROUCH_LIFT := 0.5
const FATIGUE_PER_JUMP := 0.4
const FATIGUE_RECOVERY := 1.1
const FATIGUE_SPEED_PENALTY := 0.4
const FALL_DAMAGE_SPEED := 12.5
const FALL_DAMAGE_SCALE := 9.0
const STEP_STRIDE := 2.0
## Maximum ledge height climbed automatically while walking (Source-style).
const STEP_HEIGHT := 0.3
const FOOTSTEP_RADIUS := 22.0

## The locally controlled combatant (for near-miss effects); may be null.
static var local: Combatant = null

@export var team := GameConst.Team.ATTACKERS
@export var display_name := "Combatant"

var brain: Node = null
var intent := CombatIntent.new()
## Gameplay record (PlayerRecord) owned by the match, may be null in tests.
var record: RefCounted = null
## Map info for surface lookup and callouts; optional.
var map_info: MapInfo = null

# View
var yaw := 0.0
var pitch := 0.0

# Vitals
var health := 100.0
var armor := 0.0
var has_helmet := false
var has_defuse_kit := false
var alive := true
var last_attacker: Node = null

# Movement state
var crouch_amount := 0.0
var fatigue := 0.0
var frozen := false # round freeze time: can look, can't move/fire
var speed_limit := RUN_SPEED # set by the active weapon
var speed_scale := 1.0 # e.g. scoped snipers
## Planting/defusing: no movement or jumping (owned by the Bomb).
var move_locked := false
var tag_slow := 0.0 # brief slow when hit (0..1)
var was_on_floor := true
var air_time := 0.0
var _jump_held := false
var _crouch_lift := 0.0
var _step_accum := 0.0
var _last_fall_speed := 0.0
var _since_jump := 1.0

var _shape: CylinderShape3D
var _col: CollisionShape3D

## Weapons/inventory component and third-person body (with hitboxes).
var weapons: WeaponController
var model: CharacterModel
var hitboxes: Array[Hitbox] = []
## Builds the third-person model + hitboxes (tests may disable for speed).
var build_model := true
## Global default for build_model (perf experiments / dedicated sims).
static var default_build_model := true
var _shots_fired := 0

func _init() -> void:
	build_model = default_build_model
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = 0.35
	floor_stop_on_slope = true
	floor_block_on_wall = true
	max_slides = 6
	wall_min_slide_angle = deg_to_rad(5.0)

func _ready() -> void:
	add_to_group(&"combatants")
	_shape = CylinderShape3D.new()
	_shape.radius = RADIUS
	_shape.height = STAND_HEIGHT
	_col = CollisionShape3D.new()
	_col.name = "Body"
	_col.shape = _shape
	_col.position.y = STAND_HEIGHT * 0.5
	add_child(_col)
	set_team(team)
	weapons = WeaponController.new(self)
	weapons.name = "Weapons"
	add_child(weapons)
	if build_model:
		model = CharacterModel.new()
		add_child(model)
		model.setup(self)
		hitboxes = model.hitboxes
		weapons.switched.connect(func(w: WeaponInstance): if model: model.set_weapon(w.data.model if w else &""))
	weapons.fired.connect(_on_weapon_fired)
	weapons.melee_swing.connect(_on_melee_swing)

## Recreates the third-person model (e.g. after a side swap changes the
## team's look). Hitboxes are rebuilt with it.
func rebuild_model() -> void:
	if not build_model:
		return
	var fp := model != null and model.first_person
	if model:
		model.queue_free()
		remove_child(model)
	model = CharacterModel.new()
	add_child(model)
	model.setup(self)
	hitboxes = model.hitboxes
	weapons.reset_exclusions()
	if weapons.active:
		model.set_weapon(weapons.active.data.model)
	model.set_first_person(fp)

func set_team(t: int) -> void:
	team = t
	collision_layer = GameConst.body_layer(t)
	collision_mask = GameConst.body_mask(t)

# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

func eye_height() -> float:
	return lerpf(EYE_STAND, EYE_CROUCH, crouch_amount)

func body_height() -> float:
	return lerpf(STAND_HEIGHT, CROUCH_HEIGHT, crouch_amount)

func eye_position() -> Vector3:
	return global_position + Vector3(0, eye_height(), 0)

## Unit view direction from yaw/pitch (no recoil).
func view_direction() -> Vector3:
	return dir_from_angles(yaw, pitch)

static func dir_from_angles(p_yaw: float, p_pitch: float) -> Vector3:
	return Vector3(-sin(p_yaw) * cos(p_pitch), sin(p_pitch), -cos(p_yaw) * cos(p_pitch))

func horizontal_speed() -> float:
	return Vector2(velocity.x, velocity.z).length()

func is_crouched() -> bool:
	return crouch_amount > 0.5

func is_airborne() -> bool:
	return not is_on_floor()

## Current maximum ground speed including walk/crouch/fatigue modifiers.
func max_speed() -> float:
	if move_locked:
		return 0.0
	var s := speed_limit * speed_scale
	if intent.walk:
		s *= WALK_FACTOR
	s *= lerpf(1.0, CROUCH_FACTOR, crouch_amount)
	s *= 1.0 - fatigue * FATIGUE_SPEED_PENALTY
	s *= 1.0 - tag_slow * 0.5
	return s

# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

func _physics_process(delta: float) -> void:
	if not alive:
		_physics_dead(delta)
		return
	var t0 := Prof.begin()
	if brain and brain.has_method("update_intent"):
		brain.update_intent(self, intent, delta)
	Prof.end("brain", t0)
	t0 = Prof.begin()
	yaw = wrapf(intent.yaw, -PI, PI)
	pitch = clampf(intent.pitch, deg_to_rad(-89.0), deg_to_rad(89.0))
	_update_crouch(delta)
	_update_movement(delta)
	Prof.end("movement", t0)
	t0 = Prof.begin()
	_update_footsteps(delta)
	Prof.end("footsteps", t0)
	t0 = Prof.begin()
	_post_physics(delta)
	Prof.end("weapons", t0)
	intent.clear_triggers()

## Hook for subclasses / components (weapons tick here in later phases).
func _post_physics(delta: float) -> void:
	if weapons:
		weapons.tick(delta, intent)

func _update_crouch(delta: float) -> void:
	var want := 1.0 if intent.crouch else 0.0
	if want < crouch_amount and not _can_stand():
		want = crouch_amount
	var prev := crouch_amount
	crouch_amount = move_toward(crouch_amount, want, CROUCH_RATE * delta)
	var d := crouch_amount - prev
	if absf(d) < 0.0001:
		return
	var h := body_height()
	_shape.height = h
	_col.position.y = h * 0.5
	if not is_on_floor():
		# Crouching mid-air tucks the feet up (crouch-jump); standing back up
		# in the air lowers them again.
		var lift := d * (STAND_HEIGHT - CROUCH_HEIGHT) * AIR_CROUCH_LIFT
		if lift > 0.0:
			var col := move_and_collide(Vector3(0, lift, 0))
			_crouch_lift += lift if col == null else 0.0
		elif _crouch_lift > 0.0:
			var drop := minf(-lift, _crouch_lift)
			move_and_collide(Vector3(0, -drop, 0))
			_crouch_lift -= drop

func _can_stand() -> bool:
	if crouch_amount <= 0.0:
		return true
	var space := get_world_3d().direct_space_state
	var q := PhysicsShapeQueryParameters3D.new()
	var s := CylinderShape3D.new()
	s.radius = RADIUS - 0.02
	s.height = STAND_HEIGHT - body_height()
	q.shape = s
	q.transform = Transform3D(Basis(), global_position + Vector3(0, body_height() + s.height * 0.5 + 0.02, 0))
	q.collision_mask = collision_mask
	q.exclude = [get_rid()]
	return space.intersect_shape(q, 1).is_empty()

func _update_movement(delta: float) -> void:
	var on_floor := is_on_floor()
	fatigue = maxf(fatigue - FATIGUE_RECOVERY * delta, 0.0)
	tag_slow = maxf(tag_slow - 2.0 * delta, 0.0)
	var move := intent.move if not frozen else Vector2.ZERO
	if move.length() > 1.0:
		move = move.normalized()
	var wish := Basis(Vector3.UP, yaw) * Vector3(move.x, 0.0, -move.y)
	var wish_dir := wish.normalized() if wish.length() > 0.001 else Vector3.ZERO
	var wish_speed := wish.length() * max_speed()
	var vel_h := Vector3(velocity.x, 0.0, velocity.z)

	var jump_pressed := intent.jump and not _jump_held and not frozen and not move_locked
	_jump_held = intent.jump
	var jumped := false
	# Coyote time: a jump pressed just after walking off an edge still counts.
	var can_jump := on_floor or (air_time < 0.1 and velocity.y <= 0.0 and _since_jump > 0.3)
	_since_jump += delta
	if can_jump and jump_pressed:
		_since_jump = 0.0
		on_floor = true
		velocity.y = JUMP_VELOCITY * (1.0 - fatigue * 0.12)
		fatigue = minf(fatigue + FATIGUE_PER_JUMP, 1.0)
		jumped = true
		Events.noise_emitted.emit(self, global_position, 10.0, &"jump")
		_play_body_sound("footsteps/jump", -8.0)

	if on_floor and not jumped:
		vel_h = _apply_friction(vel_h, delta)
		vel_h = _accelerate(vel_h, wish_dir, wish_speed, GROUND_ACCEL * wish_speed, delta)
		# Keep a slight downward push so floor contact is continuous.
		velocity.y = -GRAVITY * delta
	else:
		vel_h = _accelerate(vel_h, wish_dir, minf(wish_speed, AIR_SPEED_CAP), AIR_ACCEL * wish_speed, delta)
		velocity.y -= GRAVITY * delta

	velocity.x = vel_h.x
	velocity.z = vel_h.z
	_last_fall_speed = -velocity.y
	if jumped:
		# Leave the ground cleanly this tick (no floor snap pulling us back).
		floor_snap_length = 0.0
	var intended_h := Vector3(velocity.x, 0.0, velocity.z)
	move_and_slide()
	floor_snap_length = 0.35
	if on_floor and not jumped and is_on_wall() and intended_h.length() > 0.1:
		if _try_step_up(intended_h * delta):
			velocity.x = intended_h.x
			velocity.z = intended_h.z

	var now_floor := is_on_floor()
	if now_floor and not was_on_floor:
		_on_landed(_last_fall_speed)
	if not now_floor:
		air_time += delta
	else:
		air_time = 0.0
		_crouch_lift = 0.0
	was_on_floor = now_floor

## Climbs a small ledge: lift by STEP_HEIGHT, move, then settle back down
## onto walkable ground. Returns true if the body was moved.
func _try_step_up(h_motion: Vector3) -> bool:
	var xf := global_transform
	var up := Vector3(0, STEP_HEIGHT, 0)
	if test_move(xf, up):
		return false
	var raised := xf.translated(up)
	if test_move(raised, h_motion):
		return false
	var ahead := raised.translated(h_motion)
	var col := KinematicCollision3D.new()
	if not test_move(ahead, Vector3(0, -STEP_HEIGHT - 0.05, 0), col):
		return false
	if col.get_normal().angle_to(Vector3.UP) > floor_max_angle:
		return false
	var new_pos := ahead.origin + col.get_travel()
	if new_pos.y - global_position.y < 0.02:
		return false
	global_position = new_pos
	return true

static func _apply_friction(v: Vector3, delta: float) -> Vector3:
	var speed := v.length()
	if speed < 0.05:
		return Vector3.ZERO
	var control := maxf(speed, STOP_SPEED)
	var new_speed := maxf(speed - control * FRICTION * delta, 0.0)
	return v * (new_speed / speed)

## Source-style acceleration: only adds speed along wish_dir up to wish_speed.
static func _accelerate(v: Vector3, wish_dir: Vector3, wish_speed: float, accel: float, delta: float) -> Vector3:
	if wish_dir == Vector3.ZERO:
		return v
	var current := v.dot(wish_dir)
	var add := wish_speed - current
	if add <= 0.0:
		return v
	return v + wish_dir * minf(accel * delta, add)

func _on_landed(fall_speed: float) -> void:
	landed.emit(fall_speed)
	if fall_speed > 7.5:
		_play_body_sound("footsteps/land_hard", -4.0 + clampf((fall_speed - 7.5) * 1.5, 0.0, 6.0))
		Events.noise_emitted.emit(self, global_position, 18.0, &"land")
	elif fall_speed > 3.0:
		_emit_footstep(0.8)
	if fall_speed > FALL_DAMAGE_SPEED:
		var dmg := DamageInfo.make((fall_speed - FALL_DAMAGE_SPEED) * FALL_DAMAGE_SCALE, null, &"fall")
		dmg.armor_penetration = 1.0
		dmg.is_explosion = true # bypass hit-group multiplier
		apply_damage(dmg)

func _update_footsteps(delta: float) -> void:
	if not is_on_floor():
		return
	var speed := horizontal_speed()
	# Walking / crouching (below ~55% of run speed) is silent.
	if speed < speed_limit * 0.55 or crouch_amount > 0.5:
		_step_accum = minf(_step_accum, STEP_STRIDE * 0.5)
		return
	_step_accum += speed * delta
	if _step_accum >= STEP_STRIDE:
		_step_accum -= STEP_STRIDE
		_emit_footstep(clampf(speed / RUN_SPEED, 0.5, 1.0))

func _emit_footstep(loudness: float) -> void:
	var surface := surface_under()
	footstep.emit(surface, loudness)
	Events.noise_emitted.emit(self, global_position, FOOTSTEP_RADIUS * loudness, &"footstep")
	_play_body_sound("footsteps/" + footstep_sound_for(surface), -6.0 + loudness * 4.0)

static func footstep_sound_for(surface: String) -> String:
	match surface:
		"metal", "metal_thin":
			return "metal"
		"gravel", "dirt":
			return "gravel"
		"wood":
			return "wood"
	return "concrete"

## Surface name of what we're standing on (collider metadata, else map grid).
func surface_under() -> String:
	var space := get_world_3d().direct_space_state
	var from := global_position + Vector3(0, 0.2, 0)
	var q := PhysicsRayQueryParameters3D.create(from, from + Vector3(0, -0.6, 0), GameConst.LAYER_WORLD | GameConst.LAYER_PROP)
	var hit := space.intersect_ray(q)
	if not hit.is_empty() and hit.collider and hit.collider.has_meta("surface"):
		return hit.collider.get_meta("surface")
	if map_info:
		return map_info.floor_surface_at(global_position)
	return "concrete"

## Overridden by the player to play own sounds quieter / non-positional.
func _play_body_sound(id: String, volume_db: float) -> void:
	Audio.play_3d(id, global_position + Vector3(0, 0.1, 0), volume_db, 0.08, 30.0)

func _physics_dead(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
	velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
	velocity.y -= GRAVITY * delta
	move_and_slide()

# ---------------------------------------------------------------------------
# Lifecycle and damage
# ---------------------------------------------------------------------------

## Places the combatant at a spawn transform and resets per-life state.
func spawn_at(xf: Transform3D) -> void:
	global_position = xf.origin
	var fwd := -xf.basis.z
	yaw = atan2(-fwd.x, -fwd.z)
	pitch = 0.0
	intent.yaw = yaw
	intent.pitch = 0.0
	velocity = Vector3.ZERO
	crouch_amount = 0.0
	if _shape:
		_shape.height = STAND_HEIGHT
		_col.position.y = STAND_HEIGHT * 0.5
	fatigue = 0.0
	tag_slow = 0.0
	move_locked = false
	alive = true
	health = 100.0
	last_attacker = null
	set_team(team)
	if model:
		model.reset_pose()
	if weapons:
		weapons.aim_punch = Vector2.ZERO
	if brain and brain.has_method("on_spawned"):
		brain.on_spawned(self)
	reset_physics_interpolation()

func apply_damage(info: DamageInfo) -> float:
	if not alive:
		return 0.0
	var r := DamageModel.resolve(info, armor, has_helmet)
	armor = maxf(armor - r.armor_damage, 0.0)
	var dealt := minf(r.health_damage, health)
	health -= r.health_damage
	last_attacker = info.attacker if info.attacker else last_attacker
	if not info.is_explosion and info.weapon_id != &"fall":
		tag_slow = 1.0
	damaged.emit(dealt, info.attacker, info.hitgroup)
	Events.combatant_damaged.emit(self, info.attacker, dealt, info.hitgroup)
	if health <= 0.0:
		health = 0.0
		die(info)
	return dealt

func die(info: DamageInfo) -> void:
	if not alive:
		return
	alive = false
	collision_layer = 0
	collision_mask = GameConst.LAYER_WORLD
	var killer: Node = info.attacker if info else null
	var weapon_id: StringName = info.weapon_id if info else &""
	var headshot := info != null and info.hitgroup == GameConst.HitGroup.HEAD
	_on_died(info)
	died.emit(self, killer, weapon_id, headshot)
	Events.combatant_killed.emit(self, killer, weapon_id, headshot, info != null and info.penetrated)

## Subclass/component hook (drop weapons, ragdoll, etc.).
func _on_died(_info: DamageInfo) -> void:
	pass

# ---------------------------------------------------------------------------
# Shot presentation shared by every shooter (impacts, tracers, flashes).
# ---------------------------------------------------------------------------

func _on_weapon_fired(w: WeaponInstance, pellets: Array, _inacc: float) -> void:
	_shots_fired += 1
	if model:
		model.show_muzzle_flash(w.data.muzzle_flash_scale)
	var space := get_world_3d().direct_space_state
	var muzzle := muzzle_position()
	var tracer := w.data.tracer_every > 0 and _shots_fired % w.data.tracer_every == 0
	for impacts in pellets:
		for imp: Dictionary in impacts:
			if imp.has("pos"):
				Fx.impact(imp.pos, imp.normal, imp.surface, pellets.size() == 1 or randf() < 0.35)
				if imp.surface == "flesh":
					var dir: Vector3 = (imp.pos - muzzle).normalized()
					Fx.blood_spatter(space, imp.pos, dir)
		if tracer and not impacts.is_empty():
			Fx.tracer(muzzle, impacts[-1].get("end", muzzle))
		if not impacts.is_empty():
			_near_miss(muzzle, impacts[-1].get("end", muzzle), impacts)
	if w.data.shell_eject and not w.data.bolt_action and not _is_local_view():
		var right := Basis(Vector3.UP, yaw) * Vector3.RIGHT
		Fx.eject_casing(muzzle + right * 0.05, right * 2.2 + Vector3.UP * 1.6, false)

func _on_melee_swing(_w: WeaponInstance, _heavy: bool, impact: Dictionary) -> void:
	if impact.has("pos"):
		Fx.impact(impact.pos, impact.normal, impact.surface, false)

## Plays a supersonic crack for the local player when a bullet passes close.
func _near_miss(from: Vector3, to: Vector3, impacts: Array) -> void:
	var me := Combatant.local
	if me == null or me == self or not me.alive or not is_instance_valid(me):
		return
	for imp in impacts:
		if imp.get("victim") == me:
			return
	var eye := me.eye_position()
	var seg := to - from
	var l2 := seg.length_squared()
	if l2 < 1.0:
		return
	var t := clampf((eye - from).dot(seg) / l2, 0.0, 1.0)
	var closest := from + seg * t
	if t > 0.02 and t < 0.98 and closest.distance_to(eye) < 1.6:
		Audio.play_3d("weapons/bullet_whiz", closest, -2.0, 0.1, 10.0, false)

## World-space muzzle position (third-person weapon, else near the eye).
func muzzle_position() -> Vector3:
	if model and model.has_method("muzzle_global") and not _is_local_view():
		return model.muzzle_global()
	return eye_position() + view_direction() * 0.6 + Basis(Vector3.UP, yaw) * Vector3(0.12, -0.12, 0)

func _is_local_view() -> bool:
	return model != null and model.first_person
