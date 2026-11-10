extends TestCase
## Validates the Sawtooth map: geometry, spawns, objectives, navigation
## reachability, route timings, AI markers and watertightness.

const T := GameConst.Team.ATTACKERS
const CT := GameConst.Team.DEFENDERS
## Rifle run speed used for timing checks (m/s).
const RUN_SPEED := 5.7

static var _map: GameMap

func _ensure_map() -> GameMap:
	if _map and is_instance_valid(_map):
		return _map
	_map = GameMap.new()
	_map.apply_environment = false
	get_tree().root.add_child(_map)
	await wait_physics(2)
	var ok: bool = await _map.await_navigation_ready()
	check(ok, "navigation map synchronised")
	return _map

func _nav_map() -> RID:
	return _map.get_world_3d().navigation_map

func _closest(p: Vector3) -> Vector3:
	return NavigationServer3D.map_get_closest_point(_nav_map(), p)

func _path(a: Vector3, b: Vector3) -> PackedVector3Array:
	return NavigationServer3D.map_get_path(_nav_map(), a, b, true)

static func _path_len(p: PackedVector3Array) -> float:
	var l := 0.0
	for i in range(1, p.size()):
		l += p[i - 1].distance_to(p[i])
	return l

func test_map_builds() -> void:
	var m: GameMap = await _ensure_map()
	check(m.info != null, "map info exists")
	check_eq(m.info.map_name, "Sawtooth")
	check(m.build_stats.get("shapes", 0) > 100, "collision shapes generated")
	check(m.build_stats.get("meshes", 0) > 10, "meshes generated")
	check_range(m.build_stats.get("build_ms", 0.0), 0.0, 8000.0, "build time ms")
	var nm := m.nav_region.navigation_mesh
	check(nm.get_polygon_count() > 200, "navmesh has polygons (%d)" % nm.get_polygon_count())

func test_spawns_valid() -> void:
	var m: GameMap = await _ensure_map()
	var space := m.get_world_3d().direct_space_state
	for team in [T, CT]:
		var spawns: Array = m.info.spawns[team]
		check(spawns.size() >= 5, "team %d has >=5 spawns" % team)
		for xf: Transform3D in spawns:
			var p := xf.origin
			check(m.info.in_buy_zone(team, p), "spawn %s in buy zone" % p)
			check(_closest(p).distance_to(p) < 0.6, "spawn %s on navmesh" % p)
			# Player-sized capsule must not overlap world geometry.
			var q := PhysicsShapeQueryParameters3D.new()
			var cap := CapsuleShape3D.new()
			cap.radius = 0.4
			cap.height = 1.8
			q.shape = cap
			q.transform = Transform3D(Basis(), p + Vector3(0, 0.95, 0))
			q.collision_mask = GameConst.LAYER_WORLD | GameConst.LAYER_CLIP
			check(space.intersect_shape(q, 1).is_empty(), "spawn %s is clear of geometry" % p)

func test_bombsites_reachable_and_timed() -> void:
	var m: GameMap = await _ensure_map()
	check(m.info.bombsites.has(&"A") and m.info.bombsites.has(&"B"), "two bombsites")
	var t_spawn: Vector3 = m.info.spawns[T][0].origin
	var ct_spawn: Vector3 = m.info.spawns[CT][0].origin
	for site in [&"A", &"B"]:
		var target := _closest(m.info.site_center(site))
		check(m.info.site_at(target + Vector3(0, 0.1, 0)) == site, "site %s centre lies inside its zone" % site)
		var pt := _path(t_spawn, target)
		var pc := _path(ct_spawn, target)
		check(pt.size() > 1 and pt[-1].distance_to(target) < 1.0, "attackers reach %s" % site)
		check(pc.size() > 1 and pc[-1].distance_to(target) < 1.0, "defenders reach %s" % site)
		var tt := _path_len(pt) / RUN_SPEED
		var tc := _path_len(pc) / RUN_SPEED
		print("        site %s: attackers %.1fs (%.0fm), defenders %.1fs (%.0fm)" % [site, tt, _path_len(pt), tc, _path_len(pc)])
		check_range(tt, 9.0, 20.0, "attacker time to %s" % site)
		check_range(tc, 3.0, 9.0, "defender time to %s" % site)
		check(tc + 4.0 < tt, "defenders arrive well before attackers at %s" % site)

func test_routes_reachable() -> void:
	var m: GameMap = await _ensure_map()
	var t_spawn: Vector3 = m.info.spawns[T][0].origin
	check(m.info.routes.size() >= 4, "at least four attack routes")
	for r in m.info.routes:
		var prev := t_spawn
		var total := 0.0
		for p in r.points:
			var c := _closest(p)
			check(c.distance_to(p) < 1.0, "route %s point %s on navmesh (off by %.2f)" % [r.name, p, c.distance_to(p)])
			var path := _path(prev, c)
			check(path.size() > 1 and path[-1].distance_to(c) < 1.0, "route %s leg to %s reachable" % [r.name, p])
			total += _path_len(path)
			prev = c
		print("        route %-10s %.0fm  %.1fs" % [r.name, total, total / RUN_SPEED])

func test_spots_reachable() -> void:
	var m: GameMap = await _ensure_map()
	check(m.info.spots_with("hold", CT).size() >= 8, "defender hold spots")
	check(m.info.spots_with("plant").size() >= 6, "plant spots")
	for s in m.info.spots:
		var c := _closest(s.pos)
		check(c.distance_to(s.pos) < 1.0, "spot %s on navmesh (off by %.2f)" % [s.name, c.distance_to(s.pos)])
		var from: Vector3 = m.info.spawns[s.team if s.team != GameConst.Team.NONE else T][0].origin
		var path := _path(from, c)
		check(path.size() > 1 and path[-1].distance_to(c) < 1.0, "spot %s reachable from team spawn" % s.name)
		if "plant" in s.tags:
			check(m.info.site_at(s.pos + Vector3(0, 0.1, 0)) == StringName(s.tags[1]), "plant spot %s inside site" % s.name)

func test_map_is_watertight() -> void:
	var m: GameMap = await _ensure_map()
	var space := m.get_world_3d().direct_space_state
	var origins: Array[Vector3] = []
	for team in [T, CT]:
		origins.append(m.info.spawns[team][0].origin)
	for s in m.info.spots:
		origins.append(s.pos)
	var escaped := 0
	for o in origins:
		for i in 24:
			var a := TAU * i / 24.0
			for elev: float in [0.0, -0.02]:
				var dir := Vector3(cos(a), elev, sin(a)).normalized()
				var from := o + Vector3(0, 1.0, 0)
				var q := PhysicsRayQueryParameters3D.create(from, from + dir * 220.0, GameConst.LAYER_WORLD)
				if space.intersect_ray(q).is_empty():
					escaped += 1
					if escaped < 5:
						fail("ray escaped map from %s dir %s" % [o, dir])
	check_eq(escaped, 0, "rays escaping the map")

func test_floor_everywhere() -> void:
	var m: GameMap = await _ensure_map()
	var space := m.get_world_3d().direct_space_state
	var info := m.info
	var missing := 0
	var samples := 0
	for cz in range(info.grid_size.y):
		for cx in range(info.grid_size.x):
			if (cx + cz) % 3 != 0:
				continue
			var idx := cz * info.grid_size.x + cx
			if info.walkable[idx] == 0:
				continue
			samples += 1
			var p := Vector3(info.grid_origin.x + cx + 0.5, 2.9, info.grid_origin.y + cz + 0.5)
			var q := PhysicsRayQueryParameters3D.create(p, p + Vector3.DOWN * 4.0, GameConst.LAYER_WORLD)
			var hit := space.intersect_ray(q)
			if hit.is_empty():
				missing += 1
				if missing < 5:
					fail("no floor under %s" % p)
	check(samples > 500, "sampled walkable cells (%d)" % samples)
	check_eq(missing, 0, "cells without floor")

func test_callouts() -> void:
	var m: GameMap = await _ensure_map()
	var cases := {
		Vector3(30, 1.3, -27): "A Site",
		Vector3(-31, 0.2, -24): "B Site",
		Vector3(0, 0.2, 0): "Mid",
		Vector3(0, 0.2, 35): "Breacher Yard",
		Vector3(0, 0.2, -36): "Warden Court",
		Vector3(-36, 0.2, 20): "B Tunnels",
		Vector3(-17.5, 3.4, -32): "Mezzanine",
		Vector3(35, 0.2, 20): "Long Rail",
	}
	for p in cases:
		check_eq(m.info.callout_at(p), cases[p], "callout at %s" % p)

func test_surfaces() -> void:
	var m: GameMap = await _ensure_map()
	check_eq(m.info.floor_surface_at(Vector3(35, 0, 20)), "gravel", "long rail is gravel")
	check_eq(m.info.floor_surface_at(Vector3(0, 0, 0)), "concrete", "mid asphalt counts as concrete")
	check_eq(m.info.floor_surface_at(Vector3(-25, 0, 32)), "dirt", "scrap lane dirt")

func test_zz_cleanup() -> void:
	if _map and is_instance_valid(_map):
		_map.queue_free()
		_map = null
	await wait_frames(2)
	check(true)
