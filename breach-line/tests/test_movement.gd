extends TestCase
## Player controller physics: speeds, friction, jumping, crouching,
## crouch-jump, air control, fatigue, fall damage and map traversal.

var arena: Node3D
var c: Combatant
var brain: ScriptBrain

func before_each() -> void:
	arena = Node3D.new()
	get_tree().root.add_child(arena)
	var body := StaticBody3D.new()
	body.collision_layer = GameConst.LAYER_WORLD
	body.set_meta("surface", "concrete")
	arena.add_child(body)
	_box(body, Vector3(-60, -1, -60), Vector3(60, 0, 60)) # floor
	_box(body, Vector3(4, 0, -1), Vector3(6, 1.15, 1)) # crate-height box
	_box(body, Vector3(4, 0, 9), Vector3(6, 1.45, 11)) # too tall even with crouch-jump
	_box(body, Vector3(-8, 1.5, -1), Vector3(-4, 2.5, 1)) # low ceiling (1.5 m clearance)
	_box(body, Vector3(-30, 0, 20), Vector3(-29, 8, 21)) # tower for fall tests
	c = Combatant.new()
	c.team = GameConst.Team.ATTACKERS
	arena.add_child(c)
	brain = ScriptBrain.new()
	c.add_child(brain)
	c.brain = brain
	c.speed_limit = 5.7
	c.spawn_at(Transform3D(Basis(), Vector3(0, 0.02, 0)))
	await wait_physics(3)

func after_each() -> void:
	arena.queue_free()
	await wait_frames(1)

func _box(body: StaticBody3D, a: Vector3, b: Vector3) -> void:
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = (b - a).abs()
	cs.shape = s
	cs.position = (a + b) * 0.5
	body.add_child(cs)

func _drive(f: Callable, ticks: int) -> void:
	brain.fn = f
	await wait_physics(ticks)

func test_accelerates_to_run_speed() -> void:
	var t95 := -1
	brain.fn = func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.yaw = 0.0
	for n in 60:
		await wait_physics(1)
		if t95 < 0 and c.horizontal_speed() >= 5.7 * 0.95:
			t95 = n
	check_near(c.horizontal_speed(), 5.7, 0.05, "top speed equals weapon limit")
	check(t95 > 0 and t95 <= 24, "reaches 95%% speed within 0.4 s (ticks=%d)" % t95)
	check(c.global_position.z < -3.0, "moved forward (-Z)")

func test_friction_stops_quickly() -> void:
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1), 60)
	var start := c.global_position
	var stop_tick := -1
	brain.fn = func(_c, i: CombatIntent, _d): i.move = Vector2.ZERO
	for n in 60:
		await wait_physics(1)
		if c.horizontal_speed() < 0.05:
			stop_tick = n
			break
	check(stop_tick > 0 and stop_tick < 30, "stops within 0.5 s (ticks=%d)" % stop_tick)
	check_range(start.distance_to(c.global_position), 0.3, 1.4, "stopping distance")

func test_walk_and_crouch_speeds() -> void:
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.walk = true, 60)
	check_near(c.horizontal_speed(), 5.7 * Combatant.WALK_FACTOR, 0.08, "walk speed")
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.walk = false; i.crouch = true, 60)
	check_near(c.horizontal_speed(), 5.7 * Combatant.CROUCH_FACTOR, 0.08, "crouch speed")
	check_near(c.eye_height(), Combatant.EYE_CROUCH, 0.01, "crouched eye height")
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2.ZERO; i.crouch = false, 30)
	check_near(c.eye_height(), Combatant.EYE_STAND, 0.01, "stands back up")

func test_diagonal_not_faster() -> void:
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(1, 1), 60)
	check(c.horizontal_speed() <= 5.7 + 0.02, "diagonal capped at run speed (%.3f)" % c.horizontal_speed())

func test_jump_height() -> void:
	var apex := 0.0
	brain.fn = func(_c, i: CombatIntent, _d): i.jump = true
	for n in 60:
		await wait_physics(1)
		apex = maxf(apex, c.global_position.y)
	check_range(apex, 1.0, 1.15, "standing jump apex")
	check(c.is_on_floor(), "lands again")

func test_crouch_jump_higher() -> void:
	var apex := 0.0
	var tick := [0]
	brain.fn = func(_c, i: CombatIntent, _d):
		tick[0] += 1
		i.jump = tick[0] < 5
		i.crouch = tick[0] > 3
	for n in 70:
		await wait_physics(1)
		apex = maxf(apex, c.global_position.y)
	check_range(apex, 1.25, 1.5, "crouch-jump apex")

func test_crate_needs_crouch_jump() -> void:
	# Run-up toward a 1.15 m crate (faces +X); jump ~1 m before it.
	var t := [0]
	var jumped_at := [-1]
	var crouch_jump := [false]
	var f := func(cc: Combatant, i: CombatIntent, _d):
		t[0] += 1
		i.yaw = -PI / 2
		i.move = Vector2(0, 1)
		i.jump = jumped_at[0] < 0 and cc.global_position.x > 2.6
		if i.jump:
			jumped_at[0] = t[0]
		i.crouch = crouch_jump[0] and jumped_at[0] > 0 and t[0] > jumped_at[0] + 1 and t[0] < jumped_at[0] + 50
	c.spawn_at(Transform3D(Basis(Vector3.UP, -PI / 2), Vector3(-1.0, 0.02, 0)))
	await wait_physics(2)
	await _drive(f, 90)
	check(c.global_position.y < 0.3, "plain jump does not mount 1.15 m crate (y=%.2f)" % c.global_position.y)
	c.spawn_at(Transform3D(Basis(Vector3.UP, -PI / 2), Vector3(-1.0, 0.02, 0)))
	await wait_physics(2)
	t[0] = 0
	jumped_at[0] = -1
	crouch_jump[0] = true
	await _drive(f, 90)
	check_range(c.global_position.y, 1.1, 1.25, "crouch-jump mounts crate")

func test_tall_box_unreachable() -> void:
	c.spawn_at(Transform3D(Basis(Vector3.UP, -PI / 2), Vector3(2.0, 0.02, 10)))
	await wait_physics(2)
	var t := [0]
	brain.fn = func(_c, i: CombatIntent, _d):
		t[0] += 1
		i.yaw = -PI / 2
		i.move = Vector2(0, 1)
		i.jump = t[0] == 4
		i.crouch = t[0] > 7
	await wait_physics(90)
	check(c.global_position.y < 0.3, "1.45 m box is not climbable")

func test_cannot_stand_under_low_ceiling() -> void:
	c.spawn_at(Transform3D(Basis(Vector3.UP, PI / 2), Vector3(-2.0, 0.02, 0)))
	await wait_physics(2)
	# Crouch-walk under the 1.5 m ceiling, then release crouch.
	await _drive(func(_c, i: CombatIntent, _d): i.yaw = PI / 2; i.move = Vector2(0, 1); i.crouch = true, 150)
	check(c.global_position.x < -4.5, "moved under the ceiling (x=%.2f)" % c.global_position.x)
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2.ZERO; i.crouch = false, 30)
	check(c.crouch_amount > 0.99, "stays crouched under ceiling")
	# Standing upright, the low ceiling blocks entry.
	c.spawn_at(Transform3D(Basis(Vector3.UP, PI / 2), Vector3(-2.0, 0.02, 0)))
	await _drive(func(_c, i: CombatIntent, _d): i.yaw = PI / 2; i.move = Vector2(0, 1); i.crouch = false, 60)
	check(c.global_position.x > -3.7, "standing player blocked by ceiling (x=%.2f)" % c.global_position.x)

func test_air_control_limited() -> void:
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1), 50)
	var t := [0]
	var max_speed := 0.0
	brain.fn = func(_c, i: CombatIntent, _d):
		t[0] += 1
		i.jump = t[0] == 1
		i.move = Vector2(1, 0) # strafe in the air
		i.yaw = t[0] * 0.04 # turning into the strafe
	for n in 40:
		await wait_physics(1)
		max_speed = maxf(max_speed, c.horizontal_speed())
	check(max_speed < 5.7 * 1.25, "air strafing gains little speed (%.2f)" % max_speed)

func test_jump_fatigue_slows() -> void:
	var t := [0]
	brain.fn = func(_c, i: CombatIntent, _d):
		t[0] += 1
		i.move = Vector2(0, 1)
		i.jump = (t[0] % 40) < 2
	await wait_physics(200)
	check(c.fatigue > 0.2, "fatigue accumulates from repeated jumps (%.2f)" % c.fatigue)
	check(c.max_speed() < 5.7 * 0.95, "fatigue lowers max speed")

func test_fall_damage() -> void:
	c.spawn_at(Transform3D(Basis(), Vector3(-29.5, 8.05, 20.5)))
	await wait_physics(2)
	check_near(c.global_position.y, 8.0, 0.1, "standing on 8 m tower")
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.yaw = 0.0, 90)
	check(c.health < 100.0 and c.health > 50.0, "8 m fall hurts (hp=%.1f)" % c.health)
	var hp := c.health
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2.ZERO; i.jump = true, 50)
	check_near(c.health, hp, 0.01, "jumping on flat ground is harmless")

func test_frozen_blocks_movement() -> void:
	c.frozen = true
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.jump = true; i.yaw = 1.0, 30)
	check(c.horizontal_speed() < 0.01 and c.global_position.y < 0.1, "frozen combatant doesn't move")
	check_near(c.yaw, 1.0, 0.001, "frozen combatant can still look")
	c.frozen = false

func test_footsteps_emitted() -> void:
	var steps := [0]
	c.footstep.connect(func(_s, _l): steps[0] += 1)
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1), 120)
	check(steps[0] >= 4, "running produces footsteps (%d)" % steps[0])
	steps[0] = 0
	await _drive(func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.walk = true, 120)
	check_eq(steps[0], 0, "walking is silent")

func test_traverses_map_routes() -> void:
	arena.queue_free()
	var map := GameMap.new()
	map.apply_environment = false
	get_tree().root.add_child(map)
	await map.await_navigation_ready()
	arena = map
	c = Combatant.new()
	c.team = GameConst.Team.ATTACKERS
	c.map_info = map.info
	map.add_child(c)
	brain = ScriptBrain.new()
	c.add_child(brain)
	c.brain = brain
	c.speed_limit = 5.7
	var rid := map.get_world_3d().navigation_map
	for route in map.info.routes:
		c.spawn_at(map.info.spawns[GameConst.Team.ATTACKERS][2])
		await wait_physics(2)
		var walker := PathWalker.new(rid)
		var ticks := 0
		var stuck_ticks := 0
		var last_pos := c.global_position
		for p in route.points:
			var target := NavigationServer3D.map_get_closest_point(rid, p)
			if not walker.set_target(c.global_position, target):
				fail("%s: no path to %s" % [route.name, p])
				break
			brain.fn = func(cc, i, _d): walker.steer(cc, i)
			while not walker.done and ticks < 60 * 40:
				await wait_physics(1)
				ticks += 1
				if ticks % 30 == 0:
					if c.global_position.distance_to(last_pos) < 0.5:
						stuck_ticks += 30
					last_pos = c.global_position
			var reached := c.global_position.distance_to(target) < 1.5
			check(reached, "%s: reached %s (at %s)" % [route.name, target, c.global_position])
			if not reached:
				break
		check(stuck_ticks < 60, "%s: never stuck for long" % route.name)
		print("        walked %-10s in %.1fs" % [route.name, ticks / 60.0])
	map.queue_free()
	arena = Node3D.new()
	get_tree().root.add_child(arena)

func test_steps_up_small_ledges() -> void:
	var body: StaticBody3D = arena.get_child(0)
	_box(body, Vector3(-2, 0, 14), Vector3(2, 0.25, 18)) # 25 cm curb
	_box(body, Vector3(-2, 0, 24), Vector3(2, 0.45, 28)) # 45 cm: too high
	await wait_physics(2)
	c.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, 11)))
	await _drive(func(_c, i: CombatIntent, _d): i.yaw = PI; i.move = Vector2(0, 1), 50)
	check(c.global_position.y > 0.2, "steps onto 25 cm curb (y=%.2f)" % c.global_position.y)
	c.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, 21)))
	await _drive(func(_c, i: CombatIntent, _d): i.yaw = PI; i.move = Vector2(0, 1), 50)
	check(c.global_position.y < 0.1, "45 cm ledge needs a jump (y=%.2f)" % c.global_position.y)
