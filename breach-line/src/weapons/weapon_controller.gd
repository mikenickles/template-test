class_name WeaponController
extends Node
## Inventory and weapon handling for one Combatant, driven by its intent:
## switching (slots / cycle / last), firing (semi/auto, pellets, melee),
## spread, deterministic recoil (aim punch), reloading, zoom, and move-speed
## limits. Presentation (viewmodel, third-person model, HUD, sounds of the
## local player) listens to the signals below; gameplay never depends on it.

signal switched(w: WeaponInstance)
signal fired(w: WeaponInstance, impacts: Array, inaccuracy: float)
signal melee_swing(w: WeaponInstance, heavy: bool, impact: Dictionary)
signal dry_fired(w: WeaponInstance)
signal reload_started(w: WeaponInstance)
signal reload_finished(w: WeaponInstance)
signal zoom_changed(level: int, fov: float)
signal hit_confirmed(victim: Combatant, damage: float, hitgroup: int, killed: bool)
signal inventory_changed()

const SLOT_ORDER := [GameConst.Slot.PRIMARY, GameConst.Slot.SECONDARY, GameConst.Slot.MELEE, GameConst.Slot.GRENADE, GameConst.Slot.BOMB]

var combatant: Combatant
var inventory: Dictionary = {} # slot -> WeaponInstance
var active: WeaponInstance
var active_slot := -1
var last_slot := -1
## Recoil offset applied to bullets (radians, x = pitch up, y = yaw left).
var aim_punch := Vector2.ZERO
## Plays first-person sounds non-positionally (set for the local player).
var local_player := false
## When false, firing input is ignored (freeze time, menus, planting).
var can_fire := true
var rng := RandomNumberGenerator.new()

var _trigger_held := false
var _alt_held := false
var _dry_clicked := false
var _was_reloading := false
var _exclude: Array[RID] = []

func _init(c: Combatant = null) -> void:
	combatant = c
	rng.randomize()

# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

func give(id: StringName, select: bool = false) -> WeaponInstance:
	var data := WeaponDB.get_data(id)
	if data == null:
		push_error("Unknown weapon " + str(id))
		return null
	var w := WeaponInstance.new(data)
	inventory[data.slot] = w
	inventory_changed.emit()
	if select or active == null:
		_select(data.slot, true)
	return w

## Gives a weapon from an explicit WeaponData (tests, custom loadouts).
func give_data(data: WeaponData, select: bool = true) -> WeaponInstance:
	var w := WeaponInstance.new(data)
	inventory[data.slot] = w
	inventory_changed.emit()
	if select or active == null:
		_select(data.slot, true)
	return w

## Removes and returns the weapon in `slot` (for dropping/selling).
func take(slot: int) -> WeaponInstance:
	var w: WeaponInstance = inventory.get(slot)
	if w == null:
		return null
	inventory.erase(slot)
	if slot == active_slot:
		active = null
		active_slot = -1
		_select_best()
	inventory_changed.emit()
	return w

func has_slot(slot: int) -> bool:
	return inventory.has(slot)

func get_slot(slot: int) -> WeaponInstance:
	return inventory.get(slot)

func clear() -> void:
	inventory.clear()
	active = null
	active_slot = -1
	last_slot = -1
	aim_punch = Vector2.ZERO
	inventory_changed.emit()

func switch_to(slot: int) -> void:
	if inventory.has(slot) and slot != active_slot:
		_select(slot, false)

func _select(slot: int, instant: bool) -> void:
	if active_slot >= 0 and active_slot != slot:
		last_slot = active_slot
	active_slot = slot
	active = inventory[slot]
	active.begin_draw()
	if instant:
		active.state = WeaponInstance.State.IDLE
		active.state_time = 0.0
	_dry_clicked = false
	_set_zoom(0)
	_update_speed()
	switched.emit(active)
	if not instant:
		_sound(active.data.draw_sound, -8.0)

func _select_best() -> void:
	for s in SLOT_ORDER:
		if inventory.has(s) and s != GameConst.Slot.BOMB:
			_select(s, false)
			return
	if inventory.has(GameConst.Slot.BOMB):
		_select(GameConst.Slot.BOMB, false)

func _cycle(dir: int) -> void:
	if inventory.is_empty():
		return
	var idx := SLOT_ORDER.find(active_slot)
	for i in SLOT_ORDER.size():
		idx = posmod(idx + dir, SLOT_ORDER.size())
		if inventory.has(SLOT_ORDER[idx]):
			switch_to(SLOT_ORDER[idx])
			return

func _update_speed() -> void:
	if combatant == null:
		return
	if active == null:
		combatant.speed_limit = Combatant.RUN_SPEED
		return
	combatant.speed_limit = active.data.move_speed
	combatant.speed_scale = active.data.scoped_speed_factor if active.is_scoped() else 1.0

# ---------------------------------------------------------------------------
# Tick
# ---------------------------------------------------------------------------

func tick(delta: float, intent: CombatIntent) -> void:
	if intent.switch_slot >= 0:
		switch_to(intent.switch_slot)
	elif intent.cycle != 0:
		_cycle(intent.cycle)
	elif intent.last_weapon and last_slot >= 0 and inventory.has(last_slot):
		switch_to(last_slot)
	if active == null:
		_recover_punch(delta)
		return
	var cues := active.tick(delta)
	for cue in cues:
		_sound(cue, -6.0)
	var reloading := active.state == WeaponInstance.State.RELOADING
	if _was_reloading and not reloading:
		reload_finished.emit(active)
	_was_reloading = reloading
	if intent.reload and active.start_reload():
		_on_reload_started()

	var fire_pressed := intent.fire and not _trigger_held
	var alt_pressed := intent.alt_fire and not _alt_held
	_trigger_held = intent.fire
	_alt_held = intent.alt_fire
	if not intent.fire:
		_dry_clicked = false
	if can_fire and not combatant.frozen:
		if active.data.is_melee():
			if intent.alt_fire and active.is_ready():
				_melee(true)
			elif intent.fire and active.is_ready():
				_melee(false)
		elif active.data.is_gun():
			if alt_pressed and active.data.has_scope() and active.state == WeaponInstance.State.IDLE:
				_set_zoom((active.zoom_level + 1) % (active.data.zoom_fovs.size() + 1))
			var wants := intent.fire and (active.data.automatic or fire_pressed)
			if wants:
				_try_fire()
			# Auto-reload an empty magazine.
			if active.mag == 0 and active.is_ready() and active.reserve > 0 and not intent.fire:
				if active.start_reload():
					_on_reload_started()
	_recover_punch(delta)
	_update_speed()

func _on_reload_started() -> void:
	_set_zoom(0)
	reload_started.emit(active)

func _recover_punch(delta: float) -> void:
	var target := Vector2.ZERO
	if active and active.data.is_gun():
		target = _pattern_punch(active, active.spray_index)
	aim_punch = aim_punch.lerp(target, 1.0 - exp(-7.0 * delta))

static func _pattern_punch(w: WeaponInstance, index: int) -> Vector2:
	var off := w.data.recoil_offset(index)
	return Vector2(deg_to_rad(off.y), deg_to_rad(-off.x))

func _set_zoom(level: int) -> void:
	if active == null:
		return
	if active.zoom_level == level and level == 0:
		zoom_changed.emit(0, 0.0)
		return
	active.zoom_level = level
	var fov := active.data.zoom_fovs[level - 1] if level > 0 else 0.0
	zoom_changed.emit(level, fov)
	_update_speed()
	if level > 0:
		_sound("ui/click", -12.0)

func exclude_rids() -> Array[RID]:
	if _exclude.is_empty() and combatant:
		_exclude.append(combatant.get_rid())
		for hb in combatant.hitboxes:
			_exclude.append(hb.get_rid())
	return _exclude

## Inaccuracy (degrees) the active weapon would have right now.
func current_inaccuracy() -> float:
	if active == null or not active.data.is_gun():
		return 0.0
	return active.current_inaccuracy(combatant.horizontal_speed() / maxf(active.data.move_speed, 0.1), combatant.is_airborne(), combatant.is_crouched())

func _try_fire() -> void:
	var w := active
	if not w.is_ready():
		if w.state == WeaponInstance.State.RELOADING and w.data.shell_reload and w.mag > 0:
			w.interrupt_reload()
		return
	if w.mag <= 0:
		if not _dry_clicked:
			_dry_clicked = true
			dry_fired.emit(w)
			_sound("weapons/dry_fire", -4.0)
			if w.reserve > 0 and w.start_reload():
				_on_reload_started()
		return
	var inacc := current_inaccuracy()
	var punch := _pattern_punch(w, w.spray_index)
	w.consume_shot()
	var eye := combatant.eye_position()
	var space := combatant.get_world_3d().direct_space_state
	var all: Array = []
	for p in maxi(w.data.pellets, 1):
		var dir := spread_direction(combatant.yaw + punch.y, combatant.pitch + punch.x, inacc, w.data.pellet_spread if w.data.pellets > 1 else 0.0, rng)
		var impacts := Ballistics.fire_bullet(space, combatant, eye, dir, w.data, exclude_rids())
		all.append(impacts)
		for imp in impacts:
			if imp.has("victim"):
				var v: Combatant = imp.victim
				hit_confirmed.emit(v, imp.damage, imp.hitgroup, not v.alive)
	aim_punch = _pattern_punch(w, w.spray_index)
	Events.weapon_fired.emit(combatant, w.data.id, eye)
	Events.noise_emitted.emit(combatant, eye, 70.0, &"gunshot")
	if local_player:
		Audio.play_2d(w.data.fire_sound, w.data.fire_volume_db - 2.0, 0.03, &"SFX")
	else:
		Audio.play_3d(w.data.fire_sound, eye, w.data.fire_volume_db + 2.0, 0.04, 140.0)
	fired.emit(w, all, inacc)
	_update_speed()

## Random direction inside a cone around (yaw, pitch). Bullets cluster
## towards the centre (sqrt-free radius) like real dispersion.
static func spread_direction(yaw: float, pitch: float, inaccuracy_deg: float, pellet_deg: float, r: RandomNumberGenerator) -> Vector3:
	var fwd := Combatant.dir_from_angles(yaw, pitch)
	var right := fwd.cross(Vector3.UP).normalized()
	if right.length() < 0.01:
		right = Vector3.RIGHT
	var up := right.cross(fwd).normalized()
	var a := r.randf() * TAU
	var rad := deg_to_rad(inaccuracy_deg) * r.randf()
	var dir := fwd + right * cos(a) * tan(rad) + up * sin(a) * tan(rad)
	if pellet_deg > 0.0:
		var a2 := r.randf() * TAU
		var rad2 := deg_to_rad(pellet_deg) * sqrt(r.randf())
		dir += right * cos(a2) * tan(rad2) + up * sin(a2) * tan(rad2)
	return dir.normalized()

func _melee(heavy: bool) -> void:
	var w := active
	w.cooldown = w.data.alt_interval if heavy else w.data.fire_interval
	w.since_last_shot = 0.0
	var eye := combatant.eye_position()
	var dir := combatant.view_direction()
	var space := combatant.get_world_3d().direct_space_state
	var hit := Ballistics.melee_trace(space, combatant, eye, dir, w.data.melee_range, exclude_rids())
	var impact := {}
	if not hit.is_empty():
		if hit.collider is Hitbox:
			var victim := (hit.collider as Hitbox).combatant
			var dmg := w.data.alt_damage if heavy else w.data.damage
			# Backstab: attacker behind the victim.
			var facing := victim.view_direction()
			facing.y = 0.0
			var flat := dir
			flat.y = 0.0
			if facing.normalized().dot(flat.normalized()) > 0.5:
				dmg *= 2.8
			var info := DamageInfo.make(dmg, combatant, w.data.id, GameConst.HitGroup.GENERIC)
			info.armor_penetration = w.data.armor_penetration
			info.direction = dir
			info.position = hit.position
			var dealt := victim.apply_damage(info)
			impact = {"pos": hit.position, "normal": hit.normal, "surface": "flesh", "victim": victim, "hitgroup": GameConst.HitGroup.GENERIC, "damage": dealt}
			hit_confirmed.emit(victim, dealt, GameConst.HitGroup.GENERIC, not victim.alive)
			_sound("weapons/knife_hit_flesh", -2.0, hit.position)
		else:
			var surface: String = hit.collider.get_meta("surface", "concrete") if hit.collider else "concrete"
			impact = {"pos": hit.position, "normal": hit.normal, "surface": surface}
			_sound("weapons/knife_hit_wall", -4.0, hit.position)
	_sound("weapons/knife_swing", -6.0)
	Events.noise_emitted.emit(combatant, eye, 8.0, &"melee")
	melee_swing.emit(w, heavy, impact)

func _sound(id: String, volume_db: float, at: Vector3 = Vector3.INF) -> void:
	if id == "":
		return
	if at == Vector3.INF and local_player:
		Audio.play_2d(id, volume_db, 0.03, &"SFX")
	else:
		var pos := at if at != Vector3.INF else combatant.eye_position()
		Audio.play_3d(id, pos, volume_db, 0.04, 25.0)
