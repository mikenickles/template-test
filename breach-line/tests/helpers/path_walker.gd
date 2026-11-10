class_name PathWalker
extends RefCounted
## Minimal navmesh path follower used by tests (and as a reference for the
## bot movement layer): steers a Combatant along waypoints by writing intent.

var waypoints: PackedVector3Array = []
var index := 0
var arrive_radius := 0.6
var map_rid: RID
var done := false

func _init(rid: RID) -> void:
	map_rid = rid

func set_target(from: Vector3, to: Vector3) -> bool:
	waypoints = NavigationServer3D.map_get_path(map_rid, from, to, true)
	index = 1
	done = waypoints.size() < 2
	return not done

func steer(c: Combatant, intent: CombatIntent) -> void:
	if done:
		intent.move = Vector2.ZERO
		return
	var pos := c.global_position
	while index < waypoints.size():
		var wp := waypoints[index]
		var flat := Vector2(wp.x - pos.x, wp.z - pos.z)
		if flat.length() < arrive_radius and absf(wp.y - pos.y) < 1.0:
			index += 1
		else:
			break
	if index >= waypoints.size():
		done = true
		intent.move = Vector2.ZERO
		return
	var target := waypoints[index]
	var d := Vector2(target.x - pos.x, target.z - pos.z)
	intent.yaw = atan2(-d.x, -d.y)
	intent.pitch = 0.0
	intent.move = Vector2(0, 1)
