class_name BotBrain
extends Node
## Individual bot AI. Writes the same CombatIntent a human produces, so bots
## obey identical movement, accuracy and recoil rules.
##
## Layers, evaluated every physics tick (perception is throttled):
##  1. Perception: view-cone + line-of-sight checks against enemies, hearing
##     via Events.noise_emitted, shared sightings from TeamTactics.
##  2. Combat: reaction delay, aim settling (error shrinks over time), head/
##     chest choice, recoil compensation, burst/tap discipline per weapon,
##     counter-strafe or strafe-shoot, scoping, holding angles after losing
##     sight, seeking cover to reload when exposed.
##  3. Objective: executes the TeamTactics task (route/stage/execute, hold,
##     plant, fetch, guard, retake, defuse) with natural look behaviour.

var c: Combatant
var profile: BotProfile
var tactics: TeamTactics
var map_info: MapInfo
var nav: BotNav
var rng := RandomNumberGenerator.new()
## Human-readable current activity (debug overlay / tests).
var state := "idle"

# Perception
var target: Combatant = null
var target_visible := false
var target_last_pos := Vector3.INF
var target_last_time := -99.0
var target_acquired_at := 0.0
var heard_pos := Vector3.INF
var heard_time := -99.0
var _aim_head := false
var _aim_err := Vector2.ZERO
var _sense_t := 0.0
var _now := 0.0

# Look / move
var _yaw := 0.0
var _pitch := 0.0
var _des_yaw := 0.0
var _des_pitch := 0.0
var _turn_rate := 200.0
var _move_dir := Vector3.ZERO
var _walk := false
var _crouch := false
var _scan := 0.0

# Combat
var _burst_end := 0.0
var _burst_cool_until := 0.0
var _strafe := 0.0
var _strafe_until := 0.0
var _crouch_engage := false
var _fire_toggle := false
var _alt_toggle := false
var _cover_point := Vector3.INF
var _cover_until := 0.0

# Angle checking while moving
var _check_point := Vector3.INF
var _check_t := 0.0
var _threat_cache: Array = []

# Objective
var _task_sig := ""
var _route_idx := 0
var _at_stage := false
var _retake_phase := 0

func setup(p_c: Combatant, p_profile: BotProfile, p_tactics: TeamTactics, p_map: MapInfo) -> void:
	c = p_c
	profile = p_profile
	tactics = p_tactics
	map_info = p_map
	c.brain = self
	rng.randomize()
	nav = BotNav.new(c.get_world_3d().navigation_map)
	if not Events.noise_emitted.is_connected(_on_noise):
		Events.noise_emitted.connect(_on_noise)

func on_spawned(_c: Combatant) -> void:
	target = null
	target_visible = false
	target_last_time = -99.0
	heard_time = -99.0
	_yaw = c.yaw
	_pitch = 0.0
	_des_yaw = _yaw
	_des_pitch = 0.0
	_task_sig = ""
	_route_idx = 0
	_at_stage = false
	_retake_phase = 0
	_cover_point = Vector3.INF
	if nav:
		nav.stop()

# ---------------------------------------------------------------------------
# Main tick
# ---------------------------------------------------------------------------

func update_intent(_cc: Combatant, intent: CombatIntent, delta: float) -> void:
	_now += delta
	intent.move = Vector2.ZERO
	intent.jump = false
	intent.crouch = false
	intent.walk = false
	intent.fire = false
	intent.alt_fire = false
	intent.use = false
	_move_dir = Vector3.ZERO
	_walk = false
	_crouch = false
	if c == null or tactics == null:
		return
	_sense_t -= delta
	if _sense_t <= 0.0:
		_sense()
		_sense_t = rng.randf_range(0.09, 0.14)
	if c.frozen:
		state = "frozen"
		_look_at_point(c.eye_position() + c.view_direction() * 10.0, 90.0)
	else:
		var engaged := _combat(intent, delta)
		if not engaged:
			_objective(intent, delta)
		_weapon_management(intent, engaged)
	_turn(delta)
	intent.yaw = _yaw
	intent.pitch = _pitch
	if _move_dir != Vector3.ZERO:
		var local := Basis(Vector3.UP, _yaw).inverse() * _move_dir
		intent.move = Vector2(local.x, -local.z)
	intent.walk = _walk
	intent.crouch = intent.crouch or _crouch
	if nav.want_jump:
		intent.jump = true

# ---------------------------------------------------------------------------
# Perception
# ---------------------------------------------------------------------------

func _los(space: PhysicsDirectSpaceState3D, a: Vector3, b: Vector3) -> bool:
	var q := PhysicsRayQueryParameters3D.create(a, b, GameConst.MASK_SIGHT)
	return space.intersect_ray(q).is_empty()

func _sense() -> void:
	var eye := c.eye_position()
	var fwd := Combatant.dir_from_angles(_yaw, _pitch)
	var space := c.get_world_3d().direct_space_state
	var cos_fov := cos(deg_to_rad(profile.fov * 0.5))
	var best: Combatant = null
	var best_score := INF
	for e: Combatant in tactics.alive_enemies():
		var chest := e.global_position + Vector3(0, 1.25 - 0.35 * e.crouch_amount, 0)
		var d := eye.distance_to(chest)
		if d > 95.0:
			continue
		var dir := (chest - eye) / maxf(d, 0.01)
		var tracking := e == target and _now - target_last_time < 1.0
		if fwd.dot(dir) < cos_fov and d > 3.5 and not tracking:
			continue
		if _los(space, eye, chest) or _los(space, eye, e.eye_position()) or _los(space, eye, e.global_position + Vector3(0, 0.55, 0)):
			tactics.report_enemy(e, e.global_position)
			var score := d * (0.6 if e == target else 1.0)
			if score < best_score:
				best_score = score
				best = e
	if best:
		var fresh := best != target or _now - target_last_time > 1.2
		if fresh:
			target_acquired_at = _now
			_aim_head = rng.randf() < profile.headshot_chance
			var a := rng.randf() * TAU
			_aim_err = Vector2(cos(a), sin(a)) * deg_to_rad(profile.aim_error * rng.randf_range(0.6, 1.3))
			_crouch_engage = rng.randf() < profile.crouch_chance
			_burst_end = 0.0
		elif not target_visible:
			# Re-acquired after a brief loss: shorter reaction.
			target_acquired_at = _now - profile.reaction_time * 0.5
		target = best
		target_visible = true
		target_last_pos = best.global_position
		target_last_time = _now
	else:
		target_visible = false
		if target and not target.alive:
			target = null

func _on_noise(source: Node, pos: Vector3, radius: float, kind: StringName) -> void:
	if c == null or not c.alive or source == c or not (source is Combatant):
		return
	var src := source as Combatant
	if src.team == c.team or not src.alive:
		return
	if c.global_position.distance_to(pos) > radius:
		return
	heard_pos = pos
	heard_time = _now
	if kind == &"gunshot" and tactics:
		tactics.report_enemy(src, pos)

# ---------------------------------------------------------------------------
# Combat
# ---------------------------------------------------------------------------

func _combat(intent: CombatIntent, delta: float) -> bool:
	if target == null or not is_instance_valid(target) or not target.alive:
		target = null
		return false
	var since_seen := _now - target_last_time
	var w := c.weapons.active
	if not target_visible:
		if since_seen < 1.4 and target_last_pos != Vector3.INF:
			# Hold the angle where the enemy disappeared.
			state = "hold-angle"
			_look_at_point(target_last_pos + Vector3(0, 1.4, 0), profile.turn_speed)
			_crouch = _crouch_engage and w != null and w.data.category in ["rifle", "sniper"]
			return true
		if since_seen < 6.0 and profile.aggression > 0.45 and _task_kind() in ["hold", "guard", "retake", ""] and rng.randf() < 0.004:
			_cover_point = Vector3.INF
		return false
	state = "engage"
	if w == null or not w.data.is_gun() or (w.mag == 0 and w.reserve == 0):
		return true
	var aim_pt := target.eye_position() + Vector3(0, -0.03, 0) if _aim_head else target.global_position + Vector3(0, 1.22 - 0.38 * target.crouch_amount, 0)
	_aim_err *= exp(-delta / maxf(profile.settle_time, 0.05))
	var eye := c.eye_position()
	var to := aim_pt - eye
	var dist := to.length()
	var yaw_t := atan2(-to.x, -to.z)
	var pitch_t := atan2(to.y, Vector2(to.x, to.z).length())
	var punch := c.weapons.aim_punch
	_des_yaw = yaw_t + _aim_err.x - punch.y * profile.recoil_comp
	_des_pitch = pitch_t + _aim_err.y - punch.x * profile.recoil_comp
	_turn_rate = profile.turn_speed * 1.4
	var reacted := _now - target_acquired_at >= profile.reaction_time
	var err := Vector2(wrapf(_yaw - (_des_yaw - _aim_err.x), -PI, PI), _pitch - (_des_pitch - _aim_err.y)).length()
	var tol := atan2(0.11 if _aim_head else 0.2, dist) * 1.6 + deg_to_rad(0.4)
	var aimed := err < tol
	var cat := w.data.category
	# Snipers scope in before shooting at range.
	if cat == "sniper" and dist > 5.0 and not w.is_scoped():
		_alt_toggle = not _alt_toggle
		intent.alt_fire = _alt_toggle
		aimed = false
	# Movement: rifles/snipers stop to shoot at range; close range strafe.
	var stand_and_shoot := cat in ["rifle", "sniper"] and dist > 7.0 or (cat == "pistol" and dist > 14.0)
	if stand_and_shoot:
		_move_dir = Vector3.ZERO
		_crouch = _crouch_engage and dist > 15.0
	elif rng.randf() < profile.strafe_skill or _strafe != 0.0:
		if _now > _strafe_until:
			_strafe = -1.0 if rng.randf() < 0.5 else 1.0
			_strafe_until = _now + rng.randf_range(0.35, 0.85)
		var right := Basis(Vector3.UP, _yaw) * Vector3.RIGHT
		# Stop while a burst is firing for accuracy (counter-strafe).
		_move_dir = Vector3.ZERO if (_now < _burst_end and profile.strafe_skill > 0.5) else right * _strafe
	# Low on health and losing the duel: break line of sight.
	if c.health < 35.0 and target.health > c.health + 20.0 and rng.randf() < 0.02:
		_seek_cover(target)
	if not reacted:
		return true
	if w.mag == 0:
		return true
	if w.data.automatic:
		if _now < _burst_cool_until:
			return true
		if _now >= _burst_end and aimed:
			var shots := 12 if dist < 9.0 else (rng.randi_range(profile.burst_min, profile.burst_max) if dist < 28.0 else rng.randi_range(1, 3))
			_burst_end = _now + shots * w.data.fire_interval
		if _now < _burst_end:
			intent.fire = true
			if _now + delta >= _burst_end:
				_burst_cool_until = _now + (0.06 if dist < 9.0 else rng.randf_range(0.18, 0.4))
	else:
		var settled := cat != "sniper" or (w.is_scoped() and c.horizontal_speed() < 1.0)
		if aimed and settled and w.is_ready():
			_fire_toggle = not _fire_toggle
			intent.fire = _fire_toggle
	return true

## Finds a nearby navmesh point hidden from `threat` and runs there.
func _seek_cover(threat: Combatant) -> void:
	var space := c.get_world_3d().direct_space_state
	var rid := c.get_world_3d().navigation_map
	var from_eye := threat.eye_position()
	var best := Vector3.INF
	var best_d := INF
	for ring: float in [2.5, 4.5, 7.0]:
		for i in 10:
			var a := TAU * i / 10.0 + rng.randf() * 0.3
			var p := NavigationServer3D.map_get_closest_point(rid, c.global_position + Vector3(cos(a), 0, sin(a)) * ring)
			if p.distance_to(c.global_position) < 1.5:
				continue
			if _los(space, from_eye, p + Vector3(0, 1.3, 0)):
				continue
			var d := p.distance_to(c.global_position)
			if d < best_d:
				best_d = d
				best = p
		if best != Vector3.INF:
			break
	if best != Vector3.INF:
		_cover_point = best
		_cover_until = _now + 3.0

func _weapon_management(intent: CombatIntent, engaged: bool) -> void:
	var wc := c.weapons
	var w := wc.active
	var task := _task_kind()
	if task == "plant" and state == "planting":
		return
	if w == null or w.data.category in ["melee", "bomb"]:
		if wc.has_slot(GameConst.Slot.PRIMARY):
			intent.switch_slot = GameConst.Slot.PRIMARY
		elif wc.has_slot(GameConst.Slot.SECONDARY):
			intent.switch_slot = GameConst.Slot.SECONDARY
		return
	# Out of ammo mid-fight: pull the pistol.
	if engaged and target_visible and w.mag == 0 and w.data.slot == GameConst.Slot.PRIMARY:
		var p := wc.get_slot(GameConst.Slot.SECONDARY)
		if p and p.mag > 0:
			intent.switch_slot = GameConst.Slot.SECONDARY
			return
	if not target_visible and w.data.is_gun() and w.reserve > 0 and w.state == WeaponInstance.State.IDLE:
		var low := float(w.mag) / maxf(w.data.mag_size, 1) < 0.4
		if low and _now - target_last_time > 1.2:
			intent.reload = true
	# Back to the primary once safe.
	if not engaged and w.data.slot == GameConst.Slot.SECONDARY and wc.has_slot(GameConst.Slot.PRIMARY) and wc.get_slot(GameConst.Slot.PRIMARY).mag + wc.get_slot(GameConst.Slot.PRIMARY).reserve > 0:
		intent.switch_slot = GameConst.Slot.PRIMARY

# ---------------------------------------------------------------------------
# Objectives
# ---------------------------------------------------------------------------

func _task_kind() -> String:
	return tactics.task_for(c).get("kind", "") if tactics else ""

func _objective(intent: CombatIntent, delta: float) -> void:
	if _cover_point != Vector3.INF:
		if _now < _cover_until and c.global_position.distance_to(_cover_point) > 0.8:
			state = "cover"
			_go(_cover_point, delta)
			_look_at_point(target_last_pos + Vector3(0, 1.4, 0) if target_last_pos != Vector3.INF else _cover_point, profile.turn_speed)
			return
		_cover_point = Vector3.INF
	var task := tactics.task_for(c)
	var kind: String = task.get("kind", "")
	var sig := "%s|%s" % [kind, str(task.get("pos", task.get("route", task.get("target", ""))))]
	if sig != _task_sig:
		_task_sig = sig
		_route_idx = 0
		_at_stage = false
		_retake_phase = 0
		nav.stop()
	if tactics.hunt_mode and kind in ["route", "hold", "guard", ""]:
		_do_hunt(delta)
		_react_to_noise()
		return
	match kind:
		"route": _do_route(task, delta)
		"hold", "guard": _do_hold(task, delta)
		"plant": _do_plant(task, intent, delta)
		"defuse": _do_defuse(task, intent, delta)
		"fetch":
			state = "fetch"
			_go(task.pos, delta)
			_look_along_path()
		"retake": _do_retake(task, delta)
		_:
			_do_hunt(delta)
	_react_to_noise()

func _go(pos: Vector3, delta: float) -> bool:
	nav.set_goal(c.global_position, pos)
	_move_dir = nav.steer(c.global_position, delta)
	return nav.done

func _look_along_path() -> void:
	var ahead := nav.look_ahead_point(c.global_position, 5.0)
	# Known threats first, then common enemy positions in line of sight
	# ("checking angles"), otherwise look where we're going.
	var threat := _nearest_sighting(22.0)
	if threat != Vector3.INF:
		_look_at_point(threat + Vector3(0, 1.4, 0), profile.turn_speed * 0.8)
		return
	_check_t -= get_physics_process_delta_time()
	if _check_t <= 0.0:
		_check_t = rng.randf_range(0.25, 0.4)
		_check_point = _find_angle_to_check(ahead)
	if _check_point != Vector3.INF:
		_look_at_point(_check_point, profile.turn_speed * 0.7)
	elif ahead != Vector3.INF:
		_look_at_point(ahead + Vector3(0, 1.5, 0), 240.0)

## Positions where enemies typically stand: defender holds for attackers,
## attacker route points for defenders.
func _threat_points() -> Array:
	if not _threat_cache.is_empty():
		return _threat_cache
	if c.team == GameConst.Team.ATTACKERS:
		for s in map_info.spots_with("hold", GameConst.Team.DEFENDERS):
			_threat_cache.append(s.pos + Vector3(0, 1.5, 0))
	else:
		for r in map_info.routes:
			if r.team == GameConst.Team.ATTACKERS:
				for p in r.points:
					_threat_cache.append(p + Vector3(0, 1.5, 0))
	return _threat_cache

func _find_angle_to_check(ahead: Vector3) -> Vector3:
	var eye := c.eye_position()
	var move_dir := (ahead - c.global_position) if ahead != Vector3.INF else c.view_direction()
	move_dir.y = 0.0
	move_dir = move_dir.normalized()
	var space := c.get_world_3d().direct_space_state
	var best := Vector3.INF
	var best_score := -INF
	for p: Vector3 in _threat_points():
		var to := p - eye
		var d := to.length()
		if d < 4.0 or d > 55.0:
			continue
		var facing := move_dir.dot(Vector3(to.x, 0, to.z).normalized())
		if facing < -0.3:
			continue
		if not _los(space, eye, p):
			continue
		var score := facing * 0.5 - d / 55.0
		if score > best_score:
			best_score = score
			best = p
	return best

func _nearest_sighting(max_dist: float) -> Vector3:
	var best := Vector3.INF
	var best_d := max_dist
	for s in tactics.recent_sightings(4.0):
		var d := (s.pos as Vector3).distance_to(c.global_position)
		if d < best_d:
			best_d = d
			best = s.pos
	return best

func _do_route(task: Dictionary, delta: float) -> void:
	var pts: PackedVector3Array = task.points
	var stage: int = task.get("stage", pts.size() - 1)
	if _route_idx >= pts.size():
		# Through the route: spread out to clear the site, then hold facing
		# the defenders' approach.
		var site: StringName = task.get("site", &"")
		if map_info.bombsites.has(site):
			var cp := tactics.clear_point_for(c, site)
			if c.global_position.distance_to(cp) > 1.0:
				state = "clear-site"
				_go(cp, delta)
				_look_along_path()
				return
			state = "site"
			_move_dir = Vector3.ZERO
			var rally := map_info.spots_with("rally", GameConst.Team.DEFENDERS).filter(func(s): return String(site) in s.tags)
			var focus: Vector3 = rally[0].pos if not rally.is_empty() else map_info.site_center(site)
			_scan_hold(atan2(-(focus.x - c.global_position.x), -(focus.z - c.global_position.z)), delta)
		else:
			state = "site"
			_scan_hold(_yaw, delta)
		return
	if _route_idx > stage and not tactics.executing:
		_route_idx = stage
	var p := pts[_route_idx]
	var arrived := _go(p, delta) or c.global_position.distance_to(p) < 1.2
	_look_along_path()
	state = "route %d/%d" % [_route_idx, pts.size()]
	if _route_idx == stage and not tactics.executing:
		# Approach the staging point quietly, then wait for the execute.
		if c.global_position.distance_to(p) < 12.0:
			_walk = true
		if arrived:
			tactics.notify_stage_reached(c)
			state = "staged"
			_move_dir = Vector3.ZERO
			var nxt := pts[mini(stage + 1, pts.size() - 1)]
			_scan_hold(atan2(-(nxt.x - p.x), -(nxt.z - p.z)), delta)
		return
	if arrived:
		_route_idx += 1
		nav.stop()

func _do_hold(task: Dictionary, delta: float) -> void:
	var pos: Vector3 = task.pos
	if c.global_position.distance_to(pos) > 0.9:
		state = "to-" + str(task.get("kind"))
		_go(pos, delta)
		_look_along_path()
		return
	state = str(task.get("kind"))
	_move_dir = Vector3.ZERO
	_scan_hold(task.get("yaw", _yaw), delta)
	# Long-range holders crouch for accuracy and a smaller profile.
	var w := c.weapons.active
	if w and w.data.category in ["rifle", "sniper"] and _crouch_engage:
		_crouch = true

func _scan_hold(base_yaw: float, delta: float) -> void:
	_scan += delta * 0.6
	var yaw_t := base_yaw + sin(_scan) * deg_to_rad(28.0)
	_des_yaw = yaw_t
	_des_pitch = lerpf(_des_pitch, 0.0, 0.1)
	_turn_rate = 90.0

func _do_plant(task: Dictionary, intent: CombatIntent, delta: float) -> void:
	var pos: Vector3 = task.pos
	if c.global_position.distance_to(pos) > 1.0 and not (map_info.site_at(c.global_position + Vector3(0, 0.1, 0)) != &"" and c.global_position.distance_to(pos) < 4.0 and state == "planting"):
		state = "to-plant"
		_go(pos, delta)
		_look_along_path()
		return
	state = "planting"
	_move_dir = Vector3.ZERO
	if c.weapons.active == null or c.weapons.active.data.category != "bomb":
		intent.switch_slot = GameConst.Slot.BOMB
	else:
		intent.fire = true
		intent.use = true
	intent.crouch = true
	_des_pitch = deg_to_rad(-35.0)
	_turn_rate = 120.0

func _do_defuse(task: Dictionary, intent: CombatIntent, delta: float) -> void:
	var pos: Vector3 = task.pos
	if c.global_position.distance_to(pos) > 1.1:
		state = "to-defuse"
		_go(pos, delta)
		_look_along_path()
		return
	state = "defusing"
	_move_dir = Vector3.ZERO
	_look_at_point(pos, 200.0)
	intent.use = true
	intent.crouch = true

func _do_retake(task: Dictionary, delta: float) -> void:
	var rally: Vector3 = task.rally
	var tgt: Vector3 = task.target
	if _retake_phase == 0:
		state = "retake-rally"
		if _go(rally, delta) or c.global_position.distance_to(rally) < 2.0:
			_retake_phase = 1
			nav.stop()
		_look_along_path()
		return
	var d := c.global_position.distance_to(tgt)
	if d > 5.0:
		state = "retake-push"
		_go(tgt, delta)
		_look_along_path()
	else:
		state = "retake-hold"
		_move_dir = Vector3.ZERO
		_scan_hold(_yaw, delta)

func _do_hunt(delta: float) -> void:
	var s := _nearest_sighting(200.0)
	if s == Vector3.INF and heard_pos != Vector3.INF and _now - heard_time < 8.0:
		s = heard_pos
	if s == Vector3.INF:
		s = tactics.search_point(c)
		if c.global_position.distance_to(s) < 2.0:
			state = "idle"
			_scan_hold(_yaw, delta)
			return
	state = "hunt"
	_go(s, delta)
	_look_along_path()

func _react_to_noise() -> void:
	if heard_pos == Vector3.INF or _now - heard_time > 3.0:
		return
	if state in ["hold", "guard", "staged", "site", "retake-hold", "idle"]:
		_look_at_point(heard_pos + Vector3(0, 1.4, 0), 150.0)

# ---------------------------------------------------------------------------
# Look helpers
# ---------------------------------------------------------------------------

func _look_at_point(p: Vector3, rate: float) -> void:
	var to := p - c.eye_position()
	if to.length() < 0.05:
		return
	_des_yaw = atan2(-to.x, -to.z)
	_des_pitch = clampf(atan2(to.y, Vector2(to.x, to.z).length()), deg_to_rad(-60), deg_to_rad(60))
	_turn_rate = rate

## Eases toward the desired angles with a maximum angular speed.
func _turn(delta: float) -> void:
	var max_step := deg_to_rad(_turn_rate) * delta
	var dy := wrapf(_des_yaw - _yaw, -PI, PI)
	var dp := _des_pitch - _pitch
	var k := 1.0 - exp(-16.0 * delta)
	_yaw = wrapf(_yaw + clampf(dy * k + signf(dy) * minf(absf(dy), deg_to_rad(2.0) * delta), -max_step, max_step), -PI, PI)
	_pitch = clampf(_pitch + clampf(dp * k, -max_step, max_step), deg_to_rad(-80), deg_to_rad(80))
