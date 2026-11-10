class_name GameRoot
extends Node3D
## Top-level gameplay scene: builds the map and spawns the local player.
## Phase 6 adds the MatchManager (rounds, bots, economy) on top of this.

@export var player_team := GameConst.Team.ATTACKERS

var map: GameMap
var player: Combatant
var player_brain: PlayerBrain
var debug_overlay: Control
var hud: PlayerHUD
var viewmodel: ViewModel

func _ready() -> void:
	map = GameMap.new()
	map.name = "Map"
	add_child(map)
	player = Combatant.new()
	player.name = "Player"
	player.team = player_team
	player.display_name = GameSettings.player_name
	player.map_info = map.info
	add_child(player)
	player_brain = PlayerBrain.new()
	player_brain.name = "PlayerBrain"
	player.add_child(player_brain)
	player_brain.attach(player)
	player.model.set_first_person(true)
	player.weapons.local_player = true
	viewmodel = ViewModel.new()
	player_brain.camera.add_child(viewmodel)
	viewmodel.setup(player, player_brain.camera)
	player.spawn_at(map.info.spawns[player_team][0])
	give_default_loadout(player)
	var hud_layer := CanvasLayer.new()
	hud_layer.name = "HUDLayer"
	add_child(hud_layer)
	hud = PlayerHUD.new()
	hud_layer.add_child(hud)
	hud.setup(player, player_brain.camera)
	debug_overlay = DebugOverlay.new()
	debug_overlay.target = player
	hud_layer.add_child(debug_overlay)
	Audio.play_ambience(map.env_def.get("ambience", ""), -10.0)
	capture_mouse(true)
	_dev_args()

## Developer flags (after `--`): --spawn=x,y,z,yaw_deg  --shot=/abs/file.png
## --shot-frames=N  (saves a screenshot after N frames, then quits).
func _dev_args() -> void:
	var shot := ""
	var frames := 60
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--spawn="):
			var v := arg.substr(8).split(",")
			if v.size() >= 3:
				var yaw := deg_to_rad(float(v[3])) if v.size() > 3 else 0.0
				player.spawn_at(Transform3D(Basis(Vector3.UP, yaw), Vector3(float(v[0]), float(v[1]), float(v[2]))))
		elif arg.begins_with("--shot="):
			shot = arg.substr(7)
		elif arg.begins_with("--shot-frames="):
			frames = int(arg.substr(14))
		elif arg == "--dummies":
			spawn_dummies([Vector3(0.5, 0.05, 12.0), Vector3(-2.0, 0.05, 6.0), Vector3(2.5, 0.05, -2.0)])
		elif arg.begins_with("--weapon="):
			player.weapons.give(StringName(arg.substr(9)), true)
		elif arg == "--no-viewmodel":
			viewmodel.queue_free()
		elif arg == "--no-occlusion":
			get_viewport().use_occlusion_culling = false
		elif arg == "--fire":
			player_brain.debug_fire_frames = 40
	if shot != "":
		_take_shot(shot, frames)

func _take_shot(path: String, frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
	var cam := get_viewport().get_camera_3d()
	print("camera: ", cam.get_path(), " near=", cam.near, " far=", cam.far, " fov=", cam.fov, " xf=", cam.global_transform)
	print("map meshes visible: ", map.find_children("*", "MeshInstance3D", true, false).size())
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)
	get_tree().quit()

func give_default_loadout(c: Combatant) -> void:
	c.weapons.clear()
	c.weapons.give(&"knife")
	c.weapons.give(&"p9")
	c.weapons.give(&"ravager" if c.team == GameConst.Team.ATTACKERS else &"sentinel", true)

## Dev helper: static targets to shoot at (Phase 5 replaces with bots).
func spawn_dummies(positions: Array) -> void:
	for p: Vector3 in positions:
		var d := Combatant.new()
		d.team = GameConst.other_team(player_team)
		d.map_info = map.info
		add_child(d)
		d.spawn_at(Transform3D(Basis(Vector3.UP, PI), p))
		give_default_loadout(d)

func capture_mouse(on: bool) -> void:
	if DisplayServer.get_name() == "headless":
		return
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		capture_mouse(Input.mouse_mode != Input.MOUSE_MODE_CAPTURED)
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		capture_mouse(true)
