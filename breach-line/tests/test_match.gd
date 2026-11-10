extends TestCase
## Game rules: economy, buying, breach charge, and a full bot match.

const T := GameConst.Team.ATTACKERS
const CT := GameConst.Team.DEFENDERS

var arena: Node3D

func after_each() -> void:
	if arena and is_instance_valid(arena):
		arena.queue_free()
	arena = null
	await wait_frames(2)

func test_economy_rules() -> void:
	var cfg := MatchConfig.new()
	check_eq(Economy.loss_bonus(cfg, 1), 1400)
	check_eq(Economy.loss_bonus(cfg, 2), 1900)
	check_eq(Economy.loss_bonus(cfg, 5), 3400, "loss bonus caps")
	check_eq(Economy.loss_bonus(cfg, 9), 3400)
	check_eq(Economy.win_reward(cfg, MatchManager.EndReason.BOMB_EXPLODED), 3500)
	check_eq(Economy.win_reward(cfg, MatchManager.EndReason.ELIMINATION), 3250)
	check_eq(Economy.kill_reward(&"vx9"), 600)
	check_eq(Economy.kill_reward(&"longbow"), 100)
	check_eq(Economy.kill_reward(&"knife"), 1500)

func _arena_with_combatant(team: int) -> PlayerRecord:
	arena = Node3D.new()
	get_tree().root.add_child(arena)
	var c := Combatant.new()
	c.team = team
	c.build_model = false
	arena.add_child(c)
	var r := PlayerRecord.new()
	r.team = team
	r.combatant = c
	c.record = r
	c.weapons.give(&"knife")
	c.weapons.give(&"p9", true)
	return r

func test_buy_rules() -> void:
	var r := _arena_with_combatant(T)
	r.money = 800
	check_eq(BuySystem.check(r, &"ravager"), "not enough money")
	check_eq(BuySystem.check(r, &"sentinel"), "wrong team")
	check_eq(BuySystem.check(r, &"defuse_kit"), "wrong team")
	check(BuySystem.buy(r, &"kevlar"), "buy kevlar")
	check_eq(r.money, 150)
	check_eq(r.combatant.armor, 100.0)
	check_eq(BuySystem.price_of(&"kevlar_helmet", r.combatant), 350, "helmet-only upgrade price")
	r.money = 5000
	check(BuySystem.buy(r, &"ravager"), "buy rifle")
	check_eq(r.money, 2300)
	check_eq(r.combatant.weapons.active.data.id, &"ravager", "rifle equipped")
	check_eq(BuySystem.check(r, &"ravager"), "already owned")
	var dropped := []
	check(BuySystem.buy(r, &"hand_cannon", func(_c, w): dropped.append(w.data.id)), "buy pistol upgrade")
	check_eq(dropped, [&"p9"], "old pistol dropped")

func _bomb_arena(site_center: Vector3) -> Array:
	arena = Node3D.new()
	get_tree().root.add_child(arena)
	var body := StaticBody3D.new()
	body.collision_layer = GameConst.LAYER_WORLD
	arena.add_child(body)
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = Vector3(120, 1, 120)
	cs.shape = s
	cs.position = Vector3(0, -0.5, 0)
	body.add_child(cs)
	var info := MapInfo.new()
	info.bombsites[&"A"] = AABB(site_center - Vector3(5, 0.2, 5), Vector3(10, 4, 10))
	arena.add_child(info)
	var cfg := MatchConfig.new()
	var bomb := Bomb.new()
	arena.add_child(bomb)
	bomb.setup(cfg, info)
	var planter := Combatant.new()
	planter.team = T
	arena.add_child(planter)
	planter.spawn_at(Transform3D(Basis(), site_center + Vector3(0, 0.02, 0)))
	planter.weapons.give(&"knife", true)
	var defender := Combatant.new()
	defender.team = CT
	arena.add_child(defender)
	defender.spawn_at(Transform3D(Basis(), site_center + Vector3(8, 0.02, 0)))
	var b1 := ScriptBrain.new()
	planter.add_child(b1)
	planter.brain = b1
	var b2 := ScriptBrain.new()
	defender.add_child(b2)
	defender.brain = b2
	await wait_physics(3)
	return [bomb, planter, defender, cfg, b1, b2]

func _run(bomb: Bomb, a: Combatant, d: Combatant, frames: int) -> void:
	for i in frames:
		await wait_physics(1)
		bomb.update(1.0 / 60.0, [a] if a.alive else [], [d] if d.alive else [], true)

func test_plant_requires_site_and_time() -> void:
	var r: Array = await _bomb_arena(Vector3(0, 0, 0))
	var bomb: Bomb = r[0]
	var planter: Combatant = r[1]
	var b1: ScriptBrain = r[4]
	bomb.give_to(planter)
	b1.fn = func(_c, i: CombatIntent, _d): i.switch_slot = GameConst.Slot.BOMB
	await _run(bomb, planter, r[2], 60)
	check_eq(planter.weapons.active.data.id, &"bomb", "charge equipped")
	b1.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await _run(bomb, planter, r[2], 60)
	check(bomb.plant_progress > 0.5, "planting progresses in site")
	check(planter.move_locked, "planter locked in place")
	b1.fn = func(_c, i: CombatIntent, _d): i.fire = false
	await _run(bomb, planter, r[2], 2)
	check_eq(bomb.plant_progress, 0.0, "releasing cancels the plant")
	check(not planter.move_locked, "movement restored")
	b1.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await _run(bomb, planter, r[2], int(60 * 3.4))
	check(bomb.is_planted(), "planted after 3.2 s")
	check_eq(bomb.site, &"A")
	check(not planter.weapons.has_slot(GameConst.Slot.BOMB), "charge left the inventory")

func test_defuse_with_and_without_kit() -> void:
	for kit in [false, true]:
		var r: Array = await _bomb_arena(Vector3(0, 0, 0))
		var bomb: Bomb = r[0]
		var planter: Combatant = r[1]
		var defender: Combatant = r[2]
		var b1: ScriptBrain = r[4]
		var b2: ScriptBrain = r[5]
		bomb.give_to(planter)
		planter.weapons.switch_to(GameConst.Slot.BOMB)
		await _run(bomb, planter, defender, 50)
		b1.fn = func(_c, i: CombatIntent, _d): i.fire = true
		await _run(bomb, planter, defender, int(60 * 3.4))
		check(bomb.is_planted(), "planted")
		b1.fn = Callable()
		defender.has_defuse_kit = kit
		defender.spawn_at(Transform3D(Basis(), bomb.global_position + Vector3(1.0, 0.0, 0)))
		defender.has_defuse_kit = kit
		await _run(bomb, planter, defender, 3)
		b2.fn = func(_c, i: CombatIntent, _d): i.use = true
		var t := 0
		while bomb.state == Bomb.State.PLANTED and t < 60 * 15:
			await _run(bomb, planter, defender, 1)
			t += 1
		check(bomb.state == Bomb.State.DEFUSED, "defused (kit=%s)" % kit)
		var expected := 5.0 if kit else 10.0
		check_near(t / 60.0, expected, 0.15, "defuse time with kit=%s" % kit)
		arena.queue_free()
		await wait_frames(2)

func test_explosion_kills_nearby() -> void:
	var r: Array = await _bomb_arena(Vector3(0, 0, 0))
	var bomb: Bomb = r[0]
	var planter: Combatant = r[1]
	var defender: Combatant = r[2]
	var b1: ScriptBrain = r[4]
	bomb.give_to(planter)
	planter.weapons.switch_to(GameConst.Slot.BOMB)
	await _run(bomb, planter, defender, 50)
	b1.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await _run(bomb, planter, defender, int(60 * 3.4))
	b1.fn = Callable()
	defender.spawn_at(Transform3D(Basis(), bomb.global_position + Vector3(30, 0, 0)))
	var exploded := [false]
	bomb.exploded.connect(func(_p): exploded[0] = true)
	await _run(bomb, planter, defender, int(60 * 41))
	check(exploded[0], "charge exploded after 40 s")
	check(not planter.alive, "planter standing on it died")
	check(defender.alive and defender.health == 100.0, "far defender unharmed")

## Full match, bots only, shortened format (first to 4, swap after 3).
func test_full_bot_match() -> void:
	var map := GameMap.new()
	map.apply_environment = false
	get_tree().root.add_child(map)
	arena = map
	await map.await_navigation_ready()
	var mm := MatchManager.new()
	mm.cfg.rounds_to_win = 4
	mm.cfg.max_rounds = 6
	mm.cfg.halftime_after = 3
	mm.cfg.round_end_time = 2.0
	mm.cfg.halftime_time = 2.0
	map.add_child(mm)
	mm.setup(map, map, null, T, 1)
	var stats := {"planted": 0, "defused": 0, "exploded": 0, "kills": 0, "halftime": 0, "rounds": []}
	var on_plant := func(_p, _s, _pos): stats.planted += 1
	var on_defuse := func(_d): stats.defused += 1
	var on_explode := func(_p): stats.exploded += 1
	var on_kill := func(_v, _k, _w, _h, _pp): stats.kills += 1
	var on_half := func(): stats.halftime += 1
	var on_round := func(w, reason): stats.rounds.append([mm.round_number, w, reason, mm.round_elapsed])
	Events.bomb_planted.connect(on_plant)
	Events.bomb_defused.connect(on_defuse)
	Events.bomb_exploded.connect(on_explode)
	Events.combatant_killed.connect(on_kill)
	Events.halftime.connect(on_half)
	Events.round_ended.connect(on_round)
	var first_team: int = mm.records[0].team
	var first_rec := mm.records[0]
	mm.start_match()
	var min_money := 999999
	var max_money := 0
	var ticks := 0
	while mm.phase != MatchManager.Phase.MATCH_END and ticks < 60 * 60 * 18:
		await wait_physics(1)
		ticks += 1
		if ticks % 60 == 0:
			for r in mm.records:
				min_money = mini(min_money, r.money)
				max_money = maxi(max_money, r.money)
	for sig in [[Events.bomb_planted, on_plant], [Events.bomb_defused, on_defuse], [Events.bomb_exploded, on_explode], [Events.combatant_killed, on_kill], [Events.halftime, on_half], [Events.round_ended, on_round]]:
		(sig[0] as Signal).disconnect(sig[1])
	var reasons := ["elim", "bomb", "defuse", "time"]
	for rr in stats.rounds:
		print("        round %d: %s win by %s at %.0fs" % [rr[0], GameConst.team_name(rr[1]), reasons[rr[2]], rr[3]])
	print("        final %d-%d after %d rounds, %.1f min simulated; plants %d, defuses %d, explosions %d, kills %d" % [
		mm.score[T], mm.score[CT], mm.round_number, ticks / 3600.0, stats.planted, stats.defused, stats.exploded, stats.kills])
	check(mm.phase == MatchManager.Phase.MATCH_END, "match finished")
	check_eq(mm.score[T] + mm.score[CT], mm.round_number, "every round awarded once")
	check(maxi(mm.score[T], mm.score[CT]) >= 4 or mm.round_number == 6, "ended by win condition or round limit")
	check_eq(stats.halftime, 1 if mm.round_number > 3 else 0, "halftime swap happened once")
	if mm.round_number > 3:
		check(first_rec.team != first_team, "teams switched sides")
	check(stats.planted >= 1, "charge planted at least once")
	check(stats.kills >= mm.round_number * 3, "fights in every round")
	check(min_money >= 0 and max_money <= mm.cfg.max_money, "money within bounds")
	var k := 0
	var d := 0
	for r in mm.records:
		k += r.kills
		d += r.deaths
	check(k <= d, "kills never exceed deaths")
