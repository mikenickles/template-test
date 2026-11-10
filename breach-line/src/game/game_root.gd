class_name GameRoot
extends Node3D
## Top-level gameplay scene: builds the map and spawns the local player.
## Phase 6 adds the MatchManager (rounds, bots, economy) on top of this.

@export var player_team := GameConst.Team.ATTACKERS

var map: GameMap
var player: Combatant
var player_brain: PlayerBrain
var debug_overlay: Control

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
	player.spawn_at(map.info.spawns[player_team][0])
	var hud_layer := CanvasLayer.new()
	hud_layer.name = "HUDLayer"
	add_child(hud_layer)
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
	if shot != "":
		_take_shot(shot, frames)

func _take_shot(path: String, frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)
	get_tree().quit()

func capture_mouse(on: bool) -> void:
	if DisplayServer.get_name() == "headless":
		return
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		capture_mouse(Input.mouse_mode != Input.MOUSE_MODE_CAPTURED)
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		capture_mouse(true)
