class_name GameRoot
extends Node3D
## Gameplay scene: builds the map, the local player (first-person rig), the
## MatchManager with bots, and the HUD/menus. Handles pause, buy menu,
## scoreboard, spectating after death and the end-of-match screen.

var map: GameMap
var player: Combatant
var player_brain: PlayerBrain
var mm: MatchManager
var hud: PlayerHUD
var match_hud: MatchHUD
var viewmodel: ViewModel
var debug_overlay: DebugOverlay
var scoreboard: Scoreboard
var buy_menu: BuyMenu
var pause_menu: PauseMenu
var end_screen: EndScreen
var spectator: SpectatorCamera
var hud_layer: CanvasLayer
var menu_layer: CanvasLayer
var _spectate_at := -1.0
var _shot_path := ""
var _force_scoreboard := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE
	map = GameMap.new()
	map.name = "Map"
	add_child(map)
	var team := GameSettings.pending_team
	if team == 0:
		team = GameConst.Team.ATTACKERS if randf() < 0.5 else GameConst.Team.DEFENDERS
	_create_player(team)
	mm = MatchManager.new()
	add_child(mm)
	mm.setup(map, self, player, team, GameSettings.bot_difficulty)
	_create_ui()
	spectator = SpectatorCamera.new()
	spectator.targets = func(): return mm.alive(mm.local_record.team) if mm.local_record else []
	add_child(spectator)
	Events.combatant_killed.connect(_on_killed)
	Events.round_started.connect(_on_round_started)
	Events.match_ended.connect(_on_match_ended)
	Events.bomb_exploded.connect(func(pos: Vector3): player_brain.camera.add_shake(clampf(1.4 - pos.distance_to(player.global_position) / 60.0, 0.15, 1.4)))
	Audio.play_ambience(map.env_def.get("ambience", ""), -10.0)
	capture_mouse(true)
	mm.start_match()
	_dev_args()

func _create_player(team: int) -> void:
	player = Combatant.new()
	player.name = "Player"
	player.team = team
	player.map_info = map.info
	add_child(player)
	player_brain = PlayerBrain.new()
	player_brain.name = "PlayerBrain"
	player.add_child(player_brain)
	player_brain.attach(player)
	player.model.set_first_person(true)
	player.weapons.local_player = true
	Combatant.local = player
	viewmodel = ViewModel.new()
	player_brain.camera.add_child(viewmodel)
	viewmodel.setup(player, player_brain.camera)

func _create_ui() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.name = "HUDLayer"
	add_child(hud_layer)
	hud = PlayerHUD.new()
	hud_layer.add_child(hud)
	hud.setup(player, player_brain.camera)
	match_hud = MatchHUD.new()
	hud_layer.add_child(match_hud)
	match_hud.setup(mm, mm.local_record)
	scoreboard = Scoreboard.new()
	scoreboard.visible = false
	hud_layer.add_child(scoreboard)
	scoreboard.setup(mm, mm.local_record)
	debug_overlay = DebugOverlay.new()
	debug_overlay.target = player
	debug_overlay.visible = GameSettings.show_fps
	hud_layer.add_child(debug_overlay)
	menu_layer = CanvasLayer.new()
	menu_layer.layer = 10
	menu_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(menu_layer)

func capture_mouse(on: bool) -> void:
	if DisplayServer.get_name() == "headless":
		return
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE

# ---------------------------------------------------------------------------
# Menus
# ---------------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if end_screen:
		return
	if event.is_action_pressed("pause"):
		if buy_menu:
			_close_buy()
		elif pause_menu:
			_resume()
		else:
			_pause()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("buy_menu") and pause_menu == null:
		if buy_menu:
			_close_buy()
		elif mm.local_record and mm.can_buy(mm.local_record) == "":
			_open_buy()
	elif event is InputEventKey and event.pressed and event.physical_keycode == KEY_F3:
		debug_overlay.visible = not debug_overlay.visible
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and pause_menu == null and buy_menu == null:
		capture_mouse(true)

func _pause() -> void:
	pause_menu = PauseMenu.new()
	menu_layer.add_child(pause_menu)
	pause_menu.resume_requested.connect(_resume)
	pause_menu.quit_requested.connect(_quit_to_menu)
	get_tree().paused = true
	capture_mouse(false)

func _resume() -> void:
	if pause_menu:
		pause_menu.queue_free()
		pause_menu = null
	get_tree().paused = false
	capture_mouse(true)

func _quit_to_menu() -> void:
	get_tree().paused = false
	Audio.stop_all()
	Fx.clear()
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

func _open_buy() -> void:
	buy_menu = BuyMenu.new()
	buy_menu.setup(mm, mm.local_record)
	menu_layer.add_child(buy_menu)
	buy_menu.closed.connect(_close_buy)
	player_brain.input_enabled = false
	capture_mouse(false)

func _close_buy() -> void:
	if buy_menu:
		buy_menu.queue_free()
		buy_menu = null
	player_brain.input_enabled = true
	capture_mouse(true)

# ---------------------------------------------------------------------------
# Match events
# ---------------------------------------------------------------------------

func _on_killed(victim: Node, _killer: Node, _w: StringName, _h: bool, _p: bool) -> void:
	if victim == player:
		_spectate_at = 1.6
		if buy_menu:
			_close_buy()

func _on_round_started(_n: int) -> void:
	_spectate_at = -1.0
	player_brain.camera.current = true
	match_hud.spectating = null
	# Side swaps change sleeve colours: rebuild the first-person rig.
	if player.weapons.active:
		viewmodel._on_switched(player.weapons.active)
	player_brain.on_spawned(player)

func _on_match_ended(winner: int) -> void:
	await get_tree().create_timer(3.0).timeout
	if _shot_path != "":
		return
	end_screen = EndScreen.new()
	end_screen.setup(mm, mm.local_record, winner)
	menu_layer.add_child(end_screen)
	end_screen.play_again.connect(func(): get_tree().paused = false; Fx.clear(); get_tree().reload_current_scene())
	end_screen.to_menu.connect(_quit_to_menu)
	get_tree().paused = true
	capture_mouse(false)

func _process(delta: float) -> void:
	scoreboard.visible = (Input.is_action_pressed("scoreboard") or _force_scoreboard) and end_screen == null
	if _spectate_at > 0.0:
		_spectate_at -= delta
		if _spectate_at <= 0.0:
			spectator.pick_next(1)
			if spectator.target:
				spectator.current = true
	if spectator.current:
		match_hud.spectating = spectator.target
	match_hud.set_hint(_context_hint())

func _context_hint() -> String:
	if not player.alive or mm.local_record == null:
		return ""
	var bomb := mm.bomb
	if player.team == GameConst.Team.ATTACKERS and bomb.carrier == player and map.info.site_at(player.global_position + Vector3(0, 0.1, 0)) != &"" and bomb.planter == null:
		return "Select the charge (5) and hold FIRE to plant"
	if player.team == GameConst.Team.DEFENDERS and bomb.is_planted() and bomb.defuser == null and player.global_position.distance_to(bomb.global_position) < 2.5:
		return "Hold E to defuse"
	return ""

# ---------------------------------------------------------------------------
# Developer flags (after `--`):
#   --spawn=x,y,z,yaw  --shot=/abs.png  --shot-frames=N  --weapon=id  --fire
#   --no-occlusion  --live (skip freeze time)  --spectate
# ---------------------------------------------------------------------------

func _dev_args() -> void:
	var frames := 60
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--spawn="):
			var v := arg.substr(8).split(",")
			if v.size() >= 3:
				var yaw := deg_to_rad(float(v[3])) if v.size() > 3 else 0.0
				player.spawn_at(Transform3D(Basis(Vector3.UP, yaw), Vector3(float(v[0]), float(v[1]), float(v[2]))))
		elif arg.begins_with("--shot="):
			_shot_path = arg.substr(7)
		elif arg.begins_with("--shot-frames="):
			frames = int(arg.substr(14))
		elif arg.begins_with("--weapon="):
			player.weapons.give(StringName(arg.substr(9)), true)
		elif arg == "--fire":
			player_brain.debug_fire_frames = 40
		elif arg == "--no-occlusion":
			get_viewport().use_occlusion_culling = false
		elif arg == "--live":
			mm.phase_time = 0.01
		elif arg == "--buy":
			_open_buy.call_deferred()
		elif arg == "--scoreboard":
			_force_scoreboard = true
		elif arg == "--spectate":
			player.apply_damage(DamageInfo.make(500.0, null, &"fall"))
	if _shot_path != "":
		_take_shot(_shot_path, frames)

func _take_shot(path: String, frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)
	get_tree().quit()
