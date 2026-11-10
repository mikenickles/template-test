extends Node3D
## Dev tool: builds the map and saves screenshots from named viewpoints.
## Usage: godot --path . res://scenes/dev/map_preview.tscn -- --shots=all --out=/abs/dir
##        [--frames=N] [--quality=0..3]

const VIEWS := {
	"overview": [Vector3(0, 95, 48), Vector3(0, 0, -2)],
	"t_spawn": [Vector3(0, 1.7, 39), Vector3(0, 1.5, 20)],
	"mid_south": [Vector3(0.5, 1.7, 24), Vector3(0.5, 1.5, -10)],
	"mid_gate": [Vector3(-1.5, 1.7, -27), Vector3(0.5, 1.5, 0)],
	"long": [Vector3(35, 1.7, 30), Vector3(35, 1.5, -5)],
	"long_doors": [Vector3(34, 1.7, 7), Vector3(35, 1.2, -14)],
	"a_from_ramp": [Vector3(36, 1.7, -14), Vector3(30, 1.8, -32)],
	"a_from_ct": [Vector3(15, 1.7, -37), Vector3(32, 1.5, -24)],
	"a_platform": [Vector3(24, 2.9, -33.5), Vector3(36, 1.5, -18)],
	"short": [Vector3(6, 1.7, 7), Vector3(20, 1.5, 6)],
	"short_stairs": [Vector3(18.5, 1.7, 2.5), Vector3(18.5, 2.4, -12)],
	"ct_spawn": [Vector3(0, 1.7, -39.5), Vector3(0, 1.5, -25)],
	"b_main": [Vector3(-35.5, 1.7, -8), Vector3(-30, 1.5, -30)],
	"b_hall": [Vector3(-17.5, 4.9, -38), Vector3(-36, 1.0, -16)],
	"b_short": [Vector3(-18.5, 1.7, -9), Vector3(-30, 1.5, -28)],
	"tunnels": [Vector3(-36, 1.7, 34), Vector3(-36, 1.5, 10)],
	"coal_yard": [Vector3(-36, 1.7, 9), Vector3(-35, 1.5, -10)],
	"workshop": [Vector3(-5.8, 1.7, 2.5), Vector3(-20, 1.2, 3)],
	"scrap": [Vector3(-17.5, 1.7, 32.5), Vector3(-31, 1.5, 32.5)],
}

var _shots: Array = []
var _out := "."
var _frames := 45
var _cam: Camera3D

func _ready() -> void:
	var quality := -1
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shots="):
			var s := arg.substr(8)
			_shots = VIEWS.keys() if s == "all" else Array(s.split(","))
		elif arg.begins_with("--out="):
			_out = arg.substr(6)
		elif arg.begins_with("--frames="):
			_frames = int(arg.substr(9))
		elif arg.begins_with("--quality="):
			quality = int(arg.substr(10))
	if quality >= 0:
		GameSettings.quality = quality
	if _shots.is_empty():
		_shots = ["overview"]
	get_window().size = Vector2i(1280, 720)
	var map := GameMap.new()
	add_child(map)
	print("Map stats: ", map.build_stats)
	_cam = Camera3D.new()
	_cam.fov = 80
	_cam.far = 400
	add_child(_cam)
	_cam.current = true
	_run()

func _run() -> void:
	for name in _shots:
		if not VIEWS.has(name):
			push_warning("unknown view " + name)
			continue
		var v: Array = VIEWS[name]
		_cam.look_at_from_position(v[0], v[1], Vector3.UP)
		_cam.fov = 50 if name == "overview" else 80
		for i in _frames:
			await get_tree().process_frame
		var img := get_viewport().get_texture().get_image()
		var path: String = _out.path_join("%s.png" % name)
		img.save_png(path)
		print("saved ", path)
	get_tree().quit()
