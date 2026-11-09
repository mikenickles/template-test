extends Node
## Persistent user settings and input action registration.
##
## Input actions are registered in code (rather than only in project.godot) so
## the defaults live next to the rebinding/persistence logic and a future
## mobile build can swap in touch-first defaults.

const SAVE_PATH := "user://settings.cfg"

enum Quality { LOW, MEDIUM, HIGH, ULTRA }

# Input
var mouse_sensitivity := 0.0022 # radians per pixel
var invert_y := false
# Video
var fov := 90.0
var quality := Quality.HIGH
var fullscreen := false
var show_fps := false
# Audio (linear 0-1)
var master_volume := 0.85
var sfx_volume := 1.0
var ambience_volume := 0.6
var ui_volume := 0.8
# Game
var bot_difficulty := 1 # 0 easy, 1 normal, 2 hard, 3 expert
var player_name := "You"
var crosshair_color := Color(0.4, 1.0, 0.45)
var crosshair_size := 1.0

## Default bindings: action -> list of key/mouse descriptors.
const DEFAULT_BINDINGS := {
	"move_forward": [KEY_W, KEY_UP],
	"move_back": [KEY_S, KEY_DOWN],
	"move_left": [KEY_A, KEY_LEFT],
	"move_right": [KEY_D, KEY_RIGHT],
	"jump": [KEY_SPACE],
	"crouch": [KEY_CTRL, KEY_C],
	"walk": [KEY_SHIFT],
	"fire": ["mouse:1"],
	"alt_fire": ["mouse:2"],
	"reload": [KEY_R],
	"use": [KEY_E],
	"drop": [KEY_G],
	"slot_1": [KEY_1],
	"slot_2": [KEY_2],
	"slot_3": [KEY_3],
	"slot_4": [KEY_4],
	"slot_5": [KEY_5],
	"last_weapon": [KEY_Q],
	"next_weapon": ["mouse:5"],
	"prev_weapon": ["mouse:4"],
	"buy_menu": [KEY_B],
	"scoreboard": [KEY_TAB],
	"pause": [KEY_ESCAPE],
}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	register_input_actions()
	_ensure_audio_buses()
	load_settings()
	apply()

func register_input_actions() -> void:
	for action: String in DEFAULT_BINDINGS:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		InputMap.action_erase_events(action)
		for b in DEFAULT_BINDINGS[action]:
			InputMap.action_add_event(action, _make_event(b))

static func _make_event(desc) -> InputEvent:
	if desc is String and desc.begins_with("mouse:"):
		var mb := InputEventMouseButton.new()
		mb.button_index = int(desc.split(":")[1]) as MouseButton
		return mb
	var k := InputEventKey.new()
	k.physical_keycode = desc
	return k

func _ensure_audio_buses() -> void:
	for bus_name in ["SFX", "Ambience", "UI"]:
		if AudioServer.get_bus_index(bus_name) == -1:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, &"Master")
	# Gentle bus compression keeps gunfire from clipping in big fights.
	var sfx := AudioServer.get_bus_index("SFX")
	if AudioServer.get_bus_effect_count(sfx) == 0:
		var comp := AudioEffectCompressor.new()
		comp.threshold = -10.0
		comp.ratio = 4.0
		comp.attack_us = 200.0
		comp.release_ms = 120.0
		AudioServer.add_bus_effect(sfx, comp)
		var lim := AudioEffectHardLimiter.new()
		lim.ceiling_db = -0.5
		AudioServer.add_bus_effect(AudioServer.get_bus_index("Master"), lim)

func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	mouse_sensitivity = cfg.get_value("input", "mouse_sensitivity", mouse_sensitivity)
	invert_y = cfg.get_value("input", "invert_y", invert_y)
	fov = cfg.get_value("video", "fov", fov)
	quality = cfg.get_value("video", "quality", quality)
	fullscreen = cfg.get_value("video", "fullscreen", fullscreen)
	show_fps = cfg.get_value("video", "show_fps", show_fps)
	master_volume = cfg.get_value("audio", "master", master_volume)
	sfx_volume = cfg.get_value("audio", "sfx", sfx_volume)
	ambience_volume = cfg.get_value("audio", "ambience", ambience_volume)
	ui_volume = cfg.get_value("audio", "ui", ui_volume)
	bot_difficulty = cfg.get_value("game", "bot_difficulty", bot_difficulty)
	player_name = cfg.get_value("game", "player_name", player_name)
	crosshair_color = cfg.get_value("game", "crosshair_color", crosshair_color)
	crosshair_size = cfg.get_value("game", "crosshair_size", crosshair_size)

func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("input", "mouse_sensitivity", mouse_sensitivity)
	cfg.set_value("input", "invert_y", invert_y)
	cfg.set_value("video", "fov", fov)
	cfg.set_value("video", "quality", quality)
	cfg.set_value("video", "fullscreen", fullscreen)
	cfg.set_value("video", "show_fps", show_fps)
	cfg.set_value("audio", "master", master_volume)
	cfg.set_value("audio", "sfx", sfx_volume)
	cfg.set_value("audio", "ambience", ambience_volume)
	cfg.set_value("audio", "ui", ui_volume)
	cfg.set_value("game", "bot_difficulty", bot_difficulty)
	cfg.set_value("game", "player_name", player_name)
	cfg.set_value("game", "crosshair_color", crosshair_color)
	cfg.set_value("game", "crosshair_size", crosshair_size)
	cfg.save(SAVE_PATH)

func apply() -> void:
	_set_bus_volume("Master", master_volume)
	_set_bus_volume("SFX", sfx_volume)
	_set_bus_volume("Ambience", ambience_volume)
	_set_bus_volume("UI", ui_volume)
	if DisplayServer.get_name() != "headless":
		var mode := DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED
		if DisplayServer.window_get_mode() != mode:
			DisplayServer.window_set_mode(mode)
	Events.settings_changed.emit()

func _set_bus_volume(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx >= 0:
		AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(linear, 0.0001)))
		AudioServer.set_bus_mute(idx, linear <= 0.001)

## Rendering knobs per quality preset, consumed by the map's environment setup.
func quality_profile() -> Dictionary:
	match quality:
		Quality.LOW:
			return {"shadow_size": 1024, "ssao": false, "ssil": false, "sdfgi": false, "glow": false, "msaa": 0, "fog": false, "shadow_distance": 40.0, "render_scale": 0.8}
		Quality.MEDIUM:
			return {"shadow_size": 2048, "ssao": true, "ssil": false, "sdfgi": false, "glow": true, "msaa": 0, "fog": true, "shadow_distance": 60.0, "render_scale": 1.0}
		Quality.ULTRA:
			return {"shadow_size": 4096, "ssao": true, "ssil": true, "sdfgi": true, "glow": true, "msaa": 2, "fog": true, "shadow_distance": 120.0, "render_scale": 1.0}
	return {"shadow_size": 4096, "ssao": true, "ssil": false, "sdfgi": true, "glow": true, "msaa": 1, "fog": true, "shadow_distance": 90.0, "render_scale": 1.0}

func difficulty_name(d: int = -1) -> String:
	if d < 0:
		d = bot_difficulty
	return ["Easy", "Normal", "Hard", "Expert"][clampi(d, 0, 3)]
