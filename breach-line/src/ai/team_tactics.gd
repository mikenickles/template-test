class_name TeamTactics
extends RefCounted
## Team-level AI: one instance per team per match.
##
## Attackers pick a site each round, split across that site's routes (plus
## an occasional mid lurker), stage at the last approach point, then execute
## together; the charge carrier plants while the rest clear and guard.
## Defenders spread over site holds and mid, rotate when a site is hit,
## and retake/defuse after a plant. Bots share enemy sightings here.
##
## `objective` is duck-typed (the MatchManager in Phase 6) and may be null:
##   bomb_carrier() -> Combatant, bomb_dropped() -> bool,
##   bomb_position() -> Vector3, bomb_planted() -> bool,
##   bomb_site() -> StringName, time_left() -> float

const SIGHTING_MEMORY := 7.0
const EXECUTE_TIMEOUT := 9.0
const EXECUTE_BY := 55.0

var team := GameConst.Team.ATTACKERS
var map_info: MapInfo
var objective: Object = null
var members: Array = []
var enemies: Array = []
var target_site: StringName = &"A"
var round_time := 0.0
var executing := false
var rng := RandomNumberGenerator.new()

var _assign: Dictionary = {} # Combatant -> task Dictionary
var _sightings: Array = [] # [{enemy, pos, time}]
var _stage_first := -1.0
var _stage_arrived: Dictionary = {}
var _rotated_to: StringName = &""
var _defuser: Combatant = null
var _last_site: StringName = &""
var _last_contact := 0.0
## True when bots should actively search for enemies (stalemates, no bomb,
## overwhelming advantage).
var hunt_mode := false

func _init(p_team: int, p_map: MapInfo) -> void:
	team = p_team
	map_info = p_map
	rng.randomize()

func is_attacking() -> bool:
	return team == GameConst.Team.ATTACKERS

func alive_members() -> Array:
	return members.filter(func(m): return is_instance_valid(m) and m.alive)

func alive_enemies() -> Array:
	return enemies.filter(func(m): return is_instance_valid(m) and m.alive)

# ---------------------------------------------------------------------------
# Round setup
# ---------------------------------------------------------------------------

func begin_round(p_members: Array, p_enemies: Array) -> void:
	members = p_members
	enemies = p_enemies
	round_time = 0.0
	executing = false
	_assign.clear()
	_sightings.clear()
	_stage_first = -1.0
	_stage_arrived.clear()
	_rotated_to = &""
	_defuser = null
	_last_contact = 0.0
	hunt_mode = false
	if map_info.bombsites.is_empty():
		return
	if is_attacking():
		_plan_attack()
	else:
		_plan_defense()

func _plan_attack() -> void:
	# Avoid hitting the same site three times in a row.
	var sites: Array = map_info.bombsites.keys()
	target_site = sites[rng.randi_range(0, sites.size() - 1)]
	if target_site == _last_site and rng.randf() < 0.4:
		target_site = sites[(sites.find(target_site) + 1) % sites.size()]
	_last_site = target_site
	var routes := map_info.routes_to(target_site, team)
	var mid_routes := map_info.routes_to(&"mid", team)
	if routes.is_empty():
		return
	var bots := alive_members()
	bots.shuffle()
	var carrier: Combatant = objective.bomb_carrier() if objective else null
	if carrier and carrier in bots:
		bots.erase(carrier)
		bots.push_front(carrier)
	var lurker: Combatant = null
	if bots.size() >= 4 and not mid_routes.is_empty() and rng.randf() < 0.25:
		lurker = bots.pop_back()
	var main_count := ceili(bots.size() * 0.6)
	for i in bots.size():
		var r: MapInfo.Route = routes[0 if i < main_count or routes.size() == 1 else 1]
		_assign[bots[i]] = {"kind": "route", "points": r.points, "stage": maxi(r.points.size() - 2, 0), "site": target_site, "route": r.name}
	if lurker:
		var lurks := map_info.spots_with("lurk", team)
		var mr: MapInfo.Route = mid_routes[0]
		var pts := mr.points
		_assign[lurker] = {"kind": "route", "points": pts, "stage": pts.size() - 1, "site": &"mid", "route": mr.name, "lurk": true,
			"hold_pos": pts[pts.size() - 2], "hold_yaw": 0.0}
		if not lurks.is_empty() and rng.randf() < 0.5:
			var s: MapInfo.Spot = lurks[rng.randi_range(0, lurks.size() - 1)]
			_assign[lurker] = {"kind": "hold", "pos": s.pos, "yaw": s.yaw, "site": &"lurk"}

func _plan_defense() -> void:
	var bots := alive_members()
	bots.shuffle()
	var counts := {&"A": 0, &"B": 0, &"mid": 0}
	match bots.size():
		1: counts[[&"A", &"B"][rng.randi_range(0, 1)]] = 1
		2: counts = {&"A": 1, &"B": 1, &"mid": 0}
		3: counts = {&"A": 1, &"B": 1, &"mid": 1}
		4: counts = {&"A": 2, &"B": 2, &"mid": 0}
		_: counts = {&"A": 2, &"B": 2, &"mid": 1}
	var i := 0
	for site in counts:
		var spots := map_info.spots_with("hold", team).filter(func(s): return String(site) in s.tags)
		spots.shuffle()
		if spots.is_empty():
			continue
		for k in counts[site]:
			if i >= bots.size():
				break
			var s: MapInfo.Spot = spots[k % spots.size()]
			_assign[bots[i]] = {"kind": "hold", "pos": s.pos, "yaw": s.yaw, "site": site}
			i += 1
	var all_holds := map_info.spots_with("hold", team)
	while i < bots.size() and not all_holds.is_empty():
		var s: MapInfo.Spot = all_holds[rng.randi_range(0, all_holds.size() - 1)]
		_assign[bots[i]] = {"kind": "hold", "pos": s.pos, "yaw": s.yaw, "site": &"A"}
		i += 1

# ---------------------------------------------------------------------------
# Updates
# ---------------------------------------------------------------------------

func report_enemy(enemy: Combatant, pos: Vector3) -> void:
	_last_contact = round_time
	for s in _sightings:
		if s.enemy == enemy:
			s.pos = pos
			s.time = round_time
			return
	_sightings.append({"enemy": enemy, "pos": pos, "time": round_time})

## Most recent known enemy positions (shared team knowledge).
func recent_sightings(max_age: float = SIGHTING_MEMORY) -> Array:
	return _sightings.filter(func(s): return round_time - s.time <= max_age and is_instance_valid(s.enemy) and s.enemy.alive)

func notify_stage_reached(bot: Combatant) -> void:
	if not _stage_arrived.has(bot):
		_stage_arrived[bot] = round_time
		if _stage_first < 0.0:
			_stage_first = round_time

func update(delta: float) -> void:
	round_time += delta
	_update_hunt()
	if map_info.bombsites.is_empty():
		return
	if is_attacking():
		_update_attack()
	else:
		_update_defense()

func _update_attack() -> void:
	if not executing:
		var route_bots := alive_members().filter(func(b): return _assign.get(b, {}).get("kind", "") == "route" and _assign[b].get("site") == target_site)
		var all_in: bool = not route_bots.is_empty() and route_bots.all(func(b): return _stage_arrived.has(b))
		var late: bool = objective != null and objective.time_left() < 40.0
		if all_in or (_stage_first >= 0.0 and round_time - _stage_first > EXECUTE_TIMEOUT) or round_time > EXECUTE_BY or late or route_bots.is_empty():
			executing = true
	if objective == null:
		return
	if objective.bomb_planted():
		var site: StringName = objective.bomb_site()
		var guards := map_info.spots_with("postplant", team).filter(func(s): return String(site) in s.tags)
		var bots := alive_members()
		for i in bots.size():
			if _assign.get(bots[i], {}).get("kind", "") == "guard":
				continue
			var s: MapInfo.Spot = guards[i % guards.size()] if not guards.is_empty() else null
			if s:
				_assign[bots[i]] = {"kind": "guard", "pos": s.pos, "yaw": s.yaw, "site": site}
		return
	# Recover a dropped charge: nearest living attacker fetches it.
	if objective.bomb_dropped():
		var pos: Vector3 = objective.bomb_position()
		var best: Combatant = null
		var best_d := INF
		for b in alive_members():
			var d: float = b.global_position.distance_to(pos)
			if d < best_d:
				best_d = d
				best = b
		if best:
			_assign[best] = {"kind": "fetch", "pos": pos}
	else:
		var carrier: Combatant = objective.bomb_carrier()
		if carrier and carrier.alive and executing:
			var cur: Dictionary = _assign.get(carrier, {})
			if cur.get("kind", "") != "plant":
				var plants := map_info.spots_with("plant", team).filter(func(s): return String(target_site) in s.tags)
				if not plants.is_empty():
					var s: MapInfo.Spot = plants[rng.randi_range(0, plants.size() - 1)]
					_assign[carrier] = {"kind": "plant", "pos": s.pos, "site": target_site}
		for b in alive_members():
			if _assign.get(b, {}).get("kind", "") == "fetch" and b != carrier:
				_assign[b] = _default_attack_task(b)

func _update_hunt() -> void:
	var mine := alive_members().size()
	var theirs := alive_enemies().size()
	var quiet := round_time - _last_contact > 15.0
	var bombless := objective == null
	var planted: bool = objective != null and objective.bomb_planted()
	if planted:
		hunt_mode = false
	elif theirs > 0 and mine >= theirs * 2 + 1 and round_time > 25.0:
		hunt_mode = true
	elif bombless and quiet and round_time > (50.0 if is_attacking() else 70.0):
		hunt_mode = true
	elif map_info.bombsites.is_empty():
		hunt_mode = true

## Distinct position inside the target site for each attacker to clear.
func clear_point_for(bot: Combatant, site: StringName) -> Vector3:
	var pts: Array = []
	for s in map_info.spots:
		if String(site) in s.tags and ("plant" in s.tags or "hold" in s.tags):
			pts.append(s.pos)
	if pts.is_empty():
		return map_info.site_center(site)
	var idx := alive_members().find(bot)
	return pts[maxi(idx, 0) % pts.size()]

## Where to look for enemies when no recent sighting exists.
func search_point(bot: Combatant) -> Vector3:
	var cands: Array = []
	if is_attacking():
		for s in map_info.spots_with("hold", GameConst.Team.DEFENDERS):
			cands.append(s.pos)
	else:
		for r in map_info.routes:
			if r.team == GameConst.Team.ATTACKERS and r.points.size() > 1:
				cands.append(r.points[r.points.size() / 2])
	if cands.is_empty():
		return bot.global_position
	return cands[(int(round_time / 12.0) + alive_members().find(bot)) % cands.size()]

func _default_attack_task(_b: Combatant) -> Dictionary:
	var routes := map_info.routes_to(target_site, team)
	var r: MapInfo.Route = routes[0]
	return {"kind": "route", "points": r.points, "stage": r.points.size() - 2, "site": target_site, "route": r.name}

func _update_defense() -> void:
	if objective and objective.bomb_planted():
		_update_retake()
		return
	if _rotated_to != &"":
		return
	# Rotate when two or more enemies are seen near a site.
	for site in map_info.bombsites:
		var center := map_info.site_center(site)
		var near := recent_sightings(6.0).filter(func(s): return (s.pos as Vector3).distance_to(center) < 26.0)
		var carrier_seen := objective != null and objective.bomb_carrier() != null and near.any(func(s): return s.enemy == objective.bomb_carrier())
		if near.size() >= 3 or carrier_seen:
			_rotate_to(site)
			return

func _rotate_to(site: StringName) -> void:
	_rotated_to = site
	var holds := map_info.spots_with("hold", team).filter(func(s): return String(site) in s.tags)
	holds.shuffle()
	var movers := 0
	var idx := 0
	for b in alive_members():
		var t: Dictionary = _assign.get(b, {})
		var from_site: StringName = t.get("site", &"")
		if from_site == site:
			continue
		# Mid always rotates; one player from the far site follows.
		if from_site == &"mid" or (movers < 1 and from_site != site):
			var s: MapInfo.Spot = holds[idx % holds.size()]
			idx += 1
			_assign[b] = {"kind": "hold", "pos": s.pos, "yaw": s.yaw, "site": site, "rotating": true}
			movers += 1

func _update_retake() -> void:
	var site: StringName = objective.bomb_site()
	var bomb_pos: Vector3 = objective.bomb_position()
	var bots := alive_members()
	if bots.is_empty():
		return
	var attackers_near := recent_sightings(5.0).filter(func(s): return (s.pos as Vector3).distance_to(bomb_pos) < 20.0)
	var time_left: float = objective.time_left()
	# Pick the closest defender as the defuser once the site is quiet or time is short.
	if _defuser == null or not _defuser.alive:
		_defuser = null
		var best_d := INF
		for b in bots:
			var d: float = b.global_position.distance_to(bomb_pos)
			if d < best_d:
				best_d = d
				_defuser = b
	var rally := map_info.spots_with("rally", team).filter(func(s): return String(site) in s.tags)
	var rally_pos: Vector3 = rally[0].pos if not rally.is_empty() else bomb_pos
	var quiet := attackers_near.is_empty() or time_left < 12.0 or alive_enemies().is_empty()
	for b in bots:
		var kind: String = _assign.get(b, {}).get("kind", "")
		if b == _defuser and quiet:
			if kind != "defuse":
				_assign[b] = {"kind": "defuse", "pos": bomb_pos, "site": site}
		elif kind != "retake":
			_assign[b] = {"kind": "retake", "rally": rally_pos, "target": bomb_pos, "site": site}

func task_for(bot: Combatant) -> Dictionary:
	return _assign.get(bot, {})

## Called by a bot when its personal task completes or becomes invalid.
func set_task(bot: Combatant, task: Dictionary) -> void:
	_assign[bot] = task
