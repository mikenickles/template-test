class_name Bomb
extends Node3D
## The breach charge: carried by one attacker, dropped on death, planted in a
## bombsite, ticking with accelerating beeps, defusable by defenders (kit
## halves the time), and exploding with radius damage.

signal plant_started(planter: Combatant)
signal planted(site: StringName, planter: Combatant)
signal defuse_started(defuser: Combatant)
signal defused(defuser: Combatant)
signal exploded(pos: Vector3)
signal dropped(pos: Vector3)
signal picked_up(c: Combatant)

enum State { NONE, CARRIED, DROPPED, PLANTED, DEFUSED, EXPLODED }

var cfg: MatchConfig
var map_info: MapInfo
var state := State.NONE
var carrier: Combatant = null
var site: StringName = &""
var time_left := 0.0
var plant_progress := 0.0
var planter: Combatant = null
var defuse_progress := 0.0
var defuser: Combatant = null

var _model: Node3D
var _light: OmniLight3D
var _beep_t := 0.0
var _blink_t := 0.0
var _key_t := 0.0
var _pickup_block := 0.0

func setup(p_cfg: MatchConfig, p_map: MapInfo) -> void:
	cfg = p_cfg
	map_info = p_map
	name = "BreachCharge"
	_model = WeaponModels.build(&"bomb")
	_model.scale = Vector3.ONE * 1.6
	add_child(_model)
	_light = OmniLight3D.new()
	_light.light_color = Color(1.0, 0.15, 0.08)
	_light.omni_range = 2.5
	_light.light_energy = 0.0
	_light.position = Vector3(0, 0.15, 0)
	add_child(_light)
	top_level = true
	visible = false

func reset() -> void:
	state = State.NONE
	carrier = null
	site = &""
	plant_progress = 0.0
	defuse_progress = 0.0
	planter = null
	defuser = null
	visible = false
	_light.light_energy = 0.0

func is_planted() -> bool:
	return state == State.PLANTED

func position_now() -> Vector3:
	if state == State.CARRIED and carrier:
		return carrier.global_position
	return global_position

func give_to(c: Combatant) -> void:
	carrier = c
	state = State.CARRIED
	visible = false
	if not c.weapons.has_slot(GameConst.Slot.BOMB):
		c.weapons.give(&"bomb")
	picked_up.emit(c)
	Events.bomb_picked_up.emit(c)

## Drops the charge at `pos` (carrier died or pressed drop).
func drop(pos: Vector3, toss: Vector3 = Vector3.ZERO) -> void:
	if carrier and carrier.weapons.has_slot(GameConst.Slot.BOMB):
		carrier.weapons.take(GameConst.Slot.BOMB)
	_cancel_plant()
	carrier = null
	state = State.DROPPED
	var space := get_world_3d().direct_space_state
	var target := pos + toss
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(target + Vector3(0, 1.0, 0), target + Vector3(0, -4, 0), GameConst.LAYER_WORLD))
	global_position = hit.position + Vector3(0, 0.07, 0) if not hit.is_empty() else pos
	rotation = Vector3(0, randf() * TAU, 0)
	visible = true
	_pickup_block = 0.6
	dropped.emit(global_position)
	Events.bomb_dropped.emit(global_position)

func _cancel_plant() -> void:
	if planter:
		planter.move_locked = false
		if plant_progress > 0.0:
			Events.bomb_plant_aborted.emit(planter)
	plant_progress = 0.0
	planter = null

func _cancel_defuse() -> void:
	if defuser:
		defuser.move_locked = false
		if defuse_progress > 0.0:
			Events.bomb_defuse_aborted.emit(defuser)
	defuse_progress = 0.0
	defuser = null

## Advances the charge. `attackers` / `defenders` are living combatants.
func update(delta: float, attackers: Array, defenders: Array, live: bool) -> void:
	match state:
		State.CARRIED:
			if carrier == null or not carrier.alive:
				drop(carrier.global_position if carrier else global_position)
				return
			if live:
				_update_planting(delta)
		State.DROPPED:
			_pickup_block -= delta
			if _pickup_block <= 0.0:
				for a: Combatant in attackers:
					if a.global_position.distance_to(global_position) < 1.1:
						give_to(a)
						break
		State.PLANTED:
			_update_planted(delta, defenders)

func _update_planting(delta: float) -> void:
	var c := carrier
	var holding := c.weapons.active != null and c.weapons.active.data.category == "bomb" and (c.intent.fire or c.intent.use)
	var here := map_info.site_at(c.global_position + Vector3(0, 0.1, 0))
	if not holding or here == &"" or not c.is_on_floor():
		if planter:
			_cancel_plant()
		return
	if planter == null:
		planter = c
		c.move_locked = true
		plant_started.emit(c)
		Events.bomb_plant_started.emit(c, here)
		_key_t = 0.0
	plant_progress += delta
	_key_t -= delta
	if _key_t <= 0.0:
		_key_t = 0.38
		Audio.play_3d("bomb/bomb_keypress", c.global_position + Vector3(0, 0.8, 0), -6.0, 0.05, 18.0)
	if plant_progress >= cfg.plant_time:
		_complete_plant(here)

func _complete_plant(here: StringName) -> void:
	var c := carrier
	c.move_locked = false
	c.weapons.take(GameConst.Slot.BOMB)
	var space := get_world_3d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(c.global_position + Vector3(0, 0.5, 0), c.global_position + Vector3(0, -2, 0), GameConst.LAYER_WORLD))
	global_position = (hit.position if not hit.is_empty() else c.global_position) + Vector3(0, 0.07, 0)
	rotation = Vector3(0, c.yaw, 0)
	visible = true
	state = State.PLANTED
	site = here
	time_left = cfg.bomb_timer
	_beep_t = 0.0
	var who := c
	planter = null
	carrier = null
	plant_progress = 0.0
	Audio.play_3d("bomb/bomb_planted", global_position, -2.0, 0.0, 60.0, false)
	planted.emit(here, who)
	Events.bomb_planted.emit(who, here, global_position)

func _update_planted(delta: float, defenders: Array) -> void:
	time_left -= delta
	# Beeps accelerate as the timer runs down.
	_beep_t -= delta
	var interval := lerpf(0.12, 1.0, clampf(time_left / cfg.bomb_timer, 0.0, 1.0))
	if time_left < 1.2:
		interval = 0.08
	if _beep_t <= 0.0:
		_beep_t = interval
		_blink_t = 0.08
		Audio.play_3d("bomb/bomb_beep", global_position + Vector3(0, 0.2, 0), -4.0, 0.0, 40.0, false)
		Events.noise_emitted.emit(self, global_position, 30.0, &"bomb")
	_blink_t -= delta
	_light.light_energy = 2.5 if _blink_t > 0.0 else 0.15
	# Defusing: first defender holding use next to the charge.
	var candidate: Combatant = defuser if defuser and defuser.alive and _can_defuse(defuser) else null
	if candidate == null:
		if defuser:
			_cancel_defuse()
		for d: Combatant in defenders:
			if _can_defuse(d):
				candidate = d
				break
	if candidate:
		if defuser == null:
			defuser = candidate
			candidate.move_locked = true
			defuse_progress = 0.0
			defuse_started.emit(candidate)
			Events.bomb_defuse_started.emit(candidate, candidate.has_defuse_kit)
			Audio.play_3d("bomb/defuse_start", global_position, -4.0, 0.0, 20.0)
		defuse_progress += delta
		var need := cfg.defuse_time_kit if defuser.has_defuse_kit else cfg.defuse_time
		if defuse_progress >= need and time_left > 0.0:
			_complete_defuse()
			return
	if time_left <= 0.0:
		_explode()

func _can_defuse(d: Combatant) -> bool:
	if not d.alive or not d.intent.use or not d.is_on_floor():
		return false
	var flat := Vector2(d.global_position.x - global_position.x, d.global_position.z - global_position.z).length()
	return flat < 1.7 and absf(d.global_position.y - global_position.y) < 1.2

func defuse_fraction() -> float:
	if defuser == null:
		return 0.0
	var need := cfg.defuse_time_kit if defuser.has_defuse_kit else cfg.defuse_time
	return clampf(defuse_progress / need, 0.0, 1.0)

func _complete_defuse() -> void:
	var who := defuser
	who.move_locked = false
	defuser = null
	state = State.DEFUSED
	_light.light_energy = 0.0
	Audio.play_3d("bomb/defuse_wire", global_position, -2.0, 0.0, 25.0)
	Audio.play_3d("bomb/bomb_defused", global_position, -2.0, 0.0, 60.0, false)
	defused.emit(who)
	Events.bomb_defused.emit(who)

func _explode() -> void:
	if defuser:
		defuser.move_locked = false
		defuser = null
	state = State.EXPLODED
	visible = false
	_light.light_energy = 0.0
	var pos := global_position
	Audio.play_3d("bomb/explosion", pos, 4.0, 0.0, 200.0, false)
	Fx.explosion(pos)
	for c in get_tree().get_nodes_in_group(&"combatants"):
		var cb := c as Combatant
		if cb == null or not cb.alive:
			continue
		var d := cb.global_position.distance_to(pos)
		if d > cfg.bomb_radius:
			continue
		var k := 1.0 - d / cfg.bomb_radius
		var info := DamageInfo.make(cfg.bomb_damage * k * k, null, &"bomb")
		info.is_explosion = true
		info.armor_penetration = 0.6
		info.position = pos
		cb.apply_damage(info)
	exploded.emit(pos)
	Events.bomb_exploded.emit(pos)

func _process(_delta: float) -> void:
	if state == State.CARRIED and carrier and is_instance_valid(carrier):
		global_position = carrier.global_position
