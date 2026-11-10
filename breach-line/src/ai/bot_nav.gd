class_name BotNav
extends RefCounted
## Navmesh path following for bots: path queries, waypoint advance, periodic
## repath, and stuck recovery (jump, sidestep, repath).

var map_rid: RID
var path := PackedVector3Array()
var index := 0
var goal := Vector3.INF
var arrive_radius := 0.55
var done := true
## Set when the bot should jump this tick (stuck recovery).
var want_jump := false

var _repath_timer := 0.0
var _progress_timer := 0.0
var _progress_pos := Vector3.INF
var _stuck_level := 0
var _sidestep := Vector3.ZERO
var _sidestep_time := 0.0

func _init(rid: RID) -> void:
	map_rid = rid

func set_goal(from: Vector3, to: Vector3, force: bool = false) -> void:
	if not force and goal != Vector3.INF and goal.distance_to(to) < 0.75 and not path.is_empty():
		return
	goal = to
	_compute(from)

func _compute(from: Vector3) -> void:
	var target := NavigationServer3D.map_get_closest_point(map_rid, goal)
	path = NavigationServer3D.map_get_path(map_rid, from, target, true)
	index = 1
	done = path.size() < 2 or from.distance_to(target) < arrive_radius
	_repath_timer = 2.5
	_progress_pos = from
	_progress_timer = 0.0

func stop() -> void:
	path = PackedVector3Array()
	goal = Vector3.INF
	done = true

func remaining_distance(from: Vector3) -> float:
	if done or path.is_empty():
		return 0.0
	var d := from.distance_to(path[mini(index, path.size() - 1)])
	for i in range(index, path.size() - 1):
		d += path[i].distance_to(path[i + 1])
	return d

## Returns the desired horizontal move direction (unit, world) or ZERO.
func steer(pos: Vector3, delta: float) -> Vector3:
	want_jump = false
	if done or path.is_empty():
		return Vector3.ZERO
	_repath_timer -= delta
	if _repath_timer <= 0.0:
		_compute(pos)
		if done:
			return Vector3.ZERO
	while index < path.size():
		var wp := path[index]
		var flat := Vector2(wp.x - pos.x, wp.z - pos.z)
		var r := arrive_radius if index == path.size() - 1 else 0.7
		if flat.length() < r and absf(wp.y - pos.y) < 1.2:
			index += 1
		else:
			break
	if index >= path.size():
		done = true
		return Vector3.ZERO
	# Stuck detection: little progress over a window escalates recovery.
	_progress_timer += delta
	if _progress_timer > 0.8:
		if pos.distance_to(_progress_pos) < 0.35:
			_stuck_level += 1
			match _stuck_level:
				1: want_jump = true
				2:
					_sidestep = Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
					_sidestep_time = 0.6
				_:
					_compute(pos)
					_stuck_level = 0
		else:
			_stuck_level = 0
		_progress_pos = pos
		_progress_timer = 0.0
	var wp2 := path[index]
	var dir := Vector3(wp2.x - pos.x, 0, wp2.z - pos.z).normalized()
	if _sidestep_time > 0.0:
		_sidestep_time -= delta
		dir = (dir + _sidestep * 1.5).normalized()
	return dir

## Point a few meters ahead along the path (for natural look direction).
func look_ahead_point(pos: Vector3, ahead: float = 4.0) -> Vector3:
	if done or path.is_empty():
		return Vector3.INF
	var remaining := ahead
	var p := pos
	for i in range(index, path.size()):
		var seg := path[i] - p
		var l := seg.length()
		if l >= remaining:
			return p + seg.normalized() * remaining
		remaining -= l
		p = path[i]
	return path[-1]
