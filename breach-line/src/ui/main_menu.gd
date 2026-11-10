class_name MainMenu
extends Node3D
## Title screen: the map renders live behind the menu with a slow
## cinematic camera. Play (team + difficulty), Settings, Quit.

const SHOTS := [
	[Vector3(-17.5, 6.5, -39.0), Vector3(-33.0, 1.5, -20.0)],
	[Vector3(41.0, 3.0, -13.0), Vector3(26.0, 1.0, -33.0)],
	[Vector3(0.5, 2.2, 25.0), Vector3(0.5, 2.0, -15.0)],
	[Vector3(35.0, 2.0, 33.0), Vector3(35.0, 2.0, 0.0)],
]

var _cam: Camera3D
var _shot := 0
var _t := 0.0
var _ui: Control
var _main: VBoxContainer
var _play: VBoxContainer
var _settings: SettingsPanel
var _team := 0

func _ready() -> void:
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var map := GameMap.new()
	map.bake_navigation = false
	add_child(map)
	_cam = Camera3D.new()
	_cam.fov = 60.0
	_cam.far = 400.0
	add_child(_cam)
	_cam.current = true
	Audio.play_ambience(map.env_def.get("ambience", ""), -12.0)
	var layer := CanvasLayer.new()
	add_child(layer)
	_ui = Control.new()
	_ui.theme = UIStyle.theme()
	_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_ui)
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.35)
	shade.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	shade.custom_minimum_size.x = 620
	shade.size.x = 620
	_ui.add_child(shade)
	var box := VBoxContainer.new()
	box.position = Vector2(80, 140)
	box.add_theme_constant_override("separation", 14)
	_ui.add_child(box)
	box.add_child(UIStyle.label("BREACH LINE", 72, UIStyle.TEXT))
	box.add_child(UIStyle.label("TACTICAL  •  ROUND BASED  •  SAWTOOTH", 18, UIStyle.ACCENT))
	var gap := Control.new()
	gap.custom_minimum_size.y = 30
	box.add_child(gap)
	_main = VBoxContainer.new()
	_main.add_theme_constant_override("separation", 12)
	_main.add_child(UIStyle.button("PLAY", func(): _show(_play)))
	_main.add_child(UIStyle.button("SETTINGS", func(): _show(_settings)))
	_main.add_child(UIStyle.button("QUIT", func(): get_tree().quit()))
	box.add_child(_main)
	_play = VBoxContainer.new()
	_play.add_theme_constant_override("separation", 12)
	_play.add_child(UIStyle.label("CHOOSE YOUR SIDE", 24, UIStyle.ACCENT))
	var teams := HBoxContainer.new()
	teams.add_theme_constant_override("separation", 10)
	for t in [[1, "BREACHERS\n(attack)"], [2, "WARDENS\n(defend)"], [0, "AUTO"]]:
		var tb := UIStyle.button(t[1], func(): _team = t[0]; _start(), Vector2(150, 70))
		teams.add_child(tb)
	_play.add_child(teams)
	var diff := HBoxContainer.new()
	diff.add_child(UIStyle.label("Bots: ", 18))
	var opt := OptionButton.new()
	for n in ["Easy", "Normal", "Hard", "Expert"]:
		opt.add_item(n)
	opt.select(GameSettings.bot_difficulty)
	opt.item_selected.connect(func(i): GameSettings.bot_difficulty = i; GameSettings.save_settings())
	diff.add_child(opt)
	_play.add_child(diff)
	_play.add_child(UIStyle.label("5v5 • first to 7 rounds • sides swap at halftime", 16, UIStyle.DIM))
	_play.add_child(UIStyle.button("BACK", func(): _show(_main)))
	box.add_child(_play)
	_settings = SettingsPanel.new()
	_settings.done.connect(func(): _show(_main))
	box.add_child(_settings)
	_show(_main)
	var hint := UIStyle.label("WASD move • Mouse aim • Shift walk • Ctrl crouch • R reload • E use • B buy • Tab scores", 15, UIStyle.DIM)
	hint.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	hint.position = Vector2(80, -60)
	_ui.add_child(hint)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			_dev_shot(arg.substr(7))

func _dev_shot(path: String) -> void:
	for i in 20:
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)
	get_tree().quit()

func _show(which: Control) -> void:
	for c in [_main, _play, _settings]:
		c.visible = c == which

func _start() -> void:
	GameSettings.pending_team = _team
	Audio.stop_ambience()
	get_tree().change_scene_to_file("res://scenes/game.tscn")

func _process(delta: float) -> void:
	_t += delta / 14.0
	if _t >= 1.0:
		_t = 0.0
		_shot = (_shot + 1) % SHOTS.size()
	var a: Array = SHOTS[_shot]
	var drift := Vector3(sin(_t * PI) * 2.0, 0.3 * sin(_t * TAU), -_t * 4.0)
	_cam.look_at_from_position(a[0] + drift, a[1] + drift * 0.3, Vector3.UP)
