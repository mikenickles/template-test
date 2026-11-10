extends TestCase
## Weapon data, state machine, hit detection, damage, penetration, recoil,
## spread, switching, melee and kill events.

var arena: Node3D
var body: StaticBody3D
var shooter: Combatant
var target: Combatant
var brain: ScriptBrain

func before_each() -> void:
	arena = Node3D.new()
	get_tree().root.add_child(arena)
	body = StaticBody3D.new()
	body.collision_layer = GameConst.LAYER_WORLD
	body.set_meta("surface", "concrete")
	arena.add_child(body)
	_box(body, Vector3(-80, -1, -80), Vector3(80, 0, 80))
	shooter = Combatant.new()
	shooter.team = GameConst.Team.ATTACKERS
	arena.add_child(shooter)
	brain = ScriptBrain.new()
	shooter.add_child(brain)
	shooter.brain = brain
	shooter.spawn_at(Transform3D(Basis(), Vector3(0, 0.02, 0)))
	target = Combatant.new()
	target.team = GameConst.Team.DEFENDERS
	arena.add_child(target)
	target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -10)))
	await wait_physics(4)

func after_each() -> void:
	arena.queue_free()
	await wait_frames(1)

func _box(b: StaticBody3D, lo: Vector3, hi: Vector3) -> CollisionShape3D:
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = (hi - lo).abs()
	cs.shape = s
	cs.position = (lo + hi) * 0.5
	b.add_child(cs)
	return cs

## Zero-spread copy of a weapon so hit tests are deterministic.
func _precise(id: StringName) -> WeaponData:
	var d := WeaponDB.get_data(id).duplicate() as WeaponData
	d.inaccuracy_stand = 0.0
	d.inaccuracy_crouch = 0.0
	d.inaccuracy_move = 0.0
	d.inaccuracy_per_shot = 0.0
	d.pellet_spread = d.pellet_spread
	d.draw_time = 0.0
	return d

func _aim_at(p: Vector3) -> void:
	var d := p - shooter.eye_position()
	var yaw := atan2(-d.x, -d.z)
	var pitch := atan2(d.y, Vector2(d.x, d.z).length())
	brain.fn = func(_c, i: CombatIntent, _d): i.yaw = yaw; i.pitch = pitch; i.fire = false
	await wait_physics(2)

func _shoot_once() -> void:
	var yaw := shooter.intent.yaw
	var pitch := shooter.intent.pitch
	brain.fn = func(_c, i: CombatIntent, _d): i.yaw = yaw; i.pitch = pitch; i.fire = true
	await wait_physics(1)
	brain.fn = func(_c, i: CombatIntent, _d): i.yaw = yaw; i.pitch = pitch; i.fire = false
	await wait_physics(1)

func test_weapon_data_valid() -> void:
	var ids := WeaponDB.ids()
	check(ids.size() >= 9, "weapons registered (%d)" % ids.size())
	for d in WeaponDB.all():
		check(d.display_name != "", "%s has a name" % d.id)
		check(d.price >= 0 and d.price <= 6000, "%s price sane" % d.id)
		check(d.move_speed > 4.5 and d.move_speed <= 6.5, "%s move speed" % d.id)
		var m := WeaponModels.build(d.model)
		check(m.get_node_or_null("Muzzle") != null, "%s model has Muzzle" % d.id)
		m.free()
		if d.is_gun():
			check(d.mag_size > 0 and d.reserve_max >= d.mag_size, "%s ammo sane" % d.id)
			check(Audio.has_sound(d.fire_sound), "%s fire sound exists (%s)" % [d.id, d.fire_sound])
			for cue in d.reload_sounds:
				check(Audio.has_sound(str(cue[1])), "%s reload cue %s exists" % [d.id, cue[1]])
			check_eq(d.recoil_offset(0), Vector2.ZERO, "%s first shot has no recoil" % d.id)
			if d.automatic:
				check(d.recoil_offset(5).y > d.recoil_offset(1).y, "%s recoil climbs" % d.id)
	# Balance relationships the design relies on.
	var rav := WeaponDB.get_data(&"ravager")
	var sen := WeaponDB.get_data(&"sentinel")
	check(rav.damage * 4.0 * rav.armor_penetration >= 100.0, "ravager one-taps helmets")
	check(sen.damage * 4.0 * sen.armor_penetration < 100.0, "sentinel does not one-tap helmets")
	check(rav.team == GameConst.Team.ATTACKERS and sen.team == GameConst.Team.DEFENDERS, "side rifles")

func test_instance_ammo_and_reload() -> void:
	var w := WeaponInstance.new(WeaponDB.get_data(&"p9"))
	w.state = WeaponInstance.State.IDLE
	check_eq(w.mag, 15)
	check(w.consume_shot())
	check_eq(w.mag, 14)
	check(not w.is_ready(), "cooldown after shot")
	w.tick(0.16)
	check(w.is_ready(), "ready after fire interval")
	check(w.start_reload(), "reload starts")
	var t := 0.0
	while w.state == WeaponInstance.State.RELOADING and t < 5.0:
		w.tick(0.05)
		t += 0.05
	check_near(t, 2.2, 0.06, "reload duration")
	check_eq(w.mag, 15, "mag full")
	check_eq(w.reserve, 59, "reserve reduced by one")
	check(not w.start_reload(), "no reload when full")

func test_shell_reload_and_interrupt() -> void:
	var w := WeaponInstance.new(WeaponDB.get_data(&"breacher12"))
	w.state = WeaponInstance.State.IDLE
	w.mag = 2
	check(w.start_reload())
	var t := 0.0
	while w.mag < 4 and t < 5.0:
		w.tick(0.05)
		t += 0.05
	check_eq(w.mag, 4, "two shells loaded")
	check(w.state == WeaponInstance.State.RELOADING, "still loading shells")
	w.interrupt_reload()
	check(w.state == WeaponInstance.State.IDLE, "shell reload interruptible")

func test_semi_auto_requires_release() -> void:
	shooter.weapons.give_data(_precise(&"p9"))
	await _aim_at(Vector3(0, 1.3, -30))
	var start := shooter.weapons.active.mag
	brain.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await wait_physics(60)
	check_eq(shooter.weapons.active.mag, start - 1, "holding fire shoots once with a pistol")
	var rav := shooter.weapons.give_data(_precise(&"ravager"))
	brain.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await wait_physics(60)
	check_range(30 - rav.mag, 9, 11, "auto rifle fires ~10 rounds/s (fired %d)" % (30 - rav.mag))

func test_hit_groups_and_damage() -> void:
	shooter.weapons.give_data(_precise(&"ravager"))
	var cases := [[Vector3(0, 1.68, -10), GameConst.HitGroup.HEAD], [Vector3(0, 1.33, -10), GameConst.HitGroup.CHEST], [Vector3(0.1, 0.45, -10), GameConst.HitGroup.LEG]]
	for cs in cases:
		target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -10)))
		await wait_physics(3)
		var got := [-1, 0.0]
		var cb := func(_v, _a, dmg: float, grp: int): got[0] = grp; got[1] = dmg
		target.damaged.connect(func(dmg, _a, grp): cb.call(null, null, dmg, grp))
		await _aim_at(cs[0])
		await _shoot_once()
		check_eq(got[0], cs[1], "aimed at %s hits group" % cs[0])
		for c in target.damaged.get_connections():
			target.damaged.disconnect(c.callable)
		await wait_physics(30)
	# Head kills an unarmored target in one shot.
	target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -10)))
	await wait_physics(3)
	await _aim_at(Vector3(0, 1.68, -10))
	await _shoot_once()
	check(not target.alive, "ravager headshot kills")

func test_armor_and_helmet() -> void:
	shooter.weapons.give_data(_precise(&"sentinel"))
	target.armor = 100.0
	target.has_helmet = true
	await _aim_at(Vector3(0, 1.68, -10))
	await _shoot_once()
	check(target.alive, "sentinel headshot vs helmet does not kill")
	check(target.health < 30.0 + 0.1 and target.health > 0.0, "big headshot damage (hp=%.1f)" % target.health)
	check(target.armor < 100.0, "helmet/armor absorbed some")

func test_range_falloff() -> void:
	shooter.weapons.give_data(_precise(&"vx9"))
	var dmg := [0.0]
	target.damaged.connect(func(d, _a, _g): dmg[0] = d)
	await _aim_at(Vector3(0, 1.33, -10))
	await _shoot_once()
	var near: float = dmg[0]
	target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -45)))
	await wait_physics(30)
	await _aim_at(Vector3(0, 1.33, -45))
	await _shoot_once()
	check(near > 0.0 and dmg[0] > 0.0, "both shots hit")
	check(dmg[0] < near * 0.6, "SMG falls off at range (%.1f vs %.1f)" % [dmg[0], near])

func test_penetration_wood_not_concrete() -> void:
	var wood := StaticBody3D.new()
	wood.collision_layer = GameConst.LAYER_WORLD
	wood.set_meta("surface", "wood")
	arena.add_child(wood)
	var wood_shape := _box(wood, Vector3(-1, 0, -5.2), Vector3(1, 2.2, -4.9))
	await wait_physics(2)
	shooter.weapons.give_data(_precise(&"ravager"))
	var dmg := [0.0]
	target.damaged.connect(func(d, _a, _g): dmg[0] = d)
	await _aim_at(Vector3(0, 1.33, -10))
	await _shoot_once()
	check(dmg[0] > 5.0 and dmg[0] < 36.0, "rifle penetrates 30 cm wood with reduced damage (%.1f)" % dmg[0])
	wood_shape.queue_free()
	_box(body, Vector3(-1, 0, -5.2), Vector3(1, 2.2, -4.9))
	await wait_physics(2)
	dmg[0] = 0.0
	target.health = 100.0
	await wait_physics(30)
	await _shoot_once()
	check_eq(dmg[0], 0.0, "concrete stops the bullet")

func test_recoil_climbs_and_recovers() -> void:
	shooter.weapons.give_data(_precise(&"ravager"))
	await _aim_at(Vector3(0, 1.5, -40))
	brain.fn = func(_c, i: CombatIntent, _d): i.fire = true
	await wait_physics(48)
	var p := shooter.weapons.aim_punch
	check(rad_to_deg(p.x) > 4.0, "spray climbs (%.2f deg)" % rad_to_deg(p.x))
	brain.fn = func(_c, i: CombatIntent, _d): i.fire = false
	await wait_physics(90)
	check(rad_to_deg(shooter.weapons.aim_punch.length()) < 0.3, "recoil recovers after a pause")
	check_eq(shooter.weapons.active.spray_index, 0, "spray index reset")

func test_spread_depends_on_movement() -> void:
	shooter.weapons.give(&"ravager", true)
	await wait_physics(80)
	var still := shooter.weapons.current_inaccuracy()
	brain.fn = func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1)
	await wait_physics(40)
	var running := shooter.weapons.current_inaccuracy()
	brain.fn = func(_c, i: CombatIntent, _d): i.move = Vector2(0, 1); i.jump = true
	await wait_physics(8)
	var air := shooter.weapons.current_inaccuracy()
	check(still < 0.6, "standing is accurate (%.2f)" % still)
	check(running > still * 5.0, "running is inaccurate (%.2f)" % running)
	check(air > running, "jumping is worst (%.2f)" % air)

func test_switching_draw_and_speed() -> void:
	shooter.weapons.give(&"knife")
	shooter.weapons.give(&"p9")
	shooter.weapons.give(&"longbow", true)
	await wait_physics(2)
	check_near(shooter.speed_limit, 5.2, 0.01, "sniper speed")
	brain.fn = func(_c, i: CombatIntent, _d): i.switch_slot = GameConst.Slot.MELEE
	await wait_physics(1)
	brain.fn = Callable()
	check_eq(shooter.weapons.active.data.id, &"knife", "switched to knife")
	check_near(shooter.speed_limit, 6.35, 0.01, "knife speed")
	check(shooter.weapons.active.state == WeaponInstance.State.DRAWING, "drawing after switch")
	brain.fn = func(_c, i: CombatIntent, _d): i.last_weapon = true
	await wait_physics(1)
	brain.fn = Callable()
	check_eq(shooter.weapons.active.data.id, &"longbow", "quick-switch back")
	# Scoping slows the sniper and narrows its spread.
	await wait_physics(90)
	var unscoped := shooter.weapons.current_inaccuracy()
	brain.fn = func(_c, i: CombatIntent, _d): i.alt_fire = true
	await wait_physics(1)
	brain.fn = func(_c, i: CombatIntent, _d): i.alt_fire = false
	await wait_physics(2)
	check(shooter.weapons.active.is_scoped(), "scoped")
	check(shooter.weapons.current_inaccuracy() < unscoped * 0.2, "scoped is precise")
	check(shooter.max_speed() < 5.2 * 0.7, "scoped movement slower")

func test_knife_and_backstab() -> void:
	shooter.weapons.give_data(_precise(&"knife"))
	target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -1.2)))
	await wait_physics(3)
	await _aim_at(Vector3(0, 1.3, -1.2))
	await _shoot_once()
	check_near(target.health, 60.0, 0.5, "front slash does 40")
	await wait_physics(40)
	# Victim facing away: heavy backstab kills.
	target.spawn_at(Transform3D(Basis(), Vector3(0, 0.02, -1.2)))
	await wait_physics(3)
	var yaw := shooter.intent.yaw
	var pitch := shooter.intent.pitch
	brain.fn = func(_c, i: CombatIntent, _d): i.yaw = yaw; i.pitch = pitch; i.alt_fire = true
	await wait_physics(2)
	brain.fn = func(_c, i: CombatIntent, _d): i.alt_fire = false
	await wait_physics(1)
	check(not target.alive, "backstab kills")

func test_shotgun_pellets() -> void:
	var d := WeaponDB.get_data(&"breacher12").duplicate() as WeaponData
	d.draw_time = 0.0
	shooter.weapons.give_data(d)
	target.spawn_at(Transform3D(Basis(Vector3.UP, PI), Vector3(0, 0.02, -4)))
	await wait_physics(3)
	var hits := [0]
	target.damaged.connect(func(_d, _a, _g): hits[0] += 1)
	var pellets := [0]
	shooter.weapons.fired.connect(func(_w, imp: Array, _i): pellets[0] = imp.size())
	await _aim_at(Vector3(0, 1.3, -4))
	await _shoot_once()
	check_eq(pellets[0], 9, "nine pellets traced")
	check(hits[0] >= 5, "most pellets hit at 4 m (%d)" % hits[0])
	check(not target.alive, "close shotgun blast kills")

func test_kill_event() -> void:
	shooter.weapons.give_data(_precise(&"hand_cannon"))
	var ev := []
	var cb := func(victim, killer, wid, headshot, _pen): ev.append([victim, killer, wid, headshot])
	Events.combatant_killed.connect(cb)
	await _aim_at(Vector3(0, 1.68, -10))
	await _shoot_once()
	Events.combatant_killed.disconnect(cb)
	check_eq(ev.size(), 1, "one kill event")
	if ev.size() == 1:
		check(ev[0][0] == target and ev[0][1] == shooter, "victim and killer")
		check_eq(ev[0][2], &"hand_cannon")
		check(ev[0][3], "headshot flag")
	check(target.collision_layer == 0, "corpse no longer blocks movement")

func test_empty_mag_auto_reload() -> void:
	var d := _precise(&"p9")
	var w := shooter.weapons.give_data(d)
	w.mag = 1
	await _aim_at(Vector3(0, 1.3, -30))
	await _shoot_once()
	check_eq(w.mag, 0)
	await wait_physics(15)
	check(w.state == WeaponInstance.State.RELOADING, "auto-reloads when empty")
