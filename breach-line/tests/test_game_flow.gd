extends TestCase
## End-to-end smoke test of the real game scene with a human player slot:
## buying in freeze time, pause/resume, death → spectating, next round.

func test_game_scene_flow() -> void:
	GameSettings.pending_team = GameConst.Team.ATTACKERS
	var game: GameRoot = load("res://scenes/game.tscn").instantiate()
	get_tree().root.add_child(game)
	await wait_physics(5)
	var mm := game.mm
	check(mm != null and mm.local_record != null, "match created with a human record")
	check_eq(mm.records.size(), 10, "5v5")
	check_eq(mm.phase, MatchManager.Phase.FREEZE, "starts in freeze time")
	check(game.player.frozen, "player frozen during freeze time")
	# Buying.
	check_eq(mm.can_buy(mm.local_record), "", "can buy in spawn during freeze")
	game._open_buy()
	await wait_frames(2)
	check(game.buy_menu != null, "buy menu opens")
	var before := mm.local_record.money
	check_eq(mm.try_buy(mm.local_record, &"kevlar"), "", "buy kevlar")
	check_eq(mm.local_record.money, before - 650)
	check_eq(game.player.armor, 100.0)
	check_eq(mm.try_buy(mm.local_record, &"sentinel"), "wrong team", "side lock enforced")
	game._close_buy()
	check(game.buy_menu == null, "buy menu closes")
	# Pause.
	game._pause()
	check(get_tree().paused, "pause menu pauses the game")
	game._resume()
	check(not get_tree().paused, "resume unpauses")
	# Go live, then die and spectate.
	var t := 0
	while mm.phase == MatchManager.Phase.FREEZE and t < 600:
		await wait_physics(1)
		t += 1
	check_eq(mm.phase, MatchManager.Phase.LIVE, "round goes live")
	check(not game.player.frozen, "player unfrozen")
	game.player.apply_damage(DamageInfo.make(500.0, null, &"fall"))
	check(not game.player.alive, "player died")
	await wait_physics(150)
	if mm.alive(GameConst.Team.ATTACKERS).size() > 0:
		check(game.spectator.current, "spectating a teammate after death")
	# Next round respawns the player with the first-person camera.
	t = 0
	while mm.round_number < 2 and t < 60 * 200:
		await wait_physics(1)
		t += 1
	check_eq(mm.round_number, 2, "second round started")
	await wait_physics(2)
	check(game.player.alive, "player respawned")
	check(game.player_brain.camera.current, "first-person camera restored")
	check(game.player.weapons.has_slot(GameConst.Slot.SECONDARY), "player has a pistol")
	game.queue_free()
	await wait_frames(3)
	Fx.clear()
