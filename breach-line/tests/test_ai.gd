extends TestCase
## Bot AI: perception, engagement, reaction, cover and full skirmishes.

const T := GameConst.Team.ATTACKERS
const CT := GameConst.Team.DEFENDERS

var arena: Node3D
var body: StaticBody3D

func _make_arena() -> MapInfo:
	arena = Node3D.new()
	get_tree().root.add_child(arena)
	body = StaticBody3D.new()
	body.collision_layer = GameConst.LAYER_WORLD
	arena.add_child(body)
	_box(Vector3(-60, -1, -60), Vector3(60, 0, 60))
	var nav := NavigationRegion3D.new()
	arena.add_child(nav)
	var info := MapInfo.new()
	arena.add_child(info)
	return info

func _box(lo: Vector3, hi: Vector3) -> CollisionShape3D:
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = (hi - lo).abs()
	cs.shape = s
	cs.position = (lo + hi) * 0.5
	body.add_child(cs)
	return cs

func after_each() -> void:
	if arena and is_instance_valid(arena):
		arena.queue_free()
	arena = null
	await wait_frames(2)

func _duel_setup(difficulty: int, dist: float, wall: bool) -> Array:
	var info := _make_arena()
	var tt := TeamTactics.new(T, info)
	var ct := TeamTactics.new(CT, info)
	var bot := BotFactory.create(arena, T, 0, info, tt, difficulty)
	bot.spawn_at(Transform3D(Basis(), Vector3(0, 0.02, 0)))
	bot.weapons.give(&"knife")
	bot.weapons.give(&"ravager", true)
	var enemy := Combatant.new()
	enemy.team = CT
	arena.add_child(enemy)
	enemy.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -dist)))
	var w: CollisionShape3D = null
	if wall:
		w = _box(Vector3(-3, 0, -dist * 0.5 - 0.3), Vector3(3, 3, -dist * 0.5 + 0.3))
	tt.begin_round([bot], [enemy])
	ct.begin_round([enemy], [bot])
	await wait_physics(3)
	return [bot, enemy, w]

func test_perception_blocked_by_walls() -> void:
	var r: Array = await _duel_setup(1, 20.0, true)
	var bot: Combatant = r[0]
	await wait_physics(30)
	var brain: BotBrain = bot.brain
	check(not brain.target_visible, "enemy behind a wall is not seen")
	(r[2] as CollisionShape3D).queue_free()
	await wait_physics(20)
	check(brain.target_visible, "enemy seen once the wall is gone")
	check(brain.target == r[1], "targets the enemy")

func test_bot_kills_exposed_enemy() -> void:
	var r: Array = await _duel_setup(1, 20.0, false)
	var enemy: Combatant = r[1]
	var t := 0
	while enemy.alive and t < 60 * 6:
		await wait_physics(1)
		t += 1
	check(not enemy.alive, "normal bot kills an exposed enemy at 20 m")
	print("        normal bot kill time at 20 m: %.2fs" % (t / 60.0))
	check(t < 60 * 4, "within 4 s (%.2fs)" % (t / 60.0))

func test_reaction_time_by_difficulty() -> void:
	var times := []
	for d in [0, 3]:
		var r: Array = await _duel_setup(d, 15.0, false)
		var bot: Combatant = r[0]
		var shot := [-1.0]
		var brain: BotBrain = bot.brain
		bot.weapons.fired.connect(func(_w, _i, _a): if shot[0] < 0.0: shot[0] = brain._now - brain.target_acquired_at)
		var t := 0
		while shot[0] < 0.0 and t < 300:
			await wait_physics(1)
			t += 1
		times.append(shot[0])
		arena.queue_free()
		await wait_frames(2)
	print("        acquisition-to-first-shot: easy %.2fs, expert %.2fs" % times)
	check(times[0] > 0 and times[1] > 0, "both fired")
	check(times[1] < times[0], "expert reacts faster than easy")
	check(times[1] >= BotProfile.for_difficulty(3).reaction_time - 0.001, "expert reaction time respected")
	check(times[0] >= BotProfile.for_difficulty(0).reaction_time - 0.001, "easy reaction time respected")

func test_cover_point_is_hidden() -> void:
	var info := _make_arena()
	_box(Vector3(2, 0, -1), Vector3(3, 2.5, 1))
	await wait_physics(2)
	var map := GameMap.new()
	map.apply_environment = false
	get_tree().root.add_child(map)
	await map.await_navigation_ready()
	var tt := TeamTactics.new(T, map.info)
	var bot := BotFactory.create(map, T, 0, map.info, tt, 1)
	bot.spawn_at(Transform3D(Basis(), Vector3(-34.5, 0.02, -30.0))) # B site, near crates
	var threat := Combatant.new()
	threat.team = CT
	map.add_child(threat)
	threat.spawn_at(Transform3D(Basis(), Vector3(-31.0, 0.02, -14.0)))
	await wait_physics(3)
	var brain: BotBrain = bot.brain
	brain._seek_cover(threat)
	check(brain._cover_point != Vector3.INF, "found a cover point")
	if brain._cover_point != Vector3.INF:
		var space := map.get_world_3d().direct_space_state
		var q := PhysicsRayQueryParameters3D.create(threat.eye_position(), brain._cover_point + Vector3(0, 1.3, 0), GameConst.MASK_SIGHT)
		check(not space.intersect_ray(q).is_empty(), "cover point is hidden from the threat")
	map.queue_free()

## Full 5v5 bot rounds on Sawtooth (no bomb): checks movement, contact,
## kills and that nobody gets stuck.
func test_skirmish_rounds() -> void:
	var map := GameMap.new()
	map.apply_environment = false
	get_tree().root.add_child(map)
	await map.await_navigation_ready()
	var results := []
	for round_i in 3:
		var tt := TeamTactics.new(T, map.info)
		var ct := TeamTactics.new(CT, map.info)
		var teams := {T: [], CT: []}
		for team in [T, CT]:
			for i in 5:
				var b := BotFactory.create(map, team, i, map.info, tt if team == T else ct, 1)
				b.spawn_at(map.info.spawns[team][i])
				b.weapons.give(&"knife")
				b.weapons.give(&"p9")
				b.weapons.give(&"ravager" if team == T else &"sentinel", true)
				b.armor = 100.0
				b.has_helmet = true
				teams[team].append(b)
		tt.begin_round(teams[T], teams[CT])
		ct.begin_round(teams[CT], teams[T])
		var kills := {T: 0, CT: 0}
		var cb := func(victim, _k, _w, _h, _p): kills[GameConst.other_team(victim.team)] += 1
		Events.combatant_killed.connect(cb)
		var t := 0
		var first_contact := -1.0
		var still := {}
		var max_still := {}
		var last_pos := {}
		var reached_site := false
		var limit := 60 * 115
		while t < limit:
			await wait_physics(1)
			t += 1
			tt.update(1.0 / 60.0)
			ct.update(1.0 / 60.0)
			if first_contact < 0.0 and kills[T] + kills[CT] > 0:
				first_contact = t / 60.0
			var alive_t: int = teams[T].filter(func(b): return b.alive).size()
			var alive_ct: int = teams[CT].filter(func(b): return b.alive).size()
			if alive_t == 0 or alive_ct == 0:
				break
			if t % 30 == 0:
				for b: Combatant in teams[T] + teams[CT]:
					if not b.alive:
						continue
					var st: String = (b.brain as BotBrain).state
					var moving_task := st.begins_with("route") or st.begins_with("to-") or st == "hunt" or st == "clear-site"
					if moving_task and last_pos.has(b) and b.global_position.distance_to(last_pos[b]) < 0.4:
						still[b] = still.get(b, 0.0) + 0.5
						max_still[b] = maxf(max_still.get(b, 0.0), still[b])
					else:
						still[b] = 0.0
					last_pos[b] = b.global_position
					if b.team == T and map.info.site_at(b.global_position + Vector3(0, 0.1, 0)) == tt.target_site:
						reached_site = true
		Events.combatant_killed.disconnect(cb)
		var alive_t2: int = teams[T].filter(func(b): return b.alive).size()
		var alive_ct2: int = teams[CT].filter(func(b): return b.alive).size()
		var worst := 0.0
		for b in max_still:
			worst = maxf(worst, max_still[b])
		results.append({"site": tt.target_site, "time": t / 60.0, "kills_t": kills[T], "kills_ct": kills[CT], "alive_t": alive_t2, "alive_ct": alive_ct2, "contact": first_contact, "stuck": worst, "reached": reached_site})
		print("        round %d: site %s  %.1fs  kills T %d / CT %d  alive T %d / CT %d  first kill %.1fs  worst stall %.1fs  reached site %s" % [
			round_i + 1, tt.target_site, t / 60.0, kills[T], kills[CT], alive_t2, alive_ct2, first_contact, worst, reached_site])
		check(kills[T] + kills[CT] >= 4, "round %d: real fighting happened" % (round_i + 1))
		check(worst < 8.0, "round %d: no bot stalled on a moving task for long (%.1fs)" % [round_i + 1, worst])
		for b in teams[T] + teams[CT]:
			b.queue_free()
		await wait_frames(2)
	var decisive := results.filter(func(r): return r.alive_t == 0 or r.alive_ct == 0).size()
	check(decisive >= 2, "most rounds end in an elimination (%d/3)" % decisive)
	map.queue_free()
