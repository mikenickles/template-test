extends Node
## Pooled sound playback with variation lookup and simple occlusion.
##
## Sounds are addressed by id relative to res://assets/audio without the
## extension, e.g. "weapons/ravager_shot". If "<id>.wav" is missing the
## manager collects "<id>_1.wav", "<id>_2.wav", ... and picks one at random
## (never the same twice in a row), which gives natural variation.

const ROOT := "res://assets/audio/"
const POOL_3D := 48
const POOL_2D := 16

var _cache: Dictionary = {} # id -> Array[AudioStream]
var _last_pick: Dictionary = {} # id -> int
var _pool3d: Array[AudioStreamPlayer3D] = []
var _pool2d: Array[AudioStreamPlayer] = []
var _next3d := 0
var _next2d := 0
var _ambience: AudioStreamPlayer
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.randomize()
	for i in POOL_3D:
		var p := AudioStreamPlayer3D.new()
		p.bus = &"SFX"
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.attenuation_filter_db = -18.0
		p.attenuation_filter_cutoff_hz = 6000.0
		p.panning_strength = 1.0
		# Interior reverb zones live on the trigger layer (never the world
		# layer, which bullets and sight traces use).
		p.area_mask = GameConst.LAYER_TRIGGER
		add_child(p)
		_pool3d.append(p)
	for i in POOL_2D:
		var p2 := AudioStreamPlayer.new()
		p2.bus = &"UI"
		add_child(p2)
		_pool2d.append(p2)
	_ambience = AudioStreamPlayer.new()
	_ambience.bus = &"Ambience"
	add_child(_ambience)

## Returns a stream for the id (random variation) or null if none exists.
func get_stream(id: String) -> AudioStream:
	var list: Array = _cache.get(id, [])
	if list.is_empty() and not _cache.has(id):
		list = _load_variations(id)
		_cache[id] = list
	if list.is_empty():
		return null
	if list.size() == 1:
		return list[0]
	var last: int = _last_pick.get(id, -1)
	var pick := _rng.randi_range(0, list.size() - 1)
	if pick == last:
		pick = (pick + 1) % list.size()
	_last_pick[id] = pick
	return list[pick]

func has_sound(id: String) -> bool:
	return get_stream(id) != null

func _load_variations(id: String) -> Array:
	var out: Array = []
	var single := ROOT + id + ".wav"
	if ResourceLoader.exists(single):
		out.append(load(single))
		return out
	var i := 1
	while true:
		var path := ROOT + id + "_%d.wav" % i
		if not ResourceLoader.exists(path):
			break
		out.append(load(path))
		i += 1
	return out

## Plays a positional sound. `range_m` is roughly the distance at which the
## sound becomes inaudible; `occlude` lowers volume and muffles the sound if
## world geometry blocks the path to the listener.
func play_3d(id: String, pos: Vector3, volume_db: float = 0.0, pitch_jitter: float = 0.04, range_m: float = 40.0, occlude: bool = true) -> AudioStreamPlayer3D:
	var stream := get_stream(id)
	if stream == null:
		return null
	var p := _pool3d[_next3d]
	_next3d = (_next3d + 1) % POOL_3D
	p.stop()
	p.stream = stream
	p.global_position = pos
	p.max_distance = range_m
	p.unit_size = maxf(range_m * 0.12, 2.0)
	p.pitch_scale = 1.0 + _rng.randf_range(-pitch_jitter, pitch_jitter)
	p.volume_db = volume_db
	p.attenuation_filter_cutoff_hz = 7000.0
	if occlude and _is_occluded(pos):
		p.volume_db -= 7.0
		p.attenuation_filter_cutoff_hz = 1400.0
	p.play()
	return p

## Plays a non-positional sound (UI, first-person weapon sounds).
func play_2d(id: String, volume_db: float = 0.0, pitch_jitter: float = 0.0, bus: StringName = &"UI") -> AudioStreamPlayer:
	var stream := get_stream(id)
	if stream == null:
		return null
	var p := _pool2d[_next2d]
	_next2d = (_next2d + 1) % POOL_2D
	p.stop()
	p.stream = stream
	p.bus = bus
	p.volume_db = volume_db
	p.pitch_scale = 1.0 + _rng.randf_range(-pitch_jitter, pitch_jitter)
	p.play()
	return p

func play_ambience(id: String, volume_db: float = -6.0) -> void:
	var stream := get_stream(id)
	if stream == null:
		return
	if stream is AudioStreamWAV:
		var wav := stream as AudioStreamWAV
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = int(wav.get_length() * wav.mix_rate)
	_ambience.stream = stream
	_ambience.volume_db = volume_db
	_ambience.play()

func stop_ambience() -> void:
	_ambience.stop()

func stop_all() -> void:
	for p in _pool3d:
		p.stop()
	for p in _pool2d:
		p.stop()
	stop_ambience()

func _is_occluded(pos: Vector3) -> bool:
	var vp := get_viewport()
	if vp == null:
		return false
	var cam := vp.get_camera_3d()
	if cam == null or not cam.is_inside_tree():
		return false
	var space := cam.get_world_3d().direct_space_state
	if space == null:
		return false
	var q := PhysicsRayQueryParameters3D.create(cam.global_position, pos, GameConst.LAYER_WORLD)
	return not space.intersect_ray(q).is_empty()
