extends TestCase
## Core rules: damage model, team helpers, input registration, intent.

func test_headshot_without_helmet_ignores_armor() -> void:
	var d := DamageInfo.make(30.0, null, &"test", GameConst.HitGroup.HEAD)
	d.armor_penetration = 0.5
	var r := DamageModel.resolve(d, 100.0, false)
	check_near(r.health_damage, 120.0, 0.001, "4x head multiplier, no helmet")
	check_near(r.armor_damage, 0.0, 0.001)

func test_helmet_absorbs_headshot() -> void:
	var d := DamageInfo.make(30.0, null, &"test", GameConst.HitGroup.HEAD)
	d.armor_penetration = 0.5
	var r := DamageModel.resolve(d, 100.0, true)
	check_near(r.health_damage, 60.0, 0.001)
	check_near(r.armor_damage, 30.0, 0.001)
	check(r.helmet_blocked)

func test_legs_never_protected() -> void:
	var d := DamageInfo.make(40.0, null, &"test", GameConst.HitGroup.LEG)
	var r := DamageModel.resolve(d, 100.0, true)
	check_near(r.health_damage, 30.0, 0.001)

func test_armor_depletes_and_bleeds_through() -> void:
	var d := DamageInfo.make(100.0, null, &"test", GameConst.HitGroup.CHEST)
	d.armor_penetration = 0.5
	var r := DamageModel.resolve(d, 5.0, false)
	check_near(r.armor_damage, 5.0, 0.001)
	check_near(r.health_damage, 90.0, 0.001)

func test_range_falloff() -> void:
	check_near(DamageModel.range_modifier(0.9, 0.0), 1.0, 0.0001)
	check_near(DamageModel.range_modifier(0.9, 10.0), 0.9, 0.0001)
	check(DamageModel.range_modifier(0.98, 50.0) > DamageModel.range_modifier(0.85, 50.0))

func test_team_helpers() -> void:
	check_eq(GameConst.other_team(GameConst.Team.ATTACKERS), GameConst.Team.DEFENDERS)
	check_eq(GameConst.other_team(GameConst.Team.DEFENDERS), GameConst.Team.ATTACKERS)
	var mask := GameConst.body_mask(GameConst.Team.ATTACKERS)
	check(mask & GameConst.LAYER_BODY_DEFENDERS != 0, "attackers collide with defenders")
	check(mask & GameConst.LAYER_BODY_ATTACKERS == 0, "teammates pass through")

func test_input_actions_registered() -> void:
	for action in GameSettings.DEFAULT_BINDINGS:
		check(InputMap.has_action(action), "missing action " + action)
		check(InputMap.action_get_events(action).size() > 0, "no events for " + action)

func test_intent_clear_triggers() -> void:
	var i := CombatIntent.new()
	i.reload = true
	i.switch_slot = 2
	i.fire = true
	i.clear_triggers()
	check(not i.reload)
	check_eq(i.switch_slot, -1)
	check(i.fire, "held inputs survive clear")

func test_audio_buses_exist() -> void:
	for b in ["SFX", "UI", "Ambience"]:
		check(AudioServer.get_bus_index(b) >= 0, "bus " + b)
